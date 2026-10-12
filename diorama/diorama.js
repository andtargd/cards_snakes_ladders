// A monumental paper-craft diorama of the game: a giant cardboard snake coiled round a giant wooden ladder
// in an X over the stepped pastel board, giant cards and pawns in the front left, tumbling dice, a pawn and
// a little pink friend on the START tile in the front right, layered cut-out hills behind. Built from the
// game's own materials (palette, card faces, icons, pawn and dice shapes, paper fibres) and kept inside the
// lot's 12 x 19 x 12 m volume: x across, z front to back (the front is +z), y up.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import * as P from '../experience/paper.js'
import * as G from '../experience/board3d.js'
import { CARD, mulberry32 } from '../experience/rules.js'

export const LOT = { width: 12, depth: 19, height: 12 }
export const NUM_FONT = '"Nunito", "Trebuchet MS", sans-serif'

const PLINTH = 0.35
const BOARD = { half: 5.2, zFront: 4.8, tierD: 1.2, stepH: 0.3, tiers: 10, tileH: 0.08 }
const tierTop = t => PLINTH + (t + 1) * BOARD.stepH
const tierZ = t => BOARD.zFront - (t + 0.5) * BOARD.tierD
// the game's tier colours, softened to pastels: coral, orange, yellow, lime, mint, teal, blue, lilac, orchid, pink
const TIERS = P.TIER_COLORS
const BLUE = P.CAT_COLORS.P, GREEN = '#43a047'

const V3 = (x, y, z) => new THREE.Vector3(x, y, z)
const UP = new THREE.Vector3(0, 1, 0)
const clamp01 = x => Math.max(0, Math.min(1, x))
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }
const pastel = (hex, k) => new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), k)
const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k)
// detail: 1 for the viewer; the Project 0 build makes lighter copies with fewer segments
let DETAIL = 1
const seg = n => Math.max(3, Math.round(n * DETAIL))
let rand = mulberry32(1886)
const jit = a => (rand() - 0.5) * 2 * a
/** Marks what a texture is for, so the Project 0 build can pack it: fibre, tiles, snake or print. */
const role = (t, r) => { t.userData.role = r; return t }

// ---------- textures and materials ----------
let FIBRE, FIBRE_FINE, LAYERS
function layersCanvas() {
  // the cut edge of thick card: plies with darker glue lines, tiling every 8 cm across the thickness
  const { c, g } = P.canvas(128, 64)
  g.drawImage(P.fibreCanvas(128, 5), 0, 0, 128, 64)
  g.fillStyle = 'rgba(60,40,20,0.16)'; g.fillRect(0, 0, 128, 4); g.fillRect(0, 32, 128, 3)
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 5, 128, 3); g.fillRect(0, 36, 128, 2)
  return c
}
const tex = (c, opts) => { const t = P.texture(c, opts); t.anisotropy = 8; return t }

function paper(color, { rough = 0.9, metal = 0, map = FIBRE } = {}) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), map, roughness: rough, metalness: metal })
}
function edge(color, k = 0.84) {
  return new THREE.MeshStandardMaterial({ color: shade(color, k), map: LAYERS, roughness: 0.95 })
}
/** A face material and its cut edge, for extruded cut-outs (caps, sides). */
const cut = (color, opts) => [paper(color, opts), edge(color)]

function mesh(geo, mat, parent, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = cast
  m.receiveShadow = receive
  if (parent) parent.add(m)
  return m
}
function extrude(shape, depth, { bevel = 0.015, seg: cs = 24 } = {}) {
  if (DETAIL < 0.5) bevel = 0
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: DETAIL < 0.8 ? 1 : 2, curveSegments: seg(cs), steps: 1 })
  g.translate(0, 0, -depth / 2)
  return g
}
/** Stretches a picture over the caps of an extruded shape (the first group) or a ShapeGeometry. */
function fitUV(g, mirror = false) {
  g.computeBoundingBox()
  const b = g.boundingBox, uv = g.attributes.uv, p = g.attributes.position
  const n = g.groups.length ? g.groups[0].count : p.count
  for (let i = 0; i < n; i++) {
    const u = (p.getX(i) - b.min.x) / (b.max.x - b.min.x)
    uv.setXY(i, mirror ? 1 - u : u, (p.getY(i) - b.min.y) / (b.max.y - b.min.y))
  }
  return g
}
function roundRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y)
  return s
}
function circle(r) { const s = new THREE.Shape(); s.absarc(0, 0, r, 0, Math.PI * 2, false); return s }
function starShape(r1, r2, n = 5) {
  const s = new THREE.Shape()
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1, a = Math.PI / 2 + i * Math.PI / n
    i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  return s
}
const font = (px, weight = 900, italic = true) => `${italic ? 'italic ' : ''}${weight} ${px}px ${NUM_FONT}`

// ---------- the plinth and the stepped board ----------
const TILE_PX = 200, ATLAS_PX = 2048
function tileAtlas() {
  const { c, g } = P.canvas(ATLAS_PX, ATLAS_PX)
  const fib = P.fibreCanvas(256, 21)
  for (let n = 1; n <= 100; n++) {
    const t = Math.floor((n - 1) / 10), x = ((n - 1) % 10) * TILE_PX, y = t * TILE_PX
    const base = TIERS[t], gold = n === 100
    g.save(); g.translate(x, y)
    if (gold) {
      const gr = g.createLinearGradient(0, 0, TILE_PX, TILE_PX)
      gr.addColorStop(0, '#ffe58a'); gr.addColorStop(0.5, '#f6c445'); gr.addColorStop(1, '#e39b1c')
      g.fillStyle = gr
    } else g.fillStyle = pastel(base, 0.55).getStyle()
    g.fillRect(0, 0, TILE_PX, TILE_PX)
    g.globalCompositeOperation = 'multiply'; g.drawImage(fib, 0, 0, TILE_PX, TILE_PX); g.globalCompositeOperation = 'source-over'
    // the cut edge band (the sides of the tile sample it) and a faint pencil inset
    g.strokeStyle = gold ? '#c98a12' : pastel(base, 0.15).getStyle(); g.lineWidth = 12; g.strokeRect(6, 6, TILE_PX - 12, TILE_PX - 12)
    g.strokeStyle = 'rgba(60,40,20,0.12)'; g.lineWidth = 2; g.strokeRect(24, 24, TILE_PX - 48, TILE_PX - 48)
    g.translate(TILE_PX / 2, TILE_PX / 2 + 8)
    g.rotate(jit(0.08))
    g.textAlign = 'center'; g.textBaseline = 'middle'
    if (gold) {
      g.fillStyle = 'rgba(255,255,255,0.55)'; P.star(g, 0, -6, 80, 36, 5); g.fill()
      g.font = font(76)
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillText('100', -3, -3)
      g.fillStyle = '#7a4a00'; g.fillText('100', 0, 0)
    } else {
      g.font = font(n < 10 ? 104 : 92)
      // hand-painted: a pale underlayer slightly off the ink
      g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillText(String(n), -4, -4)
      g.fillStyle = shade(base, 0.48).getStyle(); g.fillText(String(n), 0, 0)
    }
    g.restore()
  }
  return c
}
function tileGeometry(n, w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d)
  const x0 = ((n - 1) % 10) * TILE_PX, y0 = Math.floor((n - 1) / 10) * TILE_PX
  const u0 = (x0 + 16) / ATLAS_PX, u1 = (x0 + TILE_PX - 16) / ATLAS_PX
  const v1 = 1 - (y0 + 16) / ATLAS_PX, v0 = 1 - (y0 + TILE_PX - 16) / ATLAS_PX
  const uv = g.attributes.uv
  const side = [(x0 + 5) / ATLAS_PX, 1 - (y0 + TILE_PX / 2) / ATLAS_PX]
  for (let i = 0; i < uv.count; i++) {
    if (i >= 8 && i < 12) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0)) // the top (+y) face
    else uv.setXY(i, ...side)
  }
  return g
}
function cellXZ(n) {
  const t = Math.floor((n - 1) / 10), i = (n - 1) % 10
  const col = t % 2 === 0 ? i : 9 - i
  return { t, x: -4.5 + col, z: tierZ(t) }
}

