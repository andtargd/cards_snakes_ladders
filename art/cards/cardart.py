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
    'B': dict(body='#2aa876', shade='#2a8263', light='#6ec4a2', ghost='#aadcc8', bg='#e1f3ec',
              tuft='#c9e05a', tuft_line='#8fab2a'),  # a lime sprout instead of the gold tuft
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
    'moon': [(102, 442, 26, 35), (298, 458, 28, 0)],  # a step forward: the back foot on its toe, the front one flat
    'none': [],  # drawn by the card itself (P2's boots)
}


def place(x, y, s, rot=0):
    """Puts the base's bottom centre at (x, y), the pawn s times its mascot size, leaning rot degrees."""
    return f'translate({x} {y}) scale({s}) rotate({rot}) translate(-200 -450)'


def at(x, y, s, rot, fx, fy):
    """Where the point (fx, fy) of the mascot frame lands on the picture, the pawn put by place(x, y, s, rot)."""
    a = math.radians(rot)
    dx, dy = (fx - 200) * s, (fy - 450) * s
    return x + dx * math.cos(a) - dy * math.sin(a), y + dx * math.sin(a) + dy * math.cos(a)


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
    if kind == 'sad':  # brows up in the middle, eyes down, a frown
        return (_cheeks((150, 200), (256, 196))
                + '<path d="M154 130 Q168 126 188 114 M214 110 Q234 118 250 124" fill="none" stroke-width="6"/>'
                + _eye(172, 160, 18, 22, 176, 168, 8) + _eye(230, 158, 20, 24, 235, 166, 9)
                + '<path d="M188 216 Q206 202 226 212" fill="none" stroke-width="6"/>')
    if kind == 'poker':  # the eyes hidden (under a hat), a flat mouth
        return '<path d="M188 214 L228 212" fill="none" stroke-width="6"/>'
    if kind == 'sleep':  # eyes shut, a small open mouth
        return (_cheeks((148, 194), (258, 190))
                + '<path d="M156 130 Q170 124 186 128 M216 124 Q232 118 248 122" fill="none" stroke-width="6"/>'
                + '<path d="M154 158 Q172 172 190 158 M212 156 Q231 171 250 156" fill="none" stroke-width="7"/>'
                + f'<ellipse cx="206" cy="206" rx="9" ry="8" fill="{MOUTH}" stroke-width="5"/>')
    raise ValueError(kind)


def pawn(uid, pal, transform, *, face_kind='happy', look='right', tuft='up', feet='stand', arms='', front=''):
    """The pawn (tuft=None: bald, as other players are). `arms` go behind the body (start them inside it), `front` over everything (a hand in front)."""
    p = pal
    tuft_svg = ''
    if tuft:
        tuft_d, tuft_line = TUFTS[tuft]
        tuft_svg = (f'<path d="{tuft_d}" fill="{p.get("tuft", TUFT_FILL)}" stroke-width="6"/>'
                    f'<path d="{tuft_line}" fill="none" stroke="{p.get("tuft_line", TUFT_LINE)}" stroke-width="5"/>')
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


# The Board cards: the things a card puts on the board, drawn as objects in the pawn's style (no board around them).

SWAMP = dict(body='#6f8130', shade='#4f5f1f', light='#9aab52')  # olive mud, as the 'Stuck!' popup


def ladder(x, y, h, rot, pal, w=44, rungs=4):
    """A ladder standing on (x, y), h tall, w wide, leaning rot degrees."""
    rail = f'M{-w / 2} 0 L{-w / 2} {-h} M{w / 2} 0 L{w / 2} {-h}'
    step = h / (rungs + 1)
    rung = ' '.join(f'M{-w / 2} {-step * (i + 1):.0f} L{w / 2} {-step * (i + 1):.0f}' for i in range(rungs))
    return (f'<g transform="translate({x} {y}) rotate({rot})" fill="none">'
            f'<path d="{rung}" stroke-width="17"/><path d="{rung}" stroke="{pal["shade"]}" stroke-width="7"/>'
            f'<path d="{rail}" stroke-width="22"/><path d="{rail}" stroke="{pal["body"]}" stroke-width="10"/>'
            f'<path d="M{-w / 2 - 1} {-h * 0.12:.0f} L{-w / 2 - 1} {-h * 0.6:.0f}" stroke="{pal["light"]}" stroke-width="4"/></g>')


