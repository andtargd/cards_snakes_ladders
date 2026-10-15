// Paper look: procedural textures (fibres, the numbered cells, dice faces), card faces and the small
// icons cards and effects use. Everything is drawn on OffscreenCanvas, so it works in the sandbox's
// worker and in the diorama builder alike.
import * as THREE from 'three'
import { CARD, CATEGORY, RARITY } from './rules.js'

export const INK = '#2b2622'
export const FONT = '"Trebuchet MS", "Segoe UI", Verdana, sans-serif'
export const TIER_COLORS = ['#f28b82', '#f7a072', '#f9cf5e', '#c5df6f', '#7fd19b', '#5fcac6', '#73a8ee', '#9d91ee', '#cf8ce4', '#ef8fb9']
export const PLAYER_COLORS = ['#e53935', '#1e88e5', '#43a047', '#fbc02d', '#8e24aa', '#fb8c00']
export const CAT_COLORS = { M: '#e8743b', D: '#7b5ce0', B: '#2aa876', H: '#d64545', P: '#2b8fd6', C: '#b58a12' }
export const RARITY_STYLE = {
  C: { frame: '#9aa0a6', bg: '#f3f1ec', stars: 0, label: 'Common' },
  U: { frame: '#3fa34d', bg: '#eaf4e4', stars: 1, label: 'Uncommon' },
  R: { frame: '#2f6fd6', bg: '#e4ecf9', stars: 2, label: 'Rare' },
  L: { frame: '#d4a017', bg: '#fbf0cc', stars: 3, label: 'Legendary' },
}

export const canvas = (w, h) => {
  const c = new OffscreenCanvas(w, h)
  return { c, g: c.getContext('2d') }
}
function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = Math.imul(n, 9); n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15; return (n >>> 0) / 4294967296 }

/** Paper fibres: a light, tileable grain to multiply over vertex colours. */
export function fibreCanvas(size = 512, seed = 7) {
  const { c, g } = canvas(size, size)
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, size, size)
  const img = g.getImageData(0, 0, size, size)
  const d = img.data
  for (let i = 0; i < size * size; i++) {
    const v = 236 + hash(i * 3 + seed) * 19
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v
  }
  g.putImageData(img, 0, 0)
  // fibres: short curved strokes, wrapped so the tile repeats
  let k = seed * 1000
  for (let i = 0; i < size * 1.4; i++) {
    const x = hash(k++) * size, y = hash(k++) * size, len = 4 + hash(k++) * 18, a = hash(k++) * Math.PI * 2
    g.strokeStyle = hash(k++) < 0.5 ? 'rgba(120,110,95,0.10)' : 'rgba(255,255,255,0.5)'
    g.lineWidth = 0.6 + hash(k++) * 0.8
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      g.beginPath()
      g.moveTo(x + ox, y + oy)
      g.quadraticCurveTo(x + ox + Math.cos(a + 0.6) * len * 0.5, y + oy + Math.sin(a + 0.6) * len * 0.5, x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len)
      g.stroke()
    }
  }
  return c
}

export function texture(c, { repeat = false, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping }
  t.anisotropy = 4
  t.needsUpdate = true
  return t
}

// ---------- the numbered cells ----------
// 10 x 10 tiles of 96 px for cells 1..100; the strips right and below are plain paper. The last cell of the
// board (100, or 50 / 70 on smaller boards) carries the finish star.
export const ATLAS = { size: 1024, tile: 96, blank: [968 / 1024, 968 / 1024, 1016 / 1024, 1016 / 1024] }
export function atlasCanvas(size = 1024, last = 100) {
  const { c, g } = canvas(size, size)
  const k = size / 1024
  g.drawImage(fibreCanvas(512, 3), 0, 0, size, size)
  const tile = ATLAS.tile * k
  for (let n = 1; n <= 100; n++) {
    const col = (n - 1) % 10, row = Math.floor((n - 1) / 10)
    const x = col * tile, y = row * tile
    g.save()
    g.translate(x + tile / 2, y + tile / 2)
    g.rotate((hash(n * 17) - 0.5) * 0.12)
    // a faint cut-paper inset
    g.strokeStyle = 'rgba(0,0,0,0.10)'
    g.lineWidth = 2 * k
    g.strokeRect(-tile * 0.42, -tile * 0.42, tile * 0.84, tile * 0.84)
    if (n < last) flowArrow(g, n, tile)
    if (n === last) {
      g.fillStyle = 'rgba(255,255,255,0.55)'
      star(g, 0, -tile * 0.06, tile * 0.36, tile * 0.16, 5)
      g.fill()
      g.fillStyle = INK
      g.font = `bold ${Math.round(30 * k)}px ${FONT}`
      g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText(String(n), 0, tile * 0.3)
    } else {
      g.fillStyle = 'rgba(43,38,34,0.85)'
      g.font = `bold ${Math.round((n < 10 ? 46 : 40) * k)}px ${FONT}`
      g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText(String(n), 0, tile * 0.04)
    }
    g.restore()
  }
  // labels in the strip under the grid: START and DICE
  const label = (x0, y0, x1, y1, text) => {
    g.fillStyle = INK
    g.font = `bold ${Math.round(44 * k)}px ${FONT}`
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(text, (x0 + x1) / 2 * k, (y0 + y1) / 2 * k + 2 * k)
  }
  label(4, 962, 236, 1022, 'START')
  label(244, 962, 476, 1022, 'DICE')
  return c
}
/**
 * A faint chevron behind a cell's number, the way the pieces go on: along the tier (right on odd tiers,
 * left on even ones) and up to the next tier from its last cell. Up the tile is towards the board's back.
 */
