// Builds "Mind the Jar" (the jar diorama of jar.html) for a Project 0 lot and writes it into build/jar/:
// three levels of detail, lot.json, the material shaders and the lot script.
//
// Project 0 draws the lot with its own renderer, so the viewer's passes (the refraction target, the
// ray-marched water) become material shaders: the jar's outer wall turns into water below the waterline
// and works out the light shafts along the view ray itself; the specimens catch caustics and the bubbles
// rise in a vertex shader; the script floats the head and turns both eyes together.
// Open diorama/jarp0.html on the local dev server; ?save=0 only reports, ?view=0|1|2 previews a level.
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  R_IN, NECK, LID_TOP, WATER, HEAD, rng, canvas, makeCaustics, eyeTexture,
  jarProfile, lidGeometry, lidLabels, brainGroup, eyeGroup,
} from './jar.js'

const q = new URLSearchParams(location.search)
const out = document.getElementById('out')
const say = (...a) => { out.textContent += a.join(' ') + '\n' }

const S = 0.994        // the jar's outer wall sits at 5.96 m, just inside the lot's ±6 m
const RW = 5.7         // the water cylinder the shaders trace
const LEVEL = WATER.level, YB = WATER.yb
const WHITE_UV = [0.5, 0.75] // the white half of the specimen atlas
const IRIS = '#3f7fd6'

// ---------- shaders ----------
const COMMON = /* glsl */`
const float LEVEL = ${LEVEL.toFixed(3)};
const float RW = ${RW.toFixed(3)};
const float YB = ${YB.toFixed(3)};
const vec3 SUN = vec3(-0.27, 0.9, 0.34); // towards the light, roughly unit length
const vec3 SIGMA = vec3(0.05, 0.03, 0.085); // absorption per metre: the green survives
float wave(vec2 p, float t) {
  float r = length(p);
  return 0.065 * sin(0.55 * p.x + 0.9 * t) + 0.05 * sin(0.72 * p.y - 0.7 * t + 1.3)
    + 0.03 * sin(1.3 * (p.x * 0.8 + p.y * 0.6) + 1.6 * t) + 0.022 * sin(1.9 * (-p.x * 0.5 + p.y * 0.86) - 2.1 * t + 0.4)
    + 0.018 * sin(3.1 * r - 2.4 * t) * exp(-r * 0.25);
}
`
const FRAG_COMMON = COMMON + /* glsl */`
// entry and exit distances of the ray o + t d through the water cylinder (no hit: x > y)
vec2 cylHit(vec3 o, vec3 d) {
  float t0 = -1e9, t1 = 1e9;
  float a = dot(d.xz, d.xz), b = dot(o.xz, d.xz), c = dot(o.xz, o.xz) - RW * RW;
  if (a > 1e-7) {
    float h = b * b - a * c;
    if (h < 0.0) return vec2(1.0, -1.0);
    h = sqrt(h); t0 = (-b - h) / a; t1 = (-b + h) / a;
  } else if (c > 0.0) return vec2(1.0, -1.0);
  if (abs(d.y) > 1e-7) {
    float ta = (YB - o.y) / d.y, tb = (LEVEL - o.y) / d.y;
    t0 = max(t0, min(ta, tb)); t1 = min(t1, max(ta, tb));
  } else if (o.y < YB || o.y > LEVEL) return vec2(1.0, -1.0);
  return vec2(t0, t1);
}
// two drifting layers of one tileable caustic, crossed: the light the rippling surface focuses
float caus(vec2 xz, float bias) {
  float t = p0Time;
  float a = texture(causticMap, xz * 0.17 + vec2(t * 0.021, t * 0.013), bias).r;
  float b = texture(causticMap, xz * 0.23 + vec2(-t * 0.017, t * 0.019) + 0.37, bias).r;
  return min(a, b) * 1.7;
}
`

