// The site the web build runs on (GitHub Pages, CrazyGames or Discord) and the calls a site's SDK answers.
// The game in experience/ never looks at the site itself: it reads the profile and calls the hooks
// through p0.web (Project 0 has no p0.web, so there every call is skipped). An SDK plugs in here,
// with provide({ ... }) in place of the no-op hooks, and nothing in the game changes.
// On CrazyGames the SDK v3 does so: loading, gameplay start and stop, happytime, and online play (invite
// links, the room the player is in, instant multiplayer). No ads: midgameAd stays as it is.
//
// On Discord (an Activity in a voice channel) web/discord.js does: the channel's room, which everyone
// there sits at at once (instantMultiplayer gives its code), and the player's name and avatar (getUser).
//
// The site: window.CSL_PLATFORM (set by the build's index.html), else ?platform=crazygames or
// ?platform=discord (to try it locally), else 'pages'. With ?platform=… or ?debug the profile and
// every hook call go to the console.

const PROFILES = {
  // links to rooms are fine; Quick Match keeps the rooms (QM1…) its players already meet in
  pages: { quickPrefix: 'QM', allowLinks: true, privacyNotice: true },
  // the game is played only on the portal: no links to its files; Quick Match rooms of its own
  crazygames: { quickPrefix: 'CG', allowLinks: false, privacyNotice: true },
  // an Activity in Discord's iframe: no links out of it; Quick Match rooms of its own; rooms through
  // the relay server (WebRTC and the public brokers do not get through there); the sound starts quieter
  // (the players talk in the voice channel). Links open in the player's browser, outside Discord: the
  // policies there are the public copies on GitHub Pages (`home`), not the activity's own files
  discord: { quickPrefix: 'DC', allowLinks: false, privacyNotice: true, server: true, volume: 0.35, home: 'https://andtargd.github.io/cards_snakes_ladders/' },
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
  /**
   * The player's account on the site, or null (none, or they would not sign in): { name, id, picture }. The
   * name stands in for the one they type; id (a string) is the same on every device, so the player keeps
   * their seat at a table whatever page they come back from; picture is an image's address (an avatar).
   */
  getUser: async () => null,
  /** Whether a picture another player's page sent (getUser's) is one of the site's own, fine to show. */
  pictureOk: () => false,
  /** inviteLink(code): a link to a room that keeps the player on the site, or null for no link of the site's own. */
  inviteLink: noLink,
  /** The room code a site's invite link brought the player with (an SDK's invite parameter), or null. */
  inviteRoom: () => null,
  /**
   * The site sent the player straight to online play (its multiplayer page): true for a room of their own
   * at once, no menu; or a room code: the site's own table for them (Discord's channel), the only one they
   * play at (no menu of rooms), opened by the first one who comes.
   */
  instantMultiplayer: () => false,
  /** This tab is in online room `code`; `open`: whether friends can come in now (it is not full, nor a quick table playing). Again whenever `open` changes. */
  roomOpened() {},
  /** This tab left its online room. */
  roomClosed() {},
  /** onInvite(fn): fn(code) when the site brings the player to a room while the game is open (a friend's invite). */
  onInvite() {},
  /** The player's language on the site, or null (the game is in English only for now). */
  locale: () => null,
  /** Opens a page (the privacy policy, the terms) beside the game: a new tab here, the player's browser in Discord. */
  openLink(url) {
    const w = open(url, '_blank')
    if (w) w.opener = null
  },
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

// ---------- CrazyGames: the SDK v3 (https://docs.crazygames.com/sdk/game/) ----------
// The build's index.html loads it before the game (tools/build_cg.py); ?platform=crazygames on a page
// that is not the build loads it here, to try it. Where it does not load (an ad blocker, offline) or does
// not run (another domain: environment 'disabled'), nothing changes: rooms go by their code alone.
// On localhost the SDK runs in its local mode: ?instantJoin=true for instant multiplayer, ?roomId=CODE
// (or a whole invite link's ?czy_invite=true&roomId=CODE) for an invite.
const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js'
const SDK_MS = 10000 // off CrazyGames the SDK itself takes 7 s to find out
const ROOM = 'roomId' // the invite parameter with the room's code

function loadScript(src) {
  return new Promise((res, rej) => {
    const sc = document.createElement('script')
    sc.src = src
    sc.onload = res
    sc.onerror = () => { sc.remove(); rej(new Error('it did not load')) }
    document.head.append(sc)
  })
}
const late = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`no answer in ${ms / 1000} s`)), ms))])

async function crazyGames() {
  if (!globalThis.CrazyGames?.SDK && !globalThis.CSL_PLATFORM) await loadScript(SDK_URL)
  const SDK = globalThis.CrazyGames?.SDK
  if (!SDK) throw new Error('it did not load')
  await late(SDK.init(), SDK_MS)
  if (SDK.environment === 'disabled') throw new Error('it is disabled on this domain')
  const game = SDK.game
  // updateRoom is the SDK's way now; the invite button is what older ones had
  const rooms = typeof game.updateRoom === 'function'
  provide({
    loadingStart: () => game.loadingStart(),
    loadingStop: () => game.loadingStop(),
    gameplayStart: () => game.gameplayStart(),
    gameplayStop: () => game.gameplayStop(),
    happytime: () => game.happytime(),
    inviteLink: code => game.inviteLink({ [ROOM]: code }),
    inviteRoom: () => game.getInviteParam(ROOM),
    instantMultiplayer: () => !!game.isInstantMultiplayer,
    roomOpened(code, open) {
      if (!rooms) { if (open) game.showInviteButton({ [ROOM]: code }); else game.hideInviteButton(); return }
      game.updateRoom(open ? { roomId: code, isJoinable: true, inviteParams: { [ROOM]: code } } : { roomId: code, isJoinable: false })
    },
    roomClosed() { if (rooms) game.leftRoom(); else game.hideInviteButton() },
    onInvite(fn) { game.addJoinRoomListener?.(p => fn(p?.[ROOM] ?? null)) },
  })
  return SDK.environment
}

// ---------- Discord: web/discord.js, loaded on this profile only ----------
async function discord() {
  const { start } = await import('./discord.js')
  return start(provide)
}

const SDKS = { crazygames: ['CrazyGames', crazyGames], discord: ['Discord', discord] }
const [sdkName, startSdk] = SDKS[platform.id] || []

/** The site's SDK is ready, or not there (then the hooks stay as they are): the game waits for this before it starts. */
export const ready = (startSdk ? startSdk() : Promise.resolve(null)).then(env => {
  if (env) console.info(`[platform] ${sdkName} SDK:`, env)
  return env
}, e => {
  console.warn(`[platform] no ${sdkName} SDK (rooms go by their code):`, e?.message || e)
  return null
})

if (platform.debug) console.info('[platform]', platform.id, platform)
