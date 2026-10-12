// "Mind in a Jar": a monumental diorama, 12 x 12 m footprint and 19 m tall. A giant lidded glass canning
// jar, as wide as the footprint allows, of clear emerald water; a vinyl-toy brain bobs inside with its two
// eyeballs tucked under the frontal lobes, among rising bubbles, a rippling surface, caustics and light shafts.
//
// Rendering: everything opaque (and the glass behind the water) is first drawn into an HDR target with
// depth; the water is then a custom shader that refracts that image, absorbs light along the real path
// through the water cylinder and ray-marches the light shafts that the rippling surface casts.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

const q = new URLSearchParams(location.search)
const $ = id => document.getElementById(id)
const status = t => { $('label').textContent = t }
const W = () => Math.max(1, innerWidth), H = () => Math.max(1, innerHeight)
const V3 = (x, y, z) => new THREE.Vector3(x, y, z)
const UP = V3(0, 1, 0)
const clamp01 = x => Math.max(0, Math.min(1, x))
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }

// ---------- dimensions (metres; y up, the front is +z) ----------
export const R_OUT = 6.0, R_IN = 5.76         // body radius outside / inside: the jar fills the 12 x 12 m footprint
export const NECK = 4.96                      // outside of the neck, under the lid
export const LID_TOP = 19                     // the lid tops out at the 19 m limit
export const WATER = { r: 5.735, yb: 0.56, level: 14.2 }
// the head: where it floats, and its two eyes under the frontal lobes (the right one a little off to the side)
export const HEAD = { base: [0.1, 9.7, 0.1], eyes: [[-1.69, -2.67, 3.05], [2.28, -2.86, 2.8]], out: [0, 0.14] }
export const LIGHT_POS = V3(-9.5, 41, 10.5)   // the key spot: high, front left
const BG = '#08090a'

export function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
}

// 3D simplex noise (Gustavson), for the brain folds
export function simplex(seed) {
  const r = rng(seed), p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]] }
  const perm = new Uint8Array(512), pm = new Uint8Array(512)
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm[i] = perm[i] % 12 }
  const G = [1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1]
  const F3 = 1 / 3, G3 = 1 / 6
  const corner = (gi, x, y, z) => { let t = 0.6 - x * x - y * y - z * z; if (t < 0) return 0; t *= t; return t * t * (G[gi * 3] * x + G[gi * 3 + 1] * y + G[gi * 3 + 2] * z) }
  return (x, y, z) => {
    const s = (x + y + z) * F3, i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s)
    const t = (i + j + k) * G3, x0 = x - i + t, y0 = y - j + t, z0 = z - k + t
    let i1, j1, k1, i2, j2, k2
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0 } else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1 } else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1 }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1 } else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1 } else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0 }
    }
    const ii = i & 255, jj = j & 255, kk = k & 255
    return 32 * (corner(pm[ii + perm[jj + perm[kk]]], x0, y0, z0)
      + corner(pm[ii + i1 + perm[jj + j1 + perm[kk + k1]]], x0 - i1 + G3, y0 - j1 + G3, z0 - k1 + G3)
      + corner(pm[ii + i2 + perm[jj + j2 + perm[kk + k2]]], x0 - i2 + 2 * G3, y0 - j2 + 2 * G3, z0 - k2 + 2 * G3)
      + corner(pm[ii + 1 + perm[jj + 1 + perm[kk + 1]]], x0 - 1 + 3 * G3, y0 - 1 + 3 * G3, z0 - 1 + 3 * G3))
  }
}

// ---------- shared water uniforms and GLSL ----------
const U = {
  uLevel: { value: WATER.level }, uR: { value: WATER.r }, uYb: { value: WATER.yb }, uTime: { value: 0 },
  uCScale: { value: 1 / 5.5 }, uLightPos: { value: LIGHT_POS.clone() },
  // absorption per metre: red goes first, then blue; the green survives (emerald)
  uSigma: { value: V3(0.05, 0.03, 0.085) },
  uGlowCol: { value: new THREE.Color(0.05, 0.42, 0.24) },
  tCaustic: { value: null },
}
const WATER_GLSL = /* glsl */`
uniform float uLevel, uR, uYb, uTime, uCScale;
uniform vec3 uLightPos, uSigma, uGlowCol;
uniform sampler2D tCaustic;
// entry and exit distances of the ray o + t d through the water cylinder (no hit: x > y)
vec2 cylHit(vec3 o, vec3 d) {
  float t0 = -1e9, t1 = 1e9;
  float a = dot(d.xz, d.xz), b = dot(o.xz, d.xz), c = dot(o.xz, o.xz) - uR * uR;
  if (a > 1e-7) {
    float h = b * b - a * c;
    if (h < 0.0) return vec2(1.0, -1.0);
    h = sqrt(h); t0 = (-b - h) / a; t1 = (-b + h) / a;
  } else if (c > 0.0) return vec2(1.0, -1.0);
  if (abs(d.y) > 1e-7) {
    float ta = (uYb - o.y) / d.y, tb = (uLevel - o.y) / d.y;
    t0 = max(t0, min(ta, tb)); t1 = min(t1, max(ta, tb));
  } else if (o.y < uYb || o.y > uLevel) return vec2(1.0, -1.0);
  return vec2(t0, t1);
}
float caus(vec2 xz, float lod) {
  return 0.62 * textureLod(tCaustic, xz * uCScale, lod).r + 0.38 * textureLod(tCaustic, xz * uCScale * 1.37 + vec2(0.31, 0.77), lod).r;
}
// what the key light looks like by the time it reaches P: tinted by the water it crossed, focused into caustics
vec3 waterLight(vec3 P) {
  vec3 L = normalize(uLightPos - P);
  vec2 h = cylHit(P, L);
  float t0 = max(h.x, 0.0);
  if (h.y <= t0) return vec3(1.0);
  float d = h.y - t0;
  vec3 E = P + L * h.y;
  float top = smoothstep(uLevel - 0.3, uLevel - 0.02, E.y);
  float c = caus(E.xz, 0.0);
  float focus = mix(1.0, 0.25 + 2.6 * c, top * clamp(0.15 + d * 0.12, 0.0, 1.0));
  return exp(-uSigma * d) * focus;
}
// light scattered out of the jar onto the ground around it
vec3 floorGlow(vec3 P) {
  float r = length(P.xz);
  float ring = exp(-max(r - uR, 0.0) / 2.4);
  return uGlowCol * ring * (0.55 + 1.1 * caus(P.xz * 0.8, 1.0));
}
`

/** Lights a built-in material as if the key light reached it through the water (tint + caustics). */
function underwater(mat, { glow = 0, vertex = '', key = 'w' } = {}) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, { uGlowAmt: { value: glow } })
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uTime;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + vertex)
      .replace('#include <project_vertex>', `#include <project_vertex>
  #ifdef USE_INSTANCING
    vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  #else
    vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uGlowAmt;\n' + WATER_GLSL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += uGlowAmt * floorGlow(vWPos) * (diffuseColor.rgb + 0.15);')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  { vec3 wl = waterLight(vWPos); reflectedLight.directDiffuse *= wl; reflectedLight.directSpecular *= wl; }`)
  }
  mat.customProgramCacheKey = () => 'uw-' + key
  return mat
}

