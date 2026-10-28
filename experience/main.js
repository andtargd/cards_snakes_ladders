// Cards, Snakes & Ladders for Project 0: a turn-based race up paper tiers with a deck of cards.
// Play against bots on your own or with friends at one computer (passing it round), or sit down with
// everyone in the lot at the Shared Table, where the session's host runs the rules and the bots and the
// others send their moves. Players in the lot can invite each other to the Shared Table.
import * as THREE from 'three'
import * as R from './rules.js'
import { View } from './view.js'
import { UI } from './ui.js'
import { T } from './strings.js'
import { Tutorial, createFirstGame, FIRST } from './tutorial.js'
import SOUNDS from './sounds.config.js'

const BOT_NAMES = ['Pip', 'Juniper', 'Mossy', 'Bramble', 'Clover', 'Fennel', 'Quill', 'Basil', 'Tansy', 'Wren', 'Sorrel', 'Nutmeg']
const SPEEDS = [[1, '1x'], [2, '2x'], [4, '4x'], [60, 'Skip']]
const BOT_DELAY = 1.1
const TURN_SECONDS = 45
const INVITE_SECONDS = 45
const ABSENT_SECONDS = 20 // a seated player missing from the session this long gets a bot in their seat
// Quick Match (the web build's quick rooms): the game starts at once, bots under names like the
// players' own in the empty seats; a player who comes later takes one of their seats
const QUICK_TABLE = { 50: 4, 70: 4, 100: 5 } // players at the table the bots fill it up to, by board: 3 bots at most, 4 on 100 cells
const SETTINGS_KEY = 'csl-settings'
const GAME_KEY = 'csl-game' // the game being played in this browser, so a reload carries on with it
const MAX_NAME = 14
// The dice's sounds (tools/make_sfx.py), a few takes of each so no two rolls sound quite alike: `roll` the
// wooden ticks as they are thrown (quicker with the game), `land` the ding as they come to rest showing the number
const takes = (name, n) => Array.from({ length: n }, (_, i) => `${name}${i + 1}`)
const ROLL_SOUNDS = { roll: takes('roll', 4), land: takes('land', 3) }
/**
 * Each moment's sound and how loud it plays (sounds.config.js): name -> { file, volume }, the volume 0 to 2.
 * For trying levels out, the page's address can set some: ?sfx=roll:0.3,land:0.8
 */
const SOUND = (() => {
  const out = {}, vol = v => Math.max(0, Math.min(2, v))
  for (const [name, c] of Object.entries(SOUNDS)) {
    const o = typeof c === 'number' ? { volume: c } : c || {}
    out[name] = { file: String(o.sound || name), volume: Number.isFinite(o.volume) ? vol(o.volume) : 0.5 }
  }
  try {
    for (const part of (new URLSearchParams(globalThis.location?.search || '').get('sfx') || '').split(',')) {
      const [name, s] = part.split(':'), v = s ? Number(s) : NaN
      if (out[name] && Number.isFinite(v)) out[name].volume = vol(v)
    }
  } catch { /* no address here */ }
  return out
})()
const unknownSounds = new Set()
function soundOf(name) {
  if (SOUND[name]) return SOUND[name]
  if (!unknownSounds.has(name)) { unknownSounds.add(name); console.warn(`[sound] "${name}" is not in sounds.config.js: it plays at 0.5`) }
  return { file: name, volume: 0.5 }
}

/** Players at a table the rules allow: Fool needs three. */
const least = mode => (mode === 'fool' ? 3 : 2)
/** Bots for `humans` players at a table the rules allow (at most 6 in all). */
function fitBots(c, humans) { c.bots = Math.min(6 - humans, Math.max(c.bots, least(c.mode) - humans, 0)) }
const cleanLocalName = s => String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME).replace(/[\ud800-\udbff]$/, '') // (not half an emoji)

/**
 * The menu's choices and the sound, as last left (kept in this browser, where it lets us): Solo Play
 * (a first game is short and easy to win: Champion on the 50-cell board against two Easy bots), Pass
 * & Play (the names typed for its players; '' is "Player n"), the mode and board for online play, and
 * whether the First Match is still due ('due' | 'done'; a browser that kept settings from before it played already).
 * `vol` is the volume the sound starts at, before the player moves it (the site's: quieter in a voice channel).
 */
function loadSettings(vol = 0.8) {
  const solo = { mode: 'champion', bots: 2, level: 1, size: 50 }
  const pass = { mode: 'champion', names: ['', ''], bots: 0, level: 2, size: 50 }
  const online = { mode: 'champion', size: 50 }, sound = { on: true, vol }
  let saved = null
  try { saved = JSON.parse(globalThis.localStorage?.getItem(SETTINGS_KEY) || 'null') } catch { /* no storage here */ }
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi
  const ok = c => c && ['champion', 'fool'].includes(c.mode) && int(c.bots, 0, 5) && int(c.level, 1, 3) && R.SIZES.includes(c.size)
  const take = (to, c) => Object.assign(to, { mode: c.mode, bots: c.bots, level: c.level, size: c.size })
  // settings from before Solo Play and Pass & Play: one table for both
  const old = saved?.cfg
  if (ok(old) && int(old.humans, 1, 6)) {
    if (old.humans > 1) { take(pass, old); pass.names = Array(old.humans).fill('') } else take(solo, old)
  }
  if (ok(saved?.solo)) take(solo, saved.solo)
  if (ok(saved?.pass) && Array.isArray(saved.pass.names) && int(saved.pass.names.length, 2, 6)) { take(pass, saved.pass); pass.names = saved.pass.names.map(cleanLocalName) }
  if (['champion', 'fool'].includes(saved?.online?.mode)) online.mode = saved.online.mode
  if (R.SIZES.includes(saved?.online?.size)) online.size = saved.online.size
  fitBots(solo, 1); fitBots(pass, pass.names.length)
  if (typeof saved?.sound?.on === 'boolean') sound.on = saved.sound.on
  if (Number.isFinite(saved?.sound?.vol)) sound.vol = Math.min(1, Math.max(0, saved.sound.vol))
  const first = !saved || saved.first === 'due' ? 'due' : 'done'
  return { solo, pass, online, sound, first }
}

/** The game saved by the last LocalTable here, or null. */
function loadGame() {
  try {
    const g = JSON.parse(globalThis.localStorage?.getItem(GAME_KEY) || 'null')
    const s = g?.s
    if (g?.v !== 1 || !s || !Array.isArray(s.pl) || s.pl.length < 2 || s.ph === 'over' || !Number.isInteger(s.cur) || !s.pl[s.cur]) return null
    return g
  } catch { return null }
}
function clearGame() { try { globalThis.localStorage?.removeItem(GAME_KEY) } catch { /* no storage here */ } }

// ---------- a game played in this browser: one player or several taking turns at it, and bots ----------
class LocalTable {
  /**
   * `saved` (from loadGame) carries on with a game from before the page was reloaded. `names`: the players'
   * (Pass & Play). `first`: the First Match, whose start is set up (tutorial.js).
   */
  constructor(app, { kind, mode, humans = 1, names = [], bots, level, size = 100, first = false }, saved = null) {
    this.app = app
    this.kind = kind
    this.humans = humans
    this.shown = -1 // with several players at one computer: whose hand was last shown
    const p0 = app.p0
    this.cfg = { mode, humans, names, bots, level, size, ...(first ? { first: true } : {}) }
    if (saved) {
      this.s = R.unpack(saved.s)
      // my seat: the session's id can be new after a reload
      const mine = this.s.pl.find(p => !p.b && p.id != null)
      if (mine) mine.id = p0.me.id
    } else {
      const seed = (Math.random() * 2 ** 31) >>> 0
      const botNames = shuffle([...BOT_NAMES], seed)
      const players = []
      for (let i = 0; i < humans; i++) players.push(i === 0 ? { n: names[0] || p0.me.name || R.SELF, b: 0, id: p0.me.id, c: 0 } : { n: names[i] || T.playerN(i + 1), b: 0, id: null, c: i })
      for (let i = 0; i < bots; i++) players.push({ n: botNames[i], b: level, c: players.length })
      this.s = first ? createFirstGame(players) : R.createGame({ seed, mode, players, cells: size })
      this.s.gid = seed // (the First Match's board comes from a few seeds: the game's id is its own)
    }
    this.wait = 1.4
    app.view.tasks = []
    app.view.setState(R.clone(this.s), { players: p0.players })
    for (const l of saved ? (Array.isArray(saved.log) ? saved.log.slice(-60).map(String) : this.s.log) : this.s.log) app.ui.log(l)
    app.view.distWant = 7.5
    app.view.focusWant.copy(app.view.tokens[this.s.cur].group.position)
  }
  /** The seat this screen plays: mine, or with several players at one computer whoever's turn is shown. */
  mySeat() {
    if (this.kind !== 'solo') return -1
    if (this.humans < 2) return this.s.pl.findIndex(p => !p.b && p.id === this.app.p0.me.id)
    const s = this.app.view.state || this.s
    return s.ph !== 'over' && !s.pl[s.cur].b ? s.cur : -1
  }
  /** A player whose turn it is but whose hand stays hidden until they say they hold the computer, or -1. */
  curtain() {
    if (this.humans < 2) return -1
    const me = this.mySeat()
    return me >= 0 && me !== this.shown ? me : -1
  }
  reveal() { this.shown = this.mySeat() }
  /** Keeps the game in this browser until it ends, so a reload carries on with it. */
  save() {
    if (this.kind !== 'solo' || this.app.table !== this) return
    if (this.s.ph === 'over') { clearGame(); return }
    try {
      globalThis.localStorage?.setItem(GAME_KEY, JSON.stringify({ v: 1, cfg: this.cfg, s: R.pack(this.s), log: this.app.ui.logLines.slice(-60), speed: this.app.speedIdx }))
    } catch { /* no storage here */ }
  }
  act(a) {
    if (this.app.view.busy || this.curtain() >= 0) return false
    const pi = this.mySeat()
    if (pi < 0) return false
    const r = R.apply(this.s, pi, a)
    if (!r.ok) { this.app.ui.say(r.err); return false }
    this.after(r.ev)
    return true
  }
  after(ev) {
    this.app.view.play(ev, R.clone(this.s), { players: this.app.p0.players })
    this.save()
    // a game shared at one computer does not count for the week's table
    if (this.s.ph === 'over') this.app.gameOver(this.s, this.humans > 1 ? -1 : this.mySeat())
  }
  update(dt) {
    const s = this.s, view = this.app.view
    if (s.ph === 'over') return
    if (view.busy) return
    const p = s.pl[s.cur]
    if (!p.b) return
    this.wait -= dt * view.speed
    if (this.wait > 0) return
    this.wait = BOT_DELAY * (0.75 + Math.random() * 0.5)
    const r = R.apply(s, s.cur, R.botAction(s, s.cur))
    if (!r.ok) { this.app.p0.log('bot error', r.err); R.apply(s, s.cur, { t: s.rolled ? 'end' : 'roll' }); return }
    this.after(r.ev)
  }
}

