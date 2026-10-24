// Task 1 of docs/discord/launch-plan.md: which ways of going online get through Discord's proxy and
// CSP. Not part of the game. Inside Discord every outside address goes through a URL Mapping of the
// app (MAPPINGS below, added in the Developer Portal by hand) and patchUrlMappings rewrites fetch and
// WebSocket to them; outside Discord the same tests use the direct URLs.
//
// A: PeerJS signalling (the id over HTTP, then the WebSocket), B: a WebRTC data channel between two
// players of one channel (the first to come holds the meeting id, the others dial it), C: the public
// MQTT brokers of web/mq.js (connect, an echo of our own message, the other players heard), D: a
// plain WebSocket to an echo server (as our own relay would be).
import { DiscordSDK, patchUrlMappings } from '../vendor/discord/embedded-app-sdk.mjs'
import { Broker, BROKERS, topic } from '../web/mq.js'

const MAPPINGS = [
  { prefix: '/x/peerjs', target: '0.peerjs.com' },
  { prefix: '/x/emqx', target: 'broker.emqx.io:8084' },
  { prefix: '/x/mosq', target: 'test.mosquitto.org:8081' },
  { prefix: '/x/echo', target: 'echo.websocket.org' },
]
const PEERJS = new URL('../vendor/peerjs/peerjs.min.js', import.meta.url).href
const ICE = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }] }
const ECHO = 'wss://echo.websocket.org'
const READY_MS = 10000, OPEN_MS = 15000, DIAL_MS = 20000, WS_MS = 10000, PINGS = 5

const q = new URLSearchParams(location.search)
const inDiscord = q.has('frame_id')
const clientId = q.get('client_id') || (location.hostname.endsWith('.discordsays.com') ? location.hostname.split('.')[0] : '')
const me = Math.random().toString(36).slice(2, 8)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const within = (p, ms, what) => Promise.race([p, sleep(ms).then(() => { throw new Error(what + ': no answer in ' + ms / 1000 + ' s') })])
const safe = s => String(s).replace(/[^A-Za-z0-9]/g, '-').slice(0, 40)
const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null

// ---------- the page ----------
const $ = id => document.getElementById(id)
const env = []
function setEnv(k, v) {
  const at = env.findIndex(e => e[0] === k)
  if (at < 0) env.push([k, String(v)]); else env[at][1] = String(v)
  $('env').tBodies[0].innerHTML = env.map(([a, b]) => `<tr><td>${a}</td><td>${esc(b)}</td></tr>`).join('')
  report()
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const rows = new Map() // id -> { name, state, ms, note, tr }
function row(id, name) {
  const tr = document.createElement('tr')
  $('rows').append(tr)
  const r = { name, state: 'run', ms: '', note: '', tr }
  rows.set(id, r)
  set(id, 'run', '', 'running')
  return r
}
function set(id, state, ms, note) {
  const r = rows.get(id)
  Object.assign(r, { state, ms: ms ?? '', note: note ?? '' })
  const word = { pass: 'ok', fail: 'error', run: '…' }[state]
  r.tr.innerHTML = `<td>${id}</td><td>${esc(r.name)}</td><td class="${state}">${word}</td><td>${r.ms}</td><td class="note">${esc(r.note)}</td>`
  report()
}
const logs = []
function log(line) {
  logs.push(line)
  $('log').textContent = logs.join('\n')
  report()
}
function report() {
  const lines = [...env.map(([a, b]) => `${a}: ${b}`), '', '| # | test | result | ms | notes |', '|---|---|---|---|---|']
  for (const [id, r] of rows) lines.push(`| ${id} | ${r.name} | ${{ pass: 'ok', fail: 'error', run: '…' }[r.state]} | ${r.ms} | ${r.note} |`)
  lines.push('', 'CSP and errors:', ...(logs.length ? logs : ['none']))
  $('report').value = lines.join('\n')
}
document.addEventListener('securitypolicyviolation', e => log(`CSP ${e.effectiveDirective}: ${e.blockedURI || '(inline)'}`))
addEventListener('error', e => log('error: ' + (e.message || e.target?.src || e.type)), true)
addEventListener('unhandledrejection', e => log('rejection: ' + (e.reason?.message || e.reason)))
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText($('report').value) } catch { $('report').select(); document.execCommand('copy') }
}
$('reload').onclick = () => location.reload()