// ---------- caustics: an animated, tileable pattern rendered every frame ----------
export function makeCaustics(renderer) {
  const rt = new THREE.WebGLRenderTarget(512, 512, {
    type: THREE.UnsignedByteType, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true,
  })
  rt.texture.wrapS = rt.texture.wrapT = THREE.RepeatWrapping
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    // after "Tileable Water Caustic" by joltz0r / Dave_Hoskins
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec2 vUv;
      void main() {
        const float TAU = 6.28318530718;
        vec2 p = mod(vUv * TAU, TAU) - 250.0;
        vec2 i = p; float c = 1.0; const float inten = 0.005;
        for (int n = 0; n < 5; n++) {
          float t = uTime * (1.0 - (3.5 / float(n + 1)));
          i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
          c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
        }
        c /= 5.0; c = 1.17 - pow(c, 1.4);
        float v = clamp(pow(abs(c), 8.0), 0.0, 1.0);
        gl_FragColor = vec4(vec3(v), 1.0);
      }`,
  })
  const quad = new FullScreenQuad(mat)
  U.tCaustic.value = rt.texture
  const update = t => {
    mat.uniforms.uTime.value = t * 0.42 + 23
    const prev = renderer.getRenderTarget()
    renderer.setRenderTarget(rt); quad.render(renderer); renderer.setRenderTarget(prev)
  }
  update.rt = rt
  return update
}

// ---------- textures ----------
export function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return { c, g: c.getContext('2d') } }

/** Glass surface detail as a roughness map: almost polished, with fine scratches and a few giant fingerprints. */
function smudgeTexture(r) {
  const { c, g } = canvas(2048, 2048)
  g.fillStyle = 'rgb(12,12,12)'; g.fillRect(0, 0, 2048, 2048)
  // scratches: short, faint, mostly sideways (from being slid around)
  for (let i = 0; i < 520; i++) {
    const x = r() * 2048, y = 200 + r() * 1700, len = 8 + r() ** 2 * 120, a = (r() - 0.5) * 0.7
    g.strokeStyle = `rgba(255,255,255,${0.05 + r() * 0.16})`; g.lineWidth = r() < 0.85 ? 0.7 : 1.4
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5 + (r() - 0.5) * 6, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke()
  }
  // fingerprints on the outside of the body (v 0.08..0.45 of the profile is the outer wall)
  const prints = [[0.06, 0.70], [0.13, 0.64], [0.52, 0.76], [0.58, 0.69], [0.86, 0.6]]
  for (const [u, v] of prints) {
    const cx = u * 2048, cy = v * 2048, rx = 40 + r() * 16, ry = rx * 1.35, rot = (r() - 0.5) * 0.8
    g.save(); g.translate(cx, cy); g.rotate(rot)
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, rx * 1.3)
    grad.addColorStop(0, 'rgba(255,255,255,0.10)'); grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad; g.beginPath(); g.ellipse(0, 0, rx * 1.3, ry * 1.3, 0, 0, Math.PI * 2); g.fill()
    for (let k = 2; k < rx; k += 3.2) {
      g.strokeStyle = `rgba(255,255,255,${0.12 + r() * 0.12})`; g.lineWidth = 1.3
      const s = r() * Math.PI * 2, e = s + Math.PI * (1.1 + r() * 0.8)
      g.beginPath(); g.ellipse(0, k * 0.15, k, k * 1.35, 0, s, e); g.stroke()
    }
    g.restore()
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.NoColorSpace
  return t
}

/** The eyeball as an equirectangular map: iris and pupil around the top pole, veins creeping up from the back. */
export function eyeTexture(iris, seed) {
  const r = rng(seed), w = 1024, h = 512
  const { c, g } = canvas(w, h)
  const img = g.createImageData(w, h), d = img.data
  const ic = new THREE.Color(iris), dark = ic.clone().multiplyScalar(0.35), light = ic.clone().lerp(new THREE.Color('#ffffff'), 0.35)
  const fib = Array.from({ length: w }, () => r())
  for (let y = 0; y < h; y++) {
    const th = y / h * Math.PI // latitude from the iris pole
    for (let x = 0; x < w; x++) {
      let col
      if (th < 0.2) col = [0.02, 0.02, 0.025]
      else if (th < 0.52) {
        const k = (th - 0.2) / 0.32, f = fib[x] * 0.5 + fib[(x + 7) % w] * 0.5
        const base = k < 0.18 ? dark.clone().lerp(ic, k / 0.18) : ic.clone().lerp(light, Math.sin(k * Math.PI) * 0.35 * f)
        base.lerp(dark, sstep(0.82, 1, k) * 0.9)
        col = [base.r, base.g, base.b]
      } else {
        const k = sstep(0.52, 0.62, th)
        const s = [0.95, 0.93, 0.90]
        const lim = dark.clone().multiplyScalar(0.8)
        col = [lim.r + (s[0] - lim.r) * k, lim.g + (s[1] - lim.g) * k, lim.b + (s[2] - lim.b) * k]
        const warm = sstep(1.6, 3.0, th) * 0.12
        col = [col[0], col[1] - warm * 0.4, col[2] - warm * 0.5]
      }
      const o = (y * w + x) * 4
      d[o] = col[0] * 255; d[o + 1] = col[1] * 255; d[o + 2] = col[2] * 255; d[o + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  // veins: thin red squiggles from the back of the eye towards the iris, branching and thinning
  const vein = (x, y, wdt, n) => {
    let a = -Math.PI / 2 + (r() - 0.5) * 0.6
    g.strokeStyle = `rgba(${170 + r() * 40},${30 + r() * 30},${40 + r() * 20},${0.55 + r() * 0.3})`
    for (let i = 0; i < n && y > h * 0.24; i++) {
      const nx = x + Math.cos(a) * 6, ny = y + Math.sin(a) * 6
      g.lineWidth = wdt * (1 - i / n) + 0.3
      g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke()
      x = nx; y = ny; a += (r() - 0.5) * 0.7; a = Math.max(-Math.PI * 0.9, Math.min(-Math.PI * 0.1, a))
      if (r() < 0.07 && wdt > 0.8) vein(x, y, wdt * 0.6, n - i)
    }
  }
  for (let i = 0; i < 26; i++) vein(r() * w, h * (0.78 + r() * 0.2), 2.4, 30 + r() * 22)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}

// ---------- the jar ----------
function quadBez(a, b, c, n) { const out = []; for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]]) } return out }

/** The jar's closed profile (outer wall up, inner wall down), resampled evenly so the texture is not stretched. */
export function jarProfile(step = 0.08) {
  const outer = [
    [0, 0.16], [3.4, 0.11], [4.9, 0.04], [5.45, 0.0], [5.78, 0.05], [5.94, 0.2], [R_OUT, 0.5],
    [R_OUT, 13.6], ...quadBez([R_OUT, 13.6], [R_OUT, 15.1], [NECK + 0.06, 15.48], 16),
    [NECK + 0.22, 15.55], [NECK + 0.31, 15.65], [NECK + 0.3, 15.75], [NECK + 0.18, 15.84], [NECK + 0.04, 15.89], [NECK, 16.0],
    [NECK, 18.2], [NECK - 0.02, 18.32], [NECK - 0.1, 18.38], [NECK - 0.2, 18.36],
  ]
  const inner = [
    [NECK - 0.22, 18.28], [NECK - 0.21, 18.0], [NECK - 0.21, 16.05],
    ...quadBez([NECK - 0.21, 16.05], [R_IN, 15.3], [R_IN, 13.6], 16),
    [R_IN, 0.95], [5.73, 0.78], [5.64, 0.66], [5.45, 0.58], [5.0, 0.54], [3.2, 0.52], [0, 0.5],
  ]
  const pts = [...outer, ...inner].map(([r, y]) => new THREE.Vector2(r, y))
  // resample by arc length, keeping every original corner
  const out = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(a.distanceTo(b) / step))
    for (let k = 1; k <= n; k++) out.push(a.clone().lerp(b, k / n))
  }
  return out
}

/** The two-piece canning lid: a knurled screw band over the threads and a flat plate with an embossed ring. */
export function lidGeometry(segments = 720, knurl = true) {
  const B = NECK + 0.26, y0 = 16.08
  const prof = [
    [0, LID_TOP], [2.6, LID_TOP - 0.04], [3.55, LID_TOP - 0.1], [3.7, LID_TOP - 0.05], [3.85, LID_TOP - 0.05], [4.0, LID_TOP - 0.12],
    [4.55, LID_TOP - 0.14], [B - 0.16, LID_TOP - 0.16], [B - 0.05, LID_TOP - 0.24], [B, LID_TOP - 0.4],
    [B, y0 + 0.14], [B - 0.02, y0 + 0.04], [B - 0.08, y0], [B - 0.14, y0 + 0.04],
    [B - 0.14, LID_TOP - 0.42], [0, LID_TOP - 0.44],
  ].map(([r, y]) => new THREE.Vector2(r, y))
  let g = new THREE.LatheGeometry(prof, segments)
  // knurling: fine vertical ribs round the band
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z)
    if (!knurl || r < B - 0.01 || y < y0 + 0.25 || y > LID_TOP - 0.55) continue
    const k = 1 + 0.028 * Math.abs(Math.cos(Math.atan2(z, x) * 90)) ** 3 / r
    p.setXYZ(i, x * k, y, z * k)
  }
  // weld the lathe seam so the recomputed normals have no visible line
  g.deleteAttribute('uv'); g.deleteAttribute('normal')
  g = mergeVertices(g)
  g.computeVertexNormals()
  return g
}

function glassMaterial(r) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x000000, roughness: 1, roughnessMap: smudgeTexture(r), metalness: 0, ior: 1.5,
    specularIntensity: 1, envMapIntensity: 1.35, transparent: true, depthWrite: false, premultipliedAlpha: true,
  })
  const extra = { uRTPass: { value: 0 }, uTint: { value: new THREE.Color('#5d9c86') }, uShim: { value: new THREE.Color(0.05, 0.55, 0.3) } }
  mat.userData.u = extra
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, extra)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uRTPass;\nuniform vec3 uTint, uShim;\n' + WATER_GLSL)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  // the refraction pass only wants the glass that is behind the water
  if (uRTPass > 0.5) {
    vec3 rd = normalize(vWPos - cameraPosition);
    vec2 h = cylHit(cameraPosition, rd);
    if (h.y > h.x && h.x > 0.0 && length(vWPos - cameraPosition) < h.x + 0.03) discard;
  }`)
      .replace('#include <opaque_fragment>', `
  float ndv = clamp(abs(dot(geometryNormal, geometryViewDir)), 0.0, 1.0);
  float fr = pow(1.0 - ndv, 2.6);
  float sm = smoothstep(0.06, 0.45, texture2D(roughnessMap, vRoughnessMapUv).g);
  float a = clamp(0.03 + 0.62 * fr + 0.2 * sm, 0.0, 0.94);
  vec3 body = uTint * (0.012 + 0.2 * fr) + vec3(0.035) * sm;
  // green caustic light shimmering on the glass below the water line
  float under = smoothstep(uLevel + 0.15, uLevel - 0.35, vWPos.y) * step(uYb - 0.7, vWPos.y);
  vec3 Ls = normalize(uLightPos - vWPos);
  float dS = max(uLevel - vWPos.y, 0.0) / max(Ls.y, 0.2);
  float c = caus(vWPos.xz + Ls.xz * dS, 0.6);
  vec3 shim = uShim * under * (0.03 + 1.1 * c * c) * exp(-uSigma * dS * 0.35);
  gl_FragColor = vec4(body * a + totalSpecular + shim * (0.35 + a), a);`)
      .replace('#include <premultiplied_alpha_fragment>', '')
  }
  mat.customProgramCacheKey = () => 'glass'
  return mat
}

