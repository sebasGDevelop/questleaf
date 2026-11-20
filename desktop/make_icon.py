"""Questleaf logo: a jade dragon head in pixel art (32x32).
Same rules as the icons: 1 px dark outline, light from the top left, shared palette. Used when building (build.bat)."""
import sys
from PIL import Image

N = 32
OUT = '#2f2230'
RAMPS = {
    'jade': ['#24585f', '#3b8f8b', '#7bcbbb', '#c4ece0'],
    'gold': ['#a2742a', '#ddb03c', '#f6d874', '#fff2bd'],
    'horn': ['#8a6a3a', '#c9a868', '#ecd9a6', '#fff4d6'],
    'cream': ['#b08a5f', '#dcc092', '#f4e4bd', '#fff7e8'],
}


def spans(d):
    m = set()
    for y, segs in d.items():
        for x0, x1 in segs:
            for x in range(x0, x1 + 1):
                m.add((x, y))
    return m


def shade(mask, ramp, hi2=False):
    dark, mid, light, hi = RAMPS[ramp]
    px = {}
    for (x, y) in mask:
        top = (x, y - 1) not in mask
        left = (x - 1, y) not in mask
        bottom = (x, y + 1) not in mask
        right = (x + 1, y) not in mask
        if top and left:
            c = hi
        elif top or (hi2 and (x, y - 2) not in mask and not right):
            c = light
        elif left:
            c = light
        elif bottom or right:
            c = dark
        else:
            c = mid
        px[(x, y)] = c
    return px


def outline(mask):
    o = set()
    for (x, y) in mask:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            p = (x + dx, y + dy)
            if p not in mask and 0 <= p[0] < N and 0 <= p[1] < N:
                o.add(p)
    return o


# ---------- parts (back to front): {row: [(x0, x1), ...]}
HORN_BACK = {6: [(2, 3)], 7: [(3, 7)], 8: [(5, 10)], 9: [(7, 12)], 10: [(9, 12)]}
HORN_FRONT = {1: [(6, 6)], 2: [(6, 7)], 3: [(7, 8)], 4: [(7, 9)], 5: [(8, 10)], 6: [(9, 11)],
              7: [(10, 13)], 8: [(11, 14)], 9: [(12, 15)]}
SPINES = {10: [(6, 6)], 11: [(6, 8)], 12: [(7, 9)],
          15: [(4, 5)], 16: [(5, 8)], 17: [(6, 8)],
          20: [(3, 4)], 21: [(4, 7)], 22: [(5, 7)],
          25: [(3, 4)], 26: [(4, 7)], 27: [(5, 8)]}
NECK = {12: [(8, 12)], 13: [(8, 14)], 14: [(8, 14)], 15: [(8, 14)], 16: [(8, 14)], 17: [(8, 14)],
        18: [(7, 14)], 19: [(7, 14)], 20: [(6, 15)], 21: [(6, 15)], 22: [(6, 16)], 23: [(6, 16)],
        24: [(6, 17)], 25: [(7, 18)], 26: [(7, 19)], 27: [(8, 20)], 28: [(8, 21)], 29: [(9, 22)],
        30: [(10, 23)]}
JAW = {17: [(12, 26)], 18: [(12, 25)], 19: [(13, 23)], 20: [(14, 20)]}
HEAD = {8: [(12, 16)], 9: [(11, 19)], 10: [(10, 21)], 11: [(9, 24)], 12: [(9, 27)], 13: [(9, 28)],
        14: [(9, 29)], 15: [(9, 29)], 16: [(10, 28)]}

LAYERS = [
    (HORN_BACK, 'horn', False),
    (SPINES, 'gold', False),
    (NECK, 'jade', False),
    (JAW, 'jade', False),
    (HEAD, 'jade', True),
    (HORN_FRONT, 'horn', False),
]


def build():
    canvas = {}
    for part, ramp, hi2 in LAYERS:
        m = spans(part)
        for p in outline(m):
            canvas[p] = OUT
        if ramp == 'horn':
            # thin horns: gradient from the tip (light) to the base (dark)
            ys = sorted({y for _, y in m})
            for (x, y) in m:
                t = (y - ys[0]) / max(1, ys[-1] - ys[0])
                below = (x, y + 1) not in m and (x + 1, y) not in m
                canvas[(x, y)] = RAMPS['horn'][0 if below and t > .3 else 3 if t < .2 else 2 if t < .6 else 1]
        else:
            canvas.update(shade(m, ramp, hi2))
    neck = spans(NECK)
    # belly plates (cream) on the front of the neck
    for y in range(22, 31):
        xs = [x for (x, yy) in neck if yy == y]
        if not xs:
            continue
        r = max(xs)
        for x in range(r - 3, r + 1):
            if (x, y) in neck and (x, y) not in spans(JAW):
                canvas[(x, y)] = RAMPS['cream'][2 if y % 3 else 1]
        canvas[(r, y)] = RAMPS['cream'][0 if y % 3 == 0 else 1]
    # eye: dark brow, golden iris and slit pupil
    for x in range(16, 21):
        canvas[(x, 10)] = RAMPS['jade'][0]
    canvas[(16, 11)] = canvas[(16, 12)] = canvas[(20, 11)] = canvas[(20, 12)] = OUT
    for x in range(17, 20):
        canvas[(x, 13)] = OUT
    canvas[(17, 11)] = RAMPS['gold'][3]
    canvas[(19, 11)] = canvas[(17, 12)] = canvas[(19, 12)] = RAMPS['gold'][2]
    canvas[(18, 11)] = canvas[(18, 12)] = OUT
    # nostril and snout ridge
    canvas[(25, 13)] = canvas[(26, 13)] = OUT
    for x in range(21, 25):
        canvas[(x, 12)] = RAMPS['jade'][3] if x % 2 else RAMPS['jade'][2]
    # fangs
    canvas[(21, 17)] = canvas[(21, 18)] = RAMPS['cream'][3]
    canvas[(25, 17)] = RAMPS['cream'][3]
    # scales on the cheek and the neck
    for p in [(11, 13), (13, 14), (11, 15), (10, 19), (9, 22), (11, 24), (10, 27)]:
        canvas[p] = RAMPS['jade'][0]
    img = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    for (x, y), c in canvas.items():
        if 0 <= x < N and 0 <= y < N:
            img.putpixel((x, y), tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) + (255,))
    return img


def main():
    """Writes the logo everywhere: desktop/icon.ico (exe, tray and shortcut) and web/icon.png (top bar and favicon)."""
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    web = os.path.join(os.path.dirname(here), 'web')
    im = build()
    # 32 px is the drawing as is; larger sizes scale up without smoothing (sharp pixels)
    # and the small ones (16/24) scale down by averaging so the shape survives.
    sizes = {16: im.resize((16, 16), Image.BOX), 24: im.resize((24, 24), Image.BOX), 32: im}
    for s in (48, 64, 128, 256):
        sizes[s] = im.resize((s, s), Image.NEAREST)
    sizes[256].save(os.path.join(here, 'icon.ico'), sizes=[(s, s) for s in sizes],
                    append_images=[sizes[s] for s in sizes if s != 256])
    sizes[256].save(os.path.join(web, 'icon.png'))
    print('Logo drawn: desktop/icon.ico and web/icon.png')


if __name__ == '__main__':
    main()