function buildPlinth(root) {
  const lower = new THREE.BoxGeometry(LOT.width - 0.04, 0.2, LOT.depth - 0.04); lower.translate(0, 0.1, 0)
  mesh(G.boxUV(lower, 0.4), paper('#d6bf98'), root)
  const upper = new THREE.BoxGeometry(LOT.width - 0.3, PLINTH - 0.2, LOT.depth - 0.3); upper.translate(0, 0.2 + (PLINTH - 0.2) / 2, 0)
  mesh(G.boxUV(upper, 0.4), paper('#efe3cb'), root)
}

function buildBoard(root, atlas) {
  const board = new THREE.Group(); board.name = 'board'; root.add(board)
  // the tiers: ten pastel steps rising to the back
  for (let t = 0; t < BOARD.tiers; t++) {
    const h = tierTop(t) - PLINTH
    const geo = new THREE.BoxGeometry(BOARD.half * 2, h, BOARD.tierD)
    geo.translate(0, PLINTH + h / 2, tierZ(t))
    mesh(G.boxUV(geo, 0.4), paper(pastel(TIERS[t], 0.3)), board)
    // a white paper lip along the step's front edge
    const lip = new THREE.BoxGeometry(BOARD.half * 2 + 0.02, 0.05, 0.05)
    lip.translate(0, tierTop(t) - 0.025, BOARD.zFront - t * BOARD.tierD + 0.005)
    mesh(G.boxUV(lip, 0.4), paper('#fffaf0'), board)
  }
  // numbered tiles, each hand cut a little askew
  const tiles = []
  for (let n = 1; n < 100; n++) {
    const { t, x, z } = cellXZ(n)
    const g = tileGeometry(n, 0.88, BOARD.tileH, 1.02)
    g.rotateY(jit(0.045))
    g.translate(x + jit(0.02), tierTop(t) + BOARD.tileH / 2, z + jit(0.03))
    tiles.push(g)
  }
  const tileMat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.85 })
  mesh(mergeGeometries(tiles), tileMat, board)
  // the golden 100: thicker, gilded, with a star on a dowel
  const { x, z } = cellXZ(100)
  const top = tierTop(9)
  const g100 = tileGeometry(100, 0.9, 0.22, 1.04); g100.translate(x, top + 0.11, z)
  mesh(g100, new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.42, metalness: 0.35 }), board)
  const dowel = new THREE.CylinderGeometry(0.035, 0.035, 1.0, seg(12)); dowel.translate(x, top + 0.7, z - 0.25)
  mesh(dowel, paper('#a8743f'), board)
  const star = mesh(extrude(starShape(0.42, 0.19), 0.09, { bevel: 0.02 }), [paper('#f6c445', { rough: 0.4, metal: 0.4 }), edge('#e3a21f', 0.9)], board)
  star.position.set(x, top + 1.45, z - 0.25); star.rotation.set(-0.08, 0.25, 0.1)
  // up-arrow signs at the end of every row, on the side where the path climbs to the next tier
  const signTex = role(tex(signCanvas()), 'print')
  for (let t = 0; t < 9; t++) {
    const sx = (t % 2 === 0 ? 1 : -1) * 5.58
    const sz = BOARD.zFront - (t + 1) * BOARD.tierD
    const sy = tierTop(t + 1) + 0.78
    const post = new THREE.CylinderGeometry(0.04, 0.045, sy - PLINTH, seg(10)); post.translate(sx, PLINTH + (sy - PLINTH) / 2 - 0.1, sz - 0.06)
    mesh(post, paper('#8a5a34'), board)
    const sign = mesh(fitUV(extrude(roundRect(0.56, 0.56, 0.12), 0.05, { bevel: 0.012 })), [new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.85 }), edge('#fffaf0')], board)
    sign.position.set(sx, sy, sz); sign.rotation.set(0, sx > 0 ? -0.3 : 0.3, jit(0.06))
  }
  return board
}
function signCanvas() {
  const { c, g } = P.canvas(256, 256)
  g.fillStyle = '#fffaf0'; g.fillRect(0, 0, 256, 256)
  g.globalCompositeOperation = 'multiply'; g.drawImage(P.fibreCanvas(256, 9), 0, 0); g.globalCompositeOperation = 'source-over'
  g.strokeStyle = '#7a5236'; g.lineWidth = 14; P.roundRect(g, 14, 14, 228, 228, 40); g.stroke()
  g.fillStyle = '#7a5236'
  g.beginPath(); g.moveTo(128, 46); g.lineTo(200, 128); g.lineTo(156, 128); g.lineTo(156, 206); g.lineTo(100, 206); g.lineTo(100, 128); g.lineTo(56, 128); g.closePath(); g.fill()
  return c
}