// ---------- Discord ----------
let room = q.get('room') || 'local'
async function discord() {
  setEnv('where', inDiscord ? 'inside Discord, through the URL Mappings' : 'outside Discord, direct URLs')
  setEnv('page', location.origin + location.pathname)
  setEnv('device', `${navigator.userAgent.match(/\(([^)]*)\)/)?.[1] || navigator.userAgent}; network ${navigator.connection?.type || navigator.connection?.effectiveType || '?'}`)
  setEnv('inline script', window.spikeInline ? 'runs' : 'blocked')
  try { localStorage.setItem('spike', '1'); setEnv('localStorage', localStorage.getItem('spike') === '1' ? 'works' : 'reads back wrong'); localStorage.removeItem('spike') } catch (e) { setEnv('localStorage', 'error: ' + e.message) }
  if (!inDiscord) return
  setEnv('client id', clientId || '(none: add ?client_id=)')
  const t0 = performance.now()
  try {
    const sdk = new DiscordSDK(clientId)
    patchUrlMappings(MAPPINGS)
    setEnv('instanceId', sdk.instanceId)
    setEnv('channelId', sdk.channelId)
    setEnv('guildId', sdk.guildId)
    setEnv('platform', sdk.platform)
    room = sdk.instanceId
    await within(sdk.ready(), READY_MS, 'ready()')
    setEnv('ready()', Math.round(performance.now() - t0) + ' ms')
  } catch (e) {
    setEnv('ready()', 'error: ' + e.message)
  }
}

