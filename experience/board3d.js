// The board as paper: tiers of ten cells rising like an amphitheatre (tier 1 in front, the last at the back),
// numbered cells cut out of paper, snakes and ladders as paper cut-outs draped over the steps.
// Geometry only (positions, normals, vertex colours, UVs), shared by the game and the diorama builder.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { TIER_COLORS, ATLAS, tileUV, remapDiceUV } from './paper.js'
import { snakeSwing, snakeWidth } from './rules.js'

export const B = {
  cellW: 1.0, tierD: 1.25, stepH: 0.3, base: 0.12, zFront: 5.6, half: 5.15,
  cells: 100, tiers: 10, // the board's size: setBoardSize() changes it for 50 and 70 cells
  tileW: 0.9, tileD: 1.1, tileH: 0.03,
  start: new THREE.Vector3(-4.45, 0, 6.75),
  dice: new THREE.Vector3(2.9, 0, 7.45), // the dice pad's centre
}
export const tierTop = t => B.base + (t + 1) * B.stepH
export const tierZ = t => B.zFront - (t + 0.5) * B.tierD
/** Sets the board's size (50, 70 or 100 cells) for every function here. */
export function setBoardSize(n) { B.cells = n; B.tiers = Math.round(n / 10) }
/** The z of the board's back edge. */
export const backZ = () => B.zFront - B.tiers * B.tierD
const BLANK_UV = [(ATLAS.blank[0] + ATLAS.blank[2]) / 2, 1 - (ATLAS.blank[1] + ATLAS.blank[3]) / 2]

/** Centre of a cell's top surface (0 is the start pad in front of the board). */
export function cellPos(c, out = new THREE.Vector3()) {
  if (c <= 0) return out.set(B.start.x, B.base + 0.05, B.start.z)
  const n = Math.min(B.cells, c)
  const t = Math.floor((n - 1) / 10), i = (n - 1) % 10
  const col = t % 2 === 0 ? i : 9 - i
  return out.set(-4.5 + col * B.cellW, tierTop(t) + B.tileH, tierZ(t))
}
/** The cell under a point of the board, or null. */
export function cellAt(x, z) {
  const tf = (B.zFront - z) / B.tierD
  const t = Math.floor(tf)
  const col = Math.round(x + 4.5)
  if (t < 0 || t > B.tiers - 1 || col < 0 || col > 9 || Math.abs(x - (-4.5 + col)) > 0.5) return null
  const i = t % 2 === 0 ? col : 9 - col
  return t * 10 + i + 1
}
const smooth = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
/** Height of paper laid over the steps: it leans against each riser instead of cutting through it. */
export function drapeY(z) {
  const tf = (B.zFront - z) / B.tierD
  const w = 0.3
  let y = tierTop(0) + B.tileH
  for (let k = 1; k < B.tiers; k++) y += B.stepH * smooth((tf - (k - w)) / w)
  return y
}
/** Height a piece of radius r stands at over z: the highest paper under its foot, so it never sinks into a step. */
export function standY(z, r = 0.2) {
  return Math.max(drapeY(z - r), drapeY(z - r / 2), drapeY(z), drapeY(z + r / 2), drapeY(z + r))
}

// ---------- a tiny mesh builder: non-indexed triangles with flat colours ----------
class Builder {
  constructor() { this.p = []; this.c = []; this.uv = [] }
  tri(a, b, c, col, uva = BLANK_UV, uvb = BLANK_UV, uvc = BLANK_UV) {
    this.p.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
    for (let k = 0; k < 3; k++) this.c.push(col.r, col.g, col.b)
    this.uv.push(...uva, ...uvb, ...uvc)
  }
  /** Quad a b c d counter-clockwise seen from the front. */
  quad(a, b, c, d, col, uv = null) {
    if (uv) { this.tri(a, b, c, col, uv[0], uv[1], uv[2]); this.tri(a, c, d, col, uv[0], uv[2], uv[3]) }
    else { this.tri(a, b, c, col); this.tri(a, c, d, col) }
  }
  geometry({ worldUV = 0 } = {}) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.computeVertexNormals()
    if (worldUV) boxUV(g, worldUV)
    return g
  }
}
const V = (x, y, z) => new THREE.Vector3(x, y, z)
export const col = (hex, k = 1, mixWhite = 0) => {
  const c = new THREE.Color(hex)
  if (mixWhite) c.lerp(new THREE.Color('#ffffff'), mixWhite)
  return c.multiplyScalar(k)
}

/** Planar UVs from world position by the face's main axis (for the tiling fibre texture). */
export function boxUV(g, scale = 0.35) {
  const p = g.attributes.position, n = g.attributes.normal
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i))
    let u, v
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i) } else if (ax >= az) { u = p.getZ(i); v = p.getY(i) } else { u = p.getX(i); v = p.getY(i) }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