// ---------- the "DO NOT OPEN" paper labels on the lid ----------
/** Aged paper with torn edges and a red rubber stamp; w x h canvas pixels, transparent outside the paper. */
export function paperTexture(w, h, seed, draw) {
  const r = rng(seed)
  const { c, g } = canvas(w, h)
  // torn outline: jittered edges, a little ragged
  const m = Math.round(h * 0.06), pts = []
  const edge = (x0, y0, x1, y1, n) => { for (let i = 0; i < n; i++) { const t = i / n; pts.push([x0 + (x1 - x0) * t + (r() - 0.5) * m * 0.5, y0 + (y1 - y0) * t + (r() - 0.5) * m * 0.5]) } }
  const nx = Math.round(w / 14), ny = Math.round(h / 14)
  edge(m, m, w - m, m, nx); edge(w - m, m, w - m, h - m, ny); edge(w - m, h - m, m, h - m, nx); edge(m, h - m, m, m, ny)
  g.save()
  g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.clip()
  const grad = g.createLinearGradient(0, 0, w, h)
  grad.addColorStop(0, '#f3ead2'); grad.addColorStop(0.6, '#ebdfc0'); grad.addColorStop(1, '#ddcca4')
  g.fillStyle = grad; g.fillRect(0, 0, w, h)
  // fibres and grime
  for (let i = 0; i < w * h / 90; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '90,70,40' : '255,255,255'},${r() * 0.06})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1) }
  // a coffee ring and a couple of creases
  g.strokeStyle = 'rgba(140,95,45,0.16)'; g.lineWidth = h * 0.02
  g.beginPath(); g.arc(w * (0.75 + r() * 0.15), h * (0.25 + r() * 0.5), h * 0.28, 0.4, 5.6); g.stroke()
  for (let k = 0; k < 2; k++) {
    const x = w * (0.25 + r() * 0.5)
    g.strokeStyle = 'rgba(80,60,30,0.12)'; g.lineWidth = 2
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * w * 0.1, h); g.stroke()
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.moveTo(x + 3, 0); g.lineTo(x + 3 + (r() - 0.5) * w * 0.1, h); g.stroke()
  }
  draw(g, r)
  // darker, dirtier rim
  const rim = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.62)
  rim.addColorStop(0, 'rgba(120,90,40,0)'); rim.addColorStop(1, 'rgba(120,90,40,0.3)')
  g.fillStyle = rim; g.fillRect(0, 0, w, h)
  g.restore()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}
/** A red rubber stamp: the text inside a double frame, with patchy ink. */
export function stamp(g, r, text, cx, cy, size, angle) {
  g.save(); g.translate(cx, cy); g.rotate(angle)
  g.font = `700 ${size}px "Stardos Stencil", Impact, sans-serif`
  const tw = g.measureText(text).width, pw = tw + size * 0.7, ph = size * 1.45
  g.fillStyle = g.strokeStyle = '#b3201c'
  g.lineWidth = size * 0.07; g.strokeRect(-pw / 2, -ph / 2, pw, ph)
  g.lineWidth = size * 0.025; g.strokeRect(-pw / 2 + size * 0.12, -ph / 2 + size * 0.12, pw - size * 0.24, ph - size * 0.24)
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 0, size * 0.04)
  // ink that did not take
  g.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 900; i++) { g.globalAlpha = 0.25 + r() * 0.6; g.beginPath(); g.arc((r() - 0.5) * pw, (r() - 0.5) * ph, r() * size * 0.035, 0, 7); g.fill() }
  g.restore()
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1
}
/** The lid top's height at radius r (follows the slight dome of the plate). */
export const lidTopY = r => r < 2.6 ? LID_TOP - 0.04 * r / 2.6 : r < 3.55 ? LID_TOP - 0.04 - 0.06 * (r - 2.6) / 0.95 : LID_TOP - 0.1

