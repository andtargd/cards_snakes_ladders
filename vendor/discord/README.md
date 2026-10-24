# @discord/embedded-app-sdk 2.5.0

`embedded-app-sdk.mjs` is the package's ESM build with its dependencies bundled in (zod, uuid, big-integer,
eventemitter3, decimal.js-light, lodash.transform; all MIT or Unlicense), so it loads with no CDN and no
npm, as Discord's CSP needs. Source: `https://esm.sh/@discord/embedded-app-sdk@2.5.0/es2020/embedded-app-sdk.bundle.mjs`,
with the trailing `sourceMappingURL` comment removed (the map is not kept here).

One change of ours (2026-10-24): in the READY event's schema `avatar:v().optional()` is
`avatar:v().nullable().optional()`. Discord sends `"avatar": null` for a user with no avatar of their own,
the SDK's schema takes a string or nothing, so ready() never resolved for such a player and the game ran
without Discord. 3.0.0-beta.2 has the same schema: check a new version for it before dropping the change.

sha256 of the file as fetched: `aa2486a5ec9a2fe0bdbc207fa08fafcce2d84822d431a3914c3a2942f49b0440`;
with the change: `0c66e33f706a3a140912bdc7ccc1d5c4dece85285474985ec05ae12bb2eceeb2`

To update: fetch the same URL with the new exact version, drop the `sourceMappingURL` line, make the change
above if the schema still needs it, change the version and the hashes above. License: `LICENSE.md` (MIT, Discord Inc.).