function box(b, x0, x1, y0, y1, z0, z1, top, front, side, back = side, bottom = false) {
  // top
  b.quad(V(x0, y1, z1), V(x1, y1, z1), V(x1, y1, z0), V(x0, y1, z0), top)
  // front (+z) and back (-z)
  b.quad(V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1), front)
  b.quad(V(x1, y0, z0), V(x0, y0, z0), V(x0, y1, z0), V(x1, y1, z0), back)
  // sides
  b.quad(V(x0, y0, z0), V(x0, y0, z1), V(x0, y1, z1), V(x0, y1, z0), side)
  b.quad(V(x1, y0, z1), V(x1, y0, z0), V(x1, y1, z0), V(x1, y1, z1), side)
  if (bottom) b.quad(V(x0, y0, z0), V(x1, y0, z0), V(x1, y0, z1), V(x0, y0, z1), side)
}

/** The table, the ten tiers, the start pad and the dice pad (paper material, world UVs). */
export function buildTiers({ tableColor = '#e9e2d4', lot = { width: 12, depth: 19 } } = {}) {
  const b = new Builder()
  const hw = lot.width / 2 - 0.25, hd = lot.depth / 2 - 0.25
  const table = col(tableColor)
  box(b, -hw, hw, 0, B.base, -hd, hd, table, col(tableColor, 0.86), col(tableColor, 0.9), col(tableColor, 0.86))
  for (let t = 0; t < B.tiers; t++) {
    const c = TIER_COLORS[t]
    const z1 = B.zFront - t * B.tierD, z0 = z1 - B.tierD
    box(b, -B.half, B.half, B.base, tierTop(t), z0, z1, col(c, 0.92), col(c, 0.78), col(c, 0.86), col(c, 0.7))
    // the white cut edge along the riser's top
    const y = tierTop(t)
    b.quad(V(-B.half, y - 0.035, z1 + 0.003), V(B.half, y - 0.035, z1 + 0.003), V(B.half, y, z1 + 0.003), V(-B.half, y, z1 + 0.003), col('#ffffff', 0.98))
  }
  // start pad and dice pad: raised paper sheets
  const pad = (cx, cz, w, d, c, h = 0.04) => box(b, cx - w / 2, cx + w / 2, B.base, B.base + h, cz - d / 2, cz + d / 2, col(c), col(c, 0.8), col(c, 0.85))
  pad(B.start.x, B.start.z, 1.5, 1.4, '#fff4d6')
  pad(B.dice.x, B.dice.z, 4.4, 2.5, '#9cc7ef', 0.03)
  pad(B.dice.x, B.dice.z, 4.0, 2.1, '#f6fbff', 0.045)
  return b.geometry({ worldUV: 0.32 })
}

/** The hundred numbered cells (the atlas material). */
export function buildTiles() {
  const b = new Builder()
  for (let n = 1; n <= B.cells; n++) {
    const p = cellPos(n)
    const t = Math.floor((n - 1) / 10)
    const base = TIER_COLORS[t]
    const c = n === B.cells ? col('#ffd54a') : col(base, 1, n % 2 ? 0.55 : 0.38)
    const x0 = p.x - B.tileW / 2, x1 = p.x + B.tileW / 2, z0 = p.z - B.tileD / 2, z1 = p.z + B.tileD / 2
    const y1 = p.y, y0 = y1 - B.tileH
    const [u0, v0, u1, v1] = tileUV(n)
    b.quad(V(x0, y1, z1), V(x1, y1, z1), V(x1, y1, z0), V(x0, y1, z0), c, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]])
    const side = c.clone().multiplyScalar(0.8)
    b.quad(V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1), side)
    b.quad(V(x0, y0, z0), V(x0, y0, z1), V(x0, y1, z1), V(x0, y1, z0), side)
    b.quad(V(x1, y0, z1), V(x1, y0, z0), V(x1, y1, z0), V(x1, y1, z1), side)
    b.quad(V(x1, y0, z0), V(x0, y0, z0), V(x0, y1, z0), V(x1, y1, z0), side)
  }
  // START and DICE labels from the atlas strip
  const label = (cx, cz, w, d, rect, c) => {
    const y = B.base + 0.05
    const [u0, v0, u1, v1] = [rect[0] / 1024, 1 - rect[3] / 1024, rect[2] / 1024, 1 - rect[1] / 1024]
    b.quad(V(cx - w / 2, y, cz + d / 2), V(cx + w / 2, y, cz + d / 2), V(cx + w / 2, y, cz - d / 2), V(cx - w / 2, y, cz - d / 2), col(c), [[u0, v0], [u1, v0], [u1, v1], [u0, v1]])
  }
  label(B.start.x, B.start.z + 0.42, 1.3, 0.33, ATLAS_LABELS.start, '#f7c548')
  label(B.dice.x - 1.35, B.dice.z + 0.8, 1.2, 0.3, ATLAS_LABELS.dice, '#7fb2f0')
  return b.geometry()
}
export const ATLAS_LABELS = { start: [4, 962, 236, 1022], dice: [244, 962, 476, 1022] }

