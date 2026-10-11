// Online rooms for the web build, over WebRTC data channels (PeerJS and its free signalling and
// TURN servers, so GitHub Pages needs no server of its own). A room is a peer id: one browser
// holds it and relays for everyone else (a star), and that browser is also p0's room host.
// When it leaves, the oldest remaining player takes the room's id over and the rest reconnect,
// so a game goes on (the game itself hands the leaver's seat to a bot).
//
// Quick Match uses a few well-known rooms (QM1, QM2, ...): join the first one that is open,
// or open a free one and wait; someone waiting alone in a higher one moves to a lower one.

const PREFIX = 'andtargd-csl-v1-'
const QUICK = 'QM'
const QUICK_SLOTS = 8
const ABC = 'ABCDEFGHJKMNPRSTUVWXYZ23456789'
const COLORS = ['#e94f37', '#2f9bff', '#3bb273', '#f6c90e', '#8e5cf7', '#ff8a3d']
const PEERJS = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'
const HB_MS = 3000 // pings both ways
const DEAD_MS = 20000 // silent this long: gone (closing a tab is noticed at once anyway)
const BACK_MS = 12000 // after a takeover: how long the others have to come back
const RECOVER_MS = 75000 // the signalling server may hold a vanished relay's id for about a minute

const sleep = ms => new Promise(r => setTimeout(r, ms))
const fail = (type, message, extra) => Object.assign(new Error(message || type), { type }, extra)
const json = v => JSON.stringify(v ?? null)
export const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)
export const cleanName = s => String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14)
const randomCode = () => Array.from({ length: 5 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('')
const linkFor = code => location.origin + location.pathname + '?room=' + code

let lib = null
function loadPeer() {
  lib ||= new Promise((res, rej) => {
    const sc = document.createElement('script')
    sc.src = PEERJS
    sc.onload = () => { const P = globalThis.peerjs?.Peer || globalThis.Peer; if (P) res(P); else { lib = null; rej(fail('network')) } }
    sc.onerror = () => { lib = null; sc.remove(); rej(fail('network', 'PeerJS did not load')) }
    document.head.appendChild(sc)
  })
  return lib
}

export class Net {
  /** `s` is the session the p0 stand-in keeps: me, players, state, host, and the events it emits. */
  constructor(s) {
    this.s = s
    this.mode = 'off' // off | relay | member | recovering
    this.gen = 0 // bumped by every attempt, cancel and leave: stale async steps stop
    this.peer = null
    this.code = null
    this.quick = false
    this.roster = new Map() // id -> { id, name, color, at }: everyone in the room, `at` is the join order
    this.conns = new Map() // relay: player id -> connection
    this.heard = new Map() // relay: player id -> when they last said anything
    this.pending = new Map() // relay after a takeover: players not back yet -> since when
    this.up = null // member: the connection to the relay
    this.upHeard = 0
    this.seq = 1
    this.lastTick = Date.now()
    this.mergeProbe = null
    this.merging = false
    setInterval(() => this.tick(), HB_MS)
  }
  get online() { return this.mode !== 'off' }
  info(fresh) { return { code: this.code, quick: this.quick, link: linkFor(this.code), fresh: !!fresh } }
  hello(back) { const m = this.s.me; return { t: 'hello', v: 1, id: m.id, name: m.name, back: !!back } }

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
      const probe = await this.openPeer()
      try {
        const r = await this.dial(probe, code, this.hello(false), 10000)
        if (gen !== this.gen) throw fail('cancelled')
        this.attachMember(probe, r.conn, r.msg, true)
        return code
      } catch (e) { probe.destroy(); throw e }
    })
  }
  quickMatch() {
    return this.run(async gen => {
      const alive = () => { if (gen !== this.gen) throw fail('cancelled') }
      const probe = await this.openPeer()
      try {
        for (let k = 1; k <= QUICK_SLOTS; k++) {
          alive()
          let r
          try { r = await this.dial(probe, QUICK + k, this.hello(false), 6000) } catch { continue }
          alive()
          this.attachMember(probe, r.conn, r.msg, true)
          return QUICK + k
        }
        // no one is waiting: open the first free quick room and wait there
        for (let k = 1; k <= QUICK_SLOTS; k++) {
          alive()
          let p
          try { p = await this.openPeer(QUICK + k) } catch (e) { if (e.type === 'unavailable-id') continue; throw e }
          if (gen !== this.gen) { p.destroy(); throw fail('cancelled') }
          probe.destroy()
          this.attachRelay(p, QUICK + k, true, false)
          return QUICK + k
        }
        throw fail('busy')
      } catch (e) { probe.destroy(); throw e }
    })
  }
  async run(fn) {
    if (this.online) this.leave()
    const gen = ++this.gen
    try { return await fn(gen) } catch (e) { throw gen !== this.gen ? fail('cancelled') : e }
  }
  cancel() { if (!this.online) this.gen++ }

  leave(reason = 'left') {
    if (this.mode === 'off') return
    this.gen++
    if (this.mode === 'relay') this.broadcast({ t: 'bye' })
    else this.sendConn(this.up, { t: 'bye' })
    const peer = this.peer, probe = this.mergeProbe
    setTimeout(() => { try { peer?.destroy() } catch { /* gone */ } try { probe?.destroy() } catch { /* gone */ } }, 250)
    this.mode = 'off'
    this.peer = null; this.up = null; this.mergeProbe = null
    this.conns.clear(); this.heard.clear(); this.pending.clear(); this.roster.clear()
    this.s.roomChanged(null, reason)
    this.code = null
    this.s.reset()
  }
  /** The page is closing: say goodbye and free the room's id at once. */
  unload() {
    const peer = this.peer
    this.leave()
    try { peer?.destroy() } catch { /* gone */ }
  }

  // ---------- peers and connections ----------
  async openPeer(code) {
    const Peer = await loadPeer()
    return new Promise((res, rej) => {
      const p = code ? new Peer(PREFIX + code, { debug: 0 }) : new Peer({ debug: 0 })
      const onError = e => { p.off('open', onOpen); try { p.destroy() } catch { /* gone */ } rej(fail(e?.type || 'network', e?.message)) }
      const onOpen = () => {
        p.off('error', onError)
        p.on('error', e => { if (e?.type !== 'peer-unavailable') console.warn('[net]', e?.type, e?.message) })
        // the signalling server dropped us: open data channels stay up, reconnect for new ones
        p.on('disconnected', () => setTimeout(() => { if (!p.destroyed && p.disconnected) try { p.reconnect() } catch { /* next time */ } }, 1500))
        res(p)
      }
      p.once('open', onOpen)
      p.once('error', onError)
    })
  }
  /** Connect to a room and say hello: resolves with the connection and the welcome. */
  dial(peer, code, hello, ms) {
    const pid = PREFIX + code
    const conn = peer.connect(pid, { reliable: true, serialization: 'json' })
    return new Promise((res, rej) => {
      let done = false
      const finish = (err, val) => {
        if (done) return
        done = true
        clearTimeout(timer)
        peer.off('error', onPeerError)
        conn.off('data', onData); conn.off('close', onClose); conn.off('error', onClose)
        if (err) { try { conn.close() } catch { /* gone */ } rej(err) } else res(val)
      }
      const onPeerError = e => { if (e?.type === 'peer-unavailable' && String(e.message).includes(pid)) finish(fail('not-found')) }
      const onData = m => {
        if (m?.t === 'welcome' && Array.isArray(m.members)) finish(null, { conn, msg: m })
        else if (m?.t === 'deny') finish(fail('deny', m.why, { why: String(m.why) }))
      }
      const onClose = () => finish(fail('closed'))
      const timer = setTimeout(() => finish(fail('timeout')), ms)
      peer.on('error', onPeerError)
      conn.on('open', () => { try { conn.send(hello) } catch { finish(fail('closed')) } })
      conn.on('data', onData); conn.on('close', onClose); conn.on('error', onClose)
    })
  }
  sendConn(c, m) { if (c?.open) try { c.send(m) } catch { /* it closes on its own */ } }
  broadcast(m, except) { for (const [id, c] of this.conns) if (id !== except) this.sendConn(c, m) }

  // ---------- the relay ----------
  attachRelay(peer, code, quick, takeover) {
    const old = this.peer, me = this.s.me
    this.mode = 'relay'
    this.peer = peer; this.code = code; this.quick = quick
    this.up = null
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
    if (old && old !== peer) try { old.destroy() } catch { /* gone */ }
    this.s.setHost(me.id)
    this.s.roomChanged(this.info(!takeover))
  }
  incoming(conn) {
    let id = null
    const deny = why => { this.sendConn(conn, { t: 'deny', why }); setTimeout(() => { try { conn.close() } catch { /* gone */ } }, 600) }
    conn.on('data', m => {
      if (this.mode !== 'relay' || this.peer !== conn.provider) return
      if (id != null) { this.heard.set(id, Date.now()); this.fromMember(id, m); return }
      if (!m || m.t !== 'hello' || !Number.isInteger(m.id)) { try { conn.close() } catch { /* gone */ } return }
      const known = this.roster.get(m.id)
      if (m.id === this.s.me.id) return deny('taken')
      if (!known && this.roster.size >= (this.quick ? 6 : 12)) return deny('full')
      if (!known && this.quick && this.s.state.lob?.status === 'playing') return deny('playing')
      id = m.id
      const prev = this.conns.get(id)
      if (prev && prev !== conn) try { prev.close() } catch { /* gone */ }
      this.conns.set(id, conn); this.heard.set(id, Date.now()); this.pending.delete(id)
      const p = known || { id, name: cleanName(m.name) || 'Player', color: COLORS[this.seq % COLORS.length], at: this.seq++ }
      this.roster.set(id, p)
      this.sendConn(conn, { t: 'welcome', code: this.code, quick: this.quick, host: this.s.me.id, you: p, members: [...this.roster.values()], state: this.s.state })
      if (!known) { this.broadcast({ t: 'join', p }, id); this.s.addPlayer(p) }
    })
    const closed = () => { if (id != null && this.conns.get(id) === conn) this.drop(id) }
    conn.on('close', closed)
    conn.on('error', closed)
  }
  fromMember(id, m) {
    if (!m || typeof m !== 'object') return
    if (m.t === 'ping') this.sendConn(this.conns.get(id), { t: 'pong' })
    else if (m.t === 'set' && typeof m.k === 'string' && m.k.length <= 32 && json(m.v).length <= 2200) {
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
    const k = +this.code.slice(QUICK.length)
    if (this.merging || !(k > 1) || this.roster.size !== 1 || this.s.state.lob?.status === 'playing') return
    this.merging = true
    const gen = this.gen
    const still = () => gen === this.gen && this.mode === 'relay' && this.roster.size === 1
    try {
      this.mergeProbe ||= await this.openPeer()
      for (let j = 1; j < k && still(); j++) {
        let r
        try { r = await this.dial(this.mergeProbe, QUICK + j, this.hello(false), 6000) } catch { continue }
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
    if (this.peer && this.peer !== peer) try { this.peer.destroy() } catch { /* gone */ }
    if (this.mergeProbe && this.mergeProbe !== peer) { try { this.mergeProbe.destroy() } catch { /* gone */ } this.mergeProbe = null }
    this.mode = 'member'
    this.peer = peer; this.code = cleanCode(msg.code); this.quick = !!msg.quick
    this.conns.clear(); this.heard.clear(); this.pending.clear()
    this.up = conn; this.upHeard = Date.now()
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
    if (m.t === 'ping') this.sendConn(this.up, { t: 'pong' })
    else if (m.t === 'join' && m.p && Number.isInteger(m.p.id)) { this.roster.set(m.p.id, m.p); s.addPlayer(m.p) }
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
      try {
        const r = await this.dial(this.peer, this.code, this.hello(true), 5000)
        if (gen !== this.gen) { try { r.conn.close() } catch { /* gone */ } return }
        this.attachMember(this.peer, r.conn, r.msg, false)
        return
      } catch (e) { if (e.type === 'deny') break }
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
    // a hidden tab's timers can be held back for a minute: then only ping, judge no one
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
