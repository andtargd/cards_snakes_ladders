// The CrazyGames cover: the game's own table (the paper board, its snakes and ladders, the pieces) drawn
// by the game's View from a fixed angle, with a fan of cards and the game's name over it. No other text:
// the cells' numbers are left off unless asked for, the cards show their pictures only. Used by
// tools/covers.html (the pictures) and tools/trailer.html (the videos' first frame).
import * as THREE from 'three'
import * as P from '../experience/paper.js'
import * as R from '../experience/rules.js'
import { View } from '../experience/view.js'

const NAVY = '#2d3a6b', DEEP = '#1f2850'
const TITLE_FONT = '"Arial Black", "Segoe UI Black", ' + P.FONT
// the name in three colours: the cards' gold, the snakes' green, the ladders' wood
const WORDS = { cards: { t: 'Cards,', c: '#ffcf4a' }, snakes: { t: 'Snakes', c: '#7ed46a' }, and: { t: '&', c: '#fffdf8' }, ladders: { t: 'Ladders', c: '#f39a4f' } }
const ONE_LINE = [[WORDS.cards, WORDS.snakes, WORDS.and, WORDS.ladders]]
const TWO_LINES = [[WORDS.cards], [WORDS.snakes, WORDS.and, WORDS.ladders]]
const THREE_LINES = [[WORDS.cards], [WORDS.snakes, WORDS.and], [WORDS.ladders]]
const FAN = ['M3', 'B5', 'D4', 'B3', 'B4'] // Swap Places, Portal, Golden Die, Snake to Ladder, Trampoline

/** The board and the pieces on it: the seed of a board of 100 that shows well, and where each piece stands. */
const TABLE = { seed: 7, pos: [64, 47, 58, 33, 86, 23] }

/**
 * The compositions: for a wide (16:9), a tall (2:3) and a square picture, the camera (from, at, fov), the
 * name (lines, centre x and baseline of the first line as shares of the picture, size as a share of its
 * height) and the fan (centre of its middle card, card width as a share of the picture, spread in degrees).
 */
export const VARIANTS = {
  // A: low over the start, the tiers climbing away to the finish; the name over the far end
  climb: {
    wide: { from: [0.3, 3.9, 9.0], at: [0, 2.0, -3.0], fov: 46, title: { lines: ONE_LINE, x: 0.5, y: 0.15, size: 0.1 }, fan: { x: 0.8, y: 0.8, w: 0.19, spread: 11 } },
    tall: { from: [0.3, 7.0, 11.6], at: [0, 1.2, -2.2], fov: 54, title: { lines: THREE_LINES, x: 0.5, y: 0.11, size: 0.074 }, fan: { x: 0.5, y: 0.88, w: 0.24, spread: 10 } },
    square: { from: [0.3, 5.6, 11.0], at: [0, 1.4, -2.4], fov: 50, title: { lines: TWO_LINES, x: 0.5, y: 0.13, size: 0.095 }, fan: { x: 0.6, y: 0.86, w: 0.19, spread: 11 } },
  },
  // B: three-quarters from the right, the whole board on a slant; the name and the fan on the left
  slant: {
    wide: { from: [8.2, 10.0, 9.8], at: [-0.6, 1.3, -0.6], fov: 44, title: { lines: THREE_LINES, x: 0.22, y: 0.19, size: 0.125 }, fan: { x: 0.2, y: 0.82, w: 0.15, spread: 11 } },
    tall: { from: [7.5, 13.5, 11.5], at: [0.2, 1.0, -1.0], fov: 52, title: { lines: THREE_LINES, x: 0.5, y: 0.11, size: 0.072 }, fan: { x: 0.42, y: 0.88, w: 0.24, spread: 10 } },
    square: { from: [9.0, 11.5, 10.5], at: [0.6, 1.0, -0.8], fov: 48, title: { lines: TWO_LINES, x: 0.5, y: 0.13, size: 0.095 }, fan: { x: 0.36, y: 0.86, w: 0.19, spread: 11 } },
  },
  // C: close, among the snakes and ladders of the middle tiers, the pieces large
  close: {
    wide: { from: [2.6, 6.6, 5.6], at: [0.2, 1.7, -1.6], fov: 46, title: { lines: ONE_LINE, x: 0.5, y: 0.15, size: 0.1 }, fan: { x: 0.2, y: 0.8, w: 0.17, spread: 11 } },
    tall: { from: [1.8, 7.6, 6.4], at: [0.0, 1.6, -1.4], fov: 56, title: { lines: THREE_LINES, x: 0.5, y: 0.11, size: 0.072 }, fan: { x: 0.5, y: 0.88, w: 0.24, spread: 10 } },
    square: { from: [2.4, 7.0, 6.0], at: [0.1, 1.6, -1.5], fov: 50, title: { lines: TWO_LINES, x: 0.5, y: 0.13, size: 0.095 }, fan: { x: 0.36, y: 0.86, w: 0.19, spread: 11 } },
  },
}
export const shapeOf = (W, H) => (W / H > 1.25 ? 'wide' : W / H < 0.8 ? 'tall' : 'square')

