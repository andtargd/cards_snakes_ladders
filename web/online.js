// The web build's Play Online dialog: a name, then Quick Match, a new room or a room's code.
import { cleanCode } from './net.js'
import { cleanName, isClean, randomName, MAX_NAME } from './names.js'

const NAME_KEY = 'csl-name'
const load = k => { try { return localStorage.getItem(k) } catch { return null } }
const save = (k, v) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }

function messageFor(e) {
  switch (e?.type) {
    case 'not-found': return 'There is no room with this code. Check it, or create a new room.'
    case 'deny': return e.why === 'full' ? 'That room is full.' : e.why === 'playing' ? 'That table has just started. Try again.' : 'Could not join that room.'
    case 'timeout': case 'closed': return 'The room did not answer. Its host should keep the game open on screen (on a phone too), then try again.'
    case 'unreachable': return 'Could not get through to the room from this network. Try another connection (Wi-Fi or mobile data), or without a VPN.'
    case 'busy': return 'All quick tables are busy right now. Create a room instead.'
    case 'browser-incompatible': return 'This browser cannot open rooms (WebRTC is turned off). You can still join a friend\'s room with its code.'
    case 'lib': return 'Online play could not load. Check your connection (or an ad blocker) and try again.'
    default: return 'Could not reach the game server. Check your connection and try again.'
  }
}
/** What the attempt saw, small under the message: for telling someone what went wrong. */
function detailFor(e) {
  const d = e?.detail, ways = d && (e.type === 'timeout' || e.type === 'unreachable') // what got through, where it matters
  return [e?.type, ways && `direct ${d.rtc}`, ways && `relay servers ${d.brokers}`].filter(Boolean).join(' · ')
}

/**
 * `links()`: whether rooms get links here (else Create a Room gives only a code). `siteName()`: the
 * site's own name for the player, or null; with one there is no name field.
 */
