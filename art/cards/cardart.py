#!/usr/bin/env python3
"""Card pictures with the pawn mascot «Фишка».

How to draw them: .claude/skills/card-art/SKILL.md. Colors: art/mascot/README.md.

  python art/cards/cardart.py            writes art/cards/<id>.svg for every card in CARDS
  python art/cards/cardart.py --preview  also writes tmp/card-art-preview.html (card size and 2x)

The pawn is drawn in the mascot frame of art/mascot/mascot.svg (400x500, the base's bottom centre at
200, 450) and put on the picture with place(). Hands, feet and faces are in that frame too.
"""
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

W, H = 408, 256  # 2x the picture window of drawCard (204x128)
INK = '#2b2233'
GLOVE = '#fff4dc'
SHOE = '#5c6677'
CHEEK = '#f49aa0'
TUFT_FILL, TUFT_LINE = '#f7c548', '#d99a22'
MOUTH, TONGUE = '#3a1f2b', '#f07a8a'

# the pawn's colours by card category (CAT_COLORS in experience/paper.js); the table is in art/mascot/README.md
PALETTES = {
    'M': dict(body='#e8743b', shade='#b35d39', light='#efa07a', ghost='#f6c7b1', bg='#fcece4'),
    'D': dict(body='#7b5ce0', shade='#654cb0', light='#a590ea', ghost='#cabef3', bg='#ede8fb'),
    'B': dict(body='#2aa876', shade='#2a8263', light='#6ec4a2', ghost='#aadcc8', bg='#e1f3ec'),
    'H': dict(body='#d64545', shade='#a63b40', light='#e38181', ghost='#efb5b5', bg='#f9e5e5'),
    'P': dict(body='#2b8fd6', shade='#2b70a8', light='#6fb3e3', ghost='#aad2ef', bg='#e1eff9'),
    'C': dict(body='#b58a12', shade='#8e6d1b', light='#cdaf5e', ghost='#e1d0a0', bg='#f5efde'),
}


def other(cat):
    """A pale pawn of the same category, for another player on the picture."""
    p = PALETTES[cat]
    return dict(p, body=p['ghost'], shade=p['light'], light=p['bg'])


BODY = 'M168 262 C165 318 142 370 128 410 L272 410 C258 370 235 318 232 262 Z'
BASE = 'M118 412 Q118 402 130 402 L270 402 Q282 402 282 412 L285 438 Q287 450 273 450 L127 450 Q113 450 115 438 Z'


def mirror_path(d):
    """The path mirrored about the pawn's axis (x = 200); paths here use absolute "x y" pairs only."""
    return re.sub(r'(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)', lambda m: f'{400 - float(m[1]):g} {m[2]}', d)


_BACK = ('M212 96 C184 68 136 64 84 80 C122 84 150 92 164 100 C136 100 104 108 76 126 C124 120 166 116 198 112 Z',
         'M196 94 C170 82 142 80 114 84')
TUFTS = {  # (shape, its inner line)
    'up': ('M184 96 C176 72 184 56 197 50 C195 63 199 71 204 76 C208 58 220 46 236 48 C223 59 221 76 222 96 Z',
           'M208 92 C208 80 212 70 220 62'),
    'back': _BACK,  # blown to the left, as when running right
    'forward': tuple(mirror_path(d) for d in _BACK),  # blown to the right, as when pushed left
}

FEET = {  # (cx, cy, rx, rotation)
    'stand': [(166, 455, 24, 0), (234, 455, 24, 0)],
    'run': [(124, 444, 22, -30), (274, 452, 24, 10)],
    'tuck': [(140, 446, 22, -30), (256, 448, 22, 24)],
    'skid': [(130, 456, 24, 0), (282, 440, 22, -20)],
}


def place(x, y, s, rot=0):
    """Puts the base's bottom centre at (x, y), the pawn s times its mascot size, leaning rot degrees."""
    return f'translate({x} {y}) scale({s}) rotate({rot}) translate(-200 -450)'


def mirror(markup):
    return f'<g transform="matrix(-1 0 0 1 400 0)">{markup}</g>'


def arm(d, col):
    return f'<path d="{d}" fill="none" stroke-width="21"/><path d="{d}" fill="none" stroke="{col}" stroke-width="8"/>'


def glove(cx, cy, rot=0):
    """An open hand, fingers up, thumb to the right; rot turns it about its centre."""
    return (f'<g transform="rotate({rot} {cx} {cy})">'
            f'<ellipse cx="{cx + 19}" cy="{cy + 11}" rx="9" ry="6" transform="rotate(-35 {cx + 19} {cy + 11})" fill="{GLOVE}" stroke-width="5"/>'
            f'<ellipse cx="{cx}" cy="{cy}" rx="17" ry="20" fill="{GLOVE}" stroke-width="6"/>'
            f'<path d="M{cx - 6} {cy - 17} L{cx - 6} {cy - 8} M{cx + 5} {cy - 18} L{cx + 5} {cy - 9}" fill="none" stroke-width="4"/></g>')


