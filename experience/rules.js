// Cards, Snakes & Ladders: the rules core. Pure JavaScript with no rendering: it takes a state and an
// action, changes the state and returns the events the view animates. The same code runs a solo game
// against bots and, on the session's host, the shared table. All randomness comes from the state's own
// seeded generator, so a game replays exactly from its seed and its actions.

import DECK from './cards.config.js'
import FIELD from './board.config.js'

export const CFG = {
  cells: 100, tiers: 10, perTier: 10,
  hand: Math.max(1, DECK.hand | 0 || 3), fxTurns: 3, roundLimit: 150,
  minLen: FIELD.minLen, maxEndsPerTier: FIELD.perTier.ends, balance: FIELD.balance,
  simRuns: 1000,
  // how snakes and ladders may cross: a few crossings each, and only steeply
  maxCrossings: FIELD.maxCrossings, minCrossAngle: FIELD.minCrossAngle,
}

/** The board sizes a game can be played on (ten cells per tier). */
export const SIZES = [50, 70, 100]
/** Field settings for a board of n cells (board.config.js): fewer snakes and ladders, shorter cut-outs and races on small boards. */
export function boardCfg(n = CFG.cells) {
  if (!SIZES.includes(n)) n = CFG.cells
  const z = FIELD.sizes[n]
  return { cells: n, tiers: n / CFG.perTier, snakes: z.snakes, ladders: z.ladders, maxLen: z.maxLen, simMin: z.rolls[0], simMax: z.rolls[1], emptyTiers: z.emptyTiers }
}

export const RARITY = DECK.rarity

export const CATEGORY = { M: 'Movement', D: 'Dice', B: 'Board', H: 'Hinder', P: 'Protection', C: 'Hand' }

// How each card works: its category and what it targets. Names, texts, rarity and numbers come from
// cards.config.js, and so does the target of a card played on a player (its `target`). tgt: any (any
// player on the board, self included), other (another player), self (automatic), leader (automatic),
// cell, cell2 (two cells), ladder, snake, board, none, echo (a player whose last card is played again,
// then that card's own target)
const KINDS = {
  M1: ['M', 'any'], M2: ['M', 'any'], M3: ['M', 'other'], M4: ['M', 'any'], M5: ['M', 'self'], M6: ['M', 'any'],
  D1: ['D', 'any'], D2: ['D', 'any'], D3: ['D', 'any'], D4: ['D', 'any'], D5: ['D', 'any'],
  B1: ['B', 'cell'], B2: ['B', 'ladder'], B3: ['B', 'snake'], B4: ['B', 'cell'], B5: ['B', 'cell2'], B6: ['B', 'board'],
  H1: ['H', 'any'], H2: ['H', 'any'], H3: ['H', 'any'], H4: ['H', 'any'], H5: ['H', 'leader'],
  P1: ['P', 'any'], P2: ['P', 'any'], P3: ['P', 'any'], P4: ['P', 'any'],
  C1: ['C', 'none'], C2: ['C', 'other'], C3: ['C', 'other'], C4: ['C', 'other'], C5: ['C', 'none'], C6: ['C', 'echo'],
}
// a card's `target` in cards.config.js, for the cards played on a player
const TARGETS = { any_player: 'any', not_current_player: 'other', current_player: 'self' }
// Swap Places and the hand cards make no sense on oneself: they always go to another player
const NOT_SELF = new Set(['M3', 'C2', 'C3', 'C4'])
// what no one else can play on a player under the Holy Grail: the Hinder cards, the cards that move them
// (Dash, Setback, Swap Places, Rewind) and those that take their cards (Steal, Swap Hands)
const WARDED = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'M1', 'M2', 'M3', 'M6', 'C3', 'C4'])
const DEFAULTS = { spaces: 0, dice: 2, max: 6, min: 1, turns: CFG.fxTurns, shift: 2, slide: 0.5, extra: 1, draw: 3, rounds: 1 }
/** Every card with its settings: { id, name, cat, rar, tgt, text, w, on, ...numbers }. */
const ALL = Object.entries(KINDS).map(([id, [cat, kind]]) => {
  const c = { ...DEFAULTS, ...DECK.cards[id] }
  const onPlayers = ['any', 'other', 'self'].includes(kind)
  const tgt = onPlayers && TARGETS[c.target] ? (NOT_SELF.has(id) ? 'other' : TARGETS[c.target]) : kind
  const text = String(c.text || '').replace(/\{(\w+)\}/g, (m, k) => (c[k] !== undefined ? String(c[k]) : m))
  return { ...c, id, name: String(c.name || id), cat, rar: RARITY[c.rarity] ? c.rarity : 'C', tgt, text, w: Math.max(0, +(c.weight ?? 1) || 0), on: c.enabled !== false }
})
/** The cards in the deck, in catalogue order. */
export const CARDS = ALL.filter(c => c.on && c.w > 0)
export const CARD = Object.fromEntries(ALL.map(c => [c.id, c]))
const BY_RARITY = { C: [], U: [], R: [], L: [] }
for (const c of CARDS) BY_RARITY[c.rar].push(c.id)

// effects shown over a player: key in fx -> label
export const FX = Object.fromEntries(Object.entries({ x: 'D1', cf: 'D2', hv: 'D3', gd: 'D4', pk: 'D5', sl: 'H1', fz: 'H2', sk: 'H3', bk: 'H4', pa: 'P1', bo: 'P2', sh: 'P3', gr: 'P4', cc: 'C5' })
  .map(([k, card]) => [k, { name: CARD[card].name, card }]))
const TIMED = ['pa', 'bo', 'sh']

// ---------- randomness ----------
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/** The state's own generator: its position lives in s.r so the state can be sent and resumed. */
function rnd(s) {
  s.r = (s.r + 0x6D2B79F5) >>> 0
  let t = s.r
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const rint = (s, n) => Math.floor(rnd(s) * n)

// ---------- board ----------
export const tierOf = c => Math.floor((c - 1) / CFG.perTier)

/** Checks the field rules of the spec on a list of elements [type (0 snake, 1 ladder), from, to]. */
export function boardProblems(els, blocked = null, n = CFG.cells) {
  const bc = boardCfg(n)
  const used = new Set()
  const perTier = new Array(bc.tiers).fill(0)
  let rise = 0, fall = 0
  for (const [type, from, to] of els) {
    for (const c of [from, to]) {
      if (c < 2 || c > bc.cells - 1) return 'end out of range'
      if (used.has(c)) return 'two ends on one cell'
      if (blocked && blocked.has(c)) return 'end on a marker'
      used.add(c)
      perTier[tierOf(c)]++
    }
    const len = Math.abs(to - from)
    if (len < CFG.minLen || len > bc.maxLen) return 'length'
    if (tierOf(from) === tierOf(to)) return 'flat on one tier'
    if (type === 1 && to <= from) return 'ladder goes down'
    if (type === 0 && to >= from) return 'snake goes up'
    if (type === 1) rise += len; else fall += len
  }
  if (perTier.some(n => n > CFG.maxEndsPerTier)) return 'too many ends on a tier'
  const twin = twinIn(els)
  if (twin) return twin[0] ? 'two ladders join the same tiers' : 'two snakes join the same tiers'
  if (rise && fall && Math.abs(rise - fall) / Math.max(rise, fall) > CFG.balance) return 'balance'
  return crossingProblems(els) || ladderEndProblems(els)
}

/** Two snakes, or two ladders, that join the same two tiers (a snake and a ladder may): the first such, or null. */
const twins = (e, f) => e[0] === f[0] && tierOf(e[1]) === tierOf(f[1]) && tierOf(e[2]) === tierOf(f[2])
function twinIn(els) {
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) if (twins(els[i], els[j])) return els[i]
  return null
}

// ---------- layout: where snakes and ladders stand (board.config.js) ----------
// A snake or ladder stands on the tier where a piece steps on it: a ladder's foot, a snake's head.
/** The most snakes tier t may hold: more on the one crowded tier the board may have near its end. */
const snakeCap = (t, n) => (t * CFG.perTier >= FIELD.crowdedTier.from * n ? Math.max(FIELD.perTier.snakes, FIELD.crowdedTier.snakes) : FIELD.perTier.snakes)
/** [fewest, most] of `total` for a [fewest, most] share, each rounded to the nearest count. */
const shareRange = (share, total) => share.map(f => Math.min(total, Math.max(0, Math.round(f * total + 1e-9))))
const laddersEarly = bc => shareRange(FIELD.laddersFirstHalf, bc.ladders)
const snakesLate = bc => shareRange(FIELD.snakesSecondHalf, bc.snakes)

/** Checks where the base board's snakes and ladders stand: per tier, per half, the snake before the finish. */
export function layoutProblems(els, n = CFG.cells) {
  const bc = boardCfg(n)
  const lad = new Array(bc.tiers).fill(0), sn = new Array(bc.tiers).fill(0)
  let early = 0, late = 0, final = false
  for (const [type, from] of els) {
    const t = tierOf(from)
    if (type === 1) { lad[t]++; if (from <= n / 2) early++ }
    else { sn[t]++; if (from > n / 2) late++; if (n - from <= FIELD.finalSnake) final = true }
  }
  if (lad.some(k => k > FIELD.perTier.ladders)) return 'too many ladders on a tier'
  const crowded = sn.map((k, t) => t).filter(t => sn[t] > FIELD.perTier.snakes)
  if (crowded.length > 1 || crowded.some(t => sn[t] > snakeCap(t, n))) return 'too many snakes on a tier'
  if (lad.filter((k, t) => !k && !sn[t]).length > bc.emptyTiers) return 'too many empty tiers'
  const [earlyMin, earlyMax] = laddersEarly(bc), [lateMin, lateMax] = snakesLate(bc)
  if (early < earlyMin) return 'too few ladders in the first half'
  if (early > earlyMax) return 'too many ladders in the first half'
  if (late < lateMin) return 'too few snakes in the second half'
  if (late > lateMax) return 'too many snakes in the second half'
  if (FIELD.finalSnake > 0 && !final) return 'no snake before the finish'
  for (const type of [0, 1]) {
    const sides = [0, 0]
    for (const e of els) if (e[0] === type && lean(e)) sides[lean(e) > 0 ? 1 : 0]++
    if (Math.min(...sides) < Math.round((sides[0] + sides[1]) * FIELD.leanEachWay)) return type ? 'ladders lean one way' : 'snakes lean one way'
  }
  return null
}
/** Which way a snake or ladder leans as it rises, seen from the front: -1 left, 1 right, 0 straight up. */
export const lean = ([type, from, to]) => Math.sign(cellXZ(type === 1 ? to : from)[0] - cellXZ(type === 1 ? from : to)[0])