// ---------- snakes and ladders ----------
export const SNAKE_COLORS = [
  ['#3fae49', '#256b2c'], ['#7b4fd6', '#4a2b99'], ['#e0533d', '#9c2b1b'], ['#1f8fbf', '#0f5675'],
  ['#f08a24', '#a8540a'], ['#c2368f', '#7d1a5a'], ['#6b8f2a', '#3f5714'], ['#2b5fbf', '#173a80'],
]
// colours that look alike (greens, purples, reds, blues): snakes that cross take ones from different groups
const SNAKE_HUE = [0, 1, 2, 3, 2, 1, 0, 3]
const LIFT = 0.035, THICK = 0.022
const FLAT = () => 0

/**
 * A strip of paper along pts ([{x, z}] the centre line; widths per point, colors per segment). Across, it is
 * cut into strips no wider than STRIP, so where it crosses a step at a slant it bends with the step instead
 * of cutting through it as a flat quad. Returns at(i, t): the point of row i at t from the left edge (0) to
 * the right (1), on the paper.
 */
const STRIP = 0.075
function ribbon(b, pts, widths, colors, lift, { walls = true, up = FLAT } = {}) {
  const K = Math.max(1, Math.ceil(Math.max(...widths) / STRIP))
  const rows = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], c = pts[Math.min(pts.length - 1, i + 1)]
    let tx = c.x - a.x, tz = c.z - a.z
    const l = Math.hypot(tx, tz) || 1
    tx /= l; tz /= l
    const nx = -tz, nz = tx, w = widths[i] / 2
    const row = []
    for (let k = 0; k <= K; k++) {
      const o = w * (1 - 2 * k / K), x = pts[i].x + nx * o, z = pts[i].z + nz * o
      row.push(V(x, drapeY(z) + lift + up(x, z), z))
    }
    rows.push(row)
  }
  for (let i = 0; i + 1 < pts.length; i++) {
    const c = colors[i], r0 = rows[i], r1 = rows[i + 1]
    for (let k = 0; k < K; k++) b.quad(r0[k], r1[k], r1[k + 1], r0[k + 1], c)
    if (walls) {
      const dc = c.clone().multiplyScalar(0.7)
      const d = v => V(v.x, drapeY(v.z) + lift - THICK, v.z) // a raised edge reaches down to the board
      b.quad(d(r1[0]), r1[0], r0[0], d(r0[0]), dc)
      b.quad(d(r0[K]), r0[K], r1[K], d(r1[K]), dc)
    }
  }
  const at = (i, t) => {
    const s = Math.min(K - 1e-6, Math.max(0, t * K)), k = Math.floor(s)
    return rows[i][k].clone().lerp(rows[i][k + 1], s - k)
  }
  return { at }
}
function disc(b, cx, cz, rx, rz, ang, lift, c, seg = 14, wall = false, flatY = null, up = FLAT) {
  const ca = Math.cos(ang), sa = Math.sin(ang)
  const at = (k) => {
    const a = (k / seg) * Math.PI * 2
    const x = cx + Math.cos(a) * rx * ca - Math.sin(a) * rz * sa
    const z = cz + Math.cos(a) * rx * sa + Math.sin(a) * rz * ca
    return V(x, flatY ?? drapeY(z) + lift + up(x, z), z)
  }
  const mid = V(cx, flatY ?? drapeY(cz) + lift + up(cx, cz), cz)
  for (let k = 0; k < seg; k++) {
    const p = at(k), q = at(k + 1)
    b.tri(mid, q, p, c)
    if (wall) {
      const dc = c.clone().multiplyScalar(0.7)
      const d = v => V(v.x, (flatY ?? drapeY(v.z) + lift) - THICK, v.z)
      b.quad(d(q), d(p), p, q, dc)
    }
  }
}

/**
 * A snake's centre line from tail to head, its widths, and the frame of its head: shared by the cut-out,
 * the path a piece rides and the paper it covers. Dense unless lod.
 */