// ---------- the board behind the menus: no game is played there ----------
class IdleTable {
  constructor(app) {
    this.app = app
    this.kind = 'idle'
    const seed = (Math.random() * 2 ** 31) >>> 0
    this.s = R.createGame({ seed, mode: 'champion', players: [{ n: 'A', b: 1 }, { n: 'B', b: 1 }] })
    app.view.tasks = []
    app.view.setState(R.clone(this.s))
    for (const t of app.view.tokens) t.group.visible = false
    // the whole board, still: the menus stand beside it
    app.view.manual = 0
    app.view.overview()
    app.view.focusWant.z += 0.4
  }
  mySeat() { return -1 }
  act() { return false }
  update() {}
}

// ---------- the Shared Table: everyone in the session, the host runs the rules ----------
class SharedTable {
  constructor(app, g) {
    this.app = app
    this.kind = 'shared'
    this.wait = 1.4
    this.turnSeen = -1
    this.turnStart = 0
    this.load(g, true)
  }
  get p0() { return this.app.p0 }
  load(g, snap) {
    const s = R.unpack(g.s)
    s.gid = g.gid
    const fresh = !this.s || this.s.gid !== g.gid
    const watched = !fresh && this.mySeat() < 0
    const ev = g.ev
    const nextSeq = this.s && !fresh && ev && s.seq === this.s.seq + 1
    this.s = s
    if (fresh || snap || !nextSeq) {
      this.app.view.tasks = []
      this.app.view.setState(R.clone(s), { players: this.p0.players })
      if (fresh) { this.app.ui.logLines = []; this.app.view.overview() }
      for (const l of (fresh ? s.log : [])) this.app.ui.log(l)
    } else this.app.view.play(ev, R.clone(s), { players: this.p0.players })
    if (watched && this.mySeat() >= 0 && (this.app.quick() || this.app.atChannel())) this.app.ui.say(T.quickSeated, 3)
    if (s.ph === 'over') this.app.gameOver(s, this.mySeat())
  }
  mySeat() { return this.s.pl.findIndex(p => !p.b && p.id === this.p0.me.id) }
  act(a) {
    if (this.app.view.busy || this.app.waiting > 0) return false
    if (this.p0.room.isHost) return this.applyFrom(this.p0.me.id, a)
    // the host checks it again; a move made out of turn is not sent at all
    const s = this.s, me = this.mySeat()
    if (s.ph === 'over' || me < 0 || s.cur !== me) { this.app.ui.say(s.ph === 'over' ? 'The game is over' : 'Not your turn'); return false }
    this.p0.room.sendTo(this.p0.room.host, { t: 'act', gid: this.s.gid, seq: this.s.seq, a })
    this.app.waiting = 2.5
    return true
  }
  /** Host: a player's action, checked against whose turn it is. */
  applyFrom(id, a) {
    const s = this.s
    const pi = s.cur
    if (s.ph === 'over' || s.pl[pi].id !== id || s.pl[pi].b) { if (id !== this.p0.me.id) this.p0.room.sendTo(id, { t: 'err', text: 'Not your turn' }); return false }
    const r = R.apply(s, pi, a)
    if (!r.ok) { if (id === this.p0.me.id) this.app.ui.say(r.err); else this.p0.room.sendTo(id, { t: 'err', text: r.err }); return false }
    this.publish(r.ev)
    return true
  }
  publish(ev) {
    const s = this.s
    let payload = { gid: s.gid, s: R.pack(s), ev }
    if (bytes(payload) > 2000) payload = { gid: s.gid, s: R.pack(s), ev: ev.filter(e => e.e !== 'board' && e.e !== 'log') }
    if (bytes(payload) > 2000) payload = { gid: s.gid, s: R.pack(s), ev: null }
    if (bytes(payload) > 2040) { const t = R.pack(s); t.log = t.log.slice(-2); payload = { gid: s.gid, s: t, ev: null } }
    this.p0.room.set('g', payload)
    this.app.view.play(ev || [], R.clone(s), { players: this.p0.players })
    if (s.ph === 'over') this.app.gameOver(s, this.mySeat())
  }
  onState(g, from) {
    if (!g) return
    if (from === this.p0.me.id && this.p0.room.isHost) return // our own publish, already shown
    this.app.waiting = 0
    this.load(g, false)
  }
  /** Host: a seated player left the session (or the game); a bot takes the seat with the same hand (until they are back and take it again). */
  replace(id) {
    const s = this.s
    const i = s.pl.findIndex(p => p.id === id && !p.b)
    if (i < 0 || s.ph === 'over') return
    s.pl[i].b = 2
    s.pl[i].rb = 1
    const text = R.addLog(s, T.replacedByBot(s.pl[i].n))
    s.seq++
    this.publish([{ e: 'log', text }])
  }
  /**
   * Seats a bot holds that player `id` may take back: their own; else, when they have none, those whose
   * players have left the room (someone back under a new id after closing the page). None for a player
   * who holds a seat.
   */
  claimable(id) {
    const s = this.s, seats = s.pl.map((p, i) => i)
    if (s.ph === 'over' || s.pl.some(p => p.id === id && !p.b)) return []
    const own = seats.filter(i => s.pl[i].rb && s.pl[i].id === id)
    return own.length ? own : seats.filter(i => s.pl[i].rb && s.pl[i].id !== this.p0.me.id && !this.p0.players.has(s.pl[i].id))
  }
  /** The seat this screen's player can take back from its bot (the one under their name first), or -1. */
  myClaim() {
    const list = this.claimable(this.p0.me.id), key = n => String(n || '').trim().toLowerCase()
    return list.find(i => key(this.s.pl[i].n) === key(this.p0.me.name)) ?? list[0] ?? -1
  }
  /** Host: a player back at the table takes seat `i` from the bot that played it meanwhile (they press Continue Playing). */
  takeBack(id, i) {
    const s = this.s, p = s.pl[i]
    if (!this.claimable(id).includes(i)) return false
    const old = p.id
    p.id = id
    p.b = 0
    delete p.rb
    const text = R.addLog(s, T.seatBack(p.n))
    s.seq++
    this.publish([{ e: 'log', text }])
    this.app.keepLobbySeat(id, old)
    return true
  }
  /** Host: seated players who are not in the session (the table was opened again after a reload) get a while to come back. */
  checkAbsent(dt) {
    this.absent ||= new Map()
    for (const p of this.s.pl) {
      if (p.b || p.id == null || p.id === this.p0.me.id || this.p0.players.has(p.id)) { this.absent.delete(p.id); continue }
      const t = (this.absent.get(p.id) || 0) + dt
      this.absent.set(p.id, t)
      if (t > ABSENT_SECONDS) { this.absent.delete(p.id); this.replace(p.id) }
    }
  }
  update(dt) {
    const s = this.s, view = this.app.view
    // the turn clock, as everyone sees it
    if (s.turnNo !== this.turnSeen) { this.turnSeen = s.turnNo; this.turnStart = 0 }
    if (!view.busy) this.turnStart += dt
    // (a Quick Match bot plays as a player would: on the clock, and taking a moment to think)
    const disguised = p => !!p.f && this.app.quick()
    const human = (!s.pl[s.cur].b || disguised(s.pl[s.cur])) && s.ph !== 'over'
    this.app.turnLeft = human ? Math.max(0, TURN_SECONDS - this.turnStart) : null
    if (!this.p0.room.isHost || s.ph === 'over') return
    this.checkAbsent(dt)
    if (view.busy) return
    const p = s.pl[s.cur]
    if (p.b) {
      this.wait -= dt * view.speed
      if (this.wait > 0) return
      this.wait = BOT_DELAY * (disguised(p) ? 1 + Math.random() * 1.4 : 0.75 + Math.random() * 0.5)
      const r = R.apply(s, s.cur, R.botAction(s, s.cur))
      if (r.ok) this.publish(r.ev)
      return
    }
    if (this.turnStart > TURN_SECONDS) {
      // out of time: discard the card just drawn, take a card or a die as a bot would, roll if not rolled, then end the turn
      const a = s.ph === 'disc' ? { t: 'disc', i: p.h.length - 1 } : s.ph === 'pick' || s.ph === 'take' ? R.botAction(s, s.cur) : !s.rolled ? { t: 'roll' } : { t: 'end' }
      const r = R.apply(s, s.cur, a)
      if (r.ok) this.publish(r.ev)
      this.turnStart = TURN_SECONDS - 2
    }
  }
}

