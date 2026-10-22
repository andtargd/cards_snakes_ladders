// The CrazyGames cover: the game's own table (the paper board, its snakes and ladders, the pieces) drawn
// by the game's View from a fixed angle, with a fan of cards and the game's name over it. No other text:
// the cells' numbers are left off unless asked for, the cards show their pictures only. Used by
// tools/covers.html (the pictures) and tools/trailer.html (the videos' first frame).
import * as THREE from 'three'
import * as P from '../experience/paper.js'
import * as R from '../experience/rules.js'
import * as G from '../experience/board3d.js'
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
  if (variant === 'burst' || variant === 'burst-sl') return renderBurst(W, H, { ss, pieces: variant === 'burst-sl' })
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

// ---------- D: burst — no board: the name in the middle, the fan in one corner, dice flying in from another ----------
// The top-left corner stays plain paper: CrazyGames lays its labels there.
const PAIRS = [[WORDS.cards, WORDS.snakes], [WORDS.and, WORDS.ladders]]
/**
 * Per shape: the name (lines, centre as shares, widest line as a share of the width, size cap as a share of
 * the height); the fan (pivot as shares, may lie outside; card width as a share; its distance in card
 * heights; the angles of the first and last card from upright, degrees; the last lies on top); the dice (centre as shares, edge
 * as a share of the shorter side, turn in degrees, gold; drawn in order, the last on top), the way they came from
 * (degrees, 0 = right, -90 = up); for the snakes-and-ladders cover, the snake's head and the ladder's top end (centre as
 * shares, pixels per board metre as a share of the shorter side, the way it points in degrees).
 */
const BURST = {
  wide: {
    title: { lines: PAIRS, x: 0.5, y: 0.53, w: 0.79, max: 0.3 },
    fan: { x: 0.0, y: 1.2, w: 0.21, r: 1.25, from: -4, to: 60 },
    dice: [
      { x: 0.68, y: 0.14, s: 0.19, rot: [22, -30, -18] },
      { x: 0.85, y: 0.21, s: 0.275, rot: [-28, 38, 12] },
      { x: 0.945, y: 0.43, s: 0.16, rot: [-12, 62, 30], gold: true },
    ],
    from: -38,
    snake: { x: 0.85, y: 0.8, u: 0.32, dir: -150 },
    ladder: { x: 0.15, y: 0.25, u: 0.26, dir: 32 },
  },
  tall: {
    title: { lines: THREE_LINES, x: 0.5, y: 0.5, w: 0.86, max: 0.11 },
    fan: { x: -0.02, y: 1.1, w: 0.3, r: 1.2, from: 0, to: 64 },
    dice: [
      { x: 0.58, y: 0.1, s: 0.19, rot: [22, -30, -18] },
      { x: 0.76, y: 0.15, s: 0.3, rot: [-28, 38, 12] },
      { x: 0.88, y: 0.32, s: 0.17, rot: [-12, 62, 30], gold: true },
    ],
    from: -55,
    snake: { x: 0.83, y: 0.86, u: 0.3, dir: -125 },
    ladder: { x: 0.17, y: 0.21, u: 0.25, dir: 58 },
  },
  square: {
    title: { lines: PAIRS, x: 0.5, y: 0.53, w: 1.03, max: 0.3 },
    fan: { x: -0.01, y: 1.24, w: 0.23, r: 1.25, from: -4, to: 60 },
    dice: [
      { x: 0.58, y: 0.1, s: 0.15, rot: [22, -30, -18] },
      { x: 0.8, y: 0.17, s: 0.25, rot: [-28, 38, 12] },
      { x: 0.91, y: 0.36, s: 0.14, rot: [-12, 62, 30], gold: true },
    ],
    from: -42,
    snake: { x: 0.84, y: 0.82, u: 0.28, dir: -140 },
    ladder: { x: 0.15, y: 0.22, u: 0.23, dir: 40 },
  },
}

