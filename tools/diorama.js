// Builds the lot's street view (three GLB levels of detail plus lot.json and its script) from the
// game's own board code: the paper amphitheatre with a fixed board, snakes, ladders, card markers,
// giant dice, pawns, a fan of giant cards from the deck and the title. Open tools/diorama.html on
// the local server; the files are written into build/.
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import * as R from '../experience/rules.js'
import * as P from '../experience/paper.js'
import * as G from '../experience/board3d.js'

const LOT = { width: 12, depth: 19, height: 12 }
const out = document.getElementById('out')
const say = (...a) => { out.textContent += a.join(' ') + '\n' }

// ---------- the fixed board: a tidy seed (shorter cut-outs read better from the street) ----------
function pickSeed() {
  // fewest crossings between cut-outs, no very long ones
  const seg = e => { const a = G.cellPos(e[1]), b = G.cellPos(e[2]); return [a.x, a.z, b.x, b.z] }
  const cross = (p, q) => {
    const d = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    const d1 = d(...p, q[0], q[1]), d2 = d(...p, q[2], q[3]), d3 = d(q[0], q[1], q[2], q[3], p[0], p[1]), d4 = d(q[0], q[1], q[2], q[3], p[2], p[3])
    return d1 * d2 < 0 && d3 * d4 < 0
  }
  let best = null
  for (let seed = 1; seed <= 1500; seed++) {
    const els = R.generateBoard(seed)
    const segs = els.map(seg)
    let n = 0
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) if (cross(segs[i], segs[j])) n++
    const score = n * 10 + els.reduce((a, e) => a + Math.max(0, Math.abs(e[1] - e[2]) - 28), 0) * 0.6
    if (!best || score < best.score) best = { seed, score, els, n }
  }
  return best
}
const { seed: SEED, els: ELS, n: CROSSINGS } = pickSeed()
const state0 = { n: 100, base: ELS, mods: [], quake: null, mk: [] }
const free = R.freeCells(state0)
const near = want => free.reduce((a, c) => (Math.abs(c - want) < Math.abs(a - want) ? c : a), free[0])
const MARKERS = [{ k: 'sw', c: [near(34)] }, { k: 'tr', c: [near(58)] }, { k: 'po', c: [near(23), near(76)] }]

// ---------- a scripted game for the street view (rolls, snakes, ladders, the markers) ----------
function simulate(seed) {
  const r = R.mulberry32(seed)
  const pos = [0, 0, 0, 0], turns = []
  const at = (c, k) => MARKERS.find(m => m.k === k && m.c.includes(c))
  for (let p = 0; turns.length < 300; p = (p + 1) % 4) {
    const v = 1 + Math.floor(r() * 6)
    const path = []
    let c = pos[p], stop = false
    for (let k = 0; k < v; k++) {
      c++
      path.push(Math.min(c, 100))
      if (c >= 100) break
      if (at(c, 'sw')) { stop = true; break }
    }
    let final = Math.min(c, 100), slide = null
    if (!stop && final < 100) {
      const ei = ELS.findIndex(e => e[1] === final)
      if (ei >= 0) { slide = { k: ELS[ei][0] ? 'L' : 'S', el: ei, to: ELS[ei][2] }; final = slide.to }
      else if (at(final, 'tr')) { slide = { k: 'T', to: Math.min(100, final + 3) }; final = slide.to }
      else { const m = at(final, 'po'); if (m) { slide = { k: 'P', to: m.c[0] === final ? m.c[1] : m.c[0] }; final = slide.to } }
    }
    turns.push({ p, v, path, slide })
    pos[p] = final
    if (final >= 100) break
  }
  return turns
}
function pickGame() {
  for (let s = 1; s < 5000; s++) {
    const t = simulate(s)
    const slides = t.filter(x => x.slide).length
    const snakes = t.filter(x => x.slide?.k === 'S').length
    if (t.length >= 70 && t.length <= 110 && slides >= 14 && snakes >= 5 && t[t.length - 1].path.at(-1) >= 100) return { seed: s, turns: t }
  }
  throw new Error('no game')
}

