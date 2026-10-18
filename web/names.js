// Player names in online rooms: other players see them, so they are kept clean. A friendly random
// name stands in for an empty or rude one. The check runs on this side (the Play Online dialog) and
// again on the room's host for every name that comes in, since a client may send anything.
// A site's own name for the player (hooks.getUser, an SDK) replaces the typed one altogether.

export const MAX_NAME = 14
/** Control characters out, spaces squeezed, at most 14 characters. */
export const cleanName = s => String(s || '').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)

// ---------- random names ----------
const ADJ = ['Paper', 'Lucky', 'Sly', 'Brave', 'Jolly', 'Swift', 'Clever', 'Sunny', 'Dizzy', 'Happy', 'Mighty', 'Quiet', 'Bouncy', 'Golden', 'Rusty', 'Velvet', 'Cosmic', 'Merry', 'Plucky', 'Nimble', 'Cozy', 'Wily', 'Tiny', 'Royal', 'Silver', 'Daring', 'Breezy', 'Fuzzy', 'Sleepy', 'Wobbly', 'Cheeky', 'Shiny', 'Rolling', 'Spotted', 'Striped', 'Bold', 'Calm', 'Gentle', 'Zippy', 'Peppy']
const NOUN = ['Fox', 'Ladder', 'Snake', 'Dice', 'Joker', 'Ace', 'Otter', 'Badger', 'Owl', 'Pawn', 'Rook', 'Card', 'Gecko', 'Panda', 'Raven', 'Comet', 'Rabbit', 'Hare', 'Lynx', 'Llama', 'Wizard', 'Knight', 'Pirate', 'Turtle', 'Ferret', 'Koala', 'Beetle', 'Hedgehog', 'Sparrow', 'Walrus', 'Python', 'Cobra', 'Viper', 'Adder', 'Kitten', 'Puffin', 'Lemur', 'Moose', 'Bison', 'Parrot']
export const POOL = ADJ.flatMap(a => NOUN.map(n => a + ' ' + n)).filter(s => s.length <= MAX_NAME)
/** A friendly random name, like "Paper Fox". */
export const randomName = () => POOL[Math.floor(Math.random() * POOL.length)]
/** The same friendly name for the same text (FNV-1a): a rude name stays one stand-in, so a reload keeps its seat. */
function nameFor(s) {
  let h = 0x811c9dc5
  for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193) >>> 0
  return POOL[h % POOL.length]
}