function flowArrow(g, n, tile) {
  const t = Math.floor((n - 1) / 10)
  const a = n % 10 === 0 ? -Math.PI / 2 : t % 2 === 0 ? 0 : Math.PI
  g.save()
  g.rotate(a)
  g.strokeStyle = 'rgba(43,38,34,0.1)'
  g.lineWidth = tile * 0.075
  g.lineCap = 'round'; g.lineJoin = 'round'
  for (const x of [-0.13, 0.11]) {
    g.beginPath()
    g.moveTo((x - 0.13) * tile, -0.25 * tile); g.lineTo((x + 0.12) * tile, 0); g.lineTo((x - 0.13) * tile, 0.25 * tile)
    g.stroke()
  }
  g.restore()
}

/** UV rectangle of a cell's tile in the atlas (v flipped for three.js). */
export function tileUV(n) {
  const col = (n - 1) % 10, row = Math.floor((n - 1) / 10)
  const t = ATLAS.tile / ATLAS.size
  return [col * t, 1 - (row + 1) * t, (col + 1) * t, 1 - row * t]
}

// ---------- dice ----------
// 3 x 2 faces; BoxGeometry face order +x, -x, +y, -y, +z, -z carries 3, 4, 1, 6, 2, 5 (opposites make 7)
export const DIE_FACES = [3, 4, 1, 6, 2, 5]
export function diceCanvas(size = 128, { gold = false } = {}) {
  const { c, g } = canvas(size * 3, size * 2)
  const pips = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }
  DIE_FACES.forEach((v, i) => {
    const x = (i % 3) * size, y = Math.floor(i / 3) * size
    g.fillStyle = gold ? '#f3c548' : '#fbfaf6'
    g.fillRect(x, y, size, size)
    g.fillStyle = gold ? '#7a4d00' : (v === 1 ? '#d83a2e' : INK)
    for (const [px, py] of pips[v]) {
      g.beginPath()
      g.arc(x + size / 2 + px * size * 0.26, y + size / 2 + py * size * 0.26, size * (v === 1 ? 0.12 : 0.09), 0, Math.PI * 2)
      g.fill()
    }
  })
  return c
}
/** Moves a BoxGeometry-like geometry's per-face UVs into the 3 x 2 dice atlas. */
export function remapDiceUV(geo) {
  const uv = geo.attributes.uv
  const groups = geo.groups
  for (let gi = 0; gi < groups.length; gi++) {
    const { start, count } = groups[gi]
    const fx = gi % 3, fy = Math.floor(gi / 3)
    const idx = geo.index
    const seen = new Set()
    for (let k = start; k < start + count; k++) {
      const vi = idx ? idx.getX(k) : k
      if (seen.has(vi)) continue
      seen.add(vi)
      const u = uv.getX(vi), v = uv.getY(vi)
      uv.setXY(vi, (fx + u) / 3, 1 - (fy + 1 - v) / 2)
    }
  }
  uv.needsUpdate = true
  geo.clearGroups()
  return geo
}
/** Rotation that shows `value` on top (before a random turn around y). */
export function dieQuaternion(value, yaw = 0) {
  const normals = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
  const n = new THREE.Vector3(...normals[DIE_FACES.indexOf(value)])
  const q = new THREE.Quaternion().setFromUnitVectors(n, new THREE.Vector3(0, 1, 0))
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(q)
}

// ---------- drawing helpers ----------
export function star(g, x, y, r1, r2, n = 5) {
  g.beginPath()
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1, a = -Math.PI / 2 + i * Math.PI / n
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
  }
  g.closePath()
}
export function roundRect(g, x, y, w, h, r) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}
export function wrapText(g, text, maxWidth) {
  const words = text.split(' ')
  const lines = []
  let line = ''
  for (const w of words) {
    const t = line ? line + ' ' + w : w
    if (g.measureText(t).width > maxWidth && line) { lines.push(line); line = w } else line = t
  }
  if (line) lines.push(line)
  return lines
}