export function lidLabels() {
  const grp = new THREE.Group()
  const mat = map => new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, roughness: 0.92, side: THREE.DoubleSide })
  const face = 0.62 // turned to the ¾ view

  // on top: a big torn sheet, slightly askew, stamped DO NOT OPEN, with a typed line under it
  const topTex = paperTexture(2048, 1000, 77, (g, r) => {
    stamp(g, r, 'DO NOT OPEN', 1024, 430, 250, -0.05)
    g.fillStyle = 'rgba(30,26,22,0.85)'; g.font = '62px "Special Elite", "Courier New", monospace'; g.textAlign = 'center'
    g.fillText('SPECIMEN Nº 19  ·  KEEP SEALED', 1024, 800)
  })
  const tg = new THREE.PlaneGeometry(5.0, 2.45, 40, 20)
  tg.rotateX(-Math.PI / 2); tg.rotateY(face + 0.12)
  const tp = tg.attributes.position
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i)
    // follow the dome, with one corner curling up a little
    const curl = Math.max(0, x * Math.cos(face) - z * Math.sin(face) - 1.9) ** 2 * 0.1
    tp.setY(i, lidTopY(Math.hypot(x, z)) + 0.006 + curl)
  }
  tg.computeVertexNormals()
  const top = new THREE.Mesh(tg, mat(topTex))
  top.receiveShadow = true
  grp.add(top)

  // round the band: a strip of paper pasted on, so the warning reads from the side
  const B = NECK + 0.26 + 0.04, len = 1.95, hh = 1.15
  const bandTex = paperTexture(2048, 236, 31, (g, r) => stamp(g, r, 'DO NOT OPEN', 1024, 120, 140, 0.02))
  const bg = new THREE.CylinderGeometry(B, B, hh, 96, 6, true, face - len / 2, len)
  const bp = bg.attributes.position, n3 = simplex(5)
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i), k = 1 + (0.012 + 0.008 * n3(x * 0.8, y * 2, z * 0.8)) / B
    bp.setXYZ(i, x * k, y, z * k)
  }
  bg.translate(0, 17.42, 0)
  bg.computeVertexNormals()
  const band = new THREE.Mesh(bg, mat(bandTex))
  band.receiveShadow = true
  grp.add(band)
  return grp
}

// ---------- the water ----------
function waterMaterials() {
  const uni = {
    ...U,
    tScene: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) },
    uProjView: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
    uSun: { value: new THREE.Color(1.0, 0.95, 0.85).multiplyScalar(1.0) },
    uAmbW: { value: new THREE.Color(0.004, 0.03, 0.02) },
    uScatter: { value: V3(0.012, 0.056, 0.036) },
    uRefr: { value: 0.6 },
    uDeep: { value: new THREE.Color(0.02, 0.2, 0.11) },
    uRays: { value: 1 },
  }
  const vertexShader = /* glsl */`
    uniform float uTime, uLevel;
    varying vec3 vW; varying vec3 vN; varying float vMen;
    float wave(vec2 p, float t) {
      float r = length(p);
      return 0.065 * sin(0.55 * p.x + 0.9 * t) + 0.05 * sin(0.72 * p.y - 0.7 * t + 1.3)
        + 0.03 * sin(1.3 * (p.x * 0.8 + p.y * 0.6) + 1.6 * t) + 0.022 * sin(1.9 * (-p.x * 0.5 + p.y * 0.86) - 2.1 * t + 0.4)
        + 0.018 * sin(3.1 * r - 2.4 * t) * exp(-r * 0.25);
    }
    void main() {
      vec3 p = position; vec3 n = normal;
      if (p.y > uLevel - 0.005) {
        p.y += wave(p.xz, uTime);
        #ifdef TOP
          const float e = 0.04;
          float gx = (wave(p.xz + vec2(e, 0.0), uTime) - wave(p.xz - vec2(e, 0.0), uTime)) / (2.0 * e);
          float gz = (wave(p.xz + vec2(0.0, e), uTime) - wave(p.xz - vec2(0.0, e), uTime)) / (2.0 * e);
          n = normalize(vec3(-gx, 1.0, -gz));
        #endif
      }
      vMen = uLevel + wave(p.xz, uTime) - p.y;
      vec4 w = modelMatrix * vec4(p, 1.0);
      vW = w.xyz; vN = normalize(mat3(modelMatrix) * n);
      gl_Position = projectionMatrix * viewMatrix * w;
    }`
  const fragmentShader = /* glsl */`
    ${WATER_GLSL}
    uniform sampler2D tScene, tDepth;
    uniform vec2 uRes;
    uniform mat4 uProjView, uProjInv, uCamWorld;
    uniform vec3 uSun, uAmbW, uScatter, uDeep;
    uniform float uRays, uRefr;
    varying vec3 vW; varying vec3 vN; varying float vMen;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    vec3 worldAt(vec2 uv) {
      float d = texture2D(tDepth, uv).r;
      vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      v /= v.w;
      return (uCamWorld * v).xyz;
    }
    // the dark studio, as the water reflects it: a big soft key above-left and a cool strip on the right
    vec3 env(vec3 d) {
      vec3 c = vec3(0.012, 0.014, 0.016) + vec3(0.05, 0.055, 0.06) * smoothstep(-0.1, 1.0, d.y);
      vec3 k = normalize(uLightPos - vec3(0.0, 12.0, 0.0));
      c += uSun * (3.0 * pow(max(dot(d, k), 0.0), 40.0) + 0.25 * pow(max(dot(d, k), 0.0), 6.0));
      c += vec3(0.55, 0.7, 1.0) * 0.18 * smoothstep(0.55, 0.95, d.x) * smoothstep(0.6, 0.0, abs(d.y - 0.15));
      return c;
    }
    void main() {
      vec3 V = normalize(vW - cameraPosition);
      vec3 N = normalize(vN);
      #ifdef TOP
        // fine ripples on top of the swell
        vec2 p = vW.xz;
        N = normalize(N + vec3(
          0.07 * sin(2.7 * p.x + 3.1 * uTime + sin(1.7 * p.y)) + 0.04 * sin(5.3 * p.y - 2.3 * uTime) + 0.025 * sin(9.1 * p.x + 7.3 * p.y - 4.1 * uTime),
          0.0,
          0.07 * sin(2.9 * p.y - 2.7 * uTime + sin(1.3 * p.x)) + 0.04 * sin(4.7 * p.x + 2.9 * uTime) + 0.025 * sin(8.3 * p.y - 6.1 * p.x + 3.7 * uTime)));
      #endif
      float cosi = clamp(-dot(V, N), 0.0, 1.0);
      float F = 0.02 + 0.98 * pow(1.0 - cosi, 5.0);
      vec3 R = refract(V, N, 1.0 / 1.33);
      if (dot(R, R) < 0.01) R = V;
      R = normalize(mix(V, R, uRefr)); // a little gentler than real water, so the specimens stay legible
      vec2 hit = cylHit(vW - V * 0.02, R);
      float tExit = max(hit.y, 0.05);

      // what lies behind, seen through the bent ray (never sample things in front of the water)
      vec2 uv0 = gl_FragCoord.xy / uRes;
      float dFrag = length(vW - cameraPosition);
      vec3 S0 = worldAt(uv0);
      // shift the image behind by how far the bent ray drifts from the straight one over a few metres
      float dR = min(tExit, 4.5);
      vec4 ca = uProjView * vec4(vW + R * dR, 1.0), cb = uProjView * vec4(vW + V * dR, 1.0);
      vec2 uvR = clamp(uv0 + (ca.xy / ca.w - cb.xy / cb.w) * 0.5, 0.001, 0.999);
      vec3 S = worldAt(uvR);
      if (length(S - cameraPosition) < dFrag + 0.05) { uvR = uv0; S = S0; }
      float tHit = max(length(S - vW), 0.0);
      float tEnd = min(tExit, tHit);
      vec3 behind = texture2D(tScene, uvR).rgb;

      // looking up at the underside of the surface: a green mirror of the water itself
      vec3 E = vW + R * tExit;
      #ifndef TOP
        float under = smoothstep(uLevel - 0.4, uLevel - 0.05, E.y) * step(tExit, tHit);
        behind = mix(behind, uDeep * (0.5 + 1.8 * caus(E.xz, 1.0)), under * 0.85);
      #endif

      // light shafts: march the ray, look up towards the light and read the caustic the surface casts there
      vec3 scat = vec3(0.0);
      const int STEPS = 22;
      float dt = tEnd / float(STEPS);
      float j = hash(gl_FragCoord.xy + fract(uTime * 7.13) * 91.0);
      for (int i = 0; i < STEPS; i++) {
        float t = (float(i) + j) * dt;
        vec3 P = vW + R * t;
        vec3 Ls = normalize(uLightPos - P);
        float dS = max(uLevel - P.y, 0.0) / max(Ls.y, 0.15);
        vec2 qq = P.xz + Ls.xz * dS;
        float inDisc = smoothstep(uR + 0.1, uR - 0.5, length(qq));
        float c = textureLod(tCaustic, qq * uCScale, 2.2 + dS * 0.11).r;
        float shaft = inDisc * (0.12 + uRays * 3.4 * c * c);
        scat += (uSun * shaft * exp(-uSigma * dS) + uAmbW) * exp(-uSigma * t) * dt;
      }
      vec3 col = behind * exp(-uSigma * tEnd) + scat * uScatter;

      vec3 Rf = reflect(V, N);
      vec3 Lv = normalize(uLightPos - vW);
      float spec = pow(max(dot(Rf, Lv), 0.0), 900.0) * 30.0 + pow(max(dot(Rf, Lv), 0.0), 90.0) * 0.6;
      #ifdef TOP
        col = mix(col, env(Rf), F) + spec * uSun;
        // the meniscus ring where the surface climbs the glass
        col += vec3(0.3, 0.85, 0.6) * exp(-(uR - length(vW.xz)) / 0.07) * 0.6;
      #else
        col += F * 0.12 * env(Rf);
        // the meniscus: a bright line where the surface meets the glass
        float men = vMen;
        col += vec3(0.35, 0.9, 0.65) * (exp(-pow(max(men, 0.0) / 0.05, 2.0)) * 0.9 + exp(-max(men, 0.0) / 0.35) * 0.12);
      #endif
      gl_FragColor = vec4(col, 1.0);
    }`
  const side = new THREE.ShaderMaterial({ uniforms: uni, vertexShader, fragmentShader })
  const top = new THREE.ShaderMaterial({ uniforms: uni, vertexShader, fragmentShader, defines: { TOP: 1 } })
  return { side, top, uni }
}