def snake(body, head, pal, *, look='left', face_kind='sly', s=1):
    """A snake: body is its path from the neck to the tail; head (x, y) at the neck, the face looking `look`."""
    hx, hy = head
    k = -1 if look == 'left' else 1
    eyes = ''
    for ex in (-8, 12):
        x = hx + k * ex * s
        eyes += (f'<ellipse cx="{x}" cy="{hy - 12 * s}" rx="{8 * s}" ry="{10 * s}" fill="#ffffff" stroke-width="4"/>'
                 f'<circle cx="{x + k * 3 * s}" cy="{hy - 11 * s}" r="{4 * s}" fill="{INK}" stroke="none"/>')
    if face_kind == 'sly':  # heavy lids
        eyes += ''.join(f'<path d="M{hx + k * (ex - 9) * s} {hy - 16 * s} L{hx + k * (ex + 9) * s} {hy - 13 * s}" fill="none" stroke-width="5"/>'
                        for ex in (-8, 12))
    tongue = (f'<path d="M{hx + k * 30 * s} {hy + 4 * s} L{hx + k * 46 * s} {hy + 8 * s} L{hx + k * 54 * s} {hy + 2 * s}'
              f' M{hx + k * 46 * s} {hy + 8 * s} L{hx + k * 54 * s} {hy + 14 * s}" fill="none" stroke="{TONGUE}" stroke-width="{4 * s}"/>')
    return (f'<path d="{body}" fill="none" stroke-width="{34 * s}"/>'
            f'<path d="{body}" fill="none" stroke="{pal["body"]}" stroke-width="{22 * s}"/>'
            f'<path d="{body}" fill="none" stroke="{pal["shade"]}" stroke-width="{22 * s}" stroke-dasharray="{8 * s} {18 * s}"/>'
            f'<path d="{body}" fill="none" stroke="{pal["light"]}" stroke-width="{4 * s}" stroke-dasharray="{14 * s} {12 * s}" transform="translate({-4 * s} {-5 * s})"/>'
            + tongue
            + f'<ellipse cx="{hx}" cy="{hy}" rx="{32 * s}" ry="{22 * s}" fill="{pal["body"]}" stroke-width="7"/>'
            f'<ellipse cx="{hx - 10 * s}" cy="{hy - 12 * s}" rx="{10 * s}" ry="{4 * s}" fill="{pal["light"]}" stroke="none"/>'
            f'<path d="M{hx + k * 14 * s} {hy + 8 * s} Q{hx + k * 22 * s} {hy + 12 * s} {hx + k * 28 * s} {hy + 6 * s}" fill="none" stroke-width="4"/>'
            + eyes)


def portal(uid, cx, cy, rx, ry, pal):
    """A portal seen from the side: a ring with a swirl inside."""
    swirl = ' '.join(f'M{cx} {cy - ry * f:.0f} Q{cx + rx * f * 0.9:.0f} {cy:.0f} {cx} {cy + ry * f:.0f}' for f in (0.72, 0.44))
    return (f'<clipPath id="{uid}-in"><ellipse cx="{cx}" cy="{cy}" rx="{rx - 10}" ry="{ry - 12}"/></clipPath>'
            f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{pal["body"]}" stroke-width="7"/>'
            f'<ellipse cx="{cx}" cy="{cy}" rx="{rx - 10}" ry="{ry - 12}" fill="{pal["shade"]}" stroke-width="5"/>'
            f'<g clip-path="url(#{uid}-in)"><path d="{swirl}" fill="none" stroke="{pal["light"]}" stroke-width="5"/></g>'
            f'<path d="M{cx - rx + 5} {cy - ry * 0.3:.0f} Q{cx - rx + 4} {cy - ry * 0.75:.0f} {cx - rx * 0.4:.0f} {cy - ry + 6}" fill="none" stroke="{pal["light"]}" stroke-width="4"/>')


def swamp():
    """B1 Swamp: the pawn sunk to the waist in the mud, arms up; the mud bubbles."""
    p, m = PALETTES['B'], SWAMP
    return '\n'.join([
        '<clipPath id="b1-mud"><ellipse cx="204" cy="208" rx="150" ry="30"/></clipPath>',
        f'<ellipse cx="204" cy="208" rx="150" ry="30" fill="{m["body"]}" stroke="none"/>',
        f'<path d="M40 214 Q204 250 368 214 L368 250 L40 250 Z" fill="{m["shade"]}" stroke="none" clip-path="url(#b1-mud)"/>',
        f'<ellipse cx="204" cy="208" rx="150" ry="30" fill="none" stroke-width="7"/>',
        f'<path d="M80 202 Q104 190 140 186" fill="none" stroke="{m["light"]}" stroke-width="5"/>',
        '<clipPath id="b1-above"><path d="M0 0 L408 0 L408 206 Q300 210 240 204 Q204 212 168 204 Q100 210 0 206 Z"/></clipPath>',
        '<g clip-path="url(#b1-above)">',
        pawn('b1', p, place(204, 286, 0.56, -4), face_kind='shock', tuft='up',
             arms=arm('M178 300 C150 290 130 262 124 232', p['body']) + glove(120, 214, -20)
             + arm('M222 298 C262 290 290 262 300 232', p['body']) + glove(302, 214, 20),
             front=drop(300, 110, 40)),
        '</g>',
        f'<path d="M156 206 Q180 196 204 206 Q228 196 252 206 Q228 216 204 213 Q180 216 156 206 Z" fill="{m["light"]}" stroke-width="5"/>',
        f'<g fill="{m["light"]}" stroke-width="4"><circle cx="92" cy="208" r="9"/><circle cx="112" cy="196" r="5"/>'
        f'<circle cx="318" cy="200" r="11"/><circle cx="340" cy="214" r="6"/><circle cx="298" cy="218" r="4"/></g>',
        '<path d="M318 172 Q324 162 334 164 M80 180 Q86 170 96 172" fill="none" stroke-width="4"/>',
    ])


def ladder_to_snake():
    """B2 Ladder to Snake: a pale ladder turns, with a puff of magic, into a sly snake."""
    p, o = PALETTES['B'], other('B')
    return '\n'.join([
        shadow(92, 232, 46),
        shadow(296, 232, 70),
        ladder(92, 226, 196, -8, o, rungs=4),
        '<path d="M142 150 L218 150" fill="none" stroke-width="6"/>',
        arrowhead(238, 150, 0),
        snake('M270 92 C330 104 346 140 300 160 C250 180 260 216 340 218', (252, 84), p, look='left'),
        sparkle(372, 60, 14), sparkle(176, 108, 10), sparkle(362, 150, 8),
    ])