/**
 * The drawing resolution: it steps down when the frames are slow for a few seconds running and back up
 * when they are quick again. It goes by the typical frame (the median over a window of visible frames),
 * so hitches do not count: a tab in the background, a window being moved, the page busy with something
 * besides drawing (a phone stalls again and again as Quick Match sets up its connections). A window made
 * mostly of frames that long says nothing either, unless it goes on and on: a machine that can't draw this.
 */
function resolution(renderer, p0) {
  const WINDOW = 2, SLOW = 1 / 24, FAST = 1 / 50, MIN = 0.5, HITCH = 0.1, STUCK = 5
  const top = () => Math.min(p0.pixelRatio || 1, 2)
  const clock = () => (globalThis.performance?.now?.() ?? NaN) / 1000
  let max = top(), ratio = max, times = [], span = 0, long = 0, slowRuns = 0, fastRuns = 0, stuckRuns = 0, settle = 1, upBlocked = 0, last = NaN
  renderer.setPixelRatio(ratio)
  const restart = () => { times = []; span = 0; long = 0 }
  const set = r => { ratio = r; renderer.setPixelRatio(r); restart(); slowRuns = 0; fastRuns = 0; stuckRuns = 0; settle = 1 }
  const down = () => {
    // stepping down right after a step up: the higher one was too much, stay here a while
    if (upBlocked > 0) upBlocked = 120
    set(Math.max(MIN, ratio * 0.8))
  }
  return {
    get ratio() { return ratio },
    frame(dt) {
      // the real time since the last frame (the game's dt is cut short after a hitch)
      const now = clock(), gap = Number.isFinite(now - last) ? Math.max(dt, now - last) : dt
      last = now
      // the screen changed (another monitor, the browser's zoom): start from its full resolution
      if (top() !== max) { max = top(); set(max); upBlocked = 0; return }
      if (p0.web?.fixedRatio) return // (a test of how it looks at one pixel ratio)
      upBlocked = Math.max(0, upBlocked - dt)
      // hidden, not drawn on screen (the web build's steady timer runs the game then), going online, or
      // just shown again: these frames say nothing about the machine
      if (globalThis.document?.hidden || p0.web?.unseen || p0.web?.status?.busy || gap > 0.25) { settle = 1; restart(); return }
      if (settle > 0) { settle -= gap; return }
      span += gap
      if (gap > HITCH) long++; else times.push(gap)
      if (span < WINDOW) return
      if (long > times.length) {
        restart(); fastRuns = 0
        if (++stuckRuns >= STUCK && ratio > MIN) down()
        return
      }
      times.sort((a, b) => a - b)
      const typical = times[times.length >> 1]
      restart(); stuckRuns = 0
      slowRuns = typical > SLOW ? slowRuns + 1 : 0
      fastRuns = typical < FAST ? fastRuns + 1 : 0
      if (slowRuns >= 2 && ratio > MIN) down()
      else if (fastRuns >= 3 && ratio < max && upBlocked <= 0) {
        set(Math.min(max, ratio * 1.25))
        upBlocked = 20
      }
    },
  }
}