// ---------- the table ----------
let stage = null
/** One renderer and one View for every picture (a page gets few WebGL contexts). */
function getStage() {
  if (stage) return stage
  const canvas = document.createElement('canvas')
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9a96, 2.2))
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100)
  // what the View asks of Project 0's runtime
  const p0 = {
    scene, camera, renderer, width: 1920, height: 1080, players: new Map(),
    lot: { width: 12, depth: 19, height: 12, size: 19 }, me: { position: new THREE.Vector3() },
    avatars: { load: async () => null }, log: (...a) => console.log('[cover]', ...a),
  }
  const view = new View(p0)
  view.updateCamera = () => {} // the camera is the cover's
  stage = { renderer, scene, camera, p0, view, numbers: view.mat.numbers.map }
  return stage
}

/** The cells' paper without their numbers (and without START and DICE): the cut-paper insets, the arrows, the finish star. */
function plainAtlas(last) {
  const { c, g } = P.canvas(1024, 1024)
  g.drawImage(P.fibreCanvas(512, 3), 0, 0, 1024, 1024)
  const tile = P.ATLAS.tile
  for (let n = 1; n <= 100; n++) {
    const x = ((n - 1) % 10) * tile, y = Math.floor((n - 1) / 10) * tile
    g.save()
    g.translate(x + tile / 2, y + tile / 2)
    g.strokeStyle = 'rgba(0,0,0,0.10)'; g.lineWidth = 2
    g.strokeRect(-tile * 0.42, -tile * 0.42, tile * 0.84, tile * 0.84)
    if (n === last) { g.fillStyle = 'rgba(255,255,255,0.7)'; P.star(g, 0, 0, tile * 0.38, tile * 0.17, 5); g.fill() }
    g.restore()
  }
  return c
}

/** The board of the cover, the pieces where they stand, turned to the camera; `numbers` keeps the cells' numbers. */
function setTable(st, { numbers = false } = {}) {
  const { view } = st
  const players = TABLE.pos.map((pos, i) => ({ n: 'P' + i, b: 1, c: i }))
  const s = R.createGame({ seed: TABLE.seed, mode: 'champion', players, cells: 100 })
  s.pl.forEach((p, i) => { p.pos = TABLE.pos[i] })
  s.cur = 0
  view.setState(s)
  if (!numbers) {
    st.plain ||= P.texture(plainAtlas(100))
    view.mat.numbers.map = st.plain
  } else view.mat.numbers.map = st.numbers
  view.mat.numbers.needsUpdate = true
  view.padDice.forEach(m => { m.visible = true })
  for (const t of view.tokens) { t.label.visible = false }
}

/** The table from the composition's camera, at w x h pixels, into the renderer's canvas. */
function renderTable(st, c, w, h) {
  const { renderer, camera, view, p0 } = st
  renderer.setSize(w, h, false)
  p0.width = w; p0.height = h
  camera.fov = c.fov
  camera.aspect = w / h
  camera.position.set(...c.from)
  camera.lookAt(...c.at)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  // the pieces turn to the camera and settle
  for (let i = 0; i < 90; i++) view.update(1 / 30)
  for (const t of view.tokens) { t.ring.visible = false; t.label.visible = false }
  renderer.render(p0.scene, camera)
  return renderer.domElement
}

// ---------- the cards and the name ----------
/** A card's face with its picture only (the game's frame, category chip and stars, no words). */
export function drawPictureCard(g, id, w) {
  const h = w * 1.4, card = R.CARD[id], st = P.RARITY_STYLE[card.rar], k = w / 256, cc = P.CAT_COLORS[card.cat]
  g.fillStyle = '#ffffff'; P.roundRect(g, 0, 0, w, h, 18 * k); g.fill()
  g.fillStyle = st.frame; P.roundRect(g, 3 * k, 3 * k, w - 6 * k, h - 6 * k, 16 * k); g.fill()
  const inset = card.rar === 'C' ? 9 : 12
  g.fillStyle = st.bg; P.roundRect(g, inset * k, inset * k, w - inset * 2 * k, h - inset * 2 * k, 11 * k); g.fill()
  if (card.rar === 'R' || card.rar === 'L') { g.strokeStyle = st.frame; g.lineWidth = 2 * k; P.roundRect(g, 17 * k, 17 * k, w - 34 * k, h - 34 * k, 8 * k); g.stroke() }
  if (card.rar === 'L') {
    g.fillStyle = '#fff3b0'
    for (let i = 0; i < 14; i++) { const t = i / 13; g.beginPath(); g.arc(w * 0.12 + t * w * 0.76, 7.5 * k, 2.2 * k, 0, Math.PI * 2); g.arc(w * 0.12 + t * w * 0.76, h - 7.5 * k, 2.2 * k, 0, Math.PI * 2); g.fill() }
  }
  g.fillStyle = cc
  g.beginPath(); g.arc(44 * k, 46 * k, 18 * k, 0, Math.PI * 2); g.fill()
  P.drawIcon(g, 'cat-' + card.cat, 44 * k, 46 * k, 25 * k, '#ffffff')
  // the picture, large
  const px = 26 * k, py = 80 * k, pw = w - 52 * k, ph = h - 150 * k
  g.fillStyle = 'rgba(255,255,255,0.8)'; P.roundRect(g, px, py, pw, ph, 14 * k); g.fill()
  g.strokeStyle = cc; g.lineWidth = 2.5 * k; P.roundRect(g, px, py, pw, ph, 14 * k); g.stroke()
  P.drawIcon(g, id, w / 2, py + ph / 2, Math.min(pw, ph) * 0.86, cc)
  for (let i = 0; i < st.stars; i++) {
    g.fillStyle = st.frame
    P.star(g, w / 2 + (i - (st.stars - 1) / 2) * 22 * k, h - 38 * k, 9 * k, 4 * k)
    g.fill()
  }
}