def snake_to_ladder():
    """B3 Snake to Ladder: a pale, dizzy snake turns into a shining ladder."""
    p, o = PALETTES['B'], other('B')
    return '\n'.join([
        shadow(112, 232, 70),
        shadow(304, 232, 46),
        snake('M128 96 C68 108 54 142 100 162 C150 182 140 216 64 218', (146, 88), o, look='right', face_kind='neutral'),
        '<path d="M172 150 L244 150" fill="none" stroke-width="6"/>',
        arrowhead(264, 150, 0),
        ladder(304, 226, 200, 6, p, rungs=4),
        sparkle(372, 44, 15), sparkle(226, 108, 10), sparkle(370, 170, 9),
    ])


def trampoline():
    """B4 Trampoline: the pawn bounces off the mat high and forward."""
    p = PALETTES['B']
    return '\n'.join([
        shadow(110, 236, 78, 7),
        '<g stroke-width="8" fill="none"><path d="M52 210 L44 234 M168 210 L176 234 M110 216 L110 236"/></g>',
        f'<g stroke="{p["body"]}" stroke-width="3" fill="none"><path d="M52 210 L44 234 M168 210 L176 234 M110 216 L110 236"/></g>',
        f'<ellipse cx="110" cy="202" rx="70" ry="18" fill="{p["body"]}" stroke-width="7"/>',
        f'<path d="M50 200 Q110 226 170 200 Q110 196 50 200 Z" fill="{p["shade"]}" stroke-width="5"/>',
        f'<path d="M58 196 Q80 188 104 187" fill="none" stroke="{p["light"]}" stroke-width="4"/>',
        '<path d="M86 176 Q110 166 134 176 M78 158 Q110 144 142 158" fill="none" stroke-width="4"/>',
        '<path d="M120 196 Q170 40 300 64" fill="none" stroke-width="4" stroke-dasharray="2 12"/>',
        dust((150, 178, 12), (170, 184, 9), (166, 162, 8), (132, 186, 7)),  # kicked up at the take-off
        ghost(place(180, 150, 0.34, 10), p['ghost'], 0.6, 'back'),
        shadow(318, 238, 26, 4),
        pawn('b4', p, place(306, 184, 0.4, 18), face_kind='happy', tuft='back', feet='tuck',
             arms=arm('M178 300 C146 290 126 262 120 232', p['body']) + glove(116, 214, -20)
             + arm('M222 298 C262 290 290 262 300 232', p['body']) + glove(302, 214, 20)),
        sparkle(372, 30, 11),
    ])


def portal_card():
    """B5 Portal: the pawn steps into one portal and out of the other."""
    p = PALETTES['B']
    gate = dict(p, shade='#1f6b4f')
    return '\n'.join([
        shadow(110, 234, 40),
        shadow(300, 234, 60),
        # each pawn is drawn in front of its portal, cut at the portal's plane: in on the left, out on the right
        portal('b5a', 110, 146, 28, 84, gate),
        portal('b5b', 290, 146, 28, 84, gate),
        '<clipPath id="b5-left"><rect x="0" y="0" width="110" height="256"/></clipPath>',
        f'<g clip-path="url(#b5-left)">{ghost(place(92, 228, 0.42, 10), p["ghost"], 1, "back")}</g>',
        lines((14, 120, 44), (6, 168, 34)),
        '<clipPath id="b5-right"><rect x="290" y="0" width="118" height="256"/></clipPath>',
        '<g clip-path="url(#b5-right)">',
        pawn('b5', p, place(328, 228, 0.42, 10), face_kind='happy', tuft='back', feet='run',
             arms=arm('M222 298 C258 290 284 262 296 232', p['body']) + glove(298, 214, 20)),
        '</g>',
        '<path d="M154 146 L230 146" fill="none" stroke-width="6"/>',
        arrowhead(250, 146, 0),
        sparkle(388, 40, 11), sparkle(28, 46, 9),
    ])


def earthquake():
    """B6 Earthquake: the pawn shakes dizzy; the ladder and the snake beside it hop off their places."""
    p, o = PALETTES['B'], other('B')
    return '\n'.join([
        f'<path d="M20 222 L70 210 L96 224 L140 206 L170 220 M238 220 L270 206 L310 222 L352 208 L390 220" fill="none" stroke-width="6"/>',
        shadow(204, 232, 40),
        ladder(84, 200, 124, -14, p, w=32, rungs=3),
        snake('M346 112 C392 122 394 156 360 166 C326 176 332 198 388 196', (328, 104), p, look='left', face_kind='shock', s=0.8),
        ghost(place(188, 226, 0.42, -6), p['ghost'], 0.6),
        ghost(place(220, 226, 0.42, 6), p['ghost'], 0.6),
        pawn('b6', p, place(204, 228, 0.42, 0), face_kind='dizzy', tuft='up', feet='skid',
             arms=arm('M178 300 C138 296 104 272 88 244', p['body']) + glove(80, 226, -35)
             + arm('M222 298 C262 296 296 272 312 244', p['body']) + glove(320, 226, 35)),
        '<path d="M128 70 Q120 86 128 102 M116 62 Q104 86 116 110 M280 70 Q288 86 280 102 M292 62 Q304 86 292 110" fill="none" stroke-width="4"/>',
    ])