/** The game's paper (#f3eee5 and its fibres) washed with soft patches of the tiers' colours, rays behind the name. */
function drawBurstBackground(g, W, H, c) {
  g.fillStyle = '#f3eee5'; g.fillRect(0, 0, W, H)
  const m = Math.max(W, H)
  // soft colour patches, none in the top-left corner
  const patches = [[0.95, 0.05, '#73a8ee'], [0.55, 0.0, '#9d91ee'], [1.0, 0.95, '#ef8fb9'], [0.6, 1.05, '#f9cf5e'], [0.05, 0.75, '#7fd19b'], [0.5, 0.5, '#fff6d8']]
  for (const [x, y, col] of patches) {
    const gr = g.createRadialGradient(x * W, y * H, 0, x * W, y * H, m * 0.55)
    gr.addColorStop(0, col + '8c'); gr.addColorStop(1, col + '00')
    g.fillStyle = gr; g.fillRect(0, 0, W, H)
  }
  // rays from the name's centre, fading out
  const cx = c.title.x * W, cy = c.title.y * H, n = 22
  const ray = g.createRadialGradient(cx, cy, m * 0.05, cx, cy, m * 0.62)
  ray.addColorStop(0, 'rgba(255,255,255,0.55)'); ray.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = ray
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    g.beginPath(); g.moveTo(cx, cy)
    g.arc(cx, cy, m, a, a + Math.PI / n)
    g.closePath(); g.fill()
  }
  // a light halo for the name
  const halo = g.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.55)
  halo.addColorStop(0, 'rgba(255,253,248,0.85)'); halo.addColorStop(1, 'rgba(255,253,248,0)')
  g.fillStyle = halo; g.fillRect(0, 0, W, H)
  // the fibres over everything
  g.save()
  g.globalCompositeOperation = 'multiply'
  g.fillStyle = g.createPattern(P.fibreCanvas(512, 3), 'repeat')
  g.fillRect(0, 0, W, H)
  g.restore()
}

/** Confetti in the tiers' colours: a fixed scatter, kept off the name and the top-left corner. */
function drawConfetti(g, W, H, c) {
  let k = 11
  const rnd = () => { k = (k * 16807) % 2147483647; return k / 2147483647 }
  const s = Math.min(W, H)
  const tx = c.title.x * W, ty = c.title.y * H
  for (let i = 0, placed = 0; i < 400 && placed < 46; i++) {
    const x = rnd() * W, y = rnd() * H, a = rnd() * Math.PI, col = P.TIER_COLORS[Math.floor(rnd() * 10)], kind = rnd()
    if (x < W * 0.42 && y < H * 0.34) continue
    if (Math.abs(x - tx) < W * c.title.w * 0.55 && Math.abs(y - ty) < s * 0.24) continue
    placed++
    g.save(); g.translate(x, y); g.rotate(a)
    g.fillStyle = col
    if (kind < 0.55) { g.fillRect(-s * 0.009, -s * 0.014, s * 0.018, s * 0.028) }
    else if (kind < 0.8) { g.beginPath(); g.arc(0, 0, s * 0.008, 0, Math.PI * 2); g.fill() }
    else { g.fillStyle = '#ffffff'; P.star(g, 0, 0, s * 0.016, s * 0.006, 4); g.fill() }
    g.restore()
  }
}

let diceStage = null
/** One die, turned, lit like the game's, on a clear canvas of `px` pixels. */
function renderDie(px, rot, gold) {
  if (!diceStage) {
    const canvas = document.createElement('canvas')
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(1)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setClearColor(0x000000, 0)
    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9a96, 1.9))
    const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(-2, 3, 4); scene.add(sun)
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20)
    camera.position.set(0, 0, 4); camera.lookAt(0, 0, 0)
    const geo = G.dieGeometry(1)
    const mats = {
      white: new THREE.MeshStandardMaterial({ map: P.texture(P.diceCanvas(256)), roughness: 0.35 }),
      gold: new THREE.MeshStandardMaterial({ map: P.texture(P.diceCanvas(256, { gold: true })), roughness: 0.3, metalness: 0.25 }),
    }
    const die = new THREE.Mesh(geo, mats.white)
    scene.add(die)
    diceStage = { renderer, scene, camera, die, mats }
  }
  const { renderer, scene, camera, die, mats } = diceStage
  renderer.setSize(px, px, false)
  die.material = gold ? mats.gold : mats.white
  die.rotation.set(...rot.map(d => THREE.MathUtils.degToRad(d)))
  renderer.render(scene, camera)
  const out = document.createElement('canvas')
  out.width = out.height = px
  out.getContext('2d').drawImage(renderer.domElement, 0, 0)
  return out
}