const GLASS_V = COMMON + /* glsl */`
// the water's surface (uv.y > 2) swells and ripples
vec3 p0Vertex(vec3 position, vec3 normal, vec2 uv) {
  if (uv.y > 2.0) position.y += wave(position.xz, p0Time);
  return position;
}
`
const GLASS_S = FRAG_COMMON + /* glsl */`
// glass.glsl: thick glass, and below the waterline clear emerald water with light shafts in it
void p0Surface(inout P0Surface s) {
  vec3 P = s.position;
  vec3 V = -s.view;
  float ndv = clamp(abs(dot(s.normal, s.view)), 0.0, 1.0);
  float fr = pow(1.0 - ndv, 2.6);
  float r = length(P.xz);
  bool top = s.uv.y > 2.0;
  float line = LEVEL + wave(P.xz, p0Time);
  s.roughness = 0.04;
  s.metalness = 0.0;
  if (!top && !(r > RW && P.y < line && P.y > YB - 0.4)) {
    // plain glass: nearly clear face on, darker and greener where it is seen edge on
    s.color = vec3(0.09, 0.15, 0.14);
    s.alpha = clamp(0.07 + 0.62 * fr, 0.0, 0.92);
    return;
  }
  if (top) {
    // fine ripples on the surface
    float e = 0.05, t = p0Time;
    float gx = (wave(P.xz + vec2(e, 0.0), t) - wave(P.xz - vec2(e, 0.0), t)) / (2.0 * e);
    float gz = (wave(P.xz + vec2(0.0, e), t) - wave(P.xz - vec2(0.0, e), t)) / (2.0 * e);
    s.normal = normalize(vec3(-gx + 0.06 * sin(2.7 * P.x + 3.1 * t), 1.0, -gz + 0.06 * sin(2.9 * P.z - 2.7 * t)));
  }
  // march the view ray through the water; at each step look up to the surface for the light it lets in
  vec2 h = cylHit(P - V * 0.05, V);
  float t0 = max(h.x, 0.0), t1 = max(h.y, t0);
  float len = t1 - t0;
  vec3 scat = vec3(0.0);
  float dt = len / 8.0;
  for (int i = 0; i < 8; i++) {
    float t = t0 + (float(i) + 0.5) * dt;
    vec3 Q = P + V * t;
    float dS = max(LEVEL - Q.y, 0.0) / SUN.y;
    vec2 qq = Q.xz + SUN.xz * dS;
    float c = texture(causticMap, qq * 0.17 + vec2(p0Time * 0.021, p0Time * 0.013), 2.5 + dS * 0.1).r * 1.2;
    float shaft = step(length(qq), RW) * (0.15 + 3.2 * c * c);
    scat += (vec3(1.0, 0.95, 0.85) * shaft * exp(-SIGMA * dS) + vec3(0.01, 0.06, 0.04)) * exp(-SIGMA * (t - t0)) * dt;
  }
  s.color = vec3(0.02, 0.3, 0.16);
  s.emissive = scat * vec3(0.045, 0.2, 0.13);
  s.alpha = clamp(0.16 + (1.0 - exp(-len * 0.09)) * 0.3 + fr * 0.3, 0.0, 0.93);
  if (top) {
    s.alpha = 0.6;
    s.emissive += vec3(0.1, 0.4, 0.26) * caus(P.xz, 0.0) * 0.3;
  } else {
    // the meniscus: a bright line where the water meets the glass
    float men = max(line - P.y, 0.0);
    s.emissive += vec3(0.3, 0.85, 0.6) * (exp(-pow(men / 0.06, 2.0)) * 0.8 + exp(-men / 0.35) * 0.1);
  }
}
`
const SPEC_V = COMMON + /* glsl */`
// specimens.glsl: bubbles (uv.y 3..5) rise and wobble; the optic nerves (uv.y > 5) wriggle at their loose ends
vec3 p0Vertex(vec3 position, vec3 normal, vec2 uv) {
  float t = p0Time;
  if (uv.y > 5.0) {
    float s = clamp((uv.y - 5.5) / 0.45, 0.0, 1.0), ph = uv.x * 9.0;
    position.x += sin(t * 1.3 + s * 3.2 + ph) * 0.28 * s * s;
    position.y += cos(t * 1.05 + s * 2.6 + ph) * 0.2 * s * s;
  } else if (uv.y > 3.0) {
    float r = uv.x - 2.0, ph = (uv.y - 3.5) / 0.45 * 6.2832;
    vec3 c = position - normal * r;
    float speed = 0.45 + r * 6.0, H = LEVEL - YB - 0.5;
    c.y = YB + 0.2 + mod(c.y - YB + t * speed, H);
    c.x += sin(t * 2.3 + ph) * 0.1;
    c.z += cos(t * 1.9 + ph * 1.3) * 0.1;
    float sq = 1.0 + 0.12 * sin(t * 9.0 + ph);
    position = c + normal * r * vec3(sq, 0.88 / sq, sq);
  }
  return position;
}
`
const SPEC_S = FRAG_COMMON + /* glsl */`
// the brain, the eyes and the bubbles: caustic light dancing over them under the water
void p0Surface(inout P0Surface s) {
  bool bubble = s.uv.y > 3.0 && s.uv.y < 5.0;
  if (bubble) {
    // underwater a bubble is a little mirror
    float rim = pow(1.0 - clamp(abs(dot(s.normal, s.view)), 0.0, 1.0), 2.0);
    s.color = vec3(0.9, 1.0, 0.95);
    s.metalness = 0.2;
    s.roughness = 0.08;
    s.emissive += vec3(0.2, 0.55, 0.4) * (0.3 + rim);
    return;
  }
  s.roughness = 0.32;
  vec3 P = s.position;
  if (P.y < LEVEL) {
    float dS = max(LEVEL - P.y, 0.0) / SUN.y;
    float c = caus(P.xz + SUN.xz * dS, 0.0);
    float lit = max(dot(s.normal, normalize(SUN)), 0.0);
    s.emissive += s.color * vec3(0.35, 0.9, 0.6) * c * c * lit * 0.8;
  }
}
`
const LID_S = /* glsl */`
// lid.glsl: the knurled ribs round the screw band (metal only: the labels sit at uv.y > 0.35)
void p0Surface(inout P0Surface s) {
  vec3 P = s.position;
  float r = length(P.xz);
  if (s.uv.y < 0.35 && r > 5.1 && P.y > 16.4 && P.y < 18.4) {
    float a = atan(P.z, P.x);
    vec3 tg = vec3(-sin(a), 0.0, cos(a));
    s.normal = normalize(s.normal + tg * 0.45 * sin(a * 180.0));
  }
}
`

