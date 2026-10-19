// The web build's online play behind the game's Online screen: the player's name, then Quick Match, a
// new room or a room's code, and how each attempt goes (what it is doing, or what went wrong) for the
// game to show. The game draws all of it; this only runs it (p0web.js hands it over as p0.web).
import { cleanCode } from './net.js'
import { cleanName, isClean, randomName } from './names.js'

const NAME_KEY = 'csl-name'
const load = k => { try { return localStorage.getItem(k) } catch { return null } }
const save = (k, v) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }

function messageFor(e) {
  switch (e?.type) {
    case 'not-found': return 'There is no room with this code. Check it, or create a new room.'
    case 'deny': return e.why === 'full' ? 'That room is full.' : e.why === 'playing' ? 'That table has just started. Try again.' : e.why === 'other' ? 'That is a Quick Match table of another site. Use Quick Match here instead.' : 'Could not join that room.'
    case 'timeout': case 'closed': return 'The room did not answer. Its host should keep the game open on screen (on a phone too), then try again.'
    case 'unreachable': return 'Could not get through to the room from this network. Try another connection (Wi-Fi or mobile data), or without a VPN.'
    case 'busy': return 'All quick tables are busy right now. Create a room instead.'
    case 'browser-incompatible': return 'This browser cannot open rooms (WebRTC is turned off). You can still join a friend\'s room with its code.'
    case 'lib': return 'Online play could not load. Check your connection (or an ad blocker) and try again.'
    case 'code': return 'Type the room code your friend sent you.'
    default: return 'Could not reach the game server. Check your connection and try again.'
  }
}
/** What the attempt saw, small under the message: for telling someone what went wrong. */
function detailFor(e) {
  const d = e?.detail, ways = d && (e.type === 'timeout' || e.type === 'unreachable') // what got through, where it matters
  return [e?.type !== 'code' && e?.type, ways && `direct ${d.rtc}`, ways && `relay servers ${d.brokers}`].filter(Boolean).join(' · ')
}

/**
 * `siteName()`: the site's own name for the player, or null; with one there is no name to type.
 * `changed()`: the status or the invitation changed (the game redraws).
 */
export function onlineControl({ net, me, siteName = () => null, changed = () => {} }) {
  let status = null // null | { busy: text, kind } | { error: text, detail, kind }; kind: quick | create | join | resume
  let invited = null // the code of the room a link brought the player to
  const set = s => { status = s; changed() }

  /** A name for the others to see: a rude one is swapped for a random one, and the word for that comes back. */
  function setName(v) {
    const n = cleanName(v)
    let note = ''
    if (n && !isClean(n)) { me.name = randomName(); note = 'That name is not allowed here, so you got a random one.' }
    else me.name = n || randomName()
    save(NAME_KEY, me.name)
    changed()
    return note
  }
  /** Before going online: the site's name, or the one typed, or a random one (kept for next time). */
  function ensureName() {
    if (siteName()) { me.name = siteName(); return }
    if (!me.name || !isClean(me.name)) setName(load(NAME_KEY) || me.name)
  }
  async function go(kind, text, fn) {
    if (status?.busy) return false
    ensureName()
    set({ busy: text, kind })
    try {
      await fn()
      invited = null
      set(null)
      return true
    } catch (e) {
      if (e?.type === 'cancelled') return false
      console.warn('[online]', e)
      set({ error: messageFor(e), detail: detailFor(e), kind })
      return false
    }
  }
  return {
    get status() { return status },
    get invited() { return invited },
    /** A room's link brought the player: the Online screen shows its code to join. */
    invite(code) { invited = cleanCode(code) || null; changed() },
    quick: (mode, size) => go('quick', 'Looking for a table…', () => net.quickMatch(mode, size)),
    create: () => go('create', 'Opening a room…', () => net.create()),
    join(code) {
      code = cleanCode(code)
      if (code.length < 3) { set({ error: messageFor({ type: 'code' }), detail: '', kind: 'join' }); return Promise.resolve(false) }
      return go('join', `Joining room ${code}…`, () => net.join(code))
    },
    /** Coming back to a room after a reload: shown like any other attempt. */
    resume: (code, fn) => go('resume', `Coming back to room ${cleanCode(code)}…`, fn),
    cancel() { if (!status?.busy) return; net.cancel(); set(null) },
    /** Puts the message of an attempt that failed away. */
    dismiss() { if (status && !status.busy) set(null) },
    setName,
    randomName,
  }
}

/**
 * Send friends the way into the room: its link where there is one (the share sheet on phones, the
 * clipboard elsewhere), else just its code, which they type on the Online screen.
 * 'shared' | 'copied' | 'cancelled' | 'failed' | 'none'
 */
export async function shareRoom(room) {
  if (!room) return 'none'
  const text = room.link ? `Join my table in Cards, Snakes & Ladders: room ${room.code}` : `Join my table in Cards, Snakes & Ladders: Online, room code ${room.code}`
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