function buildWater() {
  const { side, top, uni } = waterMaterials()
  const h = WATER.level - WATER.yb
  const sg = new THREE.CylinderGeometry(WATER.r, WATER.r, h, 192, 2, true)
  sg.translate(0, WATER.yb + h / 2, 0)
  const pos = sg.attributes.position
  for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i) - WATER.level) < 1e-3) pos.setY(i, WATER.level)
  const tg = new THREE.RingGeometry(0.0001, WATER.r, 192, 64)
  tg.rotateX(-Math.PI / 2); tg.translate(0, WATER.level, 0)
  const g = new THREE.Group()
  const ms = new THREE.Mesh(sg, side), mt = new THREE.Mesh(tg, top)
  for (const m of [ms, mt]) { m.layers.set(1); m.frustumCulled = false; g.add(m) }
  return { group: g, uni }
}

// ---------- the brain ----------
export function brainGroup(detail = 84, cbDetail = 40) {
  const n3 = simplex(19), n3b = simplex(41)
  const cGyr = new THREE.Color('#ffa3b6'), cSul = new THREE.Color('#cf5f80'), cTmp = new THREE.Color()

  let g = new THREE.IcosahedronGeometry(1, detail)
  g.deleteAttribute('uv'); g.deleteAttribute('normal')
  g = mergeVertices(g)
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3)
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize()
    const { x, y, z } = v
    // cerebrum: an ellipsoid, flatter underneath, narrower and lower at the front, temporal lobes at the sides
    let rx = 1.72 * (1 - 0.05 * sstep(0.2, 1, z)), ry = (y > 0 ? 1.45 : 1.02) * (1 - (y > 0 ? 0.07 : 0) * sstep(0.3, 1, z)), rz = 1.92
    rx *= 1 + 0.08 * Math.exp(-(((y + 0.42) / 0.3) ** 2)) * Math.exp(-(((z - 0.1) / 0.5) ** 2))
    const px = x * rx, py = y * ry, pz = z * rz
    // gyri and sulci: zero crossings of domain-warped noise become winding grooves
    const s = 0.95
    const wx = n3b(px * 0.6 + 3.1, py * 0.6, pz * 0.6), wy = n3b(px * 0.6, py * 0.6 + 7.7, pz * 0.6), wz = n3b(px * 0.6, py * 0.6, pz * 0.6 + 1.9)
    const nn = n3(px * s + 0.6 * wx, py * s + 0.6 * wy, pz * s + 0.6 * wz)
    const groove = 1 - sstep(0, 0.27, Math.abs(nn))
    const fine = 1 - sstep(0, 0.1, Math.abs(n3(px * 2.1 + 9, py * 2.1, pz * 2.1)))
    // the longitudinal fissure between the hemispheres, and the lateral (Sylvian) fissure on each side
    const fis = Math.exp(-((x / 0.075) ** 2)) * sstep(-0.75, 0.0, y)
    const syl = Math.exp(-(((y - (-0.2 + 0.42 * z)) / 0.06) ** 2)) * sstep(0.5, 0.8, Math.abs(x)) * sstep(-0.55, -0.1, z) * sstep(0.95, 0.55, z)
    const d = -0.085 * groove - 0.012 * fine * (1 - groove) - 0.11 * syl - 0.42 * fis
    const len = Math.hypot(px, py, pz)
    const k = 1 + d / len
    pos.setXYZ(i, px * k, py * k, pz * k)
    const dark = Math.min(1, groove * 0.7 + syl * 0.8 + fis * 1.1)
    cTmp.copy(cGyr).lerp(cSul, dark)
    col[i * 3] = cTmp.r; col[i * 3 + 1] = cTmp.g; col[i * 3 + 2] = cTmp.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.computeVertexNormals()

  // cerebellum: two lobes with fine horizontal folia, tucked under the back
  let cb = new THREE.IcosahedronGeometry(1, cbDetail)
  cb.deleteAttribute('uv'); cb.deleteAttribute('normal')
  cb = mergeVertices(cb)
  const cp = cb.attributes.position, cc = new Float32Array(cp.count * 3)
  for (let i = 0; i < cp.count; i++) {
    v.fromBufferAttribute(cp, i).normalize()
    const px = v.x * 1.22, py = v.y * 0.58, pz = v.z * 0.78
    const fol = 1 - sstep(0, 0.45, Math.abs(Math.sin(py * 26 + n3(px, py, pz) * 1.2)))
    const fis = Math.exp(-((v.x / 0.09) ** 2))
    const k = 1 + (-0.03 * fol - 0.18 * fis) / Math.hypot(px, py, pz)
    cp.setXYZ(i, px * k, py * k, pz * k)
    cTmp.copy(cGyr).lerp(cSul, Math.min(1, fol * 0.7 + fis))
    cc[i * 3] = cTmp.r; cc[i * 3 + 1] = cTmp.g; cc[i * 3 + 2] = cTmp.b
  }
  cb.setAttribute('color', new THREE.BufferAttribute(cc, 3))
  cb.computeVertexNormals()
  cb.translate(0, -0.72, -1.3)

  // brain stem
  const st = new THREE.LatheGeometry([[0, -0.66], [0.13, -0.645], [0.21, -0.6], [0.245, -0.52], [0.27, -0.2], [0.31, 0.2], [0.35, 0.62], [0.2, 0.7], [0, 0.72]].map(([x, y]) => new THREE.Vector2(x, y)), 40)
  st.rotateX(0.35); st.translate(0, -1.15, -0.62)
  const sc = new Float32Array(st.attributes.position.count * 3)
  for (let i = 0; i < sc.length; i += 3) { sc[i] = cGyr.r * 0.92; sc[i + 1] = cGyr.g * 0.9; sc[i + 2] = cGyr.b * 0.9 }
  st.setAttribute('color', new THREE.BufferAttribute(sc, 3))
  st.deleteAttribute('uv')

  const mat = underwater(new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.4, clearcoat: 0.75, clearcoatRoughness: 0.18,
    sheen: 0.5, sheenColor: new THREE.Color('#ffb8c6'), sheenRoughness: 0.5,
  }), { key: 'brain' })
  const grp = new THREE.Group()
  grp.scale.setScalar(2.2) // 1.3 x 1.3 the first version
  for (const geo of [g, cb, st]) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; grp.add(m) }
  return grp
}