# The Hinder cards: the red pawn is the player the card is played on.

IRON = dict(body=SHOE, shade='#454d5b', light='#8a93a3')


def iron_ball(cx, cy, r):
    return (f'<clipPath id="ball-{cx}"><circle cx="{cx}" cy="{cy}" r="{r}"/></clipPath>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{IRON["body"]}" stroke="none"/>'
            f'<circle cx="{cx + r * 0.35:.0f}" cy="{cy + r * 0.35:.0f}" r="{r}" fill="none" stroke="{IRON["shade"]}" stroke-width="{r * 0.5:.0f}" clip-path="url(#ball-{cx})"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke-width="7"/>'
            f'<ellipse cx="{cx - r * 0.4:.0f}" cy="{cy - r * 0.45:.0f}" rx="{r * 0.3:.0f}" ry="{r * 0.14:.0f}" transform="rotate(-35 {cx - r * 0.4:.0f} {cy - r * 0.45:.0f})" fill="{IRON["light"]}" stroke="none"/>')


def chain(a, b, n):
    """n links from a to b, every other one seen edge-on."""
    (x0, y0), (x1, y1) = a, b
    ang = math.degrees(math.atan2(y1 - y0, x1 - x0))
    out = []
    for i in range(n):
        t = (i + 0.5) / n
        x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        ry = 6 if i % 2 == 0 else 2
        out.append(f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="10" ry="{ry}" transform="rotate({ang:.0f} {x:.1f} {y:.1f})"/>')
    return f'<g fill="none" stroke-width="5">{"".join(out)}</g>'


def crown(cx, cy, rot, s=1):
    """A golden crown, centre (cx, cy)."""
    g = PALETTES['C']
    shape = 'M-36 18 L-42 -16 L-18 2 L0 -28 L18 2 L42 -16 L36 18 Z'
    return (f'<g transform="translate({cx} {cy}) rotate({rot}) scale({s})">'
            f'<clipPath id="crown-{cx}"><path d="{shape}"/></clipPath>'
            f'<path d="{shape}" fill="{g["light"]}" stroke="none"/>'
            f'<rect x="-50" y="4" width="100" height="20" fill="{g["body"]}" stroke="none" clip-path="url(#crown-{cx})"/>'
            f'<path d="{shape}" fill="none" stroke-width="6"/><path d="M-37 4 L37 4" fill="none" stroke-width="4"/>'
            f'<g fill="{GLOVE}" stroke-width="4"><circle cx="-42" cy="-16" r="5"/><circle cx="0" cy="-28" r="5"/><circle cx="42" cy="-16" r="5"/></g>'
            f'<circle cx="0" cy="12" r="5" fill="{PALETTES["H"]["body"]}" stroke-width="3"/></g>')


def zee(x, y, s, col):
    """A sleeper's Z, top left at (x, y), s across."""
    d = f'M{x} {y} L{x + s} {y} L{x} {y + s} L{x + s} {y + s}'
    return f'<path d="{d}" fill="none" stroke-width="{s * 0.5:.0f}"/><path d="{d}" fill="none" stroke="{col}" stroke-width="{s * 0.22:.0f}"/>'


def playing_card(cx, cy, rot, pal, s=1):
    """A card s times 56x80, its bottom centre at (cx, cy), turned rot degrees about it."""
    return (f'<g transform="translate({cx} {cy}) rotate({rot}) scale({s})">'
            f'<rect x="-28" y="-80" width="56" height="80" rx="9" fill="{GLOVE}" stroke-width="{6 / s:.1f}"/>'
            f'<rect x="-19" y="-71" width="38" height="62" rx="5" fill="none" stroke="{pal["light"]}" stroke-width="4"/>'
            f'<path d="M0 -56 L11 -40 L0 -24 L-11 -40 Z" fill="{pal["body"]}" stroke-width="4"/></g>')


FEDORA = dict(body='#3b3444', light='#5a5166', band='#ffffff')


def fedora(rot=12, low=0, s=1):
    """A fedora on the pawn's head, in the mascot frame, tipped forward; low pulls it down over the eyes
    (then make it s times bigger, so the crown still covers the head)."""
    c = 'M132 108 C132 62 150 30 200 28 C250 30 268 62 268 108 Z'
    return (f'<g transform="translate(0 {low}) rotate({rot} 200 110) translate(200 110) scale({s}) translate(-200 -110)">'
            f'<ellipse cx="200" cy="110" rx="122" ry="22" fill="{FEDORA["body"]}" stroke-width="7"/>'
            f'<path d="M96 104 Q140 94 170 94" fill="none" stroke="{FEDORA["light"]}" stroke-width="5"/>'
            f'<clipPath id="fedora-crown"><path d="{c}"/></clipPath>'
            f'<path d="{c}" fill="{FEDORA["body"]}" stroke="none"/>'
            f'<rect x="120" y="84" width="160" height="18" fill="{FEDORA["band"]}" stroke-width="5" clip-path="url(#fedora-crown)"/>'
            f'<path d="M150 44 C150 64 154 74 160 80" fill="none" stroke="{FEDORA["light"]}" stroke-width="6"/>'
            f'<path d="{c}" fill="none"/><path d="M162 40 Q200 56 238 40" fill="none" stroke-width="5"/></g>')


def note(x, y):
    """A music note, its head at (x, y)."""
    return (f'<path d="M{x + 9} {y - 2} L{x + 9} {y - 40} Q{x + 26} {y - 32} {x + 24} {y - 16}" fill="none" stroke-width="5"/>'
            f'<ellipse cx="{x}" cy="{y}" rx="11" ry="8" transform="rotate(-20 {x} {y})" fill="{PALETTES["H"]["body"]}" stroke-width="5"/>')


def no_sign(cx, cy, r, col):
    """A prohibition sign: a ring with a slash."""
    k = r * 0.707
    slash = f'M{cx - k:.0f} {cy - k:.0f} L{cx + k:.0f} {cy + k:.0f}'
    return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke-width="26"/><path d="{slash}" fill="none" stroke-width="26"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{col}" stroke-width="13"/>'
            f'<path d="{slash}" fill="none" stroke="{col}" stroke-width="13"/>')