function snakeLine(from, to, index, lod = 0) {
  const head = cellPos(from), tail = cellPos(to)
  const dx = head.x - tail.x, dz = head.z - tail.z
  const len = Math.hypot(dx, dz) || 1
  const ux = dx / len, uz = dz / len, px = -uz, pz = ux
  const N = lod ? Math.max(10, Math.ceil(len * 3.5)) : Math.max(30, Math.ceil(len * 16))
  const pts = [], widths = []
  for (let i = 0; i <= N; i++) {
    const u = i / N, off = snakeSwing(u, len, dz, index) // the wave the board's rules check (rules.js)
    pts.push({ x: tail.x + dx * u + px * off, z: tail.z + dz * u + pz * off })
    widths.push(snakeWidth(u))
  }
  return { head, len, ux, uz, px, pz, N, pts, widths }
}

/** A snake from its head (cell `from`) down to its tail (cell `to`); color, its SNAKE_COLORS (by index if not given). */
export function snakeGeometry(from, to, index = 0, { lift = LIFT, lod = 0, up = FLAT, color = index } = {}) {
  const b = new Builder()
  const [body, dark] = SNAKE_COLORS[color % SNAKE_COLORS.length].map(h => col(h))
  const light = body.clone().lerp(new THREE.Color('#ffffff'), 0.35)
  const { head, len, ux, uz, px, pz, N, pts, widths } = snakeLine(from, to, index, lod)
  const colors = []
  for (let i = 0; i < N; i++) colors.push(Math.floor(i / N * len / 0.3) % 2 ? light : body)
  const { at } = ribbon(b, pts, widths, colors, lift, { walls: !lod, up })
  // diamonds along the back, laid on the body itself in a little grid, so they bend with it over a step
  // instead of cutting through the bend as flat ones do; f is the way from the middle to the left (1) or right (-1) edge
  const on = (j, f) => { const v = at(j, 0.5 - f / 2); v.y += 0.004; return v }
  const M = 4
  for (let i = 3; i < N - 3 && !lod; i += 4) {
    const u = i / N
    if (u < 0.2 || u > 0.9) continue
    const s = widths[i] * 0.28
    const seg = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z) || 1e-3
    const k = Math.max(1, Math.round(s * 1.6 / seg)) // the tips, k segments either way
    if (i - k < 0 || i + k > N) continue
    const f = j => s * (1 - Math.abs(j - i) / k) / (widths[j] / 2)
    for (let j = i - k; j < i + k; j++) {
      const f0 = f(j), f1 = f(j + 1)
      for (let m = 0; m < M; m++) {
        const a = 1 - 2 * m / M, c = 1 - 2 * (m + 1) / M
        b.quad(on(j, f0 * a), on(j + 1, f1 * a), on(j + 1, f1 * c), on(j, f0 * c), dark)
      }
    }
  }
  // head, eyes and tongue on the head cell
  const ang = Math.atan2(uz, ux)
  const hl = lift + 0.01
  disc(b, head.x - ux * 0.02, head.z - uz * 0.02, 0.3, 0.23, ang, hl, body, lod ? 8 : 18, !lod, null, up)
  disc(b, head.x + ux * 0.02, head.z + uz * 0.02, 0.2, 0.15, ang, hl + 0.004, dark, 14, false, null, up)
  for (const sgn of [-1, 1]) {
    const ex = head.x + ux * 0.1 + px * 0.11 * sgn, ez = head.z + uz * 0.1 + pz * 0.11 * sgn
    disc(b, ex, ez, 0.065, 0.065, 0, hl + 0.008, col('#ffffff'), 10, false, null, up)
    disc(b, ex + ux * 0.015, ez + uz * 0.015, 0.032, 0.032, 0, hl + 0.012, col('#141414'), 8, false, null, up)
  }
  const ty = z => drapeY(z) + hl
  const t0 = V(head.x + ux * 0.28, 0, head.z + uz * 0.28)
  const t1 = V(head.x + ux * 0.46 + px * 0.06, 0, head.z + uz * 0.46 + pz * 0.06)
  const t2 = V(head.x + ux * 0.46 - px * 0.06, 0, head.z + uz * 0.46 - pz * 0.06)
  const tm = V(head.x + ux * 0.4, 0, head.z + uz * 0.4)
  for (const v of [t0, t1, t2, tm]) v.y = ty(v.z) + up(v.x, v.z)
  const red = col('#e53935')
  b.tri(V(t0.x - px * 0.02, t0.y, t0.z - pz * 0.02), t1, tm, red)
  b.tri(V(t0.x + px * 0.02, t0.y, t0.z + pz * 0.02), tm, t2, red)
  return b.geometry()
}