// ---------- the giant ladder ----------
function ladderFrame() {
  const F = V3(-4.1, tierTop(1) + BOARD.tileH - 0.02, 2.9) // the foot, on the second tier
  const T = V3(4.0, 10.75, -1.3) // the top, leaning back over the board
  const d = T.clone().sub(F), L = d.length()
  d.normalize()
  const w = new THREE.Vector3(0, 0, 1).cross(d).normalize() // across the ladder, towards its upper left
  const X = w.clone().negate()
  const n = new THREE.Vector3().crossVectors(X, d) // the ladder's face, towards the viewer
  return { F, T, d, L, w, n, X }
}
function buildLadder(root, lad) {
  const { F, d, L, n, X } = lad
  const group = new THREE.Group(); group.name = 'ladder'; root.add(group)
  new THREE.Matrix4().makeBasis(X, d, n).setPosition(F).decompose(group.position, group.quaternion, group.scale)
  const HALF = 0.85, RAIL = 0.16, top = L + 0.3
  // a rail's foot is cut level with the floor, whatever the ladder's tilt
  const footY = x => (-0.04 - x * X.y) / d.y
  const railMat = [paper('#a8612c', { map: woodTexture() }), edge('#c98a52', 1)]
  for (const side of [-1, 1]) {
    const xc = side * HALF, s = new THREE.Shape(), N = seg(30)
    const left = [], right = []
    for (let i = 0; i <= N; i++) {
      const k = i / N, bow = 0.07 * Math.sin(Math.PI * k) * side
      left.push([xc - RAIL + bow + jit(0.012), footY(xc - RAIL) + (top - footY(xc - RAIL)) * k])
      right.push([xc + RAIL + bow + jit(0.012), footY(xc + RAIL) + (top - footY(xc + RAIL)) * k])
    }
    s.moveTo(...left[0])
    for (const p of left.slice(1)) s.lineTo(...p)
    s.quadraticCurveTo(xc + jit(0.05), top + 0.12, ...right[N])
    for (const p of right.slice(0, N).reverse()) s.lineTo(...p)
    s.closePath()
    mesh(extrude(s, 0.26, { bevel: 0.02 }), railMat, group)
  }
  // orange-yellow rungs, slightly bent and skewed like hand-cut card
  const rungMat = cut('#f6a73a')
  for (let y = 0.95; y < L - 0.15; y += 0.82) {
    const s = new THREE.Shape(), w = HALF - 0.07, h = 0.11, bend = jit(0.035)
    s.moveTo(-w, -h); s.quadraticCurveTo(0, -h + bend, w, -h)
    s.lineTo(w, h); s.quadraticCurveTo(0, h + bend, -w, h); s.closePath()
    const r = mesh(extrude(s, 0.15, { bevel: 0.02 }), rungMat, group)
    r.position.set(0, y, 0); r.rotation.z = jit(0.045)
  }
  // the green arrowhead on the floor at its foot, as on the game board
  const a = new THREE.Shape()
  a.moveTo(0, 0.62); a.lineTo(0.6, -0.3); a.lineTo(0, -0.05); a.lineTo(-0.6, -0.3); a.closePath()
  const arrow = mesh(extrude(a, 0.1, { bevel: 0.02 }), cut(GREEN), root)
  const dir = Math.atan2(d.x, -d.z) // the ladder's heading seen from above
  arrow.position.set(F.x - 0.75, tierTop(0) + BOARD.tileH + 0.2, 4.15)
  arrow.rotation.set(-Math.PI / 2 + 0.45, 0, 0, 'YXZ')
  arrow.rotation.y = -dir
  return group
}
function woodTexture() {
  const { c, g } = P.canvas(256, 512)
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 512)
  const r = mulberry32(7)
  for (let i = 0; i < 46; i++) {
    const x = r() * 256, wv = 2 + r() * 5
    g.strokeStyle = `rgba(90,45,15,${0.08 + r() * 0.16})`; g.lineWidth = 1 + r() * 3
    g.beginPath()
    for (let y = 0; y <= 512; y += 16) { const px = x + Math.sin(y / 60 + i) * wv; y ? g.lineTo(px, y) : g.moveTo(px, y) }
    g.stroke()
  }
  g.globalCompositeOperation = 'multiply'; g.drawImage(P.fibreCanvas(256, 4), 0, 0, 256, 512)
  const t = role(tex(c, { repeat: true }), 'fibre'); t.repeat.set(1.4, 0.18)
  return t
}