def fist(cx, cy, r=17):
    return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{GLOVE}" stroke-width="6"/>'
            f'<path d="M{cx + 4} {cy - 12} Q{cx + 10} {cy - 6} {cx + 8} {cy + 2} M{cx - 4} {cy - 10} Q{cx + 2} {cy - 4} {cx} {cy + 4}" fill="none" stroke-width="4"/>')


def _eye(cx, cy, rx, ry, px, py, pr):
    return (f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#ffffff" stroke-width="6"/>'
            f'<circle cx="{px}" cy="{py}" r="{pr}" fill="{INK}" stroke="none"/>'
            f'<circle cx="{px + 3}" cy="{py - 4}" r="{pr * 0.34:.1f}" fill="#ffffff" stroke="none"/>')


def _cheeks(a, b):
    return ''.join(f'<ellipse cx="{x}" cy="{y}" rx="13" ry="8" fill="{CHEEK}" stroke="none"/>' for x, y in (a, b))


def _grin(uid, d):
    """An open grin: teeth along the top, the tongue below."""
    return (f'<clipPath id="{uid}-mouth"><path d="{d}"/></clipPath>'
            f'<path d="{d}" fill="{MOUTH}" stroke="none"/>'
            f'<g clip-path="url(#{uid}-mouth)" stroke="none">'
            f'<path d="M150 150 L260 150 L260 196 Q205 212 150 200 Z" fill="#ffffff"/>'
            f'<ellipse cx="207" cy="232" rx="20" ry="12" fill="{TONGUE}"/></g>'
            f'<path d="{d}" fill="none" stroke-width="6"/>')


def face(kind, uid):
    """Faces look right; pawn(look='left') mirrors them."""
    if kind == 'happy':  # the mascot's own
        return (_cheeks((148, 197), (258, 193))
                + '<path d="M155 126 Q170 116 186 123 M215 120 Q232 110 249 119" fill="none" stroke-width="6"/>'
                + _eye(172, 158, 19, 24, 179, 162, 9) + _eye(230, 156, 21, 26, 237, 160, 10)
                + _grin(uid, 'M180 196 Q205 204 230 194 Q228 228 205 229 Q183 229 180 196 Z'))
    if kind == 'determined':  # brows down, teeth clenched
        d = 'M196 192 Q224 198 250 186 Q248 210 224 212 Q202 212 196 192 Z'
        return (_cheeks((170, 194), (266, 186))
                + _eye(192, 158, 16, 20, 200, 160, 8) + _eye(243, 154, 18, 22, 252, 156, 9)
                + '<path d="M168 130 L210 144 M226 140 L268 122" fill="none" stroke-width="8"/>'
                + f'<clipPath id="{uid}-teeth"><path d="{d}"/></clipPath>'
                + f'<path d="{d}" fill="#ffffff" stroke="none"/>'
                + f'<path d="M199 201 Q224 206 249 196 M212 194 L212 212 M226 196 L226 214 M240 192 L240 212" fill="none" stroke-width="4" clip-path="url(#{uid}-teeth)"/>'
                + f'<path d="{d}" fill="none" stroke-width="6"/>')
    if kind == 'shock':  # round eyes, tiny pupils, brows high, mouth an O
        return (_cheeks((150, 200), (256, 196))
                + '<path d="M150 108 Q166 94 186 102 M214 98 Q234 86 254 98" fill="none" stroke-width="6"/>'
                + _eye(174, 150, 21, 26, 181, 152, 6) + _eye(232, 148, 23, 28, 240, 150, 6.5)
                + f'<ellipse cx="206" cy="208" rx="14" ry="17" fill="{MOUTH}" stroke-width="6"/>'
                + f'<ellipse cx="206" cy="217" rx="8" ry="5" fill="{TONGUE}" stroke="none"/>')
    if kind == 'sly':  # a wink and a wide grin
        return (_cheeks((150, 198), (258, 192))
                + '<path d="M156 132 Q172 124 188 130 M214 116 Q232 102 252 112" fill="none" stroke-width="6"/>'
                + '<path d="M156 164 Q172 146 188 164" fill="none" stroke-width="7"/>'
                + _eye(232, 154, 21, 25, 240, 158, 9.5)
                + _grin(uid, 'M176 190 Q208 204 240 186 Q238 228 210 229 Q182 229 176 190 Z'))
    if kind == 'neutral':  # calm: level brows, a small closed smile
        return (_cheeks((148, 197), (258, 193))
                + '<path d="M156 124 Q170 118 186 123 M216 119 Q232 113 248 118" fill="none" stroke-width="6"/>'
                + _eye(172, 158, 19, 24, 178, 160, 9) + _eye(230, 156, 21, 26, 236, 158, 10)
                + '<path d="M188 204 Q206 212 224 202" fill="none" stroke-width="6"/>')
    if kind == 'dizzy':  # spiral eyes, a wavy mouth
        def spiral(cx, cy):
            return (f'<path d="M{cx} {cy} A2.5 2.5 0 0 1 {cx + 5} {cy} A5 5 0 0 1 {cx - 5} {cy} A7.5 7.5 0 0 1 {cx + 10} {cy}'
                    f' A10 10 0 0 1 {cx - 10} {cy} A12.5 12.5 0 0 1 {cx + 15} {cy}" fill="none" stroke-width="4"/>')
        return (_cheeks((148, 200), (258, 196))
                + '<path d="M152 118 Q168 110 186 120 M216 116 Q234 106 252 116" fill="none" stroke-width="6"/>'
                + '<ellipse cx="172" cy="156" rx="19" ry="24" fill="#ffffff" stroke-width="6"/>' + spiral(170, 156)
                + '<ellipse cx="230" cy="154" rx="21" ry="26" fill="#ffffff" stroke-width="6"/>' + spiral(228, 154)
                + '<path d="M178 208 Q188 196 198 208 Q208 220 218 208 Q228 196 236 206" fill="none" stroke-width="6"/>')
    raise ValueError(kind)


