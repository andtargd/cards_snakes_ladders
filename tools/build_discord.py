"""Builds the Discord Activity: dist/discord/.

    python tools/build_discord.py

Only what the web game loads goes in (tools/webbuild.py): index.html with window.CSL_PLATFORM =
'discord' before the game's module (web/platform.js then loads web/discord.js and Discord's SDK from
vendor/discord/), privacy.html, web/, experience/ and vendor/. Discord's CSP lets the page reach its
own domain only, so nothing is loaded from outside: every path is relative, and the servers online play
talks to go through the app's URL Mappings (web/discord.js). No dependencies beyond Python 3.
"""
import os

from webbuild import ROOT, CG_SDK_URL, check_paths, copy_game, stop_on_errors

OUT = os.path.join(ROOT, 'dist', 'discord')
PLATFORM_TAG = "<script>window.CSL_PLATFORM = 'discord'</script>\n"
# named in web/platform.js, but loaded on the CrazyGames profile only
NOT_LOADED = (CG_SDK_URL,)


def build():
    copied = copy_game(OUT, PLATFORM_TAG)
    errors, named, connects = check_paths(OUT, copied, NOT_LOADED)
    stop_on_errors(errors, 'in Discord')

    total = sum(os.path.getsize(p) for p in copied)
    print(f'dist/discord/: {len(copied)} files, {total / 2 ** 20:.2f} MB')
    for u in named:
        print(f'named, not loaded on Discord: {u}')
    for u in connects:
        print(f'online play connects to: {u} (and the PeerJS signalling server), through the URL Mappings of web/discord.js')


if __name__ == '__main__':
    build()
