// A browser stand-in for Project 0's experience runtime (the p0 object), so the game in
// experience/ runs as a plain web page (GitHub Pages). Offline it is one player on one computer
// (bots and pass-and-play); online (web/net.js) a room stands in for the lot, so the game's
// Shared Table works as it does in Project 0. There is no city here.
import * as THREE from 'three'
import { Net, cleanCode } from './net.js'
import { safeName } from './names.js'
import { onlineDialog, shareRoom } from './online.js'
import { platform, hooks, mute, roomLink, roomLinks } from './platform.js'
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

const view = { width: innerWidth, height: innerHeight, dpr: Math.min(devicePixelRatio || 1, 2) }
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
    info = info && { ...info, link: roomLink(info.code) } // link: null where only the code is shared
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
    hooks.roomChanged(info)
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
// ?ice=relay: no direct connections from here, as behind a strict NAT (to try the brokers' way round)
const net = new Net(session, { quick: platform.quickPrefix, iceRelay: q.get('ice') === 'relay' })
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
const dialog = onlineDialog({ net, me, links: roomLinks, siteName: () => siteName })
const web = {
  platform, // the site this runs on (web/platform.js)
  hooks, // what the game tells the site: loading, gameplay, wins, between games
  get muted() { return mute.on }, // all sound off for the site (an ad), whatever the player's setting
  room: null, // { code, quick, link } while in an online room; link is null where only the code is shared
  online() { dialog.open() },
  share() { return shareRoom(web.room) },
  leave() { net.leave() },
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
mute.listen(on => { for (const a of sounding) a.muted = on })

function resize() {
  view.width = innerWidth; view.height = innerHeight; view.dpr = Math.min(devicePixelRatio || 1, 2)
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
// keys typed into the online dialog are not the game's
const typing = e => dialog.isOpen || /^(INPUT|TEXTAREA|BUTTON)$/.test(e.target?.tagName || '')
addEventListener('keydown', e => { if (typing(e)) return; if (e.code === 'Tab' || e.code === 'Space') e.preventDefault(); input.keys.add(e.code); emit('keydown', keyOf(e)) })
addEventListener('keyup', e => { input.keys.delete(e.code); if (!typing(e)) emit('keyup', keyOf(e)) })
addEventListener('blur', () => input.keys.clear())

async function boot() {
  hooks.loadingStart()
  // the site's own name for the player, if it has one, stands in for the one they type
  const user = Promise.resolve(hooks.getUser()).catch(() => null)
  const mod = await import(entry)
  await mod.default(p0)
  const u = await Promise.race([user, new Promise(r => setTimeout(() => r(null), 3000))])
  if (u?.name && safeName(u.name, '')) me.name = siteName = safeName(u.name, '')
  hooks.loadingStop()
  loadEl.classList.add('done')
  setTimeout(() => loadEl.remove(), 600)
  // the room this tab was in before a reload: back to it; a room's link (or the site's invite): ask for a name and join
  const code = cleanCode(q.get('room') || hooks.inviteRoom())
  const back = ss.get(ROOM_KEY)
  ss.set(ROOM_KEY, null)
  if (back && cleanCode(back.code).length >= 3 && Date.now() - (back.at || 0) < ROOM_FRESH_MS && (!code || code === cleanCode(back.code)) && me.name) {
    dialog.resume(back.code, () => net.rejoin(cleanCode(back.code), !!back.quick, back.state))
  } else if (code.length >= 3) dialog.open({ code })
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
  const loop = now => { lastRaf = performance.now(); frame(now, 0.1); requestAnimationFrame(loop) }
  requestAnimationFrame(loop)
  every(100, () => { const now = performance.now(); if (now - lastRaf > 250) frame(now, 0.5) })
}
boot().catch(e => {
  console.error(e)
  labelEl.textContent = 'The game could not start: ' + (e?.message || e)
  loadEl.classList.add('error')
})