// ---------- A, B: PeerJS and WebRTC ----------
function loadPeerJS() {
  return new Promise((res, rej) => {
    const sc = document.createElement('script')
    sc.src = PEERJS
    sc.onload = () => res(globalThis.peerjs?.Peer || globalThis.Peer)
    sc.onerror = () => rej(new Error('PeerJS did not load'))
    document.head.append(sc)
  })
}
function openPeer(Peer, id) {
  return new Promise((res, rej) => {
    const p = id ? new Peer(id, { debug: 0, config: ICE }) : new Peer({ debug: 0, config: ICE })
    const timer = setTimeout(() => { p.destroy(); rej(new Error('the signalling server did not answer in ' + OPEN_MS / 1000 + ' s')) }, OPEN_MS)
    p.once('open', () => { clearTimeout(timer); res(p) })
    p.once('error', e => { clearTimeout(timer); p.destroy(); rej(e) })
  })
}
/** How the data channel goes: candidate types of the chosen pair (host, srflx, relay) and the protocol. */
async function route(conn) {
  try {
    const st = await conn.peerConnection.getStats()
    let pair
    st.forEach(r => { if (r.type === 'transport' && r.selectedCandidatePairId) pair = st.get(r.selectedCandidatePairId) })
    if (!pair) st.forEach(r => { if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') pair = r })
    if (!pair) return 'route ?'
    const l = st.get(pair.localCandidateId), r = st.get(pair.remoteCandidateId)
    return `route ${l?.candidateType}/${r?.candidateType} ${l?.protocol || ''}`
  } catch { return 'route ?' }
}
/** Pings over an open link; answers the other side's pings too. Resolves with the round trips. */
function pings(send, onData) {
  const rtts = [], waiting = new Map()
  onData(m => {
    if (m?.t === 'ping') send({ t: 'pong', i: m.i })
    else if (m?.t === 'pong' && waiting.has(m.i)) { rtts.push(Math.round(performance.now() - waiting.get(m.i))); waiting.delete(m.i) }
  })
  return (async () => {
    for (let i = 0; i < PINGS; i++) { waiting.set(i, performance.now()); send({ t: 'ping', i }); await sleep(300) }
    await sleep(1500)
    return rtts
  })()
}

async function peers() {
  row('A1', 'PeerJS: id over HTTP (fetch 0.peerjs.com)')
  row('A2', 'PeerJS: signalling WebSocket opens')
  row('B', 'WebRTC data channel to another player here')
  let t0 = performance.now()
  try {
    const r = await within(fetch('https://0.peerjs.com/peerjs/id?ts=' + Date.now() + Math.random()), WS_MS, 'fetch')
    const text = await r.text()
    set('A1', r.ok ? 'pass' : 'fail', Math.round(performance.now() - t0), `HTTP ${r.status}, ${text.slice(0, 40)}`)
  } catch (e) { set('A1', 'fail', Math.round(performance.now() - t0), e.message) }

  let Peer
  try { Peer = await loadPeerJS() } catch (e) { set('A2', 'fail', '', e.message); set('B', 'fail', '', 'no PeerJS'); return }
  const hostId = 'andtargd-cslspike-' + safe(room)
  t0 = performance.now()
  let peer, host = false
  try { peer = await openPeer(Peer, hostId); host = true } catch (e) {
    if (e?.type !== 'unavailable-id') { set('A2', 'fail', Math.round(performance.now() - t0), (e?.type || '') + ' ' + (e?.message || e)); set('B', 'fail', '', 'no signalling'); return }
    try { peer = await openPeer(Peer) } catch (e2) { set('A2', 'fail', Math.round(performance.now() - t0), (e2?.type || '') + ' ' + (e2?.message || e2)); set('B', 'fail', '', 'no signalling'); return }
  }
  set('A2', 'pass', Math.round(performance.now() - t0), host ? 'holds the meeting id (first here)' : 'meeting id taken: dials the first player')
  peer.on('error', e => { if (e?.type !== 'peer-unavailable') log('peerjs: ' + e?.type + ' ' + e?.message) })

  const who = inDiscord ? `${me} ${new URLSearchParams(location.search).get('platform') || ''}`.trim() : me
  if (host) {
    const seen = []
    set('B', 'run', '', 'waiting for another player: open the activity on a second device in this channel')
    peer.on('connection', conn => {
      const at = performance.now()
      conn.on('open', async () => {
        const opened = Math.round(performance.now() - at)
        const handlers = []
        conn.on('data', m => handlers.forEach(h => h(m)))
        conn.send({ t: 'who', who })
        let them = conn.peer.slice(0, 6)
        handlers.push(m => { if (m?.t === 'who') them = m.who })
        const rtts = await pings(m => conn.send(m), h => handlers.push(h))
        seen.push(`${them}: ${rtts.length}/${PINGS} pings, rtt ${avg(rtts)} ms, ${await route(conn)}`)
        set('B', rtts.length ? 'pass' : 'fail', opened, seen.join('; '))
      })
    })
    return
  }
  t0 = performance.now()
  const conn = peer.connect(hostId, { reliable: true })
  try {
    await within(new Promise((res, rej) => { conn.on('open', res); conn.on('error', rej) }), DIAL_MS, 'data channel')
  } catch (e) { set('B', 'fail', Math.round(performance.now() - t0), e.message + ' (strict NAT, or WebRTC blocked here)'); return }
  const opened = Math.round(performance.now() - t0)
  const handlers = []
  conn.on('data', m => handlers.forEach(h => h(m)))
  let them = 'first player'
  handlers.push(m => { if (m?.t === 'who') them = m.who })
  conn.send({ t: 'who', who })
  const rtts = await pings(m => conn.send(m), h => handlers.push(h))
  set('B', rtts.length ? 'pass' : 'fail', opened, `opened in ${opened} ms with ${them}; ${rtts.length}/${PINGS} pings, rtt ${avg(rtts)} ms, ${await route(conn)}`)
}

// ---------- C: MQTT brokers ----------
async function broker(url, id) {
  const name = new URL(url).hostname
  row(id, `MQTT ${name}`)
  const b = new Broker(url)
  const t0 = performance.now()
  try { await b.connect() } catch (e) { set(id, 'fail', Math.round(performance.now() - t0), e.message); return }
  b.want = true // reconnect when it drops, as in a room
  const connected = Math.round(performance.now() - t0)
  const mine = topic('spike', safe(room), me), all = topic('spike', safe(room), 'all')
  const sent = new Map(), rtts = [], others = new Map()
  const okMine = await b.subscribe(mine, m => { if (sent.has(m?.i)) rtts.push(Math.round(performance.now() - sent.get(m.i))) })
  const okAll = await b.subscribe(all, m => { if (m?.from && m.from !== me) others.set(m.from, Date.now()) })
  if (!okMine || !okAll) { set(id, 'fail', connected, 'connected, but the subscription was refused'); return }
  for (let i = 0; i < 3; i++) { sent.set(i, performance.now()); b.publish(mine, { i }); await sleep(200) }
  await sleep(1500)
  const show = () => {
    const live = [...others].filter(([, at]) => Date.now() - at < 10000).map(([k]) => k)
    set(id, rtts.length ? 'pass' : 'fail', connected, `connect ${connected} ms, echo ${rtts.length}/3 rtt ${avg(rtts)} ms; other players heard: ${live.length ? live.join(', ') : 'none yet'}${b.up ? '' : '; connection dropped'}`)
  }
  show()
  setInterval(() => { b.publish(all, { from: me }); show() }, 3000)
  b.publish(all, { from: me })
}

// ---------- D: a plain WebSocket ----------
async function echo() {
  row('D', 'WebSocket to an echo server (echo.websocket.org)')
  const t0 = performance.now()
  let ws
  try {
    ws = new WebSocket(ECHO)
    await within(new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('the WebSocket failed')); ws.onclose = e => rej(new Error('closed, code ' + e.code)) }), WS_MS, 'WebSocket')
  } catch (e) { set('D', 'fail', Math.round(performance.now() - t0), e.message + `; url ${ws?.url || ECHO}`); return }
  const opened = Math.round(performance.now() - t0)
  ws.onerror = ws.onclose = null
  const handlers = []
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data) } catch { return } handlers.forEach(h => h(m)) }
  const sent = new Map(), rtts = []
  handlers.push(m => { if (m?.t === 'echo' && sent.has(m.i)) rtts.push(Math.round(performance.now() - sent.get(m.i))) })
  for (let i = 0; i < PINGS; i++) { sent.set(i, performance.now()); ws.send(JSON.stringify({ t: 'echo', i })); await sleep(200) }
  await sleep(1500)
  set('D', rtts.length ? 'pass' : 'fail', opened, `open ${opened} ms via ${ws.url}; ${rtts.length}/${PINGS} echoes, rtt ${avg(rtts)} ms`)
  ws.close()
}

await discord()
setEnv('room', room)
setEnv('URL Mappings', MAPPINGS.map(m => `${m.prefix} -> ${m.target}`).join(', '))
await Promise.all([peers(), ...BROKERS.map((u, i) => broker(u, 'C' + (i + 1))), echo()])