/** A die in flight: speed lines and fading copies behind it, the way it came from, then the die itself. */
function drawFlyingDie(g, W, H, d, from) {
  const s = d.s * Math.min(W, H), px = Math.ceil(s * 1.6)
  const img = renderDie(px, d.rot, d.gold)
  const x = d.x * W, y = d.y * H, a = THREE.MathUtils.degToRad(from)
  const ux = Math.cos(a), uy = Math.sin(a)
  // speed lines
  g.save()
  g.lineCap = 'round'
  for (const [off, len, wid] of [[-0.32, 1.5, 0.07], [0, 2.1, 0.1], [0.3, 1.3, 0.06]]) {
    const ox = -uy * off * s, oy = ux * off * s
    const x0 = x + ux * s * 0.45 + ox, y0 = y + uy * s * 0.45 + oy
    const x1 = x0 + ux * s * len, y1 = y0 + uy * s * len
    const gr = g.createLinearGradient(x0, y0, x1, y1)
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.strokeStyle = gr; g.lineWidth = wid * s
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke()
  }
  // fading copies, blurred
  g.filter = `blur(${(s * 0.025).toFixed(1)}px)`
  for (let i = 4; i >= 1; i--) {
    g.globalAlpha = 0.07 + (4 - i) * 0.05
    const k = 1 - i * 0.04
    g.drawImage(img, x + ux * s * i * 0.22 - px * k / 2, y + uy * s * i * 0.22 - px * k / 2, px * k, px * k)
  }
  g.globalAlpha = 1
  g.filter = 'none'
  // a soft shadow cast down onto the paper, then the die
  g.shadowColor = 'rgba(43,38,34,0.28)'; g.shadowBlur = s * 0.12; g.shadowOffsetY = s * 0.1
  g.drawImage(img, x - px / 2, y - px / 2)
  g.restore()
}

let pieceStage = null
/** The game's snake (head on cell 16, tail on 12) and ladder (12 up to 15) seen from straight above, at ppu pixels a metre. */
function renderPiece(kind, ppu) {
  if (!pieceStage) {
    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9a96, 2.2))
    const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(-4, 14, 5); scene.add(sun)
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 })
    const mesh = new THREE.Mesh(undefined, mat)
    scene.add(mesh)
    const ends = { snake: [16, 12], ladder: [12, 15] }
    const geos = { snake: G.snakeGeometry(...ends.snake, 0, { color: 0 }), ladder: G.ladderGeometry(...ends.ladder) }
    pieceStage = { scene, mesh, ends, geos }
  }
  if (!diceStage) renderDie(8, [0, 0, 0], false)
  const { renderer } = diceStage
  const { scene, mesh, ends, geos } = pieceStage
  mesh.geometry = geos[kind]
  geos[kind].computeBoundingBox()
  const bb = geos[kind].boundingBox, pad = 0.15
  const x0 = bb.min.x - pad, x1 = bb.max.x + pad, z0 = bb.min.z - pad, z1 = bb.max.z + pad
  const w = Math.ceil((x1 - x0) * ppu), h = Math.ceil((z1 - z0) * ppu)
  // from above, the board's x to the right and its z down the picture
  const cam = new THREE.OrthographicCamera(-(x1 - x0) / 2, (x1 - x0) / 2, (z1 - z0) / 2, -(z1 - z0) / 2, 0.1, 50)
  cam.position.set((x0 + x1) / 2, bb.max.y + 10, (z0 + z1) / 2)
  cam.up.set(0, 0, -1)
  cam.lookAt((x0 + x1) / 2, 0, (z0 + z1) / 2)
  renderer.setSize(w, h, false)
  renderer.render(scene, cam)
  const img = document.createElement('canvas')
  img.width = w; img.height = h
  img.getContext('2d').drawImage(renderer.domElement, 0, 0)
  // the anchor (the snake's head, the ladder's top) and the way the piece points, in the picture's pixels
  const [a, b] = ends[kind].map(c => G.cellPos(c))
  const at = kind === 'snake' ? a : b
  const ang = kind === 'snake' ? Math.atan2(a.z - b.z, a.x - b.x) : Math.atan2(b.z - a.z, b.x - a.x)
  return { img, ax: (at.x - x0) * ppu, ay: (at.z - z0) * ppu, ang }
}