// ---------- the giant snake ----------
function snakePoints(lad) {
  const { F, d, L, w, n } = lad
  const A = s => F.clone().addScaledVector(d, s)
  // the tail lies on the first tier, curls, and the body rises from the bottom right
  const pts = [V3(1.25, 0.77, 4.3), V3(2.35, 0.8, 3.98), V3(3.45, 0.85, 4.28), V3(4.5, 0.92, 3.92), V3(4.95, 1.55, 3.05), V3(4.55, 2.65, 2.3), V3(3.2, 3.3, 1.8), V3(1.7, 3.5, 1.5)]
  // a turn and a quarter round the ladder: behind, in front, behind, out on its upper left; it starts and
  // ends a quarter turn in, where the coil already runs the way the body comes in and goes on (no folds)
  const sc = L * 0.5, Rw = 1.6, Rn = 0.82, k = 0.33
  for (let th = 1.25 * Math.PI; th <= 3.75 * Math.PI + 1e-6; th += Math.PI / 6) {
    const s = sc + k * (th - 2.5 * Math.PI)
    pts.push(A(s).addScaledVector(w, Rw * Math.cos(th)).addScaledVector(n, Rn * Math.sin(th)))
  }
  // an S-curved neck, the head held high on the top left
  const exit = pts[pts.length - 1].clone()
  pts.push(V3(-1.6, 8.75, 0.4), V3(-3.0, 8.55, 0.6), V3(-4.25, 9.15, 0.72), V3(-4.3, 10.0, 0.78), V3(-4.02, 10.32, 0.8))
  return { pts, coil: { sc, A, exit } }
}
function snakeCanvas() {
  const W = 512, H = 512, Y = v => v * H
  const { c, g } = P.canvas(W, H)
  const green = '#46ad4d', dark = '#21702a'
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H)
  g.fillStyle = '#a9d47f'; g.fillRect(0, Y(SKIN_V), W, Y(0.04))
  g.save(); g.scale(1, SKIN_V)
  g.fillStyle = green; g.fillRect(0, 0, W, H)
  // v runs round the body: 0 the belly edge, 0.06-0.44 the front face, 0.5 the back edge, 0.56-0.94 the other face
  g.fillStyle = '#2f8d37'; g.fillRect(0, Y(0.44), W, Y(0.12))
  g.fillStyle = '#a9d47f'; g.fillRect(0, 0, W, Y(0.06)); g.fillRect(0, Y(0.94), W, Y(0.06))
  for (const v of [0.468, 0.5, 0.532, 0.02, 0.98]) { g.fillStyle = 'rgba(0,30,0,0.16)'; g.fillRect(0, Y(v) - 1, W, 2.5) }
  // pale belly stripes along the belly edge of both faces
  for (const [v0, v1] of [[0.06, 0.155], [0.845, 0.94]]) {
    g.fillStyle = '#cfe9a5'; g.fillRect(0, Y(v0), W, Y(v1 - v0))
    for (let x = 0; x < W; x += W / 6) {
      g.fillStyle = '#ecf8d6'; g.fillRect(x + 8, Y(v0) + 4, W / 6 * 0.5, Y(v1 - v0) - 8)
      g.fillStyle = 'rgba(40,90,30,0.25)'; g.fillRect(x, Y(v0), 3, Y(v1 - v0))
    }
    g.fillStyle = 'rgba(20,60,20,0.25)'; g.fillRect(0, v0 < 0.5 ? Y(v1) : Y(v0) - 2, W, 2)
  }
  // dark green diamonds down the middle of each face, cut from a second layer with a pale offset edge
  const diamond = (x, y, hw, hh) => { g.beginPath(); g.moveTo(x - hw, y); g.lineTo(x, y - hh); g.lineTo(x + hw, y); g.lineTo(x, y + hh); g.closePath(); g.fill() }
  for (const vc of [0.3, 0.7]) for (const xc of [W * 0.25, W * 0.75]) {
    g.fillStyle = 'rgba(210,240,180,0.55)'; diamond(xc + 5, Y(vc) + 4, W * 0.15, Y(0.088))
    g.fillStyle = dark; diamond(xc, Y(vc), W * 0.15, Y(0.088))
    g.fillStyle = '#3c9a43'; diamond(xc, Y(vc), W * 0.06, Y(0.035))
  }
  for (const vc of [0.3, 0.7]) for (const xc of [0, W * 0.5]) { g.fillStyle = '#2f8d37'; g.beginPath(); g.arc(xc, Y(vc), 9, 0, Math.PI * 2); g.arc(xc + W, Y(vc), 9, 0, Math.PI * 2); g.fill() }
  g.globalCompositeOperation = 'multiply'; g.drawImage(P.fibreCanvas(512, 13), 0, 0); g.globalCompositeOperation = 'source-over'
  g.restore()
  const t = role(tex(c, { repeat: true }), 'snake'); t.flipY = false
  return t
}
export const PERIOD = 1.5 // metres of body per texture repeat (two diamonds)
// the body's skin takes v 0..SKIN_V of the snake texture; above it a white band (parts painted by vertex colour)
export const SKIN_V = 0.85
function snakeBody(lad) {
  const { pts, coil } = snakePoints(lad)
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
  const N = seg(760), RS = seg(40)
  const P0 = curve.getSpacedPoints(N)
  const len = curve.getLength()
  // the body's face looks at the viewer (lying on the board it looks up; on the coil it looks out from the ladder)
  const { F, d } = lad
  const face = [], T = []
  for (let i = 0; i <= N; i++) {
    const p = P0[i]
    T.push(P0[Math.min(N, i + 1)].clone().sub(P0[Math.max(0, i - 1)]).normalize())
    const b = V3(0, 1, 0.12).lerp(V3(0, 0.5, 1), sstep(0.95, 2.0, p.y)).normalize()
    const rel = p.clone().sub(F), s = rel.dot(d)
    const radial = rel.addScaledVector(d, -s), dist = radial.length()
    const k = sstep(2.9, 1.7, dist) * sstep(coil.sc - 3.0, coil.sc - 1.8, s) * sstep(coil.sc + 3.0, coil.sc + 1.8, s)
    face.push(b.lerp(radial.normalize(), k).normalize())
  }
  // twist-free frames carried along the body, then turned towards the wanted face; the turn is smoothed over
  // two to four metres of body, so where the face swings round (onto the coil and off it) the twist is gradual
  const N0 = [], B0 = []
  let n = face[0].clone().addScaledVector(T[0], -face[0].dot(T[0])).normalize()
  for (let i = 0; i <= N; i++) {
    n.addScaledVector(T[i], -n.dot(T[i])).normalize()
    N0.push(n.clone()); B0.push(new THREE.Vector3().crossVectors(T[i], n))
    n = n.clone()
  }
  const want = face.map((f, i) => {
    const c = f.dot(N0[i]), sn = f.dot(B0[i]), w = c * c + sn * sn // a face along the body says little
    const l = Math.hypot(c, sn) || 1
    return [c / l * w, sn / l * w]
  })
  const SIG = 70, R = SIG * 3, kern = []
  for (let k = -R; k <= R; k++) kern.push(Math.exp(-(k * k) / (2 * SIG * SIG)))
  const Nf = want.map((_, i) => {
    let c = 0, sn = 0
    for (let k = -R; k <= R; k++) { const j = Math.min(N, Math.max(0, i + k)), g = kern[k + R]; c += want[j][0] * g; sn += want[j][1] * g }
    const a = Math.atan2(sn, c)
    return N0[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(B0[i], Math.sin(a)).normalize()
  })
  const pos = [], uv = [], idx = []
  const radius = t => (0.05 + 0.42 * sstep(0, 0.42, t)) * (1 - 0.14 * sstep(0.86, 0.97, t))
  const se = (x, e) => Math.sign(x) * Math.pow(Math.abs(x), 2 / e)
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = radius(t), c = a * 0.6
    const Bv = new THREE.Vector3().crossVectors(Nf[i], T[i]) // the belly edge
    for (let j = 0; j <= RS; j++) {
      const ph = (j / RS) * Math.PI * 2
      const ox = a * se(Math.cos(ph), 2.8), oy = c * se(Math.sin(ph), 2.8)
      pos.push(P0[i].x + Bv.x * ox + Nf[i].x * oy, P0[i].y + Bv.y * ox + Nf[i].y * oy, P0[i].z + Bv.z * ox + Nf[i].z * oy)
      uv.push((t * len) / PERIOD, (j / RS) * SKIN_V)
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < RS; j++) {
    const a = i * (RS + 1) + j, b = a + 1, c = a + RS + 1, e = c + 1
    idx.push(a, b, c, b, e, c)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  // how much of the ladder's sway each ring follows (the tail lying on the board stays put), and how much
  // of the neck's own wave (from where the body leaves the coil up to the head)
  let iExit = N
  for (let i = N >> 1; i <= N; i++) if (P0[i].distanceTo(coil.exit) < P0[iExit].distanceTo(coil.exit)) iExit = i
  const follow = P0.map(p => sstep(1.0, 3.6, p.y))
  const neck = P0.map((_, i) => Math.pow(clamp01((i - iExit) / (N - iExit)), 1.6))
  return { geo: g, tip: P0[0], tipR: radius(0), len, rings: N + 1, ringSize: RS + 1, follow, neck, tExit: iExit / N }
}
function buildSnake(root, lad) {
  const group = new THREE.Group(); group.name = 'snake'; root.add(group)
  const skin = new THREE.MeshStandardMaterial({ map: snakeCanvas(), roughness: 0.82 })
  const body = snakeBody(lad)
  const bodyMesh = mesh(body.geo, skin, group)
  bodyMesh.name = 'snakeBody'
  bodyMesh.frustumCulled = false
  const restPos = body.geo.attributes.position.array.slice()
  const tip = mesh(new THREE.SphereGeometry(body.tipR * 1.05, seg(12), seg(8)), paper('#46ad4d'), group)
  tip.position.copy(body.tip); tip.scale.set(1, 0.6, 1)
  const head = snakeHead()
  head.group.position.set(-3.95, 10.78, 0.95)
  head.group.lookAt(head.group.position.clone().add(V3(0.55, -0.12, 1)))
  head.group.rotateZ(-0.16)
  head.group.scale.setScalar(1.2)
  head.rest = head.group.quaternion.clone()
  head.restPos = head.group.position.clone()
  group.add(head.group)
  /** Moves the body with the ladder (rotation `m` about the ladder's foot `F`) and waves the neck by `off`. */
  const tmp = new THREE.Vector3()
  function sway(m, F, off) {
    const arr = body.geo.attributes.position.array
    for (let i = 0; i < body.rings; i++) {
      const wl = body.follow[i], wn = body.neck[i]
      for (let j = 0; j < body.ringSize; j++) {
        const k = (i * body.ringSize + j) * 3
        const x = restPos[k], y = restPos[k + 1], z = restPos[k + 2]
        tmp.set(x - F.x, y - F.y, z - F.z).applyMatrix3(m).add(F)
        arr[k] = x + (tmp.x - x) * wl + off.x * wn
        arr[k + 1] = y + (tmp.y - y) * wl + off.y * wn
        arr[k + 2] = z + (tmp.z - z) * wl + off.z * wn
      }
    }
    body.geo.attributes.position.needsUpdate = true
  }
  return { group, head, length: body.len, sway, tExit: body.tExit, rings: body.rings, ringSize: body.ringSize }
}
function snakeHead() {
  const group = new THREE.Group(); group.name = 'head'
  const R = V3(0.78, 0.64, 0.74)
  const green = paper('#4ab351', { rough: 0.8 })
  const skull = mesh(new THREE.SphereGeometry(1, seg(48), seg(32)), green, group)
  skull.scale.copy(R)
  // a pale chin layer and a dark diamond on the brow, cut out and glued on
  const chin = mesh(new THREE.SphereGeometry(1, seg(40), seg(24)), paper('#cfe9a5'), group)
  chin.scale.set(0.6, 0.3, 0.62); chin.position.set(0, -0.4, 0.05)
  const surf = (x, y) => R.z * Math.sqrt(Math.max(0, 1 - (x / R.x) ** 2 - (y / R.y) ** 2))
  const brow = new THREE.Shape(); brow.moveTo(0, 0.2); brow.lineTo(0.22, 0); brow.lineTo(0, -0.2); brow.lineTo(-0.22, 0); brow.closePath()
  const dm = mesh(extrude(brow, 0.04, { bevel: 0.01 }), cut('#21702a'), group)
  dm.position.set(0, 0.6, 0.28); dm.lookAt(V3(0, 1.6, 0.9))
  // googly eyes: white domes with loose black pupils
  const pupils = []
  for (const sx of [-1, 1]) {
    const e = V3(sx * 0.4, 0.46, 0.8).normalize()
    const eye = new THREE.Group(); eye.name = sx < 0 ? 'eyeL' : 'eyeR'
    eye.position.set(e.x * R.x * 0.93, e.y * R.y * 0.93, e.z * R.z * 0.93)
    group.add(eye)
    eye.lookAt(eye.position.clone().add(e))
    const white = mesh(new THREE.SphereGeometry(0.3, seg(40), seg(20), 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25 }), eye)
    white.rotation.x = Math.PI / 2; white.scale.set(1, 0.42, 1)
    const rim = mesh(new THREE.TorusGeometry(0.3, 0.025, seg(8), seg(40)), paper('#e8e4dc'), eye)
    void rim
    const pupil = mesh(new THREE.SphereGeometry(0.14, seg(24), seg(16)), new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.3 }), eye)
    pupil.scale.set(1, 1, 0.35); pupil.name = sx < 0 ? 'pupilL' : 'pupilR'
    pupil.position.set(-sx * 0.05, -0.08, 0.12)
    pupils.push({ m: pupil, base: pupil.position.clone(), sx })
  }
  // a smile, nostrils and pink cheeks
  const smile = mesh(new THREE.TorusGeometry(0.2, 0.024, seg(8), seg(32), 2.0), new THREE.MeshStandardMaterial({ color: '#1f3d22', roughness: 0.6 }), group)
  smile.position.set(0, -0.06, surf(0, -0.22) - 0.01); smile.rotation.z = -Math.PI / 2 - 1.0
  for (const sx of [-1, 1]) {
    const nos = mesh(new THREE.SphereGeometry(0.035, seg(10), seg(8)), new THREE.MeshStandardMaterial({ color: '#1f3d22' }), group)
    nos.position.set(sx * 0.1, 0.06, surf(0.1, 0.06) - 0.005)
    const cheek = mesh(new THREE.CircleGeometry(0.1, seg(24)), new THREE.MeshStandardMaterial({ color: '#f48aa8', roughness: 0.9 }), group)
    const cp = V3(sx * 0.5, -0.12, surf(0.5, -0.12) + 0.004)
    cheek.position.copy(cp); cheek.lookAt(V3(cp.x / R.x ** 2, cp.y / R.y ** 2, cp.z / R.z ** 2).normalize().add(cp))
  }
  // the red forked tongue, flicking out of the mouth
  const s = new THREE.Shape()
  s.moveTo(-0.045, 0); s.lineTo(-0.045, -0.4); s.lineTo(-0.14, -0.62); s.lineTo(-0.075, -0.62); s.lineTo(0, -0.47)
  s.lineTo(0.075, -0.62); s.lineTo(0.14, -0.62); s.lineTo(0.045, -0.4); s.lineTo(0.045, 0); s.closePath()
  const tongue = new THREE.Group(); tongue.name = 'tongue'; tongue.position.set(0, -0.27, surf(0, -0.27) - 0.12); group.add(tongue)
  const tm = mesh(extrude(s, 0.035, { bevel: 0.008 }), cut('#e53935'), tongue)
  tm.rotation.x = -1.21
  return { group, pupils, tongue }
}

