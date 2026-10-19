// Online rooms for the web build. A room is a PeerJS id (PeerJS's free signalling server keeps the
// ids, so GitHub Pages needs no server of its own): one browser holds it and relays for everyone
// else (a star), and that browser is also p0's room host. When it leaves, the oldest remaining
// player takes the room's id over and the rest reconnect, so a game goes on (the game itself hands
// the leaver's seat to a bot).
//
// Players reach the relay over a WebRTC data channel when they can. Two browsers behind strict NATs
// (mobile networks, CGNAT, some Wi-Fi) cannot connect directly, and the free TURN relays that would
// carry them are gone; so the relay also listens on public MQTT brokers (web/mq.js), and a player
// whose data channel does not open in a few seconds says hello there too. The relay answers the
// first hello it gets and the player stays on that way.
//
// Quick Match uses a few well-known rooms (QM1, QM2, ...; each site has a prefix of its own, and Fool
// tables an F after it: QMF1, ...): join the first one that is open, or open a free one and wait;
// someone waiting alone in a higher one moves to a lower one. A quick room whose game is on is open
// while a bot there keeps a seat for a player.
import { Brokers, topic } from './mq.js'
import { every } from './clock.js'
import { safeName } from './names.js'

const PREFIX = 'andtargd-csl-v1-'
const QUICK_SLOTS = 8
const ABC = 'ABCDEFGHJKMNPRSTUVWXYZ23456789'
const COLORS = ['#e94f37', '#2f9bff', '#3bb273', '#f6c90e', '#8e5cf7', '#ff8a3d']
const PEERJS = new URL('../vendor/peerjs/peerjs.min.js', import.meta.url).href
// STUN only: it finds the way through ordinary home routers; where it cannot, the brokers carry the
// room. A TURN server of your own (Metered, Cloudflare, coturn) would go here too: { urls, username, credential }.
const ICE = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }] }
const HB_MS = 3000 // pings both ways
const DEAD_MS = 20000 // silent this long: gone (closing a tab is noticed at once anyway)
const BACK_MS = 12000 // after a takeover: how long the others have to come back
const RECOVER_MS = 75000 // the signalling server may hold a vanished relay's id for about a minute
const RTC_ALONE_MS = 2500 // no data channel by then: say hello through the brokers too
const JOIN_MS = 20000
const PROBE_MS = 6000 // a peer of our own to dial with; without one the brokers still get there