function scriptSource() {
  const r4 = a => a.map(v => Math.round(v * 1e4) / 1e4)
  return `// Mind the Jar: the brain floats and turns slowly in the water, its two eyes look around together.
// The bubbles, the nerves, the waves and the light shafts run in the shaders on the same clock.
const BASE = ${JSON.stringify(r4(HEAD.base))}
const EYES = ${JSON.stringify(HEAD.eyes.map(r4))}
const OUT = ${JSON.stringify(HEAD.out)}

export default function build(b) {
  b.loop((dt, t) => {
    b.node('head', {
      position: [BASE[0] + Math.sin(t * 0.21) * 0.25, BASE[1] + Math.sin(t * 0.37) * 0.35, BASE[2] + Math.cos(t * 0.17) * 0.22],
      rotation: [Math.sin(t * 0.23) * 0.08 - 0.04, 0.55 + Math.sin(t * 0.11) * 0.4, Math.sin(t * 0.29 + 1) * 0.06],
    })
    const gy = Math.sin(t * 0.31) * 0.28 + Math.sin(t * 0.83) * 0.06, gx = Math.sin(t * 0.23 + 0.7) * 0.14
    b.node('eyeL', { position: EYES[0], rotation: [gx, gy + OUT[0], 0] })
    b.node('eyeR', { position: EYES[1], rotation: [gx, gy + OUT[1], 0] })
  })
}
`
}

