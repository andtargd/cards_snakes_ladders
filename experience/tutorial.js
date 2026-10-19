// The First Match: the web build's first game teaches by playing it. Only its start is set up: the board
// has a ladder from 4 to 26, the player goes first holding Swamp and rolls a 4, the two bots then stop in
// the swamp the player lays on cell 1, and the player's next card is Ladder to Snake. The rules stay as
// they are (the setup only picks the board and where the game's own generator stands), and from the
// player's second turn on the game is played as any other. Tips show the way: forced ones until both bots
// are stuck, then a few that come up once, when they are first needed, and a nudge when the player waits.
import * as R from './rules.js'
import { T } from './strings.js'

export const FIRST = { size: 50, bots: 2, level: 1, from: 4, to: 26, card: 'B1', cell: 1, next: 'B2' }
// 50-cell boards with the ladder from 4 to 26 (each is checked again: the board's settings may change)
const SEEDS = [21, 48, 99, 318, 420, 439, 486, 597, 603, 792, 1298, 1399]
const IDLE = 7.5 // seconds a player waits on their turn before a nudge
const FORCED = ['roll', 'climb', 'card', 'bots']

function hasLadder(seed) {
  try { return R.generateBoard(seed, FIRST.size).some(e => e[0] === 1 && e[1] === FIRST.from && e[2] === FIRST.to) } catch { return false }
}
function boardSeed(rand) {
  const k = Math.floor(rand() * SEEDS.length)
  for (let i = 0; i < SEEDS.length; i++) { const seed = SEEDS[(k + i) % SEEDS.length]; if (hasLadder(seed)) return seed }
  // none of them has it any more: look for one (about one board in a hundred does)
  for (let i = 0; i < 400; i++) { const seed = (rand() * 2 ** 31) >>> 0; if (hasLadder(seed)) return seed }
  return SEEDS[k]
}

/**
 * Whether the opening goes as the First Match wants it from generator position r: the player rolls a 4
 * and climbs to 26, lays the swamp on cell 1, both bots stop in it on their first turns without touching
 * the player, and the player's next card is Ladder to Snake.
 */
function opens(s0, r) {
  const s = R.clone(s0)
  s.r = r
  if (!R.apply(s, 0, { t: 'roll' }).ok || s.pl[0].pos !== FIRST.to) return false
  if (!R.apply(s, 0, { t: 'play', i: 0, tg: FIRST.cell }).ok) return false
  for (let g = 0; g < 24 && s.cur !== 0 && s.ph !== 'over'; g++) if (!R.apply(s, s.cur, R.botAction(s, s.cur)).ok) return false
  const p = s.pl[0]
  return s.cur === 0 && s.ph === 'main' && p.pos === FIRST.to && p.h.length === 1 && p.h[0] === FIRST.next && !Object.keys(p.fx).length &&
    s.pl.slice(1).every(q => q.pos === FIRST.cell) && s.mk.some(m => m.k === 'sw' && m.c.includes(FIRST.cell))
}

/** The First Match's game: `players` as for createGame (one player, the rest bots). */
export function createFirstGame(players, rand = Math.random) {
  const s = R.createGame({ seed: boardSeed(rand), mode: 'champion', players, cells: FIRST.size })
  // the player goes first, holding Swamp; nobody else has drawn yet
  const me = Math.max(0, s.pl.findIndex(p => !p.b))
  s.pl.unshift(...s.pl.splice(me, 1))
  for (const p of s.pl) { p.h = []; delete p.st; delete p.tr }
  Object.assign(s.pl[0], { h: [FIRST.card], st: 0, tr: '' })
  s.cur = 0
  // where the generator stands: the first position from which the opening goes as wanted (one in a few hundred)
  for (let k = 0; k < 8000; k++) {
    const r = (rand() * 2 ** 32) >>> 0
    if (opens(s, r)) { s.r = r; break }
  }
  return s
}

