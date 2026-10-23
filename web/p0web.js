// A browser stand-in for Project 0's experience runtime (the p0 object), so the game in
// experience/ runs as a plain web page (GitHub Pages). Offline it is one player on one computer
// (bots and pass-and-play); online (web/net.js) a room stands in for the lot, so the game's
// Shared Table works as it does in Project 0. There is no city here.
import * as THREE from 'three'
import { Net, cleanCode } from './net.js'
import { relayServer } from './relaypeer.js'
import { safeName } from './names.js'
import { onlineControl, shareRoom } from './online.js'
import { editText } from './textfield.js'
import { platform, hooks, mute, roomLink, roomLinks, ready } from './platform.js'
import { every } from './clock.js'

const q = new URLSearchParams(location.search)
const entry = new URL('../experience/main.js', import.meta.url).href
const lot = { id: 0, width: 12, depth: 19, height: 12, name: 'web' }
lot.size = Math.max(lot.width, lot.depth)
const canvas = document.getElementById('c')
const loadEl = document.getElementById('loading')
const barEl = document.getElementById('bar')
const labelEl = document.getElementById('label')

const listeners = new Map()
const on = (ev, fn) => { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev).add(fn); return () => off(ev, fn) }
const off = (ev, fn) => listeners.get(ev)?.delete(fn)
const emit = (ev, ...a) => { for (const fn of [...(listeners.get(ev) || [])]) { try { fn(...a) } catch (e) { console.error(e) } } }
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

// ?dpr=1 renders as a screen of that pixel ratio would (tools/shots.html checks the text at DPR 1)
const DPR = Math.min(Math.max(+q.get('dpr') || 0, 0), 3)
const pixelRatio = () => DPR || Math.min(devicePixelRatio || 1, 2)
// the safe area (a phone's notch, rounded corners, home bar) from CSS: the game keeps its buttons inside it.
// ?safe=top,right,bottom,left pretends one (px), to try a notch on a computer
const safeProbe = document.createElement('div')
safeProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
document.body.append(safeProbe)
const fakeSafe = q.get('safe') ? q.get('safe').split(',').map(v => Math.max(0, +v || 0)) : null
function safeArea() {
  if (fakeSafe) return { top: fakeSafe[0] || 0, right: fakeSafe[1] || 0, bottom: fakeSafe[2] || 0, left: fakeSafe[3] || 0 }
  const cs = getComputedStyle(safeProbe), px = v => parseFloat(v) || 0
  return { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) }
}
const view = { width: innerWidth, height: innerHeight, dpr: pixelRatio(), safe: safeArea() }
const scene = new THREE.Scene()
scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9a96, 2.2))
const camera = new THREE.PerspectiveCamera(62, view.width / view.height, 0.05, 3000)
let renderer = null, rendererParams = {}
function getRenderer() {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, ...rendererParams, canvas, alpha: true })
    renderer.setPixelRatio(view.dpr)
    renderer.setSize(view.width, view.height, false)
    renderer.setClearColor(0x000000, 0)
  }
  return renderer
}

// this tab keeps its player id through a reload, so an online table gives it its seat back
// (?sid= keeps several players apart in one tab: the online tests put each in an iframe)
const NS = q.get('sid') ? ':' + String(q.get('sid')).replace(/\W/g, '').slice(0, 12) : ''
const ID_KEY = 'csl-id' + NS, ROOM_KEY = 'csl-room' + NS, ROOM_FRESH_MS = 120000
const newId = () => Math.floor(Math.random() * 90000) + 1000
const ss = {
  get(k) { try { return JSON.parse(sessionStorage.getItem(k) || 'null') } catch { return null } },
  set(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)) } catch { /* private mode */ } },
}
let myId = ss.get(ID_KEY)
if (!Number.isInteger(myId) || myId < 1000 || myId > 99999) { myId = newId(); ss.set(ID_KEY, myId) }
let savedName = ''
try { savedName = localStorage.getItem('csl-name') || '' } catch { /* private mode */ }
const me = { id: myId, name: safeName(q.get('name') || savedName, ''), color: '#e94f37', avatar: null, position: new THREE.Vector3(0, 1.5, 0), yaw: 0, isMe: true }
const players = new Map([[myId, me]])
const state = {}
let host = myId
// the online room this tab is in and its shared state, for coming back after a reload
let unloading = false
const keepRoom = () => { if (!unloading && web.room) ss.set(ROOM_KEY, { code: web.room.code, quick: web.room.quick, state, at: Date.now() }) }
// the site's own room for this player, where it has one (Discord: the channel's), from hooks.instantMultiplayer
let channel = null