// ---------- crossings: the board as seen from above ----------
/** A cell's centre on the board's plan in metres (the 3D board's layout: 1 m cells, 1.25 m tiers). */
export function cellXZ(c) {
  const t = Math.floor((c - 1) / 10), i = (c - 1) % 10
  return [t % 2 === 0 ? i : 9 - i, -t * 1.25]
}
const segOf = e => { const a = cellXZ(e[1]), b = cellXZ(e[2]); return [a[0], a[1], b[0], b[1]] }
const cross2 = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
function pointSeg(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1, dy = y2 - y1
  const k = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(px - x1 - dx * k, py - y1 - dy * k)
}
/** How two cut-outs meet: 'none', 'cross' (at a good angle) or 'bad' (a shallow crossing or running alongside). */
export function relation(e, f) {
  const p = segOf(e), q = segOf(f)
  const ux = p[2] - p[0], uy = p[3] - p[1], vx = q[2] - q[0], vy = q[3] - q[1]
  const cos = Math.abs(ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1)
  const angle = Math.acos(Math.min(1, cos)) * 180 / Math.PI
  const d1 = cross2(...p, q[0], q[1]), d2 = cross2(...p, q[2], q[3])
  const d3 = cross2(...q, p[0], p[1]), d4 = cross2(...q, p[2], p[3])
  if (d1 * d2 < 0 && d3 * d4 < 0) return angle < CFG.minCrossAngle ? 'bad' : 'cross'
  const d = Math.min(pointSeg(p[0], p[1], q), pointSeg(p[2], p[3], q), pointSeg(q[0], q[1], p), pointSeg(q[2], q[3], p))
  if (d < 0.75 && angle < 25) return 'bad'
  if (d < 0.45) return angle < CFG.minCrossAngle ? 'bad' : 'cross'
  return 'none'
}
// ---------- a snake's body and the ladders' ends, as the 3D board draws them ----------
const smooth01 = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
/**
 * How far a snake's body swings off the straight line from its tail to its head at u (0 the tail, 1 the
 * head), in metres: the wave board3d.js draws. len: its run on the plan, dz: the part of it along the board.
 * Snakes take turns starting the wave to one side or the other (index).
 */
export function snakeSwing(u, len, dz, index) {
  const waves = Math.max(1, Math.round(len / 1.9))
  const amp = Math.min(Math.abs(dz) < 0.5 ? 0.22 : 0.4, 0.14 + len * 0.035)
  const env = Math.pow(Math.sin(Math.PI * Math.min(u, 0.93) / 0.93), 0.7)
  return amp * Math.sin(u * waves * Math.PI * 2 + (index % 2) * Math.PI) * env
}
/** A snake's width at u: a thin tail growing to the full body. */
export const snakeWidth = u => 0.05 + 0.25 * smooth01(u / 0.4)
/** A ladder's ends on the plan, as segments: its foot with the arrow before it, and its top. */
function ladderEnds(l) {
  const f = cellXZ(l[1]), g = cellXZ(l[2]), ll = Math.hypot(g[0] - f[0], g[1] - f[1]) || 1
  const ux = (g[0] - f[0]) / ll, uz = (g[1] - f[1]) / ll
  return [[f[0] - ux * 0.56, f[1] - uz * 0.56, f[0] + ux * 0.2, f[1] + uz * 0.2], [g[0] - ux * 0.2, g[1] - uz * 0.2, g[0] + ux * 0.32, g[1] + uz * 0.32]]
}
/** The distance between two segments [x1, z1, x2, z2] on the plan (0 where they cross). */
function segSeg(p, q) {
  const d1 = cross2(...p, q[0], q[1]), d2 = cross2(...p, q[2], q[3]), d3 = cross2(...q, p[0], p[1]), d4 = cross2(...q, p[2], p[3])
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0
  return Math.min(pointSeg(p[0], p[1], q), pointSeg(p[2], p[3], q), pointSeg(q[0], q[1], p), pointSeg(q[2], q[3], p))
}
const LADDER_HALF = 0.24 // half a ladder's width, rails and all
/**
 * Whether snake or ladder e (at index i in the list) passes over ladder l's foot, its arrow or its top:
 * a snake's body as it swings, a ladder's straight run with its rails.
 */
function coversLadderEnd(e, i, l) {
  if (e === l) return false
  const ends = ladderEnds(l), clear = LADDER_HALF + FIELD.ladderEndsClear
  const h = cellXZ(e[1]), t = cellXZ(e[2])
  const dx = h[0] - t[0], dz = h[1] - t[1], len = Math.hypot(dx, dz) || 1
  if (e[0] === 1) {
    // its rails run 0.32 past both ends
    const ux = dx / len, uz = dz / len
    const run = [t[0] + ux * 0.32, t[1] + uz * 0.32, h[0] - ux * 0.32, h[1] - uz * 0.32]
    return ends.some(end => segSeg(run, end) < clear + LADDER_HALF)
  }
  const px = -dz / len, pz = dx / len
  for (const end of ends) {
    // nothing near: the body swings 0.4 m at most
    if (segSeg([t[0], t[1], h[0], h[1]], end) > 0.85) continue
    const n = Math.ceil(len * 12)
    for (let k = 0; k <= n; k++) {
      const u = k / n, o = snakeSwing(u, len, dz, i)
      const x = t[0] + dx * u + px * o, z = t[1] + dz * u + pz * o
      if (pointSeg(x, z, end) < clear + snakeWidth(u) / 2) return true
    }
  }
  return false
}
/** A snake or another ladder over a ladder's foot or top hides where a piece gets on and off. */
export function ladderEndProblems(els) {
  for (let i = 0; i < els.length; i++) {
    for (const l of els) if (l[0] === 1 && coversLadderEnd(els[i], i, l)) return (els[i][0] ? 'ladder' : 'snake') + ' over a ladder end'
  }
  return null
}

export function crossingProblems(els) {
  const n = new Array(els.length).fill(0)
  for (let i = 0; i < els.length; i++) {
    for (let j = i + 1; j < els.length; j++) {
      const r = relation(els[i], els[j])
      if (r === 'bad') return 'shallow crossing'
      if (r === 'cross') { n[i]++; n[j]++ }
    }
  }
  return n.some(k => k > CFG.maxCrossings) ? 'too many crossings' : null
}

/** Mean number of rolls of a lone runner without cards, over n runs. */
export function simulateMean(els, runs, rand, n = CFG.cells) {
  const jump = new Map(els.map(([, from, to]) => [from, to]))
  let total = 0
  for (let i = 0; i < runs; i++) {
    let pos = 0, rolls = 0
    while (pos < n && rolls < 1000) {
      rolls++
      pos += 1 + Math.floor(rand() * 6)
      if (pos >= n) break
      const j = jump.get(pos)
      if (j !== undefined) pos = j
    }
    total += rolls
  }
  return total / runs
}

const boardCache = new Map()
/**
 * The random field for a seed and a size: on 100 cells 8 snakes and 8 ladders that pass every rule of
 * board.config.js and the 1,000-run check.
 */