// ---------- textures ----------
const FAN = ['M1', 'B3', 'D4', 'P3', 'B5']
const FLOAT = 'B6'
const CARD_CELLS = [...FAN, FLOAT, 'back'] // 4 per row of 256 x 358
function cardsAtlas(size = 1024) {
  const { c, g } = P.canvas(size, size)
  const k = size / 1024
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, size, size)
  CARD_CELLS.forEach((id, i) => {
    const x = (i % 4) * 256 * k, y = Math.floor(i / 4) * 358 * k
    if (id === 'back') P.drawCardBack(g, 256 * k, 358 * k, x, y); else P.drawCard(g, id, 256 * k, 358 * k, x, y)
  })
  // the title banner
  const by = 716 * k, bh = 308 * k
  g.fillStyle = '#2d3a6b'; g.fillRect(0, by, size, bh)
  g.save(); g.beginPath(); g.rect(0, by, size, bh); g.clip()
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 14 * k
  for (let i = -bh; i < size + bh; i += 40 * k) { g.beginPath(); g.moveTo(i, by); g.lineTo(i - bh, by + bh); g.stroke() }
  g.restore()
  g.strokeStyle = '#f2c14e'; g.lineWidth = 6 * k; g.strokeRect(14 * k, by + 14 * k, size - 28 * k, bh - 28 * k)
  g.textAlign = 'center'; g.textBaseline = 'middle'
  const line = (t, y, px, cols) => { g.font = `bold ${px * k}px ${P.FONT}`; cols.forEach((col, i) => { g.fillStyle = col; const o = (cols.length - 1 - i) * 4 * k; g.fillText(t, size / 2 + o, y + o) }) }
  line('CARDS,', by + 92 * k, 84, ['#1b2449', '#f2c14e', '#ffffff'])
  line('SNAKES & LADDERS', by + 205 * k, 92, ['#1b2449', '#e8743b', '#ffffff'])
  return c
}
const cardUV = i => {
  const x = (i % 4) * 256, y = Math.floor(i / 4) * 358
  return [x / 1024, 1 - (y + 358) / 1024, (x + 256) / 1024, 1 - y / 1024]
}
const WHITE_UV = [900 / 1024, 1 - 500 / 1024]
const BANNER_UV = [0, 1 - 1024 / 1024, 1, 1 - 716 / 1024]
function plasticAtlas() {
  const { c, g } = P.canvas(512, 512)
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 512, 512)
  g.drawImage(P.diceCanvas(128), 0, 0)
  return c
}
const tex = (c, opts) => P.texture(c, opts)

// ---------- geometry helpers ----------
function setColor(geo, hex) {
  const c = new THREE.Color(hex)
  const n = geo.attributes.position.count
  const a = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3))
  return geo
}
function setUV(geo, u, v) {
  const n = geo.attributes.position.count
  const a = new Float32Array(n * 2)
  for (let i = 0; i < n; i++) { a[i * 2] = u; a[i * 2 + 1] = v }
  geo.setAttribute('uv', new THREE.BufferAttribute(a, 2))
  return geo
}
const clean = g => { const x = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) x.deleteAttribute(k); return x }
const merge = list => mergeGeometries(list.map(clean))

/** A card as a thin slab: face on +z, the back on -z, white edges. */
function cardGeometry(w, h, t, faceIndex, backIndex = 6) {
  const pos = [], uv = [], col = []
  const quad = (a, b, c, d, uvs) => {
    for (const [p, q] of [[a, uvs[0]], [b, uvs[1]], [c, uvs[2]], [a, uvs[0]], [c, uvs[2]], [d, uvs[3]]]) { pos.push(...p); uv.push(...q); col.push(1, 1, 1) }
  }
  const x = w / 2, y = h / 2, z = t / 2
  const [u0, v0, u1, v1] = cardUV(faceIndex), [b0, c0, b1, c1] = cardUV(backIndex)
  quad([-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]])
  quad([x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z], [[b0, c0], [b1, c0], [b1, c1], [b0, c1]])
  const W = [WHITE_UV, WHITE_UV, WHITE_UV, WHITE_UV]
  quad([-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z], W)
  quad([x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z], W)
  quad([-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z], W)
  quad([-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], W)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.computeVertexNormals()
  return g
}
function bannerGeometry(x0, x1, y0, y1, z, facing) {
  // facing: +1 faces +z, -1 faces -z
  const [u0, v0, u1, v1] = BANNER_UV
  const g = new THREE.BufferGeometry()
  const p = facing > 0
    ? [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]]
    : [[x1, y0, z], [x0, y0, z], [x0, y1, z], [x1, y1, z]]
  const uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]
  const pos = [], uv = [], col = []
  for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...p[i]); uv.push(...uvs[i]); col.push(1, 1, 1) }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.computeVertexNormals()
  return g
}

// the fan stands behind the board leaning back a little, like cards propped up (inside the lot's 9.5 m)
const FAN_PIVOT = new THREE.Vector3(0, 4.2, -7.6)
const FAN_TILT = -0.22, FAN_SPREAD = 0.27
const FAN_CARD = { w: 3.3, h: 4.62, t: 0.06, r: 3.9 }
function fanGeometry(lodIndexMap = null) {
  const parts = FAN.map((id, i) => {
    const a = (i - 2) * FAN_SPREAD
    const g = cardGeometry(FAN_CARD.w, FAN_CARD.h, FAN_CARD.t, CARD_CELLS.indexOf(id))
    g.translate(0, FAN_CARD.r, (i - 2) * -0.06)
    g.rotateZ(-a)
    g.rotateX(FAN_TILT)
    return g
  })
  void lodIndexMap
  return merge(parts)
}
const FLOAT_AT = new THREE.Vector3(0, 7.2, -1.2)
const SIGN = { x0: -3.55, x1: 0.35, z: 8.75 }

