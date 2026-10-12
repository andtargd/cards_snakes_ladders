// Builds the diorama for the Project 0 lot's street view and writes it into build/: three levels of detail,
// lot.json, the vertex shader that rocks the ladder and the coiled snake (sway.glsl) and the lot script that
// plays everything else (build.js): the head, tongue and pupils, the spinning and the flying die, the pink
// friend breathing. The diorama is turned half round in the lot (its front faces -z, towards the street).
// Open diorama/p0.html on the local dev server; ?save=0 only reports.
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import * as G from '../experience/board3d.js'
import * as P from '../experience/paper.js'
import { buildDiorama, LOT, PERIOD, SKIN_V } from './diorama.js'

const q = new URLSearchParams(location.search)
const out = document.getElementById('out')
const say = (...a) => { out.textContent += a.join(' ') + '\n' }

const TOP = ['head', 'dieA', 'dieB', 'friend']
const ANIM = [...TOP, 'eyeL', 'eyeR', 'pupilL', 'pupilR', 'tongue']
const LADDER_V = 0.94 // the ladder's place in the snake texture's white band

function prepare(detail) {
  const d = buildDiorama({ detail })
  d.rest()
  const wrap = new THREE.Group()
  wrap.rotation.y = Math.PI
  wrap.add(d.root)
  wrap.updateMatrixWorld(true)
  return { d, wrap }
}
const under = (o, name) => { for (let p = o; p; p = p.parent) if (p.name === name) return true; return false }

// ---------- the print atlas: card faces, the card back, START, the arrow sign, the dice ----------
function printAtlas(wrap, size) {
  const maps = []
  wrap.traverse(o => {
    if (!o.isMesh) return
    for (const m of [].concat(o.material)) if (m.map?.userData.role === 'print' && !maps.includes(m.map)) maps.push(m.map)
  })
  const { c, g } = P.canvas(size, size)
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, size, size)
  const k = size / 1024, rects = new Map()
  let card = 0
  for (const t of maps) {
    const { width: w, height: h } = t.image
    let r
    if (w === 512 && h === 716) { r = [(card % 4) * 256, Math.floor(card / 4) * 358, 256, 358]; card++ }
    else if (w === 256 && h === 256) r = [768, 358, 256, 256]
    else if (w === 768 && h === 604) r = [0, 716, 392, 308]
    else if (w === 768 && h === 512) r = [392, 716, 462, 308]
    else throw new Error(`no room in the atlas for a ${w}x${h} picture`)
    if (card > 7) throw new Error('too many cards for the atlas')
    r = r.map(v => v * k)
    g.drawImage(t.image, r[0], r[1], r[2], r[3])
    rects.set(t, r)
  }
  return { canvas: c, rects, size }
}

// ---------- gathering the parts into one mesh per (moving part, material) ----------
function slice(geo, start, count) {
  const g = new THREE.BufferGeometry()
  for (const name of ['position', 'normal', 'uv']) {
    const a = geo.attributes[name]
    if (!a) continue
    g.setAttribute(name, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize))
  }
  if (!g.attributes.normal) g.computeVertexNormals()
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2))
  return g
}
function paint(g, color) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { a[i * 3] = color.r; a[i * 3 + 1] = color.g; a[i * 3 + 2] = color.b }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3))
  return g
}
function flatUV(g, u, v) { const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, u, v); return g }

/**
 * Collects the scene into buckets. lod 0 keeps the moving parts as their own nodes and four materials
 * (Paper, Board, Cards, Snake); lod 1 is static with two (Paper, Cards).
 */
