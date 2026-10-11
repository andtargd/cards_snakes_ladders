// A browser stand-in for Project 0's experience runtime (the p0 object), so the game in
// experience/ runs as a plain web page (GitHub Pages). Offline it is one player on one computer
// (bots and pass-and-play); online (web/net.js) a room stands in for the lot, so the game's
// Shared Table works as it does in Project 0. There is no city here.
import * as THREE from 'three'
import { Net, cleanCode } from './net.js'
import { onlineDialog, shareRoom } from './online.js'

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

const myId = Math.floor(Math.random() * 90000) + 1000
let savedName = ''
try { savedName = localStorage.getItem('csl-name') || '' } catch { /* private mode */ }
const me = { id: myId, name: (q.get('name') || savedName).slice(0, 14), color: '#e94f37', avatar: null, position: new THREE.Vector3(0, 1.5, 0), yaw: 0, isMe: true }
const players = new Map([[myId, me]])
const state = {}
let host = myId

// the session the network keeps in step: who is here, who hosts, the room's shared state
const session = {
  me, players, state,
  get host() { return host },
  addPlayer(p) {
    if (p.id === myId || players.has(p.id)) return
    const pl = { id: p.id, name: String(p.name || 'Player').slice(0, 14), color: p.color || '#9a948a', avatar: null, position: new THREE.Vector3(), yaw: 0, isMe: false }
    players.set(p.id, pl)
    emit('join', pl)
  },
  removePlayer(id) { const p = players.get(id); if (!p || id === myId) return; players.delete(id); emit('leave', p) },
  setHost(id) { if (id !== host) { host = id; emit('host', id) } },
  applyState(k, v, from) { if (v == null) delete state[k]; else state[k] = v; emit('state', k, v ?? null, from) },
  message(d, from) { emit('message', d, from) },
  roomChanged(info, reason) {
    web.room = info
    try { history.replaceState(null, '', info ? '?room=' + info.code : location.pathname) } catch { /* fine */ }
    emit('room', info, reason)
  },
  reset() {
    for (const id of [...players.keys()]) session.removePlayer(id)
    for (const k of Object.keys(state)) session.applyState(k, null, myId)
    session.setHost(myId)
  },
}
const net = new Net(session)
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
const dialog = onlineDialog({ net, me })
const web = {
  room: null, // { code, quick, link } while in an online room
  online() { dialog.open() },
  share() { return shareRoom(web.room) },
  leave() { net.leave() },
}
addEventListener('pagehide', () => net.unload())

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
    play(path, o = {}) { try { const a = new Audio(p0.asset(path)); a.volume = Math.min(1, (o.volume ?? 1) * 0.5); a.loop = !!o.loop; a.playbackRate = o.rate ?? 1; a.play().catch(() => {}); return a } catch { return 0 } },
    stop(a) { try { a.pause() } catch {} }, stopAll() {},
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
  const mod = await import(entry)
  await mod.default(p0)
  loadEl.classList.add('done')
  setTimeout(() => loadEl.remove(), 600)
  // a room's link: ask for a name and join
  const code = cleanCode(q.get('room'))
  if (code.length >= 3) dialog.open({ code })
  // a hidden tab gets no animation frames: a timer keeps the game (and an online table it hosts) going
  let prev = performance.now()
  const next = () => (document.hidden ? setTimeout(() => frame(performance.now()), 100) : requestAnimationFrame(frame))
  const frame = now => {
    const dt = Math.min(document.hidden ? 0.5 : 0.1, Math.max(0, (now - prev) / 1000)); prev = now
    p0.time += dt
    emit('frame', dt, p0.time)
    if (p0.autoRender) getRenderer().render(scene, camera)
    next()
  }
  next()
}
boot().catch(e => {
  console.error(e)
  labelEl.textContent = 'The game could not start: ' + (e?.message || e)
  loadEl.classList.add('error')
})
