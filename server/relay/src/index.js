// The relay server of the online rooms (docs/discord/launch-plan.md, task 3): a Cloudflare Worker with
// one Durable Object per room. It only passes messages on; the game's rooms stay as web/net.js has
// them (the host is a player's browser, the others talk to it, the oldest takes over when it leaves).
// To web/net.js it stands where PeerJS's signalling server and a WebRTC data channel were: holding a
// room's id is holding its host socket, and each player's link to the host is a socket of its own
// (web/relaypeer.js makes them look like PeerJS).
//
//   GET /room/<CODE>?peer=<id>&host=1   (WebSocket) hold the room: {$:'open'}, or {$:'taken'} and closed
//   GET /room/<CODE>?peer=<id>          (WebSocket) a link to its host: {$:'open'}, or {$:'nohost'} / {$:'full'} and closed
//
// Frames are JSON. A player's link sends {d} and gets {d}. The host gets {$:'conn', c, peer} for each new
// link, then {c, d} from it and {c, x:1} when it closes; it sends {c, d} to one link and {c, x:1} to
// close it. A link closed cleanly (code 1000) is told to the host; one that dropped (a phone's network)
// is not: the host waits for its heartbeats, so the player can come back to their place. When the host's
// socket goes, every link of the room closes (the players take the room over), and a host silent for
// STALE_MS gives the room up to the first who claims it.
import { DurableObject } from 'cloudflare:workers'

const MAX_BYTES = 64 * 1024 // one frame (a welcome carries the room's state)
const MAX_LINKS = 16 // players' links to one host: a room of friends holds 12, and some come back
const RATE = { host: [200, 400], link: [40, 80] } // frames a second, and the burst
const STALE_MS = 15000 // a host that said nothing this long is gone (web/net.js's DEAD_MS is 20 s)
const CODE = /\/room\/([A-Z0-9]{2,8})$/

export default {
  async fetch(req, env) {
    const m = CODE.exec(new URL(req.url).pathname)
    if (!m) return new Response('cards-snakes-ladders relay: /room/<CODE> over a WebSocket', { status: 404 })
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('a WebSocket only', { status: 426 })
    return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(req)
  },
}

const say = (s, o) => { try { s.ws.send(JSON.stringify(o)) } catch { /* closed */ } }
const shut = (s, code, why) => { try { s.ws.close(code, why) } catch { /* closed */ } }

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env)
    this.host = null // { ws, peer, seen, tokens, at }
    this.links = new Map() // c -> the same, with c
    this.n = 0
  }

  async fetch(req) {
    const q = new URL(req.url).searchParams
    const [client, ws] = Object.values(new WebSocketPair())
    ws.accept()
    const now = Date.now()
    const hosting = q.get('host') === '1'
    const s = { ws, peer: String(q.get('peer') || '').slice(0, 64), seen: now, tokens: RATE[hosting ? 'host' : 'link'][1], at: now, rate: RATE[hosting ? 'host' : 'link'] }
    if (hosting) this.claim(s); else this.link(s)
    return new Response(null, { status: 101, webSocket: client })
  }

  claim(s) {
    if (this.host && Date.now() - this.host.seen < STALE_MS) { say(s, { $: 'taken' }); shut(s, 4001, 'taken'); return }
    if (this.host) { const old = this.host; this.hostGone(); shut(old, 4003, 'silent') }
    this.host = s
    s.ws.addEventListener('message', e => { if (this.host === s && this.ok(s, e.data)) this.fromHost(s, e.data) })
    s.ws.addEventListener('close', () => { if (this.host === s) this.hostGone() })
    s.ws.addEventListener('error', () => { if (this.host === s) this.hostGone() })
    say(s, { $: 'open' })
  }

  link(s) {
    if (!this.host || Date.now() - this.host.seen >= STALE_MS) { say(s, { $: 'nohost' }); shut(s, 4004, 'no host'); return }
    if (this.links.size >= MAX_LINKS) { say(s, { $: 'full' }); shut(s, 4029, 'full'); return }
    s.c = ++this.n
    this.links.set(s.c, s)
    const gone = clean => {
      if (this.links.get(s.c) !== s) return
      this.links.delete(s.c)
      if (clean && this.host) say(this.host, { c: s.c, x: 1 })
    }
    s.ws.addEventListener('message', e => {
      if (this.links.get(s.c) !== s || !this.ok(s, e.data)) return
      let m
      try { m = JSON.parse(e.data) } catch { return }
      if (this.host && m && typeof m === 'object' && 'd' in m) say(this.host, { c: s.c, d: m.d })
    })
    s.ws.addEventListener('close', e => gone(e.code === 1000))
    s.ws.addEventListener('error', () => gone(false))
    say(this.host, { $: 'conn', c: s.c, peer: s.peer })
    say(s, { $: 'open' })
  }

  fromHost(s, data) {
    let m
    try { m = JSON.parse(data) } catch { return }
    const l = m && Number.isInteger(m.c) ? this.links.get(m.c) : null
    if (!l) return
    if (m.x) { this.links.delete(m.c); shut(l, 1000, 'closed') } else if ('d' in m) say(l, { d: m.d })
  }

  /** The host's socket is gone: every link of the room closes, and the room waits for a new host. */
  hostGone() {
    this.host = null
    for (const l of this.links.values()) shut(l, 4002, 'host left')
    this.links.clear()
  }

  /** A frame within the limits (size, rate); a socket over them is closed. */
  ok(s, data) {
    const now = Date.now()
    s.seen = now
    if (typeof data !== 'string' || data.length > MAX_BYTES) { shut(s, 1009, 'too big'); return false }
    const [rate, burst] = s.rate
    s.tokens = Math.min(burst, s.tokens + (now - s.at) / 1000 * rate)
    s.at = now
    if (s.tokens < 1) { shut(s, 4008, 'too fast'); return false }
    s.tokens -= 1
    return true
  }
}