function collect(wrap, lod, atlas) {
  const frames = new Map()
  if (lod === 0) wrap.traverse(o => {
    if (!ANIM.includes(o.name)) return
    let par = o.parent
    while (par && !ANIM.includes(par.name)) par = par.parent
    const L = par ? o.matrix.clone() : o.matrixWorld.clone()
    if (o.name.startsWith('pupil')) { // the pupil's flattening goes into its shape; the node only moves
      const p = new THREE.Vector3(), r = new THREE.Quaternion(), s = new THREE.Vector3()
      L.decompose(p, r, s); L.compose(p, r, new THREE.Vector3(1, 1, 1))
    }
    const W = par ? frames.get(par.name).W.clone().multiply(L) : L.clone()
    frames.set(o.name, { name: o.name, parent: par?.name, L, W })
  })
  const buckets = new Map()
  const put = (owner, mat, g) => { const key = owner + '|' + mat; if (!buckets.has(key)) buckets.set(key, { owner, mat, geos: [] }); buckets.get(key).geos.push(g) }
  wrap.traverse(o => {
    if (!o.isMesh) return
    let own = o
    while (own && !frames.has(own.name)) own = own.parent
    const owner = own ? own.name : ''
    const M = own ? frames.get(owner).W.clone().invert().multiply(o.matrixWorld) : o.matrixWorld.clone()
    const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry
    const mats = [].concat(o.material)
    const groups = src.groups.length ? src.groups : [{ start: 0, count: src.attributes.position.count, materialIndex: 0 }]
    for (const gr of groups) {
      const m = Array.isArray(o.material) ? mats[gr.materialIndex ?? 0] : o.material // a box keeps six groups for one material
      const role = m.map?.userData.role
      const g = slice(src, gr.start, gr.count)
      g.applyMatrix4(M)
      if (o.name === 'snakeBody') {
        if (lod === 0) put(owner, 'Snake', paint(g, new THREE.Color(1, 1, 1)))
        else put(owner, 'Paper', paint(g, new THREE.Color('#46ad4d')))
      } else if (under(o, 'ladder')) {
        if (lod === 0) put(owner, 'Snake', flatUV(paint(g, m.color), 0.5, LADDER_V))
        else put(owner, 'Paper', paint(g, m.color))
      } else if (role === 'tiles') {
        if (lod === 0) put(owner, 'Board', g)
      } else if (role === 'print') {
        const [x, y, w, h] = atlas.rects.get(m.map), S = atlas.size, a = g.attributes.uv
        for (let i = 0; i < a.count; i++) a.setXY(i, (x + a.getX(i) * w) / S, 1 - (y + (1 - a.getY(i)) * h) / S)
        put(owner, 'Cards', g)
      } else put(owner, 'Paper', paint(g, m.color))
    }
  })
  return { frames, buckets }
}

function materials(lod, atlas, snakeMap) {
  const fibre = P.texture(scaled(P.fibreCanvas(512, 7), lod ? 256 : 512), { repeat: true })
  const mats = {
    Paper: new THREE.MeshStandardMaterial({ name: 'Paper', vertexColors: true, map: fibre, roughness: 0.82 }),
    Cards: new THREE.MeshStandardMaterial({ name: 'Cards', map: P.texture(atlas.canvas), roughness: 0.55 }),
  }
  if (lod === 0) {
    mats.Board = new THREE.MeshStandardMaterial({ name: 'Board', map: P.texture(scaled(boardImage, 1024)), roughness: 0.8 })
    const sm = P.texture(scaled(snakeMap.image, 512), { repeat: true }); sm.flipY = false
    mats.Snake = new THREE.MeshStandardMaterial({ name: 'Snake', vertexColors: true, map: sm, roughness: 0.8 })
  }
  return mats
}
let boardImage = null
function scaled(img, size) {
  if (img.width === size && img.height === size) return img
  const { c, g } = P.canvas(size, size)
  g.drawImage(img, 0, 0, size, size)
  return c
}

function assemble(lod, wrap) {
  let snakeMap = null
  wrap.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) { if (m.map?.userData.role === 'snake') snakeMap = m.map; if (m.map?.userData.role === 'tiles') boardImage = m.map.image } })
  const atlas = printAtlas(wrap, lod ? 512 : 1024)
  const { frames, buckets } = collect(wrap, lod, atlas)
  const mats = materials(lod, atlas, snakeMap)
  const scene = new THREE.Scene()
  const nodes = new Map([['', scene]])
  for (const f of frames.values()) {
    const o = new THREE.Object3D(); o.name = f.name
    f.L.decompose(o.position, o.quaternion, o.scale)
    nodes.get(f.parent || '').add(o)
    nodes.set(f.name, o)
  }
  for (const { owner, mat, geos } of buckets.values()) {
    let g = mergeGeometries(geos)
    if (mat === 'Paper') G.boxUV(g, 0.4)
    if (mat === 'Board' || mat === 'Cards') g.deleteAttribute('color')
    g = mergeVertices(g, 1e-4)
    const m = new THREE.Mesh(g, mats[mat])
    // a moving part's mesh hangs under its node (the script moves the node)
    m.name = (owner || 'static') + '_' + mat.toLowerCase()
    nodes.get(owner).add(m)
  }
  return { scene, frames }
}