/** The fan: cards round a pivot under the picture's edge, each with a hard paper shadow (nothing blurred). */
function drawFan(g, W, H, f) {
  const cw = f.w * Math.min(W, H * 1.25), ch = cw * 1.4
  // the middle card's centre at (x, y) of the picture, the pivot far under it: a flat fan, every picture in sight
  const n = FAN.length, r = ch * 2.3, px = f.x * W, py = f.y * H + r
  const card = document.createElement('canvas')
  card.width = Math.ceil(cw); card.height = Math.ceil(ch)
  FAN.forEach((id, i) => {
    const cg = card.getContext('2d')
    cg.clearRect(0, 0, card.width, card.height)
    drawPictureCard(cg, id, cw)
    const a = THREE.MathUtils.degToRad((i - (n - 1) / 2) * f.spread)
    g.save()
    g.translate(px, py)
    g.rotate(a)
    g.translate(-cw / 2, -r - ch / 2)
    g.fillStyle = 'rgba(43,38,34,0.22)'
    P.roundRect(g, cw * 0.035, cw * 0.05, cw, ch, 18 * cw / 256); g.fill()
    g.drawImage(card, 0, 0, cw, ch)
    g.restore()
  })
}

/** The game's name: thick letters in three colours, a dark rim and a paper-thick edge under them. */
function drawTitle(g, W, H, t) {
  const size = t.size * H
  g.save()
  g.font = `900 ${size}px ${TITLE_FONT}`
  g.textBaseline = 'alphabetic'
  g.lineJoin = 'round'; g.miterLimit = 2
  const space = g.measureText(' ').width * 0.9
  const lead = size * 1.02
  const rim = size * 0.15, depth = Math.max(3, size * 0.09)
  t.lines.forEach((line, li) => {
    const widths = line.map(w => g.measureText(w.t).width)
    const total = widths.reduce((a, b) => a + b, 0) + space * (line.length - 1)
    // shrink a line that would not fit the picture round its centre
    const cx = t.x * W, y = t.y * H + li * lead
    const fit = Math.min(1, (2 * Math.min(cx, W - cx) - W * 0.06) / (total + rim * 2))
    g.save()
    g.translate(cx, y)
    g.scale(fit, fit)
    let x = -total / 2
    const at = line.map((w, i) => { const x0 = x; x += widths[i] + space; return x0 })
    // the edge: the rim pushed down a few times
    g.fillStyle = DEEP; g.strokeStyle = DEEP; g.lineWidth = rim
    for (let d = depth; d > 0; d -= Math.max(1, depth / 8)) line.forEach((w, i) => { g.strokeText(w.t, at[i], d); g.fillText(w.t, at[i], d) })
    // the rim, then the letters
    g.strokeStyle = NAVY; g.lineWidth = rim
    line.forEach((w, i) => g.strokeText(w.t, at[i], 0))
    line.forEach((w, i) => { g.fillStyle = w.c; g.fillText(w.t, at[i], 0) })
    g.restore()
  })
  g.restore()
}

/**
 * The cover of a variant (climb | slant | close) at W x H: a canvas. `ss` draws the table larger and
 * scales it down (smooth edges); `numbers` keeps the cells' numbers; `title`/`fan`: false leaves them off.
 */
export function renderCover(variant, W, H, { ss = 2, numbers = false, title = true, fan = true } = {}) {
  const v = VARIANTS[variant] || VARIANTS.climb
  const c = v[shapeOf(W, H)]
  const st = getStage()
  setTable(st, { numbers })
  const table = renderTable(st, c, W * ss, H * ss)
  const out = document.createElement('canvas')
  out.width = W; out.height = H
  const g = out.getContext('2d')
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'
  g.drawImage(table, 0, 0, W, H)
  if (fan) drawFan(g, W, H, c.fan)
  if (title) drawTitle(g, W, H, c.title)
  return out
}
