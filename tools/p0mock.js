// A local stand-in for Project 0's experience runtime (the p0 object), modelled on
// https://project0.city/sandbox/runtime.js. It runs the game on the main thread, so it is only
// for quick iteration: the dev kit and the server's review are the real checks.
// The session is shared between tabs of this page with a BroadcastChannel (?room=name).
import * as THREE from 'three'

const q = new URLSearchParams(location.search)
const entry = new URL(q.get('entry') || '../experience/main.js', location.href).href
const lot = { id: 1886, width: +(q.get('width') || 12), depth: +(q.get('depth') || 19), height: +(q.get('height') || 12), name: 'harness' }
lot.size = Math.max(lot.width, lot.depth)
const canvas = document.getElementById('c')
const hudEl = document.getElementById('hud')
const statEl = document.getElementById('stat')

const listeners = new Map()
const on = (ev, fn) => { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev).add(fn); return () => off(ev, fn) }
const off = (ev, fn) => listeners.get(ev)?.delete(fn)
const emit = (ev, ...a) => { for (const fn of [...(listeners.get(ev) || [])]) { try { fn(...a) } catch (e) { console.error(e) } } }
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

const view = { width: innerWidth, height: innerHeight, dpr: Math.min(devicePixelRatio || 1, q.get('dpr') ? +q.get('dpr') : 2) }
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
const myName = q.get('name') || ('Tester ' + (myId % 100))
const colors = ['#e94f37', '#2f9bff', '#3bb273', '#f6c90e', '#8e5cf7', '#ff8a3d']
const me = { id: myId, name: myName, color: colors[myId % 6], avatar: q.get('avatar') || null, position: new THREE.Vector3(0, 1.5, 0), yaw: 0, isMe: true }
const players = new Map([[myId, me]])
const state = {}
const joinedAt = new Map([[myId, Date.now()]])
const chan = q.get('room') ? new BroadcastChannel('p0mock-' + q.get('room')) : null
const room = {
  id: 1, seed: (q.get('seed') ? +q.get('seed') : 12345) >>> 0, tick: 0, host: myId,
  get isHost() { return room.host === me.id },
  get players() { return [...players.keys()] },
  state,
  send(data, to) { const n = JSON.stringify(data ?? null).length; if (n > 1024) throw new RangeError('send: ' + n + ' bytes'); chan?.postMessage({ t: 'msg', from: myId, to, d: data }) },
  sendTo(id, data) { room.send(data, id) },
  set(key, value) {
    const n = new TextEncoder().encode(JSON.stringify(value ?? null)).byteLength
    if (n > 2048) throw new RangeError('p0.room.set: ' + n + ' bytes; a value may be at most 2048')
    setState(key, value ?? null, myId); chan?.postMessage({ t: 'set', from: myId, k: key, v: value ?? null })
  },
  input() {},
  on: (e, f) => on(e, f),
}
function setState(k, v, from) { if (v === null) delete state[k]; else state[k] = v; emit('state', k, v, from) }
function pickHost() {
  let best = null
  for (const [id, t] of joinedAt) if (players.has(id) && (best === null || t < joinedAt.get(best) || (t === joinedAt.get(best) && id < best))) best = id
  if (best !== room.host) { room.host = best; emit('host', best) }
}
if (chan) {
  chan.onmessage = ({ data: m }) => {
    if (m.t === 'hello' || m.t === 'here') {
      if (!players.has(m.from)) {
        const p = { id: m.from, name: m.name, color: m.color, avatar: null, position: new THREE.Vector3(), yaw: 0, isMe: false }
        players.set(m.from, p); joinedAt.set(m.from, m.at); emit('join', p); pickHost()
      }
      if (m.t === 'hello') chan.postMessage({ t: 'here', from: myId, name: myName, color: me.color, at: joinedAt.get(myId), state })
      if (m.t === 'here' && m.state) for (const [k, v] of Object.entries(m.state)) if (!(k in state)) setState(k, v, m.from)
    } else if (m.t === 'bye') {
      const p = players.get(m.from); if (p) { players.delete(m.from); emit('leave', p); pickHost() }
    } else if (m.t === 'set') setState(m.k, m.v, m.from)
    else if (m.t === 'msg' && (m.to === undefined || m.to === myId)) emit('message', m.d, m.from)
  }
  addEventListener('beforeunload', () => chan.postMessage({ t: 'bye', from: myId }))
}