const sleep = ms => new Promise(r => setTimeout(r, ms))
const fail = (type, message, extra) => Object.assign(new Error(message || type), { type }, extra)
const json = v => JSON.stringify(v ?? null)
const rid = n => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('')
// Cyrillic letters that look like the Latin ones in a code (a phone's Russian keyboard)
const LOOKALIKE = { А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', У: 'Y', Х: 'X' }
export const cleanCode = s => String(s || '').toUpperCase().replace(/[АВЕКМНОРСТУХ]/g, c => LOOKALIKE[c]).replace(/[^A-Z0-9]/g, '').slice(0, 5)
const randomCode = () => Array.from({ length: 5 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('')
/** A quick room's code in parts: its prefix (the site's, with an F for Fool tables) and its number. */
const quickParts = code => { const m = /^(.*?)(\d+)$/.exec(code || ''); return m ? { Q: m[1], k: +m[2] } : { Q: '', k: 0 } }

const LOAD_MS = 15000 // PeerJS is loaded only when the player goes online
const OPEN_MS = 20000 // the signalling server gives a peer its id
const peerClass = () => globalThis.peerjs?.Peer || globalThis.Peer

let lib = null
function loadPeer() {
  if (peerClass()) return Promise.resolve(peerClass()) // a slow load that came in after all
  lib ||= new Promise((res, rej) => {
    const sc = document.createElement('script')
    let timer = 0
    const done = err => {
      clearTimeout(timer)
      sc.onload = sc.onerror = null
      if (!err && peerClass()) return res(peerClass())
      lib = null
      if (err !== 'late') sc.remove()
      rej(fail('lib', 'PeerJS did not load'))
    }
    sc.src = PEERJS
    sc.onload = () => done(null)
    sc.onerror = () => done('error')
    timer = setTimeout(() => done('late'), LOAD_MS) // kept: if it still loads, the next try finds it
    document.head.appendChild(sc)
  })
  return lib
}

/** A link to the relay (or, at the relay, to one player) through a broker: to the rest of this file it looks like a PeerJS DataConnection. */
class MqLink {
  /** `me`: my id on a player's side (the relay is told who speaks), null on the relay's side. */
  constructor(broker, out, key, me, epoch) {
    this.kind = 'mq'
    this.broker = broker; this.out = out; this.key = key; this.me = me; this.epoch = epoch
    this.open = true
    this.fns = { data: new Set(), close: new Set(), error: new Set() }
  }
  on(e, fn) { this.fns[e]?.add(fn); return this }
  off(e, fn) { this.fns[e]?.delete(fn); return this }
  wrap(o) { return this.me == null ? { k: this.key, ...o } : { f: this.me, k: this.key, ...o } }
  send(m) { if (this.open) this.broker.publish(this.out, this.wrap({ m })) }
  feed(m) { if (this.open) for (const fn of [...this.fns.data]) fn(m) }
  /** Closed at this end: the other end hears of it. */
  close() { if (!this.open) return; this.broker.publish(this.out, this.wrap({ x: 1 })); this.end() }
  /** Closed from the other end, or the broker went away. */
  end() { if (!this.open) return; this.open = false; for (const fn of [...this.fns.close]) fn() }
}

export class Net {
  /** `s` is the session the p0 stand-in keeps: me, players, state, host, and the events it emits. */
  /** `iceRelay`: WebRTC may use relays only, and there are none, so no data channel opens (as behind a strict NAT): ?ice=relay. */
  constructor(s, { quick = 'QM', iceRelay = false } = {}) {
    this.s = s
    this.QUICK = quick
    this.ice = iceRelay ? { ...ICE, iceTransportPolicy: 'relay' } : ICE
    this.mode = 'off' // off | relay | member | recovering
    this.rtcOff = false // no data channels from this tab, only the brokers (the network tests)
    this.gen = 0 // bumped by every attempt, cancel and leave: stale async steps stop
    this.epoch = 0 // bumped whenever this tab starts or stops relaying or being a member: stale links go quiet
    this.peer = null
    this.code = null
    this.quick = false
    this.roster = new Map() // id -> { id, name, color, at }: everyone in the room, `at` is the join order
    this.conns = new Map() // relay: player id -> link (a data channel or a broker link)
    this.heard = new Map() // relay: player id -> when they last said anything
    this.pending = new Map() // relay after a takeover: players not back yet -> since when
    this.up = null // member: the link to the relay
    this.upHeard = 0
    this.seq = 1
    this.lastTick = Date.now()
    this.mergeProbe = null
    this.merging = false
    this.mq = new Brokers()
    this.links = new Map() // broker links of either side: key -> MqLink
    this.served = null // relay: the topic it listens on at the brokers
    this.inbox = null // member: the topic the relay answers on
    this.onRelayMq = (msg, broker) => this.relayMq(msg, broker)
    this.onInbox = (msg, broker) => {
      const l = msg && typeof msg.k === 'string' ? this.links.get(msg.k) : null
      if (!l || l.broker !== broker || l.me == null) return
      if (msg.x) l.end(); else l.feed(msg.m)
    }
    // a player's links through a broker that dropped are gone (the relay's wait for their heartbeats)
    this.mq.onDown(b => { for (const l of [...this.links.values()]) if (l.broker === b && l.me != null) l.end() })
    every(HB_MS, () => this.tick())
    globalThis.document?.addEventListener?.('visibilitychange', () => { if (!document.hidden) this.wake() })
    globalThis.addEventListener?.('online', () => this.wake())
  }
  get online() { return this.mode !== 'off' }
  /** How this tab reaches the room: 'relay' (it holds it), 'rtc', 'mq:<broker>', or null. */
  get via() { return this.mode === 'relay' ? 'relay' : this.up ? (this.up.kind === 'mq' ? 'mq:' + this.up.broker.name : 'rtc') : null }
  /** The room, for the game: `mode` is the one a quick room plays (the link is the site's to give, p0web.js). */
  info(fresh) { return { code: this.code, quick: this.quick, mode: this.quick ? (quickParts(this.code).Q === this.QUICK + 'F' ? 'fool' : 'champion') : null, fresh: !!fresh } }
  /** `q`: the site's quick rooms, so a quick room of another site turns the player away (an old page sends none: GitHub Pages' QM). */
  hello(back) { const m = this.s.me; return { t: 'hello', v: 1, id: m.id, name: m.name, back: !!back, q: this.QUICK } }

  // ---------- what p0.room calls ----------
  send(d, to) {
    if (this.mode === 'relay') this.deliver(this.s.me.id, d, to)
    else if (this.mode === 'member') this.sendConn(this.up, { t: 'msg', to, d })
  }
  set(k, v) {
    if (this.mode === 'relay') this.broadcast({ t: 'set', k, v, from: this.s.me.id })
    else if (this.mode === 'member') this.sendConn(this.up, { t: 'set', k, v })
  }

  // ---------- starting: a new room, a room's code, or Quick Match ----------
  create() {
    return this.run(async gen => {
      for (let i = 0; i < 6; i++) {
        const code = randomCode()
        let p
        try { p = await this.openPeer(code) } catch (e) { if (e.type === 'unavailable-id') continue; throw e }
        if (gen !== this.gen) { p.destroy(); throw fail('cancelled') }
        this.attachRelay(p, code, false, false)
        return code
      }
      throw fail('server-error')
    })
  }
  join(code) {
    return this.run(async gen => {
      this.mq.keep(true) // ready by the time a data channel is late
      const probe = await this.probe(gen)
      try {
        const r = await this.dialRoom(probe, code, false, JOIN_MS, gen)
        if (gen !== this.gen) { try { r.conn.close() } catch { /* gone */ } throw fail('cancelled') }
        this.attachMember(probe, r.conn, r.msg, true)
        return code
      } catch (e) { probe?.destroy(); throw e }
    })
  }
  /** `mode`: Champion and Fool players look for tables of their own. */
  quickMatch(mode = 'champion') {
    return this.run(async gen => {
      const alive = () => { if (gen !== this.gen) throw fail('cancelled') }
      const Q = this.QUICK + (mode === 'fool' ? 'F' : '')
      this.mq.keep(true)
      const probe = await this.openPeer()
      try {
        for (let k = 1; k <= QUICK_SLOTS; k++) {
          alive()
          let r
          try { r = await this.dialRoom(probe, Q + k, false, 6000, gen) } catch (e) { if (e.type === 'cancelled') throw e; continue }
          alive()
          this.attachMember(probe, r.conn, r.msg, true)
          return Q + k
        }
        // no one is waiting: open the first free quick room and wait there
        for (let k = 1; k <= QUICK_SLOTS; k++) {
          alive()
          let p
          try { p = await this.openPeer(Q + k) } catch (e) { if (e.type === 'unavailable-id') continue; throw e }
          if (gen !== this.gen) { p.destroy(); throw fail('cancelled') }
          probe.destroy()
          this.attachRelay(p, Q + k, true, false)
          return Q + k
        }
        throw fail('busy')
      } catch (e) { probe.destroy(); throw e }
    })
  }
  async run(fn) {
    if (this.online) this.leave()
    const gen = ++this.gen
    try { return await fn(gen) } catch (e) { throw gen !== this.gen ? fail('cancelled') : e } finally {
      // an attempt that came to nothing leaves no broker connections behind
      if (this.mode === 'off' && gen === this.gen) this.offline()
    }
  }
  cancel() {
    if (this.online) return
    const gen = ++this.gen
    // the attempt stops within a moment and closes its links (telling the relay); then the brokers go
    setTimeout(() => { if (gen === this.gen && !this.online) this.offline() }, 500)
  }
  /** No room any more: the brokers are closed and their topics forgotten. */
  offline() { this.mq.keep(false); this.inbox = null; this.served = null }

  leave(reason = 'left') {
    if (this.mode === 'off') return
    this.gen++; this.epoch++
    if (this.mode === 'relay') this.broadcast({ t: 'bye' })
    else this.sendConn(this.up, { t: 'bye' })
    const peer = this.peer, probe = this.mergeProbe, gen = this.gen, links = [...this.links.values()]
    this.unserveMq(); this.unInbox()
    setTimeout(() => {
      try { peer?.destroy() } catch { /* gone */ }
      try { probe?.destroy() } catch { /* gone */ }
      for (const l of links) l.end()
      if (this.gen === gen) this.offline()
    }, 250)
    this.mode = 'off'
    this.peer = null; this.up = null; this.mergeProbe = null
    this.conns.clear(); this.heard.clear(); this.pending.clear(); this.roster.clear()
    this.s.roomChanged(null, reason)
    this.code = null
    this.s.reset()
  }
  /**
   * Back to the room this tab was in before a reload: join it as before, or, when no one keeps it any
   * more (I held it alone), open it again with the room's state as it was.
   */
  rejoin(code, quick, state) {
    return this.run(async gen => {
      const alive = () => { if (gen !== this.gen) throw fail('cancelled') }
      this.mq.keep(true)
      const probe = await this.probe(gen)
      const t0 = Date.now()
      try {
        for (;;) {
          alive()
          try {
            const r = await this.dialRoom(probe, code, true, 5000, gen)
            alive()
            this.attachMember(probe, r.conn, r.msg, true)
            return code
          } catch (e) { if (e.type === 'deny' || e.type === 'cancelled') throw e }
          alive()
          // when there are others, one of them takes the room over within a few seconds
          if (Date.now() - t0 > 6000) {
            let p = null
            try { p = await this.openPeer(code) } catch (e) { if (e.type !== 'unavailable-id' && probe) throw e }
            if (p) {
              if (gen !== this.gen) { p.destroy(); throw fail('cancelled') }
              probe?.destroy()
              for (const [k, v] of Object.entries(state && typeof state === 'object' ? state : {})) this.s.applyState(k, v, this.s.me.id)
              this.attachRelay(p, code, quick, false)
              return code
            }
          }
          if (Date.now() - t0 > 30000) throw fail('timeout')
          await sleep(1000)
        }
      } catch (e) { probe?.destroy(); throw e }
    })
  }
  /** The page is closing: say goodbye and free the room's id at once. */
  unload() {
    const peer = this.peer
    this.leave('unload')
    try { peer?.destroy() } catch { /* gone */ }
    this.offline()
  }
  /** The tab is in front again (or the network came back): reconnect what dropped meanwhile. */
  wake() {
    if (this.mode === 'off') return
    const p = this.peer
    if (p && !p.destroyed && p.disconnected) try { p.reconnect() } catch { /* the next disconnect tries again */ }
    this.mq.wake()
    this.tick()
  }

  // ---------- peers and connections ----------
  async openPeer(code) {
    const Peer = await loadPeer()
    return new Promise((res, rej) => {
      const opts = { debug: 0, config: this.ice }
      const p = code ? new Peer(PREFIX + code, opts) : new Peer(opts)
      const onError = e => { clearTimeout(timer); p.off('open', onOpen); try { p.destroy() } catch { /* gone */ } rej(fail(e?.type || 'network', e?.message)) }
      const timer = setTimeout(() => onError({ type: 'network', message: 'the signalling server did not answer' }), OPEN_MS)
      const onOpen = () => {
        clearTimeout(timer)
        p.off('error', onError)
        p.on('error', e => { if (e?.type !== 'peer-unavailable') console.warn('[net]', e?.type, e?.message) })
        // the signalling server dropped us: open links stay up, reconnect for new ones
        p.on('disconnected', () => setTimeout(() => { if (!p.destroyed && p.disconnected) try { p.reconnect() } catch { /* next time */ } }, 1500))
        res(p)
      }
      p.once('open', onOpen)
      p.once('error', onError)
    })
  }
  /** A peer to dial with, or null when there is none in a few seconds (no signalling server, no WebRTC): the brokers still get there. */
  async probe(gen) {
    const pp = this.openPeer()
    const p = await Promise.race([pp, sleep(PROBE_MS).then(() => null)]).catch(() => null)
    if (!p) pp.then(late => late.destroy(), () => { /* never came */ })
    if (gen !== this.gen) { p?.destroy(); throw fail('cancelled') }
    return p
  }
  /** dial(), with a new player id when another tab of this browser had mine (a duplicated tab). */
  async dialRoom(peer, code, back, ms, gen) {
    try { return await this.dial(peer, code, this.hello(back), ms, gen) } catch (e) {
      if (e.type !== 'deny' || e.why !== 'taken' || !this.s.renewId) throw e
      this.s.renewId()
      return this.dial(peer, code, this.hello(back), ms, gen)
    }
  }
  /**
   * Connects to a room and says hello: over a data channel when one opens, and through the brokers
   * too when it has not in a few seconds. Resolves with the link the welcome came by, and the welcome.
   */
  dial(peer, code, hello, ms, gen = this.gen) {
    const pid = PREFIX + code, n = rid(10)
    hello = { ...hello, n }
    return new Promise((res, rej) => {
      const watched = new Map() // link -> [onData, onClose]
      const timers = []
      const later = (fn, t) => timers.push(setTimeout(fn, t))
      const t0 = Date.now()
      let done = false, tries = 0, opened = false, viaMq = false
      const finish = (err, link, msg) => {
        if (done) return
        done = true
        timers.forEach(clearTimeout)
        clearInterval(alive)
        peer?.off('error', onPeerError)
        for (const [l, [d, c]] of watched) {
          l.off('data', d); l.off('close', c); l.off('error', c)
          if (l !== link) try { l.close() } catch { /* gone */ }
        }
        if (err) rej(Object.assign(err, { detail: { rtc: !peer ? 'none' : opened ? 'opened' : tries ? 'failed' : 'none', brokers: this.mq.list.filter(b => b.up).length + '/' + this.mq.list.length } }))
        else res({ conn: link, msg })
      }
      const watch = (l, onClose) => {
        const d = m => {
          if (m?.t === 'welcome' && Array.isArray(m.members)) finish(null, l, m)
          else if (m?.t === 'deny') finish(fail('deny', m.why, { why: String(m.why) }))
        }
        const c = () => { if (watched.delete(l)) onClose?.() }
        watched.set(l, [d, c])
        l.on('data', d); l.on('close', c); l.on('error', c)
      }
      // a data channel, and another one later if it closes without a welcome (the host's page may be back by then)
      const rtc = () => {
        if (done || this.rtcOff || !peer || peer.destroyed || peer.disconnected) return false
        let conn = null
        try { conn = peer.connect(pid, { reliable: true, serialization: 'json' }) } catch { /* no channel */ }
        if (!conn) return false
        tries++
        conn.on('open', () => { opened = true; try { conn.send(hello) } catch { /* it closes */ } })
        watch(conn, () => {
          mq()
          if (!done && tries < 3 && Date.now() - t0 + 5000 < ms) later(rtc, 2000)
        })
        return true
      }
      // the brokers: hello on each one that answers, and again now and then (the relay may be between two connections to it)
      const mq = () => {
        if (viaMq || done) return
        viaMq = true
        this.mq.keep(true)
        this.inbox = topic(code, 'm', this.s.me.id)
        this.mq.list.forEach((b, i) => {
          b.subscribe(this.inbox, this.onInbox).then(ok => {
            if (!ok || done) return
            const l = new MqLink(b, topic(code, 'r'), n + i, this.s.me.id, this.epoch)
            this.links.set(l.key, l)
            l.on('close', () => { if (this.links.get(l.key) === l) this.links.delete(l.key) })
            watch(l)
            const say = () => { if (!done && l.open) { l.send(hello); later(say, 3000) } }
            say()
          }, () => { /* this broker is out of reach */ })
        })
      }
      const onPeerError = e => { if (e?.type === 'peer-unavailable' && String(e.message).includes(pid)) finish(fail('not-found')) }
      const alive = setInterval(() => { if (gen !== this.gen) finish(fail('cancelled')) }, 250)
      peer?.on('error', onPeerError)
      later(() => finish(fail(!opened && viaMq && !this.mq.anyUp ? 'unreachable' : 'timeout')), ms)
      if (rtc()) later(mq, RTC_ALONE_MS); else mq()
    })
  }
  sendConn(c, m) { if (c?.open) try { c.send(m) } catch { /* it closes on its own */ } }
  broadcast(m, except) { for (const [id, c] of this.conns) if (id !== except) this.sendConn(c, m) }

  // ---------- the relay ----------
  attachRelay(peer, code, quick, takeover) {
    const old = this.peer, me = this.s.me
    this.epoch++
    this.mode = 'relay'
    this.peer = peer; this.code = code; this.quick = quick
    this.up = null
    this.unInbox()
    for (const l of [...this.links.values()]) l.end()
    this.conns.clear(); this.heard.clear(); this.pending.clear()
    if (takeover) {
      const now = Date.now()
      for (const id of this.roster.keys()) if (id !== me.id) this.pending.set(id, now)
      this.seq = Math.max(0, ...[...this.roster.values()].map(p => p.at)) + 1
    } else {
      me.color = COLORS[0]
      this.roster = new Map([[me.id, { id: me.id, name: me.name, color: me.color, at: 0 }]])
      this.seq = 1
    }
    peer.on('connection', conn => this.incoming(conn))
    // someone else took the room's id while the signalling server had lost us (we were away): join them
    peer.on('error', e => { if (e?.type === 'unavailable-id' && this.peer === peer && this.mode === 'relay') this.stepDown() })
    if (old && old !== peer) try { old.destroy() } catch { /* gone */ }
    this.serveMq()
    this.s.setHost(me.id)
    this.s.roomChanged(this.info(!takeover))
  }
  /** Listen for players at the brokers too (they come there when no data channel opens for them). */
  serveMq() {
    this.unserveMq()
    this.served = topic(this.code, 'r')
    this.mq.keep(true)
    for (const b of this.mq.list) b.subscribe(this.served, this.onRelayMq).catch(() => { /* it subscribes when it connects */ })
  }
  unserveMq() {
    if (!this.served) return
    for (const b of this.mq.list) b.unsubscribe(this.served)
    this.served = null
    for (const l of [...this.links.values()]) if (l.me == null) l.end()
  }
  unInbox() {
    if (!this.inbox) return
    for (const b of this.mq.list) b.unsubscribe(this.inbox)
    this.inbox = null
  }
  /** A message to the relay through a broker: a new player's hello opens a link for them. */
  relayMq(msg, broker) {
    if (this.mode !== 'relay' || !msg || typeof msg.k !== 'string' || msg.k.length > 24 || !Number.isInteger(msg.f)) return
    let l = this.links.get(msg.k)
    if (l && l.broker !== broker) return // the same hello through another broker
    if (!l) {
      if (msg.x || msg.m?.t !== 'hello') return
      l = new MqLink(broker, topic(this.code, 'm', msg.f), msg.k, null, this.epoch)
      this.links.set(msg.k, l)
      l.on('close', () => { if (this.links.get(l.key) === l) this.links.delete(l.key) })
      this.incoming(l)
    }
    if (msg.x) l.end(); else l.feed(msg.m)
  }
  /** Someone else holds the room's id now (this tab was away and the others took the room over): join them. */
  stepDown() {
    const peer = this.peer, conns = [...this.conns.values()]
    this.mode = 'recovering' // the players stay listed: the new relay's welcome says who is there
    this.unserveMq()
    this.conns.clear(); this.heard.clear(); this.pending.clear()
    for (const c of conns) try { c.close() } catch { /* gone */ }
    this.peer = null
    try { peer?.destroy() } catch { /* gone */ }
    this.recover(++this.gen)
  }
  incoming(conn) {
    const epoch = this.epoch
    let id = null
    const deny = why => { this.sendConn(conn, { t: 'deny', why }); setTimeout(() => { try { conn.close() } catch { /* gone */ } }, 600) }
    conn.on('data', m => {
      if (this.mode !== 'relay' || this.epoch !== epoch) return
      if (id != null) {
        this.heard.set(id, Date.now())
        // a hello again (its welcome went missing): the same answer
        if (m?.t === 'hello') { if (this.conns.get(id) === conn) this.welcome(conn, this.roster.get(id)) } else this.fromMember(id, m)
        return
      }
      if (!m || m.t !== 'hello' || !Number.isInteger(m.id)) { try { conn.close() } catch { /* gone */ } return }
      const prev = this.conns.get(m.id)
      // the same hello by another way (a data channel and a broker): the first one is answered
      if (prev && prev !== conn && m.n && prev.helloN === m.n) { try { conn.close() } catch { /* gone */ } return }
      const known = this.roster.get(m.id)
      if (m.id === this.s.me.id) return deny('taken')
      // a code typed by hand may be another site's quick room: Quick Match players of two sites never meet
      if (this.quick && String(m.q ?? 'QM') !== this.QUICK) return deny('other')
      if (!known && this.roster.size >= (this.quick ? 6 : 12)) return deny('full')
      // a player seated at the table may come back to a quick room that is playing: after a reload, or
      // under a new id (the page was closed) to the seat a bot keeps under their name; and a new player
      // comes in while a bot that started the game keeps a seat for one (the game sits them down). A
      // name is checked here too: a client may send anything, and a rude one gets its same stand-in every time
      const name = safeName(m.name), g = this.s.state.g?.s
      const seated = g?.pl?.some?.(p => p && (p.id === m.id || (p.rb && p.n === name && !this.roster.has(p.id))))
      const kept = g?.ph !== 'over' && g?.pl?.some?.(p => p && p.f && p.b && !p.d)
      if (!known && !seated && !kept && this.quick && this.s.state.lob?.status === 'playing') return deny('playing')
      id = m.id
      conn.helloN = m.n
      // the new link first: closing the old one then drops no one
      this.conns.set(id, conn); this.heard.set(id, Date.now()); this.pending.delete(id)
      if (prev && prev !== conn) try { prev.close() } catch { /* gone */ }
      const p = known || { id, name, color: COLORS[this.seq % COLORS.length], at: this.seq++ }
      this.roster.set(id, p)
      this.welcome(conn, p)
      if (!known) { this.broadcast({ t: 'join', p }, id); this.s.addPlayer(p) }
    })
    const closed = () => { if (id != null && this.mode === 'relay' && this.conns.get(id) === conn) this.drop(id) }
    conn.on('close', closed)
    conn.on('error', closed)
  }
  welcome(conn, p) {
    this.sendConn(conn, { t: 'welcome', code: this.code, quick: this.quick, host: this.s.me.id, you: p, members: [...this.roster.values()], state: this.s.state })
  }
  fromMember(id, m) {
    if (!m || typeof m !== 'object') return
    if (m.t === 'set' && typeof m.k === 'string' && m.k.length <= 32 && json(m.v).length <= 2200) {
      this.s.applyState(m.k, m.v ?? null, id)
      this.broadcast({ t: 'set', k: m.k, v: m.v ?? null, from: id }, id)
    } else if (m.t === 'msg' && json(m.d).length <= 1100) this.deliver(id, m.d, m.to)
    else if (m.t === 'bye') this.drop(id)
  }
  /** A message from `from` to everyone (`to` empty) or to one player. */
  deliver(from, d, to) {
    const me = this.s.me.id
    if (to == null) { if (from !== me) this.s.message(d, from); this.broadcast({ t: 'msg', from, d }, from) }
    else if (to === me) { if (from !== me) this.s.message(d, from) }
    else this.sendConn(this.conns.get(to), { t: 'msg', from, d })
  }
  drop(id) {
    const c = this.conns.get(id)
    this.conns.delete(id); this.heard.delete(id); this.pending.delete(id)
    if (c) try { c.close() } catch { /* gone */ }
    if (!this.roster.delete(id)) return
    this.broadcast({ t: 'leave', id })
    this.s.removePlayer(id)
  }
  /** Waiting alone in a quick room: move to a lower one if someone waits there. */
  async tryMerge() {
    const { Q, k } = quickParts(this.code)
    if (this.merging || !(k > 1) || this.roster.size !== 1 || this.s.state.lob?.status === 'playing') return
    this.merging = true
    const gen = this.gen
    // (a game with bots that started meanwhile keeps me here)
    const still = () => gen === this.gen && this.mode === 'relay' && this.roster.size === 1 && this.s.state.lob?.status !== 'playing'
    try {
      this.mergeProbe ||= await this.openPeer()
      for (let j = 1; j < k && still(); j++) {
        let r
        try { r = await this.dial(this.mergeProbe, Q + j, this.hello(false), 6000, gen) } catch { continue }
        if (!still()) { this.sendConn(r.conn, { t: 'bye' }); setTimeout(() => r.conn.close(), 300); return }
        const probe = this.mergeProbe
        this.mergeProbe = null
        this.attachMember(probe, r.conn, r.msg, true)
        return
      }
    } catch { /* try again on a later tick */ } finally { this.merging = false }
  }

  // ---------- a member ----------
  attachMember(peer, conn, msg, fresh) {
    const s = this.s
    this.epoch++
    if (this.peer && this.peer !== peer) try { this.peer.destroy() } catch { /* gone */ }
    if (this.mergeProbe && this.mergeProbe !== peer) { try { this.mergeProbe.destroy() } catch { /* gone */ } this.mergeProbe = null }
    this.unserveMq()
    this.mode = 'member'
    this.peer = peer; this.code = cleanCode(msg.code); this.quick = !!msg.quick
    this.conns.clear(); this.heard.clear(); this.pending.clear()
    this.up = conn; this.upHeard = Date.now()
    if (conn.kind !== 'mq') this.unInbox()
    conn.on('data', m => { if (this.up === conn) this.fromRelay(m) })
    const lost = () => { if (this.up === conn) this.relayLost() }
    conn.on('close', lost)
    conn.on('error', lost)
    if (msg.you?.color) s.me.color = msg.you.color
    this.roster = new Map(msg.members.filter(p => p && Number.isInteger(p.id)).map(p => [p.id, p]))
    for (const id of [...s.players.keys()]) if (!this.roster.has(id)) s.removePlayer(id)
    for (const p of this.roster.values()) s.addPlayer(p)
    s.setHost(msg.host)
    // the relay's copy of the room's state wins
    const st = msg.state && typeof msg.state === 'object' ? msg.state : {}
    for (const k of Object.keys(s.state)) if (!(k in st)) s.applyState(k, null, msg.host)
    for (const [k, v] of Object.entries(st)) if (json(s.state[k]) !== json(v)) s.applyState(k, v, msg.host)
    s.roomChanged(this.info(fresh))
  }
  fromRelay(m) {
    this.upHeard = Date.now()
    if (!m || typeof m !== 'object') return
    const s = this.s
    if (m.t === 'join' && m.p && Number.isInteger(m.p.id)) { this.roster.set(m.p.id, m.p); s.addPlayer(m.p) }
    else if (m.t === 'leave') { this.roster.delete(m.id); s.removePlayer(m.id) }
    else if (m.t === 'set' && typeof m.k === 'string') s.applyState(m.k, m.v ?? null, m.from)
    else if (m.t === 'msg') s.message(m.d, m.from)
    else if (m.t === 'bye') this.relayLost()
  }
  /** The relay is gone: the oldest of us takes the room's id, the others reconnect to it. */
  relayLost() {
    if (this.mode !== 'member') return
    const conn = this.up
    this.up = null
    try { conn?.close() } catch { /* gone */ }
    this.mode = 'recovering'
    const old = this.s.host
    this.roster.delete(old)
    this.s.removePlayer(old)
    this.recover(++this.gen)
  }
  async recover(gen) {
    const t0 = Date.now()
    const rank = [...this.roster.values()].sort((a, b) => a.at - b.at).findIndex(p => p.id === this.s.me.id)
    await sleep(300 + Math.random() * 400)
    while (gen === this.gen && Date.now() - t0 < RECOVER_MS) {
      // a peer of our own to dial with and to take the room's id with (none after stepping down, or if the signalling server was out of reach)
      if (!this.peer || this.peer.destroyed) {
        const p = await this.openPeer().catch(() => null)
        if (gen !== this.gen) { p?.destroy(); return }
        this.peer = p
      }
      try {
        const r = await this.dial(this.peer, this.code, this.hello(true), 6000, gen)
        if (gen !== this.gen) { try { r.conn.close() } catch { /* gone */ } return }
        this.attachMember(this.peer, r.conn, r.msg, false)
        return
      } catch (e) { if (e.type === 'deny') break; if (e.type === 'cancelled') return }
      if (gen !== this.gen) return
      if (Date.now() - t0 >= rank * 4000) {
        try {
          const p = await this.openPeer(this.code)
          if (gen !== this.gen) { p.destroy(); return }
          this.attachRelay(p, this.code, this.quick, true)
          return
        } catch { /* the old relay still holds the id */ }
      }
      await sleep(1000)
    }
    if (gen === this.gen) this.leave('lost')
  }

  tick() {
    const now = Date.now()
    // timers held back for a while (a frozen tab, a sleeping computer): then only ping, judge no one
    const late = now - this.lastTick > HB_MS * 2.5
    this.lastTick = now
    if (this.mode === 'relay') {
      this.broadcast({ t: 'ping' })
      if (!late) for (const [id, t] of this.heard) if (now - t > DEAD_MS) this.drop(id)
      for (const [id, t] of this.pending) if (now - t > BACK_MS) this.drop(id)
      if (this.quick) this.tryMerge()
    } else if (this.mode === 'member') {
      this.sendConn(this.up, { t: 'ping' })
      if (!late && now - this.upHeard > DEAD_MS) this.relayLost()
    }
  }
}