function titleGeometry() {
  const back = bannerGeometry(-4.6, 4.6, 0.3, 2.6, B_BACK() - 0.01, -1)
  // a low sign on the front edge, leaning back
  const front = bannerGeometry(SIGN.x0, SIGN.x1, 0, 1.22, 0, 1)
  front.rotateX(-0.5)
  front.translate(0, G.B.base + 0.04, SIGN.z)
  return merge([back, front])
}
const B_BACK = () => G.B.zFront - 10 * G.B.tierD

function pawnPlastic(color, segs = 20) {
  const g = segs === 20 ? G.pawnGeometry() : lowPawn()
  setUV(g, WHITE_UV[0], WHITE_UV[1])
  setColor(g, color)
  g.scale(1.25, 1.25, 1.25)
  return g
}
function lowPawn() {
  const pts = [[0, 0], [0.17, 0], [0.16, 0.06], [0.085, 0.2], [0.065, 0.3], [0.1, 0.33], [0.05, 0.36], [0, 0.36]].map(([x, y]) => new THREE.Vector2(x, y))
  const body = new THREE.LatheGeometry(pts, 8)
  const head = new THREE.SphereGeometry(0.1, 8, 6); head.translate(0, 0.44, 0)
  const g = merge([body, head]); g.deleteAttribute('uv'); g.computeVertexNormals()
  return g
}
const PAWN_COLORS = P.PLAYER_COLORS.slice(0, 4)
const DIE = 0.9
const DIE_REST = [new THREE.Vector3(G.B.dice.x - 0.75, G.B.base + 0.045 + DIE / 2, G.B.dice.z - 0.05), new THREE.Vector3(G.B.dice.x + 0.85, G.B.base + 0.045 + DIE / 2, G.B.dice.z + 0.25)]
const SLOT = [[-0.22, -0.24], [0.22, -0.24], [-0.22, 0.24], [0.22, 0.24]]

// ---------- LOD0 ----------
function buildLOD0() {
  const fibre = tex(P.fibreCanvas(512), { repeat: true })
  const mats = {
    Paper: new THREE.MeshStandardMaterial({ name: 'Paper', vertexColors: true, map: fibre, roughness: 0.92 }),
    Numbers: new THREE.MeshStandardMaterial({ name: 'Numbers', vertexColors: true, map: tex(P.atlasCanvas(1024)), roughness: 0.9 }),
    Cards: new THREE.MeshStandardMaterial({ name: 'Cards', vertexColors: true, map: tex(cardsAtlas(1024)), roughness: 0.7 }),
    Plastic: new THREE.MeshStandardMaterial({ name: 'Plastic', vertexColors: true, map: tex(plasticAtlas()), roughness: 0.35 }),
  }
  const scene = new THREE.Scene()
  const add = (name, geo, mat, pos = null) => { const m = new THREE.Mesh(geo, mat); m.name = name; if (pos) m.position.copy(pos); scene.add(m); return m }
  // the paper: table, tiers, pads, every snake and ladder, the markers
  const paper = [G.buildTiers({ lot: LOT })]
  const ups = G.stackElements(ELS), cols = G.snakeColors(ELS)
  ELS.forEach((e, i) => paper.push(G.boxUV(G.elementGeometry(e, i, { up: ups[i], color: cols[i] }), 0.32)))
  let portal = 0
  for (const m of MARKERS) for (const c of m.c) paper.push(G.boxUV(G.markerGeometry(m.k, c, m.k === 'po' ? portal : 0), 0.32))
  paper.push(G.boxUV(G.tierArrowsGeometry(), 0.32))
  add('board', merge(paper), mats.Paper)
  add('cells', G.buildTiles(), mats.Numbers)
  add('title', titleGeometry(), mats.Cards)
  const fan = add('fan', fanGeometry(), mats.Cards, FAN_PIVOT)
  void fan
  add('card', cardGeometry(2.1, 2.94, 0.05, CARD_CELLS.indexOf(FLOAT)), mats.Cards, FLOAT_AT)
  // dice
  DIE_REST.forEach((p, i) => {
    const g = setColor(G.dieGeometry(DIE), '#ffffff')
    const m = add('die' + i, g, mats.Plastic, p)
    m.quaternion.copy(P.dieQuaternion(i ? 6 : 5, 0.5 + i * 0.7))
  })
  // the remapped die atlas is 3 x 2 cells of 128 in a 512 texture: scale the UVs into its corner
  for (const name of ['die0', 'die1']) {
    const uv = scene.getObjectByName(name).geometry.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 384 / 512, 1 - (1 - uv.getY(i)) * 256 / 512)
  }
  // pawns on the start pad
  PAWN_COLORS.forEach((c, i) => add('pawn' + i, pawnPlastic(c), mats.Plastic, startPos(i)))
  return { scene, mats }
}
function startPos(i) { return new THREE.Vector3(G.B.start.x + SLOT[i][0] * 1.6, G.B.base + 0.045, G.B.start.z - 0.12 + SLOT[i][1] * 1.4) }