function arrow(g, x1, y1, x2, y2, w, head = w) {
  const a = Math.atan2(y2 - y1, x2 - x1), h = head * 2.2
  g.lineWidth = w
  g.lineCap = 'round'
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2 - Math.cos(a) * h * 0.6, y2 - Math.sin(a) * h * 0.6); g.stroke()
  g.beginPath()
  g.moveTo(x2, y2)
  g.lineTo(x2 - Math.cos(a - 0.5) * h, y2 - Math.sin(a - 0.5) * h)
  g.lineTo(x2 - Math.cos(a + 0.5) * h, y2 - Math.sin(a + 0.5) * h)
  g.closePath(); g.fill()
}
/** An arc from angle a0 to a1 (canvas angles, either way round) with its head on a1, along the curve. */
function arcArrow(g, x, y, r, a0, a1, w) {
  const dir = a1 > a0 ? 1 : -1, h = w * 2.4
  const back = (h * 0.7) / r // the line stops under the head
  g.lineWidth = w
  g.lineCap = 'round'
  g.beginPath(); g.arc(x, y, r, a0, a1 - dir * back, dir < 0); g.stroke()
  // the head points along the tangent at a1, its base on the circle a little before
  const tx = -Math.sin(a1) * dir, ty = Math.cos(a1) * dir
  const nx = Math.cos(a1), ny = Math.sin(a1)
  const bx = x + Math.cos(a1 - dir * back * 1.3) * r, by = y + Math.sin(a1 - dir * back * 1.3) * r
  const tipx = bx + tx * h, tipy = by + ty * h
  g.beginPath()
  g.moveTo(tipx, tipy)
  g.lineTo(bx + nx * h * 0.55, by + ny * h * 0.55)
  g.lineTo(bx - nx * h * 0.55, by - ny * h * 0.55)
  g.closePath(); g.fill()
}
function die(g, x, y, s, v, fill = '#ffffff') {
  g.save()
  g.fillStyle = fill
  g.strokeStyle = g.strokeStyle
  roundRect(g, x - s / 2, y - s / 2, s, s, s * 0.18)
  g.fill(); g.stroke()
  const pips = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }
  g.fillStyle = g.strokeStyle
  for (const [px, py] of pips[v] || []) { g.beginPath(); g.arc(x + px * s * 0.25, y + py * s * 0.25, s * 0.08, 0, Math.PI * 2); g.fill() }
  g.restore()
}
function snakeShape(g, x, y, s, flip = false) {
  g.lineWidth = s * 0.14
  g.lineCap = 'round'
  g.beginPath()
  for (let i = 0; i <= 20; i++) {
    const t = i / 20
    const px = x - s * 0.4 + t * s * 0.8, py = y + Math.sin(t * Math.PI * 2) * s * 0.18 * (flip ? -1 : 1)
    i ? g.lineTo(px, py) : g.moveTo(px, py)
  }
  g.stroke()
  g.beginPath(); g.ellipse(x + s * 0.42, y, s * 0.13, s * 0.1, 0, 0, Math.PI * 2); g.fill()
}
/** A playing piece standing on (x, y), s tall. */
function pawn(g, x, y, s) {
  g.beginPath(); g.arc(x, y - s * 0.78, s * 0.2, 0, Math.PI * 2); g.fill()
  g.beginPath(); g.moveTo(x - s * 0.12, y - s * 0.6); g.lineTo(x + s * 0.12, y - s * 0.6); g.lineTo(x + s * 0.3, y); g.lineTo(x - s * 0.3, y); g.closePath(); g.fill()
}
function ladderShape(g, x, y, s, angle = -0.5) {
  g.save()
  g.translate(x, y); g.rotate(angle)
  g.lineWidth = s * 0.07
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(-s * 0.45, -s * 0.13); g.lineTo(s * 0.45, -s * 0.13)
  g.moveTo(-s * 0.45, s * 0.13); g.lineTo(s * 0.45, s * 0.13)
  for (let i = 0; i < 5; i++) { const px = -s * 0.36 + i * s * 0.18; g.moveTo(px, -s * 0.13); g.lineTo(px, s * 0.13) }
  g.stroke()
  g.restore()
}