/** A snake or a ladder laid on the paper: its anchor at (x, y), pointing `dir`, with the cards' hard paper shadow. */
function drawPiece(g, W, H, kind, p) {
  const ppu = p.u * Math.min(W, H)
  const { img, ax, ay, ang } = renderPiece(kind, ppu)
  g.save()
  g.translate(p.x * W, p.y * H)
  g.rotate(THREE.MathUtils.degToRad(p.dir) - ang)
  g.shadowColor = 'rgba(43,38,34,0.25)'; g.shadowBlur = ppu * 0.03; g.shadowOffsetX = ppu * 0.03; g.shadowOffsetY = ppu * 0.05
  g.drawImage(img, -ax, -ay)
  g.restore()
}

/** The fan in a corner: cards round a pivot near it, each with the paper shadow of the other covers. */
function drawCornerFan(g, W, H, f) {
  const cw = f.w * Math.min(W, H * 1.25), ch = cw * 1.4
  const px = f.x * W, py = f.y * H, r = ch * f.r, n = FAN.length
  const card = document.createElement('canvas')
  card.width = Math.ceil(cw); card.height = Math.ceil(ch)
  FAN.forEach((id, i) => {
    const cg = card.getContext('2d')
    cg.clearRect(0, 0, card.width, card.height)
    drawPictureCard(cg, id, cw)
    const a = THREE.MathUtils.degToRad(f.from + (f.to - f.from) * i / (n - 1))
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

/** The cover without the board: a canvas W x H. `ss` draws it larger and scales it down; `pieces` adds the snake and the ladder. */
export function renderBurst(W, H, { ss = 2, pieces = false } = {}) {
  const c = BURST[shapeOf(W, H)]
  const big = document.createElement('canvas')
  big.width = W * ss; big.height = H * ss
  const g = big.getContext('2d')
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'
  const BW = W * ss, BH = H * ss
  drawBurstBackground(g, BW, BH, c)
  drawConfetti(g, BW, BH, c)
  if (pieces) { drawPiece(g, BW, BH, 'ladder', c.ladder); drawPiece(g, BW, BH, 'snake', c.snake) }
  drawCornerFan(g, BW, BH, c.fan)
  for (const d of c.dice) drawFlyingDie(g, BW, BH, d, c.from)
  // the name: as large as its widest line allows, its lines centred round the middle
  g.font = `900 100px ${TITLE_FONT}`
  const space = g.measureText(' ').width * 0.9
  const widest = Math.max(...c.title.lines.map(l => l.reduce((a, w) => a + g.measureText(w.t).width, 0) + space * (l.length - 1)))
  const size = Math.min(c.title.max * BH, 100 * c.title.w * BW / (widest * 1.15))
  const n = c.title.lines.length
  const y = c.title.y * BH - (n - 1) * size * 1.02 / 2 + size * 0.36
  drawTitle(g, BW, BH, { lines: c.title.lines, x: c.title.x, y: y / BH, size: size / BH })
  const out = document.createElement('canvas')
  out.width = W; out.height = H
  const og = out.getContext('2d')
  og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high'
  og.drawImage(big, 0, 0, W, H)
  return out
}