// ---------- LOD2: one mesh, one material, about a thousand triangles ----------
function buildLOD2(wrap, facts) {
  const parts = []
  const add = (g, color, m = null) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); if (m) g.applyMatrix4(m); parts.push(paint(g, new THREE.Color(color))) }
  const box = (w, h, d, x, y, z, color) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); add(g, color) }
  const PL = 0.35
  box(LOT.width - 0.04, PL, LOT.depth - 0.04, 0, PL / 2, 0, '#e8dcc4')
  P.TIER_COLORS.forEach((c, t) => { const top = PL + (t + 1) * 0.3; box(10.4, top - PL + 0.08, 1.2, 0, PL + (top - PL + 0.08) / 2, 4.8 - (t + 0.5) * 1.2, new THREE.Color(c).lerp(new THREE.Color('#ffffff'), 0.45)) })
  box(11.88, 11.4, 0.12, 0, PL + 5.7, -9.3, '#f6ecd9')
  box(11.88, 6.0, 0.1, 0, PL + 3.0, -8.75, '#f8d6c0')
  box(11.88, 4.6, 0.1, 0, PL + 2.3, -8.2, '#d3ebd2')
  // the ladder: two rails and its rungs along its own frame
  const F = new THREE.Vector3(...facts.F), n = new THREE.Vector3(...facts.n), X = new THREE.Vector3(...facts.X)
  const d = new THREE.Vector3(...facts.T).sub(F).normalize()
  const frame = new THREE.Matrix4().makeBasis(X, d, n).setPosition(F)
  for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(0.32, facts.L + 0.3, 0.26); g.translate(s * 0.85, (facts.L + 0.3) / 2 - 0.2, 0); add(g, '#a8612c', frame) }
  for (let y = 0.95; y < facts.L - 0.15; y += 1.64) { const g = new THREE.BoxGeometry(1.6, 0.22, 0.15); g.translate(0, y, 0); add(g, '#f6a73a', frame) }
  // the snake: a thin tube through its rings' centres, and its head
  const body = wrap.getObjectByName('snakeBody').geometry.attributes.position
  const centres = []
  for (const i of [...Array(Math.ceil(facts.rings / 4)).keys()].map(k => k * 4).concat(facts.rings - 1)) {
    const c = new THREE.Vector3()
    for (let j = 0; j < facts.ringSize; j++) c.x += body.getX(i * facts.ringSize + j), c.y += body.getY(i * facts.ringSize + j), c.z += body.getZ(i * facts.ringSize + j)
    centres.push(c.multiplyScalar(1 / facts.ringSize))
  }
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(centres), 44, 0.34, 4), '#46ad4d')
  const hp = new THREE.Vector3(...facts.head.p)
  const head = new THREE.IcosahedronGeometry(0.85, 1); head.translate(hp.x, hp.y, hp.z); add(head, '#4ab351')
  // cards, START and dice as flat or boxy stand-ins, at their own places
  wrap.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(wrap.matrixWorld).invert() // parts are made in the diorama's frame, turned below
  wrap.traverse(o => {
    if (!o.isMesh) return
    const m = inv.clone().multiply(o.matrixWorld)
    const role = [].concat(o.material)[0].map?.userData.role
    if (o.geometry.type === 'ShapeGeometry' && role === 'print' && o.position.z > 0) {
      o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox
      const g = new THREE.PlaneGeometry(b.max.x - b.min.x, b.max.y - b.min.y); g.translate((b.max.x + b.min.x) / 2, (b.max.y + b.min.y) / 2, 0)
      const back = g.clone(); back.rotateY(Math.PI)
      add(g, '#eaf2fb', m); add(back, '#2d3a6b', m)
    } else if (o.name === 'dieA' || o.name === 'dieB') {
      add(new THREE.BoxGeometry(1.75, 1.75, 1.75), '#fbfaf6', m)
    } else if (o.geometry.type === 'LatheGeometry') {
      const g = new THREE.ConeGeometry(0.17, 0.46, 6); g.translate(0, 0.23, 0); add(g, '#' + [].concat(o.material)[0].color.getHexString(), m)
    }
  })
  const st = new THREE.BoxGeometry(2.8, 0.16, 2.2); st.translate(3.55, PL + 0.08, 7.3); add(st, '#fbf1d8')
  const fr = wrap.getObjectByName('friend'); const fp = new THREE.Vector3().setFromMatrixPosition(inv.clone().multiply(fr.matrixWorld))
  const blob = new THREE.IcosahedronGeometry(0.6, 1); blob.translate(fp.x, fp.y + 0.6, fp.z); add(blob, '#f7a6c8')
  let g = mergeGeometries(parts)
  g.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI))
  g = mergeVertices(g, 1e-4)
  g.computeVertexNormals()
  const scene = new THREE.Scene()
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ name: 'Far', vertexColors: true, roughness: 0.85 }))
  mesh.name = 'far'
  scene.add(mesh)
  return scene
}

