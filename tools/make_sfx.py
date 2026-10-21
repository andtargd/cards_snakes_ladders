"""Synthesises the game's sound effects (all original, made here) as WAV, then MP3 through ffmpeg.
Soft and round on purpose: sine and triangle tones on a pentatonic scale, gentle attacks, a little
echo and a low-pass over everything, in the spirit of cheerful console games.
python tools/make_sfx.py [name ...]  ->  experience/sfx/*.mp3 (all of them, or only the ones named)"""
import math
import os
import random
import struct
import subprocess
import sys
import wave

SR = 22050
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'experience', 'sfx')
TMP = os.path.join(ROOT, 'tmp', 'sfx')
rnd = random.Random(11)

# a C major pentatonic
N = {'C4': 261.63, 'G4': 392.0, 'A4': 440.0, 'C5': 523.25, 'D5': 587.33, 'E5': 659.26, 'G5': 783.99, 'A5': 880.0,
     'C6': 1046.5, 'D6': 1174.66, 'E6': 1318.51, 'G6': 1567.98, 'A6': 1760.0, 'B6': 1975.53, 'C7': 2093.0}


def silence(sec):
    return [0.0] * int(SR * sec)


def mix(dst, src, at=0.0, gain=1.0):
    i0 = int(at * SR)
    if i0 + len(src) > len(dst):
        dst.extend([0.0] * (i0 + len(src) - len(dst)))
    for i, v in enumerate(src):
        dst[i0 + i] += v * gain
    return dst


def note(f0, sec, f1=None, wave_='tri', attack=0.008, decay=7.0, vib=0.0, vibf=5.5):
    """One soft note: a quick, rounded attack and an exponential fade."""
    f1 = f1 or f0
    n = int(SR * sec)
    out, ph = [], 0.0
    for i in range(n):
        t = i / SR
        k = i / max(1, n - 1)
        f = f0 * (f1 / f0) ** min(1.0, k * 1.6)
        f *= 1 + vib * math.sin(2 * math.pi * vibf * t)
        ph += 2 * math.pi * f / SR
        if wave_ == 'sine':
            v = math.sin(ph)
        else:  # a triangle with a touch of sine: round, a little woody
            v = 0.75 * (2 / math.pi) * math.asin(math.sin(ph)) + 0.25 * math.sin(ph)
        a = min(1.0, t / attack)
        a = a * a * (3 - 2 * a)
        tail = min(1.0, (n - i) / (0.012 * SR))
        out.append(v * a * math.exp(-decay * t) * tail)
    return out


def bell(f, sec, decay=5.0):
    s = note(f, sec, wave_='sine', attack=0.003, decay=decay)
    mix(s, note(f * 2.0, sec, wave_='sine', attack=0.003, decay=decay * 1.8), 0, 0.25)
    mix(s, note(f * 3.0, sec * 0.5, wave_='sine', attack=0.003, decay=decay * 3), 0, 0.08)
    return s


def noise(sec, lp=0.08, swell=True, decay=10.0):
    n = int(SR * sec)
    out, low, low2 = [], 0.0, 0.0
    for i in range(n):
        x = rnd.uniform(-1, 1)
        low += lp * (x - low)
        low2 += lp * (low - low2)
        k = i / n
        env = math.sin(math.pi * k) ** 2 if swell else math.exp(-decay * i / SR) * min(1.0, i / (0.004 * SR))
        out.append(low2 * env * 6)
    return out


def echo(s, delay=0.11, fb=0.3, wet=0.35, repeats=3):
    out = s + silence(delay * repeats + 0.05)
    for r in range(1, repeats + 1):
        mix(out, s, delay * r, wet * fb ** (r - 1))
    return out


def lowpass(s, a=0.45):
    y, out = 0.0, []
    for v in s:
        y += a * (v - y)
        out.append(y)
    return out


def arp(names, step, sec=0.22, wave_='tri', decay=9.0, gain=1.0):
    s = silence(step * len(names) + sec)
    for k, nm in enumerate(names):
        mix(s, note(N[nm], sec, wave_=wave_, decay=decay), k * step, gain)
    return s


# The dice: they tumble and come to rest showing the number LAND s after the throw (view.js: ROLL_LAND of
# ROLL_DUR). The game plays a take of wooden ticks as they are thrown (sped up with the game's speed) and a ding
# of its own when they land (the view says when: it stays on time at any speed). Several takes of each, a little
# different, so the sound heard every turn is never quite the same.
LAND = 0.88 * 1.05