// ---------- LOD1: the same, static, two materials ----------
function buildLOD1() {
  const atlas = tex(P.atlasCanvas(512))
  const mats = {
    Paper: new THREE.MeshStandardMaterial({ name: 'Paper', vertexColors: true, map: atlas, roughness: 0.9 }),
    Cards: new THREE.MeshStandardMaterial({ name: 'Cards', vertexColors: true, map: tex(cardsAtlas(512)), roughness: 0.7 }),
  }
  const blank = [(P.ATLAS.blank[0] + P.ATLAS.blank[2]) / 2, 1 - (P.ATLAS.blank[1] + P.ATLAS.blank[3]) / 2]
  const parts = []
  parts.push(setUV(G.buildTiers({ lot: LOT }), ...blank))
  parts.push(setUV(G.tierArrowsGeometry({ lod: 1 }), ...blank))
  // only the cells' tops
  const tiles = G.buildTiles()
  const p = tiles.attributes.position, keep = []
  for (let t = 0; t < p.count; t += 3) {
    const ys = [p.getY(t), p.getY(t + 1), p.getY(t + 2)]
    if (ys[0] === ys[1] && ys[1] === ys[2]) keep.push(t)
  }
  const tops = new THREE.BufferGeometry()
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const a = tiles.attributes[name], n = a.itemSize, arr = new Float32Array(keep.length * 3 * n)
    keep.forEach((t, k) => { for (let j = 0; j < 3 * n; j++) arr[k * 3 * n + j] = a.array[t * n + j] })
    tops.setAttribute(name, new THREE.BufferAttribute(arr, n))
  }
  parts.push(tops)
  const ups = G.stackElements(ELS), cols = G.snakeColors(ELS)
  ELS.forEach((e, i) => parts.push(setUV(G.elementGeometry(e, i, { lod: 1, up: ups[i], color: cols[i] }), ...blank)))
  let portal = 0
  for (const m of MARKERS) for (const c of m.c) parts.push(setUV(G.markerGeometry(m.k, c, m.k === 'po' ? portal : 0), ...blank))
  DIE_REST.forEach((pos, i) => {
    const g = setUV(setColor(new THREE.BoxGeometry(DIE, DIE, DIE), '#fbfaf6'), ...blank)
    g.applyQuaternion(P.dieQuaternion(i ? 6 : 5, 0.5 + i * 0.7)); g.translate(pos.x, pos.y, pos.z)
    parts.push(g)
  })
  PAWN_COLORS.forEach((c, i) => { const g = setUV(pawnPlastic(c, 8), ...blank); const s = startPos(i); g.translate(s.x, s.y, s.z); parts.push(g) })
  const scene = new THREE.Scene()
  const board = new THREE.Mesh(merge(parts), mats.Paper); board.name = 'board'; scene.add(board)
  const fan = fanGeometry(); fan.translate(FAN_PIVOT.x, FAN_PIVOT.y, FAN_PIVOT.z)
  const card = cardGeometry(2.1, 2.94, 0.05, CARD_CELLS.indexOf(FLOAT)); card.translate(FLOAT_AT.x, FLOAT_AT.y, FLOAT_AT.z)
  const cards = new THREE.Mesh(merge([fan, card, titleGeometry()]), mats.Cards); cards.name = 'cards'; scene.add(cards)
  return { scene, mats }
}

