// Discord: the game as an Activity (docs/discord/launch-plan.md). web/platform.js loads this module on
// the 'discord' profile only, and start() plugs Discord's answers into its hooks; nothing else in the
// game knows about Discord.
//
// An activity runs in an iframe on https://<client id>.discordsays.com with a strict CSP: the page may
// reach its own domain only. Every outside server the game talks to goes through a URL Mapping of the
// app (added by hand in the Developer Portal, MAPPINGS below), and patchUrlMappings rewrites fetch and
// WebSocket to them. Everyone who started the activity in one channel has the same instanceId: it is
// their room.
//
// The player's name and avatar come with Discord's OAuth (getUser): authorize() asks them (once; Discord
// remembers the answer) and gives a code, the relay server trades it for a token (POST /api/token: the
// client secret is the server's only), and authenticate() with the token gives the user. Whoever says no,
// or when the server is out of reach, plays as "Player N" (the room's host numbers them, web/net.js).
//
// Outside Discord (no frame_id in the address) there is no SDK: start() fails and the game goes on as
// on GitHub Pages. ?mockInstance=ABC stands in for Discord there: a simple object instead of the SDK,
// with that instance, so two windows with the same one get the same room. ?mockUser=Ann signs in as Ann
// (an id of her name's, a default avatar from Discord's CDN); without it the player said no.

// The outside servers and the paths they are mapped to. Each one needs the same mapping in the Portal.
// The rooms go through the relay server (the profile's `server`; web/relaypeer.js dials /x/relay on the
// page's own domain, so its address is only here and in the Portal); PeerJS and the brokers stay
// mapped for the spike's comparison and as a way back.
export const RELAY_HOST = 'csl-relay.csl-relay.workers.dev' // the deployed server/relay (npm run deploy prints it)
export const CDN = 'cdn.discordapp.com' // the players' avatars
export const MAPPINGS = [
  { prefix: '/x/relay', target: RELAY_HOST }, // the relay server (server/relay): the rooms and /api/token
  { prefix: '/x/cdn', target: CDN }, // the avatars (fetched, so patchUrlMappings takes them there)
  { prefix: '/x/peerjs', target: '0.peerjs.com' }, // PeerJS signalling (web/net.js)
  { prefix: '/x/emqx', target: 'broker.emqx.io:8084' }, // the MQTT brokers (web/mq.js)
  { prefix: '/x/mosq', target: 'test.mosquitto.org:8081' },
]
const READY_MS = 10000
const API_MS = 10000 // the token and authenticate(); authorize() waits for the player as long as it takes
const ABC = 'ABCDEFGHJKMNPRSTUVWXYZ23456789' // the room codes' letters (web/net.js)

export let sdk = null
/** The activity's instance: the same for everyone who started it in this channel. */
export let instanceId = null
/** 'desktop' or 'mobile' (Discord's own word for the client it runs in). */
export let platform = null

/**
 * A room code (5 letters, as web/net.js has them) that stands for an instance: the same everywhere. The
 * codes stay as they are (the relay server, the reload's way back and the rooms' ids take them as they
 * are); 30^5 of them make two channels at one table unlikely (1 in 24 million for a pair), and a quick
 * room's code (DC1, DCC1…) is never 5 letters long.
 */
export function roomCode(id) {
  let h = 0x811c9dc5 // FNV-1a
  for (const c of String(id)) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0 }
  let code = ''
  for (let i = 0; i < 5; i++) { code += ABC[h % ABC.length]; h = Math.floor(h / ABC.length) }
  return code
}

/**
 * A user's picture: their avatar (64 px), else Discord's default one for them. Fetched, not put in an
 * <img>: inside Discord patchUrlMappings sends fetch through /x/cdn, and the CDN lets any page draw it.
 */
export function avatarUrl(u) {
  if (/^(?:a_)?[0-9a-f]{32}$/.test(u?.avatar || '')) return `https://${CDN}/avatars/${u.id}/${u.avatar}.png?size=64`
  let i = 0
  try { i = Number((BigInt(u.id) >> 22n) % 6n) } catch { /* not an id */ }
  return `https://${CDN}/embed/avatars/${i}.png`
}
const PICTURE = /^https:\/\/cdn\.discordapp\.com\/(?:avatars\/\d{5,22}\/(?:a_)?[0-9a-f]{32}\.png\?size=64|embed\/avatars\/[0-5]\.png)$/
/** Whether a picture another page sent is a Discord avatar (as avatarUrl makes them): nothing else is fetched. */
export const pictureOk = url => typeof url === 'string' && PICTURE.test(url)

const late = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what}: no answer in ${ms / 1000} s`)), ms))])

function mock(id) {
  return { instanceId: id, platform: 'desktop', channelId: null, guildId: null, mock: true, ready: async () => {}, commands: {} }
}

/** The mock's user (?mockUser=Ann): an id of the name's own (as Discord's are: digits), Discord's default avatar for it. */
function mockUser(name) {
  let h = 0x811c9dc5
  for (const c of name) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0 }
  const id = String(1e17 + h * 1e7)
  return { name, id, picture: avatarUrl({ id }) }
}

/** The player signs in (the first time Discord asks them): { name, id, picture }, or it throws (they said no, no server). */
async function signIn(clientId) {
  const { code } = await sdk.commands.authorize({ client_id: clientId, response_type: 'code', state: '', prompt: 'none', scope: ['identify'] })
  const r = await late(fetch(`https://${RELAY_HOST}/api/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }), API_MS, '/api/token')
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.access_token) throw new Error(`/api/token: ${r.status} ${d?.error || ''}`)
  const { user } = await late(sdk.commands.authenticate({ access_token: d.access_token }), API_MS, 'authenticate()')
  return { name: user.global_name || user.username, id: String(user.id), picture: avatarUrl(user) }
}

/** Starts the SDK and gives web/platform.js the hooks it answers; resolves with what runs ('discord' or 'mock'), rejects outside Discord. */
export async function start(provide) {
  const q = new URLSearchParams(location.search)
  let user
  if (q.has('mockInstance')) {
    sdk = mock(q.get('mockInstance') || 'mock')
    user = () => Promise.resolve(q.get('mockUser') ? mockUser(q.get('mockUser')) : null)
  } else {
    if (!q.has('frame_id')) throw new Error('not inside Discord (no frame_id; ?mockInstance=ABC stands in for it)')
    const { DiscordSDK, patchUrlMappings } = await import('../vendor/discord/embedded-app-sdk.mjs')
    // the client id is the activity's own subdomain: <client id>.discordsays.com
    const clientId = location.hostname.split('.')[0]
    sdk = new DiscordSDK(clientId)
    user = () => signIn(clientId)
    // before any connection of the game's: it goes online only after the platform is ready
    patchUrlMappings(MAPPINGS)
    await late(sdk.ready(), READY_MS, 'ready()')
  }
  instanceId = sdk.instanceId
  platform = sdk.platform
  // the channel's table: everyone who opens the activity there sits at it at once, the first one hosts
  const code = roomCode(instanceId)
  // (asked once: the game asks before it goes to the table)
  let signedIn = null
  provide({
    instantMultiplayer: () => code,
    getUser: () => (signedIn ||= user().catch(e => { console.warn('[discord] no sign-in, playing without a name:', e?.message || e); return null })),
    pictureOk,
  })
  console.info('[discord]', sdk.mock ? 'mock' : 'SDK', { instanceId, room: code, platform, channelId: sdk.channelId, guildId: sdk.guildId })
  return sdk.mock ? 'mock' : 'discord'
}