export function generateBoard(seed, n = CFG.cells) {
  const key = n + ':' + seed
  if (boardCache.has(key)) return boardCache.get(key)
  const bc = boardCfg(n), half = Math.floor(n / 2)
  const r = mulberry32(seed ^ 0x5bd1e995)
  const pick = ([lo, hi]) => lo + Math.floor(r() * (hi - lo + 1))
  // where each one's entry may go, [type, lowest cell, highest cell]: the snake before the finish first,
  // then the ladders of the first half and the snakes of the second (as many as this attempt takes from
  // their ranges), then the rest in the other half
  const slotsFor = () => {
    const [lateMin, lateMax] = snakesLate(bc)
    const late = pick([Math.max(lateMin, FIELD.finalSnake > 0 ? 1 : 0), Math.max(lateMax, FIELD.finalSnake > 0 ? 1 : 0)])
    const early = pick(laddersEarly(bc))
    const snakes = [], ladders = []
    if (FIELD.finalSnake > 0) snakes.push([0, n - Math.max(1, FIELD.finalSnake), n - 1])
    while (snakes.length < late) snakes.push([0, half + 1, n - 1])
    while (snakes.length < bc.snakes) snakes.push([0, 2, half])
    while (ladders.length < early) ladders.push([1, 2, half])
    while (ladders.length < bc.ladders) ladders.push([1, half + 1, n - 1])
    const slots = []
    for (let i = 0; i < Math.max(snakes.length, ladders.length); i++) {
      if (i < snakes.length) slots.push(snakes[i])
      if (i < ladders.length) slots.push(ladders[i])
    }
    return slots
  }
  let els = null
  for (let attempt = 0; attempt < 4000 && !els; attempt++) {
    const slots = slotsFor()
    const list = [], used = new Set(), perTier = new Array(bc.tiers).fill(0), crossings = []
    const lad = new Array(bc.tiers).fill(0), sn = new Array(bc.tiers).fill(0)
    // how many lean each way, of the snakes [left, right] and of the ladders
    const sides = [[0, 0], [0, 0]], most = [bc.snakes, bc.ladders].map(k => k - Math.round(k * FIELD.leanEachWay))
    let ok = true, crowded = -1
    const add = ([type, lo, hi]) => {
      for (let k = 0; k < 300; k++) {
        const len = CFG.minLen + Math.floor(r() * (bc.maxLen - CFG.minLen + 1))
        const from = lo + Math.floor(r() * (hi - lo + 1))
        const to = type === 1 ? from + len : from - len
        if (to < 2 || to > n - 1 || used.has(from) || used.has(to)) continue
        const tf = tierOf(from), tt = tierOf(to)
        // every snake and ladder joins two tiers: none lies flat along one
        if (tf === tt || perTier[tf] + 1 > CFG.maxEndsPerTier || perTier[tt] + 1 > CFG.maxEndsPerTier) continue
        // no two snakes, nor two ladders, join the same two tiers
        if (list.some(e => twins(e, [type, from, to]))) continue
        // few ladders and snakes stand on one tier, a few more snakes on one tier near the end
        if (type === 1 && lad[tf] + 1 > FIELD.perTier.ladders) continue
        const over = type === 0 && sn[tf] + 1 > FIELD.perTier.snakes
        if (over && ((crowded >= 0 && crowded !== tf) || sn[tf] + 1 > snakeCap(tf, n))) continue
        const el = [type, from, to]
        // cross few others, and only steeply
        let bad = false, mine = 0
        const hit = []
        for (let j = 0; j < list.length && !bad; j++) {
          const rel = relation(el, list[j])
          if (rel === 'bad') bad = true
          else if (rel === 'cross') { mine++; hit.push(j); if (crossings[j] + 1 > CFG.maxCrossings) bad = true }
        }
        if (bad || mine > CFG.maxCrossings) continue
        // about as many lean left as right
        const side = lean(el)
        if (side && sides[type][side > 0 ? 1 : 0] + 1 > most[type]) continue
        // nothing over a ladder's foot or top: this one over the ladders laid, nor those laid over this ladder
        if (list.some(l => l[0] === 1 && coversLadderEnd(el, list.length, l)) || (type === 1 && list.some((e, j) => coversLadderEnd(e, j, el)))) continue
        if (side) sides[type][side > 0 ? 1 : 0]++
        for (const j of hit) crossings[j]++
        crossings.push(mine)
        used.add(from); used.add(to); perTier[tf]++; perTier[tt]++
        if (type === 1) lad[tf]++; else sn[tf]++
        if (over) crowded = tf
        list.push(el)
        return true
      }
      return false
    }
    for (const slot of slots) if (!(ok = add(slot))) break
    if (!ok || boardProblems(list, null, n) || layoutProblems(list, n)) continue
    const mean = simulateMean(list, CFG.simRuns, r, n)
    if (mean < bc.simMin || mean > bc.simMax) continue
    els = list
  }
  if (!els) throw new Error('could not generate a board for seed ' + seed)
  boardCache.set(key, els)
  return els
}

/** The snakes and ladders as they work right now: the base board, shifted for good by earthquakes, flipped by cards. */
export function effectiveElements(s) {
  const src = s.quake ? s.quake.els : s.base
  return src.map((e, i) => (s.mods.some(m => m.i === i) ? [1 - e[0], e[2], e[1]] : e))
}
const markerAt = (s, c, kind) => s.mk.find(m => m.c.includes(c) && (!kind || m.k === kind)) || null

/** Cells where a swamp, trampoline or portal may go. */
export function freeCells(s) {
  const ends = new Set()
  for (const e of effectiveElements(s)) { ends.add(e[1]); ends.add(e[2]) }
  const out = []
  for (let c = 1; c < s.n; c++) if (!ends.has(c) && !markerAt(s, c)) out.push(c)
  return out
}

// ---------- game ----------
/**
 * players: [{ n: name, b: bot level (0 human, 1 easy, 2 medium, 3 hard), id?: session id }]
 * cells: the board's size (50, 70 or 100). The turn order is drawn at the start.
 */
export function createGame({ seed, mode = 'champion', players, cells = CFG.cells }) {
  if (!SIZES.includes(cells)) cells = CFG.cells
  if (players.length < 2 || players.length > 6) throw new Error('2 to 6 players')
  if (mode === 'fool' && players.length < 3) throw new Error('Fool needs at least 3 players')
  const s = {
    v: 1, seed: seed >>> 0, mode, n: cells, r: (seed ^ 0x9e3779b9) >>> 0,
    base: generateBoard(seed >>> 0, cells), mods: [], quake: null, mk: [],
    pl: [], cur: 0, round: 1, ph: 'main', rolled: false, played: false, frozen: false,
    peek: null, pick: null, offer: null, fin: [], res: null, log: [], seq: 0, turnNo: 0,
  }
  const order = players.map((p, i) => i)
  for (let i = order.length - 1; i > 0; i--) { const j = rint(s, i + 1); [order[i], order[j]] = [order[j], order[i]] }
  s.pl = order.map(i => ({ n: String(players[i].n).slice(0, 14).replace(/[\ud800-\udbff]$/, ''), b: players[i].b | 0, id: players[i].id ?? null, c: players[i].c ?? i, pos: 0, h: [], d: 0, fx: {} }))
  const ev = []
  beginTurn(s, ev)
  s.ev0 = ev
  return s
}

export const clone = s => JSON.parse(JSON.stringify(s))
const onBoard = s => s.pl.map((p, i) => i).filter(i => !s.pl[i].d)
/** A line for the game's log, the turn's number before it ("12. Pip rolls 4"); returns the line. */
export function addLog(s, text) {
  const line = `${s.turnNo}. ${text}`
  s.log.push(line)
  if (s.log.length > 6) s.log.shift()
  return line
}
function log(s, ev, text) {
  ev.push({ e: 'log', text: addLog(s, text) })
}
const nm = (s, i) => s.pl[i].n

/** A rarity by its weight (rarities without cards in the deck left out), then a card of it by the cards' weights. */
function drawCard(s) {
  const rars = ['C', 'U', 'R', 'L'].filter(k => BY_RARITY[k].length && RARITY[k]?.weight > 0)
  let w = rnd(s) * rars.reduce((a, k) => a + RARITY[k].weight, 0), rar = rars[rars.length - 1]
  for (const k of rars) { w -= RARITY[k].weight; if (w < 0) { rar = k; break } }
  const list = BY_RARITY[rar]
  let v = rnd(s) * list.reduce((a, id) => a + CARD[id].w, 0)
  for (const id of list) { v -= CARD[id].w; if (v < 0) return id }
  return list[list.length - 1]
}

/** The cards Choose Your Card offers: as many as the card says, different ones while the deck allows. */
function drawOffer(s) {
  const n = Math.max(1, Math.min(5, CARD.C5.draw | 0)), out = []
  for (let k = 0; k < n; k++) {
    let id = drawCard(s)
    for (let tries = 0; tries < 8 && out.includes(id); tries++) id = drawCard(s)
    out.push(id)
  }
  return out
}

function beginTurn(s, ev) {
  for (let guard = 0; guard < 12; guard++) {
    if (s.ph === 'over') return
    const pi = s.cur, p = s.pl[pi]
    // Rewind takes a player back here; whether they went up a ladder or a trampoline since, bots look at
    // and where the turn before began, for a player who has not moved since this one began
    if (p.st != null) { p.ps = p.st; p.ptr = p.tr || '' }
    p.st = p.pos; p.tr = ''; delete p.up
    // the Holy Grail's rounds are counted at the start of its player's turns: the others have had theirs
    if (p.fx.gr && --p.fx.gr.t <= 0) delete p.fx.gr
    s.turnNo++
    s.rolled = false; s.played = false; s.frozen = false; s.peek = null; s.pick = null; s.offer = null; s.ph = 'main'
    delete s.bonus
    ev.push({ e: 'turn', p: pi, round: s.round })
    if (p.fx.sk) {
      delete p.fx.sk
      log(s, ev, `${p.n} skips this turn`)
      ev.push({ e: 'skip', p: pi })
      tickTimers(s, pi, ev)
      if (!advance(s, ev)) return
      continue
    }
    if (p.fx.fz) { delete p.fx.fz; s.frozen = true; ev.push({ e: 'frozen', p: pi }) }
    if (p.fx.cc) { // Choose Your Card: several cards are offered, the player keeps one
      delete p.fx.cc
      s.offer = drawOffer(s)
      s.ph = 'take'
      ev.push({ e: 'offer', p: pi, n: s.offer.length })
      return
    }
    const card = drawCard(s)
    p.h.push(card)
    ev.push({ e: 'draw', p: pi, card })
    return
  }
}

/** Moves the turn to the next player on the board; false when the game ended on the round limit. */
function advance(s, ev) {
  const n = s.pl.length
  let next = s.cur
  for (let k = 1; k <= n; k++) {
    const i = (s.cur + k) % n
    if (!s.pl[i].d) { next = i; break }
    // a finished player's seat still counts its turns: the board changes they made run out on time
    tickTimers(s, i, ev)
  }
  if (next <= s.cur) s.round++
  s.cur = next
  if (s.round > CFG.roundLimit) { endByLimit(s, ev); return false }
  return true
}

function tickTimers(s, pi, ev) {
  const p = s.pl[pi]
  const step = t => { if (t.f) { t.f = 0; return true } t.t--; return t.t > 0 }
  for (const k of TIMED) if (p.fx[k] && !step(p.fx[k])) delete p.fx[k]
  let board = false
  s.mk = s.mk.filter(m => (m.o !== pi || step(m)) || ((board = true), false))
  s.mods = s.mods.filter(m => (m.o !== pi || step(m)) || ((board = true), false))
  if (board) ev.push(boardEvent(s, 'expire'))
}
const boardEvent = (s, why) => ({ e: 'board', why, els: effectiveElements(s), mk: s.mk.map(m => [m.k, m.c, m.t]), mods: s.mods.map(m => m.i) })

