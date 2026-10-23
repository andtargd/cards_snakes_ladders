// The online rooms through our own relay server (server/relay) instead of PeerJS and WebRTC: where a
// browser cannot open a data channel or reach the public brokers (Discord's iframe, docs/discord/).
// RelayPeer and its links look to web/net.js like PeerJS's Peer and DataConnection, so the rooms work as
// they always have: holding a room's id is holding its host socket at the server, and each link to the
// host is a socket of its own that the server passes on.
//
// The server: ?server=ws://127.0.0.1:8787 (server/relay, npm run dev), else in Discord the app's URL
// Mapping /x/relay on the page's own domain (web/discord.js), else the local one.
const PREFIX = 'andtargd-csl-v1-' // a room's id in web/net.js is PREFIX + its code

/** Where the relay server is for this page. */
export function relayServer() {
  const q = new URLSearchParams(globalThis.location?.search || '')
  if (q.get('server')) return q.get('server')
  if (location.hostname.endsWith('.discordsays.com')) return `wss://${location.host}/x/relay`
  return 'ws://127.0.0.1:8787'
}

const rid = () => 'p' + Array.from({ length: 12 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('')

class Emitter {
  constructor() { this.fns = new Map() }
  on(e, fn) { if (!this.fns.has(e)) this.fns.set(e, new Set()); this.fns.get(e).add(fn); return this }
  once(e, fn) { const w = (...a) => { this.off(e, w); fn(...a) }; w.fn = fn; return this.on(e, w) }
  off(e, fn) {
    if (!fn) { this.fns.delete(e); return this }
    const set = this.fns.get(e)
    if (set) for (const f of set) if (f === fn || f.fn === fn) set.delete(f)
    return this
  }
  emit(e, ...a) { for (const fn of [...(this.fns.get(e) || [])]) { try { fn(...a) } catch (err) { console.error('[relaypeer]', err) } } }
}

/** A link between a player and the room's host, as PeerJS's DataConnection: open, send(), close(), and 'open', 'data', 'close'. */
class RelayLink extends Emitter {
  constructor(peer, send, close) {
    super()
    this.kind = 'server'
    this.peer = peer // the other end's id
    this.open = false
    this._send = send; this._close = close
  }
  send(m) { if (this.open) this._send(m) }
  close() { if (this._ended) return; this._close(); this.end() }
  /** Closed from the other end, or its socket went. */
  end() { if (this._ended) return; this._ended = true; this.open = false; this.emit('close') }
}

/** Opens a socket to a room; rejects when it cannot be opened. */
function socket(server, code, peer, host) {
  return new WebSocket(`${server.replace(/\/+$/, '')}/room/${encodeURIComponent(code)}?peer=${encodeURIComponent(peer)}${host ? '&host=1' : ''}`)
}

/** A PeerJS stand-in for one server: relayPeerClass(url) is what web/net.js creates with `new Peer(id?)`. */
export function relayPeerClass(server) {
  return class RelayPeer extends Emitter {
    constructor(id) {
      super()
      this.server = server
      this.id = typeof id === 'string' ? id : rid()
      this.code = typeof id === 'string' && id.startsWith(PREFIX) ? id.slice(PREFIX.length) : null
      this.destroyed = false
      this.disconnected = false
      this.ws = null // the host socket, when this peer holds a room
      this.links = new Map() // host side: c -> link
      this.dialed = new Set() // player side: the links this peer opened
      this.frozen = false // tests: the page stops (nothing goes out or comes in)
      if (this.code) this.hold(); else setTimeout(() => { if (!this.destroyed) this.emit('open', this.id) })
    }
    /** Holds the room at the server (again, after a reconnect): 'open', or an 'unavailable-id' error. */
    hold() {
      const ws = socket(this.server, this.code, this.id, true)
      this.ws = ws
      let opened = false
      ws.onmessage = e => {
        if (this.ws !== ws || this.frozen) return
        let m
        try { m = JSON.parse(e.data) } catch { return }
        if (m.$ === 'open') { opened = true; this.disconnected = false; this.emit('open', this.id) } else if (m.$ === 'taken') this.fail(ws, 'unavailable-id', `ID "${this.id}" is taken`)
        else if (m.$ === 'conn') this.incoming(m.c, m.peer)
        else if (Number.isInteger(m.c)) {
          const l = this.links.get(m.c)
          if (!l) return
          if (m.x) { this.links.delete(m.c); l.end() } else if ('d' in m) l.emit('data', m.d)
        }
      }
      ws.onclose = () => {
        if (this.ws !== ws) return
        this.ws = null
        for (const l of this.links.values()) l.end()
        this.links.clear()
        if (this.destroyed) return
        if (!opened) { this.fail(ws, 'network', 'the relay server did not answer'); return }
        this.disconnected = true
        this.emit('disconnected', this.id)
      }
      ws.onerror = () => { /* onclose follows */ }
    }
    fail(ws, type, message) {
      if (this.ws === ws) this.ws = null
      try { ws.close() } catch { /* gone */ }
      this.emit('error', Object.assign(new Error(message), { type }))
    }
    incoming(c, peer) {
      const ws = this.ws
      const l = new RelayLink(peer,
        d => { if (!this.frozen && ws.readyState === 1) ws.send(JSON.stringify({ c, d })) },
        () => { this.links.delete(c); if (ws.readyState === 1) ws.send(JSON.stringify({ c, x: 1 })) })
      l.open = true
      this.links.set(c, l)
      this.emit('connection', l)
    }
    /** A link to the host of room `pid` (PREFIX + code): 'open' once the server put it through; an error 'peer-unavailable' when no one holds the room. */
    connect(pid) {
      const code = String(pid).startsWith(PREFIX) ? String(pid).slice(PREFIX.length) : String(pid)
      const ws = socket(this.server, code, this.id, false)
      const l = new RelayLink(pid,
        d => { if (!this.frozen && ws.readyState === 1) ws.send(JSON.stringify({ d })) },
        () => { try { ws.close(1000, 'closed') } catch { /* gone */ } })
      this.dialed.add(l)
      ws.onmessage = e => {
        if (this.frozen) return
        let m
        try { m = JSON.parse(e.data) } catch { return }
        if (m.$ === 'open') { l.open = true; l.emit('open') } else if (m.$ === 'nohost') this.emit('error', Object.assign(new Error(`Could not connect to peer ${pid}`), { type: 'peer-unavailable' }))
        else if ('d' in m) l.emit('data', m.d)
      }
      ws.onclose = () => { this.dialed.delete(l); l.end() }
      ws.onerror = () => { /* onclose follows */ }
      l.ws = ws
      return l
    }
    /** Holds the room again after its socket dropped (the network came back). */
    reconnect() {
      if (this.destroyed || this.frozen || !this.code || this.ws) return
      this.hold()
    }
    destroy() {
      if (this.destroyed) return
      this.destroyed = true
      const ws = this.ws
      this.ws = null
      for (const l of this.links.values()) l.end()
      this.links.clear()
      for (const l of [...this.dialed]) l.close()
      try { ws?.close(1000, 'left') } catch { /* gone */ }
    }
  }
}