// ---------- the check ----------
// Letters from other scripts that look like Latin ones (fսck, сunt in Cyrillic), then leetspeak:
// each letter of a bad word also matches its look-alike digits and symbols, repeated letters and
// separators in between (f.u.c.k, f_u_c_k, fuuuck). Letters spaced out one by one (f u c k) are put
// back together first. Short words that hide inside ordinary ones (ass, tit, cum) match only as
// whole words; the rest match anywhere, after a few ordinary words with them inside are taken out.
const TO_LATIN = {
  а: 'a', в: 'b', с: 'c', е: 'e', ё: 'e', н: 'h', і: 'i', ї: 'i', ј: 'j', к: 'k', м: 'm', о: 'o', р: 'p', ѕ: 's', т: 't', у: 'y', х: 'x', ь: 'b', г: 'r', п: 'n', и: 'u', д: 'd', ф: 'f',
  α: 'a', β: 'b', γ: 'y', ε: 'e', η: 'n', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', ω: 'w',
  ս: 'u', օ: 'o', հ: 'h', ո: 'n', ց: 'g', ք: 'p', ա: 'w',
}
const TO_CYRILLIC = { a: 'а', b: 'б', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у', u: 'у', 3: 'з', 0: 'о', 6: 'б', 4: 'ч', 1: 'и', '@': 'а' }
const LEET = { a: 'a4@^', b: 'b8', c: 'c(<k', e: 'e3€', g: 'g9', i: 'i1!|l', l: 'l1|!i', o: 'o0', s: 's5$', t: 't7+', u: 'uv', z: 'z2' }
const SEP = `[._\\-*'"\`~^,+=:;/\\\\]*` // between the letters of one word (not spaces: those split words)

const EN_ANYWHERE = [
  'fuck', 'fuk', 'fck', 'phuck', 'motherf', 'shit', 'cunt', 'nigg', 'niga', 'faggot', 'fagot', 'bitch', 'biatch', 'whore', 'slut', 'wank', 'dildo', 'penis', 'vagina', 'porn', 'pussy',
  'cocksuck', 'dickhead', 'asshole', 'arsehole', 'dumbass', 'jackass', 'boob', 'nazi', 'hitler', 'retard', 'bastard', 'piss', 'jizz', 'bollock', 'tranny', 'wetback',
  'pedophil', 'paedophil', 'cumshot', 'blowjob', 'handjob', 'orgasm', 'horny', 'bdsm', 'kkk',
  // Russian in Latin letters
  'blyat', 'blyad', 'bljad', 'pizd', 'pezd', 'eblan', 'pidor', 'pidar', 'pidaras', 'mudak', 'mudil', 'gandon', 'gondon', 'zalup', 'xuy', 'xui', 'khuy', 'khui', 'nahui', 'nahuy', 'nahuj', 'yoban',
]
const EN_WORDS = [
  'ass', 'asses', 'arse', 'cum', 'cums', 'tit', 'tits', 'titty', 'titties', 'cock', 'cocks', 'dick', 'dicks', 'anal', 'anus', 'rape', 'raped', 'raper', 'rapist', 'raping',
  'sex', 'sexy', 'fag', 'fags', 'homo', 'coon', 'coons', 'gook', 'spic', 'chink', 'kike', 'dyke', 'twat', 'twats', 'cuck', 'milf', 'kys', 'hoe', 'hoes', 'pedo', 'paedo',
  'nig', 'negro', 'jap', 'hui', 'huy', 'suka', 'cyka', 'nude', 'nudes', 'boner', 'thot', 'simp',
]
// ordinary words with a bad one inside
const INNOCENT = ['scunthorpe', 'shiitake', 'shitake', 'matsushita', 'niggle', 'niggling', 'swank', 'cocktail', 'peacock', 'cockatoo', 'hancock', 'pissarro']

const RU_ANYWHERE = [
  'ху[ияюе]', 'пизд', 'пезд', 'бляд', 'блят', 'сучк', 'сучар', 'мудак', 'мудил', 'мудоз', 'пидор', 'пидар', 'пидр', 'педераст', 'гандон', 'гондон', 'шлюх', 'залуп', 'дроч',
  'долб[оа]е', 'шалав', 'жоп', 'говн', 'ниггер', 'сиськ', 'манду',
]
const RU_WORDS = ['сука', 'суки', 'сукин', 'сучка', 'хер', 'хера', 'херня', 'нахер', 'похер', 'бля', 'манда', 'чмо', 'чмошник', 'педик', 'педики', 'нигер', 'секс', 'член']

const letterRe = ch => {
  const set = LEET[ch]
  return set ? `[${set.replace(/[\\\]^-]/g, '\\$&')}]+` : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '+'
}
const wordRe = w => w.split('').map(letterRe).join(SEP)
const EN_RE = new RegExp(EN_ANYWHERE.map(wordRe).join('|'))
const EN_SET = new Set(EN_WORDS)
// a letter or a [set] of them, each repeated and with separators between
const ruRe = w => w.match(/\[[^\]]+\]|./g).map(u => u + '+').join(SEP)
// еб- only at a word's start or after a prefix: хлебать, колебаться and небо stay
const RU_EB = `(?:^|[^а-я]|за|вы|от|до|на|по|у|въ|съ|раз|подъ|при|об)е+${SEP}б+(?:ан|ат|ал|л|уч|ну|ет|ен|и|у|ок|ыр)`
const RU_RE = new RegExp([...RU_ANYWHERE.map(ruRe), RU_EB].join('|'))
const RU_SET = new Set(RU_WORDS)
const DELEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't', '€': 'e' }

const strip = s => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
/** Words of the name, with letters spaced out one by one put back together (f u c k → fuck). */
function words(s) {
  const out = []
  let run = ''
  for (const t of s.split(/[\s._\-,~'"`]+/).filter(Boolean)) {
    if ([...t].length === 1) { run += t; continue }
    if (run) { out.push(run); run = '' }
    out.push(t)
  }
  if (run) out.push(run)
  return out
}
function badWord(list, w, deleet) {
  const plain = deleet ? [...w].map(c => deleet[c] ?? c).join('') : w
  const letters = plain.replace(/[^a-zа-я]/g, '')
  if (list.has(letters)) return true
  // 1 and | read as l too
  return deleet && /[1|!]/.test(w) && list.has([...w].map(c => (/[1|!]/.test(c) ? 'l' : deleet[c] ?? c)).join('').replace(/[^a-z]/g, ''))
}

/** Whether a name is fine to show to other players. */
export function isClean(name) {
  const s = cleanName(name)
  if (!s) return true
  // the Latin reading
  let en = [...strip(s.toLowerCase())].map(c => TO_LATIN[c] ?? c).join('')
  const enWords = words(en)
  if (enWords.some(w => badWord(EN_SET, w, DELEET))) return false
  en = enWords.join(' ')
  for (const w of INNOCENT) en = en.split(w).join(' ')
  if (EN_RE.test(en)) return false
  // the Cyrillic reading of words in Cyrillic, or in Latin look-alikes only (xyй, cyka; not rebate)
  const ru = words(strip(s.toLowerCase()).replace(/ё/g, 'е'))
    .filter(w => /[а-я]/.test(w) || [...w].every(c => c in TO_CYRILLIC))
    .map(w => [...w].map(c => TO_CYRILLIC[c] ?? c).join(''))
  if (ru.some(w => badWord(RU_SET, w))) return false
  return !RU_RE.test(ru.join(' '))
}

/**
 * A name to show: the cleaned name if it passes, else the same friendly stand-in for the same text.
 * `fallback` for an empty name.
 */
export function safeName(name, fallback = 'Player') {
  const s = cleanName(name)
  if (!s) return fallback
  return isClean(s) ? s : nameFor(s.toLowerCase())
}