/** A ladder from its base (cell `from`) up to its top (cell `to`). */
export function ladderGeometry(from, to, index = 0, { lift = LIFT, lod = 0, up = FLAT } = {}) {
  const b = new Builder()
  const rail = col('#b8732f'), rung = col('#e6ad5c'), arrowC = col('#43a047')
  const base = cellPos(from), top = cellPos(to)
  const dx = top.x - base.x, dz = top.z - base.z
  const len = Math.hypot(dx, dz) || 1
  const ux = dx / len, uz = dz / len, px = -uz, pz = ux
  const ext = 0.32
  const N = lod ? Math.max(4, Math.ceil(len * 2)) : Math.max(20, Math.ceil(len * 10))
  const l2 = lift + 0.01
  for (const side of [-1, 1]) {
    const pts = [], widths = [], colors = []
    for (let i = 0; i <= N; i++) {
      const s = -ext + (len + ext * 2) * (i / N)
      pts.push({ x: base.x + ux * s + px * 0.2 * side, z: base.z + uz * s + pz * 0.2 * side })
      widths.push(0.075)
      if (i < N) colors.push(rail)
    }
    ribbon(b, pts, widths, colors, l2 + 0.006, { walls: !lod, up })
  }
  const step = lod ? 0.6 : 0.3
  for (let s = -ext + 0.1; s <= len + ext - 0.05; s += step) {
    const pts = []
    for (let k = 0, n = lod ? 1 : 4; k <= n; k++) {
      const o = -0.2 + (0.4 / n) * k
      pts.push({ x: base.x + ux * s + px * o, z: base.z + uz * s + pz * o })
    }
    ribbon(b, pts, pts.map(() => 0.06), pts.slice(1).map(() => rung), l2, { walls: false, up })
  }
  // an up arrow on the base cell, beside the ladder's foot
  const ax = base.x - ux * 0.36, az = base.z - uz * 0.36
  const y = z => drapeY(z) + l2 + 0.012
  const tip = V(ax + ux * 0.2, 0, az + uz * 0.2), l = V(ax - ux * 0.05 + px * 0.17, 0, az - uz * 0.05 + pz * 0.17), r = V(ax - ux * 0.05 - px * 0.17, 0, az - uz * 0.05 - pz * 0.17)
  const m = V(ax + ux * 0.04, 0, az + uz * 0.04)
  for (const v of [tip, l, r, m]) v.y = y(v.z) + up(v.x, v.z)
  b.tri(tip, m, l, arrowC); b.tri(tip, r, m, arrowC)
  return b.geometry()
}

/**
 * Points along a snake from head to tail (or a ladder from base to top) where a piece rides it: dense
 * enough to follow every step, at the height of the highest paper under the piece's foot.
 */
export function elementPath(el, index, up = FLAT) {
  const from = cellPos(el[1]), to = cellPos(el[2])
  const out = []
  const at = (x, z) => new THREE.Vector3(x, standY(z) + LIFT + 0.03 + up(x, z), z)
  if (el[0] === 1) {
    const n = Math.max(24, Math.ceil(from.distanceTo(to) / 0.06))
    for (let i = 0; i <= n; i++) out.push(at(from.x + (to.x - from.x) * i / n, from.z + (to.z - from.z) * i / n))
    return out
  }
  const { pts } = snakeLine(el[1], el[2], index)
  for (let i = pts.length - 1; i >= 0; i--) out.push(at(pts[i].x, pts[i].z))
  return out
}

// paper laid over another rises a little before it reaches it, holds over it and clears it by GAP
const HOLD = 0.06, RAMP = 0.16, GAP = 0.008
/**
 * The paper an element covers, as capsules: a segment a-b with a half width r, and top, how high its paper
 * stands there over the element's own lift (a ladder's rails, a snake's head and eyes). A snake's head, its
 * tongue and its neck are also listed apart, as head, and the end of its tail as tail.
 */
