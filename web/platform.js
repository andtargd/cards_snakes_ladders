// The site the web build runs on (GitHub Pages or CrazyGames) and the calls a site's SDK answers.
// The game in experience/ never looks at the site itself: it reads the profile and calls the hooks
// through p0.web (Project 0 has no p0.web, so there every call is skipped). An SDK plugs in here,
// with provide({ ... }) in place of the no-op hooks, and nothing in the game changes.
//
// The site: window.CSL_PLATFORM (set by the build's index.html), else ?platform=crazygames (to try it
// locally), else 'pages'. With ?platform=… or ?debug the profile and every hook call go to the console.

const PROFILES = {
  // links to rooms are fine; Quick Match keeps the rooms (QM1…) its players already meet in
  pages: { quickPrefix: 'QM', allowLinks: true, privacyNotice: true },
  // the game is played only on the portal: no links to its files; Quick Match rooms of its own
  crazygames: { quickPrefix: 'CG', allowLinks: false, privacyNotice: true },
}

const q = new URLSearchParams(globalThis.location?.search || '')
const pick = v => (Object.hasOwn(PROFILES, v) ? v : null)
const id = pick(globalThis.CSL_PLATFORM) || pick(q.get('platform')) || 'pages'
// ?quick=XY: Quick Match rooms of a test run's own (tools/quicktest.html), so real players are not met
const quick = /^[A-Z]{2,3}$/.test(q.get('quick') || '') ? { quickPrefix: q.get('quick') } : null
export const platform = Object.freeze({ id, ...PROFILES[id], ...quick, debug: q.has('platform') || q.has('debug') })

/** All sound off while anyone asks for it (an ad, say); the player's own sound setting is not touched. */
const muters = new Set()
const muteListeners = new Set()
export const mute = {
  get on() { return muters.size > 0 },
  set(reason, on) {
    const was = muters.size > 0
    if (on) muters.add(reason); else muters.delete(reason)
    if (was !== muters.size > 0) for (const fn of muteListeners) fn(muters.size > 0)
  },
  listen(fn) { muteListeners.add(fn) },
}

// what an SDK will do; until then nothing (mute and unmute already work)
const noLink = () => null
const impl = {
  loadingStart() {}, // the game starts loading
  loadingStop() {}, // the menu is up
  gameplayStart() {}, // a game is being played on this screen
  gameplayStop() {}, // back in a menu, the game's own menu or a finished game
  happytime() {}, // the player here won
  /** Between two games (a rematch, a new game after one ended); the next game waits for it. */
  midgameAd: async () => {},
  mute() { mute.set('sdk', true) },
  unmute() { mute.set('sdk', false) },
  /** The player's name (and avatar) on the site: it stands in for the name they type. */
  getUser: async () => null,
  /** inviteLink(code): a link to a room that keeps the player on the site, or null for no link of the site's own. */
  inviteLink: noLink,
  /** The room code a site's invite link brought the player with (an SDK's invite parameter), or null. */
  inviteRoom: () => null,
  /** The online room this tab is in ({ code, quick, link, fresh }), or null after leaving it. */
  roomChanged() {},
  /** The player's language on the site, or null (the game is in English only for now). */
  locale: () => null,
}

/** An SDK's own versions of some of the hooks. */
export function provide(more) {
  for (const [k, fn] of Object.entries(more)) if (Object.hasOwn(impl, k) && typeof fn === 'function') impl[k] = fn
}

/** The hooks the game calls: a failing one is logged and skipped, and with debug on every call shows in the console. */
export const hooks = Object.freeze(Object.fromEntries(Object.keys(impl).map(name => [name, (...a) => {
  if (platform.debug) console.debug('[platform]', name, ...a)
  try { return impl[name](...a) } catch (e) { console.error('[platform]', name, e); return undefined }
}])))

/**
 * The link to a room for friends, or null when there is none to give (then only the code is shared):
 * the site's own invite link if it has one, else this page's address where links are fine (GitHub Pages).
 * On CrazyGames this page is the game's files on their CDN, a playable copy off the portal: no link to it.
 */
export function roomLink(code) {
  const site = hooks.inviteLink(code)
  if (typeof site === 'string' && site) return site
  return platform.allowLinks ? location.origin + location.pathname + '?room=' + code : null
}
/** Whether rooms get links at all here (for texts shown before there is a room). */
export const roomLinks = () => platform.allowLinks || impl.inviteLink !== noLink

if (platform.debug) console.info('[platform]', platform.id, platform)
