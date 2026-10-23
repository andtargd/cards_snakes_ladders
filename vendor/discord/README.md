# @discord/embedded-app-sdk 2.5.0

`embedded-app-sdk.mjs` is the package's ESM build with its dependencies bundled in (zod, uuid, big-integer,
eventemitter3, decimal.js-light, lodash.transform; all MIT or Unlicense), so it loads with no CDN and no
npm, as Discord's CSP needs. Source: `https://esm.sh/@discord/embedded-app-sdk@2.5.0/es2020/embedded-app-sdk.bundle.mjs`,
with the trailing `sourceMappingURL` comment removed (the map is not kept here).

sha256 of the file: `aa2486a5ec9a2fe0bdbc207fa08fafcce2d84822d431a3914c3a2942f49b0440`

To update: fetch the same URL with the new exact version, drop the `sourceMappingURL` line, change the
version and the hash above. License: `LICENSE.md` (MIT, Discord Inc.).