// ---------- geometry helpers ----------
function strip(g, { color, uv } = {}) {
  g = g.index ? g.toNonIndexed() : g.clone()
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k)
  if (!g.attributes.normal) g.computeVertexNormals()
  const n = g.attributes.position.count
  if (color) {
    const c = new THREE.Color(color), a = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3)
    g.setAttribute('color', new THREE.BufferAttribute(a, 3))
  }
  if (uv) {
    const a = new Float32Array(n * 2)
    for (let i = 0; i < n; i++) a.set(uv, i * 2)
    g.setAttribute('uv', new THREE.BufferAttribute(a, 2))
  }
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2))
  return g
}
const squeeze = g => { g.scale(S, 1, S); return g }
const merge = (list, tol = 1e-5) => mergeVertices(mergeGeometries(list), tol)

/** The jar for the lot: the outer wall all the way, the inner wall only above the water, and the surface. */
function jarShell(step, segments, rings) {
  const prof = jarProfile(step)
  let top = 0
  prof.forEach((p, i) => { if (p.y > prof[top].y) top = i })
  const pts = prof.slice(0, top + 1)
  for (let i = top + 1; i < prof.length; i++) {
    if (prof[i].y <= LEVEL) { pts.push(new THREE.Vector2(R_IN - 0.03, LEVEL)); break }
    pts.push(prof[i])
  }
  const shell = new THREE.LatheGeometry(pts, segments)
  const surf = new THREE.RingGeometry(0.0001, R_IN - 0.03, segments, rings)
  surf.rotateX(-Math.PI / 2); surf.translate(0, LEVEL, 0)
  return squeeze(merge([strip(shell), strip(surf, { uv: [0.5, 2.5] })]))
}

/** The brain as one geometry in the head's frame, painted by vertex colour. */
function brainGeometry(detail, cbDetail) {
  const grp = brainGroup(detail, cbDetail)
  grp.updateMatrixWorld(true)
  const g = merge(grp.children.map(m => strip(m.geometry.clone().applyMatrix4(m.matrixWorld), { uv: WHITE_UV })))
  // a deeper pink than the viewer's: in daylight the green water over it washes the colour out
  const c = g.attributes.color, k = new THREE.Color(), pink = new THREE.Color('#ff5f86')
  for (let i = 0; i < c.count; i++) { k.fromBufferAttribute(c, i).lerp(pink, 0.35); c.setXYZ(i, k.r, k.g, k.b) }
  return g
}

/** An eye and its nerve in the eye's frame; the iris from the lower half of the atlas, the nerve flagged. */
function eyeGeometry(seed, ws, hs, nerve = true) {
  const grp = eyeGroup(IRIS, seed, ws, hs)
  const [eye, nv] = grp.children
  const e = strip(eye.geometry, { color: '#ffffff' })
  const uv = e.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 0.5)
  const parts = [e]
  if (nerve) {
    let n = new THREE.CylinderGeometry(0.21, 0.07, 1.7, 12, 16)
    n.translate(0, -0.85, 0); n.rotateX(Math.PI / 2); n.translate(0, 0, -0.95 * 0.82)
    n = strip(n, { color: '#e9c2b4' })
    const p = n.attributes.position, nu = n.attributes.uv
    for (let i = 0; i < p.count; i++) nu.setXY(i, seed / 10, 5.5 + 0.45 * Math.min(1, Math.max(0, (-p.getZ(i) - 0.95 * 0.82) / 1.7)))
    parts.push(n)
  }
  return mergeGeometries(parts)
}