/** Draws a card's or an effect's icon in a box of size s centred at x, y, in colour col. */
export function drawIcon(g, id, x, y, s, col = INK) {
  g.save()
  g.strokeStyle = col
  g.fillStyle = col
  g.lineJoin = 'round'
  g.lineCap = 'round'
  const w = s * 0.08
  g.lineWidth = w
  switch (id) {
    case 'M1': // dash: double chevron forward
      for (const dx of [-0.18, 0.12]) { g.beginPath(); g.moveTo(x + (dx - 0.12) * s, y - 0.25 * s); g.lineTo(x + (dx + 0.12) * s, y); g.lineTo(x + (dx - 0.12) * s, y + 0.25 * s); g.stroke() }
      break
    case 'M2': // setback: curved arrow back
      {
        arcArrow(g, x + s * 0.04, y + s * 0.02, s * 0.27, Math.PI * 0.25, -Math.PI * 1.02, w)
      }
      break
    case 'M3': // swap places: two opposite arrows
      arrow(g, x - s * 0.32, y - s * 0.12, x + s * 0.32, y - s * 0.12, w)
      arrow(g, x + s * 0.32, y + s * 0.14, x - s * 0.32, y + s * 0.14, w)
      break
    case 'H5': // dethrone: crown and a down arrow
      g.beginPath()
      g.moveTo(x - s * 0.3, y - s * 0.02); g.lineTo(x - s * 0.3, y - s * 0.3); g.lineTo(x - s * 0.15, y - s * 0.16)
      g.lineTo(x, y - s * 0.34); g.lineTo(x + s * 0.15, y - s * 0.16); g.lineTo(x + s * 0.3, y - s * 0.3); g.lineTo(x + s * 0.3, y - s * 0.02)
      g.closePath(); g.fill()
      arrow(g, x, y + s * 0.04, x, y + s * 0.38, w)
      break
    case 'M4': // double move
      g.font = `bold ${s * 0.42}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText('x2', x - s * 0.08, y + s * 0.02)
      arrow(g, x + s * 0.16, y + s * 0.28, x + s * 0.4, y + s * 0.28, w * 0.8)
      break
    case 'M5': { // tailgate: a piece leaps along a dashed arc to land right behind another
      pawn(g, x + s * 0.3, y + s * 0.3, s * 0.34)
      g.globalAlpha = 0.45; pawn(g, x - s * 0.36, y + s * 0.3, s * 0.26); g.globalAlpha = 1
      g.lineWidth = w * 0.375; g.setLineDash([s * 0.07, s * 0.06])
      g.beginPath(); g.moveTo(x - s * 0.34, y + s * 0.02); g.quadraticCurveTo(x - s * 0.1, y - s * 0.62, x + s * 0.08, y + s * 0.02); g.stroke()
      g.setLineDash([])
      arrow(g, x + s * 0.03, y - s * 0.1, x + s * 0.1, y + s * 0.1, w * 0.375, w * 0.75)
      break
    }
    case 'M6': { // rewind: a clock whose arrow runs back round it
      g.lineWidth = w * 0.8
      g.beginPath(); g.arc(x, y, s * 0.24, 0, Math.PI * 2); g.stroke()
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - s * 0.15); g.moveTo(x, y); g.lineTo(x - s * 0.1, y + s * 0.05); g.stroke()
      arcArrow(g, x, y, s * 0.38, -Math.PI * 0.35, -Math.PI * 1.75, w * 0.9)
      break
    }
    case 'C6': { // echo: a card, its ghost behind it, and the rings of an echo
      const cw = s * 0.26, ch = s * 0.38
      g.lineWidth = w * 0.6
      g.save(); g.translate(x + s * 0.06, y - s * 0.06); g.rotate(0.12)
      g.globalAlpha = 0.35; roundRect(g, -cw / 2, -ch / 2, cw, ch, s * 0.03); g.fill(); g.globalAlpha = 0.6; g.setLineDash([s * 0.04, s * 0.03]); g.stroke(); g.setLineDash([])
      g.restore()
      g.globalAlpha = 1
      g.fillStyle = '#ffffff'; roundRect(g, x - s * 0.2 - cw / 2, y + s * 0.04 - ch / 2, cw, ch, s * 0.03); g.fill(); g.stroke()
      g.fillStyle = col; star(g, x - s * 0.2, y + s * 0.04, s * 0.07, s * 0.03, 5); g.fill()
      g.lineWidth = w * 0.7
      for (const [r, a] of [[0.3, 0.8], [0.42, 0.45]]) { g.globalAlpha = a; g.beginPath(); g.arc(x - s * 0.02, y, s * r, -0.55, 0.55); g.stroke() }
      g.globalAlpha = 1
      break
    }
    case 'D1': die(g, x - s * 0.15, y - s * 0.1, s * 0.36, 3); die(g, x + s * 0.15, y + s * 0.12, s * 0.36, 5); break
    case 'D2':
      die(g, x, y - s * 0.08, s * 0.44, 2)
      g.font = `bold ${s * 0.2}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText('1–3', x, y + s * 0.34)
      break
    case 'D3': // heavy die: a die on a weight
      die(g, x, y - s * 0.14, s * 0.38, 6)
      g.beginPath(); g.moveTo(x - s * 0.3, y + s * 0.38); g.lineTo(x - s * 0.2, y + s * 0.12); g.lineTo(x + s * 0.2, y + s * 0.12); g.lineTo(x + s * 0.3, y + s * 0.38); g.closePath(); g.fill()
      break
    case 'D4': {
      g.strokeStyle = '#8a5a00'
      die(g, x, y, s * 0.48, 6, '#f3c548')
      g.fillStyle = '#fff6c8'; star(g, x + s * 0.3, y - s * 0.3, s * 0.12, s * 0.05, 4); g.fill()
      break
    }
    case 'D5': // choose your roll: two dice, the picked one raised with a tick under it
      g.globalAlpha = 0.4; die(g, x - s * 0.2, y + s * 0.06, s * 0.32, 2); g.globalAlpha = 1
      die(g, x + s * 0.18, y - s * 0.1, s * 0.36, 5)
      g.lineWidth = w * 0.9
      g.beginPath(); g.moveTo(x + s * 0.06, y + s * 0.24); g.lineTo(x + s * 0.15, y + s * 0.33); g.lineTo(x + s * 0.32, y + s * 0.14); g.stroke()
      break
    case 'B1': // swamp: blob and ripples
      g.beginPath(); g.ellipse(x, y + s * 0.08, s * 0.38, s * 0.2, 0, 0, Math.PI * 2); g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1
      for (const r of [0.14, 0.26]) { g.beginPath(); g.ellipse(x, y + s * 0.08, s * r * 1.3, s * r * 0.65, 0, 0, Math.PI * 2); g.stroke() }
      g.beginPath(); g.arc(x - s * 0.18, y - s * 0.2, s * 0.05, 0, Math.PI * 2); g.arc(x + s * 0.1, y - s * 0.28, s * 0.035, 0, Math.PI * 2); g.fill()
      break
    case 'B2': ladderShape(g, x, y - s * 0.16, s * 0.6, 0); arrow(g, x, y - s * 0.02, x, y + s * 0.12, w * 0.7); snakeShape(g, x, y + s * 0.28, s * 0.6); break
    case 'B3': snakeShape(g, x, y - s * 0.24, s * 0.6); arrow(g, x, y - s * 0.08, x, y + s * 0.06, w * 0.7); ladderShape(g, x, y + s * 0.24, s * 0.6, 0); break
    case 'B4': // trampoline
      g.beginPath(); g.ellipse(x, y + s * 0.12, s * 0.36, s * 0.1, 0, 0, Math.PI * 2); g.stroke()
      g.beginPath(); g.moveTo(x - s * 0.28, y + s * 0.18); g.lineTo(x - s * 0.32, y + s * 0.38); g.moveTo(x + s * 0.28, y + s * 0.18); g.lineTo(x + s * 0.32, y + s * 0.38); g.stroke()
      arrow(g, x, y + s * 0.02, x, y - s * 0.38, w)
      break
    case 'B5': // portal: two rings
      for (const dx of [-0.2, 0.2]) { g.beginPath(); g.ellipse(x + dx * s, y, s * 0.15, s * 0.26, 0, 0, Math.PI * 2); g.stroke() }
      g.globalAlpha = 0.4
      for (const dx of [-0.2, 0.2]) { g.beginPath(); g.ellipse(x + dx * s, y, s * 0.07, s * 0.15, 0, 0, Math.PI * 2); g.fill() }
      g.globalAlpha = 1
      break
    case 'B6': // earthquake: zig-zag crack
      g.beginPath(); g.moveTo(x - s * 0.1, y - s * 0.4); g.lineTo(x + s * 0.08, y - s * 0.15); g.lineTo(x - s * 0.1, y + s * 0.02); g.lineTo(x + s * 0.12, y + s * 0.2); g.lineTo(x - s * 0.02, y + s * 0.4); g.stroke()
      g.lineWidth = w * 0.6
      for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(x + sx * s * 0.25, y - s * 0.15); g.lineTo(x + sx * s * 0.4, y - s * 0.22); g.moveTo(x + sx * s * 0.25, y + s * 0.1); g.lineTo(x + sx * s * 0.42, y + s * 0.12); g.stroke() }
      break
    case 'H1': // slow down: a gauge capped at 3
      g.beginPath(); g.arc(x, y + s * 0.12, s * 0.34, Math.PI, 0); g.stroke()
      g.beginPath(); g.moveTo(x, y + s * 0.12); g.lineTo(x - s * 0.22, y - s * 0.06); g.stroke()
      g.font = `bold ${s * 0.22}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText('≤3', x, y + s * 0.34)
      break
    case 'H2': { // vanilla play: a card with a padlock on it
      const cw = s * 0.44, ch = s * 0.6
      g.save(); g.translate(x - s * 0.1, y - s * 0.06); g.rotate(-0.12)
      roundRect(g, -cw / 2, -ch / 2, cw, ch, s * 0.05); g.globalAlpha = 0.25; g.fill(); g.globalAlpha = 1; g.lineWidth = w * 0.8; g.stroke()
      star(g, 0, -s * 0.06, s * 0.08, s * 0.035, 5); g.fill()
      g.restore()
      const lx = x + s * 0.16, ly = y + s * 0.16, bw = s * 0.34, bh = s * 0.26
      g.lineWidth = w * 0.95
      g.beginPath(); g.arc(lx, ly - bh / 2, s * 0.1, Math.PI, 0); g.lineTo(lx + s * 0.1, ly - bh / 2 + s * 0.02); g.moveTo(lx - s * 0.1, ly - bh / 2 + s * 0.02); g.lineTo(lx - s * 0.1, ly - bh / 2); g.stroke()
      g.strokeStyle = '#ffffff'; g.lineWidth = w * 0.5
      roundRect(g, lx - bw / 2, ly - bh / 2, bw, bh, s * 0.04); g.fill(); g.stroke()
      g.fillStyle = '#ffffff'
      g.beginPath(); g.arc(lx, ly - s * 0.02, s * 0.04, 0, Math.PI * 2); g.fill()
      g.fillRect(lx - s * 0.015, ly - s * 0.01, s * 0.03, s * 0.08)
      break
    }
    case 'H3': // skip turn
      g.beginPath(); g.arc(x, y, s * 0.34, 0, Math.PI * 2); g.stroke()
      g.beginPath(); g.moveTo(x - s * 0.24, y + s * 0.24); g.lineTo(x + s * 0.24, y - s * 0.24); g.stroke()
      break
    case 'H4': // going backwards: a die over an arrow pointing back
      die(g, x + s * 0.06, y - s * 0.16, s * 0.34, 4)
      arrow(g, x + s * 0.34, y + s * 0.26, x - s * 0.36, y + s * 0.26, w)
      break
    case 'P1': // parachute
      g.beginPath(); g.arc(x, y - s * 0.05, s * 0.36, Math.PI, 0); g.closePath(); g.globalAlpha = 0.3; g.fill(); g.globalAlpha = 1; g.stroke()
      g.lineWidth = w * 0.5
      g.beginPath(); for (const dx of [-0.36, -0.12, 0.12, 0.36]) { g.moveTo(x + dx * s, y - s * 0.05); g.lineTo(x, y + s * 0.3) } g.stroke()
      g.fillRect(x - s * 0.06, y + s * 0.28, s * 0.12, s * 0.12)
      break
    case 'P2': // swamp boots
      g.beginPath()
      g.moveTo(x - s * 0.18, y - s * 0.38); g.lineTo(x + s * 0.06, y - s * 0.38); g.lineTo(x + s * 0.06, y + s * 0.05)
      g.lineTo(x + s * 0.34, y + s * 0.16); g.lineTo(x + s * 0.34, y + s * 0.32); g.lineTo(x - s * 0.18, y + s * 0.32); g.closePath(); g.fill()
      break
    case 'P3': // shield
      g.beginPath()
      g.moveTo(x, y - s * 0.4); g.lineTo(x + s * 0.32, y - s * 0.28); g.quadraticCurveTo(x + s * 0.3, y + s * 0.18, x, y + s * 0.4)
      g.quadraticCurveTo(x - s * 0.3, y + s * 0.18, x - s * 0.32, y - s * 0.28); g.closePath(); g.fill()
      g.strokeStyle = '#ffffff'; g.lineWidth = w * 0.8
      g.beginPath(); g.moveTo(x - s * 0.12, y); g.lineTo(x - s * 0.02, y + s * 0.1); g.lineTo(x + s * 0.14, y - s * 0.1); g.stroke()
      break
    case 'C1': { // redraw: a small stack of cards inside two arrows going round
      const cw = s * 0.2, ch = s * 0.28
      g.save(); g.translate(x - s * 0.035, y + s * 0.01); g.rotate(-0.22)
      roundRect(g, -cw / 2, -ch / 2, cw, ch, s * 0.03); g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1; g.lineWidth = w * 0.6; g.stroke()
      g.restore()
      g.save(); g.translate(x + s * 0.035, y - s * 0.01); g.rotate(0.14)
      g.fillStyle = '#ffffff'; roundRect(g, -cw / 2, -ch / 2, cw, ch, s * 0.03); g.fill(); g.lineWidth = w * 0.6; g.stroke()
      g.fillStyle = col; star(g, 0, 0, s * 0.055, s * 0.024, 4); g.fill()
      g.restore()
      const r = s * 0.37
      arcArrow(g, x, y, r, Math.PI * 0.82, Math.PI * 1.68, w * 0.9)
      arcArrow(g, x, y, r, -Math.PI * 0.18, Math.PI * 0.68, w * 0.9)
      break
    }
    case 'C2': // peek: an eye
      g.beginPath(); g.moveTo(x - s * 0.4, y); g.quadraticCurveTo(x, y - s * 0.36, x + s * 0.4, y); g.quadraticCurveTo(x, y + s * 0.36, x - s * 0.4, y); g.stroke()
      g.beginPath(); g.arc(x, y, s * 0.12, 0, Math.PI * 2); g.fill()
      break
    case 'C3': // steal: a hand taking a card
      g.save(); g.translate(x + s * 0.1, y - s * 0.12); g.rotate(0.3)
      roundRect(g, -s * 0.14, -s * 0.2, s * 0.28, s * 0.38, s * 0.04); g.stroke(); g.restore()
      g.beginPath(); g.moveTo(x - s * 0.4, y + s * 0.3); g.lineTo(x - s * 0.1, y + s * 0.3); g.quadraticCurveTo(x + s * 0.12, y + s * 0.28, x + s * 0.12, y + s * 0.12); g.stroke()
      break
    case 'C4': // swap hands: two cards crossing
      g.save(); g.translate(x - s * 0.12, y); g.rotate(-0.25); roundRect(g, -s * 0.13, -s * 0.2, s * 0.26, s * 0.38, s * 0.04); g.stroke(); g.restore()
      g.save(); g.translate(x + s * 0.12, y); g.rotate(0.25); roundRect(g, -s * 0.13, -s * 0.2, s * 0.26, s * 0.38, s * 0.04); g.stroke(); g.restore()
      arrow(g, x - s * 0.3, y - s * 0.34, x + s * 0.3, y - s * 0.34, w * 0.7)
      break
    case 'C5': { // choose your card: three cards fanned out, the middle one raised with a star
      const cw = s * 0.24, ch = s * 0.34
      g.lineWidth = w * 0.6
      for (const [dx, a] of [[-0.2, -0.32], [0.2, 0.32]]) {
        g.save(); g.translate(x + dx * s, y + s * 0.1); g.rotate(a)
        roundRect(g, -cw / 2, -ch / 2, cw, ch, s * 0.03); g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1; g.stroke()
        g.restore()
      }
      g.fillStyle = '#ffffff'; roundRect(g, x - cw / 2, y - s * 0.08 - ch / 2, cw, ch, s * 0.03); g.fill(); g.stroke()
      g.fillStyle = col; star(g, x, y - s * 0.08, s * 0.08, s * 0.035, 5); g.fill()
      break
    }
    // categories
    case 'cat-M': arrow(g, x - s * 0.3, y, x + s * 0.32, y, w * 1.4); break
    case 'cat-D': die(g, x, y, s * 0.6, 5); break
    case 'cat-B': for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if ((i + j) % 2 === 0) g.fillRect(x + i * s * 0.2 - s * 0.1, y + j * s * 0.2 - s * 0.1, s * 0.2, s * 0.2); break
    case 'cat-H': g.beginPath(); g.arc(x, y, s * 0.3, 0, Math.PI * 2); g.stroke(); g.fillRect(x - s * 0.18, y - s * 0.05, s * 0.36, s * 0.1); break
    case 'cat-P': drawIcon(g, 'P3', x, y, s, col); break
    case 'cat-C': drawIcon(g, 'C4', x, y, s, col); break
    default:
      g.font = `bold ${s * 0.4}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText('?', x, y)
  }
  g.restore()
}

