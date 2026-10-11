// A browser stand-in for Project 0's experience runtime (the p0 object), so the game in
// experience/ runs as a plain web page (GitHub Pages). It is one player on one computer:
// bots and pass-and-play work, the Shared Table and the city do not exist here.
import * as THREE from 'three'

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
const me = { id: myId, name: (q.get('name') || '').slice(0, 24), color: '#e94f37', avatar: null, position: new THREE.Vector3(0, 1.5, 0), yaw: 0, isMe: true }
const players = new Map([[myId, me]])
const state = {}
const room = {
  id: 1, seed: (Math.random() * 2 ** 32) >>> 0, tick: 0, host: myId,
  get isHost() { return true },
  get players() { return [myId] },
  state,
  send() {},
  sendTo() {},
  set(key, value) { if (value == null) delete state[key]; else state[key] = value; emit('state', key, value ?? null, myId) },
  input() {},
  on: (e, f) => on(e, f),
}

const input = { keys: new Set(), isDown: c => input.keys.has(c), pointer: { x: 0, y: 0, buttons: 0, locked: false }, lockPointer() {}, unlockPointer() {} }
const controls = { mode: 'none', enabled: true, speed: 10, vertical: false, distance: 7, yaw: 0, pitch: 0.25 }
const p0 = {
  THREE, version: 1, web: true, lot, me, players, room, scene, camera,
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
addEventListener('keydown', e => { if (e.code === 'Tab' || e.code === 'Space') e.preventDefault(); input.keys.add(e.code); emit('keydown', keyOf(e)) })
addEventListener('keyup', e => { input.keys.delete(e.code); emit('keyup', keyOf(e)) })
addEventListener('blur', () => input.keys.clear())

async function boot() {
  const mod = await import(entry)
  await mod.default(p0)
  loadEl.classList.add('done')
  setTimeout(() => loadEl.remove(), 600)
  let prev = performance.now()
  const frame = now => {
    const dt = Math.min(0.1, Math.max(0, (now - prev) / 1000)); prev = now
    p0.time += dt
    emit('frame', dt, p0.time)
    if (p0.autoRender) getRenderer().render(scene, camera)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}
boot().catch(e => {
  console.error(e)
  labelEl.textContent = 'The game could not start: ' + (e?.message || e)
  loadEl.classList.add('error')
})