/** The player is done: with more cards than the hand holds they discard first (one by one), then the turn ends. */
function finishTurn(s, ev) {
  const p = s.pl[s.cur]
  if (!p.d && p.h.length > CFG.hand) { s.ph = 'disc'; s.peek = null; ev.push({ e: 'mustdisc', p: s.cur }); return }
  endTurn(s, ev)
}

function endTurn(s, ev) {
  if (s.ph === 'over') return
  tickTimers(s, s.cur, ev)
  s.peek = null
  if (!advance(s, ev)) return
  beginTurn(s, ev)
}

function standings(s) {
  // Champion: the winner first, the rest by cell (further is higher), equal cells share a place
  const rest = s.pl.map((p, i) => i).filter(i => i !== s.fin[0]).sort((a, b) => s.pl[b].pos - s.pl[a].pos)
  const places = new Array(s.pl.length)
  if (s.fin.length) places[s.fin[0]] = 1
  let place = s.fin.length ? 2 : 1
  rest.forEach((i, k) => {
    if (k > 0 && s.pl[i].pos === s.pl[rest[k - 1]].pos) places[i] = places[rest[k - 1]]
    else places[i] = place + k
  })
  return places
}

function gameOver(s, ev, extra) {
  s.ph = 'over'
  if (s.mode === 'champion') s.res = { mode: 'champion', winner: s.fin[0], places: standings(s), ...extra }
  else {
    const fool = s.pl.findIndex(p => !p.d)
    const places = s.pl.map(p => p.d || s.pl.length)
    s.res = { mode: 'fool', fool, order: [...s.fin], places, ...extra }
  }
  ev.push({ e: 'over', res: s.res })
  if (s.mode === 'champion') log(s, ev, `${nm(s, s.res.winner)} wins!`)
  else log(s, ev, `${nm(s, s.res.fool)} is the Fool!`)
}

function endByLimit(s, ev) {
  const live = onBoard(s)
  const key = i => s.pl[i].pos
  if (s.mode === 'champion') {
    const best = Math.max(...live.map(key))
    const tied = live.filter(i => key(i) === best)
    const w = tied[rint(s, tied.length)]
    s.fin.unshift(w)
  } else {
    const worst = Math.min(...live.map(key))
    const tied = live.filter(i => key(i) === worst)
    const fool = tied[rint(s, tied.length)]
    for (const i of live.filter(i => i !== fool).sort((a, b) => key(b) - key(a))) { s.fin.push(i); s.pl[i].d = s.fin.length }
  }
  log(s, ev, 'The round limit is reached')
  gameOver(s, ev, { limit: true })
}

function finish(s, pi, ev) {
  const p = s.pl[pi]
  p.pos = s.n
  s.fin.push(pi)
  p.d = s.fin.length
  ev.push({ e: 'finish', p: pi, place: p.d })
  if (s.mode === 'champion') { gameOver(s, ev); return }
  log(s, ev, `${p.n} finished in place ${p.d}`)
  // a finished player leaves the board with their hand and effects; the swamps, portals and other
  // changes they made stay until their turns run out
  p.h = []; p.fx = {}
  if (s.peek && (s.peek.by === pi || s.peek.tg === pi)) s.peek = null
  if (onBoard(s).length <= 1) gameOver(s, ev)
}

/** The sum of n dice thrown with a player's effects, before Slow Down: [[sum, probability], ...]. */
function diceSums(fx, n) {
  const faces = []
  for (let f = fx.hv ? heavyMin() : 1; f <= 6; f++) faces.push(f)
  let sums = new Map([[0, 1]])
  for (let k = 0; k < n; k++) {
    const next = new Map()
    for (const [t, p] of sums) for (const f of faces) next.set(t + f, (next.get(t + f) || 0) + p / faces.length)
    sums = next
  }
  return [...sums]
}

/** The roll a player would make with their effects: [[total, probability], ...] (choices excluded). */
export function rollDistribution(fx) {
  const out = new Map()
  for (const [t, p] of diceSums(fx, diceCount(fx))) { const v = slowTotal(fx, t); out.set(v, (out.get(v) || 0) + p) }
  return [...out]
}
/** A roll's total as it moves the piece: Slow Down caps it. */
const slowTotal = (fx, t) => (fx.sl ? Math.min(CARD.H1.max, t) : t)
const diceCount = fx => (fx.x ? Math.max(1, CARD.D1.dice | 0) : 1)
/** The dice a roll throws: Choose Your Roll throws one more to pick from (the tray holds up to 3). */
export const diceThrown = fx => (fx.pk ? Math.min(3, 1 + diceCount(fx)) : diceCount(fx))
const heavyMin = () => Math.max(1, Math.min(6, CARD.D3.min | 0))
/** The highest value a chosen roll may take (Golden Die, Choose a Face), or 0 for a roll of the dice. */
export const choiceMax = fx => (fx.gd ? CARD.D4.max : fx.cf ? CARD.D2.max : 0)

/**
 * Where a roll of `total` from `pos` ends, without changing anything: { pos, finished }. Going Backwards
 * turns the move round (never past cell 1).
 */
export function landing(s, pi, pos, total, els = effectiveElements(s)) {
  const p = s.pl[pi], back = !!p.fx.bk
  let c = pos, stopped = false
  for (let k = 0; k < total; k++) {
    if (back && c <= 1) break
    c += back ? -1 : 1
    if (c >= s.n) return { pos: s.n, finished: true }
    if (!p.fx.bo && markerAt(s, c, 'sw')) { stopped = true; break }
  }
  if (stopped || c === pos) return { pos: c, finished: false }
  // the cell takes effect; a trampoline throws the piece on, and the cell it lands on takes effect in turn
  const settle = (c, bounced) => {
    if (bounced && !p.fx.bo && markerAt(s, c, 'sw')) return { pos: c, finished: false }
    const el = els.find(e => e[1] === c)
    if (el) {
      if (el[0] === 1) return { pos: el[2], finished: el[2] >= s.n }
      if (p.fx.sh) return { pos: c, finished: false }
      let fall = el[1] - el[2]
      if (p.fx.pa) fall = parachute(fall)
      return { pos: c - fall, finished: false }
    }
    const m = markerAt(s, c)
    if (m && m.k === 'tr') {
      const to = c + CARD.B4.spaces
      return to >= s.n ? { pos: s.n, finished: true } : settle(to, true)
    }
    if (m && m.k === 'po') return { pos: m.c[0] === c ? m.c[1] : m.c[0], finished: false }
    return { pos: c, finished: false }
  }
  return settle(c, false)
}

const parachute = fall => Math.max(0, Math.min(fall, Math.floor(fall * CARD.P1.slide)))

/**
 * The best value for a chosen roll (Choose a Face, Golden Die): the one that ends furthest, on average over
 * the dice an Extra Die rolls beside it.
 */
export function bestChoice(s, pi, max) {
  const fx = s.pl[pi].fx, rest = diceSums(fx, diceCount(fx) - 1)
  let best = 1, bestPos = -1
  for (let v = 1; v <= max; v++) {
    let score = 0
    for (const [t, pr] of rest) {
      const l = landing(s, pi, s.pl[pi].pos, slowTotal(fx, v + t))
      score += pr * (l.finished ? 1000 : l.pos)
    }
    if (score > bestPos) { bestPos = score; best = v }
  }
  return best
}

/** The better die of a Choose Your Roll for the player: the one whose move ends furthest. */
export function bestPick(s, pi, dice) {
  let best = 0, bestPos = -Infinity
  dice.forEach((v, i) => {
    const l = landing(s, pi, s.pl[pi].pos, slowTotal(s.pl[pi].fx, v))
    const score = l.finished ? 1000 : l.pos
    if (score > bestPos) { bestPos = score; best = i }
  })
  return best
}

/**
 * Rolls for a player with their next-roll effects and moves them. With Choose Your Roll the player whose
 * turn it is picks one of the dice first (the 'pick' phase) unless they match; anyone else's bonus roll
 * takes the better die.
 */
function rollAndMove(s, pi, value, ev, bonus) {
  const p = s.pl[pi], fx = p.fx
  let dice, chosen = false
  const lo = fx.hv ? heavyMin() : 1
  if (fx.gd || fx.cf) {
    // the chosen value is the first die; an Extra Die is rolled beside it and adds to it
    const max = choiceMax(fx)
    const v = Number.isInteger(value) && value >= 1 && value <= max ? value : bestChoice(s, pi, max)
    dice = [v]; chosen = true
    for (let k = 1; k < diceCount(fx); k++) dice.push(lo + rint(s, 7 - lo))
  } else {
    const n = diceThrown(fx)
    dice = []
    for (let k = 0; k < n; k++) dice.push(lo + rint(s, 7 - lo))
  }
  const pick = !!fx.pk && !chosen
  // the dice are thrown: what shaped them is spent; Slow Down and Going Backwards wait for the move
  delete fx.x; delete fx.cf; delete fx.gd; delete fx.hv; delete fx.pk
  if (pick) {
    ev.push({ e: 'roll', p: pi, dice, total: 0, chosen: false, slowed: false, bonus: !!bonus, pick: true })
    log(s, ev, `${p.n} rolled ${dice.slice(0, -1).join(', ')} and ${dice[dice.length - 1]}`)
    // equal dice leave nothing to choose: the move goes on at once
    if (pi === s.cur && dice.some(d => d !== dice[0])) { s.ph = 'pick'; s.pick = { d: dice, b: !!bonus }; return }
    moveBy(s, pi, dice, ev, bonus, bestPick(s, pi, dice))
    return
  }
  moveBy(s, pi, dice, ev, bonus, -1, chosen)
}