// ---------- the eyes ----------
export function eyeGroup(iris, seed, ws = 128, hs = 96) {
  const R = 0.95
  const geo = new THREE.SphereGeometry(R, ws, hs)
  const p = geo.attributes.position, v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const th = Math.acos(Math.max(-1, Math.min(1, v.y / R)))
    if (th < 0.6) v.multiplyScalar(1 + 0.085 * Math.cos(th / 0.6 * Math.PI / 2) ** 2) // the cornea bulge
    p.setXYZ(i, v.x, v.y, v.z)
  }
  geo.computeVertexNormals()
  geo.rotateX(Math.PI / 2) // iris looks down +z
  const eye = new THREE.Mesh(geo, underwater(new THREE.MeshPhysicalMaterial({
    map: eyeTexture(iris, seed), roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.03,
  }), { key: 'eye' }))
  eye.castShadow = true

  // optic nerve: tapered, wriggling more towards its loose end
  const L = 1.7
  const ng = new THREE.CylinderGeometry(0.21, 0.07, L, 24, 48)
  ng.translate(0, -L / 2, 0); ng.rotateX(Math.PI / 2); ng.translate(0, 0, -R * 0.82)
  const nerve = new THREE.Mesh(ng, underwater(new THREE.MeshPhysicalMaterial({
    color: '#e9c2b4', roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.3,
  }), {
    key: 'nerve' + seed,
    vertex: `{ float s = clamp((-transformed.z - ${(R * 0.82).toFixed(3)}) / ${L.toFixed(2)}, 0.0, 1.0);
      float ph = ${(seed * 1.7).toFixed(2)};
      transformed.x += sin(uTime * 1.3 + s * 3.2 + ph) * 0.28 * s * s;
      transformed.y += cos(uTime * 1.05 + s * 2.6 + ph) * 0.2 * s * s; }`,
  }))
  nerve.castShadow = true
  const grp = new THREE.Group()
  grp.add(eye, nerve)
  return grp
}

// ---------- bubbles ----------
function makeBubbles(r, count = 170) {
  const geo = new THREE.SphereGeometry(1, 14, 10)
  // underwater, a bubble reflects like a little mirror (total internal reflection)
  const mat = underwater(new THREE.MeshStandardMaterial({ color: '#f2fff8', metalness: 1, roughness: 0.05, envMapIntensity: 3.5, emissive: '#3c9a72', emissiveIntensity: 0.55 }), { key: 'bub' })
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  mesh.frustumCulled = false
  const B = []
  const spawn = (b, fresh) => {
    b.size = 0.03 + r() ** 2.4 * 0.13
    b.speed = 0.45 + b.size * 6 + r() * 0.25
    if (r() < 0.38) { b.fromBrain = true; b.x = (r() - 0.5) * 3.2; b.z = (r() - 0.5) * 3.8; b.y = 0 } // filled in from the brain each frame
    else { b.fromBrain = false; const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 5.2; b.x = Math.cos(a) * rr; b.z = Math.sin(a) * rr; b.y = WATER.yb + 0.1 }
    if (fresh) b.y = WATER.yb + r() * (WATER.level - WATER.yb), b.fromBrain = false
    b.ph = r() * 10; b.wob = 0.05 + r() * 0.12
  }
  for (let i = 0; i < count; i++) { const b = {}; spawn(b, true); B.push(b) }
  const m = new THREE.Matrix4(), qq = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3()
  const update = (dt, t, brainPos) => {
    for (let i = 0; i < count; i++) {
      const b = B[i]
      if (b.y === 0) { b.y = brainPos.y + 2.0; b.x += brainPos.x; b.z += brainPos.z }
      b.y += b.speed * dt
      if (b.y > WATER.level - b.size - 0.05) spawn(b, false)
      const wx = Math.sin(t * 2.3 + b.ph) * b.wob, wz = Math.cos(t * 1.9 + b.ph * 1.3) * b.wob
      let x = b.x + wx, z = b.z + wz
      const rr = Math.hypot(x, z), lim = WATER.r - 0.3 - b.size
      if (rr > lim) { x *= lim / rr; z *= lim / rr }
      const sq = 1 + 0.12 * Math.sin(t * 9 + b.ph)
      m.compose(p.set(x, b.y, z), qq, s.set(b.size * sq, b.size / sq * 0.88, b.size * sq))
      mesh.setMatrixAt(i, m)
    }
    mesh.instanceMatrix.needsUpdate = true
  }
  return { mesh, update }
}

// ---------- the base, figures and environment ----------
function buildRoom(scene) {
  // floor: dark, fading into the background
  const floor = new THREE.Mesh(new THREE.CircleGeometry(160, 96), underwater(new THREE.MeshStandardMaterial({ color: '#16181a', roughness: 0.9 }), { glow: 0.6, key: 'floor' }))
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true
  scene.add(floor)

  // backdrop: a dark dome with a faint lift behind the jar
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    uniforms: { uFog: { value: new THREE.Color(BG) } },
    fragmentShader: `uniform vec3 uFog; varying vec3 vD; void main(){
      float h = clamp(vD.y, -1.0, 1.0);
      vec3 c = mix(uFog, uFog * 0.35, smoothstep(0.0, 0.5, h));
      gl_FragColor = vec4(c, 1.0); }`,
  }))
  scene.add(sky)

}

/** A dark studio with softboxes, for the glass and bubbles to reflect. */
function studioEnv(renderer) {
  const env = new THREE.Scene()
  const room = new THREE.Mesh(new THREE.BoxGeometry(60, 40, 60), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.006, 0.007, 0.008), side: THREE.BackSide }))
  env.add(room)
  const box = (w, h, c, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }))
    m.position.copy(pos); m.lookAt(look); env.add(m)
  }
  box(14, 10, new THREE.Color(5, 4.8, 4.4), V3(-8, 19, 9), V3(0, 0, 0))     // the key softbox
  box(3, 26, new THREE.Color(1.3, 1.6, 2.2), V3(26, 2, -6), V3(0, 2, 0))     // cool strip, right
  box(2.4, 22, new THREE.Color(0.9, 0.95, 1.0), V3(-27, 0, -10), V3(0, 0, 0)) // rim strip, back left
  box(30, 4, new THREE.Color(0.06, 0.25, 0.14), V3(0, -18, 0), V3(0, 0, 0))   // green bounce from below
  const pmrem = new THREE.PMREMGenerator(renderer)
  const t = pmrem.fromScene(env, 0.02).texture
  pmrem.dispose()
  return t
}