// the session the network keeps in step: who is here, who hosts, the room's shared state
const session = {
  me, players, state,
  get host() { return host },
  addPlayer(p) {
    if (p.id === myId || players.has(p.id)) return
    const pl = { id: p.id, name: safeName(p.name), color: p.color || '#9a948a', avatar: null, position: new THREE.Vector3(), yaw: 0, isMe: false }
    players.set(p.id, pl)
    emit('join', pl)
  },
  removePlayer(id) { const p = players.get(id); if (!p || id === myId) return; players.delete(id); emit('leave', p) },
  setHost(id) { if (id !== host) { host = id; emit('host', id) } },
  applyState(k, v, from) { if (v == null) delete state[k]; else state[k] = v; keepRoom(); emit('state', k, v ?? null, from) },
  message(d, from) { emit('message', d, from) },
  roomChanged(info, reason) {
    if (unloading) return
    // link: null where only the code is shared; channel: this is the site's own room for the player
    info = info && { ...info, link: roomLink(info.code), channel: !!channel && info.code === channel }
    web.room = info
    if (info) keepRoom(); else ss.set(ROOM_KEY, null)
    // the address bar shows the room's link only where this page's address is one to give
    if (platform.allowLinks) {
      try {
        const u = new URL(location.href) // only ?room changes: ?debug, ?platform and the like stay
        if (info) u.searchParams.set('room', info.code); else u.searchParams.delete('room')
        history.replaceState(null, '', u.pathname + u.search + u.hash)
      } catch { /* fine */ }
    }
    tellRoom()
    emit('room', info, reason)
  },
  reset() {
    for (const id of [...players.keys()]) session.removePlayer(id)
    for (const k of Object.keys(state)) session.applyState(k, null, myId)
    session.setHost(myId)
  },
  /** Another tab of this browser has my id (a duplicated tab copies sessionStorage): take a new one. Only while in no room. */
  renewId() {
    if (net.online) return
    const old = myId
    do myId = newId(); while (myId === old)
    players.delete(old); me.id = myId; players.set(myId, me)
    if (host === old) host = myId
    ss.set(ID_KEY, myId)
  },
}
// ?ice=relay: no direct connections from here, as behind a strict NAT (to try the brokers' way round).
// The relay server where the profile asks for it, or ?server=ws://… on any site (web/relaypeer.js)
const net = new Net(session, { quick: platform.quickPrefix, iceRelay: q.get('ice') === 'relay', server: q.get('server') || (platform.server ? relayServer() : null) })
// a duplicated tab asks whether its id is someone's already, and takes a new one if so
try {
  const tabs = new BroadcastChannel('csl-tabs'), born = Date.now()
  tabs.onmessage = e => {
    const d = e.data
    if (!d || d.id !== myId) return
    if (d.ask) tabs.postMessage({ id: myId, mine: 1 })
    else if (d.mine && Date.now() - born < 5000) session.renewId()
  }
  tabs.postMessage({ id: myId, ask: 1 })
} catch { /* no BroadcastChannel: the room says 'taken' and net.js takes a new id then */ }
globalThis.__cslNet = net // for local testing from the console
// the site hears which room this tab is in and whether friends can come in now (not full, nor a quick
// table's game with no seat kept for a newcomer): when either changes, and when the tab leaves the room
let told = null // { code, open } as last told
function tellRoom() {
  const code = web.room?.code || null
  if (!code) { if (told) { told = null; hooks.roomClosed() } return }
  const open = net.joinable()
  if (told?.code === code && told.open === open) return
  told = { code, open }
  hooks.roomOpened(code, open)
}
// (a moment later: a game starting sets the lobby, then the game, and the room is open throughout)
let tellTimer = 0
for (const ev of ['join', 'leave', 'state']) on(ev, () => { clearTimeout(tellTimer); tellTimer = setTimeout(tellRoom, 200) })
const checkSize = (what, v, max) => { const n = new TextEncoder().encode(JSON.stringify(v ?? null)).byteLength; if (n > max) throw new RangeError(`${what}: ${n} bytes; at most ${max}`) }
const room = {
  id: 1, seed: (Math.random() * 2 ** 32) >>> 0, tick: 0,
  get host() { return host },
  get isHost() { return host === myId },
  get players() { return [...players.keys()] },
  state,
  send(data, to) { checkSize('p0.room.send', data, 1024); net.send(data ?? null, to) },
  sendTo(id, data) { room.send(data, id) },
  set(key, value) { checkSize('p0.room.set', value, 2048); session.applyState(key, value ?? null, myId); net.set(key, value ?? null) },
  input() {},
  on: (e, f) => on(e, f),
}
// the site's own name for the player (hooks.getUser), if it has one: then there is no name to type
let siteName = null
const watchers = new Set()
const online = onlineControl({ net, me, siteName: () => siteName, changed: () => { for (const fn of watchers) { try { fn() } catch (e) { console.error(e) } } } })
const web = {
  platform, // the site this runs on (web/platform.js)
  fixedRatio: !!DPR && !q.has('adapt'), // ?dpr= keeps that pixel ratio (the game would lower it on a slow machine), unless ?adapt
  get safe() { return view.safe }, // the screen's safe area: { top, right, bottom, left } px the game's buttons keep clear of
  hooks, // what the game tells the site: loading, gameplay, wins, between games
  get muted() { return mute.on }, // all sound off for the site (an ad), whatever the player's setting
  room: null, // { code, quick, mode, size, link, channel } while in an online room (mode and size: a quick table's); link is null where only the code is shared
  // the site puts the player at a table of its own (Discord: everyone in the voice channel), with this code; null elsewhere.
  // There the game has no menu of rooms: no codes, Quick Match or links, only that table
  get channel() { return channel },
  enterChannel() { return channel ? online.enter(channel) : Promise.resolve(false) },
  get links() { return roomLinks() }, // whether rooms get links here (else only codes)
  // the game's Online screen: how an attempt goes (null | { busy } | { error, detail, kind }), and a room's link that brought the player
  get status() { return online.status },
  get invited() { return online.invited },
  onChange(fn) { watchers.add(fn) },
  quickMatch(mode, size) { return online.quick(mode, size) },
  createRoom() { return online.create() },
  joinRoom(code) { return online.join(code) },
  cancel() { online.cancel() },
  dismiss() { online.dismiss() },
  // the name the others see: the site's own, else the one typed here
  get name() { return siteName || me.name },
  get siteName() { return siteName },
  setName: v => online.setName(v),
  randomName: () => online.randomName(),
  editText, // a real input over a box the game draws (web/textfield.js)
  share() { return shareRoom(web.room) },
  leave() { net.leave() },
  // the privacy policy (privacy.html beside index.html), where the site's profile asks for a word about it; null elsewhere
  privacy: platform.privacyNotice ? new URL('../privacy.html', import.meta.url).href : null,
  /** Opens the privacy policy in a new tab (the game stays as it is in this one). */
  openPrivacy() {
    if (!web.privacy) return
    const w = open(web.privacy, '_blank')
    if (w) w.opener = null
  },
}
addEventListener('pagehide', () => {
  // a reload: the room is kept (with the time it was left) to come back to it
  keepRoom()
  unloading = true
  net.unload()
})
// back from the browser's page cache: the room was left on the way out, so start over (and come back to it)
addEventListener('pageshow', e => { if (e.persisted && unloading) location.reload() })