/** The piece moves by the dice (or by the one picked of them), forward, or back with Going Backwards. */
function moveBy(s, pi, dice, ev, bonus, picked = -1, chosen = false) {
  const p = s.pl[pi], fx = p.fx
  const raw = picked >= 0 ? dice[picked] : dice.reduce((a, b) => a + b, 0)
  const total = slowTotal(fx, raw)
  const slowed = total < raw, back = !!fx.bk
  const slow = CARD.H1.max
  delete fx.sl; delete fx.bk
  if (picked >= 0) {
    ev.push({ e: 'pick', p: pi, i: picked, dice, total, slowed, back })
    log(s, ev, `${p.n} took the ${dice[picked]}${slowed ? ', slowed to ' + slow : ''}${back ? ', going backwards' : ''}`)
  } else {
    ev.push({ e: 'roll', p: pi, dice, total, chosen, slowed, bonus: !!bonus, back })
    const what = chosen ? `chose ${dice[0]}${dice.length > 1 ? ', rolled ' + dice.slice(1).join(' + ') : ''}` : `rolled ${dice.join(' + ')}`
    log(s, ev, `${p.n} ${what}${dice.length > 1 ? ' = ' + raw : ''}${slowed ? ', slowed to ' + slow : ''}${back ? ', going backwards' : ''}`)
  }
  // step by step: a swamp on the way stops the move; going back stops on cell 1
  const path = [], waded = []
  const start = p.pos
  let c = p.pos, stopped = false
  for (let k = 0; k < total; k++) {
    if (back && c <= 1) break
    c += back ? -1 : 1
    path.push(Math.min(c, s.n))
    if (c >= s.n) break
    if (markerAt(s, c, 'sw')) { if (!fx.bo) { stopped = true; break } waded.push(c) }
  }
  if (!path.length) return
  p.pos = Math.min(c, s.n)
  // Swamp Boots show only on a swamp the roll went on past, not on one it ends on
  const boots = waded.filter(w => w !== p.pos)
  ev.push({ e: 'move', p: pi, path, ...(boots.length ? { boots } : {}) })
  trail(p, ['m', start, p.pos])
  if (p.pos >= s.n) { finish(s, pi, ev); return }
  if (stopped) { ev.push({ e: 'swamp', p: pi, c: p.pos }); log(s, ev, `${p.n} is stuck in a swamp on ${p.pos}`); return }
  resolveLanding(s, pi, ev)
}

/**
 * A piece's moves since its turn began, for Rewind to retrace: m steps along the cells, l up a ladder,
 * s down a snake, t a trampoline's throw, j a card's jump, p a portal or a swap. Kept short in the state
 * ("m3,9;l9,31"), since the shared table sends the whole state.
 */
function trail(p, [k, from, to]) { if (p.tr != null) p.tr += (p.tr ? ';' : '') + k + from + ',' + to }
/** A trail as [[kind, from, to], ...]. */
export function trailOf(tr) {
  return String(tr || '').split(';').filter(Boolean).map(x => [x[0], ...x.slice(1).split(',').map(Number)])
}

/** The cell a piece stops on takes effect: a ladder, a snake, a trampoline or a portal. */
function resolveLanding(s, pi, ev) {
  const p = s.pl[pi], c = p.pos
  const els = effectiveElements(s)
  const idx = els.findIndex(e => e[1] === c)
  if (idx >= 0) {
    const el = els[idx]
    if (el[0] === 1) {
      p.pos = el[2]; p.up = 1
      ev.push({ e: 'ladder', p: pi, from: c, to: p.pos, el: idx })
      trail(p, ['l', c, p.pos])
      log(s, ev, `${p.n} climbed a ladder from ${c} to ${p.pos}`)
      if (p.pos >= s.n) finish(s, pi, ev)
      return
    }
    if (p.fx.sh) {
      delete p.fx.sh
      ev.push({ e: 'shield', p: pi, c, el: idx })
      log(s, ev, `${p.n}'s shield blocked a snake on ${c}`)
      return
    }
    let fall = el[1] - el[2]
    const para = !!p.fx.pa
    // a parachute opens once, like a shield blocks once
    if (para) { fall = parachute(fall); delete p.fx.pa }
    p.pos = c - fall
    ev.push({ e: 'snake', p: pi, from: c, to: p.pos, el: idx, tail: el[2], para })
    trail(p, ['s', c, p.pos])
    log(s, ev, `${p.n} slid down a snake from ${c} to ${p.pos}${para ? ' (parachute)' : ''}`)
    return
  }
  const m = markerAt(s, c)
  if (m && m.k === 'tr') {
    p.pos = Math.min(s.n, c + CARD.B4.spaces); p.up = 1
    ev.push({ e: 'tramp', p: pi, from: c, to: p.pos })
    trail(p, ['t', c, p.pos])
    log(s, ev, `${p.n} bounced on a trampoline to ${p.pos}`)
    if (p.pos >= s.n) { finish(s, pi, ev); return }
    // the cell it throws the piece onto takes effect too (always further on, so the chain ends)
    if (!p.fx.bo && markerAt(s, p.pos, 'sw')) { ev.push({ e: 'swamp', p: pi, c: p.pos }); log(s, ev, `${p.n} is stuck in a swamp on ${p.pos}`); return }
    resolveLanding(s, pi, ev)
    return
  }
  if (m && m.k === 'po') {
    p.pos = m.c[0] === c ? m.c[1] : m.c[0]
    ev.push({ e: 'portal', p: pi, from: c, to: p.pos })
    trail(p, ['p', c, p.pos])
    log(s, ev, `${p.n} went through a portal from ${c} to ${p.pos}`)
  }
}

/**
 * Moves from cards (Dash, Setback, Dethrone): the piece jumps, then the cell it lands on works as after a
 * roll (ladder, snake, trampoline, portal). A jump goes over swamps on the way; only landing in one stops it.
 */
function jump(s, pi, to, ev, why) {
  const p = s.pl[pi], fx = p.fx
  const from = p.pos
  p.pos = Math.max(0, Math.min(s.n, to))
  ev.push({ e: 'jump', p: pi, from, to: p.pos, why })
  trail(p, ['j', from, p.pos])
  if (p.pos >= s.n) { finish(s, pi, ev); return }
  if (p.pos <= 0) return
  if (!fx.bo && markerAt(s, p.pos, 'sw')) { ev.push({ e: 'swamp', p: pi, c: p.pos }); log(s, ev, `${p.n} is stuck in a swamp on ${p.pos}`); return }
  resolveLanding(s, pi, ev)
}

// ---------- quake ----------
/** The board after an earthquake: it shifts the snakes and ladders as they stand now (after earlier quakes), for good. */
function quakeElements(s) {
  const blocked = new Set(s.mk.flatMap(m => m.c))
  const src = s.quake ? s.quake.els : s.base
  let best = null
  for (let attempt = 0; attempt < 30; attempt++) {
    const els = src.map(e => [...e])
    const order = els.map((e, i) => i)
    for (let i = order.length - 1; i > 0; i--) { const j = rint(s, i + 1); [order[i], order[j]] = [order[j], order[i]] }
    for (const i of order) {
      for (let end = 1; end <= 2; end++) {
        for (let k = 0; k < 6; k++) {
          const shift = (1 + rint(s, Math.max(1, CARD.B6.shift | 0))) * (rnd(s) < 0.5 ? -1 : 1)
          const trial = els.map(e => [...e])
          trial[i][end] += shift
          if (!structuralOk(trial, blocked, s.n)) continue
          els[i][end] += shift
          break
        }
      }
    }
    if (boardProblems(els, blocked, s.n)) continue
    best = els
    const mean = simulateMean(els, 300, () => rnd(s), s.n)
    const bc = boardCfg(s.n)
    if (mean >= bc.simMin && mean <= bc.simMax) return els
  }
  return best || src.map(e => [...e])
}
function structuralOk(els, blocked, n) {
  const bc = boardCfg(n)
  const used = new Set()
  const perTier = new Array(bc.tiers).fill(0)
  for (const [type, from, to] of els) {
    for (const c of [from, to]) {
      if (c < 2 || c > bc.cells - 1 || used.has(c) || blocked.has(c)) return false
      used.add(c); perTier[tierOf(c)]++
    }
    const len = Math.abs(to - from)
    if (len < CFG.minLen || len > bc.maxLen || tierOf(from) === tierOf(to)) return false
    if (type === 1 ? to <= from : to >= from) return false
  }
  // every rule of boardProblems but the balance, which the finished quake checks: a shift that breaks one
  // is never kept, or nearly every quake would end on a board that fails and leave the field as it was
  return perTier.every(n => n <= CFG.maxEndsPerTier) && !twinIn(els) && !crossingProblems(els) && !ladderEndProblems(els)
}

// ---------- targets ----------
/** Every target a card can be played on now: player indices, cells, [cell, cell] or element indices. */
export function targetsFor(s, pi, cardId) {
  const card = CARD[cardId]
  if (INSTEAD_OF_ROLL.has(cardId) && s.rolled) return [] // Swap Places and Tailgate take the place of the roll
  const live = onBoard(s)
  switch (card.tgt) {
    case 'any': case 'other': case 'self': {
      const list = card.tgt === 'self' ? [pi] : card.tgt === 'other' ? live.filter(i => i !== pi) : live
      return list.filter(q => fitsPlayer(s, pi, cardId, q))
    }
    case 'echo': return live.filter(i => echoable(s, pi, s.pl[i].lc))
    case 'leader': {
      // (a leader under the Holy Grail stays the leader: Dethrone goes to no one else)
      const best = Math.max(...live.map(i => s.pl[i].pos))
      return live.filter(i => s.pl[i].pos === best && !warded(s, pi, cardId, i))
    }
    case 'cell': case 'cell2': {
      let free = freeCells(s)
      // portals go no further than the player's own cell: a way to keep progress
      if (card.tgt === 'cell2') free = free.filter(c => c <= s.pl[pi].pos)
      return card.tgt === 'cell2' && free.length < 2 ? [] : free
    }
    case 'ladder': case 'snake': {
      const want = card.tgt === 'ladder' ? 1 : 0
      return effectiveElements(s).map((e, i) => i).filter(i => effectiveElements(s)[i][0] === want && !s.mods.some(m => m.i === i))
    }
    case 'board': return [null]
    case 'none': return [null]
  }
  return []
}
const INSTEAD_OF_ROLL = new Set(['M3', 'M5'])