const NECK = 0.5, TAIL = 0.5
function footprint(el, index) {
  const caps = [], head = [], tail = []
  if (el[0] === 0) {
    const { head: h, ux, uz, pts, widths } = snakeLine(el[1], el[2], index)
    const t = pts[0]
    for (let i = 0; i + 1 < pts.length; i++) {
      const c = { a: pts[i], b: pts[i + 1], r: Math.max(widths[i], widths[i + 1]) / 2, top: 0.004 }
      caps.push(c)
      if (Math.hypot(pts[i].x - h.x, pts[i].z - h.z) < NECK) head.push(c)
      if (Math.hypot(pts[i + 1].x - t.x, pts[i + 1].z - t.z) < TAIL) tail.push(c)
    }
    head.push({ a: h, b: h, r: 0.31, top: 0.022 })
    head.push({ a: { x: h.x + ux * 0.2, z: h.z + uz * 0.2 }, b: { x: h.x + ux * 0.47, z: h.z + uz * 0.47 }, r: 0.08, top: 0.012 })
    caps.push(...head.slice(-2))
  } else {
    const base = cellPos(el[1]), top = cellPos(el[2])
    const len = Math.hypot(top.x - base.x, top.z - base.z) || 1
    const at = s => ({ x: base.x + (top.x - base.x) / len * s, z: base.z + (top.z - base.z) / len * s })
    caps.push({ a: at(-0.32), b: at(len + 0.32), r: 0.24, top: 0.016 })
    caps.push({ a: at(-0.56), b: at(-0.2), r: 0.18, top: 0.022 }) // the up arrow
  }
  const reach = Math.max(...caps.map(c => c.r)) + HOLD + RAMP
  const box = [Infinity, -Infinity, Infinity, -Infinity]
  for (const c of caps) for (const p of [c.a, c.b]) {
    box[0] = Math.min(box[0], p.x - reach); box[1] = Math.max(box[1], p.x + reach)
    box[2] = Math.min(box[2], p.z - reach); box[3] = Math.max(box[3], p.z + reach)
  }
  return { caps, head, tail, box }
}
function segDist(x, z, { a, b }) {
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz
  const t = l2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0
  return Math.hypot(x - a.x - dx * t, z - a.z - dz * t)
}
/** Whether two sets of capsules touch (their paper overlaps), or come closer than gap. */
function touch(A, B, gap = HOLD) {
  for (const c of A) for (const d of B) {
    const r = c.r + d.r + gap
    if (segDist(c.a.x, c.a.z, d) < r || segDist(c.b.x, c.b.z, d) < r || segDist(d.a.x, d.a.z, c) < r || segDist(d.b.x, d.b.z, c) < r) return true
  }
  return false
}
const boxesMeet = (p, q) => p[0] < q[1] && q[0] < p[1] && p[2] < q[3] && q[2] < p[3]

/**
 * Where snakes and ladders cross, one lies over the other like paper over paper instead of the two
 * sharing a height and flickering: ladders on the board, snakes over them. Of two snakes that cross, the
 * one whose head lies on the other goes on top, a head is never hidden; then the one whose tail end lies on
 * the other, so where a snake leads stays in sight too; else the shorter one (it is small enough as it is:
 * it stays in sight). A snake goes over or under another whole, its neck can't slip through. For each
 * element: up(x, z), how far its paper rises there to clear what lies under it.
 */
export function stackElements(els) {
  const fps = els.map((e, i) => footprint(e, i))
  const len = i => cellPos(els[i][1]).distanceTo(cellPos(els[i][2]))
  const snakes = els.map((e, i) => i).filter(i => els[i][0] === 0)
  // which snakes each snake must lie over
  const over = new Map(snakes.map(i => [i, []]))
  for (const i of snakes) for (const j of snakes) {
    if (j <= i || !boxesMeet(fps[i].box, fps[j].box) || !touch(fps[i].caps, fps[j].caps)) continue
    const hi = touch(fps[i].head, fps[j].caps), hj = touch(fps[j].head, fps[i].caps)
    const ti = touch(fps[i].tail, fps[j].caps), tj = touch(fps[j].tail, fps[i].caps)
    const top = hi !== hj ? (hi ? i : j) : ti !== tj ? (ti ? i : j) : len(i) !== len(j) ? (len(i) < len(j) ? i : j) : j
    over.get(top).push(top === i ? j : i)
  }
  // laid from the bottom: ladders, then each snake once those it lies over are down, the longest first;
  // a ring of heads on bodies is broken by laying the longest
  const order = els.map((e, i) => i).filter(i => els[i][0] !== 0)
  const left = new Set(snakes)
  while (left.size) {
    const byLen = [...left].sort((a, b) => len(b) - len(a) || a - b)
    const next = byLen.find(i => over.get(i).every(j => !left.has(j))) ?? byLen[0]
    order.push(next); left.delete(next)
  }
  const ups = els.map(() => FLAT)
  const laid = []
  for (const i of order) {
    const fp = fps[i]
    const under = laid.filter(f => boxesMeet(f.box, fp.box))
    // the paper under a point, as a thickness across the paper: on a step's slope it takes more height
    let thick = FLAT
    if (under.length) {
      thick = (x, z) => {
        let h = 0
        for (const f of under) {
          if (x < f.box[0] || x > f.box[1] || z < f.box[2] || z > f.box[3]) continue
          let k = 0, top = 0
          for (const c of f.caps) {
            const d = segDist(x, z, c) - c.r
            const w = d <= HOLD ? 1 : smooth(1 - (d - HOLD) / RAMP)
            if (w > 0) { k = Math.max(k, w); top = Math.max(top, w * (c.top + GAP)) }
          }
          if (k > 0) h = Math.max(h, top + k * f.thick(x, z))
        }
        return h
      }
      ups[i] = (x, z) => {
        const h = thick(x, z)
        if (!h) return 0
        const slope = (drapeY(z + 0.01) - drapeY(z - 0.01)) / 0.02
        return h * Math.sqrt(1 + slope * slope)
      }
    }
    laid.push({ ...fp, thick })
  }
  return ups
}