const bytes = v => new TextEncoder().encode(JSON.stringify(v ?? null)).byteLength
function shuffle(a, seed) {
  const r = R.mulberry32(seed)
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

// ---------- the app ----------
class App {
  constructor(p0) {
    this.p0 = p0
    this.screen = 'menu' // menu | solo | pass | online | lobby | help | game
    const saved = loadSettings(p0.web?.platform?.volume)
    this.solo = saved.solo // Solo Play: { mode, bots, level, size }
    this.pass = saved.pass // Pass & Play: { mode, names, bots, level, size }
    this.online = saved.online // online play: { mode, size } for Quick Match and a new room
    this.sound = saved.sound // { on, vol }
    this.first = saved.first // the First Match: 'due' until its forced tips are done or skipped
    this.tut = null // the First Match's tips, while it is played (tutorial.js)
    this.confirmSkip = false // the game menu asks whether leaving the First Match skips its tips
    this.speedIdx = 0
    this.waiting = 0
    this.turnLeft = null
    this.reward = null
    this.menuOpen = false
    this.view = new View(p0)
    this.ui = new UI(p0, this)
    this.view.cover = () => this.ui.cover()
    this.view.floor = () => this.ui.floor()
    this.table = null
    this.shared = null
    this.lastSfx = {}
    this.status = new Map() // what the others in the lot are doing: id -> 'menu' | 'solo' | 'lobby' | 'shared'
    this.statusSent = null
    this.invite = null // an invitation to the Shared Table I got: { from, t }
    this.invSent = new Map() // id -> when I last invited them
    const v = this.view
    v.on('draw', e => { if (e.p === this.mySeat()) this.sfx('draw'); this.ui.dirty = true })
    v.on('offer', e => { if (e.p === this.mySeat()) this.sfx('offer'); this.ui.dirty = true })
    for (const name of ['turn', 'mustdisc', 'roll', 'redraw', 'steal', 'swaphands', 'peek', 'settled']) v.on(name, () => { this.ui.dirty = true })
    v.on('discard', e => { this.ui.burnDiscard(e); this.ui.dirty = true })
    v.on('log', text => this.ui.log(text))
    v.on('play', e => { this.ui.showPlayed(e); this.sfx('card'); this.ui.dirty = true })
    v.on('over', () => { this.ui.dirty = true })
    // the log has caught up with the game: keep it with the saved game
    v.on('settled', () => { if (this.table?.kind === 'solo') this.table.save() })
    v.on('sfx', name => this.sfx(name))
    // the dice's sounds on a timeline from the throw (rollSound); the landing moves with the frames if they lag
    v.on('rollsound', landIn => this.rollSound(landIn))
    v.on('rollwhen', landIn => { this.diceCue?.land?.move(landIn); this.diceCue?.roll?.until(landIn) })
    v.on('rolland', () => { if (this.diceCue && !this.diceCue.land) this.playFile(this.diceCue.landName, SOUND.land.volume) })
    this.lastTake = {}
    this.diceCue = null
    // the dice's sounds ready before the first roll: the one as they land must not wait to be fetched
    for (const list of Object.values(ROLL_SOUNDS)) for (const name of list) { try { p0.sound.preload?.(`sfx/${name}.mp3`) } catch { /* sound is optional */ } }
    v.on('ladder', e => this.tut?.onLadder(e))
    v.on('swamp', e => this.tut?.onSwamp(e))
    // the web build's online play: how an attempt goes, and a room's link that brought the player
    p0.web?.onChange?.(() => this.onWebStatus())
  }
  /** The sound of a moment in the game (sounds.config.js), not again within a moment of the last, nor at the menu's idle table. */
  sfx(name) {
    const now = this.p0.time
    if (this.table?.kind === 'idle' || now - (this.lastSfx[name] || -9) < 0.09) return
    this.lastSfx[name] = now
    this.playSound(name)
  }
  /** A take of the dice's sound `part` (ROLL_SOUNDS), other than the last one. */
  take(part) {
    const list = ROLL_SOUNDS[part]
    let i = Math.floor(Math.random() * list.length)
    if (list.length > 1 && list[i] === this.lastTake[part]) i = (i + 1) % list.length
    return (this.lastTake[part] = list[i])
  }
  /**
   * A roll's sounds, on one timeline from the throw: the ticks now, faded out just before the dice land
   * `landIn` s from now (they never run into the ding, however quick the game), and the ding exactly then.
   * The last roll's sounds still ringing fade out first. Where sounds can't be timed so (Project 0, a page
   * not touched yet), the ticks play now and the ding as the view says the dice land.
   */
  rollSound(landIn) {
    for (const c of [this.diceCue?.roll, this.diceCue?.land]) c?.fade()
    this.diceCue = null
    if (this.table?.kind === 'idle' || !this.sound.on || this.sound.vol < 0.005 || this.p0.web?.muted) return
    const roll = this.take('roll'), land = this.take('land'), vol = this.sound.vol
    const cue = (name, o) => { try { return this.p0.sound.cue?.(`sfx/${name}.mp3`, o) || null } catch { return null } }
    // (at the Skip speed they land at once: the ding alone)
    const ticks = landIn > 0.15 ? cue(roll, { volume: SOUND.roll.volume * vol, until: landIn }) : null
    if (!ticks && landIn > 0.15) this.playFile(roll, SOUND.roll.volume, Math.min(4, this.view.speed))
    this.diceCue = { roll: ticks, land: cue(land, { volume: SOUND.land.volume * vol, at: landIn }), landName: land }
  }
  /** The sound of moment `name` (sounds.config.js), played at once. */
  playSound(name, rate = 1) {
    const s = soundOf(name)
    this.playFile(s.file, s.volume, rate)
  }
  /** Sound file sfx/`file`.mp3 at `volume` (0 to 2), under the player's own volume. */
  playFile(file, volume = 0.5, rate = 1) {
    const v = this.sound.on ? volume * this.sound.vol : 0
    if (v < 0.005 || this.p0.web?.muted) return
    try { this.p0.sound.play(`sfx/${file}.mp3`, rate === 1 ? { volume: v } : { volume: v, rate }) } catch { /* sound is optional */ }
  }
  saveSettings() {
    try { globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify({ solo: this.solo, pass: this.pass, online: this.online, sound: this.sound, first: this.first })) } catch { /* no storage here */ }
  }

  // ----- the First Match: the web build's first game, with tips (tutorial.js) -----
  /**
   * The menu offers the First Match in place of Quick Match: the web build only, until it is done or
   * skipped, and not for a player a room's link brought or who is in an online room.
   */
  firstDue() { const web = this.p0.web; return !!web && this.first !== 'done' && !web.room && !web.invited && !web.channel }
  /** The First Match's forced tips are done (or skipped): Quick Match is back, a reload carries on with the game as any other. */
  finishFirst() {
    if (this.first === 'done') return
    this.first = 'done'
    this.saveSettings(); this.ui.dirty = true
  }
  /** Champion on 50 cells against two Easy bots, the start set up; also How to Play's Replay tutorial. */
  startFirstMatch() {
    this.startLocal({ mode: 'champion', humans: 1, names: [], bots: FIRST.bots, level: FIRST.level, size: FIRST.size, first: true })
  }
  /** Skip tutorial: no more tips, and the First Match is not offered again. */
  skipTutorial() {
    this.tut?.stop()
    this.confirmSkip = false
    this.finishFirst()
    this.ui.dirty = true
  }
  /** The tip on screen now: the menu's First Match while it is due, else the First Match's own. */
  tipNow() {
    if (this.screen === 'menu' && this.firstDue() && !this.p0.web?.status) return { key: 'start', text: T.tipStart, at: 'hero', veil: true }
    return this.screen === 'game' && this.tut ? this.tut.now : null
  }
  /** A button may be clicked: while the First Match is due, the menu takes it and the sound only. */
  allowsHit(key) {
    if (key === 'tipskip') return true
    if (this.screen === 'menu' && this.firstDue() && !this.p0.web?.status) return key === 'quick' || key === 'snd'
    return this.screen === 'game' && this.tut ? this.tut.allowsHit(key) : true
  }
  /** A click the tip does not let through: the tip shakes. */
  nudge() { this.ui.kickTip() }
  /** Back in a game (Escape, Backspace, the right button): the effects' cards close, else a card waiting for its target goes back, else another player's hand closes. */
  backInGame() { if (this.ui.closeFx()) return; if (this.ui.target) this.ui.cancelTarget(); else this.ui.closePeek() }
  /** The game menu's Main Menu: during the First Match it asks first whether to skip the tips. */
  leaveGame() {
    if (this.tut?.active) { this.confirmSkip = true; this.ui.dirty = true; return }
    this.toMenu()
  }
  /** The First Match's results: a game as set (another against Medium bots, Fool, or the bigger board), kept for Solo Play. */
  playAgain(kind = 'again') {
    Object.assign(this.solo, { mode: kind === 'fool' ? 'fool' : 'champion', bots: 2, level: 2, size: kind === 'big' ? 70 : 50 })
    this.menuOpen = false
    this.startSolo()
  }
  /** A friendly random name (the web build's; Project 0 makes do with the bots'). */
  randomName() { return this.p0.web?.randomName?.() || BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] }
  /** Pass & Play's player `i` as the game will call them. */
  passName(i) { return this.pass.names[i] || (i === 0 && this.p0.me.name) || T.playerN(i + 1) }
  setPassName(i, name) {
    if (i < 0 || i >= this.pass.names.length) return
    this.pass.names[i] = cleanLocalName(name)
    this.saveSettings(); this.ui.dirty = true
  }
  /** Pass & Play: one more player (a bot gives way when the table is full), or player `i` leaves it. */
  addPassPlayer() {
    const c = this.pass
    if (c.names.length >= 6) return
    c.names.push('')
    fitBots(c, c.names.length)
    this.saveSettings(); this.ui.dirty = true
  }
  removePassPlayer(i) {
    const c = this.pass
    if (c.names.length <= 2 || i < 0 || i >= c.names.length) return
    c.names.splice(i, 1)
    fitBots(c, c.names.length)
    this.saveSettings(); this.ui.dirty = true
  }
  /** A setup screen changed `c` (Solo Play's or Pass & Play's): keep a table the rules allow, and keep it. */
  setupChanged(c) {
    fitBots(c, c === this.pass ? c.names.length : 1)
    this.saveSettings(); this.ui.dirty = true
  }
  /** A screen of the menus (the setup screens, How to Play): Back goes to the main one. */
  toScreen(name) {
    this.screen = name
    this.ui.dirty = true
  }
  toggleSound() {
    const snd = this.sound
    snd.on = !(snd.on && snd.vol > 0.02)
    if (snd.on && snd.vol < 0.05) snd.vol = 0.6
    this.saveSettings()
    if (snd.on) this.playSound('soundOn')
    this.ui.dirty = true
  }
  /** The volume slider: 0 to 1; moving it up turns the sound on. */
  setVolume(v) {
    this.sound.vol = Math.round(Math.min(1, Math.max(0, v)) * 100) / 100
    if (this.sound.vol > 0) this.sound.on = true
    this.ui.dirty = true
  }
  mySeat() { return this.table ? this.table.mySeat() : -1 }
  /** Several players taking turns at this computer. */
  hotseat() { return this.table?.kind === 'solo' && this.table.humans > 1 }
  /** The player who should take the computer before their hand is shown, or -1. */
  curtain() { return this.screen === 'game' && this.table?.curtain ? this.table.curtain() : -1 }
  reveal() { this.table?.reveal?.(); this.sfx('start'); this.ui.dirty = true }
  sessionCount() { return this.p0.players.size }
  nameOf(id) { return this.p0.players.get(id)?.name || 'someone' }
  speedLabel() { return SPEEDS[this.speedIdx][1] }
  cycleSpeed() { this.speedIdx = (this.speedIdx + 1) % SPEEDS.length; this.view.speed = SPEEDS[this.speedIdx][0]; this.ui.dirty = true }

  startAttract() {
    this.table = new IdleTable(this)
    this.view.speed = 1
  }
  /** Carries on with the game this browser was playing before the page was reloaded; false when there is none. */
  resumeSolo() {
    const g = loadGame()
    if (!g) return false
    const c = g.cfg || {}
    // a First Match left before its forced tips were done starts over (from the menu); after them it carries on without tips
    if (c.first && this.first !== 'done') { clearGame(); return false }
    try {
      this.table = new LocalTable(this, { kind: 'solo', mode: g.s.mode, humans: c.humans | 0 || 1, names: Array.isArray(c.names) ? c.names.map(cleanLocalName) : [], bots: c.bots | 0, level: c.level | 0 || 2, size: g.s.n, first: !!c.first }, g)
    } catch (e) { this.p0.log('resume', String(e)); clearGame(); return false }
    this.reward = null
    if (Number.isInteger(g.speed) && SPEEDS[g.speed]) this.speedIdx = g.speed
    this.view.speed = SPEEDS[this.speedIdx][0]
    this.screen = 'game'
    this.ui.dirty = true
    return true
  }
  /** Solo Play: me against the bots, as set on its screen. */
  startSolo() { const c = this.solo; this.startLocal({ mode: c.mode, humans: 1, names: [], bots: c.bots, level: c.level, size: c.size }) }
  /** Pass & Play: the players take turns at this computer, with the bots set on its screen. */
  startPass() { const c = this.pass; this.startLocal({ mode: c.mode, humans: c.names.length, names: c.names.map((n, i) => this.passName(i)), bots: c.bots, level: c.level, size: c.size }) }
  /** A game at this computer: `setup` is { mode, humans, names, bots, level, size, first? }. */
  startLocal(setup) {
    // the first game after one that ended waits for whatever the site shows between games
    if (this.finished) { this.finished = false; this.betweenGames(() => this.startLocal(setup)); return }
    this.saveSettings()
    this.reward = null
    this.ui.logLines = []
    this.ui.selected = -1; this.ui.cancelTarget(); this.ui.hidden = null // (a card hidden as it flew from the last game's hand)
    this.keptSolo = false // (a game kept for after a room: this one takes its place)
    this.table = new LocalTable(this, { kind: 'solo', ...setup })
    this.tut = setup.first ? new Tutorial(this) : null
    this.confirmSkip = false
    this.table.save()
    this.view.speed = SPEEDS[this.speedIdx][0]
    this.screen = 'game'
    this.ui.dirty = true
    this.sfx('start')
  }
  /** `keep`: a game here against bots stays saved, to come back to (resumeSolo). */
  toMenu(keep = false) {
    // a Quick Match table is left with its room: the game goes on without me (a bot takes my seat), and
    // no one there waits for a host who is in the menu (onWebRoom brings me here again, out of the room)
    if (this.quick() && this.atTable()) { this.p0.web.leave(); return }
    if (this.table?.kind === 'solo') { if (keep) this.keptSolo = true; else clearGame() }
    if (this.table?.kind === 'shared') {
      if (this.p0.room.isHost) { const lob = this.lobby(); lob.status = 'lobby'; this.pruneSeats(lob); this.p0.room.set('lob', lob) }
      else this.p0.room.sendTo(this.p0.room.host, { t: 'leaveSeat' })
    }
    this.menuOpen = false
    this.confirmSkip = false
    this.tut = null
    this.screen = 'menu'
    this.shared = null
    this.ui.cancelTarget(); this.ui.selected = -1
    this.startAttract()
    this.ui.dirty = true
    // where the site has a table of its own (Discord's channel) a game ends at that table's lobby (or goes into it again); its Back leads to the menu
    if (this.channel()) { if (this.atChannel()) this.openLobby(); else this.enterChannel() }
  }
  rematch() {
    this.menuOpen = false
    if (this.table?.kind === 'shared') { if (this.p0.room.isHost) this.lobbyCmd({ t: 'start' }); return }
    // after the First Match, its Play Again: Medium bots, nothing set up
    if (this.table?.cfg?.first) this.playAgain()
    else if (this.table?.kind === 'solo') this.startLocal(this.table.cfg); else this.startSolo()
  }
  openGameMenu() { this.menuOpen = !this.menuOpen; this.confirmSkip = false; this.ui.dirty = true }

  // ----- the site the web build runs on (p0.web.hooks; Project 0 has none, so all of this is skipped there) -----
  hook(name, ...a) { try { return this.p0.web?.hooks?.[name]?.(...a) } catch { return undefined } }
  /** A game is being played on this screen: not a menu, the game's own menu or a game that has ended. */
  inPlay() { return this.screen === 'game' && !!this.table && this.table.kind !== 'idle' && !this.menuOpen && this.view.state?.ph !== 'over' }
  /** Tells the site when play starts and stops; a game here that ended makes the next one wait (see startSolo). */
  syncGameplay() {
    const playing = this.inPlay()
    if (playing === !!this.gameplay) return
    this.gameplay = playing
    if (!playing && this.table?.kind === 'solo' && this.view.state?.ph === 'over') this.finished = true
    this.hook(playing ? 'gameplayStart' : 'gameplayStop')
  }
  /** Between two games here the site may show something (an ad); no input until it is done, then `then`. A shared game's rematch does not wait: everyone at the table would. */
  betweenGames(then) {
    const ad = this.hook('midgameAd')
    if (!ad?.then) { then(); return }
    this.adBusy = true
    // something else took the screen meanwhile (an online room was joined, say): it stays
    const table = this.table, screen = this.screen
    const done = () => { this.adBusy = false; this.ui.dirty = true; if (this.table === table && this.screen === screen) then() }
    ad.then(done, done)
  }
  act(a) {
    if (!this.table || this.screen !== 'game') return false
    // the First Match's forced tips let through only what they ask for
    if (this.tut && !this.tut.allowsAct(a)) { this.nudge(); return false }
    const card = a.t === 'play' ? this.table.s?.pl[this.mySeat()]?.h[a.i] : null
    const ok = this.table.act(a)
    if (ok) this.tut?.onAct(a, card)
    return ok
  }

  // ----- shared table lobby (kept in room.state 'lob', written by the host) -----
  lobby() {
    const l = this.p0.room.state.lob
    if (l) return JSON.parse(JSON.stringify(l))
    // a new table: a quick room plays its own mode and board, a room I opened the ones chosen on the Online screen
    const web = this.p0.web, mode = web?.room?.mode || (web ? this.online.mode : 'champion'), size = web?.room?.size || (web ? this.online.size : 100)
    return { seats: [null, null, null, null, null, null], mode, size, level: 2, status: 'lobby', gid: 0 }
  }
  /** Host: seats of players who left the session (during a game, say) are free again. */
  pruneSeats(lob) {
    let changed = false
    lob.seats = lob.seats.map(s => { if (s && !s.b && !this.p0.players.has(s.id)) { changed = true; return null } return s })
    return changed
  }
  openLobby() {
    const lob = this.lobby()
    if (lob.status === 'playing' && this.p0.room.state.g) { this.joinShared(this.p0.room.state.g); return }
    this.screen = 'lobby'
    this.lobbyCmd({ t: 'sit' })
    this.ui.dirty = true
  }
  leaveLobby() {
    if (this.quick()) { this.p0.web.leave(); return }
    this.lobbyCmd({ t: 'stand' }); this.screen = 'menu'; this.ui.dirty = true
  }
  lobbyCmd(cmd) {
    if (this.p0.room.isHost) this.handleLobby(this.p0.me.id, cmd)
    else this.p0.room.sendTo(this.p0.room.host, { t: 'lob', cmd })
  }
  handleLobby(from, cmd) {
    const lob = this.lobby()
    if (lob.status === 'lobby') this.pruneSeats(lob)
    const host = from === this.p0.me.id
    const seated = lob.seats.findIndex(s => s && s.id === from && !s.b)
    const free = lob.seats.findIndex(s => !s)
    if (cmd.t === 'sit' && seated < 0 && free >= 0) {
      lob.seats[free] = { id: from, n: (this.nameOf(from) || 'Player').slice(0, 14), b: 0 }
    } else if (cmd.t === 'stand' && seated >= 0) lob.seats[seated] = null
    else if (!host) return
    else if (cmd.t === 'mode' && ['champion', 'fool'].includes(cmd.mode)) lob.mode = cmd.mode
    else if (cmd.t === 'size' && R.SIZES.includes(cmd.size)) lob.size = cmd.size
    else if (cmd.t === 'bot' && free >= 0) this.addBot(lob)
    else if (cmd.t === 'botlvl' && lob.seats[cmd.seat]?.b) lob.seats[cmd.seat].b = (lob.seats[cmd.seat].b % 3) + 1
    // how well every bot at the table plays, and the ones added after
    else if (cmd.t === 'level' && [1, 2, 3].includes(cmd.b)) { lob.level = cmd.b; for (const s of lob.seats) if (s?.b) s.b = cmd.b }
    else if (cmd.t === 'remove' && lob.seats[cmd.seat]?.b) lob.seats[cmd.seat] = null
    else if (cmd.t === 'start') { this.startShared(lob); return }
    this.p0.room.set('lob', lob)
    this.ui.dirty = true
  }
  /** A bot in the first free seat of `lob`, as good as the table's bots are. */
  addBot(lob) {
    const used = new Set(lob.seats.filter(Boolean).map(s => s.n)), free = lob.seats.findIndex(s => !s)
    if (free >= 0) lob.seats[free] = { id: null, n: BOT_NAMES.find(n => !used.has(n)) || 'Bot', b: lob.level || 2 }
  }
  startShared(lob) {
    this.pruneSeats(lob)
    // at the channel's table one player may start: bots make up the players the rules ask for
    if (this.atChannel()) while (lob.seats.filter(Boolean).length < least(lob.mode) && lob.seats.includes(null)) this.addBot(lob)
    const seats = lob.seats.map((s, i) => (s ? { ...s, c: i } : null)).filter(Boolean)
    if (seats.length < 2 || (lob.mode === 'fool' && seats.length < 3)) return
    const seed = (Math.random() * 2 ** 31) >>> 0
    const s = R.createGame({ seed, mode: lob.mode, cells: lob.size || 100, players: seats.map(x => ({ n: x.n, b: x.b, id: x.id, c: x.c })) })
    s.gid = seed
    // at a Quick Match table (and the channel's) every bot keeps its seat for a player who comes during the game (seatNewcomer)
    if (this.quick() || this.atChannel()) for (const p of s.pl) if (p.b) p.f = 1
    lob.status = 'playing'; lob.gid = seed
    this.p0.room.set('lob', lob)
    const g = { gid: seed, s: R.pack(s), ev: null }
    this.p0.room.set('g', g)
    if (this.shared?.s.gid !== seed) this.joinShared(g) // (setting 'g' sits me down already when I am at the table)
  }
  joinShared(g) {
    if (this.table?.kind === 'solo') clearGame()
    this.tut = null; this.confirmSkip = false
    this.reward = null
    this.ui.logLines = []
    this.ui.selected = -1; this.ui.cancelTarget(); this.ui.hidden = null
    this.shared = new SharedTable(this, g)
    this.table = this.shared
    this.view.speed = SPEEDS[this.speedIdx][0]
    this.screen = 'game'
    this.ui.dirty = true
  }
  /** At the Shared Table: in its lobby, or at its game (playing, watching, or looking at the results). */
  atTable() { return this.screen === 'lobby' || (this.screen === 'game' && this.table?.kind === 'shared') }
  onRoomState(key, value, from) {
    if (key === 'lob') {
      if (value && value.status === 'playing' && this.atTable()) {
        const g = this.p0.room.state.g
        if (g && g.gid === value.gid && (!this.shared || this.shared.s.gid !== value.gid)) this.joinShared(g)
      }
      if (value && value.status === 'lobby' && this.screen === 'game' && this.table?.kind === 'shared') { this.screen = 'lobby'; this.shared = null; this.startAttract(); this.screen = 'lobby' }
      this.ui.dirty = true
    }
    if (key === 'g' && value) {
      if (this.shared && this.shared.s.gid === value.gid) this.shared.onState(value, from)
      // a new game at the table (the first one, or the host's rematch while the last one's results are up): everyone at it moves on to it
      else if (this.atTable() && this.lobby().status === 'playing' && this.lobby().gid === value.gid) this.joinShared(value)
    }
  }
  // ----- who is doing what in the lot, and invitations to the Shared Table -----
  myStatus() {
    if (this.screen === 'game') return this.table?.kind === 'shared' ? 'shared' : 'solo'
    return this.screen === 'lobby' ? 'lobby' : 'menu'
  }
  syncStatus() {
    const st = this.myStatus()
    if (st === this.statusSent) return
    // the first one also asks everyone for theirs: a join can come before this game listens
    const ask = this.statusSent == null
    this.statusSent = st
    try { this.p0.room.send(ask ? { t: 'st', s: st, ask: 1 } : { t: 'st', s: st }) } catch { /* the others ask again when they join */ }
  }
  /** Session players who are not sitting at the Shared Table. */
  notSeated() {
    const seated = new Set(this.lobby().seats.filter(s => s && !s.b).map(s => s.id))
    return [...this.p0.players.keys()].filter(id => id !== this.p0.me.id && !seated.has(id))
  }
  invitePlayer(id) {
    const last = this.invSent.get(id)
    if (last != null && this.p0.time - last < 8) return
    this.invSent.set(id, this.p0.time)
    try { this.p0.room.sendTo(id, { t: 'inv' }) } catch { return }
    this.ui.say(T.inviteSent(this.nameOf(id)), 2.5)
  }
  acceptInvite() {
    const inv = this.invite
    if (!inv) return
    this.invite = null
    try { this.p0.room.sendTo(inv.from, { t: 'invr', r: 'yes' }) } catch { /* they see me sit down anyway */ }
    // a game against bots here ends; a shared game is left the usual way
    if (this.screen === 'game') this.toMenu()
    this.screen = 'menu'
    this.openLobby()
  }
  declineInvite() {
    const inv = this.invite
    if (!inv) return
    this.invite = null
    try { this.p0.room.sendTo(inv.from, { t: 'invr', r: 'no' }) } catch { /* nothing to do */ }
    this.ui.dirty = true
  }

  onMessage(m, from) {
    if (!m || typeof m !== 'object') return
    if (m.t === 'st') {
      this.status.set(from, String(m.s).slice(0, 8))
      if (m.ask && this.statusSent) { try { this.p0.room.sendTo(from, { t: 'st', s: this.statusSent }) } catch { /* fine */ } }
      this.ui.dirty = true
      return
    }
    if (m.t === 'inv') {
      if (this.p0.web) return // the Shared Table's invitations are Project 0's: an online room has its code instead
      const atTable = this.screen === 'lobby' || this.table?.kind === 'shared'
      if (atTable) { try { this.p0.room.sendTo(from, { t: 'invr', r: 'here' }) } catch { /* fine */ } return }
      this.invite = { from, t: INVITE_SECONDS }
      this.sfx('invite')
      this.ui.dirty = true
      return
    }
    if (m.t === 'invr') {
      const name = this.nameOf(from)
      this.ui.say(m.r === 'yes' ? T.inviteYes(name) : m.r === 'here' ? T.inviteHere(name) : T.inviteNo(name), 3)
      return
    }
    if (m.t === 'act' && this.p0.room.isHost && this.shared && m.gid === this.shared.s.gid) this.shared.applyFrom(from, m.a)
    else if (m.t === 'err') { this.waiting = 0; this.ui.hidden = null; this.ui.say(String(m.text).slice(0, 60)) }
    else if (m.t === 'lob' && this.p0.room.isHost && m.cmd) this.handleLobby(from, m.cmd)
    else if (m.t === 'leaveSeat' && this.p0.room.isHost) this.leftTable(from)
    else if (m.t === 'claim' && this.p0.room.isHost && this.shared && m.gid === this.shared.s.gid) {
      if (!this.shared.takeBack(from, m.i)) this.p0.room.sendTo(from, { t: 'err', text: T.seatNotFree })
    }
  }
  /** Back at the Shared Table while a bot plays my seat: Continue Playing takes it back. */
  takeSeatBack() {
    const sh = this.shared, i = this.seatToTakeBack()
    if (i < 0 || this.waiting > 0) return
    if (this.p0.room.isHost) { sh.takeBack(this.p0.me.id, i); return }
    this.p0.room.sendTo(this.p0.room.host, { t: 'claim', gid: sh.s.gid, i })
    this.waiting = 2.5
    this.ui.dirty = true
  }
  /** The seat I can take back from its bot at the Shared Table's game, or -1. */
  seatToTakeBack() { return this.screen === 'game' && this.table?.kind === 'shared' && this.table === this.shared ? this.shared.myClaim() : -1 }
  /** Host: a player went from the Shared Table's game to the menu: a bot plays their seat, and the next game goes without them. */
  leftTable(id) {
    this.shared?.replace(id)
    const lob = this.lobby(), i = lob.seats.findIndex(s => s && !s.b && s.id === id)
    if (i >= 0 && lob.status === 'playing') { lob.seats[i] = null; this.p0.room.set('lob', lob) }
  }
  /** Host: player `id` (who sat there as `old`) took their seat back: their seat in the lobby follows, so a rematch seats them. */
  keepLobbySeat(id, old) {
    const lob = this.lobby()
    if (lob.seats.some(s => s && !s.b && s.id === id)) return
    const k = lob.seats.findIndex(s => s && !s.b && s.id === old), free = lob.seats.findIndex(s => !s)
    const seat = { id, n: (this.nameOf(id) || 'Player').slice(0, 14), b: 0 }
    if (k >= 0) lob.seats[k] = seat
    else if (free >= 0) lob.seats[free] = seat
    else return
    this.p0.room.set('lob', lob)
  }
  // ----- the web build's online play (Project 0 has none: there the Shared Table stands in for it) -----
  /**
   * Quick Match, one click into a game: a table of the mode and board last chosen on the Online screen
   * (Champion on 50 cells at first), a game under way there or a new one (Project 0: a game against bots).
   */
  quickMatch() {
    const web = this.p0.web
    if (!web) { this.startSolo(); return }
    web.quickMatch(this.online.mode, this.online.size)
  }
  /** Players at a Quick Match table on a board of `size` cells, the bots included. */
  quickSeats(size) { return QUICK_TABLE[size] || 4 }
  createRoom() { this.p0.web?.createRoom() }
  joinRoom(code) { this.p0.web?.joinRoom(code) }
  /** An online attempt changed (it is under way, failed or done), or a room's link brought the player: to the Online screen with its code. */
  onWebStatus() {
    const web = this.p0.web
    if (web?.invited && this.ui.joinCode !== web.invited) {
      this.ui.joinCode = web.invited
      if (this.screen === 'menu') this.screen = 'online'
    }
    this.ui.dirty = true
  }
  /** The web build joined an online room (sit down at its table) or left it. */
  onWebRoom(room, reason) {
    this.status.clear(); this.statusSent = null; this.invite = null
    if (room?.fresh) {
      this.menuOpen = false
      // a game against bots is kept (a friend's invite through the site took the player from it), and comes back after the room
      if (this.screen === 'game') this.toMenu(true)
      this.screen = 'menu'
      this.openLobby()
    } else if (!room) {
      if (this.screen === 'lobby' || this.table?.kind === 'shared') this.toMenu()
      if (reason === 'lost') this.ui.say(T.roomLost, 3)
      if (this.keptSolo && this.screen === 'menu' && !this.p0.web?.status?.busy) { this.keptSolo = false; this.resumeSolo() }
    }
    this.ui.dirty = true
  }
  onLeave(p) {
    this.status.delete(p.id)
    if (this.invite?.from === p.id) { this.invite = null; this.ui.dirty = true }
    if (!this.p0.room.isHost) return
    const lob = this.lobby()
    const i = lob.seats.findIndex(s => s && s.id === p.id && !s.b)
    if (i >= 0 && lob.status === 'lobby') { lob.seats[i] = null; this.p0.room.set('lob', lob) }
    if (this.shared) this.shared.replace(p.id)
  }
  onHost() {
    // a new host carries on from the last state everyone has
    if (this.p0.room.isHost && this.shared) {
      this.ui.say(T.hostLeft)
      // seats of players who are gone (the old host among them) go to bots
      for (const p of this.shared.s.pl) if (!p.b && p.id != null && !this.p0.players.has(p.id)) this.shared.replace(p.id)
    }
    if (this.p0.room.isHost) {
      const lob = this.lobby()
      if (this.pruneSeats(lob) && lob.status === 'lobby') this.p0.room.set('lob', lob)
    }
    this.ui.dirty = true
  }

  // ----- Quick Match (the web build's quick rooms; Project 0 has none) -----
  /** In a Quick Match room: players who look for a game, and bots in the empty seats. */
  quick() { return !!this.p0.web?.room?.quick }
  /** Host of a Quick Match table in its lobby: the game starts as soon as a player sits there. */
  quickTick() {
    if (!this.quick() || !this.p0.room.isHost || this.screen !== 'lobby') return
    const l = this.p0.room.state.lob
    if (l?.status === 'lobby' && l.seats.some(s => s && !s.b)) this.quickStart()
  }
  /** A name for a Quick Match bot like the players' own (the web build's random names), not one at the table already. */
  quickName(lob) {
    const used = new Set(lob.seats.filter(Boolean).map(s => s.n))
    for (let i = 0; i < 20; i++) { const n = this.p0.web?.randomName?.(); if (n && !used.has(n)) return n }
    return BOT_NAMES.find(x => !used.has(x)) || 'Bot'
  }
  /** Host: bots take the empty seats of the Quick Match table (up to its QUICK_TABLE players) and the game starts. */
  quickStart() {
    const lob = this.lobby()
    if (!this.quick() || !this.p0.room.isHost || lob.status !== 'lobby') return
    this.pruneSeats(lob)
    if (!lob.seats.some(s => s && !s.b)) return
    for (let i = 0; i < lob.seats.length && lob.seats.filter(Boolean).length < this.quickSeats(lob.size); i++) {
      if (!lob.seats[i]) lob.seats[i] = { id: null, n: this.quickName(lob), b: 2, q: 1 }
    }
    this.startShared(lob)
  }
  /**
   * Host: a player who comes to a Quick Match table (or the channel's) while its game is on takes a
   * seat a bot keeps there (the one furthest on), under their own name, and keeps it for the rematch. A
   * player with a seat of their own here takes it back with Continue Playing instead. At the channel's
   * table one with no seat to take watches, and plays in the next game.
   */
  seatNewcomer(id) {
    const sh = this.shared, s = sh?.s, channel = this.atChannel()
    if (!(this.quick() || channel) || !this.p0.room.isHost || id === this.p0.me.id) return
    if (channel && this.lobby().status === 'playing' && (!s || s.ph === 'over')) { this.seatNext(id); return }
    if (!s || s.ph === 'over' || s.pl.some(p => p.id === id)) return
    const kept = s.pl.map((p, i) => i).filter(i => s.pl[i].f && s.pl[i].b && !s.pl[i].d)
    if (!kept.length) { if (channel) this.seatNext(id); return }
    const p = s.pl[kept.reduce((a, b) => (s.pl[b].pos > s.pl[a].pos ? b : a))], bot = p.n
    p.id = id; p.b = 0; p.n = (this.nameOf(id) || 'Player').slice(0, 14)
    delete p.f
    const text = R.addLog(s, T.takesSeat(p.n, bot))
    s.seq++
    sh.publish([{ e: 'log', text }])
    const lob = this.lobby()
    lob.seats[p.c] = { id, n: p.n, b: 0 }
    this.p0.room.set('lob', lob)
  }

  /** Host: player `id`, watching the channel's table, gets a seat in the next game (a bot's, when none is free). */
  seatNext(id) {
    const lob = this.lobby()
    if (lob.seats.some(s => s && !s.b && s.id === id)) return
    let i = lob.seats.findIndex(s => !s)
    if (i < 0) i = lob.seats.findIndex(s => s?.b)
    if (i < 0) return
    lob.seats[i] = { id, n: (this.nameOf(id) || 'Player').slice(0, 14), b: 0 }
    this.p0.room.set('lob', lob)
  }

  // ----- the site's own table (Discord: everyone in the voice channel; Project 0 and the other sites have none) -----
  /** The site puts this player at a table of its own: no menu of rooms, no First Match. */
  channel() { return !!this.p0.web?.channel }
  /** In the room of the site's own table. */
  atChannel() { return !!this.p0.web?.room?.channel }
  /** Into the site's own table (again: after the room was lost, or after a game against bots). */
  enterChannel() { if (!this.p0.web?.status?.busy) this.p0.web?.enterChannel() }
  /** At the channel's table, watching its game: no seat of mine there, nor one to take back. */
  watching() {
    const s = this.view.state
    return this.atChannel() && this.screen === 'game' && this.table?.kind === 'shared' && !!s && s.ph !== 'over' && this.mySeat() < 0 && this.seatToTakeBack() < 0
  }

  /** Scores for the week's table: wins count, more and harder opponents, a bigger board and fewer rounds count more. */
  gameOver(s, me) {
    if (this.scored === s.gid || me < 0) return
    this.scored = s.gid
    const won = s.mode === 'champion' ? s.res.winner === me : s.res.places[me] === 1
    if (!won) return
    this.hook('happytime')
    if (this.p0.web) return // the web build has no week's table: no score to send or show
    const n = s.n || 100
    let score = 0
    s.pl.forEach((p, i) => { if (i !== me) score += 100 + (p.b ? (p.b - 1) * 40 : 80) })
    score += Math.max(0, Math.round(40 * n / 100) - s.round) * 5
    score = Math.round(score * (0.6 + 0.4 * n / 100))
    if (s.mode === 'fool') score = Math.round(score * 0.8)
    this.reward = T.scoreSent(score)
    try { this.p0.score(score); this.p0.win() } catch (e) { this.p0.log('score', String(e)) }
  }
  onReward(r) {
    if (r.kind === 'score' && r.ok) this.reward = T.score(r.score, r.best, r.place)
    else if (r.kind === 'score' && r.reason) this.reward = r.reason
    this.ui.dirty = true
  }

  update(dt) {
    if (this.waiting > 0) { this.waiting -= dt; if (this.waiting <= 0) this.ui.dirty = true }
    if (this.invite && (this.invite.t -= dt) <= 0) { this.invite = null; this.ui.dirty = true }
    this.syncStatus()
    this.quickTick()
    this.table?.update(dt)
    this.tut?.update(dt)
    this.syncGameplay()
    const trayOn = this.view.trayVisible > 0
    if (trayOn !== this.trayWas) { this.trayWas = trayOn; this.ui.dirty = true }
    if (this.turnLeft != null && Math.ceil(this.turnLeft) !== this.turnShown) { this.turnShown = Math.ceil(this.turnLeft); this.ui.dirty = true }
    if (this.screen === 'game' && this.table?.kind !== 'shared') this.turnLeft = null
  }
}