const input = { keys: new Set(), isDown: c => input.keys.has(c), pointer: { x: 0, y: 0, buttons: 0, locked: false }, lockPointer() {}, unlockPointer() {} }
const controls = { mode: 'none', enabled: true, speed: 10, vertical: false, distance: 7, yaw: 0, pitch: 0.25 }
const p0 = {
  THREE, version: 1, web, lot, me, players, room, scene, camera,
  get renderer() { return getRenderer() },
  createRenderer(params = {}) { rendererParams = params; return getRenderer() },
  autoRender: true, controls,
  bodies: { visible: false, get: () => null },
  input,
  get width() { return view.width }, get height() { return view.height }, get pixelRatio() { return view.dpr },
  time: 0, random: mulberry32(room.seed), on, off,
  loop: fn => on('frame', fn),
  asset: path => new URL(String(path).replace(/^\/+/, ''), entry).href,
  hud() {},
  loading(f, label) { barEl.style.width = Math.round(f * 100) + '%'; if (label) labelEl.textContent = label },
  sound: {
    play(path, o = {}) {
      if (mute.on && !o.loop) return 0
      try {
        const a = new Audio(p0.asset(path)); a.volume = Math.min(1, (o.volume ?? 1) * 0.5); a.loop = !!o.loop; a.playbackRate = o.rate ?? 1; a.muted = mute.on
        sounding.add(a); a.addEventListener('ended', () => sounding.delete(a))
        a.play().catch(() => sounding.delete(a)); return a
      } catch { return 0 }
    },
    /** Fetches a sound ahead, so the first time it plays it starts at once (and decodes it for cue). */
    preload(path) { try { const a = new Audio(p0.asset(path)); a.preload = 'auto'; a.load(); preloaded.push(a) } catch {} decoded(path) },
    /**
     * A sound on the timeline (Web Audio): it starts exactly `o.at` s from now, and with `o.until` fades out
     * quickly to end that long from now. Returns { move(at), until(sec), fade() }: start it at another time
     * (while it has not started), make it end at another time (while it has not begun to fade), fade it out
     * now; or null where it cannot be timed so (no Web Audio, the sound not decoded yet, the page not touched
     * yet): then the game plays it as usual.
     */
    cue(path, o = {}) {
      const c = actx, buf = decoded(path)
      if (!c || !buf || c.state !== 'running') return null
      const FADE = 0.03
      try {
        const gain = c.createGain(), level = Math.min(1, (o.volume ?? 1) * 0.5)
        gain.connect(master)
        let src = null, start = 0, end = Infinity
        // it ends `sec` from now: full until then, fading out over FADE s before
        const endIn = sec => {
          end = Math.max(start + 0.01, c.currentTime + sec)
          gain.gain.cancelScheduledValues(c.currentTime)
          gain.gain.setValueAtTime(level, Math.max(c.currentTime, start, end - FADE)); gain.gain.linearRampToValueAtTime(0, end)
          src.stop(end + 0.01)
        }
        const begin = at => {
          start = c.currentTime + Math.max(0, at)
          src = c.createBufferSource(); src.buffer = buf; src.connect(gain)
          gain.gain.cancelScheduledValues(0); gain.gain.setValueAtTime(level, start)
          src.onended = () => { try { gain.disconnect() } catch {} }
          src.start(start)
          if (o.until != null) endIn(o.until)
        }
        begin(o.at ?? 0)
        return {
          move(at) { if (c.currentTime < start - 0.005 && Math.abs(c.currentTime + Math.max(0, at) - start) > 0.012) { src.onended = null; try { src.stop() } catch {} begin(at) } },
          until(sec) { if (c.currentTime < end - FADE - 0.005 && Math.abs(c.currentTime + sec - end) > 0.012) try { endIn(sec) } catch {} },
          fade() { const now = c.currentTime; try { gain.gain.cancelScheduledValues(now); gain.gain.setValueAtTime(now < start ? 0 : gain.gain.value, now); gain.gain.linearRampToValueAtTime(0, now + 0.06); src.stop(now + 0.07) } catch {} },
        }
      } catch { return null }
    },
    stop(a) { try { a.pause(); sounding.delete(a) } catch {} }, stopAll() {},
  },
  music: { play() {}, stop() {}, volume() {}, seek() {}, time: 0, playing: false, duration: 0 },
  exit() {},
  game: null, table: [],
  entities: { kind: null, mine: () => null, of: () => null, list: async () => ({ entities: [], canLike: false }), like: async () => ({ ok: false }), hint: '' },
  avatars: { load: async () => null },
  win() {},
  score() {},
  items: { give() {} },
  duel: null, duelResult() {}, buy: async () => ({ ok: false, reason: 'cancelled' }), purchases: [], invite() {}, invitation: null,
  log: (...a) => console.log('[game]', ...a),
}