/** Whether the Holy Grail keeps pi's card off player q. */
export const warded = (s, pi, cardId, q) => q !== pi && !!s.pl[q].fx.gr && WARDED.has(cardId)

/** Whether a card played by pi on a player works on player q. */
function fitsPlayer(s, pi, cardId, q) {
  const p = s.pl[q]
  if (NOT_SELF.has(cardId) && q === pi) return false
  if (warded(s, pi, cardId, q)) return false
  switch (cardId) {
    case 'M5': return tailgateCell(s, q) != null
    case 'M6': return !!rewindOf(p) // Rewind: a player who stands elsewhere than where a turn of theirs began
    case 'C2': case 'C3': return p.h.length > 0
    case 'C4': return p.h.length > 0 || s.pl[pi].h.length > 1
  }
  return true
}

/**
 * Where Rewind takes a player and the trail back: { to, tr }, or null when it would leave them where they
 * stand. Back to where their latest turn began; when they have not moved since (Rewind on oneself before
 * the roll), back to where the turn before began.
 */
function rewindOf(p) {
  if (p.st != null && p.st !== p.pos) return { to: p.st, tr: p.tr }
  if (p.ps != null && p.ps !== p.pos) return { to: p.ps, tr: [p.ptr, p.tr].filter(Boolean).join(';') }
  return null
}

/**
 * Tailgate: the cell just behind the nearest player ahead of player pi (strictly further on), or null
 * when no one is ahead or they stand on the very next cell.
 */
export function tailgateCell(s, pi) {
  const me = s.pl[pi].pos
  const ahead = onBoard(s).map(i => s.pl[i].pos).filter(c => c > me)
  if (!ahead.length) return null
  const c = Math.min(...ahead) - 1
  return c > me ? c : null
}
/** Echo can play this card again now: one that was played, not an Echo, with a target right now. */
function echoable(s, pi, cardId) {
  return !!cardId && cardId !== 'C6' && !!CARD[cardId] && targetsFor(s, pi, cardId).length > 0
}

export function canPlayCards(s, pi) {
  return s.ph === 'main' && s.cur === pi && !s.played && !s.frozen && !s.pl[pi].d
}
export function playable(s, pi, cardId) {
  return canPlayCards(s, pi) && targetsFor(s, pi, cardId).length > 0
}
function hasPlayable(s, pi) {
  return canPlayCards(s, pi) && s.pl[pi].h.some(c => targetsFor(s, pi, c).length > 0)
}
/** Why a card cannot be played now, or null. */
export function whyNot(s, pi, cardId) {
  if (s.ph === 'over') return 'The game is over'
  if (s.cur !== pi) return 'Not your turn'
  if (s.ph === 'disc') return 'Choose a card to discard'
  if (s.ph === 'pick') return 'Choose a die'
  if (s.ph === 'take') return 'Choose a card'
  if (s.frozen) return "You can't play cards this turn"
  if (s.played) return 'One card per turn'
  if (INSTEAD_OF_ROLL.has(cardId) && s.rolled) return 'Only instead of the roll'
  if (!targetsFor(s, pi, cardId).length) {
    if (cardId === 'M5') return 'No one ahead to tailgate'
    if (cardId === 'C6') return s.pl.some(q => q.lc && q.lc !== 'C6') ? 'No card to echo can be played now' : 'No card to echo yet'
    const held = onBoard(s).find(q => warded(s, pi, cardId, q))
    if (held != null) return `${nm(s, held)} is protected by ${CARD.P4.name}`
    return 'No valid targets'
  }
  return null
}

// ---------- actions ----------
/**
 * a: { t: 'roll', v? } | { t: 'pick', i } | { t: 'take', i } | { t: 'play', i, tg? } | { t: 'end' } | { t: 'disc', i } | { t: 'unpeek' }
 * A turn: draw a card (with Choose Your Card take one of those offered), roll once (with Choose Your Roll
 * pick one of the two dice) and play at most one card in either order, then (holding more than the
 * hand's 3) discard down to 3 at the end. Returns { ok, err, ev }. The state is changed in place
 * (clone it first to keep the old one).
 */
export function apply(s, pi, a) {
  const ev = []
  const fail = err => ({ ok: false, err, ev: [] })
  if (!a || typeof a !== 'object') return fail('bad action')
  if (s.ph === 'over') return fail('The game is over')
  if (s.cur !== pi) return fail('Not your turn')
  const p = s.pl[pi]
  if (a.t === 'disc') {
    if (s.ph !== 'disc') return fail('Nothing to discard')
    const i = a.i | 0
    if (i < 0 || i >= p.h.length) return fail('bad card')
    const [card] = p.h.splice(i, 1)
    ev.push({ e: 'discard', p: pi, card })
    if (p.h.length <= CFG.hand) endTurn(s, ev)
  } else if (a.t === 'pick') {
    if (s.ph !== 'pick' || !s.pick) return fail('Nothing to pick')
    const i = a.i | 0
    if (i < 0 || i >= s.pick.d.length) return fail('bad die')
    const { d, b } = s.pick
    s.pick = null; s.ph = 'main'
    moveBy(s, pi, d, ev, b, i)
    afterAction(s, pi, ev)
  } else if (a.t === 'take') {
    if (s.ph !== 'take' || !s.offer) return fail('Nothing to take')
    const i = a.i | 0
    if (i < 0 || i >= s.offer.length) return fail('bad card')
    const card = s.offer[i]
    s.offer = null; s.ph = 'main'
    p.h.push(card)
    ev.push({ e: 'draw', p: pi, card, took: true })
  } else if (s.ph !== 'main') return fail(s.ph === 'pick' ? 'Choose a die' : s.ph === 'take' ? 'Choose a card' : 'Choose a card to discard')
  else if (a.t === 'unpeek') {
    // the peeked hand is put away: the turn ends after the roll again, as without Peek
    if (!s.peek || s.peek.by !== pi) return fail('Nothing to put away')
    s.peek = null
    afterAction(s, pi, ev)
  } else if (a.t === 'roll') {
    if (s.rolled) return fail('Already rolled')
    // Double Move's roll comes first (with the value chosen for it); the turn's own roll is still to come
    if (s.bonus) { delete s.bonus; rollAndMove(s, pi, a.v, ev, true) } else { s.rolled = true; rollAndMove(s, pi, a.v, ev, false) }
    afterAction(s, pi, ev)
  } else if (a.t === 'end') {
    if (!s.rolled) return fail('Roll first')
    finishTurn(s, ev)
  } else if (a.t === 'play') {
    const i = a.i | 0
    const cardId = p.h[i]
    if (!cardId) return fail('bad card')
    const why = whyNot(s, pi, cardId)
    if (why) return fail(why)
    const err = playCard(s, pi, i, a.tg, ev)
    if (err) return fail(err)
    afterAction(s, pi, ev)
  } else return fail('unknown action')
  s.seq++
  return { ok: true, ev }
}

function afterAction(s, pi, ev) {
  if (s.ph === 'over' || s.ph === 'pick') return
  if (s.pl[pi].d) { endTurn(s, ev); return } // finished mid-turn (Fool): the turn ends at once
  // a peeked hand stays open until the player ends the turn
  if (s.rolled && !s.peek && (s.played || !hasPlayable(s, pi))) finishTurn(s, ev)
}

/** The target a card is played on, checked: { tg } or { err }. */
function checkTarget(s, pi, cardId, tg) {
  const card = CARD[cardId]
  const valid = targetsFor(s, pi, cardId)
  if (card.tgt === 'leader') {
    if (valid.length === 1) return { tg: valid[0] }
    return valid.includes(tg) ? { tg } : { err: 'Choose a leader' }
  }
  if (card.tgt === 'cell2') {
    if (!Array.isArray(tg) || tg.length !== 2 || tg[0] === tg[1] || !valid.includes(tg[0]) || !valid.includes(tg[1])) return { err: 'Choose two free cells' }
    return { tg }
  }
  if (card.tgt === 'board' || card.tgt === 'none') return { tg: null }
  if (card.tgt === 'self') return valid.includes(pi) ? { tg: pi } : { err: 'No valid targets' }
  return valid.includes(tg) ? { tg } : { err: 'Choose a valid target' }
}
const onPlayer = cardId => ['any', 'other', 'leader'].includes(CARD[cardId].tgt)

/**
 * Plays card i of the player's hand on tg. Echo's tg is [player whose last card it plays again, that
 * card's own target]. The card the player played last is remembered once its effect worked.
 */
function playCard(s, pi, i, tg, ev) {
  const p = s.pl[pi]
  const cardId = p.h[i]
  let eff = cardId, src = null, inner = tg
  if (cardId === 'C6') {
    if (!Array.isArray(tg) || !targetsFor(s, pi, 'C6').includes(tg[0])) return 'Choose a player whose card to echo'
    src = tg[0]; eff = s.pl[src].lc; inner = tg[1]
  }
  const chk = checkTarget(s, pi, eff, inner)
  if (chk.err) return chk.err
  const target = chk.tg

  p.h.splice(i, 1)
  s.played = true
  const who = typeof target === 'number' && onPlayer(eff) ? s.pl[target] : null
  const onWho = who ? (target === pi ? ' on themselves' : ` on ${who.n}`) : ''
  if (src != null) {
    ev.push({ e: 'play', p: pi, card: cardId, tg: src, echo: eff, etg: target })
    log(s, ev, `${p.n} played Echo: ${src === pi ? 'their own' : s.pl[src].n + "'s"} ${CARD[eff].name}${onWho}`)
  } else {
    ev.push({ e: 'play', p: pi, card: cardId, tg: target })
    log(s, ev, `${p.n} played ${CARD[cardId].name}${onWho}`)
  }
  if (cardEffect(s, pi, eff, target, ev) !== false) p.lc = cardId
  return null
}