/** A card face at w x h pixels (5:7). */
export function drawCard(g, cardId, w = 256, h = 358, x0 = 0, y0 = 0) {
  const card = CARD[cardId], st = RARITY_STYLE[card.rar], k = w / 256
  g.save()
  g.translate(x0, y0)
  // body
  g.fillStyle = '#ffffff'
  roundRect(g, 0, 0, w, h, 18 * k); g.fill()
  g.fillStyle = st.frame
  roundRect(g, 3 * k, 3 * k, w - 6 * k, h - 6 * k, 16 * k); g.fill()
  g.fillStyle = st.bg
  const inset = card.rar === 'C' ? 9 : 12
  roundRect(g, inset * k, inset * k, w - inset * 2 * k, h - inset * 2 * k, 11 * k); g.fill()
  if (card.rar === 'R' || card.rar === 'L') { // a second, finer frame
    g.strokeStyle = st.frame; g.lineWidth = 2 * k
    roundRect(g, 17 * k, 17 * k, w - 34 * k, h - 34 * k, 8 * k); g.stroke()
  }
  if (card.rar === 'L') { // ornament dots on the frame
    g.fillStyle = '#fff3b0'
    for (let i = 0; i < 14; i++) { const t = i / 13; g.beginPath(); g.arc(w * 0.12 + t * w * 0.76, 7.5 * k, 2.2 * k, 0, Math.PI * 2); g.arc(w * 0.12 + t * w * 0.76, h - 7.5 * k, 2.2 * k, 0, Math.PI * 2); g.fill() }
  }
  // category chip and name
  const cc = CAT_COLORS[card.cat]
  g.fillStyle = cc
  g.beginPath(); g.arc(40 * k, 42 * k, 17 * k, 0, Math.PI * 2); g.fill()
  drawIcon(g, 'cat-' + card.cat, 40 * k, 42 * k, 24 * k, '#ffffff')
  g.fillStyle = INK
  g.textAlign = 'left'; g.textBaseline = 'middle'
  let size = 25
  g.font = `bold ${size * k}px ${FONT}`
  while (g.measureText(card.name).width > w - 82 * k && size > 15) { size--; g.font = `bold ${size * k}px ${FONT}` }
  g.fillText(card.name, 64 * k, 37 * k)
  g.font = `${12 * k}px ${FONT}`
  g.fillStyle = 'rgba(43,38,34,0.65)'
  g.fillText(CATEGORY[card.cat].toUpperCase(), 64 * k, 58 * k)
  // picture
  g.fillStyle = 'rgba(255,255,255,0.75)'
  roundRect(g, 26 * k, 76 * k, w - 52 * k, 128 * k, 12 * k); g.fill()
  g.strokeStyle = cc; g.lineWidth = 2 * k
  roundRect(g, 26 * k, 76 * k, w - 52 * k, 128 * k, 12 * k); g.stroke()
  drawIcon(g, cardId, w / 2, 140 * k, 108 * k, cc)
  if (card.rar === 'R') { // a glare across the picture
    g.save(); roundRect(g, 26 * k, 76 * k, w - 52 * k, 128 * k, 12 * k); g.clip()
    const gr = g.createLinearGradient(40 * k, 76 * k, 140 * k, 204 * k)
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.56, 'rgba(255,255,255,0)')
    g.fillStyle = gr; g.fillRect(0, 0, w, h); g.restore()
  }
  // text
  g.fillStyle = INK
  g.font = `${16.5 * k}px ${FONT}`
  g.textAlign = 'center'
  const lines = wrapText(g, card.text, w - 52 * k)
  lines.slice(0, 4).forEach((l, i) => g.fillText(l, w / 2, (230 + i * 20) * k))
  // rarity and stars
  g.font = `bold ${12 * k}px ${FONT}`
  g.fillStyle = st.frame
  g.fillText(st.label.toUpperCase(), w / 2, h - 30 * k)
  for (let i = 0; i < st.stars; i++) {
    g.fillStyle = st.frame
    star(g, w / 2 + (i - (st.stars - 1) / 2) * 18 * k, h - 48 * k, 7 * k, 3 * k)
    g.fill()
  }
  g.restore()
}