// sounds still playing go quiet while the site mutes everything, and come back after
const sounding = new Set()
const preloaded = [] // (kept, or the browser may let go of what it fetched)
mute.listen(on => { for (const a of sounding) a.muted = on; if (master) master.gain.value = on ? 0 : 1 })

// sounds on a timeline (sound.cue): a Web Audio context, made when the player first touches the page (made
// before, the browser would not let it run and warn about it), and the sounds decoded for it
let actx = null, master = null
const buffers = new Map() // url -> { buf } (buf once decoded)
function decoded(path) {
  let url
  try { url = p0.asset(path) } catch { return null }
  let e = buffers.get(url)
  if (!e) { e = { buf: null, asked: false }; buffers.set(url, e) }
  if (actx && !e.asked) {
    e.asked = true
    fetch(url).then(r => r.arrayBuffer()).then(b => actx.decodeAudioData(b)).then(buf => { e.buf = buf }).catch(() => {})
  }
  return e.buf
}
function wakeAudio() {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext
  if (!actx && AC) {
    try { actx = new AC(); master = actx.createGain(); master.gain.value = mute.on ? 0 : 1; master.connect(actx.destination) } catch { actx = null; return }
    for (const url of buffers.keys()) decoded(url)
  }
  if (actx && actx.state !== 'running') actx.resume().catch(() => {})
}
addEventListener('pointerdown', wakeAudio, true)
addEventListener('keydown', wakeAudio, true)