def slow_down():
    """H1 Slow Down: the pawn strains forward, an iron ball chained to its foot."""
    p = PALETTES['H']
    return '\n'.join([
        shadow(262, 240, 44),
        shadow(100, 234, 30, 5),
        lines((14, 188, 44), (6, 212, 40)),
        dust((130, 226, 7), (66, 228, 6)),
        chain((124, 210), (226, 214), 6),
        iron_ball(100, 202, 30),
        pawn('h1', p, place(262, 226, 0.46, 16), face_kind='determined', tuft='up', feet='run',
             arms=arm('M178 300 C150 310 132 330 124 352', p['body']) + fist(122, 362, 16)
             + arm('M222 298 C258 296 286 286 304 268', p['body']),
             front=drop(104, 160, -20) + drop(84, 210, -40) + fist(310, 262)),
    ])


def vanilla_play():
    """H2 Vanilla play: the cards are off limits; the pawn reaches for them, sad."""
    p = PALETTES['H']
    return '\n'.join([
        shadow(110, 240, 42),
        shadow(288, 232, 56, 5),
        playing_card(270, 214, -24, p, 1.25), playing_card(288, 208, 0, p, 1.25), playing_card(306, 214, 24, p, 1.25),
        no_sign(342, 82, 32, p['body']),
        pawn('h2', p, place(108, 236, 0.44, 4), face_kind='sad',
             arms=arm('M178 300 C150 312 138 330 134 352', p['body']) + glove(132, 366, 180)
             + arm('M222 298 C262 300 292 296 320 286', p['body']),
             front=glove(336, 282, 80)),
    ])


def skip_turn():
    """H3 Skip Turn: the pawn sleeps through its turn."""
    p = PALETTES['H']
    return '\n'.join([
        shadow(176, 240, 42),
        zee(254, 98, 22, p['light']), zee(290, 50, 34, p['body']),
        pawn('h3', p, place(176, 238, 0.44, -6), face_kind='sleep',
             arms=arm('M178 300 C150 312 138 330 134 352', p['body']) + glove(132, 366, 180)
             + arm('M222 300 C250 312 262 330 266 352', p['body']) + glove(268, 366, 180)),
    ])


def moonwalk():
    """H4 Moonwalk: in a fedora, the pawn glides backwards facing forward, the front foot up on its toe."""
    p = PALETTES['H']
    return '\n'.join([
        shadow(196, 240, 56),
        lines((300, 112, 352), (318, 156, 380), (300, 200, 344)),
        note(56, 104), note(98, 62),
        pawn('h4', p, place(196, 230, 0.46, 8), face_kind='poker', tuft=None, feet='moon',
             arms=arm('M178 300 C150 316 140 342 146 368', p['body']) + glove(148, 382, 170)
             + arm('M222 298 C272 296 306 260 312 218', p['body']),
             front=fedora(low=56, s=1.22) + glove(318, 200, 30)),
    ])


def dethrone():
    """H5 Dethrone: the leader is knocked back from the top, its crown flying off."""
    p = PALETTES['H']
    return '\n'.join([
        shadow(132, 240, 34, 5),
        ghost(place(326, 230, 0.42, 0), p['ghost'], 0.55),
        ghost(place(250, 222, 0.42, -10), p['ghost'], 1, 'forward'),
        '<path d="M216 74 Q238 16 280 32" fill="none" stroke-width="4" stroke-dasharray="2 12"/>',
        crown(318, 54, 24, 1.08),
        sparkle(370, 106, 12), sparkle(262, 76, 8),
        pawn('h5', p, place(150, 212, 0.42, -22), face_kind='shock', tuft='forward', feet='tuck',
             arms=arm('M178 300 C150 290 130 262 124 232', p['body']) + glove(120, 214, -20)
             + arm('M222 298 C262 290 290 262 300 232', p['body']) + glove(302, 214, 20),
             front=drop(304, 112, 40)),
    ])


# The Protection cards: the blue pawn and the thing that keeps it safe.

RUBBER = dict(body=TUFT_FILL, shade=TUFT_LINE, light='#fbe08f')  # yellow rubber boots