// the tips that come up once, when first needed: what they say and what they point at
const ONCE = {
  disc: { text: () => T.tipDiscard, at: 'hand' },
  take: { text: () => T.tipTake, at: 'offer' },
  pick: { text: () => T.tipPick, at: 'tray' },
  target: { text: () => T.tipTarget },
  anytime: { text: () => T.tipAnyTime, at: 'hand' },
}

/**
 * The First Match's tips as the game goes: `now` is the tip on screen this frame, or null. A tip is
 * { key, text, at, veil, card, cell }: `at` is what its arrow points at (hero, tray, card, hand, offer,
 * cell, or nothing for a line on its own), `veil` dims the rest of the screen.
 */
export class Tutorial {
  constructor(app) {
    this.app = app
    this.step = 'roll' // roll, climb, card, bots (forced), free, over
    this.off = false // Skip tutorial
    this.caption = 0 // seconds the line now up stays (the ladder, the stuck bots)
    this.stuck = new Set()
    this.once = {} // per tip of ONCE: undefined, 'on' (up now), 'done'
    this.idle = 0
    this.turnKey = null
    this.now = null
  }
  /** The forced part, until both bots are stuck, is under way. */
  get forced() { return !this.off && FORCED.includes(this.step) }
  /** Tips still come up in this game. */
  get active() { return !this.off && this.step !== 'over' }
  stop() { this.off = true; this.now = null }

  view() {
    const app = this.app, s = app.view.state, me = app.mySeat()
    return { s, me, busy: app.view.busy || app.waiting > 0, mine: !!s && me >= 0 && s.cur === me && s.ph !== 'over' }
  }
  /** The forced part is over: the First Match counts as done, the game goes on with the tips that come up once. */
  release() {
    this.app.finishFirst()
    this.step = 'free'
  }

  update(dt) {
    this.now = null
    if (this.off) return
    const { s, me, busy, mine } = this.view()
    this.caption = Math.max(0, this.caption - dt)
    if (!s || me < 0) return
    if (s.ph === 'over') { this.step = 'over'; return }
    const key = `${s.gid}:${s.turnNo}`
    if (key !== this.turnKey) { this.turnKey = key; this.idle = 0 }
    // (what the screen shows has settled: the view's state is the game's)
    if (this.step === 'climb' && !busy && this.caption <= 0) {
      if (mine && s.rolled && s.pl[me].h.includes(FIRST.card)) this.step = 'card'
      else this.release()
    }
    if (this.step === 'card' && !busy && !mine) this.step = 'bots'
    if (this.step === 'bots' && !busy && mine && this.caption <= 0) this.release()
    if (this.step === 'free' && mine && s.ph === 'main' && !busy && !this.app.ui.target && !this.app.menuOpen) this.idle += dt
    this.now = this.tip(s, me, busy, mine)
  }