function resize() {
  view.width = innerWidth; view.height = innerHeight; view.dpr = pixelRatio(); view.safe = safeArea()
  camera.aspect = view.width / view.height; camera.updateProjectionMatrix()
  if (renderer) renderer.setSize(view.width, view.height, false)
  emit('resize', view.width, view.height)
}
addEventListener('resize', resize)
addEventListener('orientationchange', () => setTimeout(resize, 200))

const last = new Map()
function ptr(k, e) {
  const touch = e.pointerType === 'touch'
  let dx = e.movementX || 0, dy = e.movementY || 0
  if (touch) { const p = last.get(e.pointerId); dx = p ? e.clientX - p.x : 0; dy = p ? e.clientY - p.y : 0; if (k === 'pointerup') last.delete(e.pointerId); else last.set(e.pointerId, { x: e.clientX, y: e.clientY }) }
  const m = { k, x: e.clientX, y: e.clientY, dx, dy, buttons: e.buttons, button: e.button, touch, id: e.pointerId }
  input.pointer.x = m.x; input.pointer.y = m.y; input.pointer.buttons = m.buttons
  emit(k, m)
}
canvas.addEventListener('pointerdown', e => { canvas.focus(); try { canvas.setPointerCapture(e.pointerId) } catch {} ptr('pointerdown', e) })
canvas.addEventListener('pointerup', e => ptr('pointerup', e))
canvas.addEventListener('pointercancel', e => ptr('pointerup', e))
canvas.addEventListener('pointermove', e => ptr('pointermove', e))
canvas.addEventListener('wheel', e => { e.preventDefault(); emit('wheel', { k: 'wheel', dx: e.deltaX, dy: e.deltaY }) }, { passive: false })
canvas.addEventListener('contextmenu', e => e.preventDefault())
const keyOf = e => ({ k: 'key', code: e.code, key: e.key.length <= 16 ? e.key : '', repeat: e.repeat, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey })
// keys typed into a text field are not the game's
const typing = e => /^(INPUT|TEXTAREA|BUTTON)$/.test(e.target?.tagName || '')
addEventListener('keydown', e => { if (typing(e)) return; if (e.code === 'Tab' || e.code === 'Space') e.preventDefault(); input.keys.add(e.code); emit('keydown', keyOf(e)) })
addEventListener('keyup', e => { input.keys.delete(e.code); if (!typing(e)) emit('keyup', keyOf(e)) })
addEventListener('blur', () => input.keys.clear())