// ---------- LOD2: one mesh, one 256 px texture ----------
function buildLOD2(renderer, lod1) {
  const S = 256, TOPW = 160
  const { c, g } = P.canvas(S, S)
  g.fillStyle = '#e9e2d4'; g.fillRect(0, 0, S, S)
  // the board seen from above, baked from LOD1
  const hw = LOT.width / 2 - 0.25, hd = LOT.depth / 2 - 0.25
  const cam = new THREE.OrthographicCamera(-hw, hw, hd, -hd, 0.1, 50)
  cam.position.set(0, 20, 0); cam.lookAt(0, 0, 0)
  cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0)
  const rt = new THREE.WebGLRenderTarget(TOPW, S)
  const sc = new THREE.Scene()
  sc.add(new THREE.HemisphereLight(0xffffff, 0x9a9a96, 2.2))
  const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(-3, 10, -4); sc.add(sun)
  sc.add(lod1.scene.getObjectByName('board').clone())
  renderer.setRenderTarget(rt); renderer.render(sc, cam); renderer.setRenderTarget(null)
  const px = new Uint8Array(TOPW * S * 4)
  renderer.readRenderTargetPixels(rt, 0, 0, TOPW, S, px)
  const img = g.createImageData(TOPW, S)
  for (let y = 0; y < S; y++) for (let x = 0; x < TOPW; x++) {
    const i = ((S - 1 - y) * TOPW + x) * 4, o = (y * TOPW + x) * 4
    img.data[o] = px[i]; img.data[o + 1] = px[i + 1]; img.data[o + 2] = px[i + 2]; img.data[o + 3] = 255
  }
  g.putImageData(img, 0, 0)
  // swatches: tier colours (sides), the table, the card back
  P.TIER_COLORS.forEach((col, i) => { g.fillStyle = new THREE.Color(col).multiplyScalar(0.82).getStyle(); g.fillRect(TOPW + 4, 4 + i * 10, 20, 8) })
  g.fillStyle = '#cfc6b6'; g.fillRect(TOPW + 28, 4, 20, 8)
  // tiny cards and the banner
  const cw = 40, ch = 56
  ;[...FAN, FLOAT].forEach((id, i) => P.drawCard(g, id, cw, ch, TOPW + 4 + (i % 2) * (cw + 4), 110 + Math.floor(i / 2) * (ch + 2)))
  P.drawCardBack(g, cw, ch, TOPW + 52, 40)
  const big = cardsAtlas(256)
  // banner strip at the bottom right
  g.drawImage(big, 0, 179, 256, 77, TOPW, S - 30, S - TOPW, 28)
  const texture = tex(c)
  const toUV = (x, y) => [x / S, 1 - y / S]
  const parts = []
  const quad = (pts, uvs, color = '#ffffff') => {
    const geo = new THREE.BufferGeometry()
    const pos = [], uv = []
    for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...pts[i]); uv.push(...uvs[i]) }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.computeVertexNormals()
    setColor(geo, color)
    parts.push(geo)
  }
  const topUV = (x, z) => toUV((x + hw) / (2 * hw) * TOPW, (z + hd) / (2 * hd) * S)
  const swatch = i => { const p = toUV(TOPW + 14, 8 + i * 10); return [p, p, p, p] }
  const table = (() => { const p = toUV(TOPW + 38, 8); return [p, p, p, p] })()
  // table slab: a 1 m block so it never flickers against the street
  const tb = G.B.base
  const box = (x0, x1, y0, y1, z0, z1, side, front = side) => {
    quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [topUV(x0, z1), topUV(x1, z1), topUV(x1, z0), topUV(x0, z0)])
    quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], front)
    quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], side)
    quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], side)
    quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], side)
  }
  box(-hw, hw, 0, tb, -hd, hd, table)
  for (let t = 0; t < 10; t++) {
    const z1 = G.B.zFront - t * G.B.tierD, z0 = z1 - G.B.tierD
    box(-G.B.half, G.B.half, tb, G.tierTop(t), z0, z1, swatch(t))
  }
  // the fan: five flat cards, backs to the back street
  FAN.forEach((id, i) => {
    const a = (i - 2) * FAN_SPREAD
    const m = new THREE.Matrix4().makeTranslation(FAN_PIVOT.x, FAN_PIVOT.y, FAN_PIVOT.z).multiply(new THREE.Matrix4().makeRotationX(FAN_TILT)).multiply(new THREE.Matrix4().makeRotationZ(-a))
    const w = FAN_CARD.w / 2, r = FAN_CARD.r, h = FAN_CARD.h / 2
    const v = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(m).toArray()
    const k = [...FAN, FLOAT].indexOf(id)
    const cx = TOPW + 4 + (k % 2) * (cw + 4), cy = 110 + Math.floor(k / 2) * (ch + 2)
    const f = [toUV(cx, cy + ch), toUV(cx + cw, cy + ch), toUV(cx + cw, cy), toUV(cx, cy)]
    quad([v(-w, r - h, 0.03), v(w, r - h, 0.03), v(w, r + h, 0.03), v(-w, r + h, 0.03)], f)
    const bk = [toUV(TOPW + 52, 40 + ch), toUV(TOPW + 52 + cw, 40 + ch), toUV(TOPW + 52 + cw, 40), toUV(TOPW + 52, 40)]
    quad([v(w, r - h, -0.03), v(-w, r - h, -0.03), v(-w, r + h, -0.03), v(w, r + h, -0.03)], bk)
  })
  // the banner on the back wall
  const bz = B_BACK() - 0.02
  quad([[4.6, 0.3, bz], [-4.6, 0.3, bz], [-4.6, 2.6, bz], [4.6, 2.6, bz]], [toUV(TOPW, S - 2), toUV(S, S - 2), toUV(S, S - 30), toUV(TOPW, S - 30)])
  const mat = new THREE.MeshStandardMaterial({ name: 'Far', vertexColors: true, map: texture, roughness: 0.9 })
  const scene = new THREE.Scene()
  const mesh = new THREE.Mesh(merge(parts), mat); mesh.name = 'far'; scene.add(mesh)
  return { scene, canvas: c }
}