/** What a card does, played by pi on target; false when it changed nothing. */
function cardEffect(s, pi, cardId, target, ev) {
  const p = s.pl[pi], card = CARD[cardId]
  const who = typeof target === 'number' ? s.pl[target] : null
  const setFx = (k, v = 1) => { who.fx[k] = v }
  const timed = k => { who.fx[k] = { t: card.turns, f: target === pi ? 1 : 0 } }
  switch (cardId) {
    case 'M1': jump(s, target, who.pos + card.spaces, ev, 'dash'); break
    case 'M2': if (who.pos <= 1) return false; jump(s, target, Math.max(1, who.pos - card.spaces), ev, 'setback'); break
    case 'M5': {
      // it takes the place of this turn's roll; the cells it leaps over do nothing
      const to = tailgateCell(s, target)
      s.rolled = true
      jump(s, target, to, ev, 'leap')
      break
    }
    case 'M6': {
      // back where the turn began, and nothing there takes effect
      // the way back retraces the moves since then (a ladder climbed goes back down it, and so on)
      const from = who.pos, back = rewindOf(who)
      who.pos = back.to
      ev.push({ e: 'rewind', p: target, from, to: who.pos, tr: trailOf(back.tr) })
      // the moves are undone: the piece starts over from here
      who.st = who.pos; who.tr = ''; delete who.ps; delete who.ptr
      log(s, ev, `${who.n} rewound from ${from <= 0 ? 'the start' : from} to ${who.pos <= 0 ? 'the start' : who.pos}`)
      break
    }
    case 'M3': {
      // it takes the place of this turn's roll; the new cells don't take effect (no snake, ladder,
      // trampoline, portal or swamp): the pieces only trade places
      s.rolled = true
      const a = p.pos
      p.pos = who.pos; who.pos = a
      ev.push({ e: 'swap', a: pi, b: target })
      trail(p, ['p', who.pos, p.pos]); trail(who, ['p', p.pos, who.pos])
      break
    }
    case 'M4':
      // with a chosen roll waiting (Golden Die, Choose a Face) the player gives its value: their next roll
      // is the bonus one, with that value, and the turn's own roll an ordinary one after it
      if ((who.fx.gd || who.fx.cf) && target === s.cur && !s.rolled) { s.bonus = 1; break }
      rollAndMove(s, target, undefined, ev, true)
      break
    case 'D1': setFx('x'); break
    // the dice that are chosen or picked from replace each other: the last one played counts
    case 'D2': delete who.fx.gd; delete who.fx.pk; setFx('cf'); break
    case 'D3': setFx('hv'); break
    case 'D4': delete who.fx.cf; delete who.fx.pk; setFx('gd'); break
    case 'D5': delete who.fx.cf; delete who.fx.gd; setFx('pk'); break
    case 'H1': setFx('sl'); break
    case 'H2': setFx('fz'); break
    case 'H3': setFx('sk'); break
    case 'H4': setFx('bk'); break
    case 'H5': if (who.pos <= 1) return false; jump(s, target, Math.max(1, who.pos - card.spaces), ev, 'dethrone'); break
    case 'P1': timed('pa'); break
    case 'P2': timed('bo'); break
    case 'P3': timed('sh'); break
    case 'P4': {
      // every effect on the player goes, good or bad; the Grail's own ward stays until their turn comes again
      const gone = Object.keys(who.fx).filter(k => FX[k] && k !== 'gr')
      who.fx = { gr: { t: Math.max(1, card.rounds | 0) } }
      ev.push({ e: 'grail', p: target, gone })
      if (gone.length) log(s, ev, `${who.n}'s effects are gone: ${gone.map(k => FX[k].name).join(', ')}`)
      break
    }
    case 'B1':
      s.mk = s.mk.filter(m => !(m.k === 'sw' && m.o === pi))
      s.mk.push({ k: 'sw', c: [target], o: pi, t: card.turns, f: 1 })
      ev.push(boardEvent(s, 'swamp'))
      break
    case 'B4':
      s.mk.push({ k: 'tr', c: [target], o: pi, t: card.turns, f: 1 })
      ev.push(boardEvent(s, 'tramp'))
      break
    case 'B5':
      s.mk.push({ k: 'po', c: [target[0], target[1]], o: pi, t: card.turns, f: 1 })
      ev.push(boardEvent(s, 'portal'))
      break
    case 'B2': case 'B3':
      s.mods.push({ i: target, o: pi, t: card.turns, f: 1 })
      ev.push({ ...boardEvent(s, 'flip'), flip: target })
      break
    case 'B6':
      s.quake = { els: quakeElements(s) }
      ev.push(boardEvent(s, 'quake'))
      break
    case 'C1': {
      const n = p.h.length
      p.h = []
      const draw = Math.min(CFG.hand, n + card.extra)
      for (let k = 0; k < draw; k++) p.h.push(drawCard(s))
      ev.push({ e: 'redraw', p: pi, n: draw })
      break
    }
    case 'C5': p.fx.cc = 1; break
    case 'C2': s.peek = { by: pi, tg: target }; ev.push({ e: 'peek', p: pi, tg: target }); break
    case 'C3': {
      const k = rint(s, who.h.length)
      const [c] = who.h.splice(k, 1)
      p.h.push(c)
      ev.push({ e: 'steal', p: pi, tg: target })
      break
    }
    case 'C4': {
      const h = p.h
      p.h = who.h; who.h = h
      ev.push({ e: 'swaphands', p: pi, tg: target })
      break
    }
  }
  return true
}

// ---------- bots ----------
const CARD_VALUE = { C: 1, U: 1.5, R: 2, L: 3 }
const handValue = h => h.reduce((a, c) => a + CARD_VALUE[CARD[c].rar], 0)

/** Expected cell after a player's next roll, with their effects and the board as it is. */
function expectedNext(s, q, els) {
  const p = s.pl[q]
  if (p.d) return 130
  if (p.fx.sk) return p.pos
  const scoreOf = l => (l.finished ? 115 : l.pos)
  let ex = 0
  if (p.fx.gd || p.fx.cf) {
    const max = choiceMax(p.fx), rest = diceSums(p.fx, diceCount(p.fx) - 1)
    for (let v = 1; v <= max; v++) {
      let e = 0
      for (const [t, pr] of rest) e += pr * scoreOf(landing(s, q, p.pos, slowTotal(p.fx, v + t), els))
      ex = Math.max(ex, e)
    }
  } else if (p.fx.pk) { // Choose Your Roll: the best of the dice (two, three with an Extra Die)
    const lo = p.fx.hv ? heavyMin() : 1, n = diceThrown(p.fx)
    const at = []
    for (let f = lo; f <= 6; f++) at.push(scoreOf(landing(s, q, p.pos, slowTotal(p.fx, f), els)))
    // the best of n dice: P(max <= k-th worst face) = (k / faces)^n
    at.sort((a, b) => a - b)
    at.forEach((v, k) => { ex += v * (((k + 1) / at.length) ** n - (k / at.length) ** n) })
  } else for (const [t, pr] of rollDistribution(p.fx)) ex += pr * scoreOf(landing(s, q, p.pos, t, els))
  if (p.fx.dm) { // a pending Double Move (evaluation only): one more ordinary roll from there
    const after = ex
    let ex2 = 0
    for (const [t, pr] of rollDistribution({})) ex2 += pr * Math.min(115, after + t)
    ex = ex2
  }
  return ex
}

function standingValue(s, q, els) {
  const p = s.pl[q]
  if (p.d) return 140
  let v = expectedNext(s, q, els)
  if (p.fx.sh) v += 2.5
  if (p.fx.pa) v += 1.5 * (p.fx.pa.t || 1) / 2
  if (p.fx.bo) v += 0.4
  if (p.fx.fz) v -= 0.6
  if (p.fx.gr) v += 1.5 // the others' attacks kept off for a round
  v += 0.6 * handValue(p.h)
  return v
}

/** How good the position is for player pi (higher is better). */
export function utility(s, pi) {
  const els = effectiveElements(s)
  const mine = standingValue(s, pi, els)
  if (s.ph === 'over' && s.res) {
    if (s.mode === 'champion') return s.res.winner === pi ? 1000 : -1000
    return s.res.fool === pi ? -1000 : 1000
  }
  const others = s.pl.map((p, i) => i).filter(i => i !== pi && !s.pl[i].d).map(i => standingValue(s, i, els))
  if (!others.length) return mine
  if (s.mode === 'champion') {
    const max = Math.max(...others), avg = others.reduce((a, b) => a + b, 0) / others.length
    return mine - 0.75 * max - 0.25 * avg
  }
  return mine - Math.min(...others)
}