def soft_mallet(f, sec=0.09, decay=34.0, bright=0.05, wave_='sine'):
    """A muted marimba knock: little of the bright partial, the edge of the attack rounded off."""
    s = note(f, sec, wave_=wave_, attack=0.004, decay=decay)
    mix(s, note(f * 3.98, sec * 0.5, wave_='sine', attack=0.002, decay=decay * 3), 0, bright)
    return lowpass(s, 0.5)


def soft_bell(f, sec, decay=6.0, overtone=0.12):
    s = note(f, sec, wave_='sine', attack=0.004, decay=decay)
    mix(s, note(f * 2.0, sec, wave_='sine', attack=0.004, decay=decay * 2), 0, overtone)
    return s


def cents(r, c):
    return 2 ** (r.uniform(-c, c) / 1200)


def roll_take(seed):
    """A prize wheel slowing, in wood: low ticks climbing the scale, further apart each time, done a moment before the dice land."""
    r = random.Random(seed)
    s = silence(LAND)
    scale = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6']
    tune = cents(r, 10) * 0.5  # (an octave under the scale)
    t, gap, k = 0.0, r.uniform(0.04, 0.047), 0
    grow, first = r.uniform(1.11, 1.14), r.choice([0, 0, 1])
    while t < LAND - 0.2:
        f = N[scale[min(len(scale) - 1, first + k * len(scale) // 12)]] * tune * cents(r, 6)
        mix(s, soft_mallet(f, 0.09, 26, wave_='tri'), max(0.0, t + r.uniform(-0.004, 0.004)), (0.55 + 0.35 * t / LAND) * r.uniform(0.85, 1))
        t += gap
        gap *= grow
        k += 1
    return s


def land_take(seed):
    """The dice come to rest: a warm, round two-note ding (C6, E6 over a soft C5), a hair different each take."""
    r = random.Random(seed)
    tune = cents(r, 12)
    d = soft_bell(N['C6'] * tune, 0.7, decay=4.5, overtone=0.06)
    mix(d, note(N['C6'] * tune / 2, 0.5, wave_='sine', attack=0.006, decay=6), 0, 0.25)
    mix(d, soft_bell(N['E6'] * tune, 0.65, decay=5, overtone=0.06), r.uniform(0.055, 0.07), r.uniform(0.45, 0.6))
    return echo(d, 0.1, 0.3, 0.2, 2)


def sounds():
    S = {}
    # a little "bip" for each hop
    S['hop'] = (note(N['G5'], 0.07, N['C6'], decay=30), 0.22)
    # the dice: a few takes of the throw and of the landing (roll_take, land_take); the random numbers their
    # first sound took are taken still, so the sounds after come out as they always did
    for _ in range(21):
        rnd.random()
    for i in range(4):
        S[f'roll{i + 1}'] = (roll_take(200 + i), 0.24)
    for i in range(3):
        S[f'land{i + 1}'] = (land_take(500 + i), 0.28)
    # ladder: up the scale
    S['ladder'] = (echo(arp(['C5', 'E5', 'G5', 'C6', 'E6'], 0.065, 0.2)), 0.36)
    # snake: a soft slide down with a wobble
    S['snake'] = (echo(note(N['A5'], 0.75, N['C4'], wave_='sine', attack=0.03, decay=2.2, vib=0.025, vibf=7), 0.13, 0.25, 0.25), 0.34)
    # win: a short jingle and a chord
    s = arp(['G5', 'C6', 'E6', 'G6'], 0.1, 0.18)
    for nm in ['C6', 'E6', 'G6']:
        mix(s, note(N[nm], 0.9, wave_='tri', attack=0.02, decay=3.0), 0.42, 0.45)
    S['win'] = (echo(s, 0.14, 0.3, 0.3), 0.42)
    # swamp: two soft blubs
    s = silence(0.45)
    mix(s, note(320, 0.16, 160, wave_='sine', attack=0.01, decay=12), 0)
    mix(s, note(260, 0.18, 130, wave_='sine', attack=0.01, decay=12), 0.17, 0.8)
    S['swamp'] = (s, 0.34)
    # shield: a clear bell
    S['shield'] = (echo(bell(N['E6'], 0.7)), 0.3)
    # skip: down a third
    s = silence(0.4)
    mix(s, note(N['E5'], 0.16, decay=10), 0)
    mix(s, note(N['C5'], 0.22, decay=8), 0.15)
    S['skip'] = (s, 0.3)
    # freeze: icy sparkles
    S['freeze'] = (echo(arp(['E6', 'A6', 'G6', 'C7'], 0.06, 0.16, wave_='sine', decay=14), 0.09, 0.35, 0.4), 0.24)
    # trampoline: a boing
    S['tramp'] = (note(200, 0.42, 620, wave_='sine', attack=0.01, decay=4, vib=0.06, vibf=12), 0.34)
    # jump: a soft whoosh and a rising chirp
    s = noise(0.3, lp=0.06)
    mix(s, note(N['G5'], 0.18, N['D6'], wave_='sine', decay=10), 0.06, 0.5)
    S['jump'] = (s, 0.26)
    # portal: a shimmering run
    S['portal'] = (echo(arp(['C6', 'E6', 'G6', 'B6', 'D6'], 0.045, 0.2, wave_='sine', decay=8), 0.1, 0.35, 0.35), 0.28)
    # fold: soft paper
    s = silence(0.25)
    for k in range(3):
        mix(s, noise(0.06, lp=0.12, swell=False, decay=50), k * 0.06, 0.7)
    S['fold'] = (s, 0.2)
    # quake: a soft low rumble
    s = noise(0.9, lp=0.015)
    mix(s, note(70, 0.9, 55, wave_='sine', attack=0.1, decay=2), 0, 0.6)
    S['quake'] = (s, 0.36)
    # card: a swish and a ding
    s = noise(0.22, lp=0.1)
    mix(s, note(N['C6'], 0.18, wave_='sine', decay=12), 0.08, 0.35)
    mix(s, note(N['E6'], 0.22, wave_='sine', decay=10), 0.14, 0.35)
    S['card'] = (s, 0.28)
    # draw: a tiny pop
    S['draw'] = (note(N['E6'], 0.09, N['G6'], wave_='sine', attack=0.004, decay=25), 0.18)
    # select: a two-note blip when a card or a target is chosen
    s = silence(0.2)
    mix(s, note(N['G5'], 0.08, decay=20), 0)
    mix(s, note(N['C6'], 0.12, decay=16), 0.06)
    S['select'] = (s, 0.3)
    # target: a bell over the chosen player
    s = bell(N['C6'], 0.55)
    mix(s, bell(N['G6'], 0.45), 0.07, 0.5)
    S['target'] = (echo(s, 0.12, 0.3, 0.3), 0.3)
    # the menus: a bright two-note "ding" for a button that goes on, a soft bubble for a choice,
    # and the "ding" turned round for one that goes back
    s = silence(0.3)
    mix(s, note(N['C6'], 0.07, wave_='sine', attack=0.003, decay=28), 0, 0.8)
    mix(s, bell(N['G6'], 0.22, decay=16), 0.055, 0.6)
    S['menu'] = (echo(s, 0.08, 0.25, 0.18, 2), 0.22)
    S['tick'] = (note(N['A5'], 0.07, N['D6'], wave_='sine', attack=0.003, decay=32), 0.18)
    s = silence(0.3)
    mix(s, note(N['G5'], 0.07, wave_='sine', attack=0.003, decay=28), 0, 0.8)
    mix(s, note(N['C5'], 0.16, wave_='tri', attack=0.004, decay=18), 0.06, 0.7)
    S['back'] = (s, 0.2)
    return S


def normalise(s, peak):
    m = max(1e-6, max(abs(v) for v in s))
    return [v / m * peak for v in s]


def write_wav(path, samples):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, v)) * 32000)) for v in samples))


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(TMP, exist_ok=True)
    only = set(sys.argv[1:])
    for name, (s, peak) in sounds().items():
        if only and name not in only:
            continue
        s = normalise(lowpass(s), peak)
        wav = os.path.join(TMP, name + '.wav')
        write_wav(wav, s)
        mp3 = os.path.join(OUT, name + '.mp3')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-b:a', '64k', mp3], check=True)
        print(name, os.path.getsize(mp3))


if __name__ == '__main__':
    main()
