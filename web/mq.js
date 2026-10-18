// The way round for online rooms when two browsers cannot reach each other directly. WebRTC needs a
// TURN relay between strict NATs (mobile networks, CGNAT, some Wi-Fi), and the free ones (PeerJS's
// own among them) are gone; so then the room's messages go through free public MQTT brokers instead.
// This is a small MQTT 3.1.1 client over a WebSocket, QoS 0 only: TCP keeps the order, and the
// room's own heartbeats (web/net.js) notice a link that went quiet. Topics are exact, no wildcards.
//
// The brokers are public test brokers: no account, no promises. Each player uses all that answer,
// so a room carries on while one of them is up for both ends.
import { every } from './clock.js'

export const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://test.mosquitto.org:8081/mqtt']
const ROOT = 'andtargd/csl1/'
const KEEPALIVE = 30 // seconds, told to the broker
const PING_MS = 10000
const SILENT_MS = 25000 // nothing at all from the broker this long (not even a ping's answer): it is gone
const CONNECT_MS = 8000
const SUB_MS = 6000

const enc = new TextEncoder(), dec = new TextDecoder()
const str = s => { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b] }
const varlen = n => { const o = []; do { let d = n % 128; n = Math.floor(n / 128); if (n) d |= 128; o.push(d) } while (n); return o }
const packet = (h, body) => { const head = [h, ...varlen(body.length)], p = new Uint8Array(head.length + body.length); p.set(head); p.set(body, head.length); return p }
const clientId = () => 'csl' + Array.from({ length: 16 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('')

/** A topic of the online rooms: topic('ABCDE', 'r'). */
export const topic = (...parts) => ROOT + parts.join('/')

// one clock for every broker's keepalive
const beating = new Set()
let stopBeat = null
const beat = (b, on) => {
  if (on) beating.add(b); else beating.delete(b)
  if (beating.size && !stopBeat) stopBeat = every(PING_MS / 2, () => { for (const x of beating) x.beat() })
  else if (!beating.size && stopBeat) { stopBeat(); stopBeat = null }
}

export class Broker {
  constructor(url) {
    this.url = url
    this.ws = null
    this.up = false
    this.want = false // keep it connected: reconnect when it drops
    this.subs = new Map() // topic -> fn(message, broker)
    this.acked = new Set() // topics the broker said yes to on this connection
    this.waits = new Map() // packet id -> fn(ok)
    this.pid = 0
    this.buf = new Uint8Array(0)
    this.connecting = null
    this.pend = null
    this.retry = 0
    this.backoff = 1000
    this.lastIn = 0
    this.lastOut = 0
    this.downFns = new Set() // called when an open connection drops
  }
  get name() { return new URL(this.url).hostname }

  /** Resolves once the broker said yes (now, or already); rejects when it cannot be reached. */
  connect() {
    if (this.up) return Promise.resolve(this)
    if (this.connecting) return this.connecting
    clearTimeout(this.retry); this.retry = 0
    this.connecting = new Promise((res, rej) => {
      let ws
      try { ws = new WebSocket(this.url, 'mqtt') } catch (e) { this.connecting = null; this.later(); rej(e); return }
      ws.binaryType = 'arraybuffer'
      this.ws = ws
      this.buf = new Uint8Array(0)
      const timer = setTimeout(() => this.lost(ws, 'timeout'), CONNECT_MS)
      this.pend = { res: () => { clearTimeout(timer); res(this) }, rej: e => { clearTimeout(timer); rej(e) } }
      ws.onopen = () => this.raw(ws, packet(0x10, [...str('MQTT'), 4, 0x02, 0, KEEPALIVE, ...str(clientId())]))
      ws.onmessage = e => this.data(ws, new Uint8Array(e.data))
      ws.onclose = () => this.lost(ws, 'closed')
      ws.onerror = () => this.lost(ws, 'error')
    })
    return this.connecting
  }
  /** Leaves for good (until connect() again): no reconnecting. */
  close() {
    this.want = false
    clearTimeout(this.retry); this.retry = 0
    if (this.up) this.raw(this.ws, new Uint8Array([0xe0, 0]))
    if (this.ws) this.lost(this.ws, 'closed')
  }
  /** Resolves true once the broker sends this topic's messages to fn, false if it would not. */
  async subscribe(t, fn) {
    this.subs.set(t, fn)
    await this.connect()
    if (this.acked.has(t)) return true
    return this.sub([t])
  }
  unsubscribe(t) {
    if (!this.subs.delete(t)) return
    this.acked.delete(t)
    if (this.up) this.raw(this.ws, packet(0xa2, [...this.nextId(), ...str(t)]))
  }
  /** Sends at most once; false when not connected. */
  publish(t, msg) {
    if (!this.up) return false
    return this.raw(this.ws, packet(0x30, [...str(t), ...enc.encode(JSON.stringify(msg ?? null))]))
  }

  // ---------- inside ----------
  nextId() { this.pid = (this.pid % 65535) + 1; return [this.pid >> 8, this.pid & 255] }
  raw(ws, bytes) {
    if (!ws || ws.readyState !== 1) return false
    try { ws.send(bytes) } catch { return false }
    this.lastOut = Date.now()
    return true
  }
  sub(topics) {
    return new Promise(res => {
      const id = this.nextId(), key = (id[0] << 8) | id[1]
      const done = ok => { if (!this.waits.has(key)) return; this.waits.delete(key); clearTimeout(timer); if (ok) for (const t of topics) if (this.subs.has(t)) this.acked.add(t); res(ok) }
      const timer = setTimeout(() => done(false), SUB_MS)
      this.waits.set(key, done)
      if (!this.raw(this.ws, packet(0x82, [...id, ...topics.flatMap(t => [...str(t), 0])]))) done(false)
    })
  }
  data(ws, chunk) {
    if (ws !== this.ws) return
    let b = chunk
    if (this.buf.length) { b = new Uint8Array(this.buf.length + chunk.length); b.set(this.buf); b.set(chunk, this.buf.length) }
    let i = 0
    for (;;) {
      if (b.length - i < 2) break
      let len = 0, mul = 1, j = i + 1, byte = 0, whole = true
      do {
        if (j >= b.length) { whole = false; break }
        byte = b[j++]; len += (byte & 127) * mul; mul *= 128
      } while (byte & 128 && mul <= 128 ** 3)
      if (!whole || b.length - j < len) break
      this.packet(ws, b[i], b.subarray(j, j + len))
      if (ws !== this.ws) return
      i = j + len
    }
    this.buf = b.slice(i)
  }
  packet(ws, h, body) {
    this.lastIn = Date.now()
    const type = h >> 4
    if (type === 2) { // CONNACK
      if (body[1] !== 0) { this.lost(ws, 'refused'); return }
      this.up = true
      this.connecting = null
      this.backoff = 1000
      this.acked.clear()
      beat(this, true)
      const p = this.pend; this.pend = null
      p?.res()
      if (this.subs.size) this.sub([...this.subs.keys()])
    } else if (type === 3) { // PUBLISH
      const tl = (body[0] << 8) | body[1], qos = (h >> 1) & 3
      const t = dec.decode(body.subarray(2, 2 + tl))
      const fn = this.subs.get(t)
      if (!fn) return
      let msg
      try { msg = JSON.parse(dec.decode(body.subarray(2 + tl + (qos ? 2 : 0)))) } catch { return }
      try { fn(msg, this) } catch (e) { console.error('[mq]', e) }
    } else if (type === 9) { // SUBACK
      this.waits.get((body[0] << 8) | body[1])?.(body[2] !== 0x80)
    }
  }
  beat() {
    if (!this.up) return
    const now = Date.now()
    // a socket on its way out may not say so for a long while (a close that the server never finishes)
    if (this.ws.readyState > 1) { this.lost(this.ws, 'closed'); return }
    if (now - this.lastIn > SILENT_MS) { this.lost(this.ws, 'silent'); return }
    if (now - this.lastOut > PING_MS) this.raw(this.ws, new Uint8Array([0xc0, 0]))
  }
  lost(ws, why) {
    if (!ws || ws !== this.ws) return
    this.ws = null
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null
    try { ws.close() } catch { /* gone */ }
    const was = this.up
    this.up = false
    this.connecting = null
    this.acked.clear()
    beat(this, false)
    const p = this.pend; this.pend = null
    p?.rej(Object.assign(new Error('broker ' + why), { type: 'broker' }))
    for (const w of [...this.waits.values()]) w(false)
    if (was) for (const fn of [...this.downFns]) { try { fn(this) } catch (e) { console.error('[mq]', e) } }
    this.later()
  }
  later() {
    if (!this.want || this.retry) return
    this.retry = setTimeout(() => { this.retry = 0; if (this.want) this.connect().catch(() => { /* later() again */ }) }, this.backoff)
    this.backoff = Math.min(15000, this.backoff * 2)
  }
}

/** All the brokers one player uses. */
export class Brokers {
  constructor(urls = BROKERS) { this.list = urls.map(u => new Broker(u)) }
  get anyUp() { return this.list.some(b => b.up) }
  /** Keep them all connected (while in a room), or close them and forget every topic (after leaving it). */
  keep(on) {
    for (const b of this.list) {
      if (on) { b.want = true; b.connect().catch(() => { /* it tries again */ }) } else { b.subs.clear(); b.close() }
    }
  }
  /** Back in front: reconnect now the ones that dropped meanwhile. */
  wake() { for (const b of this.list) if (b.want && !b.up) b.connect().catch(() => { /* it tries again */ }) }
  onDown(fn) { for (const b of this.list) b.downFns.add(fn) }
}