export default async function start(p0) {
  p0.loading(0.05, 'cutting paper')
  p0.controls.mode = 'none'
  p0.controls.vertical = false
  p0.bodies.visible = false
  p0.autoRender = false
  const renderer = p0.createRenderer({ antialias: true })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const app = new App(p0)
  globalThis.__csl = app // for local testing from the console
  p0.loading(0.5, 'setting the table')
  // (where the site puts the player at its own table, it is joined at once: a game against bots is not carried on)
  if (app.channel() || !app.resumeSolo()) app.startAttract()

  // input
  let down = null
  // fingers on the screen (id -> where): two of them pinch the board closer or further and move it between
  // them; until they are all lifted they click nothing
  const fingers = new Map()
  let pinch = 0, pinched = false
  const spread = () => { const [a, b] = fingers.values(); return Math.hypot(a.x - b.x, a.y - b.y) }
  p0.on('pointerdown', e => {
    if (app.adBusy) { down = null; return } // the site is showing something between games
    app.ui.touch = !!e.touch // (a finger gets bigger buttons)
    if (e.touch && e.id != null) {
      fingers.set(e.id, { x: e.x, y: e.y })
      if (fingers.size === 2) { pinch = spread(); pinched = true; down = null; if (app.ui.drag) { app.ui.drag.end?.(); app.ui.drag = null } return }
      if (fingers.size > 2) return
    }
    app.tut?.onInput()
    // a slider follows the pointer until it lets go
    const h = app.ui.hitAt(e.x, e.y)
    if (h?.drag) { app.ui.drag = h; h.drag(e.x); down = null; return }
    down = { x: e.x, y: e.y, at: p0.time, moved: false, ui: !!(app.ui.hitAt(e.x, e.y) || app.ui.cardAt(e.x, e.y)), log: app.ui.overLog(e.x, e.y) }
  })
  p0.on('pointermove', e => {
    if (e.touch && fingers.has(e.id)) {
      fingers.set(e.id, { x: e.x, y: e.y })
      if (fingers.size >= 2) {
        if (app.screen !== 'game' || app.adBusy) return
        const d = spread()
        if (pinch > 0 && d > 0) app.view.zoom(pinch / d)
        pinch = d
        // each finger moves the board half its way: together, the point between them
        app.view.pan(e.dx / 2, e.dy / 2)
        return
      }
    }
    if (pinched) return
    if (app.ui.drag) { app.ui.drag.drag(e.x); return }
    if (!e.touch) app.ui.touch = false
    const overUI = app.ui.pointerMove(e.x, e.y)
    if (app.ui.target && !overUI && app.screen === 'game') app.ui.hoverTarget(app.view.pick(e.x, e.y))
    if (down && (e.buttons || e.touch)) {
      if (!down.moved && Math.hypot(e.x - down.x, e.y - down.y) > 8) down.moved = true
      // (a drag over the log scrolls it)
      if (down.moved && down.log) app.ui.dragLog(e.dy)
      else if (down.moved && !down.ui && app.screen === 'game') app.view.pan(e.dx, e.dy)
    }
  })
  p0.on('pointerup', e => {
    if (e.touch) fingers.delete(e.id)
    if (pinched) { pinch = 0; if (!fingers.size) pinched = false; down = null; return }
    if (app.ui.drag) { app.ui.drag.end?.(); app.ui.drag = null; return }
    if (!down) return
    const d = down
    down = null
    if (d.moved) return
    // the right button only backs out of a card's target or another player's hand (as Escape does): it clicks nothing
    if (e.button === 2) { if (app.screen === 'game' && !app.menuOpen) app.backInGame(); return }
    if (app.menuOpen && app.ui.hitAt(e.x, e.y)) { app.ui.click(e.x, e.y); return }
    if (app.ui.click(e.x, e.y, p0.time - d.at > 0.45)) return
    // a click beside what a tip with a veil asks for
    if (app.tipNow()?.veil) { app.nudge(); return }
    if (app.screen !== 'game') return
    const hit = app.view.pick(e.x, e.y)
    // a click beside the board and the panels over it puts a card waiting for its target back (the First Match's tips only point again)
    if (!hit && app.ui.target && !app.menuOpen && !app.ui.overCover(e.x, e.y)) { if (app.tut?.forced) app.nudge(); else app.ui.cancelTarget(); return }
    if (!app.ui.boardClick(hit) && app.ui.selected >= 0 && !app.ui.target) { app.ui.selected = -1; app.ui.dirty = true }
  })
  p0.on('wheel', e => {
    if (app.screen !== 'game' || app.adBusy) return
    // over the log the wheel scrolls it (down to the newest lines), elsewhere it zooms
    const pt = app.p0.input?.pointer
    if (pt && app.ui.overLog(pt.x, pt.y)) app.ui.scrollLog(-(e.dy || 0) / 40)
    else app.view.zoom(Math.exp((e.dy || 0) * 0.0012))
  })
  p0.on('keydown', e => {
    if (e.repeat || app.adBusy) return
    app.tut?.onInput()
    // "back": Escape, or Backspace (Escape also leaves the browser's full screen, so it is never the only way)
    const back = e.code === 'Escape' || e.code === 'Backspace'
    // an online attempt on screen: back cancels it or puts its message away
    const st = app.p0.web?.status
    if (st) { if (back) { if (st.busy) app.p0.web.cancel(); else app.p0.web.dismiss() } return }
    if (app.screen === 'solo' && (e.code === 'Enter' || e.code === 'NumpadEnter') && !app.invite) { app.startSolo(); return }
    if (app.screen === 'pass' && (e.code === 'Enter' || e.code === 'NumpadEnter') && !app.invite) { app.startPass(); return }
    if (['solo', 'pass', 'online', 'help'].includes(app.screen) && back) { app.toScreen('menu'); return }
    if (app.screen !== 'game') return
    const s = app.view.state, me = app.mySeat()
    if (app.curtain() >= 0) { if (e.code === 'Space') app.reveal(); return }
    if ((e.code === 'Enter' || e.code === 'NumpadEnter') && app.seatToTakeBack() >= 0 && !app.menuOpen) { app.takeSeatBack(); return }
    const mine = s && me >= 0 && s.cur === me && s.ph === 'main'
    if (e.code === 'Space' && mine && !s.rolled && !R.choiceMax(s.pl[me].fx)) app.act({ t: 'roll' })
    else if (e.code === 'Space' && mine && s.rolled && !app.view.busy && !app.menuOpen) { if (app.ui.target) app.ui.cancelTarget(); app.act({ t: 'end' }) }
    else if (/^Digit[1-5]$/.test(e.code) && s && me >= 0 && s.cur === me && (s.ph === 'pick' || s.ph === 'take')) app.ui.choose(s.ph, +e.code.slice(5) - 1)
    else if (/^Digit[1-4]$/.test(e.code) && s && me >= 0) { const c = app.ui.cards.find(k => k.kind === 'hand' && k.i === +e.code.slice(5) - 1); if (c) app.ui.cardClicked(c) }
    else if (back) app.backInGame()
    else if (e.code === 'Equal' || e.code === 'NumpadAdd') app.view.zoom(0.8)
    else if (e.code === 'Minus' || e.code === 'NumpadSubtract') app.view.zoom(1.25)
    else if (e.code === 'KeyR' && s?.ph === 'over') app.rematch()
    else if (e.code === 'KeyM' || e.code === 'Tab') app.openGameMenu()
  })
  p0.room.on('state', (k, v, from) => app.onRoomState(k, v, from))
  p0.room.on('message', (m, from) => app.onMessage(m, from))
  p0.on('join', p => {
    // (a player back at the table whose seat a bot plays takes it back with Continue Playing, when they are ready)
    // tell the newcomer what I am doing, for their invite list
    if (p && p.id !== p0.me.id && app.statusSent) { try { p0.room.sendTo(p.id, { t: 'st', s: app.statusSent }) } catch { /* they ask again */ } }
    // a Quick Match game under way: a seat a bot keeps for them
    if (p) app.seatNewcomer(p.id)
    app.ui.dirty = true
  })
  p0.on('leave', p => { app.onLeave(p); app.ui.dirty = true })
  p0.on('host', () => app.onHost())
  p0.on('reward', r => app.onReward(r))
  p0.on('table', () => { app.ui.dirty = true })
  p0.on('room', (room, reason) => app.onWebRoom(room, reason))
  p0.on('reconnect', () => { app.status.clear(); app.statusSent = null; app.invite = null; if (app.table?.kind === 'shared') app.toMenu(); app.ui.dirty = true })

  // compile every material before the first frame
  app.view.update(0.016)
  app.ui.update(0.016)
  app.ui.warm(renderer)
  await renderer.compileAsync(p0.scene, p0.camera)
  await renderer.compileAsync(app.view.tray, app.view.trayCam)
  p0.loading(0.95, 'ready')

  // frame: board, screen layer, dice tray; resolution follows the machine's speed
  const res = resolution(renderer, p0)
  p0.loop(dt => {
    res.frame(dt)
    app.update(dt)
    app.view.update(dt)
    app.ui.update(dt)
    renderer.autoClear = true
    renderer.render(p0.scene, p0.camera)
    renderer.autoClear = false
    renderer.clearDepth()
    // the screen, then the dice tray, then the cards, then the windows over them all
    app.ui.render(renderer, 0, 10)
    renderer.autoClear = true
    app.view.renderTray(renderer, app.ui.trayDice)
    renderer.autoClear = false
    app.ui.render(renderer, 10, 50)
    app.ui.render(renderer, 50)
    renderer.autoClear = true
  })
  renderer.render(p0.scene, p0.camera)
}