const NEAR = 0.35
/**
 * The colour of each snake (an index into SNAKE_COLORS; null for a ladder): the next in turn, unless a snake
 * it crosses or comes close to already has one alike, then the first that differs from theirs.
 */
export function snakeColors(els) {
  const fps = els.map((e, i) => (e[0] === 0 ? footprint(e, i) : null))
  const out = els.map(() => null), n = SNAKE_COLORS.length
  let k0 = 0
  els.forEach((e, i) => {
    if (e[0] !== 0) return
    const close = out.map((c, j) => j).filter(j => out[j] != null && boxesMeet(fps[i].box, fps[j].box) && touch(fps[i].caps, fps[j].caps, NEAR))
    const near = close.map(j => out[j])
    const cross = close.filter(j => touch(fps[i].caps, fps[j].caps)).map(j => out[j])
    const unlike = (c, cs) => cs.every(o => SNAKE_HUE[o] !== SNAKE_HUE[c])
    const tries = Array.from({ length: n }, (_, k) => (k0 + k) % n)
    k0++
    // unlike every snake near, else unlike those it crosses and not the same as one near, else just not the same
    out[i] = tries.find(c => unlike(c, near)) ?? tries.find(c => unlike(c, cross) && !near.includes(c)) ??
      tries.find(c => unlike(c, cross)) ?? tries.find(c => !cross.includes(c)) ?? tries[0]
  })
  return out
}

/** A snake or a ladder for an element [type, from, to]. */
export function elementGeometry(el, index, opts = {}) {
  return el[0] === 0 ? snakeGeometry(el[1], el[2], index, opts) : ladderGeometry(el[1], el[2], index, opts)
}

// ---------- arrows from the end of each tier up to the next (10 to 11, 20 to 21...) ----------
export function tierArrowsGeometry({ lod = 0 } = {}) {
  const b = new Builder()
  const ink = col('#5b4636'), paperC = col('#fffaf0')
  for (let k = 1; k < B.tiers; k++) {
    const lo = cellPos(k * 10), hi = cellPos(k * 10 + 1)
    const side = lo.x > 0 ? 1 : -1
    const x = lo.x + side * 0.33
    const riser = (lo.z + hi.z) / 2
    const z0 = riser + 0.24, z1 = riser - 0.2
    const n = lod ? 4 : 10
    // over a swamp marker, which lies up to 0.058 over the cell
    for (const [w, lift, c] of [[0.13, 0.072, ink], [0.065, 0.08, paperC]]) {
      const pts = [], widths = [], colors = []
      for (let i = 0; i <= n; i++) { pts.push({ x, z: z0 + (z1 - z0) * (i / n) }); widths.push(w); if (i < n) colors.push(c) }
      ribbon(b, pts, widths, colors, lift, { walls: !lod && c === ink })
      // the head, pointing up the board
      const hw = w * 2.1, hl = w * 1.9
      const y = z => drapeY(z) + lift
      const tip = V(x, y(z1 - hl), z1 - hl), l = V(x - hw, y(z1), z1), r = V(x + hw, y(z1), z1)
      b.tri(tip, l, r, c)
    }
  }
  return b.geometry()
}