function bubblesGeometry(count) {
  const r = rng(404), parts = []
  for (let i = 0; i < count; i++) {
    const size = 0.03 + r() ** 2.4 * 0.13, a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 5.0
    let g = new THREE.IcosahedronGeometry(1, 1)
    g.deleteAttribute('uv'); g = mergeVertices(g); g.computeVertexNormals()
    g.scale(size, size, size); g.translate(Math.cos(a) * rr, YB + 0.3 + r() * (LEVEL - YB - 1), Math.sin(a) * rr)
    parts.push(strip(g, { color: '#e8fff4', uv: [2 + size, 3.5 + r() * 0.45] }))
  }
  return mergeGeometries(parts)
}

// ---------- textures ----------
function specimenAtlas(size) {
  const { c, g } = canvas(size, size)
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, size, size / 2)
  g.drawImage(eyeTexture(IRIS, 3).image, 0, size / 2, size, size / 2)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** The lid's atlas: the top label (rows 0-500), the band label (520-638) and the steel (660-1024). */
function lidAtlas(labels) {
  const [topTex, bandTex] = labels.children.map(m => m.material.map)
  const { c, g } = canvas(1024, 1024)
  g.drawImage(topTex.image, 0, 0, 1024, 500)
  g.drawImage(bandTex.image, 0, 520, 1024, 118)
  g.fillStyle = '#b9bec2'; g.fillRect(0, 660, 1024, 364)
  const mr = canvas(1024, 1024)
  mr.g.fillStyle = 'rgb(0,235,0)'; mr.g.fillRect(0, 0, 1024, 660)   // paper: rough, not metal
  mr.g.fillStyle = 'rgb(0,97,150)'; mr.g.fillRect(0, 660, 1024, 364) // brushed steel
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace
  const mrt = new THREE.CanvasTexture(mr.c); mrt.colorSpace = THREE.NoColorSpace
  return { map, mr: mrt }
}
const regionUV = (g, y0, y1) => {
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (y0 + (1 - uv.getY(i)) * (y1 - y0)) / 1024)
  return g
}

function lidGeometryAll(segments, labels) {
  const parts = [strip(lidGeometry(segments, false), { uv: [0.5, 1 - 840 / 1024] })]
  if (labels) {
    const [top, band] = labels.children
    parts.push(regionUV(strip(top.geometry), 0, 500), regionUV(strip(band.geometry), 520, 638))
  }
  // a few centimetres down, so the label on top stays under the 19 m ceiling
  return squeeze(merge(parts)).translate(0, -0.03, 0)
}

// ---------- the levels ----------
function lod0(caustic) {
  const scene = new THREE.Scene()
  const labels = lidLabels()
  const atlas = lidAtlas(labels)
  const spec = new THREE.MeshStandardMaterial({ name: 'Specimen', vertexColors: true, map: specimenAtlas(1024), roughness: 0.32 })
  const glass = new THREE.MeshStandardMaterial({ name: 'Glass', color: '#173029', roughness: 0.04, transparent: true, opacity: 0.4 })
  const lid = new THREE.MeshStandardMaterial({ name: 'Lid', map: atlas.map, metalnessMap: atlas.mr, roughnessMap: atlas.mr, metalness: 1, roughness: 1, alphaTest: 0.5 })

  const jar = new THREE.Mesh(jarShell(0.5, 96, 24), glass); jar.name = 'jar'
  const lidMesh = new THREE.Mesh(lidGeometryAll(160, labels), lid); lidMesh.name = 'lid'
  const bubbles = new THREE.Mesh(bubblesGeometry(70), spec); bubbles.name = 'bubbles'
  const head = new THREE.Object3D(); head.name = 'head'
  head.position.set(...HEAD.base); head.rotation.set(-0.04, 0.55, Math.sin(1) * 0.06)
  const brain = new THREE.Mesh(brainGeometry(30, 14), spec); brain.name = 'brain'
  head.add(brain)
  HEAD.eyes.forEach((p, i) => {
    const node = new THREE.Object3D(); node.name = i ? 'eyeR' : 'eyeL'
    node.position.set(...p); node.rotation.set(Math.sin(0.7) * 0.14, HEAD.out[i], 0)
    const m = new THREE.Mesh(eyeGeometry(i ? 5 : 3, 48, 32), spec); m.name = node.name + '_ball'
    node.add(m); head.add(node)
  })
  scene.add(bubbles, head, lidMesh, jar)
  return { scene, mats: { spec, glass, lid } }
}

