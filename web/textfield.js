// A text field over the game's canvas: the game draws the box, and while it is typed into a real input
// lies on it, so typing works as anywhere else (a phone's keyboard, paste, a room code on a non-Latin
// keyboard). One at a time; the game moves it when its layout changes and closes it when the box goes.
import { cleanCode } from './net.js'

let current = null

/**
 * `x, y, w, h`: the box in CSS pixels. `code`: a room code (capitals and digits, the key's Latin
 * letter on another layout). `onDone(value, how)`: how is 'enter' or 'blur', or value is null for
 * Escape (nothing changes then). Returns { move(x, y, w, h), close(keep) }.
 */
export function editText({ x, y, w, h, value = '', max = 14, size = 16, pad = 12, align = 'left', code = false, font = 'sans-serif', color = '#2b2622', onDone = () => {} }) {
  current?.close(true)
  const el = document.createElement('input')
  el.className = 'tf'
  el.type = 'text'
  el.maxLength = max
  el.value = value
  el.spellcheck = false
  el.autocomplete = 'off'
  el.setAttribute('autocapitalize', code ? 'characters' : 'words')
  el.setAttribute('enterkeyhint', code ? 'go' : 'done')
  el.style.font = `bold ${size}px ${font}`
  el.style.color = color
  el.style.textAlign = align
  el.style.padding = `0 ${pad}px`
  if (code) el.style.textTransform = 'uppercase'
  const move = (nx, ny, nw, nh) => Object.assign(el.style, { left: nx + 'px', top: ny + 'px', width: nw + 'px', height: nh + 'px' })
  move(x, y, w, h)
  document.body.appendChild(el)
  let done = false
  const finish = (keep, how) => {
    if (done) return
    done = true
    const v = el.value
    el.remove()
    if (current === api) current = null
    if (how !== 'blur') document.getElementById('c')?.focus({ preventScroll: true })
    onDone(keep ? (code ? cleanCode(v) : v) : null, how)
  }
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true, 'enter'); return }
    if (e.key === 'Escape') { e.preventDefault(); finish(false, 'cancel'); return }
    // a non-Latin keyboard layout (Russian, say): the key's place gives the Latin letter on it
    const m = code && /^Key([A-Z])$/.exec(e.code || '')
    if (!m || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || /[A-Za-z0-9]/.test(e.key)) return
    e.preventDefault()
    const a = el.selectionStart ?? el.value.length, b = el.selectionEnd ?? a
    el.value = cleanCode(el.value.slice(0, a) + m[1] + el.value.slice(b))
    const at = Math.min(a + 1, el.value.length)
    try { el.setSelectionRange(at, at) } catch { /* fine */ }
  })
  if (code) el.addEventListener('input', () => { const v = cleanCode(el.value); if (v !== el.value) el.value = v })
  el.addEventListener('blur', () => finish(true, 'blur'))
  el.focus({ preventScroll: true })
  el.select()
  const api = { move, close: keep => finish(keep, 'blur') }
  current = api
  return api
}