export function onlineDialog({ net, me, links = () => true, siteName = () => null }) {
  const el = document.createElement('div')
  el.className = 'ol'
  el.hidden = true
  el.innerHTML = `
  <div class="ol-card" role="dialog" aria-modal="true" aria-labelledby="ol-title">
    <button class="ol-x" type="button" aria-label="Close">✕</button>
    <h2 id="ol-title">Play Online</h2>
    <p class="ol-invite" hidden></p>
    <div class="ol-name">
      <label class="ol-label" for="ol-name">Your name</label>
      <div class="ol-name-row">
        <input id="ol-name" class="ol-input" maxlength="${MAX_NAME}" autocomplete="nickname" spellcheck="false" placeholder="Your name">
        <button class="ol-btn ol-dice" type="button" aria-label="Another random name" title="Another random name"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="#fff" stroke="currentColor" stroke-width="2"/><g fill="currentColor"><circle cx="8" cy="8" r="1.8"/><circle cx="16" cy="8" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="8" cy="16" r="1.8"/><circle cx="16" cy="16" r="1.8"/></g></svg></button>
      </div>
      <div class="ol-name-note" aria-live="polite"></div>
    </div>
    <p class="ol-as" hidden></p>
    <div class="ol-choices">
      <div class="ol-choice"><button class="ol-btn ol-orange" type="button" data-act="quick">Quick Match</button><span>Sit down with players looking for a game</span></div>
      <div class="ol-choice"><button class="ol-btn ol-navy" type="button" data-act="create">Create a Room</button><span class="ol-create-sub"></span></div>
    </div>
    <div class="ol-or"><span>or join with a code</span></div>
    <form class="ol-join" autocomplete="off">
      <input id="ol-code" class="ol-input ol-code" maxlength="5" spellcheck="false" autocapitalize="characters" placeholder="CODE" aria-label="Room code">
      <button class="ol-btn" type="submit" data-act="join">Join</button>
    </form>
    <div class="ol-status" role="status" aria-live="polite"></div>
    <div class="ol-detail"></div>
    <button class="ol-btn ol-cancel" type="button" hidden>Cancel</button>
  </div>`
  document.body.appendChild(el)
  const $ = s => el.querySelector(s)
  const nameIn = $('#ol-name'), nameNote = $('.ol-name-note'), codeIn = $('#ol-code'), status = $('.ol-status'), detail = $('.ol-detail'), cancelBtn = $('.ol-cancel'), inviteEl = $('.ol-invite')
  nameIn.value = load(NAME_KEY) || ''
  let busy = false

  function setBusy(text) {
    busy = !!text
    el.classList.toggle('busy', busy)
    for (const c of el.querySelectorAll('input, .ol-btn:not(.ol-cancel), .ol-x')) c.disabled = busy
    status.textContent = text || ''
    status.classList.remove('err')
    detail.textContent = ''
    cancelBtn.hidden = !busy
  }
  /** The typed name, or a random one in place of an empty or rude one (said quietly under the field). */
  function checkName() {
    const n = cleanName(nameIn.value)
    if (n && !isClean(n)) { nameIn.value = randomName(); nameNote.textContent = 'That name is not allowed here, so you got a random one.' }
    else nameIn.value = n || randomName()
    return nameIn.value
  }
  function applyName() {
    if (siteName()) { me.name = siteName(); return }
    const n = checkName()
    me.name = n
    save(NAME_KEY, n)
  }
  async function go(text, fn) {
    if (busy) return
    applyName()
    setBusy(text)
    try {
      await fn()
      setBusy(null)
      close()
    } catch (e) {
      if (e?.type === 'cancelled') return
      console.warn('[online]', e)
      setBusy(null)
      status.textContent = messageFor(e)
      status.classList.add('err')
      detail.textContent = detailFor(e)
    }
  }
  function join() {
    const code = cleanCode(codeIn.value)
    codeIn.value = code
    if (code.length < 3) { status.textContent = 'Type the room code your friend sent you.'; status.classList.add('err'); detail.textContent = ''; codeIn.focus(); return }
    go(`Joining room ${code}…`, () => net.join(code))
  }

  $('[data-act=quick]').onclick = () => go('Looking for a table…', () => net.quickMatch())
  $('[data-act=create]').onclick = () => go('Opening a room…', () => net.create())
  $('.ol-join').onsubmit = e => { e.preventDefault(); join() }
  codeIn.oninput = () => { const v = cleanCode(codeIn.value); if (v !== codeIn.value) codeIn.value = v }
  // a non-Latin keyboard layout (Russian, say): the key's place gives the Latin letter on it
  codeIn.addEventListener('keydown', e => {
    const m = /^Key([A-Z])$/.exec(e.code || '')
    if (!m || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || /[A-Za-z0-9]/.test(e.key)) return
    e.preventDefault()
    const a = codeIn.selectionStart ?? codeIn.value.length, b = codeIn.selectionEnd ?? a
    codeIn.value = cleanCode(codeIn.value.slice(0, a) + m[1] + codeIn.value.slice(b))
    const at = Math.min(a + 1, codeIn.value.length)
    try { codeIn.setSelectionRange(at, at) } catch { /* fine */ }
  })
  nameIn.addEventListener('change', checkName)
  nameIn.addEventListener('input', () => { nameNote.textContent = '' })
  $('.ol-dice').onclick = () => { nameIn.value = randomName(); nameNote.textContent = ''; nameIn.focus() }
  cancelBtn.onclick = () => { net.cancel(); setBusy(null) }
  $('.ol-x').onclick = () => close()
  el.addEventListener('pointerdown', e => { if (e.target === el && !busy) close() })
  el.addEventListener('keydown', e => { if (e.key === 'Escape' && !busy) close() })

  /** Coming back to a room after a reload: the dialog shows how it goes, and the choices if it fails. */
  function resume(code, fn) {
    open({ code })
    go(`Coming back to room ${cleanCode(code)}…`, fn)
  }
  function open({ code } = {}) {
    setBusy(null)
    $('.ol-create-sub').textContent = links() ? 'Get a code and a link to send to friends' : 'Get a room code to send to friends'
    inviteEl.hidden = !code
    el.classList.toggle('invited', !!code)
    if (code) { codeIn.value = cleanCode(code); inviteEl.textContent = `You are invited to room ${codeIn.value}` }
    const site = siteName()
    $('.ol-name').hidden = !!site
    $('.ol-as').hidden = !site
    $('.ol-as').textContent = site ? `Playing as ${site}` : ''
    if (!site) { nameNote.textContent = ''; checkName() } // an empty field gets a random name
    el.hidden = false
    requestAnimationFrame(() => (code ? $('[data-act=join]') : $('[data-act=quick]')).focus())
  }
  function close() {
    if (busy) return
    el.hidden = true
    document.getElementById('c')?.focus()
  }
  return { open, close, resume, get isOpen() { return !el.hidden } }
}

/**
 * Send friends the way into the room: its link where there is one (the share sheet on phones, the
 * clipboard elsewhere), else just its code, which they type into Play Online.
 * 'shared' | 'copied' | 'cancelled' | 'failed' | 'none'
 */
export async function shareRoom(room) {
  if (!room) return 'none'
  const text = room.link ? `Join my table in Cards, Snakes & Ladders: room ${room.code}` : `Join my table in Cards, Snakes & Ladders: Play Online, room code ${room.code}`
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share(room.link ? { title: 'Cards, Snakes & Ladders', text, url: room.link } : { title: 'Cards, Snakes & Ladders', text }); return 'shared' } catch (e) { if (e?.name === 'AbortError') return 'cancelled' }
  }
  // only the code goes on the clipboard: it fits the code field as it is
  return (await copyText(room.link || room.code)) ? 'copied' : 'failed'
}

async function copyText(s) {
  try { await navigator.clipboard.writeText(s); return true } catch { /* try the old way */ }
  const ta = document.createElement('textarea')
  ta.value = s
  ta.style.cssText = 'position:fixed;opacity:0;left:0;top:0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { /* no clipboard */ }
  ta.remove()
  return ok
}