// ---------- the street view's script ----------
function scriptSource(game) {
  const r2 = v => Math.round(v * 100) / 100
  // a piece rides each cut-out at the height of the highest paper under its foot, worked out in the
  // script itself: the paths only need x and z, every 0.3 m or so
  const paths = ELS.map((e, i) => {
    const pts = G.elementPath(e, i)
    const step = Math.max(1, Math.round(pts.length / Math.max(4, pts[0].distanceTo(pts[pts.length - 1]) / 0.3)))
    return pts.filter((_, k, a) => k % step === 0 || k === a.length - 1).map(p => [r2(p.x), r2(p.z)])
  })
  const dieRest = []
  for (let v = 1; v <= 6; v++) { const e = new THREE.Euler().setFromQuaternion(P.dieQuaternion(v, 0.5)); dieRest.push([r2(e.x), r2(e.y), r2(e.z)]) }
  const lines = (arr, per = 6) => { const out = []; for (let i = 0; i < arr.length; i += per) out.push('  ' + arr.slice(i, i + per).map(x => JSON.stringify(x)).join(', ') + ','); return out.join('\n') }
  const turns = game.turns.map(t => [t.p, t.v, t.path, t.slide ? [t.slide.k, t.slide.el ?? -1, t.slide.to] : 0])
  return `// Street view of Cards, Snakes & Ladders: four pawns play a recorded game on the paper board,
// the big die tumbles for every roll, the fan of cards sways and one card turns above the board.
// Everything runs on the world clock, so every viewer sees the same moment of the game.

// [player, roll, cells stepped, slide: [kind (S snake, L ladder, T trampoline, P portal), element, to] or 0]
const TURNS = [
${lines(turns, 4)}
]
// points [x, z] along each snake (head to tail) and ladder (foot to top)
const PATHS = [
${paths.map(p => '  [\n' + lines(p, 8).replace(/^/gm, '  ') + '\n  ],').join('\n')}
]
const DIE_REST = ${JSON.stringify(dieRest)}
const DIE_HOME = ${JSON.stringify(DIE_REST[0].toArray().map(r2))}
const START = ${JSON.stringify([0, 1, 2, 3].map(i => startPos(i).toArray().map(r2)))}
const SLOT = ${JSON.stringify(SLOT.map(s => s.map(r2)))}
const FAN_AT = ${JSON.stringify(FAN_PIVOT.toArray().map(r2))}
const CARD_AT = ${JSON.stringify(FLOAT_AT.toArray().map(r2))}
const BOARD = { base: ${G.B.base}, step: ${G.B.stepH}, tile: ${G.B.tileH}, front: ${G.B.zFront}, depth: ${G.B.tierD}, tiers: 10 }

const ROLL = 0.9, HOP = 0.27, SLIDE = 1.1, PAUSE = 0.35, PARTY = 3.0, RESET = 2.0

function cell(c) {
  const t = Math.floor((c - 1) / 10), i = (c - 1) % 10
  const col = t % 2 === 0 ? i : 9 - i
  return [-4.5 + col, BOARD.base + (t + 1) * BOARD.step + BOARD.tile, BOARD.front - (t + 0.5) * BOARD.depth]
}
function spot(p, c) {
  if (c <= 0) return START[p].slice()
  const at = cell(Math.min(100, c))
  return [at[0] + SLOT[p][0], at[1], at[2] + SLOT[p][1]]
}
// the paper laid over the steps leans against each riser; a pawn stands on the highest point under its foot
function drape(z) {
  const tf = (BOARD.front - z) / BOARD.depth
  let y = BOARD.base + BOARD.step + BOARD.tile
  for (let k = 1; k < BOARD.tiers; k++) { const x = (tf - (k - 0.3)) / 0.3; y += BOARD.step * (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x)) }
  return y
}
const FOOT = 0.26
const stand = z => Math.max(drape(z - FOOT), drape(z - FOOT / 2), drape(z), drape(z + FOOT / 2), drape(z + FOOT)) + 0.065
// the top of the board under a point: a tier's cells, or the table around it
function floor(x, z) {
  const tf = (BOARD.front - z) / BOARD.depth
  if (Math.abs(x) > 5.15 || tf < 0 || tf >= BOARD.tiers) return BOARD.base + 0.045
  return BOARD.base + (Math.floor(tf) + 1) * BOARD.step + BOARD.tile
}
/** Keeps a pawn in the air from sinking into a step: never lower than the board under its foot. */
function above(p) {
  let y = 0
  for (const [dx, dz] of [[0, 0], [FOOT, 0], [-FOOT, 0], [0, FOOT], [0, -FOOT]]) y = Math.max(y, floor(p[0] + dx, p[2] + dz))
  if (p[1] < y) p[1] = y
  return p
}
const lerp = (a, b, k) => a + (b - a) * k
// the board is turned half round in the lot: its front faces -z
const turn = p => [-p[0], p[1], -p[2]]
const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]
const ease = k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2)

// the timeline: when each turn starts, and where every pawn stands before it
const timeline = []
let clock = 0
const where = [0, 0, 0, 0]
for (const [p, v, path, slide] of TURNS) {
  const length = ROLL + path.length * HOP + (slide ? SLIDE : 0) + PAUSE
  timeline.push({ start: clock, length, before: where.slice() })
  where[p] = slide ? slide[2] : path[path.length - 1]
  clock += length
}
const GAME = clock
const LOOP = GAME + PARTY + RESET
const FINAL = where.slice()

function along(points, k) {
  const f = Math.min(points.length - 1.001, Math.max(0, k * (points.length - 1)))
  const i = Math.floor(f), r = f - i
  const x = lerp(points[i][0], points[i + 1][0], r), z = lerp(points[i][1], points[i + 1][1], r)
  return [x, stand(z), z]
}

export default function build(b) {
  b.loop((dt, time) => {
    const t = time % LOOP
    const pos = [0, 0, 0, 0].map((_, p) => spot(p, 0))
    const turnY = [0, 0, 0, 0]
    let dieAt = DIE_HOME, dieRot = DIE_REST[4], spin = 0
    if (t < GAME) {
      // binary search for the turn being played
      let lo = 0, hi = timeline.length - 1
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (timeline[mid].start <= t) lo = mid; else hi = mid - 1 }
      const turn = timeline[lo], [p, v, path, slide] = TURNS[lo]
      for (let q = 0; q < 4; q++) pos[q] = spot(q, turn.before[q])
      let k = t - turn.start
      dieRot = DIE_REST[v - 1]
      if (k < ROLL) {
        // the die tumbles in from the right and settles on the roll
        const r = k / ROLL
        spin = Math.pow(1 - r, 2) * 9
        dieAt = [DIE_HOME[0] + (1 - r) * 1.6, DIE_HOME[1] + Math.abs(Math.cos(r * Math.PI * 2.5)) * (1 - r) * (1 - r) * 1.4, DIE_HOME[2] + (1 - r) * 0.5]
      } else {
        k -= ROLL
        let at = turn.before[p]
        const hops = path.length * HOP
        if (k < hops) {
          const i = Math.floor(k / HOP), r = (k - i * HOP) / HOP
          const a = spot(p, i === 0 ? at : path[i - 1]), c = spot(p, path[i])
          const up = c[1] > a[1] + 0.1 ? 0.7 : 0.4
          const m = mix3(a, c, ease(r))
          m[1] += Math.sin(r * Math.PI) * up
          pos[p] = above(m)
        } else {
          at = path[path.length - 1]
          pos[p] = spot(p, at)
          k -= hops
          if (slide && k < SLIDE) {
            const r = Math.min(1, k / SLIDE)
            const [kind, el, to] = slide
            if (kind === 'S' || kind === 'L') {
              const m = along(PATHS[el], kind === 'L' ? ease(r) : r * r * (3 - 2 * r))
              pos[p] = [m[0] + SLOT[p][0] * 0.5, m[1], m[2] + SLOT[p][1] * 0.5]
            } else {
              const a = spot(p, at), c = spot(p, to)
              const m = mix3(a, c, ease(r))
              m[1] += Math.sin(r * Math.PI) * (kind === 'T' ? 1.4 : 2.2)
              pos[p] = above(m)
            }
          } else if (slide) pos[p] = spot(p, slide[2])
        }
      }
    } else {
      // the winner celebrates on 100, then everyone walks back to the start
      const k = t - GAME
      for (let q = 0; q < 4; q++) pos[q] = spot(q, FINAL[q])
      if (k < PARTY) {
        const w = TURNS[TURNS.length - 1][0]
        pos[w][1] += Math.abs(Math.sin(k * Math.PI * 2)) * 0.6
        turnY[w] = k * Math.PI * 2
      } else {
        const r = ease(Math.min(1, (k - PARTY) / RESET))
        for (let q = 0; q < 4; q++) { const m = mix3(spot(q, FINAL[q]), spot(q, 0), r); m[1] += Math.sin(r * Math.PI) * 1.5; pos[q] = above(m) }
      }
    }
    for (let q = 0; q < 4; q++) b.node('pawn' + q, { position: turn(pos[q]), rotation: [0, turnY[q], 0] })
    b.node('die0', { position: turn(dieAt), rotation: [dieRot[0] + spin, dieRot[1] + spin * 0.6, dieRot[2] + spin * 0.3] })
    b.node('fan', { position: turn(FAN_AT), rotation: [0, 0, Math.sin(time * 0.5) * 0.04] })
    b.node('card', { position: turn([CARD_AT[0], CARD_AT[1] + Math.sin(time * 0.8) * 0.25, CARD_AT[2]]), rotation: [0.15, time * 0.6, 0] })
  })
}
`
}