function lod1() {
  const scene = new THREE.Scene()
  const spec = new THREE.MeshStandardMaterial({ name: 'Specimen', vertexColors: true, map: specimenAtlas(512), roughness: 0.32 })
  const glass = new THREE.MeshStandardMaterial({ name: 'Glass', color: '#173029', roughness: 0.04, transparent: true, opacity: 0.4 })
  const jar = new THREE.Mesh(jarShell(2.0, 32, 3), glass); jar.name = 'jar'
  // everything opaque in one static mesh: the head at rest, the lid in steel with its two labels as plain paper
  const head = new THREE.Object3D()
  head.position.set(...HEAD.base); head.rotation.set(-0.04, 0.55, Math.sin(1) * 0.06)
  head.updateMatrixWorld(true)
  const parts = [brainGeometry(11, 5).applyMatrix4(head.matrixWorld)]
  HEAD.eyes.forEach((p, i) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(0.7) * 0.14, HEAD.out[i], 0)), new THREE.Vector3(1, 1, 1))
    parts.push(eyeGeometry(3, 16, 12, false).applyMatrix4(head.matrixWorld.clone().multiply(m)))
  })
  parts.push(squeeze(strip(lidGeometry(24, false), { color: '#b9bec2', uv: WHITE_UV })).translate(0, -0.03, 0))
  const paper = new THREE.PlaneGeometry(5.0, 2.45); paper.rotateX(-Math.PI / 2); paper.rotateY(0.74); paper.translate(0, LID_TOP - 0.05, 0)
  const band = new THREE.CylinderGeometry(NECK + 0.31, NECK + 0.31, 1.15, 8, 1, true, 0.62 - 0.975, 1.95); band.translate(0, 17.42, 0)
  parts.push(squeeze(strip(paper, { color: '#eadfc2', uv: WHITE_UV })), squeeze(strip(band, { color: '#eadfc2', uv: WHITE_UV })))
  const solid = new THREE.Mesh(merge(parts.map(g => strip(g))), spec); solid.name = 'solid'
  scene.add(solid, jar)
  return { scene }
}

function lod2() {
  // one opaque mesh: the jar's silhouette, emerald up to the waterline, pale glass above, the steel lid
  const prof = [[0, 0], [5.9, 0], [5.96, 0.5], [5.96, LEVEL], [5.96, 13.6], [5.4, 15.1], [NECK + 0.3, 15.6], [NECK, 16.0], [NECK + 0.26, 16.08], [NECK + 0.26, LID_TOP - 0.4], [NECK, LID_TOP - 0.1], [0, LID_TOP - 0.02]]
  const segs = 24, pos = [], col = []
  const colour = y => new THREE.Color(y <= LEVEL + 0.01 ? '#2f9a6a' : y < 16.04 ? '#cfe3df' : '#9aa0a4')
  for (let i = 0; i < prof.length - 1; i++) {
    const [r0, y0] = prof[i], [r1, y1] = prof[i + 1], c = colour((y0 + y1) / 2)
    for (let k = 0; k < segs; k++) {
      const a0 = k / segs * Math.PI * 2, a1 = (k + 1) / segs * Math.PI * 2
      const P = (r, y, a) => [Math.sin(a) * r * S, y, Math.cos(a) * r * S]
      const quad = [P(r0, y0, a0), P(r0, y0, a1), P(r1, y1, a1), P(r0, y0, a0), P(r1, y1, a1), P(r1, y1, a0)]
      for (const v of quad) { pos.push(...v); col.push(c.r, c.g, c.b) }
    }
  }
  let g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g = mergeVertices(g, 1e-4); g.computeVertexNormals()
  const scene = new THREE.Scene()
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ name: 'Far', vertexColors: true, roughness: 0.5 })); m.name = 'far'
  scene.add(m)
  return { scene }
}