/** A card's ghost, as Echo shows the card it plays again: washed out in a pale violet, with ripples and an ECHO tag. */
export function drawGhostCard(g, cardId, w = 256, h = 358) {
  const k = w / 256
  drawCard(g, cardId, w, h)
  g.save()
  roundRect(g, 0, 0, w, h, 18 * k); g.clip()
  g.globalCompositeOperation = 'saturation'
  g.fillStyle = 'hsl(0,0%,50%)'; g.globalAlpha = 0.7; g.fillRect(0, 0, w, h)
  g.globalCompositeOperation = 'source-atop'
  g.globalAlpha = 1
  const gr = g.createLinearGradient(0, 0, w * 0.4, h)
  gr.addColorStop(0, 'rgba(196,170,255,0.55)'); gr.addColorStop(1, 'rgba(140,200,255,0.5)')
  g.fillStyle = gr; g.fillRect(0, 0, w, h)
  // ripples, as on water
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2 * k
  for (let y = 14 * k; y < h; y += 15 * k) {
    g.beginPath()
    for (let x = 0; x <= w; x += 8 * k) g.lineTo(x, y + Math.sin(x / (22 * k) + y / (40 * k)) * 2.5 * k)
    g.stroke()
  }
  g.globalCompositeOperation = 'source-over'
  g.fillStyle = '#7a4fd0'
  roundRect(g, w / 2 - 44 * k, h * 0.555 - 14 * k, 88 * k, 26 * k, 13 * k); g.fill()
  g.fillStyle = '#ffffff'; g.font = `bold ${15 * k}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText('ECHO', w / 2, h * 0.555)
  g.restore()
}

/** The back of every card. */
export function drawCardBack(g, w = 256, h = 358, x0 = 0, y0 = 0) {
  const k = w / 256
  g.save(); g.translate(x0, y0)
  g.fillStyle = '#ffffff'; roundRect(g, 0, 0, w, h, 18 * k); g.fill()
  g.fillStyle = '#2d3a6b'; roundRect(g, 6 * k, 6 * k, w - 12 * k, h - 12 * k, 14 * k); g.fill()
  g.save(); roundRect(g, 6 * k, 6 * k, w - 12 * k, h - 12 * k, 14 * k); g.clip()
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 6 * k
  for (let i = -h; i < w + h; i += 22 * k) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i - h, h); g.stroke() }
  g.restore()
  g.strokeStyle = '#f2c14e'; g.lineWidth = 3 * k
  roundRect(g, 18 * k, 18 * k, w - 36 * k, h - 36 * k, 10 * k); g.stroke()
  g.fillStyle = '#f2c14e'
  g.beginPath(); g.arc(w / 2, h / 2, 54 * k, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#2d3a6b'
  g.font = `bold ${30 * k}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText('CS&L', w / 2, h / 2 + 2 * k)
  drawIcon(g, 'cat-D', w / 2, h * 0.2, 44 * k, '#f2c14e')
  g.strokeStyle = '#f2c14e'; g.fillStyle = '#f2c14e'
  snakeShape(g, w / 2, h * 0.8, 70 * k)
  g.restore()
}