/** Candidate targets a bot considers for a card (cells are narrowed to the useful ones). */
function botTargets(s, pi, cardId) {
  const all = targetsFor(s, pi, cardId)
  const card = CARD[cardId]
  if (card.tgt === 'cell' || card.tgt === 'cell2') {
    const free = new Set(all)
    const near = (from, a, b) => { const out = []; for (let c = from + a; c <= from + b; c++) if (free.has(c)) out.push(c); return out }
    const me = s.pl[pi].pos
    if (cardId === 'B1') { // swamps go in front of the others
      const out = new Set()
      for (const q of onBoard(s)) if (q !== pi) for (const c of near(s.pl[q].pos, 1, 6)) out.add(c)
      return [...out]
    }
    if (cardId === 'B4') return near(me, 1, 6)
    // portal: the exit near where I stand, the entrance where a snake would drop me
    const exits = all.filter(c => c <= me).sort((a, b) => b - a).slice(0, 3)
    const ins = new Set()
    for (const e of effectiveElements(s)) if (e[0] === 0 && e[2] < me - 4) for (const c of near(e[2], 1, 6)) ins.add(c)
    const out = []
    for (const b of exits) for (const a of ins) if (a < b - 6) out.push([a, b])
    return out.slice(0, 24)
  }
  if (card.tgt === 'echo') { // [whose card, that card's target], once for each different card
    const out = [], seen = new Set()
    for (const q of all) {
      const id = s.pl[q].lc
      if (seen.has(id)) continue
      seen.add(id)
      for (const t of botTargets(s, pi, id)) out.push([q, t])
    }
    return out
  }
  return all
}

/** Echo judged as the card it plays again: a copy of the state with that card in Echo's place. */
function asEcho(s, pi, i, tg) {
  const c = clone(s)
  c.pl[pi].h[i] = s.pl[tg[0]].lc
  return c
}

function evaluateOption(s, pi, i, tg, level) {
  const cardId = s.pl[pi].h[i]
  // (Echo leaves the hand as the copied card would: the value of the hand counts the same either way)
  if (cardId === 'C6') return evaluateOption(asEcho(s, pi, i, tg), pi, i, tg[1], level)
  const c = clone(s)
  c.r = (s.r ^ 0xa5a5a5a5) >>> 0 // bots do not see the real future rolls
  const before = utility(s, pi)
  if (cardId === 'M4') { // Double Move: expected, not sampled
    c.pl[pi].h.splice(i, 1); c.played = true
    c.pl[tg].fx.dm = 1
    return utility(c, pi) - before
  }
  if (cardId === 'C3') { // Steal: the average card of the target's hand
    const h = s.pl[tg].h
    if (!h.length) return -1
    return (0.6 * handValue(h) / h.length) * (1 + (level >= 3 ? 0.3 : 0)) - 0.6 * CARD_VALUE[CARD[cardId].rar] * 0.2
  }
  if (cardId === 'C2') return level >= 3 ? 0.3 : 0.05
  if (cardId === 'C5') return level >= 3 ? 1.1 : 1 // a better card next turn
  c.rolled = false // judge the board as it stands, without ending the turn in the copy
  const r = apply(c, pi, { t: 'play', i, tg })
  if (!r.ok) return -99
  // Swap Places and Tailgate give up this turn's roll
  if (INSTEAD_OF_ROLL.has(cardId)) return utility(c, pi) - before + 0.6 * CARD_VALUE[CARD[cardId].rar] - (expectedNext(s, pi, effectiveElements(s)) - s.pl[pi].pos)
  // a portal back up to where I stand insures against a snake later
  if (cardId === 'B5') return utility(c, pi) - before + 0.6 * CARD_VALUE.R + 0.07 * Math.abs(tg[1] - tg[0])
  // the card itself leaves the hand; do not count that as a loss
  return utility(c, pi) - before + 0.6 * CARD_VALUE[CARD[cardId].rar]
}

function bestOption(s, pi, level, filter = () => true) {
  const p = s.pl[pi]
  let best = null
  p.h.forEach((cardId, i) => {
    if (!targetsFor(s, pi, cardId).length) return
    for (const tg of botTargets(s, pi, cardId)) {
      if (!filter(...played(s, cardId, tg))) continue
      if (!sensible(s, pi, i, tg)) continue
      let g = evaluateOption(s, pi, i, tg, level)
      if (level === 2) g += (rnd(s) - 0.5) * 0.6
      if (!best || g > best.gain) best = { i, tg, gain: g, card: cardId }
    }
  })
  return best
}

/** The card that takes effect and its target: Echo's copied card, or the card itself. */
const played = (s, cardId, tg) => (cardId === 'C6' ? [s.pl[tg[0]].lc, tg[1]] : [cardId, tg])

/** False for a play no bot makes at any level: one that hurts itself or helps another player. */
function sensible(s, pi, i, tg) {
  const cardId = s.pl[pi].h[i]
  if (cardId === 'C6') return sensible(asEcho(s, pi, i, tg), pi, i, tg[1])
  if (cardId === 'M5') { // Tailgate: my own long leap, better than a roll, that ends no lower than it lands
    const to = tailgateCell(s, pi), c = clone(s)
    c.rolled = false
    if (tg !== pi || to == null || !apply(c, pi, { t: 'play', i, tg }).ok) return false
    return to - s.pl[pi].pos > 6 && (c.pl[pi].d || c.pl[pi].pos >= to)
  }
  if (typeof tg !== 'number' || !(onPlayer(cardId) || CARD[cardId].tgt === 'self')) return true
  const self = tg === pi, fx = s.pl[tg].fx
  switch (cardId) {
    // Rewind: myself when it takes me further on (after a snake or a Setback), another player when they
    // have just gone up a ladder or a trampoline
    case 'M6': { const q = s.pl[tg], b = rewindOf(q); return !!b && (self ? b.to > q.pos : b.to < q.pos && (!!q.up || /[lt]/.test(b.tr))) }
    case 'M1': case 'M2': case 'H5': { // where the piece ends up, snakes, ladders and shields included
      const c = clone(s)
      c.rolled = false
      if (!apply(c, pi, { t: 'play', i, tg }).ok) return false
      const moved = c.pl[tg].d ? Infinity : c.pl[tg].pos - s.pl[tg].pos
      return self ? moved > 0 : moved < 0
    }
    // more or heavier dice are wasted under Slow Down and take a Moonwalk further back
    case 'D1': case 'D3': return self ? !fx.sl && !fx.bk : !!fx.bk
    case 'M4': return self ? !fx.bk : !!fx.bk
    case 'D2': case 'D4': case 'D5': case 'P1': case 'P2': case 'P3': case 'P4': return self
    case 'H1': case 'H2': case 'H3': case 'H4': return !self
  }
  return true
}

// (the Holy Grail too: it lifts a Slow Down or a Moonwalk off this turn's roll)
const ROLL_CARDS = new Set(['D1', 'D2', 'D3', 'D4', 'D5', 'M4', 'P4'])
/** The card a bot keeps of those Choose Your Card offers. */
function bestOffer(s, pi, level) {
  const offer = s.offer || []
  if (level === 1) return rint(s, offer.length)
  let best = 0, bestV = -Infinity
  offer.forEach((c, i) => { const v = CARD_VALUE[CARD[c].rar] + rnd(s) * 0.2; if (v > bestV) { bestV = v; best = i } })
  return best
}
/** The next action of a bot whose turn it is (or who must discard). */
export function botAction(s, pi) {
  const p = s.pl[pi], level = p.b || 2
  if (s.ph === 'disc') {
    if (level === 1) return { t: 'disc', i: rint(s, p.h.length) }
    let worst = 0, worstV = Infinity
    p.h.forEach((c, i) => {
      const v = CARD_VALUE[CARD[c].rar] + (targetsFor(s, pi, c).length ? 0.5 : 0) + rnd(s) * 0.2
      if (v < worstV) { worstV = v; worst = i }
    })
    return { t: 'disc', i: worst }
  }
  if (s.ph === 'pick') return { t: 'pick', i: level === 1 ? rint(s, s.pick.d.length) : bestPick(s, pi, s.pick.d) }
  if (s.ph === 'take') return { t: 'take', i: bestOffer(s, pi, level) }
  const rollAction = () => {
    if (p.fx.gd || p.fx.cf) return { t: 'roll', v: bestChoice(s, pi, choiceMax(p.fx)) }
    return { t: 'roll' }
  }
  const canPlay = canPlayCards(s, pi)
  if (level === 1) {
    if (!s.rolled) {
      if (canPlay && rnd(s) < 0.5) {
        const opts = []
        p.h.forEach((c, i) => { for (const tg of c === 'C6' ? botTargets(s, pi, c) : targetsFor(s, pi, c)) if (sensible(s, pi, i, tg)) opts.push({ i, tg, c }) })
        if (opts.length) {
          const o = opts[rint(s, opts.length)]
          const tg = CARD[o.c].tgt === 'cell2' ? pickTwo(s, pi) : o.tg
          return { t: 'play', i: o.i, tg }
        }
      }
      return rollAction()
    }
    return { t: 'end' }
  }
  const threshold = level >= 3 ? 0.7 : 0.9
  const hold = (o) => level >= 3 && CARD[o.card].rar === 'L' && o.gain < 2.5 && p.h.length < CFG.hand && !s.pl.some(q => !q.d && q.pos >= s.n * 0.7)
  if (!s.rolled) {
    if (canPlay) {
      // cards that shape this turn's roll go before it
      const o = bestOption(s, pi, level, (c, tg) => ROLL_CARDS.has(c) || INSTEAD_OF_ROLL.has(c) ? CARD[c].tgt !== 'any' || tg === pi : false)
      if (o && o.gain > threshold && !hold(o)) return { t: 'play', i: o.i, tg: o.tg }
    }
    return rollAction()
  }
  if (canPlay) {
    const o = bestOption(s, pi, level)
    if (o && o.gain > threshold && !hold(o)) return { t: 'play', i: o.i, tg: o.tg }
  }
  return { t: 'end' }
}
function pickTwo(s, pi) {
  const free = targetsFor(s, pi, 'B5')
  const a = free[rint(s, free.length)]
  let b = a
  while (b === a) b = free[rint(s, free.length)]
  return [a, b]
}

/** A copy of the state for sending: the base board is regenerated from the seed on arrival. */
export function pack(s) {
  const o = { ...s }
  delete o.base; delete o.ev0
  return o
}
export function unpack(o) {
  const s = { ...o }
  s.n = SIZES.includes(s.n) ? s.n : CFG.cells
  s.base = generateBoard(s.seed, s.n)
  return s
}