// ---------- a local stand-in for Project 0's shader hooks (to see it and catch GLSL errors) ----------
function emulate(mat, { vertex, surface }, uniforms) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float p0Time; varying vec3 vP0Pos; varying vec3 vP0World; varying vec2 vP0Uv;
${vertex || ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  vP0Pos = (modelMatrix * vec4(transformed, 1.0)).xyz; vP0Uv = uv;
  ${vertex ? 'transformed = (inverse(modelMatrix) * vec4(p0Vertex(vP0Pos, normalize(mat3(modelMatrix) * objectNormal), uv), 1.0)).xyz;' : ''}`)
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vP0World = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    if (!surface) return
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float p0Time; uniform sampler2D causticMap; varying vec3 vP0Pos; varying vec3 vP0World; varying vec2 vP0Uv;
struct P0Surface { vec3 color; float alpha; vec3 emissive; float roughness; float metalness; vec3 normal; vec2 uv; vec3 position; vec3 world; vec3 view; };
${surface}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    P0Surface s;
    s.color = diffuseColor.rgb; s.alpha = diffuseColor.a; s.emissive = vec3(0.0);
    s.roughness = roughnessFactor; s.metalness = metalnessFactor;
    s.normal = normalize((vec4(normal, 0.0) * viewMatrix).xyz); s.uv = vP0Uv;
    s.position = vP0Pos; s.world = vP0World; s.view = normalize(cameraPosition - vP0World);
    p0Surface(s);
    diffuseColor.rgb = s.color; diffuseColor.a = s.alpha; roughnessFactor = s.roughness; metalnessFactor = s.metalness;
    normal = normalize((viewMatrix * vec4(s.normal, 0.0)).xyz);
    totalEmissiveRadiance += s.emissive;
  }`)
  }
  mat.customProgramCacheKey = () => mat.name + (surface ? 's' : '') + (vertex ? 'v' : '')
}

// ---------- checks and export ----------
function stats(scene) {
  let tris = 0, prims = 0
  const mats = new Set(), texs = new Set()
  scene.traverse(o => {
    if (!o.isMesh) return
    prims++; mats.add(o.material.name)
    for (const k of ['map', 'metalnessMap', 'roughnessMap']) if (o.material[k]) texs.add(o.material[k])
    tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3
  })
  scene.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(scene)
  return `${Math.round(tris)} triangles, ${prims} primitives, materials ${[...mats].join('/')}, ${texs.size} textures (${[...texs].map(t => t.image.width).join('/')}), box x ${box.min.x.toFixed(2)}..${box.max.x.toFixed(2)} y ${box.min.y.toFixed(2)}..${box.max.y.toFixed(2)} z ${box.min.z.toFixed(2)}..${box.max.z.toFixed(2)}`
}
async function glb(scene) { return await new GLTFExporter().parseAsync(scene, { binary: true }) }
async function save(path, data, type = 'application/octet-stream') {
  const res = await fetch('/save/' + path, { method: 'POST', body: data, headers: { 'content-type': type } })
  if (!res.ok) throw new Error('save failed ' + path)
}

