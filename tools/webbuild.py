"""What the site builds share (tools/build_cg.py, tools/build_discord.py): the web game's files copied
into dist/<site>/ with the site's tags put in index.html, and a check of the paths they load.

Only what the web game loads goes in: index.html, privacy.html and terms.html (the pages the game links to),
web/, experience/ (without experience.json, which is Project 0's manifest) and vendor/. Every path the
pages and modules load must be relative, since a site serves the game from a folder of its own.
No dependencies beyond Python 3.
"""
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DIRS = ('web', 'experience', 'vendor')
# pages beside index.html, copied as they are (the privacy policy and the terms the game links to)
PAGES = ('privacy.html', 'terms.html')
SKIP_FILES = {'experience/experience.json'}
SKIP_NAMES = {'__pycache__', '.DS_Store', 'Thumbs.db', '.gitkeep'}
SKIP_EXT = ('.md', '.docx', '.py', '.pyc', '.map')

# the CrazyGames SDK: the portal has it loaded from its own server (web/platform.js copes when it does not load)
CG_SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js'
# pages the game opens as links, never loads: the policies' public copies (web/platform.js, Discord's profile)
LINKS = ('https://andtargd.github.io/cards_snakes_ladders/',)
# servers online play connects to (wss://, the brokers in web/mq.js): listed, not errors
WSS_URL = re.compile(r'''["'](wss://[^"'\s]+)["']''')

# src="…" / href="…" in HTML (not a link's href in <a>: it goes to a page, nothing is loaded); the values
# of an importmap; module specifiers in JS
ATTR = re.compile(r'''\b(?:src|href)\s*=\s*["']([^"']+)["']''', re.I)
A_TAG = re.compile(r'<a\s[^>]*>', re.I)
IMPORTMAP = re.compile(r'<script\s+type=["\']importmap["\']\s*>(.*?)</script>', re.S | re.I)
MAP_VALUE = re.compile(r''':\s*["']([^"']+)["']''')
JS_SPEC = re.compile(r'''(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|new\s+URL\(\s*)(["'])([^"'\n]+)\1''')
JS_URL = re.compile(r'''["'](https?://[^"'\s]+)["']''')


def rel(path, base=ROOT):
    return os.path.relpath(path, base).replace(os.sep, '/')


def wanted(path, skip_dirs=()):
    r = rel(path)
    name = os.path.basename(path)
    return r not in SKIP_FILES and not r.startswith(tuple(skip_dirs)) and name not in SKIP_NAMES and not name.lower().endswith(SKIP_EXT)


def strip_js_comments(src):
    # good enough for our own modules and three's: block comments, then line comments not inside a string or URL
    src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
    return re.sub(r'(?m)(^|[\s;{}()])//.*$', r'\1', src)


def check_paths(base, files, external_ok=()):
    """Absolute paths ('/x', '//cdn') are errors; outside URLs other than the allowed ones are errors too."""
    errors, external, connects = [], set(), set()

    def look(where, value):
        v = value.strip()
        if v.startswith(('data:', 'blob:', '#', 'mailto:') + LINKS) or v in ('', '.'):
            return
        if v.startswith(('http://', 'https://')):
            if external_ok and v.startswith(tuple(external_ok)):
                external.add(v)
            else:
                errors.append(f'{where}: outside URL {v}')
        elif v.startswith('/'):
            errors.append(f'{where}: absolute path {v}')

    for path in files:
        r = rel(path, base)
        if r.endswith('.html'):
            text = A_TAG.sub('', open(path, encoding='utf-8').read())
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


def copy_game(out, tags, skip_dirs=()):
    """dist/<site>/ afresh: index.html with `tags` before its importmap (so web/platform.js sees them
    before the game's module), the pages and the game's folders. Returns the paths copied."""
    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out)

    html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    if 'CSL_PLATFORM' in html:
        sys.exit('index.html already sets CSL_PLATFORM: the build sets it itself')
    html, n = re.subn(r'<script\s+type=["\']importmap["\']', lambda m: tags + m.group(0), html, count=1)
    if n != 1:
        sys.exit('index.html: no importmap to put the platform before')
    with open(os.path.join(out, 'index.html'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)

    copied = [os.path.join(out, 'index.html')]
    for name in PAGES:
        src = os.path.join(ROOT, name)
        if not os.path.isfile(src):
            sys.exit(f'missing {name}')
        shutil.copy2(src, os.path.join(out, name))
        copied.append(os.path.join(out, name))
    for d in DIRS:
        src_dir = os.path.join(ROOT, d)
        if not os.path.isdir(src_dir):
            sys.exit(f'missing {d}/')
        for base, dirs, names in os.walk(src_dir):
            dirs[:] = sorted(x for x in dirs if x not in SKIP_NAMES)
            for name in sorted(names):
                src = os.path.join(base, name)
                if not wanted(src, skip_dirs):
                    continue
                dst = os.path.join(out, rel(src))
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                shutil.copy2(src, dst)
                copied.append(dst)
    return copied


def stop_on_errors(errors, where):
    if not errors:
        return
    print(f'Paths that will not work {where}:')
    for e in errors:
        print('  ' + e)
    sys.exit(1)