// ---------- the shader and the script ----------
const f3 = a => `vec3(${a.map(v => v.toFixed(5)).join(', ')})`
function swayShader(facts) {
  return `// sway.glsl: the giant ladder rocks on its foot and the coiled snake rocks with it; its neck waves.
// Positions come in the lot's metres; the diorama is turned half round in the lot, so the maths runs in the
// diorama's own frame (x and z flipped). The ladder sits in the snake texture's white band (v > 0.9).
const vec3 FOOT = ${f3(facts.F)};
const vec3 FACE = ${f3(facts.n)};
const vec3 ACROSS = ${f3(facts.X)};
const float PERIOD = ${PERIOD.toFixed(4)};
const float BODY = ${facts.snakeLength.toFixed(4)};
const float NECK = ${facts.tExit.toFixed(4)};
vec3 turnAround(vec3 v, vec3 k, float a) {
  float c = cos(a), s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}
vec3 p0Vertex(vec3 position, vec3 normal, vec2 uv) {
  float t = p0Time;
  vec3 p = vec3(-position.x, position.y, -position.z);
  float a1 = sin(t * 0.8) * 0.02 + sin(t * 1.9) * 0.004;
  float a2 = sin(t * 0.55) * 0.02;
  vec3 rocked = FOOT + turnAround(turnAround(p - FOOT, ACROSS, a2), FACE, a1);
  float ladder = step(0.9, uv.y);
  float follow = max(ladder, smoothstep(1.0, 3.6, p.y));
  float along = uv.x * PERIOD / BODY;
  float neck = (1.0 - ladder) * pow(clamp((along - NECK) / (1.0 - NECK), 0.0, 1.0), 1.6);
  vec3 wave = vec3(sin(t * 0.9) * 0.32, sin(t * 1.3) * 0.1, sin(t * 0.65) * 0.22);
  vec3 r = mix(p, rocked, follow) + wave * neck;
  return vec3(-r.x, r.y, -r.z);
}
`
}
function scriptSource(facts, scene) {
  const r4 = a => a.map(v => Math.round(v * 1e4) / 1e4)
  const node = name => scene.getObjectByName(name)
  const lotP = name => r4(node(name).position.toArray())
  const lotQ = name => r4(node(name).quaternion.toArray())
  return `// Street view of the Snakes & Ladders diorama: the snake's head sways and bobs on its waving neck, the
// tongue flicks, the googly pupils roll, one die spins on its edge, the other turns in the air and the pink
// friend breathes. The ladder and the snake's body rock in sway.glsl on the same clock.
// The diorama is turned half round in the lot: the maths runs in its own frame, turned at the end.
const FOOT = ${JSON.stringify(r4(facts.F))}
const FACE = ${JSON.stringify(r4(facts.n))}
const ACROSS = ${JSON.stringify(r4(facts.X))}
const HEAD_P = ${JSON.stringify(r4(facts.head.p))}
const HEAD_Q = ${JSON.stringify(r4(facts.head.q))}
const PUPILS = ${JSON.stringify(facts.head.pupils.map(r4))}
const TONGUE_P = ${JSON.stringify(lotP('tongue'))}
const DIE_A_P = ${JSON.stringify(lotP('dieA'))}
const DIE_A_Q = ${JSON.stringify(r4(facts.dieA))}
const DIE_B_P = ${JSON.stringify(lotP('dieB'))}
const DIE_B_E = ${JSON.stringify(r4(facts.dieB))}
const FRIEND_P = ${JSON.stringify(lotP('friend'))}
const FRIEND_Q = ${JSON.stringify(lotQ('friend'))}
const HALF = [0, 1, 0, 0] // half a turn round the vertical: the diorama in the lot

const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
]
const qaxis = (k, a) => { const s = Math.sin(a / 2); return [k[0] * s, k[1] * s, k[2] * s, Math.cos(a / 2)] }
// XYZ Euler angles to a quaternion and back, as three.js does them
function qeuler(x, y, z) {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2), s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2)
  return [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3]
}
function euler(q) {
  const [x, y, z, w] = q
  const m11 = 1 - 2 * (y * y + z * z), m12 = 2 * (x * y - z * w), m13 = 2 * (x * z + y * w)
  const m22 = 1 - 2 * (x * x + z * z), m23 = 2 * (y * z - x * w), m32 = 2 * (y * z + x * w), m33 = 1 - 2 * (x * x + y * y)
  const ey = Math.asin(Math.max(-1, Math.min(1, m13)))
  return Math.abs(m13) < 0.9999999 ? [Math.atan2(-m23, m33), ey, Math.atan2(-m12, m11)] : [Math.atan2(m32, m22), ey, 0]
}
function rotate(q, v) {
  const [x, y, z, w] = q
  const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2]
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x]
}
const toLot = p => [-p[0], p[1], -p[2]]

export default function build(b) {
  b.loop((dt, t) => {
    // the ladder's rock (the same as in sway.glsl), carried by the head on top of the neck's wave
    const qs = qmul(qaxis(FACE, Math.sin(t * 0.8) * 0.02 + Math.sin(t * 1.9) * 0.004), qaxis(ACROSS, Math.sin(t * 0.55) * 0.02))
    const wave = [Math.sin(t * 0.9) * 0.32, Math.sin(t * 1.3) * 0.1, Math.sin(t * 0.65) * 0.22]
    const look = qeuler(Math.sin(t * 1.1) * 0.05, Math.sin(t * 0.7) * 0.12, Math.sin(t * 0.9) * 0.06)
    const hq = qmul(qmul(qs, HEAD_Q), look)
    const r = rotate(qs, [HEAD_P[0] - FOOT[0], HEAD_P[1] - FOOT[1], HEAD_P[2] - FOOT[2]])
    const hp = [FOOT[0] + r[0] + wave[0], FOOT[1] + r[1] + wave[1] + Math.sin(t * 1.4) * 0.05, FOOT[2] + r[2] + wave[2]]
    b.node('head', { position: toLot(hp), rotation: euler(qmul(HALF, hq)), scale: [1.2, 1.2, 1.2] })
    const flick = Math.max(0, Math.sin(t * 2.2)) ** 6
    b.node('tongue', { position: TONGUE_P, rotation: [Math.sin(t * 30) * 0.12 * flick, 0, 0], scale: [1, 1, 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.6))] })
    PUPILS.forEach((p, i) => {
      const sx = i ? 1 : -1
      b.node(i ? 'pupilR' : 'pupilL', { position: [p[0] + Math.sin(t * 2.3 + sx) * 0.035, p[1] + Math.cos(t * 1.9 + sx * 2) * 0.03, p[2]] })
    })
    // one die spins on its edge round the upright, the other turns slowly in the air
    b.node('dieA', { position: DIE_A_P, rotation: euler(qmul(HALF, qmul(qaxis([0, 1, 0], t * 1.1), DIE_A_Q))) })
    b.node('dieB', { position: [DIE_B_P[0], DIE_B_P[1] + Math.sin(t * 1.3) * 0.08, DIE_B_P[2]], rotation: euler(qmul(HALF, qeuler(DIE_B_E[0] + t * 0.35, DIE_B_E[1] + t * 0.22, DIE_B_E[2] + t * 0.15))) })
    const s = 1 + Math.sin(t * 2.4) * 0.025
    b.node('friend', { position: FRIEND_P, rotation: euler(FRIEND_Q), scale: [1 / Math.sqrt(s), s, 1 / Math.sqrt(s)] })
  })
}
`
}