async function main() {
  await document.fonts.load('700 100px "Stardos Stencil"').catch(() => {})
  await document.fonts.load('40px "Special Elite"').catch(() => {})
  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, preserveDrawingBuffer: true })
  renderer.setSize(960, 540, false)

  // the caustic pattern, baked once into a tileable image (the shaders drift two copies of it)
  const caus = makeCaustics(renderer)
  caus(31)
  const px = new Uint8Array(512 * 512 * 4)
  renderer.readRenderTargetPixels(caus.rt, 0, 0, 512, 512, px)
  const cc = canvas(512, 512), img = cc.g.createImageData(512, 512)
  img.data.set(px); cc.g.putImageData(img, 0, 0)
  const causPng = await new Promise(r => cc.c.toBlob(r, 'image/png'))
  const causTex = new THREE.CanvasTexture(cc.c); causTex.wrapS = causTex.wrapT = THREE.RepeatWrapping; causTex.colorSpace = THREE.NoColorSpace

  const L0 = lod0(), L1 = lod1(), L2 = lod2()
  say('LOD0', stats(L0.scene)); say('LOD1', stats(L1.scene)); say('LOD2', stats(L2.scene))
  const nodes = []; L0.scene.traverse(o => { if (o.name) nodes.push(o.name) })
  say('names', nodes.join(', '))

  const lot = {
    script: 'build.js',
    materials: {
      Glass: { vertex: 'glass_v.glsl', surface: 'glass.glsl', transparent: true, textures: { causticMap: 'caustic.png' }, glow: 0 },
      Specimen: { vertex: 'specimens_v.glsl', surface: 'specimens.glsl', textures: { causticMap: 'caustic.png' }, glow: 0 },
      Lid: { surface: 'lid.glsl', glow: 0 },
    },
  }
  const files = { 'glass_v.glsl': GLASS_V, 'glass.glsl': GLASS_S, 'specimens_v.glsl': SPEC_V, 'specimens.glsl': SPEC_S, 'lid.glsl': LID_S, 'build.js': scriptSource() }
  if (q.get('save') !== '0') {
    const b0 = await glb(L0.scene), b1 = await glb(L1.scene), b2 = await glb(L2.scene)
    await save('build/jar/lod0.glb', b0); await save('build/jar/lod1.glb', b1); await save('build/jar/lod2.glb', b2)
    for (const [name, text] of Object.entries(files)) await save('build/jar/' + name, text, 'text/plain')
    await save('build/jar/caustic.png', causPng, 'image/png')
    await save('build/jar/lot.json', JSON.stringify(lot, null, 2), 'application/json')
    say('saved build/jar/: lod0', (b0.byteLength / 1e6).toFixed(2), 'MB, lod1', (b1.byteLength / 1e6).toFixed(2), 'MB, lod2', (b2.byteLength / 1e3).toFixed(1), 'kB, lot.json, shaders, build.js, caustic.png')
  }

  // preview in a bright, city-like light with the shader stand-ins: ?view=0|1|2, ?t= seconds, ?cam=x,y,z
  const view = [L0, L1, L2][+(q.get('view') || 0)]
  const uni = { p0Time: { value: +(q.get('t') || 12) }, causticMap: { value: causTex } }
  const hooks = { Glass: { vertex: GLASS_V, surface: GLASS_S }, Specimen: { vertex: SPEC_V, surface: SPEC_S }, Lid: { surface: LID_S } }
  view.scene.traverse(o => { if (o.isMesh && hooks[o.material.name]) emulate(o.material, hooks[o.material.name], uni) })
  const sc = view.scene
  sc.add(new THREE.HemisphereLight(0xffffff, 0x9a9a96, 2.0))
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-8, 20, 10); sc.add(sun)
  sc.background = new THREE.Color('#f4f4f2')
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: '#e9e9e6' })); floor.rotation.x = -Math.PI / 2; sc.add(floor)
  const cam = new THREE.PerspectiveCamera(40, 960 / 540, 0.1, 500)
  cam.position.set(...(q.get('cam') || '22,10,30').split(',').map(Number)); cam.lookAt(0, 9, 0)
  renderer.render(sc, cam)
  const bad = renderer.info.programs.filter(p => p.diagnostics && !p.diagnostics.runnable).length
  say(bad ? `SHADER ERRORS in ${bad} programs (see console)` : 'shaders compile')
  say('done')
  window.done = true
}
main().catch(e => { say('ERROR', e.stack || e); window.done = true })