def canopy(cx, top, w, h, pal, gores=5):
    """A parachute's canopy, its top centre at (cx, top), w wide, h tall; returns it and the points of its
    bottom edge where the lines hang from."""
    l, r, b = cx - w / 2, cx + w / 2, top + h
    xs = [l + w * i / gores for i in range(gores + 1)]
    dome = f'M{l} {b} C{l} {top - h / 3:.1f} {r} {top - h / 3:.1f} {r} {b}'  # its apex at (cx, top)
    for i in range(gores, 0, -1):
        dome += f' Q{(xs[i] + xs[i - 1]) / 2} {b - 12} {xs[i - 1]} {b}'
    out = [f'<clipPath id="canopy-{cx}"><path d="{dome} Z"/></clipPath>',
           f'<path d="{dome} Z" fill="{pal["body"]}" stroke="none"/>', f'<g clip-path="url(#canopy-{cx})">']
    for i in range(0, gores, 2):  # every other gore lighter
        a, c = xs[i], xs[i + 1]
        out.append(f'<path d="M{cx} {top} Q{a * 0.8 + cx * 0.2:.0f} {top + 4} {a} {b} L{c} {b} Q{c * 0.8 + cx * 0.2:.0f} {top + 4} {cx} {top} Z" fill="{pal["light"]}" stroke="none"/>')
    out.append(f'<path d="M{l} {b - 14} Q{cx} {b - 34} {r} {b - 14} L{r} {b + 10} L{l} {b + 10} Z" fill="{pal["shade"]}" opacity="0.6" stroke="none"/>')
    seams = ' '.join(f'M{cx} {top} Q{x * 0.8 + cx * 0.2:.0f} {top + 4} {x} {b}' for x in xs[1:-1])
    out.append(f'<path d="{seams}" fill="none" stroke-width="4"/>')
    out.append(f'<path d="M{l + 14} {b - 20} Q{l + 22} {top + 18} {cx - w * 0.2:.0f} {top + 8}" fill="none" stroke="#ffffff" stroke-width="5" opacity="0.8"/></g>')
    out.append(f'<path d="{dome} Z" fill="none" stroke-width="7"/>')
    return '\n'.join(out), [(x, b) for x in xs]


def boot(cx, cy, rot=0):
    """A rubber boot in the mascot frame, the sole's centre at (cx, cy), the toe to the right."""
    shape = 'M-26 -58 L18 -58 L18 -18 Q44 -18 48 2 L48 10 L-30 10 L-30 -6 Z'
    return (f'<g transform="translate({cx} {cy}) rotate({rot}) scale(1.4)">'
            f'<clipPath id="boot-{cx}"><path d="{shape}"/></clipPath>'
            f'<path d="{shape}" fill="{RUBBER["body"]}" stroke="none"/>'
            f'<g clip-path="url(#boot-{cx})" stroke="none"><rect x="6" y="-60" width="20" height="50" fill="{RUBBER["shade"]}"/>'
            f'<rect x="-40" y="-2" width="100" height="14" fill="{SHOE}"/><rect x="-40" y="-64" width="70" height="14" fill="{RUBBER["light"]}"/></g>'
            f'<path d="{shape}" fill="none" stroke-width="6"/><path d="M-28 -50 L18 -50 M-30 -2 L48 -2" fill="none" stroke-width="4"/>'
            f'<ellipse cx="-4" cy="-58" rx="22" ry="5" fill="{RUBBER["shade"]}" stroke-width="4"/></g>')  # its opening


def shield(cx, cy, s=1, rot=0):
    """A shield, centre (cx, cy), s times 84x112: a gold rim, the category's blue, a cream tick (the game's icon)."""
    p, g = PALETTES['P'], PALETTES['C']
    outer = 'M0 -56 L42 -42 Q40 20 0 56 Q-40 20 -42 -42 Z'
    inner = 'M0 -42 L30 -32 Q28 14 0 42 Q-28 14 -30 -32 Z'
    return (f'<g transform="translate({cx} {cy}) rotate({rot}) scale({s})">'
            f'<path d="{outer}" fill="{g["light"]}" stroke-width="{7 / s:.1f}"/>'
            f'<clipPath id="shield-{cx}"><path d="{inner}"/></clipPath>'
            f'<path d="{inner}" fill="{p["body"]}" stroke="none"/>'
            f'<path d="M0 -50 L0 50 L50 50 L50 -50 Z" fill="{p["shade"]}" stroke="none" clip-path="url(#shield-{cx})"/>'
            f'<path d="{inner}" fill="none" stroke-width="{5 / s:.1f}"/>'
            f'<path d="M-24 -26 Q-24 -32 -14 -35" fill="none" stroke="{p["light"]}" stroke-width="{5 / s:.1f}"/>'
            f'<path d="M-15 0 L-3 13 L17 -12" fill="none" stroke-width="{17 / s:.1f}"/><path d="M-15 0 L-3 13 L17 -12" fill="none" stroke="{GLOVE}" stroke-width="{8 / s:.1f}"/>'
            f'<path d="M-36 -40 L-8 -50" fill="none" stroke="#ffffff" stroke-width="{4 / s:.1f}"/>'
            f'<g fill="{g["body"]}" stroke-width="{3 / s:.1f}"><circle cx="0" cy="-49" r="3"/><circle cx="36" cy="-38" r="3"/><circle cx="-36" cy="-38" r="3"/><circle cx="0" cy="48" r="3"/></g></g>')


RUBY = PALETTES['H']['body']