  tip(s, me, busy, mine) {
    const app = this.app, ui = app.ui
    if (app.screen !== 'game' || app.menuOpen) return null
    switch (this.step) {
      case 'roll': return mine && s.ph === 'main' && !s.rolled && !busy ? { key: 'roll', text: T.tipRoll, at: 'tray', veil: true } : null
      case 'climb': return this.caption > 0 ? { key: 'ladder', text: T.tipLadder } : null
      case 'card':
        if (busy || !mine) return null
        if (ui.target?.card === FIRST.card) {
          // the camera goes down to the start, where the bots stand
          if (!this.looked) { this.looked = true; app.view.focusCell(FIRST.cell) }
          return { key: 'cell', text: T.tipCell, at: 'cell', cell: FIRST.cell }
        }
        this.looked = false
        return { key: 'card', text: T.tipCard, at: 'card', card: FIRST.card, veil: true }
      case 'bots': return this.caption > 0 ? { key: 'stuck', text: T.tipStuck } : null
      case 'free': return this.freeTip(s, me, busy, mine)
    }
    return null
  }
  /** The ladder the player climbed, as an index of the elements now, or -1 (turned already, or gone). */
  ladder(s) { return R.effectiveElements(s).findIndex(e => e[0] === 1 && e[1] === FIRST.from && e[2] === FIRST.to) }
  /** After the forced part: each tip of ONCE while it is first needed, else a nudge for a player who waits. */
  freeTip(s, me, busy, mine) {
    const app = this.app, ui = app.ui, ready = mine && !busy
    // Ladder to Snake goes on the ladder the player climbed, the tip by that ladder
    const el = mine && ui.target?.card === FIRST.next && !this.flipped ? this.ladder(s) : -1
    if (el < 0) this.lookedEl = false
    else if (!this.lookedEl) { this.lookedEl = true; app.view.focusEl(el, 0.35) }
    const need = {
      disc: ready && s.ph === 'disc',
      take: ready && s.ph === 'take',
      pick: ready && s.ph === 'pick',
      target: mine && !!ui.target && el < 0,
      anytime: ready && s.ph === 'main' && !s.rolled && !ui.target && this.caption <= 0,
    }
    let tip = el >= 0 ? { key: 'flip', text: T.tipFlip, at: 'el', el, along: 0.5 } : null
    for (const k of Object.keys(ONCE)) {
      if (need[k] && this.once[k] !== 'done') { this.once[k] = 'on'; tip ||= { key: k, text: ONCE[k].text(), at: ONCE[k].at } }
      else if (!need[k] && this.once[k] === 'on') this.once[k] = 'done'
    }
    if (tip || !ready || s.ph !== 'main' || ui.target || this.idle < IDLE) return tip
    if (!s.rolled) return { key: 'idle-roll', text: T.tipRoll, at: 'tray' }
    if (s.pl[me].h.some(c => !R.whyNot(s, me, c))) return { key: 'idle-end', text: T.tipEnd, at: 'tray' }
    return null
  }

  // ----- what the player may do while the forced tips are up -----
  /** A button of the game screen: End Turn waits while Swamp is to be played. */
  allowsHit(key) { return !(this.forced && this.step === 'card' && key === 'tray') }
  /** A card of the hand: none before the roll, then Swamp only. */
  allowsCard(c) {
    if (!this.forced) return true
    if (this.step === 'roll') return false
    return this.step !== 'card' || c.id === FIRST.card
  }
  /** An action for the rules: the roll first, then Swamp on cell 1. */
  allowsAct(a) {
    if (!this.forced) return true
    const s = this.app.table?.s, me = this.app.mySeat()
    if (this.step === 'roll') return a.t === 'roll'
    if (this.step === 'card') return a.t === 'play' && s?.pl[me]?.h[a.i] === FIRST.card && a.tg === FIRST.cell
    return true
  }
  /** Where a card may go: Swamp on cell 1 only while that is the tip, the first Ladder to Snake on the ladder the player climbed. */
  targets(cardId, list) {
    if (this.forced && this.step === 'card' && cardId === FIRST.card && list.includes(FIRST.cell)) return [FIRST.cell]
    if (!this.off && this.step === 'free' && cardId === FIRST.next && !this.flipped) {
      const s = this.app.view.state, el = s ? this.ladder(s) : -1
      if (list.includes(el)) return [el]
    }
    return list
  }

  // ----- what happens -----
  /** The rules took an action of this screen's player (`card`: the card it played). */
  onAct(a, card) {
    this.idle = 0
    if (card === FIRST.next) this.flipped = true
    if (this.off) return
    if (this.step === 'roll' && a.t === 'roll') this.step = 'climb'
    else if (this.step === 'card' && a.t === 'play') this.step = 'bots'
  }
  /** The view shows a piece going up a ladder. */
  onLadder(e) { if (!this.off && this.step === 'climb' && e.p === this.app.mySeat()) this.caption = 2.2 }
  /** The view shows a piece stopped by a swamp: when both bots are, the forced part is done. */
  onSwamp(e) {
    if (this.off || this.step !== 'bots' || !this.app.view.state?.pl[e.p]?.b) return
    this.stuck.add(e.p)
    if (this.stuck.size >= FIRST.bots) { this.caption = 2.8; this.app.finishFirst() }
  }
  /** The player touched something: no nudge for a while. */
  onInput() { this.idle = 0 }
}
