"""Builds the CrazyGames upload: dist/crazygames/ and dist/crazygames.zip.

    python tools/build_cg.py

Only what the web game loads goes in (tools/webbuild.py): index.html (with window.CSL_PLATFORM =
'crazygames' and the CrazyGames SDK v3 before the game's module, for the invite links and rooms in
web/platform.js), privacy.html, web/, experience/ and vendor/ (without Discord's SDK).
Every path the pages and modules load must be relative, since the portal serves the game from a
folder of its own CDN. No dependencies beyond Python 3.
"""
import os
import sys
import zipfile

from webbuild import ROOT, CG_SDK_URL, check_paths, copy_game, rel, stop_on_errors

OUT = os.path.join(ROOT, 'dist', 'crazygames')
ZIP = os.path.join(ROOT, 'dist', 'crazygames.zip')
SKIP_DIRS = ('vendor/discord/',)  # Discord's SDK: only a Discord build loads it

MAX_FILES = 1500
TARGET_MB, MAX_MB = 20, 50
SDK_URL = CG_SDK_URL
# loaded from outside the zip on purpose: the SDK only (PeerJS is in vendor/peerjs/)
EXTERNAL_OK = (SDK_URL,)

PLATFORM_TAG = "<script>window.CSL_PLATFORM = 'crazygames'</script>\n"
SDK_TAG = f'<script src="{SDK_URL}"></script>\n'


def build():
    html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    if SDK_URL in html:
        sys.exit('index.html already loads the CrazyGames SDK: the build adds it itself')
    copied = copy_game(OUT, PLATFORM_TAG + SDK_TAG, SKIP_DIRS)

    errors, external, connects = check_paths(OUT, copied, EXTERNAL_OK)
    stop_on_errors(errors, 'on the portal')

    if os.path.exists(ZIP):
        os.remove(ZIP)
    with zipfile.ZipFile(ZIP, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in copied:
            z.write(p, rel(p, OUT))

    total = sum(os.path.getsize(p) for p in copied)
    mb, zmb = total / 2 ** 20, os.path.getsize(ZIP) / 2 ** 20
    print(f'dist/crazygames/: {len(copied)} files (limit {MAX_FILES}), {mb:.2f} MB (target < {TARGET_MB} MB, limit {MAX_MB} MB)')
    print(f'dist/crazygames.zip: {zmb:.2f} MB')
    for u in external:
        print(f'loaded from outside: {u}')
    for u in connects:
        print(f'online play connects to: {u} (and the PeerJS signalling server)')
    if len(copied) > MAX_FILES or mb > MAX_MB:
        sys.exit('over the CrazyGames limits')
    if mb > TARGET_MB:
        print(f'warning: over the {TARGET_MB} MB target')


if __name__ == '__main__':
    build()