def gem(cx, cy, r, fill, kind='round'):
    """A gem set in gold: round (a cabochon) or a rhombus, with a glint."""
    if kind == 'rhombus':
        body = f'<path d="M{cx} {cy - r * 1.3:.1f} L{cx + r} {cy} L{cx} {cy + r * 1.3:.1f} L{cx - r} {cy} Z" fill="{fill}" stroke-width="4"/>'
    else:
        body = f'<ellipse cx="{cx}" cy="{cy}" rx="{r}" ry="{r * 0.85:.1f}" fill="{fill}" stroke-width="4"/>'
    return body + f'<ellipse cx="{cx - r * 0.35:.1f}" cy="{cy - r * 0.35:.1f}" rx="{r * 0.3:.1f}" ry="{r * 0.2:.1f}" fill="#ffffff" stroke="none"/>'


def big_grail(cx, cy, s=1):
    """The Holy Grail, large and ornate: the rim's centre at (cx, cy); s times 144 wide, 186 tall below the rim."""
    g, p = PALETTES['C'], PALETTES['P']
    bowl = 'M-70 0 C-70 50 -38 76 -16 82 L16 82 C38 76 70 50 70 0 Z'
    foot = 'M-9 136 Q-12 154 -46 162 Q-62 166 -60 176 L60 176 Q62 166 46 162 Q12 154 9 136 Z'
    stem = 'M-14 82 L14 82 L10 96 L-10 96 Z M-8 112 L8 112 L10 138 L-10 138 Z'

    def metal(uid, d):  # a gold part: lit on the left, in shade on the right
        return (f'<clipPath id="{uid}"><path d="{d}"/></clipPath><path d="{d}" fill="{g["body"]}" stroke="none"/>'
                f'<g clip-path="url(#{uid})" stroke="none"><path d="M-90 -20 L-30 -20 Q-40 90 -26 200 L-90 200 Z" fill="{g["light"]}"/>'
                f'<path d="M90 -20 L36 -20 Q28 90 38 200 L90 200 Z" fill="{g["shade"]}"/></g><path d="{d}" fill="none" stroke-width="6"/>')
    return f'<g transform="translate({cx} {cy}) scale({s})">' + ''.join([
        metal('g-foot', foot),
        f'<rect x="-62" y="172" width="124" height="14" rx="6" fill="{g["shade"]}" stroke-width="6"/>',
        ''.join(f'<circle cx="{x}" cy="179" r="3" fill="{GLOVE}" stroke="none"/>' for x in (-44, -22, 0, 22, 44)),
        gem(0, 162, 7, RUBY),
        metal('g-stem', stem),
        f'<ellipse cx="0" cy="104" rx="24" ry="12" fill="{g["body"]}" stroke-width="6"/>',
        f'<path d="M-18 100 Q-10 94 0 94" fill="none" stroke="{g["light"]}" stroke-width="4"/>',
        gem(0, 104, 7, p['body'], 'rhombus'),
        metal('g-bowl', bowl),
        # an ornate band around the bowl, with gems
        f'<path d="M-66 24 Q0 44 66 24" fill="none" stroke-width="18"/><path d="M-66 24 Q0 44 66 24" fill="none" stroke="{g["shade"]}" stroke-width="9"/>',
        f'<path d="M-46 52 Q-30 62 -16 54 Q0 66 16 54 Q30 62 46 52" fill="none" stroke="{g["shade"]}" stroke-width="4"/>',
        gem(0, 34, 10, p['body'], 'rhombus'), gem(-38, 30, 7, RUBY), gem(38, 30, 7, RUBY),
        '<path d="M-58 14 Q-58 46 -40 62" fill="none" stroke="#ffffff" stroke-width="6" opacity="0.85"/>',
        # the rim and the light inside the cup
        f'<ellipse cx="0" cy="0" rx="72" ry="15" fill="{g["light"]}" stroke-width="6"/>',
        f'<ellipse cx="0" cy="1" rx="60" ry="10" fill="{g["shade"]}" stroke-width="4"/>',
        f'<ellipse cx="0" cy="3" rx="44" ry="6" fill="{GLOVE}" stroke="none"/>',
    ]) + '</g>'


def parachute():
    """P1 Parachute: the pawn floats down under a parachute, past a snake that only gets half a slide out of it."""
    p = PALETTES['P']
    x, y, s = 168, 228, 0.37
    hand_l, hand_r = at(x, y, s, 0, 120, 204), at(x, y, s, 0, 302, 204)
    dome, edge = canopy(x, 6, 206, 58, p)
    strings = ''.join(f'<path d="M{ex} {ey} L{(hand_l if ex < x else hand_r)[0]:.0f} {(hand_l if ex < x else hand_r)[1]:.0f}"/>'
                      for ex, ey in edge)
    return '\n'.join([
        shadow(170, 246, 30, 5),
        shadow(362, 232, 34, 5),
        '<path d="M60 98 L60 124 M80 140 L80 158 M276 98 L276 124 M256 140 L256 158" fill="none" stroke-width="4"/>',
        snake('M350 136 C392 146 394 180 354 192 C322 202 330 222 384 224', (330, 128), other('P'), look='left', face_kind='neutral', s=0.8),
        f'<g fill="none" stroke-width="3">{strings}</g>',
        dome,
        pawn('p1', p, place(x, y, s, 0), face_kind='happy', tuft='up', feet='tuck',
             arms=arm('M178 300 C150 290 130 262 124 232', p['body']) + arm('M222 298 C262 290 290 262 300 232', p['body']),
             front=glove(120, 204, -20) + glove(302, 204, 20)),
    ])