def pawn(uid, pal, transform, *, face_kind='happy', look='right', tuft='up', feet='stand', arms='', front=''):
    """The pawn (tuft=None: bald, as other players are). `arms` go behind the body (start them inside it), `front` over everything (a hand in front)."""
    p = pal
    tuft_svg = ''
    if tuft:
        tuft_d, tuft_line = TUFTS[tuft]
        tuft_svg = (f'<path d="{tuft_d}" fill="{TUFT_FILL}" stroke-width="6"/>'
                    f'<path d="{tuft_line}" fill="none" stroke="{TUFT_LINE}" stroke-width="5"/>')
    feet_svg = ''.join(f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="11" transform="rotate({r} {x} {y})"/>' for x, y, rx, r in FEET[feet])
    the_face = face(face_kind, uid)
    if look == 'left':
        the_face = mirror(the_face)
    return f'''<g transform="{transform}" stroke-width="7">
  <clipPath id="{uid}-body"><path d="{BODY}"/></clipPath>
  <clipPath id="{uid}-base"><path d="{BASE}"/></clipPath>
  <clipPath id="{uid}-collar"><ellipse cx="200" cy="258" rx="58" ry="15"/></clipPath>
  <clipPath id="{uid}-head"><circle cx="200" cy="168" r="84"/></clipPath>
  {arms}
  <g fill="{SHOE}" stroke-width="6">{feet_svg}</g>
  <path d="{BODY}" fill="{p['body']}" stroke="none"/>
  <g clip-path="url(#{uid}-body)" stroke="none">
    <path d="M214 262 C220 320 238 370 248 410 L300 410 L300 262 Z" fill="{p['shade']}"/>
    <path d="M181 276 C178 320 162 364 150 400 L164 400 C174 366 188 322 191 276 Z" fill="{p['light']}"/>
  </g>
  <path d="{BODY}" fill="none"/>
  <path d="{BASE}" fill="{p['body']}" stroke="none"/>
  <g clip-path="url(#{uid}-base)" stroke="none">
    <rect x="80" y="430" width="240" height="30" fill="{p['shade']}"/>
    <rect x="238" y="400" width="80" height="60" fill="{p['shade']}"/>
    <path d="M132 409 L215 409" stroke="{p['light']}" stroke-width="5"/>
  </g>
  <path d="{BASE}" fill="none"/>
  <ellipse cx="200" cy="258" rx="58" ry="15" fill="{p['body']}" stroke="none"/>
  <path d="M140 262 Q200 290 260 262 L260 280 L140 280 Z" fill="{p['shade']}" stroke="none" clip-path="url(#{uid}-collar)"/>
  <ellipse cx="200" cy="258" rx="58" ry="15" fill="none"/>
  {tuft_svg}
  <circle cx="200" cy="168" r="84" fill="{p['shade']}" stroke="none"/>
  <g clip-path="url(#{uid}-head)" stroke="none">
    <circle cx="190" cy="158" r="80" fill="{p['body']}"/>
    <ellipse cx="156" cy="116" rx="24" ry="10" transform="rotate(-38 156 116)" fill="{p['light']}"/>
    <ellipse cx="135" cy="146" rx="5" ry="7" fill="{p['light']}"/>
  </g>
  <circle cx="200" cy="168" r="84" fill="none"/>
  {the_face}
  {front}
</g>'''


def ghost(transform, fill, opacity=1, tuft='up'):
    """The pawn's flat silhouette: an after-image where it has just been."""
    return (f'<g transform="{transform}" fill="{fill}" opacity="{opacity}" stroke="none">'
            f'<path d="{TUFTS[tuft][0]}"/><path d="{BODY}"/><path d="{BASE}"/>'
            f'<ellipse cx="200" cy="258" rx="58" ry="15"/><circle cx="200" cy="168" r="84"/></g>')


def lines(*segs):
    """Speed lines: (x1, y, x2) each."""
    return '<g fill="none" stroke-width="4">' + ''.join(f'<path d="M{a} {y} L{b} {y}"/>' for a, y, b in segs) + '</g>'


def dust(*puffs):
    """Dust puffs: (cx, cy, r) each."""
    return '<g fill="#ffffff" stroke-width="4">' + ''.join(f'<circle cx="{x}" cy="{y}" r="{r}"/>' for x, y, r in puffs) + '</g>'


def shadow(cx, cy, rx, ry=6):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{INK}" opacity="0.15" stroke="none"/>'


def drop(x, y, rot=0):
    """A sweat drop, (x, y) its tip."""
    return f'<path d="M{x} {y} Q{x - 10} {y + 16} {x} {y + 26} Q{x + 10} {y + 16} {x} {y} Z" fill="#ffffff" stroke-width="5" transform="rotate({rot} {x} {y})"/>'


def arrowhead(x, y, angle, fill=INK):
    """A solid arrowhead with its tip at (x, y), pointing `angle` degrees (0 right, 90 down)."""
    return (f'<path d="M{x} {y} L{x - 24} {y - 13} L{x - 18} {y} L{x - 24} {y + 13} Z" fill="{fill}" stroke-width="4"'
            f' transform="rotate({angle} {x} {y})"/>')


def die(cx, cy, rot=0, s=1):
    """A die showing three, centre (cx, cy), s times 44 px across."""
    pips = ''.join(f'<circle cx="{cx + dx * s}" cy="{cy + dy * s}" r="{4.5 * s:g}" fill="{INK}" stroke="none"/>'
                   for dx, dy in ((-11, -11), (0, 0), (11, 11)))
    return (f'<g transform="rotate({rot} {cx} {cy})"><rect x="{cx - 22 * s}" y="{cy - 22 * s}" width="{44 * s}" height="{44 * s}"'
            f' rx="{9 * s}" fill="#ffffff" stroke-width="6"/>{pips}</g>')


PIPS = {  # pip centres on a face, the face from -1 to 1 both ways
    1: [(0, 0)], 2: [(-.5, -.5), (.5, .5)], 3: [(-.5, -.5), (0, 0), (.5, .5)],
    4: [(-.5, -.5), (.5, -.5), (-.5, .5), (.5, .5)], 5: [(-.5, -.5), (.5, -.5), (0, 0), (-.5, .5), (.5, .5)],
    6: [(-.5, -.55), (-.5, 0), (-.5, .55), (.5, -.55), (.5, 0), (.5, .55)],
}
# the cube's faces: (centre = normal, u axis, v axis); y is down, the viewer looks along +z
CUBE = {
    'F': ((0, 0, -1), (1, 0, 0), (0, 1, 0)), 'K': ((0, 0, 1), (-1, 0, 0), (0, 1, 0)),
    'T': ((0, -1, 0), (1, 0, 0), (0, 0, -1)), 'B': ((0, 1, 0), (1, 0, 0), (0, 0, 1)),
    'R': ((1, 0, 0), (0, 0, 1), (0, 1, 0)), 'L': ((-1, 0, 0), (0, 0, -1), (0, 1, 0)),
}
OPPOSITE = {'F': 'K', 'K': 'F', 'T': 'B', 'B': 'T', 'R': 'L', 'L': 'R'}
LIGHT_DIR = (-0.45, -1, -0.6)  # from the top left, in front


def _rotate(v, pitch, yaw):
    """Tips the top towards the viewer by pitch, turns the right side towards them by yaw (degrees)."""
    a, b = math.radians(pitch), math.radians(yaw)
    x, y, z = v
    y, z = y * math.cos(a) - z * math.sin(a), y * math.sin(a) + z * math.cos(a)
    x, z = x * math.cos(b) + z * math.sin(b), -x * math.sin(b) + z * math.cos(b)
    return x, y, z


def _rounded(pts, r):
    """A closed path through pts with its corners rounded off by about r."""
    d = []
    for i, (x, y) in enumerate(pts):
        (px, py), (nx, ny) = pts[i - 1], pts[(i + 1) % len(pts)]
        t1 = min(0.4, r / math.hypot(px - x, py - y))
        t2 = min(0.4, r / math.hypot(nx - x, ny - y))
        a, b = (x + (px - x) * t1, y + (py - y) * t1), (x + (nx - x) * t2, y + (ny - y) * t2)
        d.append(f'{"M" if not i else "L"}{a[0]:.1f} {a[1]:.1f} Q{x:.1f} {y:.1f} {b[0]:.1f} {b[1]:.1f}')
    return ' '.join(d) + ' Z'


def _hull(pts):
    pts = sorted(set(pts))
    def half(seq):
        h = []
        for p in seq:
            while len(h) > 1 and (h[-1][0] - h[-2][0]) * (p[1] - h[-2][1]) - (h[-1][1] - h[-2][1]) * (p[0] - h[-2][0]) <= 0:
                h.pop()
            h.append(p)
        return h[:-1]
    return half(pts) + half(pts[::-1])


def _die_geometry(cx, cy, s, pitch, yaw, roll):
    c, r = math.cos(math.radians(roll)), math.sin(math.radians(roll))
    def proj(v):
        x, y, _ = _rotate(v, pitch, yaw)
        return (round(cx + s * (x * c - y * r), 1), round(cy + s * (x * r + y * c), 1))
    corners = [proj((x, y, z)) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    return proj, _rounded(_hull(corners), 0.3 * s)


def die3d(uid, pal, cx, cy, s, faces, *, pitch=22, yaw=28, roll=0, pip=GLOVE):
    """A die in the mascot's style, centre (cx, cy), s half its edge. faces: values of the faces seen, as
    {'F': front, 'T': top, 'R' or 'L': the side}; their opposites add up to 7. The lit face is pal light, the
    one in front pal body (with a light patch), the far one pal shade."""
    vals = dict(faces)
    for k, v in faces.items():
        vals.setdefault(OPPOSITE[k], 7 - v)
    proj, outline = _die_geometry(cx, cy, s, pitch, yaw, roll)
    seen = []
    for k, (n, u, v) in CUBE.items():
        rn = _rotate(n, pitch, yaw)
        if rn[2] < -0.05:
            lit = sum(a * b for a, b in zip(rn, LIGHT_DIR))
            seen.append((lit, k, n, u, v))
    seen.sort(reverse=True)
    fills = [pal['light'], pal['body'], pal['shade']] if len(seen) == 3 else [pal['light'], pal['body']]
    if len(seen) == 1:
        fills = [pal['body']]
    out = [f'<clipPath id="{uid}-die"><path d="{outline}"/></clipPath>', f'<g clip-path="url(#{uid}-die)">']
    for (lit, k, n, u, v), fill in zip(seen, fills):
        def at(a, b):
            return proj(tuple(n[i] + a * u[i] + b * v[i] for i in range(3)))
        quad = [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)]
        (x0, y0), (x1, y1), (x3, y3) = quad[0], quad[1], quad[3]
        ox, oy = (quad[0][0] + quad[2][0]) / 2, (quad[0][1] + quad[2][1]) / 2
        m = f'matrix({(x1 - x0) / 2:.2f} {(y1 - y0) / 2:.2f} {(x3 - x0) / 2:.2f} {(y3 - y0) / 2:.2f} {ox:.1f} {oy:.1f})'
        out.append(f'<path d="M{" L".join(f"{x} {y}" for x, y in quad)} Z" fill="{fill}" stroke-width="5"/>')
        patch = ''
        if fill == pal['body']:
            patch = (f'<ellipse cx="-0.5" cy="-0.72" rx="0.3" ry="0.09" fill="{pal["light"]}"/>'
                     f'<ellipse cx="-0.78" cy="-0.42" rx="0.06" ry="0.09" fill="{pal["light"]}"/>')
        dots = ''.join(f'<circle cx="{a}" cy="{b}" r="0.19" fill="{pip}" stroke-width="3" vector-effect="non-scaling-stroke"/>'
                       for a, b in PIPS[vals[k]])
        out.append(f'<g transform="{m}" stroke="none">{patch}</g><g transform="{m}">{dots}</g>')
    out.append(f'</g><path d="{outline}" fill="none" stroke-width="7"/>')
    return '\n'.join(out)


def face_tile(cx, cy, value, fill, *, pip=GLOVE, s=1, rot=0):
    """One face of a die, flat: the value to pick. s times 52 px across."""
    h = 26 * s
    dots = ''.join(f'<circle cx="{cx + a * h * 0.95:.1f}" cy="{cy + b * h * 0.95:.1f}" r="{5.5 * s:.1f}" fill="{pip}" stroke-width="3"/>'
                   for a, b in PIPS[value])
    return (f'<g transform="rotate({rot} {cx} {cy})"><rect x="{cx - h}" y="{cy - h}" width="{2 * h}" height="{2 * h}"'
            f' rx="{10 * s:g}" fill="{fill}" stroke-width="6"/>{dots}</g>')


def sparkle(cx, cy, r, fill='#ffffff'):
    """A four-pointed glint."""
    k = r * 0.28
    return (f'<path d="M{cx} {cy - r} Q{cx + k} {cy - k} {cx + r} {cy} Q{cx + k} {cy + k} {cx} {cy + r}'
            f' Q{cx - k} {cy + k} {cx - r} {cy} Q{cx - k} {cy - k} {cx} {cy - r} Z" fill="{fill}" stroke-width="4"/>')


def picture(cid, title, cat, seed, content):
    pal = PALETTES[cat]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <title>{title} — рисунок карты</title>
  <!-- Сделано art/cards/cardart.py ({cid}); правьте там и пересоберите. -->
  <defs>
    <filter id="{cid}-drawn" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="{seed}" result="warp"/>
      <feDisplacementMap in="SourceGraphic" in2="warp" scale="3" xChannelSelector="R" yChannelSelector="G" result="wobbly"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="{seed + 8}" result="noise"/>
      <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0.17  0 0 0 0 0.13  0 0 0 0 0.2  -2 0 0 0 0.85" result="specks"/>
      <feComposite in="specks" in2="wobbly" operator="in" result="grain"/>
      <feMerge><feMergeNode in="wobbly"/><feMergeNode in="grain"/></feMerge>
    </filter>
    <clipPath id="{cid}-frame"><rect width="{W}" height="{H}" rx="24"/></clipPath>
  </defs>
  <g clip-path="url(#{cid}-frame)">
  <g filter="url(#{cid}-drawn)" stroke="{INK}" stroke-linejoin="round" stroke-linecap="round">
    <rect width="{W}" height="{H}" fill="{pal['bg']}" stroke="none"/>
    {content}
  </g>
  </g>
</svg>
'''


# ---------- the cards ----------

def dash():
    """M1 Dash: a rush forward, two after-images behind."""
    p = PALETTES['M']
    return '\n'.join([
        shadow(244, 245, 46),
        ghost(place(112, 220, 0.5, 16), p['ghost'], 0.55, 'back'),
        ghost(place(172, 218, 0.5, 16), p['ghost'], 1, 'back'),
        lines((44, 96, 110), (24, 144, 80), (50, 192, 106)),
        dust((160, 230, 7), (140, 225, 10), (120, 231, 6)),
        pawn('m1', p, place(232, 216, 0.5, 16), face_kind='determined', tuft='back', feet='run',
             arms=arm('M178 300 C140 300 112 318 98 346', p['body']) + fist(94, 354, 16)
             + arm('M222 298 C258 296 286 286 304 268', p['body']),
             front=drop(104, 184) + '<path d="M90 144 Q82 160 90 174" fill="none" stroke-width="6"/>' + fist(310, 262)),
    ])


def setback():
    """M2 Setback: pushed 3 spaces back; three after-images where it stood, arms flung up."""
    p = PALETTES['M']
    return '\n'.join([
        shadow(150, 236, 44),
        ghost(place(330, 230, 0.46, 0), p['ghost'], 0.45),
        ghost(place(278, 230, 0.46, -5), p['ghost'], 0.7),
        ghost(place(226, 230, 0.46, -10), p['ghost'], 1, 'forward'),
        dust((308, 233, 8), (330, 228, 12), (354, 234, 8)),  # where it stood before the push
        pawn('m2', p, place(152, 228, 0.46, -14), face_kind='shock', tuft='forward', feet='skid',
             arms=arm('M178 300 C150 290 130 262 124 232', p['body']) + glove(120, 214, -20)
             + arm('M222 298 C262 290 290 262 300 232', p['body']) + glove(302, 214, 20),
             front=drop(296, 112, 40) + drop(318, 150, 60)),
    ])


def tailgate():
    """M5 Tailgate: a leap along a dashed arc to land just behind the player ahead."""
    p = PALETTES['M']
    return '\n'.join([
        shadow(330, 244, 38),
        shadow(170, 238, 26, 4),
        '<path d="M24 226 Q120 96 262 228" fill="none" stroke-width="4" stroke-dasharray="2 12"/>',
        f'<ellipse cx="262" cy="230" rx="24" ry="6" fill="none" stroke="{p["shade"]}" stroke-width="4" stroke-dasharray="6 7"/>',
        dust((44, 224, 8), (26, 218, 10), (40, 206, 5)),
        ghost(place(86, 172, 0.4, -10), p['ghost'], 0.55, 'back'),
        ghost(place(122, 163, 0.4, 4), p['ghost'], 1, 'back'),
        pawn('m5b', other('M'), place(330, 240, 0.42, 0), face_kind='shock', look='left', tuft=None,
             arms=arm('M176 300 C150 312 138 330 134 352', other('M')['body']) + glove(132, 366, 180)
             + arm('M224 300 C250 312 262 330 266 352', other('M')['body']) + glove(268, 366, 180)),
        pawn('m5', p, place(161, 166, 0.4, 20), face_kind='sly', tuft='back', feet='tuck',
             arms=arm('M178 300 C140 298 104 282 84 256', p['body']) + glove(74, 240, -40)
             + arm('M222 298 C262 300 290 300 314 310', p['body']),
             front=glove(326, 312, 100)),
    ])


def swap_places():
    """M3 Swap Places: the pawn and another player trade cells; two arrows cross between them."""
    p, o = PALETTES['M'], other('M')
    return '\n'.join([
        shadow(104, 240, 40),
        shadow(304, 240, 40),
        f'<path d="M146 86 Q204 16 254 78" fill="none" stroke="{p["body"]}" stroke-width="7" stroke-dasharray="12 10"/>',
        arrowhead(262, 90, 55, p['body']),
        f'<path d="M262 178 Q210 238 166 190" fill="none" stroke="{p["shade"]}" stroke-width="7" stroke-dasharray="12 10"/>',
        arrowhead(160, 182, 230, p['shade']),
        pawn('m3b', o, place(304, 238, 0.42, 0), face_kind='dizzy', look='left', tuft=None,
             arms=arm('M178 300 C150 312 138 330 134 352', o['body']) + glove(132, 366, 180)
             + arm('M222 298 C262 290 290 262 300 232', o['body']) + glove(302, 214, 20)),
        pawn('m3', p, place(104, 238, 0.42, 4), face_kind='sly',
             arms=arm('M178 300 C150 290 130 262 124 232', p['body']) + glove(120, 214, -20)
             + arm('M222 300 C236 318 242 336 244 354', p['body']) + glove(244, 368, 180)),
    ])


def double_move():
    """M4 Double Move: still running, the pawn tosses the die up for another roll."""
    p = PALETTES['M']
    return '\n'.join([
        shadow(212, 245, 44),
        ghost(place(110, 220, 0.46, 14), p['ghost'], 0.6, 'back'),
        lines((30, 120, 84), (16, 168, 64), (36, 208, 80)),
        dust((140, 232, 7), (120, 226, 10), (100, 232, 6)),
        '<path d="M282 92 Q296 46 324 50" fill="none" stroke-width="4" stroke-dasharray="2 12"/>',
        '<path d="M372 36 L384 28 M378 64 L392 64 M364 90 L374 100" fill="none" stroke-width="5"/>',
        die(344, 62, 18, 0.95),
        pawn('m4', p, place(204, 222, 0.46, 12), face_kind='happy', tuft='back', feet='run',
             arms=arm('M178 300 C140 300 112 318 98 346', p['body']) + fist(94, 354, 16)
             + arm('M222 298 C262 282 288 240 296 196', p['body']),
             front=glove(298, 176, 15)),
    ])


def rewind():
    """M6 Rewind: back on the spot where the turn began, calm (it can be a gift); the rewind sign between."""
    p = PALETTES['M']
    return '\n'.join([
        shadow(110, 228, 42),
        f'<ellipse cx="110" cy="226" rx="46" ry="8" fill="none" stroke="{p["shade"]}" stroke-width="4" stroke-dasharray="6 7"/>',
        ghost(place(322, 226, 0.44, 0), p['ghost'], 0.55),
        '<path d="M300 62 Q228 -12 162 44" fill="none" stroke-width="4" stroke-dasharray="2 12"/>',
        arrowhead(156, 50, 140),
        f'<path d="M248 126 L210 150 L248 174 Z M210 126 L172 150 L210 174 Z" fill="{p["body"]}" stroke-width="6"/>',
        pawn('m6', p, place(110, 224, 0.42, 0), face_kind='neutral',
             arms=arm('M178 300 C150 312 138 330 134 352', p['body']) + glove(132, 366, 180)
             + arm('M222 300 C250 312 262 330 266 352', p['body']) + glove(268, 366, 180)),
    ])


# The Dice cards show only the dice, no pawn (the user's rule).

def extra_die():
    """D1 Extra Die: a second die drops in beside the first."""
    p = PALETTES['D']
    return '\n'.join([
        shadow(112, 226, 52),
        shadow(304, 228, 34, 5),
        '<g fill="none" stroke-width="4"><path d="M264 30 L264 80"/><path d="M310 14 L310 76"/><path d="M356 30 L356 80"/></g>',
        die3d('d1a', p, 108, 158, 38, {'F': 3, 'T': 1, 'R': 2}),
        die3d('d1b', p, 306, 150, 38, {'F': 5, 'T': 3, 'R': 1}, roll=14),
        f'<path d="M207 128 L207 168 M187 148 L227 148" fill="none" stroke-width="20"/>'
        f'<path d="M207 128 L207 168 M187 148 L227 148" fill="none" stroke="{p["body"]}" stroke-width="8"/>',
    ])


def choose_face():
    """D2 Choose a Face: the faces 1 to 3 to pick from, the 3 picked and set on the die."""
    p = PALETTES['D']
    return '\n'.join([
        shadow(132, 226, 54),
        die3d('d2', p, 132, 152, 40, {'F': 3, 'T': 1, 'R': 2}),
        face_tile(326, 48, 1, p['ghost'], pip=p['shade'], s=0.9),
        face_tile(326, 120, 2, p['ghost'], pip=p['shade'], s=0.9),
        f'<rect x="286" y="152" width="80" height="80" rx="18" fill="none" stroke="{p["shade"]}" stroke-width="4" stroke-dasharray="6 7"/>',
        face_tile(326, 192, 3, p['body'], s=0.9),
        '<path d="M278 190 Q248 200 226 172" fill="none" stroke-width="4" stroke-dasharray="2 12"/>',
        arrowhead(220, 164, 235),
        sparkle(382, 150, 12),
    ])


def heavy_die():
    """D3 Heavy Die: a weighty die thuds down; the 1 and the 2 fly off, crossed out."""
    p = PALETTES['D']
    heavy = dict(p, body=p['shade'], shade='#4b3986', light=p['body'])
    slash = '<path d="M{0} {1} L{2} {3}" fill="none" stroke-width="8"/>'
    return '\n'.join([
        shadow(204, 228, 84, 8),
        '<g fill="none" stroke-width="4"><path d="M150 14 L150 44"/><path d="M204 4 L204 26"/><path d="M258 14 L258 44"/></g>',
        '<path d="M80 190 L62 180 M318 190 L336 180" fill="none" stroke-width="5"/>',
        dust((88, 216, 7), (104, 222, 11), (122, 216, 9), (320, 216, 7), (304, 222, 11), (286, 216, 9)),
        die3d('d3', heavy, 204, 140, 48, {'F': 5, 'T': 6, 'R': 4}),
        face_tile(62, 78, 1, p['ghost'], pip=p['shade'], s=0.8, rot=-18) + slash.format(34, 50, 90, 106),
        face_tile(346, 72, 2, p['ghost'], pip=p['shade'], s=0.8, rot=16) + slash.format(318, 44, 374, 100),
    ])


def golden_die():
    """D4 Golden Die: a shining golden die, any face you like."""
    p, g = PALETTES['D'], PALETTES['C']
    rays = ''.join(f'<path d="M{204 + 96 * math.cos(a):.0f} {124 + 96 * math.sin(a):.0f} L{204 + 124 * math.cos(a):.0f} {124 + 124 * math.sin(a):.0f}"/>'
                   for a in (math.radians(d) for d in (-160, -125, -90, -55, -20, 20, 160)))
    return '\n'.join([
        f'<g fill="none" stroke="{g["light"]}" stroke-width="8">{rays}</g>',
        shadow(204, 228, 70, 7),
        die3d('d4', g, 204, 130, 46, {'F': 6, 'T': 5, 'R': 4}),
        sparkle(68, 64, 18), sparkle(346, 56, 13), sparkle(350, 186, 17), sparkle(60, 182, 11),
        sparkle(254, 84, 9, p['bg']),
    ])


def choose_roll():
    """D5 Choose Your Roll: two dice thrown, the better one picked, the other left pale."""
    p, o = PALETTES['D'], other('D')
    return '\n'.join([
        shadow(118, 226, 46),
        shadow(286, 228, 52),
        f'<ellipse cx="286" cy="226" rx="70" ry="10" fill="none" stroke="{p["shade"]}" stroke-width="4" stroke-dasharray="6 7"/>',
        die3d('d5a', o, 118, 162, 34, {'F': 2, 'T': 6, 'R': 3}, roll=-10, pip=p['shade']),
        die3d('d5b', p, 286, 148, 40, {'F': 5, 'T': 3, 'R': 1}, roll=6),
        '<path d="M286 16 L286 52" fill="none" stroke-width="4" stroke-dasharray="2 12"/>',
        arrowhead(286, 76, 90, p['body']),
        sparkle(360, 70, 12), sparkle(214, 84, 8),
    ])


CARDS = {  # id: (name, category, seed, drawing)
    'M1': ('Dash', 'M', 5, dash),
    'M2': ('Setback', 'M', 7, setback),
    'M3': ('Swap Places', 'M', 11, swap_places),
    'M4': ('Double Move', 'M', 13, double_move),
    'M5': ('Tailgate', 'M', 9, tailgate),
    'M6': ('Rewind', 'M', 15, rewind),
    'D1': ('Extra Die', 'D', 17, extra_die),
    'D2': ('Choose a Face', 'D', 19, choose_face),
    'D3': ('Heavy Die', 'D', 21, heavy_die),
    'D4': ('Golden Die', 'D', 23, golden_die),
    'D5': ('Choose Your Roll', 'D', 25, choose_roll),
}


def main():
    out = {}
    for cid, (name, cat, seed, draw) in CARDS.items():
        svg = picture(cid, name, cat, seed, draw())
        path = os.path.join(HERE, f'{cid}.svg')
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(svg)
        out[cid] = (name, cat, svg)
        print('wrote', os.path.relpath(path, ROOT))
    if '--preview' in sys.argv:
        preview(out)


def preview(out):
    """A page with each picture in a card mock-up at its real size and at 2x; tmp/ is not in git."""
    cat_colors = {'M': '#e8743b', 'D': '#7b5ce0', 'B': '#2aa876', 'H': '#d64545', 'P': '#2b8fd6', 'C': '#b58a12'}
    rows = []
    for cid, (name, cat, svg) in out.items():
        small = svg.replace(f'width="{W}" height="{H}"', 'width="204" height="128" style="display:block"', 1)
        big = (svg.replace(f'width="{W}" height="{H}"', f'width="{W}" height="{H}" style="display:block"', 1)
               .replace('id="', 'id="x-').replace('url(#', 'url(#x-'))
        rows.append(f'''<div style="display:flex;gap:24px;align-items:flex-start;margin-bottom:24px">
<div style="flex:none;width:256px;height:358px;background:#f3f1ec;border:3px solid #9aa0a6;border-radius:18px;position:relative;box-sizing:border-box">
<div style="position:absolute;left:20px;top:22px;font:bold 24px 'Trebuchet MS'">{name}</div>
<div style="position:absolute;left:23px;top:73px;width:204px;height:128px;border:2px solid {cat_colors[cat]};border-radius:12px;overflow:hidden;box-sizing:border-box">{small}</div>
</div>{big}</div>''')
    page = '<!doctype html><meta charset="utf-8"><body style="margin:16px;background:#ddd">' + '\n'.join(rows)
    path = os.path.join(ROOT, 'tmp', 'card-art-preview.html')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(page)
    print('wrote', os.path.relpath(path, ROOT))


if __name__ == '__main__':
    main()