// ---------- export ----------
async function exportGLB(scene) {
  const ex = new GLTFExporter()
  return await ex.parseAsync(scene, { binary: true, onlyVisible: true })
}
async function save(path, data, type = 'application/octet-stream') {
  const res = await fetch('/save/' + path, { method: 'POST', body: data, headers: { 'content-type': type } })
  if (!res.ok) throw new Error('save failed ' + path)
}
function stats(scene) {
  let tris = 0, prims = 0
  const mats = new Set()
  scene.traverse(o => { if (o.isMesh) { prims++; mats.add(o.material.name); tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 } })
  const box = new THREE.Box3().setFromObject(scene)
  return `${Math.round(tris)} triangles, ${prims} primitives, materials ${[...mats].join('/')}, box x ${box.min.x.toFixed(2)}..${box.max.x.toFixed(2)} y ${box.min.y.toFixed(2)}..${box.max.y.toFixed(2)} z ${box.min.z.toFixed(2)}..${box.max.z.toFixed(2)}`
}

async function main() {
  say('board seed', SEED, 'crossings', CROSSINGS, JSON.stringify(ELS))
  say('markers', JSON.stringify(MARKERS))
  const game = pickGame()
  say('street game seed', game.seed, 'turns', game.turns.length)
  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, preserveDrawingBuffer: true })
  renderer.setSize(960, 540, false)
  const lod0 = buildLOD0(), lod1 = buildLOD1(), lod2 = buildLOD2(renderer, lod1)
  // the whole diorama turns half round: static parts as they are, moving parts keep their own frame
  const half = new THREE.Matrix4().makeRotationY(Math.PI)
  for (const lod of [lod0, lod1, lod2]) {
    for (const node of lod.scene.children) {
      if (!node.isMesh) continue
      if (['pawn0', 'pawn1', 'pawn2', 'pawn3', 'fan', 'card'].includes(node.name)) { node.geometry.rotateY(Math.PI); node.position.set(-node.position.x, node.position.y, -node.position.z) }
      else if (node.name === 'die0') node.position.set(-node.position.x, node.position.y, -node.position.z)
      else node.applyMatrix4(half)
    }
  }
  say('LOD0', stats(lod0.scene))
  say('LOD1', stats(lod1.scene))
  say('LOD2', stats(lod2.scene))
  window.lods = { lod0, lod1, lod2 }
  const q = new URLSearchParams(location.search)
  if (q.get('save') !== '0') {
    await save('build/lod0.glb', await exportGLB(lod0.scene))
    await save('build/lod1.glb', await exportGLB(lod1.scene))
    await save('build/lod2.glb', await exportGLB(lod2.scene))
    await save('build/build.js', scriptSource(game), 'text/javascript')
    await save('build/lot.json', JSON.stringify({ script: 'build.js', materials: { Cards: { glow: 0 }, Paper: { glow: 0 } } }, null, 2), 'application/json')
    say('saved build/lod0.glb, lod1.glb, lod2.glb, build.js, lot.json')
  }
  // a preview: ?view=lod0|lod1|lod2 and ?cam=front|back|side|top|far
  const which = q.get('view') || 'lod0'
  const scene = window.lods[which].scene
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9a96, 2.2))
  const sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(-6, 14, 8); scene.add(sun)
  scene.background = new THREE.Color('#f4f4f2')
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ffffff' }))
  scene.add(ground)
  const cams = { front: [[9, 9, 22], [0, 2.5, 0]], back: [[-8, 9, -24], [0, 3, 0]], side: [[24, 8, 4], [0, 2.5, 0]], top: [[0, 30, 6], [0, 0, 0]], far: [[40, 35, 70], [0, 3, 0]], close: [[3, 6, 12], [0, 2, 1]] }
  const [cp, ct] = cams[q.get('cam') || 'front']
  const cam = new THREE.PerspectiveCamera(45, 960 / 540, 0.1, 500)
  cam.position.set(...cp); cam.lookAt(...ct)
  if (which === 'lod0' && q.get('t')) {
    // run the street script at time t to see the pawns mid-game
    const src = scriptSource(game)
    const blob = new Blob([src], { type: 'text/javascript' })
    const mod = await import(URL.createObjectURL(blob))
    let fn = null
    const nodes = {}
    scene.traverse(o => { if (o.name) nodes[o.name] = o })
    mod.default({ loop: f => { fn = f }, node: (name, o) => { const n = nodes[name]; if (!n) return; if (o.position) n.position.fromArray(o.position); if (o.rotation) n.rotation.set(...o.rotation); if (o.scale) n.scale.fromArray(o.scale) } })
    fn(0.03, +q.get('t'))
  }
  if (q.get('check')) {
    // replay the street script over its whole loop: how far any pawn's foot gets below the paper
    const mod = await import(URL.createObjectURL(new Blob([scriptSource(game)], { type: 'text/javascript' })))
    let fn = null
    const at = {}
    mod.default({ loop: f => { fn = f }, node: (name, o) => { at[name] = o.position } })
    const top = (x, z) => {
      const tf = (G.B.zFront - z) / G.B.tierD
      if (Math.abs(x) > G.B.half || tf < 0 || tf >= 10) return G.B.base + 0.04
      return G.tierTop(Math.floor(tf)) + G.B.tileH
    }
    let worst = { d: Infinity }
    for (let t = 0; t < 600; t += 0.01) {
      fn(0.01, t)
      for (let p = 0; p < 4; p++) {
        const [x, y, z] = at['pawn' + p].map((v, i) => (i === 1 ? v : -v)) // back to the board's own frame
        let floor = 0
        for (const [dx, dz] of [[0, 0], [0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]]) floor = Math.max(floor, top(x + dx, z + dz))
        if (y - floor < worst.d) worst = { d: y - floor, t: Math.round(t * 100) / 100, p, x, z }
      }
    }
    say('pawn clearance: lowest', worst.d.toFixed(3), 'm at t', worst.t, 'pawn', worst.p, 'x', worst.x.toFixed(2), 'z', worst.z.toFixed(2))
    say('script', scriptSource(game).length, 'chars')
  }
  renderer.render(scene, cam)
  say('done')
  window.done = true
}
main().catch(e => { say('ERROR', e.stack || e); window.done = true })
