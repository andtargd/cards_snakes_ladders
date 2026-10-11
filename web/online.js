// The web build's Play Online dialog: a name, then Quick Match, a new room or a room's code.
import { cleanCode, cleanName } from './net.js'

const NAME_KEY = 'csl-name'
const load = k => { try { return localStorage.getItem(k) } catch { return null } }
const save = (k, v) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }

function messageFor(e) {
  switch (e?.type) {
    case 'not-found': return 'There is no room with this code. Check it, or create a new room.'
    case 'deny': return e.why === 'full' ? 'That room is full.' : e.why === 'playing' ? 'That table has just started. Try again.' : 'Could not join that room.'
    case 'timeout': case 'closed': return 'The room did not answer. Try again in a moment.'
    case 'busy': return 'All quick tables are busy right now. Create a room instead.'
    case 'browser-incompatible': return 'This browser cannot play online (WebRTC is turned off).'
    default: return 'Could not reach the game server. Check your connection and try again.'
  }
}

export function onlineDialog({ net, me }) {
  const el = document.createElement('div')
  el.className = 'ol'
  el.hidden = true
  el.innerHTML = `
  <div class="ol-card" role="dialog" aria-modal="true" aria-labelledby="ol-title">
    <button class="ol-x" type="button" aria-label="Close">✕</button>
    <h2 id="ol-title">Play Online</h2>
    <p class="ol-invite" hidden></p>
    <label class="ol-label" for="ol-name">Your name</label>
    <input id="ol-name" class="ol-input" maxlength="14" autocomplete="nickname" spellcheck="false" placeholder="Your name">
    <div class="ol-choices">
      <div class="ol-choice"><button class="ol-btn ol-orange" type="button" data-act="quick">Quick Match</button><span>Sit down with players looking for a game</span></div>
      <div class="ol-choice"><button class="ol-btn ol-navy" type="button" data-act="create">Create a Room</button><span>Get a code and a link to send to friends</span></div>
    </div>
    <div class="ol-or"><span>or join with a code</span></div>
    <form class="ol-join" autocomplete="off">
      <input id="ol-code" class="ol-input ol-code" maxlength="5" spellcheck="false" autocapitalize="characters" placeholder="CODE" aria-label="Room code">
      <button class="ol-btn" type="submit" data-act="join">Join</button>
    </form>
    <div class="ol-status" role="status" aria-live="polite"></div>
    <button class="ol-btn ol-cancel" type="button" hidden>Cancel</button>
  </div>`
  document.body.appendChild(el)
  const $ = s => el.querySelector(s)
  const nameIn = $('#ol-name'), codeIn = $('#ol-code'), status = $('.ol-status'), cancelBtn = $('.ol-cancel'), inviteEl = $('.ol-invite')
  nameIn.value = load(NAME_KEY) || ''
  let busy = false

  function setBusy(text) {
    busy = !!text
    el.classList.toggle('busy', busy)
    for (const c of el.querySelectorAll('input, .ol-btn:not(.ol-cancel), .ol-x')) c.disabled = busy
    status.textContent = text || ''
    status.classList.remove('err')
    cancelBtn.hidden = !busy
  }
  function applyName() {
    const n = cleanName(nameIn.value) || 'Player ' + (10 + Math.floor(Math.random() * 90))
    nameIn.value = n
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
    }
  }
  function join() {
    const code = cleanCode(codeIn.value)
    codeIn.value = code
    if (code.length < 3) { status.textContent = 'Type the room code your friend sent you.'; status.classList.add('err'); codeIn.focus(); return }
    go(`Joining room ${code}…`, () => net.join(code))
  }

  $('[data-act=quick]').onclick = () => go('Looking for a table…', () => net.quickMatch())
  $('[data-act=create]').onclick = () => go('Opening a room…', () => net.create())
  $('.ol-join').onsubmit = e => { e.preventDefault(); join() }
  codeIn.oninput = () => { const v = cleanCode(codeIn.value); if (v !== codeIn.value) codeIn.value = v }
  cancelBtn.onclick = () => { net.cancel(); setBusy(null) }
  $('.ol-x').onclick = () => close()
  el.addEventListener('pointerdown', e => { if (e.target === el && !busy) close() })
  el.addEventListener('keydown', e => { if (e.key === 'Escape' && !busy) close() })

  function open({ code } = {}) {
    setBusy(null)
    inviteEl.hidden = !code
    el.classList.toggle('invited', !!code)
    if (code) { codeIn.value = cleanCode(code); inviteEl.textContent = `You are invited to room ${codeIn.value}` }
    el.hidden = false
    requestAnimationFrame(() => (code ? $('[data-act=join]') : nameIn.value ? $('[data-act=quick]') : nameIn).focus())
  }
  function close() {
    if (busy) return
    el.hidden = true
    document.getElementById('c')?.focus()
  }
  return { open, close, get isOpen() { return !el.hidden } }
}

/** Send the room's link: the share sheet on phones, the clipboard elsewhere. */
export async function shareRoom(room) {
  if (!room) return 'none'
  const text = `Join my table in Cards, Snakes & Ladders: room ${room.code}`
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title: 'Cards, Snakes & Ladders', text, url: room.link }); return 'shared' } catch (e) { if (e?.name === 'AbortError') return 'cancelled' }
  }
  try { await navigator.clipboard.writeText(room.link); return 'copied' } catch { /* try the old way */ }
  const ta = document.createElement('textarea')
  ta.value = room.link
  ta.style.cssText = 'position:fixed;opacity:0;left:0;top:0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { /* no clipboard */ }
  ta.remove()
  return ok ? 'copied' : 'failed'
}
