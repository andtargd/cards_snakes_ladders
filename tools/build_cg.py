"""Builds the CrazyGames upload: dist/crazygames/ and dist/crazygames.zip.

    python tools/build_cg.py

Only what the web game loads goes in: index.html (with window.CSL_PLATFORM = 'crazygames' and the
CrazyGames SDK v3 before the game's module, for the invite links and rooms in web/platform.js),
privacy.html (the privacy policy the game links to), web/, experience/ (without experience.json,
which is Project 0's manifest) and vendor/.
Every path the pages and modules load must be relative, since the portal serves the game from a
folder of its own CDN. No dependencies beyond Python 3.
"""
import os
import re
import shutil
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'dist', 'crazygames')
ZIP = os.path.join(ROOT, 'dist', 'crazygames.zip')

DIRS = ('web', 'experience', 'vendor')
# pages beside index.html, copied as they are (the privacy policy the game links to)
PAGES = ('privacy.html',)
SKIP_FILES = {'experience/experience.json'}
SKIP_DIRS = ('vendor/discord/',)  # Discord's SDK: only a Discord build loads it
SKIP_NAMES = {'__pycache__', '.DS_Store', 'Thumbs.db', '.gitkeep'}
SKIP_EXT = ('.md', '.docx', '.py', '.pyc', '.map')

MAX_FILES = 1500
TARGET_MB, MAX_MB = 20, 50
# the CrazyGames SDK: the portal has it loaded from its own server (web/platform.js copes when it does not load)
SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js'
# loaded from outside the zip on purpose: the SDK only (PeerJS is in vendor/peerjs/)
EXTERNAL_OK = (SDK_URL,)
# servers online play connects to (wss://, the brokers in web/mq.js): listed, not errors
WSS_URL = re.compile(r'''["'](wss://[^"'\s]+)["']''')

PLATFORM_TAG = "<script>window.CSL_PLATFORM = 'crazygames'</script>\n"
SDK_TAG = f'<script src="{SDK_URL}"></script>\n'

# src="…" / href="…" in HTML; the values of an importmap; module specifiers in JS
ATTR = re.compile(r'''\b(?:src|href)\s*=\s*["']([^"']+)["']''', re.I)
IMPORTMAP = re.compile(r'<script\s+type=["\']importmap["\']\s*>(.*?)</script>', re.S | re.I)
MAP_VALUE = re.compile(r''':\s*["']([^"']+)["']''')
JS_SPEC = re.compile(r'''(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|new\s+URL\(\s*)(["'])([^"'\n]+)\1''')
JS_URL = re.compile(r'''["'](https?://[^"'\s]+)["']''')


def rel(path, base=ROOT):
    return os.path.relpath(path, base).replace(os.sep, '/')


def wanted(path):
    r = rel(path)
    name = os.path.basename(path)
    return r not in SKIP_FILES and not r.startswith(SKIP_DIRS) and name not in SKIP_NAMES and not name.lower().endswith(SKIP_EXT)


def strip_js_comments(src):
    # good enough for our own modules and three's: block comments, then line comments not inside a string or URL
    src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
    return re.sub(r'(?m)(^|[\s;{}()])//.*$', r'\1', src)


def check_paths(base, files):
    """Absolute paths ('/x', '//cdn') are errors; outside URLs other than the allowed ones are errors too."""
    errors, external, connects = [], set(), set()

    def look(where, value):
        v = value.strip()
        if v.startswith(('data:', 'blob:', '#', 'mailto:')) or v in ('', '.'):
            return
        if v.startswith(('http://', 'https://')):
            if v.startswith(EXTERNAL_OK):
                external.add(v)
            else:
                errors.append(f'{where}: outside URL {v}')
        elif v.startswith('/'):
            errors.append(f'{where}: absolute path {v}')

    for path in files:
        r = rel(path, base)
        if r.endswith('.html'):
            text = open(path, encoding='utf-8').read()
            for m in ATTR.finditer(text):
                look(r, m.group(1))
            for block in IMPORTMAP.findall(text):
                for m in MAP_VALUE.finditer(block):
                    look(r + ' (importmap)', m.group(1))
        elif r.endswith('.js'):
            text = strip_js_comments(open(path, encoding='utf-8').read())
            for m in JS_SPEC.finditer(text):
                look(r, m.group(2))
            if not r.startswith('vendor/'):  # three.js names URLs in its docs and error texts
                for m in JS_URL.finditer(text):
                    look(r, m.group(1))
                for m in WSS_URL.finditer(text):
                    connects.add(m.group(1))
    return errors, sorted(external), sorted(connects)


def build():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)

    html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    if 'CSL_PLATFORM' in html:
        sys.exit('index.html already sets CSL_PLATFORM: the build sets it itself')
    if SDK_URL in html:
        sys.exit('index.html already loads the CrazyGames SDK: the build adds it itself')
    # before the importmap and the game's module, so web/platform.js sees both (GitHub Pages has neither)
    html, n = re.subn(r'<script\s+type=["\']importmap["\']', lambda m: PLATFORM_TAG + SDK_TAG + m.group(0), html, count=1)
    if n != 1:
        sys.exit('index.html: no importmap to put the platform before')
    with open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)

    copied = [os.path.join(OUT, 'index.html')]
    for name in PAGES:
        src = os.path.join(ROOT, name)
        if not os.path.isfile(src):
            sys.exit(f'missing {name}')
        shutil.copy2(src, os.path.join(OUT, name))
        copied.append(os.path.join(OUT, name))
    for d in DIRS:
        src_dir = os.path.join(ROOT, d)
        if not os.path.isdir(src_dir):
            sys.exit(f'missing {d}/')
        for base, dirs, names in os.walk(src_dir):
            dirs[:] = sorted(x for x in dirs if x not in SKIP_NAMES)
            for name in sorted(names):
                src = os.path.join(base, name)
                if not wanted(src):
                    continue
                dst = os.path.join(OUT, rel(src))
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                shutil.copy2(src, dst)
                copied.append(dst)

    errors, external, connects = check_paths(OUT, copied)
    if errors:
        print('Paths that will not work on the portal:')
        for e in errors:
            print('  ' + e)
        sys.exit(1)

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