// ---------- card markers on cells ----------
export function markerGeometry(kind, cell, variant = 0) {
  const b = new Builder()
  const p = cellPos(cell)
  const lift = 0.05
  if (kind === 'sw') {
    const mud = col('#6b7d2a'), water = col('#4f8a6b'), light = col('#a7c97a')
    const seg = 18
    const at = (k, r) => { const a = (k / seg) * Math.PI * 2; const w = r * (1 + 0.16 * Math.sin(a * 3 + 1) + 0.08 * Math.sin(a * 5)); return V(p.x + Math.cos(a) * w * 0.42, p.y + lift, p.z + Math.sin(a) * w * 0.52) }
    const mid = V(p.x, p.y + lift, p.z)
    for (let k = 0; k < seg; k++) { b.tri(mid, at(k + 1, 1), at(k, 1), mud); const q = at(k, 1), r = at(k + 1, 1); b.quad(V(r.x, r.y - 0.02, r.z), V(q.x, q.y - 0.02, q.z), q, r, mud.clone().multiplyScalar(0.7)) }
    const mid2 = V(p.x, p.y + lift + 0.004, p.z)
    for (let k = 0; k < seg; k++) { const a = at(k, 0.68), c = at(k + 1, 0.68); a.y = c.y = mid2.y; b.tri(mid2, c, a, water) }
    for (const [ox, oz, r] of [[-0.12, -0.15, 0.05], [0.14, 0.1, 0.035], [0.02, 0.22, 0.03]]) disc(b, p.x + ox, p.z + oz, r, r, 0, 0, light, 8, false, p.y + lift + 0.008)
  } else if (kind === 'tr') {
    const mat = col('#2b8fd6'), rim = col('#f6c90e')
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2, a2 = ((k + 1) / 20) * Math.PI * 2
      const o = r => V(p.x + Math.cos(a) * r, p.y + lift + 0.09, p.z + Math.sin(a) * r)
      const o2 = r => V(p.x + Math.cos(a2) * r, p.y + lift + 0.09, p.z + Math.sin(a2) * r)
      b.tri(V(p.x, p.y + lift + 0.09, p.z), o2(0.3), o(0.3), mat)
      b.quad(o(0.3), o2(0.3), o2(0.4), o(0.4), rim)
      b.quad(V(o2(0.4).x, p.y + lift, o2(0.4).z), V(o(0.4).x, p.y + lift, o(0.4).z), o(0.4), o2(0.4), rim.clone().multiplyScalar(0.7))
    }
    // an up arrow on the mat
    const y = p.y + lift + 0.095, w = col('#ffffff')
    b.tri(V(p.x, y, p.z - 0.2), V(p.x - 0.14, y, p.z), V(p.x + 0.14, y, p.z), w)
    b.quad(V(p.x - 0.05, y, p.z + 0.15), V(p.x + 0.05, y, p.z + 0.15), V(p.x + 0.05, y, p.z), V(p.x - 0.05, y, p.z), w)
  } else if (kind === 'po') {
    const colors = [['#8e24aa', '#e1bee7'], ['#ef6c00', '#ffe0b2'], ['#00897b', '#b2dfdb'], ['#c2185b', '#f8bbd0']][variant % 4].map(h => col(h))
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2, a2 = ((k + 1) / 24) * Math.PI * 2
      const o = (r, a, h) => V(p.x + Math.cos(a) * r * 0.85, p.y + lift + h, p.z + Math.sin(a) * r)
      b.quad(o(0.28, a, 0.01), o(0.28, a2, 0.01), o(0.42, a2, 0.01), o(0.42, a, 0.01), colors[0])
      b.quad(o(0.12, a, 0.006), o(0.12, a2, 0.006), o(0.28, a2, 0.006), o(0.28, a, 0.006), colors[1])
      b.tri(V(p.x, p.y + lift + 0.004, p.z), o(0.12, a2, 0.004), o(0.12, a, 0.004), colors[0].clone().multiplyScalar(0.5))
    }
  }
  return b.geometry()
}

/** A highlight frame for a cell (target selection). */
export function cellFrameGeometry() {
  const b = new Builder()
  const w = B.tileW / 2 + 0.04, d = B.tileD / 2 + 0.04, t = 0.11, y = 0.02, c = col('#ffffff')
  b.quad(V(-w, y, d), V(w, y, d), V(w, y, d - t), V(-w, y, d - t), c)
  b.quad(V(-w, y, -d + t), V(w, y, -d + t), V(w, y, -d), V(-w, y, -d), c)
  b.quad(V(-w, y, d - t), V(-w + t, y, d - t), V(-w + t, y, -d + t), V(-w, y, -d + t), c)
  b.quad(V(w - t, y, d - t), V(w, y, d - t), V(w, y, -d + t), V(w - t, y, -d + t), c)
  return b.geometry()
}

// ---------- pieces ----------
/** A paper-and-plastic pawn, 0.5 m tall, origin at its feet. */
export function pawnGeometry() {
  const pts = [[0, 0], [0.17, 0], [0.18, 0.03], [0.16, 0.06], [0.11, 0.09], [0.085, 0.2], [0.065, 0.3], [0.1, 0.32], [0.1, 0.34], [0.05, 0.36], [0, 0.36]].map(([x, y]) => new THREE.Vector2(x, y))
  const body = new THREE.LatheGeometry(pts, 20)
  const head = new THREE.SphereGeometry(0.1, 16, 12)
  head.translate(0, 0.44, 0)
  const g = mergeGeometries([body.toNonIndexed(), head.toNonIndexed()].map(x => { x.deleteAttribute('uv'); return x }))
  g.computeVertexNormals()
  return g
}
/** A die with its pips from the dice atlas (one material), centred at its middle. */
export function dieGeometry(size = 0.5) {
  const g = new RoundedBoxGeometry(size, size, size, 3, size * 0.14)
  remapDiceUV(g)
  return g
}
