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
// Outside Discord (no frame_id in the address) there is no SDK: start() fails and the game goes on as
// on GitHub Pages. ?mockInstance=ABC stands in for Discord there: a simple object instead of the SDK,
// with that instance, so two windows with the same one get the same room.

// The outside servers and the paths they are mapped to. Each one needs the same mapping in the Portal.
// The rooms go through the relay server (the profile's `server`; web/relaypeer.js dials /x/relay on the
// page's own domain, so its address is only here and in the Portal); PeerJS and the brokers stay
// mapped for the spike's comparison and as a way back.
export const RELAY_HOST = 'csl-relay.csl-relay.workers.dev' // the deployed server/relay (npm run deploy prints it)
export const MAPPINGS = [
  { prefix: '/x/relay', target: RELAY_HOST }, // the relay server (server/relay)
  { prefix: '/x/peerjs', target: '0.peerjs.com' }, // PeerJS signalling (web/net.js)
  { prefix: '/x/emqx', target: 'broker.emqx.io:8084' }, // the MQTT brokers (web/mq.js)
  { prefix: '/x/mosq', target: 'test.mosquitto.org:8081' },
]
const READY_MS = 10000
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

const late = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what}: no answer in ${ms / 1000} s`)), ms))])

function mock(id) {
  return { instanceId: id, platform: 'desktop', channelId: null, guildId: null, mock: true, ready: async () => {}, commands: {} }
}

/** Starts the SDK and gives web/platform.js the hooks it answers; resolves with what runs ('discord' or 'mock'), rejects outside Discord. */
export async function start(provide) {
  const q = new URLSearchParams(location.search)
  if (q.has('mockInstance')) {
    sdk = mock(q.get('mockInstance') || 'mock')
  } else {
    if (!q.has('frame_id')) throw new Error('not inside Discord (no frame_id; ?mockInstance=ABC stands in for it)')
    const { DiscordSDK, patchUrlMappings } = await import('../vendor/discord/embedded-app-sdk.mjs')
    // the client id is the activity's own subdomain: <client id>.discordsays.com
    sdk = new DiscordSDK(location.hostname.split('.')[0])
    // before any connection of the game's: it goes online only after the platform is ready
    patchUrlMappings(MAPPINGS)
    await late(sdk.ready(), READY_MS, 'ready()')
  }
  instanceId = sdk.instanceId
  platform = sdk.platform
  // the channel's table: everyone who opens the activity there sits at it at once, the first one hosts
  const code = roomCode(instanceId)
  provide({
    instantMultiplayer: () => code,
  })
  console.info('[discord]', sdk.mock ? 'mock' : 'SDK', { instanceId, room: code, platform, channelId: sdk.channelId, guildId: sdk.guildId })
  return sdk.mock ? 'mock' : 'discord'
}
