// The game's words in the language chosen: T.key is that key of locale.js, in that language (English where a
// language leaves it out). The rules know no words: they give keys, cards and names, and this reads them.
import { LANGS } from './locale.js'
import { CARD, SELF } from './rules.js'

export { LANGS }

const EN = LANGS[0]
const plain = v => !!v && typeof v === 'object' && !Array.isArray(v)
/** A language's table over English's: what it leaves out, at any depth, stays English. */
const over = (base, own) => {
  const o = { ...base }
  for (const k of Object.keys(own)) o[k] = plain(base[k]) && plain(own[k]) ? over(base[k], own[k]) : own[k]
  return o
}

let lang = EN, words = EN.words
export const T = new Proxy({}, { get: (_, k) => words[k] })
export const getLang = () => lang.id
export function setLang(id) {
  lang = LANGS.find(l => l.id === id) || EN
  words = over(EN.words, lang.words)
  if (globalThis.document) { document.documentElement.lang = lang.id; document.title = T.title }
}
/** The language this browser asks for, of those the game has; else English. */
export function browserLang() {
  const asked = globalThis.navigator?.languages || [globalThis.navigator?.language]
  for (const a of asked) { const l = LANGS.find(l => l.id === String(a).slice(0, 2).toLowerCase()); if (l) return l.id }
  return EN.id
}

/** A player's name as it shows: the player at this screen who gave none is "You" in this language. */
export const who = name => (name === SELF ? T.you : name)
/** The name after the words that say it is this screen's player: "Pip (you)", or just "You". */
export const myName = name => (name === SELF ? T.you : T.mine(name))
export const winsText = name => (name === SELF ? T.youWin : T.wins(name))
export const foolText = name => (name === SELF ? T.youAreFool : T.isFool(name))

export const cardName = id => T.cards[id]?.name ?? String(id)
/** The word that pops up over a piece when card `id` hits it. */
export const cardPopup = id => T.cards[id].popup ?? T.cards[id].name
/** A card's text with its numbers: {spaces} is the card's own number, {spaces|клетку|клетки|клеток} the word for it. */
export function cardText(id) {
  const c = CARD[id]
  return T.cards[id].text.replace(/\{(\w+)(?:\|([^}]*))?\}/g, (m, k, forms) => (c[k] === undefined ? m : forms ? lang.plural(c[k], ...forms.split('|')) : String(c[k])))
}

// what goes in a line of the rules: a name, a card ({ c: id }), some cards ({ cards: [id] }), or a number
const word = a => (a === SELF ? T.you : a?.c ? cardName(a.c) : Array.isArray(a?.cards) ? a.cards.map(cardName).join(', ') : a)
/** Why a move can't be made, as the rules give it: a key of T, or [key, ...what goes in it]. */
export function errText(e) {
  const [k, ...a] = [].concat(e), t = T[k]
  return typeof t === 'function' ? t(...a.map(word)) : t ?? String(k)
}
const piece = ([k, ...a]) => { const t = T.logLine[k]; return typeof t === 'function' ? t(...a.map(word)) : t ?? String(k) }
/**
 * A line of the game's log in this language: [turn, key, ...what goes in it, { then: [[key, ...]] }], `then`
 * being what follows the line. (A line that is only text is from a game saved before, or from an older host.)
 */
export function logText(l) {
  if (!Array.isArray(l)) return String(l)
  const [turn, ...line] = l, then = line[line.length - 1]?.then
  return `${turn}. ${piece(then ? line.slice(0, -1) : line)}${(Array.isArray(then) ? then : []).map(piece).join('')}`
}