// ---------- cards ----------
function cardCanvas(id) {
  const { c, g } = P.canvas(512, 716)
  if (id === 'back') P.drawCardBack(g, 512, 716)
  else if (id === 'P1') drawParachute(g, 512, 716)
  else P.drawCard(g, id, 512, 716)
  return c
}
/** The Parachute card in a blue protection frame, with a big parachute picture. */
function drawParachute(g, w, h) {
  const k = w / 256, card = CARD.P1
  g.fillStyle = '#ffffff'; P.roundRect(g, 0, 0, w, h, 18 * k); g.fill()
  g.fillStyle = BLUE; P.roundRect(g, 4 * k, 4 * k, w - 8 * k, h - 8 * k, 16 * k); g.fill()
  g.fillStyle = '#ffffff'; P.roundRect(g, 11 * k, 11 * k, w - 22 * k, h - 22 * k, 11 * k); g.fill()
  g.strokeStyle = BLUE; g.lineWidth = 1.5 * k; P.roundRect(g, 16 * k, 16 * k, w - 32 * k, h - 32 * k, 8 * k); g.stroke()
  // the category chip with its shield, the name and PROTECTION
  g.fillStyle = BLUE; g.beginPath(); g.arc(42 * k, 44 * k, 18 * k, 0, Math.PI * 2); g.fill()
  P.drawIcon(g, 'cat-P', 42 * k, 44 * k, 26 * k, '#ffffff')
  g.fillStyle = P.INK; g.textAlign = 'left'; g.textBaseline = 'middle'
  g.font = `bold ${25 * k}px ${P.FONT}`; g.fillText(card.name, 68 * k, 38 * k)
  g.font = `bold ${11.5 * k}px ${P.FONT}`; g.fillStyle = BLUE; g.fillText('PROTECTION', 68 * k, 60 * k)
  // the picture: sky, clouds and a blue parachute carrying a pawn down gently
  const px = 26 * k, py = 76 * k, pw = w - 52 * k, ph = 132 * k
  g.save(); P.roundRect(g, px, py, pw, ph, 12 * k); g.clip()
  const sky = g.createLinearGradient(0, py, 0, py + ph); sky.addColorStop(0, '#cfe8fb'); sky.addColorStop(1, '#f2f9ff')
  g.fillStyle = sky; g.fillRect(px, py, pw, ph)
  g.fillStyle = '#ffffff'
  for (const [cx, cy, r] of [[px + 30 * k, py + 104 * k, 14], [px + 48 * k, py + 100 * k, 18], [px + 66 * k, py + 106 * k, 12], [px + 168 * k, py + 34 * k, 10], [px + 182 * k, py + 30 * k, 13], [px + 196 * k, py + 36 * k, 9]]) { g.beginPath(); g.arc(cx, cy, r * k, 0, Math.PI * 2); g.fill() }
  const cx = px + pw / 2, cy = py + 58 * k, R = 62 * k
  // canopy: alternating blue gores with a scalloped hem
  const gores = 6
  for (let i = 0; i < gores; i++) {
    const a0 = Math.PI + (i / gores) * Math.PI, a1 = Math.PI + ((i + 1) / gores) * Math.PI
    g.fillStyle = i % 2 ? '#7cc0f0' : BLUE
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, a0, a1); g.closePath(); g.fill()
  }
  g.fillStyle = sky
  for (let i = 0; i < gores; i++) { const x0 = cx - R + (i + 0.5) * (2 * R / gores); g.beginPath(); g.ellipse(x0, cy + 1 * k, R / gores, 7 * k, 0, 0, Math.PI); g.fill() }
  g.strokeStyle = '#1b5f99'; g.lineWidth = 2 * k
  g.beginPath(); g.arc(cx, cy, R, Math.PI, 0); g.stroke()
  // strings and the pawn
  const py2 = cy + 50 * k
  g.lineWidth = 1.2 * k; g.strokeStyle = '#4c5866'
  g.beginPath(); for (let i = 0; i <= gores; i++) { g.moveTo(cx - R + i * (2 * R / gores), cy + 4 * k); g.lineTo(cx, py2 - 6 * k) } g.stroke()
  g.fillStyle = P.PLAYER_COLORS[0]
  g.beginPath(); g.arc(cx, py2 - 2 * k, 7 * k, 0, Math.PI * 2); g.fill()
  g.beginPath(); g.moveTo(cx - 6 * k, py2 + 2 * k); g.lineTo(cx + 6 * k, py2 + 2 * k); g.lineTo(cx + 10 * k, py2 + 20 * k); g.lineTo(cx - 10 * k, py2 + 20 * k); g.closePath(); g.fill()
  g.restore()
  g.strokeStyle = BLUE; g.lineWidth = 2.5 * k; P.roundRect(g, px, py, pw, ph, 12 * k); g.stroke()
  // the rule and the footer
  g.fillStyle = P.INK; g.font = `${16.5 * k}px ${P.FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'
  P.wrapText(g, card.text, w - 56 * k).slice(0, 4).forEach((l, i) => g.fillText(l, w / 2, (234 + i * 20) * k))
  g.fillStyle = BLUE; g.font = `bold ${12 * k}px ${P.FONT}`; g.fillText('PROTECTION CARD', w / 2, h - 30 * k)
  P.drawIcon(g, 'P3', w / 2, h - 50 * k, 18 * k, BLUE)
}
const CARD_W = 2.4, CARD_H = 3.36
function cardMesh(faceTex, backTex, { w = CARD_W, h = CARD_H, t = 0.05 } = {}) {
  const group = new THREE.Group()
  const shape = roundRect(w, h, 0.17 * (w / CARD_W))
  mesh(extrude(shape, t, { bevel: 0 }), [paper('#fbfaf6'), edge('#f3eee4', 0.95)], group)
  const print = map => new THREE.MeshStandardMaterial({ map, roughness: 0.5 })
  const front = mesh(fitUV(new THREE.ShapeGeometry(shape, seg(12))), print(faceTex), group)
  front.position.z = t / 2 + 0.003
  const back = mesh(fitUV(new THREE.ShapeGeometry(shape, seg(12))), print(backTex), group)
  back.rotation.y = Math.PI; back.position.z = -t / 2 - 0.003
  return group
}
function buildCards(root) {
  const group = new THREE.Group(); group.name = 'cards'; root.add(group)
  const backTex = role(tex(cardCanvas('back')), 'print')
  // a fan of giant cards standing in a cardboard holder, the Parachute card in front
  const fan = new THREE.Group()
  fan.position.set(-3.3, PLINTH, 6.2); fan.rotation.set(0, 0.34, 0)
  group.add(fan)
  const lean = new THREE.Group(); lean.rotation.x = -0.17; fan.add(lean)
  const FAN = [['B3', 0.3], ['D4', 0.15], ['H2', 0.0], ['M1', -0.15]]
  FAN.forEach(([id, a], i) => {
    const pivot = new THREE.Group(); pivot.rotation.z = a; pivot.position.set(0, 0.5, -0.1 * (FAN.length - i)); lean.add(pivot)
    const c = cardMesh(role(tex(cardCanvas(id)), 'print'), backTex)
    c.position.y = CARD_H / 2 - 0.4
    pivot.add(c)
  })
  const hero = new THREE.Group(); hero.rotation.set(0.06, 0, -0.06); hero.position.set(0.15, 0, 0.12); lean.add(hero)
  const p1 = cardMesh(role(tex(cardCanvas('P1')), 'print'), backTex, { w: CARD_W * 1.08, h: CARD_H * 1.08 })
  p1.position.y = (CARD_H * 1.08) / 2 + 0.02
  hero.add(p1)
  const holder = mesh(G.boxUV(new RoundedBoxGeometry(3.5, 0.5, 0.8, seg(3), 0.12), 0.4), paper(pastel(TIERS[0], 0.15)), fan)
  holder.position.set(0, 0.25, 0.05)
  // the draw pile: a squared-up stack of card backs on the floor
  const pile = new THREE.Group(); pile.position.set(-4.75, PLINTH, 8.1); pile.rotation.y = 0.35; group.add(pile)
  for (let i = 0; i < 7; i++) {
    const c = cardMesh(backTex, backTex, { w: 1.5, h: 2.1, t: 0.06 })
    c.rotation.set(-Math.PI / 2, 0, jit(0.06))
    c.position.set(jit(0.03), 0.035 + i * 0.068, jit(0.03))
    pile.add(c)
  }
  return group
}

// ---------- pawns, the pink friend, dice ----------
// the game's pawn profile, turned smoothly and covered in coloured card
const PAWN = [[0, 0], [0.17, 0], [0.18, 0.03], [0.16, 0.06], [0.11, 0.09], [0.085, 0.2], [0.065, 0.3], [0.1, 0.32], [0.1, 0.34], [0.05, 0.36], [0, 0.36]]
function pawnMesh(color, parent, scale = 3.3) {
  const g = new THREE.Group(); g.scale.setScalar(scale); parent.add(g)
  const mat = paper(color, { rough: 0.6, map: FIBRE_FINE })
  mesh(new THREE.LatheGeometry(PAWN.map(([x, y]) => new THREE.Vector2(x, y)), seg(64)), mat, g)
  const head = mesh(new THREE.SphereGeometry(0.1, seg(40), seg(28)), mat, g); head.position.y = 0.44
  return g
}
function blob(parent, at) {
  // a small pink round friend with cute eyes
  const g = new THREE.Group(); parent.add(g)
  const body = new THREE.Group(); body.name = 'friend'; g.add(body)
  const R = V3(0.62, 0.56, 0.59), cy = 0.6
  const pink = paper('#f7a6c8', { rough: 0.75 })
  const ball = mesh(new THREE.SphereGeometry(1, seg(48), seg(32)), pink, body); ball.scale.copy(R); ball.position.y = cy
  const surf = (x, y) => R.z * Math.sqrt(Math.max(0, 1 - (x / R.x) ** 2 - ((y - cy) / R.y) ** 2))
  for (const sx of [-1, 1]) {
    const foot = mesh(new THREE.SphereGeometry(0.2, seg(20), seg(14)), paper('#ee86b2'), g); foot.scale.set(1.15, 0.55, 1.4); foot.position.set(sx * 0.27, 0.08, 0.2)
    const ey = cy + 0.1, ex = sx * 0.2
    const eye = mesh(new THREE.SphereGeometry(0.1, seg(20), seg(16)), new THREE.MeshStandardMaterial({ color: '#1d1717', roughness: 0.3 }), body)
    eye.scale.set(0.82, 1.2, 0.45); eye.position.set(ex, ey, surf(ex, ey) - 0.01)
    const shine = mesh(new THREE.SphereGeometry(0.03, seg(10), seg(8)), new THREE.MeshBasicMaterial({ color: '#ffffff' }), body)
    shine.position.set(ex + 0.025, ey + 0.05, surf(ex, ey) + 0.035)
    const cheek = mesh(new THREE.CircleGeometry(0.085, seg(24)), new THREE.MeshStandardMaterial({ color: '#f06292', roughness: 0.9 }), body)
    const cp = V3(sx * 0.36, cy - 0.06, surf(sx * 0.36, cy - 0.06) + 0.004)
    cheek.position.copy(cp); cheek.lookAt(V3(cp.x / R.x ** 2, (cp.y - cy) / R.y ** 2, cp.z / R.z ** 2).normalize().add(cp))
  }
  const mouth = mesh(new THREE.TorusGeometry(0.06, 0.016, seg(8), seg(20), Math.PI), new THREE.MeshStandardMaterial({ color: '#7a2742' }), body)
  mouth.position.set(0, cy - 0.04, surf(0, cy - 0.04) - 0.005); mouth.rotation.z = Math.PI
  // a paper sprout on top
  const stem = new THREE.CylinderGeometry(0.02, 0.025, 0.2, seg(8)); stem.translate(0, cy + R.y + 0.08, 0)
  mesh(stem, paper(GREEN), body)
  for (const sx of [-1, 1]) {
    const leaf = new THREE.Shape(); leaf.moveTo(0, 0); leaf.quadraticCurveTo(0.12, 0.1, 0.24, 0); leaf.quadraticCurveTo(0.12, -0.08, 0, 0)
    const l = mesh(extrude(leaf, 0.02, { bevel: 0.005 }), cut('#7fd19b'), body)
    l.position.set(0, cy + R.y + 0.17, 0); l.rotation.set(0, sx > 0 ? 0 : Math.PI, 0.45)
  }
  g.position.copy(at)
  return { group: g, body }
}
function diceTexture() {
  // the game's dice atlas layout with black pips
  const size = 256, { c, g } = P.canvas(size * 3, size * 2)
  const pips = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }
  const fib = P.fibreCanvas(256, 23)
  P.DIE_FACES.forEach((v, i) => {
    const x = (i % 3) * size, y = Math.floor(i / 3) * size
    g.fillStyle = '#fdfcf8'; g.fillRect(x, y, size, size)
    g.globalCompositeOperation = 'multiply'; g.drawImage(fib, x, y, size, size); g.globalCompositeOperation = 'source-over'
    for (const [px, py] of pips[v]) {
      const r = size * (v === 1 ? 0.13 : 0.085)
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(x + size / 2 + px * size * 0.26 + 3, y + size / 2 + py * size * 0.26 + 3, r, 0, Math.PI * 2); g.fill()
      g.fillStyle = '#1d1a17'; g.beginPath(); g.arc(x + size / 2 + px * size * 0.26, y + size / 2 + py * size * 0.26, r, 0, Math.PI * 2); g.fill()
    }
  })
  return role(tex(c), 'print')
}
function swoosh(r0, r1, a0, a1) {
  const s = new THREE.Shape()
  s.absarc(0, 0, r1, a0, a1, false)
  s.absarc(0, 0, r0, a1, a0, true)
  s.closePath()
  return s
}
function startCanvas() {
  const W = 768, H = 604, { c, g } = P.canvas(W, H)
  g.fillStyle = '#fbf1d8'; g.fillRect(0, 0, W, H)
  g.globalCompositeOperation = 'multiply'; g.drawImage(P.fibreCanvas(512, 31), 0, 0, W, H); g.globalCompositeOperation = 'source-over'
  g.strokeStyle = '#d9b88a'; g.lineWidth = 16; g.strokeRect(8, 8, W - 16, H - 16)
  g.setLineDash([22, 16]); g.strokeStyle = '#e8743b'; g.lineWidth = 6; P.roundRect(g, 40, 40, W - 80, H - 80, 36); g.stroke(); g.setLineDash([])
  // the top of the picture is the back of the tile: an arrow towards the board, START near the front
  g.fillStyle = 'rgba(45,58,107,0.35)'
  g.beginPath(); g.moveTo(W / 2, 70); g.lineTo(W / 2 + 46, 128); g.lineTo(W / 2 - 46, 128); g.closePath(); g.fill()
  g.font = font(168); g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillStyle = '#2d3a6b'; g.fillText('START', W / 2 + 7, 432 + 7)
  g.fillStyle = '#e8743b'; g.fillText('START', W / 2, 432)
  return c
}
function buildFront(root) {
  const left = new THREE.Group(); left.name = 'pawns'; root.add(left)
  for (const [c, x, z] of [[P.PLAYER_COLORS[1], -3.0, 7.7], [P.PLAYER_COLORS[3], -1.0, 8.35]]) {
    const g = new THREE.Group(); g.position.set(x, PLINTH, z); left.add(g); pawnMesh(c, g)
  }
  // the START tile in the front right, a green pawn and the pink friend on it
  const right = new THREE.Group(); right.name = 'start'; root.add(right)
  const st = new THREE.BoxGeometry(2.8, 0.16, 2.2)
  const uv = st.attributes.uv
  for (let i = 0; i < uv.count; i++) if (i < 8 || i >= 12) uv.setXY(i, 0.005, 0.5)
  st.translate(3.55, PLINTH + 0.08, 7.3)
  mesh(st, new THREE.MeshStandardMaterial({ map: role(tex(startCanvas()), 'print'), roughness: 0.85 }), right)
  const topY = PLINTH + 0.16
  const green = new THREE.Group(); green.position.set(2.85, topY, 6.78); right.add(green); pawnMesh(P.PLAYER_COLORS[2], green)
  const friend = blob(right, V3(4.3, topY, 6.9))
  friend.group.rotation.y = -0.25
  // two oversized dice mid-roll: one tipping on an edge, one in the air, with paper speed lines
  const dmat = new THREE.MeshStandardMaterial({ map: diceTexture(), roughness: 0.38 })
  const DIE = 1.75
  const dieA = mesh(G.dieGeometry(DIE), dmat, right); dieA.name = 'dieA'
  dieA.rotation.set(0.35, 0.55, Math.PI / 4 - 0.1)
  dieA.position.set(1.1, 0, 7.9)
  dieA.updateMatrixWorld(); const bb = new THREE.Box3().setFromObject(dieA); dieA.position.y = PLINTH - bb.min.y
  const dieB = mesh(G.dieGeometry(DIE), dmat, right); dieB.name = 'dieB'
  dieB.position.set(2.05, 3.75, 6.2); dieB.rotation.set(0.75, 0.35, 0.5)
  const lines = new THREE.Group(); lines.position.copy(dieB.position); lines.rotation.y = 0.3; lines.scale.setScalar(DIE / 1.15); right.add(lines)
  for (const [r, a0, a1] of [[1.0, 0.25, 1.05], [1.28, 0.38, 1.0], [1.56, 0.5, 0.92]]) {
    const m = mesh(extrude(swoosh(r, r + 0.11, a0, a1), 0.05, { bevel: 0.01 }), cut('#fffdf8'), lines)
    void m
  }
  const puff = new THREE.Group(); puff.position.set(dieA.position.x, PLINTH + 0.1, dieA.position.z); puff.rotation.y = 0.3; puff.scale.setScalar(DIE / 1.15); right.add(puff)
  for (const [r, a0, a1] of [[0.95, 0.15, 0.7], [1.2, 0.2, 0.6]]) mesh(extrude(swoosh(r, r + 0.09, a0, a1), 0.04, { bevel: 0.01 }), cut('#fffdf8'), puff)
  return { friend, dieB, dieBRest: dieB.rotation.clone(), dieBY: dieB.position.y, lines, dieA, dieARest: dieA.quaternion.clone() }
}

// ---------- the layered backdrop ----------
function hills(base, top, amp, phase, waves = 2.2) {
  const s = new THREE.Shape(), x0 = -5.94, x1 = 5.94, N = seg(80)
  s.moveTo(x0, base); s.lineTo(x1, base)
  for (let i = N; i >= 0; i--) {
    const k = i / N, x = x0 + (x1 - x0) * k
    s.lineTo(x, top + amp * (0.65 * Math.sin(k * Math.PI * waves + phase) + 0.35 * Math.sin(k * Math.PI * waves * 2.3 + phase * 1.7)))
  }
  s.closePath()
  return s
}
function cloud(parent, x, y, z, s) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); parent.add(g)
  const mats = cut('#ffffff')
  const puffs = [[-0.75, 0, 0.5], [-0.2, 0.25, 0.7], [0.45, 0.1, 0.58], [0.95, -0.05, 0.4]]
  puffs.forEach(([px, py, r], i) => { const m = mesh(extrude(circle(r), 0.08, { bevel: 0.015 }), mats, g); m.position.set(px, py, (i % 2) * 0.03) })
  const bottom = mesh(extrude(roundRect(2.3, 0.5, 0.25), 0.08, { bevel: 0.015 }), mats, g); bottom.position.set(0.05, -0.2, 0.05)
  return g
}
function buildBackdrop(root) {
  const g = new THREE.Group(); g.name = 'backdrop'; root.add(g)
  const wall = mesh(extrude(roundRect(11.88, 11.4, 1.3), 0.12, { bevel: 0.02 }), cut('#f6ecd9'), g)
  wall.position.set(0, PLINTH + 5.7, -9.3)
  const layers = [
    [-8.75, 6.6, 0.75, 0.6, '#f8d6c0'],
    [-8.2, 5.1, 0.7, 2.1, '#d3ebd2'],
    [-7.65, 4.25, 0.5, 3.6, '#ddd3f2'],
  ]
  for (const [z, top, amp, ph, color] of layers) {
    const m = mesh(extrude(hills(PLINTH, top, amp, ph), 0.1, { bevel: 0.015 }), cut(color), g)
    m.position.z = z
  }
  cloud(g, -3.4, 8.7, -9.05, 1.1)
  cloud(g, 3.3, 10.05, -9.05, 0.95)
  cloud(g, 0.9, 7.5, -8.6, 0.7)
  cloud(g, -1.2, 10.6, -9.1, 0.6)
  return g
}

// ---------- assembly ----------
/** Builds the whole diorama; fonts should be loaded first. Returns its root, an idle animation and facts. */
export function buildDiorama({ detail = 1 } = {}) {
  DETAIL = detail
  rand = mulberry32(1886)
  FIBRE = role(tex(P.fibreCanvas(512, 7), { repeat: true }), 'fibre')
  FIBRE_FINE = role(FIBRE.clone(), 'fibre'); FIBRE_FINE.repeat.set(3, 1.5)
  LAYERS = role(tex(layersCanvas(), { repeat: true }), 'fibre'); LAYERS.repeat.set(1, 12)
  const root = new THREE.Group(); root.name = 'diorama'
  buildPlinth(root)
  buildBoard(root, role(tex(tileAtlas()), 'tiles'))
  buildBackdrop(root)
  const lad = ladderFrame()
  const ladder = buildLadder(root, lad)
  const ladderRest = ladder.quaternion.clone()
  const snake = buildSnake(root, lad)
  buildCards(root)
  const front = buildFront(root)

  const head = snake.head
  const q = new THREE.Quaternion(), e = new THREE.Euler(), qs = new THREE.Quaternion(), qa = new THREE.Quaternion()
  const m3 = new THREE.Matrix3(), m4 = new THREE.Matrix4(), off = new THREE.Vector3()
  function animate(t) {
    // the ladder rocks gently on its foot, side to side in its own plane and to and fro, and the coiled snake
    // rocks with it; the snake's neck waves on its own
    qs.setFromAxisAngle(lad.n, Math.sin(t * 0.8) * 0.02 + Math.sin(t * 1.9) * 0.004)
    qs.multiply(qa.setFromAxisAngle(lad.X, Math.sin(t * 0.55) * 0.02))
    ladder.quaternion.copy(qs).multiply(ladderRest)
    m3.setFromMatrix4(m4.makeRotationFromQuaternion(qs))
    off.set(Math.sin(t * 0.9) * 0.32, Math.sin(t * 1.3) * 0.1, Math.sin(t * 0.65) * 0.22)
    snake.sway(m3, lad.F, off)
    // the head rides on the neck: it sways and bobs, the tongue flicks, the googly pupils roll
    e.set(Math.sin(t * 1.1) * 0.05, Math.sin(t * 0.7) * 0.12, Math.sin(t * 0.9) * 0.06)
    head.group.quaternion.copy(qs).multiply(head.rest).multiply(q.setFromEuler(e))
    head.group.position.copy(head.restPos).sub(lad.F).applyQuaternion(qs).add(lad.F).add(off).add(V3(0, Math.sin(t * 1.4) * 0.05, 0))
    const flick = Math.max(0, Math.sin(t * 2.2)) ** 6
    head.tongue.scale.set(1, 1, 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.6)))
    head.tongue.rotation.x = Math.sin(t * 30) * 0.12 * flick
    for (const p of head.pupils) p.m.position.set(p.base.x + Math.sin(t * 2.3 + p.sx) * 0.035, p.base.y + Math.cos(t * 1.9 + p.sx * 2) * 0.03, p.base.z)
    // the airborne die turns slowly, the friend breathes
    front.dieB.rotation.set(front.dieBRest.x + t * 0.35, front.dieBRest.y + t * 0.22, front.dieBRest.z + t * 0.15)
    front.dieB.position.y = front.dieBY + Math.sin(t * 1.3) * 0.08
    // the die on the floor spins on its edge like a top (round the upright, so it never leaves the floor)
    front.dieA.quaternion.copy(front.dieARest).premultiply(q.setFromAxisAngle(UP, t * 1.1))
    const b = 1 + Math.sin(t * 2.4) * 0.025
    front.friend.body.scale.set(1 / Math.sqrt(b), b, 1 / Math.sqrt(b))
  }
  function rest() { animate(0) }
  rest()
  root.updateMatrixWorld(true)
  // what the Project 0 build needs to replay the animation: the ladder's frame, the snake's neck, the rests
  const facts = {
    F: lad.F.toArray(), n: lad.n.toArray(), X: lad.X.toArray(), T: lad.T.toArray(), L: lad.L, snakeLength: snake.length, tExit: snake.tExit, rings: snake.rings, ringSize: snake.ringSize,
    head: { p: head.restPos.toArray(), q: head.rest.toArray(), pupils: head.pupils.map(p => p.base.toArray()) },
    dieA: front.dieARest.toArray(), dieB: [front.dieBRest.x, front.dieBRest.y, front.dieBRest.z], dieBY: front.dieBY,
  }
  return { root, animate, rest, snakeLength: snake.length, ladderLength: lad.L, facts }
}