/** The beam from the key light: a soft additive cone with faint streaks, and dust drifting in it. */
function lightBeam(r) {
  const target = V3(0, 9, 0), dir = target.clone().sub(LIGHT_POS), len = dir.length() + 6
  dir.normalize()
  const geo = new THREE.CylinderGeometry(0.4, 10, len, 96, 24, true)
  geo.translate(0, -len / 2, 0)
  const u = { uAmt: { value: 1 }, uTime: U.uTime, uLen: { value: len } }
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vL; void main(){
      vL = position; vN = normalize(normalMatrix * normal);
      vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uAmt, uTime, uLen; varying vec3 vN; varying vec3 vV; varying vec3 vL;
      void main(){
        float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);
        float s = -vL.y / uLen;
        float along = smoothstep(0.0, 0.18, s) * (1.0 - smoothstep(0.55, 1.0, s));
        float a = atan(vL.x, vL.z);
        float streak = 0.65 + 0.35 * sin(a * 23.0 + sin(a * 7.0 + uTime * 0.1) * 2.0) * sin(a * 11.0 - uTime * 0.07);
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.86) * f * along * streak * 0.016 * uAmt, 1.0); }`,
  })
  const cone = new THREE.Mesh(geo, mat)
  cone.position.copy(LIGHT_POS)
  cone.quaternion.setFromUnitVectors(V3(0, -1, 0), dir)
  cone.renderOrder = 5; cone.layers.set(1)

  const N = 700, pp = new Float32Array(N * 3), ph = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const s = 0.25 + r() * 0.6, a = r() * Math.PI * 2, rad = Math.sqrt(r()) * (0.4 + 8.2 * s) * 0.85
    const c = LIGHT_POS.clone().addScaledVector(dir, s * len)
    const side = V3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(rad)
    pp.set([c.x + side.x, c.y + side.y * 0.3, c.z + side.z], i * 3); ph[i] = r() * 100
  }
  const dg = new THREE.BufferGeometry()
  dg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); dg.setAttribute('ph', new THREE.BufferAttribute(ph, 1))
  const dust = new THREE.Points(dg, new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uAmt: u.uAmt, uScale: { value: 300 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float ph; uniform float uTime, uScale; varying float vA; void main(){
      vec3 p = position + vec3(sin(uTime * 0.11 + ph) * 0.6, sin(uTime * 0.07 + ph * 1.7) * 0.5, cos(uTime * 0.09 + ph) * 0.6);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = uScale * 0.035 / -mv.z; vA = 0.4 + 0.6 * sin(uTime * 0.8 + ph * 3.0) * 0.5 + 0.3;
      gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uAmt; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5);
      gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * smoothstep(0.5, 0.0, d) * vA * 0.5 * uAmt, 1.0); }`,
  }))
  dust.layers.set(1); dust.renderOrder = 6; dust.frustumCulled = false
  return { cone, dust, u, dustMat: dust.material }
}