/** The site brings the player to room `code` while the game is open (a friend's invite): out of the room or game they are in, into that one. */
function goToRoom(code) {
  code = cleanCode(code)
  if (code.length < 3 || web.room?.code === code) return
  online.cancel()
  online.join(code)
}
globalThis.__cslInvite = goToRoom // for local testing: the site's local SDK never calls its join room listener

async function boot() {
  // the game loads while the site's SDK starts (web/platform.js); the site hears of the loading once it can
  const loaded = import(entry)
  loaded.catch(() => {}) // (a failure is reported once it is awaited, below)
  await ready
  hooks.loadingStart()
  // a site that puts everyone at its own table says which (a room code), before the game starts: it has no menu then
  const instant = hooks.instantMultiplayer()
  if (typeof instant === 'string' && cleanCode(instant).length >= 3) channel = cleanCode(instant)
  // the site's own name for the player, if it has one, stands in for the one they type
  const user = Promise.resolve(hooks.getUser()).catch(() => null)
  const mod = await loaded
  await mod.default(p0)
  const u = await Promise.race([user, new Promise(r => setTimeout(() => r(null), 3000))])
  if (u?.name && safeName(u.name, '')) me.name = siteName = safeName(u.name, '')
  hooks.loadingStop()
  loadEl.classList.add('done')
  setTimeout(() => loadEl.remove(), 600)
  // the room this tab was in before a reload: back to it. A room's link: its code on the Online screen;
  // the site's invite: straight into that room. The site's multiplayer page: a room of one's own at once
  // (the mode and board last chosen on the Online screen), no menu and no First Match first; the site's
  // own table (Discord's channel): straight to it, and the first one there opens it
  const invite = channel ? '' : cleanCode(hooks.inviteRoom())
  const code = channel || cleanCode(q.get('room')) || invite
  const back = ss.get(ROOM_KEY)
  ss.set(ROOM_KEY, null)
  if (back && cleanCode(back.code).length >= 3 && Date.now() - (back.at || 0) < ROOM_FRESH_MS && (!code || code === cleanCode(back.code)) && me.name) {
    online.resume(back.code, () => net.rejoin(cleanCode(back.code), !!back.quick, back.state))
  } else if (channel) online.enter(channel)
  else if (code.length >= 3 && code === invite) online.join(code)
  else if (code.length >= 3) online.invite(code)
  else if (instant) online.create()
  hooks.onInvite(goToRoom)
  // animation frames stop in a hidden tab, and in some windows that still count as visible (an
  // embedded view, an occluded window): then a steady timer (web/clock.js) keeps the game, and an
  // online table it hosts, going
  let prev = performance.now(), lastRaf = prev
  const frame = (now, cap) => {
    const dt = Math.min(cap, Math.max(0, (now - prev) / 1000)); prev = now
    p0.time += dt
    emit('frame', dt, p0.time)
    if (p0.autoRender) getRenderer().render(scene, camera)
  }
  // ?clock=manual: no frames of its own; whoever drives the page (tools/trailer.html) steps it by dt seconds
  if (q.get('clock') === 'manual') { globalThis.__cslStep = dt => frame(prev + dt * 1000, 1); return }
  const loop = now => { lastRaf = performance.now(); frame(now, 0.1); requestAnimationFrame(loop) }
  requestAnimationFrame(loop)
  every(100, () => { const now = performance.now(); if (now - lastRaf > 250) frame(now, 0.5) })
}
boot().catch(e => {
  console.error(e)
  labelEl.textContent = 'The game could not start: ' + (e?.message || e)
  loadEl.classList.add('error')
})