const input = { keys: new Set(), isDown: c => input.keys.has(c), pointer: { x: 0, y: 0, buttons: 0, locked: false }, lockPointer() {}, unlockPointer() {} }
const controls = { mode: 'fly', enabled: true, speed: 10, vertical: true, distance: 7, yaw: 0, pitch: 0.25 }
let hudText = '', frames = []
const p0 = {
  THREE, version: 1, lot, me, players, room, scene, camera,
  get renderer() { return getRenderer() },
  createRenderer(params = {}) { rendererParams = params; return getRenderer() },
  autoRender: true, controls,
  bodies: { visible: true, get: () => null },
  input,
  get width() { return view.width }, get height() { return view.height }, get pixelRatio() { return view.dpr },
  time: 0, random: mulberry32(room.seed), on, off,
  loop: fn => on('frame', fn),
  asset: path => new URL(String(path).replace(/^\/+/, ''), entry).href,
  hud(t) { hudText = String(t).slice(0, 400); hudEl.textContent = hudText },
  loading(f, label) { statEl.textContent = 'loading ' + Math.round(f * 100) + '% ' + (label || '') },
  sound: {
    play(path, o = {}) { try { const a = new Audio(p0.asset(path)); a.volume = Math.min(1, (o.volume ?? 1) * 0.5); a.loop = !!o.loop; a.playbackRate = o.rate ?? 1; a.play().catch(() => {}); return a } catch { return 0 } },
    stop(a) { try { a.pause() } catch {} }, stopAll() {},
  },
  music: { play() {}, stop() {}, volume() {}, seek() {}, time: 0, playing: false, duration: 0 },
  exit: () => console.log('[p0] exit'),
  game: null, table: [],
  entities: { kind: null, mine: () => null, of: () => null, list: async () => ({ entities: [], canLike: false }), like: async () => ({ ok: false }), hint: '' },
  avatars: {
    async load(id) {
      const p = players.get(id)
      if (!p?.avatar) return null
      try { return await (await fetch(p.avatar)).arrayBuffer() } catch { return null }
    },
  },
  win() { console.log('[p0] win'); setTimeout(() => emit('reward', { kind: 'win', ok: false, tokens: 0, item: null, reason: null }), 200) },
  score(n) { console.log('[p0] score', n); setTimeout(() => emit('reward', { kind: 'score', ok: true, score: n, best: n, place: 1 }), 200) },
  items: { give(id) { console.log('[p0] give', id) } },
  duel: null, duelResult() {}, buy: async () => ({ ok: false, reason: 'cancelled' }), purchases: [], invite() {}, invitation: null,
  log: (...a) => console.log('[p0]', ...a),
}
window.p0 = p0

function resize() {
  view.width = innerWidth; view.height = innerHeight
  camera.aspect = view.width / view.height; camera.updateProjectionMatrix()
  if (renderer) { renderer.setPixelRatio(view.dpr); renderer.setSize(view.width, view.height, false) }
  emit('resize', view.width, view.height)
}
addEventListener('resize', resize)
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
canvas.addEventListener('pointermove', e => ptr('pointermove', e))
canvas.addEventListener('wheel', e => { e.preventDefault(); emit('wheel', { k: 'wheel', dx: e.deltaX, dy: e.deltaY }) }, { passive: false })
canvas.addEventListener('contextmenu', e => e.preventDefault())
const keyOf = e => ({ k: 'key', code: e.code, key: e.key.length <= 16 ? e.key : '', repeat: e.repeat, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey })
addEventListener('keydown', e => { if (e.code === 'Enter') return; input.keys.add(e.code); emit('keydown', keyOf(e)) })
addEventListener('keyup', e => { input.keys.delete(e.code); emit('keyup', keyOf(e)) })

window.harness = { frames, errors: [], status: 'loading', drop(id) { const p = players.get(id); if (p && id !== myId) { players.delete(id); emit('leave', p); pickHost() } } }
addEventListener('error', e => window.harness.errors.push(String(e.message)))
addEventListener('unhandledrejection', e => window.harness.errors.push(String(e.reason?.stack || e.reason)))

// the browser pane may pause requestAnimationFrame while hidden: a timer keeps the game running
const schedule = fn => setTimeout(() => fn(performance.now()), 16)
async function boot() {
  if (chan) chan.postMessage({ t: 'hello', from: myId, name: myName, color: me.color, at: joinedAt.get(myId) })
  const mod = await import(entry)
  const t0 = performance.now()
  await mod.default(p0)
  window.harness.status = 'started'
  window.harness.startMs = Math.round(performance.now() - t0)
  let prev = performance.now(), acc = 0, n = 0
  const frame = now => {
    const dt = Math.min(0.1, Math.max(0, (now - prev) / 1000)); prev = now
    p0.time += dt
    emit('frame', dt, p0.time)
    if (p0.autoRender) getRenderer().render(scene, camera)
    const ms = performance.now() - now
    frames.push(ms); if (frames.length > 600) frames.shift()
    acc += dt; n++
    if (acc > 1) { statEl.textContent = Math.round(n / acc) + ' fps'; acc = 0; n = 0 }
    schedule(frame)
  }
  schedule(frame)
}
boot().catch(e => { window.harness.status = 'crashed'; window.harness.errors.push(String(e?.stack || e)); statEl.textContent = 'CRASH: ' + e; console.error(e) })