// ---------- the viewer ----------
const CAMS = {
  hero: { pos: [21, 8.5, 30], at: [0, 9.3, 0], label: '¾ view' },
  front: { pos: [0, 9, 40], at: [0, 9.2, 0], label: 'Front' },
  low: { pos: [11, 0.9, 23], at: [0, 8.2, 0], label: 'Low angle' },
  brain: { pos: [7, 9.6, 15], at: [0.2, 8.9, 0], label: 'Brain' },
  top: { pos: [5, 31, 24], at: [0, 8.5, 0], label: 'From above' },
  side: { pos: [37, 12, -3], at: [0, 9.5, 0], label: 'Side' },
}
function camPos(c) {
  const k = Math.min(2.2, Math.max(1, 1.25 / (W() / H())))
  const at = V3(...c.at)
  return V3(...c.pos).sub(at).multiplyScalar(k).add(at)
}

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5;
      float ca = dot(d, d) * 0.004;
      vec3 c = vec3(texture2D(tDiffuse, vUv + d * ca * 2.0).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d * ca * 2.0).b);
      float vig = smoothstep(0.95, 0.25, length(d * vec2(uRes.x / uRes.y, 1.0)) * 0.9);
      c *= mix(0.55, 1.0, vig);
      c += (hash(vUv * uRes + fract(uTime) * 100.0) - 0.5) * 0.018;
      gl_FragColor = vec4(c, 1.0); }`,
}

async function main() {
  status('Blowing the glass…')
  await new Promise(r => setTimeout(r, 30))
  const r = rng(1919)
  const canvasEl = $('c')
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: false, preserveDrawingBuffer: q.has('shot') })
  const DPR = Math.min(devicePixelRatio, q.has('dpr') ? +q.get('dpr') : 1.5)
  renderer.setPixelRatio(DPR)
  renderer.setSize(W(), H(), false)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.shadowMap.autoUpdate = false
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(BG, 34, 120)
  scene.environment = studioEnv(renderer)
  scene.environmentIntensity = 0.9

  const camera = new THREE.PerspectiveCamera(36, W() / H(), 0.2, 700)
  camera.layers.enable(1)
  const rtCam = camera.clone()

  // lights: a high soft key from the front left, a cool rim from the right, a whisper of sky
  const key = new THREE.SpotLight('#fff2df', 4.2, 0, 0.33, 0.75, 0)
  key.position.copy(LIGHT_POS); key.target.position.set(0, 7, 0)
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0002; key.shadow.normalBias = 0.03
  key.shadow.camera.near = 20; key.shadow.camera.far = 70; key.shadow.radius = 4
  const rim = new THREE.DirectionalLight('#9ec2ff', 0.55); rim.position.set(24, 9, -14)
  const sky = new THREE.HemisphereLight('#26303a', '#050606', 0.35)
  for (const l of [key, rim, sky]) { l.layers.enableAll(); scene.add(l) }
  scene.add(key.target)

  status('Filling it with water…')
  await new Promise(r => setTimeout(r, 10))
  buildRoom(scene)
  const glass = glassMaterial(r)
  const jar = new THREE.Mesh(new THREE.LatheGeometry(jarProfile(), 256), glass)
  jar.renderOrder = 2
  scene.add(jar)
  // brushed steel lid; it casts no shadow, so the light shafts keep falling into the water
  const lid = new THREE.Mesh(lidGeometry(), underwater(new THREE.MeshStandardMaterial({ color: '#b9bec2', metalness: 1, roughness: 0.42 }), { key: 'lid' }))
  lid.receiveShadow = true
  scene.add(lid)
  await document.fonts.load('700 100px "Stardos Stencil"').catch(() => {})
  await document.fonts.load('40px "Special Elite"').catch(() => {})
  scene.add(lidLabels())
  const water = buildWater()
  scene.add(water.group)

  status('Sculpting the brain…')
  await new Promise(r => setTimeout(r, 10))
  // the head: the brain with both eyes under its frontal lobes, all moving as one
  const head = new THREE.Group()
  const eyes = [eyeGroup('#3f7fd6', 3), eyeGroup('#3f7fd6', 5)]
  eyes.forEach((e, i) => { e.position.set(...HEAD.eyes[i]); e.userData.out = HEAD.out[i] })
  head.add(brainGroup(), ...eyes)
  scene.add(head)
  const bubbles = makeBubbles(r)
  scene.add(bubbles.mesh)
  const beam = lightBeam(r)
  scene.add(beam.cone, beam.dust)

  // render targets: the refraction source (with depth) and the caustics
  const updateCaustics = makeCaustics(renderer)
  const size = new THREE.Vector2()
  renderer.getDrawingBufferSize(size)
  const sceneRT = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(size.x, size.y) })
  water.uni.tScene.value = sceneRT.texture
  water.uni.tDepth.value = sceneRT.depthTexture

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 }))
  composer.setPixelRatio(DPR); composer.setSize(W(), H())
  composer.addPass(new RenderPass(scene, camera))
  composer.addPass(new OutputPass())
  const grade = new ShaderPass(GradeShader)
  composer.addPass(grade)

  const controls = new OrbitControls(camera, canvasEl)
  controls.enableDamping = true; controls.dampingFactor = 0.07
  controls.minDistance = 5; controls.maxDistance = 95
  controls.maxPolarAngle = Math.PI * 0.497
  controls.autoRotateSpeed = 0.45
  const start = CAMS[q.get('cam')] || CAMS.hero
  camera.position.copy(camPos(start)); controls.target.set(...start.at)
  controls.update()

  // ---------- UI ----------
  let fly = null
  const camBtns = {}
  for (const [id, c] of Object.entries(CAMS)) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = c.label
    b.setAttribute('aria-pressed', String(c === start))
    b.onclick = () => {
      fly = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: camPos(c), t1: V3(...c.at) }
      for (const k in camBtns) camBtns[k].setAttribute('aria-pressed', String(k === id))
    }
    camBtns[id] = b; $('cams').append(b)
  }
  controls.addEventListener('start', () => { fly = null; for (const k in camBtns) camBtns[k].setAttribute('aria-pressed', 'false') })
  const opts = { anim: !q.has('still'), spin: q.has('spin'), rays: true }
  const toggle = (id, k, fn) => {
    const b = $(id); const set = () => b.setAttribute('aria-pressed', String(opts[k]))
    set(); b.onclick = () => { opts[k] = !opts[k]; set(); fn && fn() }
  }
  toggle('t-anim', 'anim')
  toggle('t-spin', 'spin', () => { controls.autoRotate = opts.spin })
  toggle('t-rays', 'rays', () => { beam.u.uAmt.value = opts.rays ? 1 : 0; water.uni.uRays.value = opts.rays ? 1 : 0.25 })
  controls.autoRotate = opts.spin
  const collapse = c => { $('panel').classList.toggle('collapsed', c); $('b-panel').setAttribute('aria-expanded', String(!c)) }
  $('b-panel').onclick = () => collapse(!$('panel').classList.contains('collapsed'))
  if (W() < 640) collapse(true) // the scene first on phones
  let wantShot = false
  $('b-shot').onclick = () => { wantShot = true }

  // measurements
  let tris = 0
  scene.traverse(o => { if (o.isMesh) { const g = o.geometry; const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3; tris += n * (o.isInstancedMesh ? o.count : 1) } })
  const box = new THREE.Box3().setFromObject(jar).union(new THREE.Box3().setFromObject(lid))
  $('m-foot').textContent = (box.max.x - box.min.x).toFixed(1) + ' × ' + (box.max.z - box.min.z).toFixed(1) + ' m'
  $('m-height').textContent = box.max.y.toFixed(2) + ' m'
  $('m-jar').textContent = 'Ø ' + (R_OUT * 2).toFixed(1) + ' m, wall ' + ((R_OUT - R_IN) * 100).toFixed(0) + ' cm'
  $('m-water').textContent = (WATER.level - WATER.yb).toFixed(1) + ' m deep, ' + Math.round(Math.PI * WATER.r ** 2 * (WATER.level - WATER.yb)) + ' m³'
  $('m-tris').textContent = Math.round(tris / 1000) + 'k'

  // ---------- animation ----------
  const headBase = V3(...HEAD.base)
  let t = q.has('t') ? +q.get('t') : 0, last = performance.now()
  const animate = dt => {
    U.uTime.value = t
    head.position.set(headBase.x + Math.sin(t * 0.21) * 0.25, headBase.y + Math.sin(t * 0.37) * 0.35, headBase.z + Math.cos(t * 0.17) * 0.22)
    // turned roughly towards the front-right viewer, drifting slowly either way
    head.rotation.set(Math.sin(t * 0.23) * 0.08 - 0.04, 0.55 + Math.sin(t * 0.11) * 0.4, Math.sin(t * 0.29 + 1) * 0.06)
    // both eyes look around together
    const gy = Math.sin(t * 0.31) * 0.28 + Math.sin(t * 0.83) * 0.06, gx = Math.sin(t * 0.23 + 0.7) * 0.14
    for (const e of eyes) e.rotation.set(gx, gy + (e.userData.out || 0), 0)
    bubbles.update(dt, t, head.position)
  }

  const resize = () => {
    camera.aspect = W() / H(); camera.updateProjectionMatrix()
    renderer.setSize(W(), H(), false)
    composer.setSize(W(), H())
    renderer.getDrawingBufferSize(size)
    sceneRT.setSize(size.x, size.y)
    water.uni.uRes.value.copy(size)
    grade.uniforms.uRes.value.copy(size)
    beam.dustMat.uniforms.uScale.value = size.y
  }
  addEventListener('resize', resize)
  resize()

  const step = dt => {
    if (opts.anim) t += dt
    animate(opts.anim ? dt : 0)
    if (fly) {
      fly.t = Math.min(1, fly.t + dt / 1.6); const k = fly.t * fly.t * (3 - 2 * fly.t)
      camera.position.lerpVectors(fly.p0, fly.p1, k); controls.target.lerpVectors(fly.t0, fly.t1, k)
      if (fly.t >= 1) fly = null
    }
    controls.update()
    camera.updateMatrixWorld()
    updateCaustics(t)

    // pass 1: everything except the water into the refraction target
    water.uni.uProjView.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    water.uni.uProjInv.value.copy(camera.projectionMatrixInverse)
    water.uni.uCamWorld.value.copy(camera.matrixWorld)
    rtCam.copy(camera); rtCam.layers.set(0)
    glass.userData.u.uRTPass.value = 1
    renderer.shadowMap.needsUpdate = true
    renderer.setRenderTarget(sceneRT); renderer.render(scene, rtCam); renderer.setRenderTarget(null)
    glass.userData.u.uRTPass.value = 0
    // pass 2: the full scene with the water, then tone mapping and grade
    grade.uniforms.uTime.value = t
    composer.render()
    if (wantShot) {
      wantShot = false
      canvasEl.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'mind-in-a-jar.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000) })
    }
  }
  const frame = () => {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now
    step(dt)
    requestAnimationFrame(frame)
  }
  animate(0)
  requestAnimationFrame(frame)
  // for tests while the page is hidden (no animation frames): __jar.render(cam, t)
  const render = (cam, at) => {
    resize()
    if (cam && CAMS[cam]) { camera.position.copy(camPos(CAMS[cam])); controls.target.set(...CAMS[cam].at) }
    if (at !== undefined) t = at
    for (let i = 0; i < 3; i++) step(0)
  }
  window.__jar = { scene, camera, renderer, controls, U, water, opts, render }
  setTimeout(() => $('loading').classList.add('done'), 250)
}

// the viewer page runs it; the Project 0 builder only borrows the parts
if ($('panel')) main().catch(e => {
  console.error(e)
  $('loading').classList.add('error')
  status('Could not build the diorama: ' + (e.message || e))
})