def swamp_boots():
    """P2 Swamp Boots: in yellow rubber boots the pawn marches right through the mud."""
    p, m = PALETTES['P'], SWAMP
    return '\n'.join([
        '<clipPath id="p2-mud"><ellipse cx="204" cy="222" rx="176" ry="26"/></clipPath>',
        f'<ellipse cx="204" cy="222" rx="176" ry="26" fill="{m["body"]}" stroke="none"/>',
        f'<path d="M20 226 Q204 262 388 226 L388 260 L20 260 Z" fill="{m["shade"]}" stroke="none" clip-path="url(#p2-mud)"/>',
        '<ellipse cx="204" cy="222" rx="176" ry="26" fill="none" stroke-width="7"/>',
        f'<path d="M60 214 Q90 204 130 202" fill="none" stroke="{m["light"]}" stroke-width="5"/>',
        f'<g fill="{m["light"]}" stroke-width="4"><circle cx="64" cy="226" r="8"/><circle cx="84" cy="236" r="5"/><circle cx="352" cy="220" r="7"/></g>',
        ghost(place(100, 196, 0.42, 6), p['ghost'], 0.4),
        f'<g fill="{m["body"]}" stroke-width="4"><circle cx="312" cy="196" r="7"/><circle cx="330" cy="178" r="5"/><circle cx="160" cy="194" r="6"/><circle cx="144" cy="176" r="4"/></g>',
        f'<path d="M176 222 Q190 212 204 222 M268 224 Q284 214 300 224" fill="none" stroke="{m["light"]}" stroke-width="5"/>',
        # the boots go under the base; the back one is turned so its opening faces the pawn
        pawn('p2', p, place(234, 196, 0.42, 6), face_kind='happy', tuft='up', feet='none',
             arms=boot(130, 490, 32) + boot(262, 500, 4)
             + arm('M178 300 C150 310 132 330 124 352', p['body']) + fist(122, 362, 16)
             + arm('M222 298 C258 290 284 270 296 244', p['body']),
             front=fist(302, 236)),
    ])


def shield_card():
    """P3 Shield: a shield stands between the pawn and the snake, and the snake bounces off it."""
    p, o = PALETTES['P'], other('P')
    return '\n'.join([
        shadow(86, 242, 40),
        shadow(204, 236, 50, 6),
        shadow(356, 238, 40, 5),
        snake('M354 136 C392 146 402 172 378 190 C354 208 362 228 402 230', (336, 120), o, look='left', face_kind='shock', s=0.8),
        '<path d="M282 78 L292 94 M304 70 L302 90 M276 108 L292 112" fill="none" stroke-width="5"/>',
        sparkle(386, 62, 10), sparkle(132, 40, 8),
        pawn('p3', p, place(84, 236, 0.44, -6), face_kind='determined', tuft='up', feet='stand',
             arms=arm('M178 300 C150 312 138 330 134 352', p['body']) + glove(132, 366, 180)
             + arm('M222 298 C250 296 272 290 290 280', p['body']),
             front=glove(300, 276, 80)),
        shield(204, 122, 1.45, 0),
    ])


def holy_grail():
    """P4 Holy Grail: the Grail alone, large and shining (a Legendary card)."""
    g = PALETTES['C']
    cx, cy, s = 204, 52, 0.9  # low enough to leave room for the light over it
    gy = cy + 70 * s  # the glow's centre
    rays = ''.join(f'<path d="M{cx + 82 * math.cos(a):.0f} {gy + 82 * math.sin(a):.0f} L{cx + 140 * math.cos(a):.0f} {gy + 140 * math.sin(a):.0f}"/>'
                   for a in (math.radians(d) for d in range(-180, 30, 22)))
    return '\n'.join([
        f'<g fill="none" stroke="{g["light"]}" stroke-width="9">{rays}</g>',
        f'<circle cx="{cx}" cy="{gy:.0f}" r="78" fill="#ffffff" opacity="0.55" stroke="none"/>',
        f'<path d="M{cx - 36} {cy} L{cx - 60} -10 L{cx + 60} -10 L{cx + 36} {cy} Z" fill="{GLOVE}" opacity="0.75" stroke="none"/>',  # light rising from the cup
        shadow(cx, 226, 68, 7),
        big_grail(cx, cy, s),
        sparkle(56, 60, 16), sparkle(350, 44, 12), sparkle(360, 170, 15), sparkle(48, 176, 10, g['light']),
        sparkle(300, 100, 8), sparkle(110, 116, 7),
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
    'B1': ('Swamp', 'B', 27, swamp),
    'B2': ('Ladder to Snake', 'B', 29, ladder_to_snake),
    'B3': ('Snake to Ladder', 'B', 31, snake_to_ladder),
    'B4': ('Trampoline', 'B', 33, trampoline),
    'B5': ('Portal', 'B', 35, portal_card),
    'B6': ('Earthquake', 'B', 37, earthquake),
    'H1': ('Slow Down', 'H', 39, slow_down),
    'H2': ('Vanilla play', 'H', 41, vanilla_play),
    'H3': ('Skip Turn', 'H', 43, skip_turn),
    'H4': ('Moonwalk', 'H', 45, moonwalk),
    'H5': ('Dethrone', 'H', 47, dethrone),
    'P1': ('Parachute', 'P', 49, parachute),
    'P2': ('Swamp Boots', 'P', 51, swamp_boots),
    'P3': ('Shield', 'P', 53, shield_card),
    'P4': ('Holy Grail', 'P', 55, holy_grail),
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