// ---------- checks and export ----------
function stats(scene) {
  let tris = 0, prims = 0
  const mats = new Set(), texs = new Set()
  scene.traverse(o => {
    if (!o.isMesh) return
    prims++; mats.add(o.material.name)
    if (o.material.map) texs.add(o.material.map)
    tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3
  })
  scene.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(scene)
  const sizes = [...texs].map(t => t.image.width).join('/')
  return { tris: Math.round(tris), prims, mats: [...mats], text: `${Math.round(tris)} triangles, ${prims} primitives, materials ${[...mats].join('/')}, textures ${sizes}, box x ${box.min.x.toFixed(2)}..${box.max.x.toFixed(2)} y ${box.min.y.toFixed(2)}..${box.max.y.toFixed(2)} z ${box.min.z.toFixed(2)}..${box.max.z.toFixed(2)}` }
}
async function glb(scene) { return await new GLTFExporter().parseAsync(scene, { binary: true }) }
async function save(path, data, type = 'application/octet-stream') {
  const res = await fetch('/save/' + path, { method: 'POST', body: data, headers: { 'content-type': type } })
  if (!res.ok) throw new Error('save failed ' + path)
}

async function main() {
  await Promise.race([Promise.all(['italic 900 80px Nunito', '800 16px Nunito'].map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 4000))])
  const detail0 = +(q.get('d0') || 0.62), detail1 = +(q.get('d1') || 0.12)
  const a = prepare(detail0)
  const lod0 = assemble(0, a.wrap)
  const facts = a.d.facts
  const b = prepare(detail1)
  const lod1 = assemble(1, b.wrap)
  const lod2 = buildLOD2(b.wrap, b.d.facts)
  const s0 = stats(lod0.scene), s1 = stats(lod1.scene), s2 = stats(lod2)
  say('LOD0', s0.text); say('LOD1', s1.text); say('LOD2', s2.text)
  const nodes = []; lod0.scene.traverse(o => { if (o.name && !o.isMesh) nodes.push(o.name) })
  say('nodes', nodes.join(', '))
  window.result = { s0, s1, s2, facts, lod0, lod1, lod2 }
  if (q.get('save') !== '0') {
    const b0 = await glb(lod0.scene), b1 = await glb(lod1.scene), b2 = await glb(lod2)
    await save('build/lod0.glb', b0); await save('build/lod1.glb', b1); await save('build/lod2.glb', b2)
    await save('build/sway.glsl', swayShader(facts), 'text/plain')
    await save('build/build.js', scriptSource(facts, lod0.scene), 'text/javascript')
    const lot = { script: 'build.js', materials: { Snake: { vertex: 'sway.glsl', glow: 0 }, Paper: { glow: 0 }, Board: { glow: 0 }, Cards: { glow: 0 } } }
    await save('build/lot.json', JSON.stringify(lot, null, 2), 'application/json')
    say('saved build/: lod0', (b0.byteLength / 1e6).toFixed(2), 'MB, lod1', (b1.byteLength / 1e6).toFixed(2), 'MB, lod2', (b2.byteLength / 1e6).toFixed(3), 'MB, sway.glsl, build.js, lot.json')
  }
  // a preview of a level: ?view=0|1|2
  const view = [lod0.scene, lod1.scene, lod2][+(q.get('view') || 0)]
  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, preserveDrawingBuffer: true })
  renderer.setSize(960, 540, false)
  view.add(new THREE.HemisphereLight(0xffffff, 0x9a9a96, 2.2))
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(8, 14, -10); view.add(sun)
  view.background = new THREE.Color('#f4f4f2')
  const cam = new THREE.PerspectiveCamera(40, 960 / 540, 0.1, 500)
  cam.position.set(-12, 12, -28); cam.lookAt(0, 5, 0) // the street side: the diorama's front faces -z
  renderer.render(view, cam)
  say('done')
  window.done = true
}
main().catch(e => { say('ERROR', e.stack || e); window.done = true })
