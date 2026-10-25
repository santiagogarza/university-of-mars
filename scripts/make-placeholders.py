#!/usr/bin/env python3
"""Neutral photographic placeholders. Overwrites the six public JPGs."""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "images"
W, H = 1920, 1280


def noise(h, w, seed, octaves=(6, 14, 32, 70, 140)):
    rng = np.random.default_rng(seed)
    acc = np.zeros((h, w), np.float32)
    weight = 0.0
    amp = 1.0
    for scale in octaves:
        sh, sw = max(2, h // scale), max(2, w // scale)
        small = rng.random((sh, sw), dtype=np.float32)
        layer = np.asarray(
            Image.fromarray((small * 255).astype(np.uint8)).resize((w, h), Image.Resampling.BICUBIC),
            dtype=np.float32,
        ) / 255.0
        acc += layer * amp
        weight += amp
        amp *= 0.62
    return acc / weight


def colorize(field, shadow, mid, light):
    shadow = np.array(shadow, np.float32)
    mid = np.array(mid, np.float32)
    light = np.array(light, np.float32)
    t = np.clip(field, 0, 1)[..., None]
    low = shadow * (1 - t) + mid * t
    return low * (1 - t * 0.35) + light * (t * 0.35)


def grain(arr, amount, seed):
    rng = np.random.default_rng(seed)
    return np.clip(arr + rng.normal(0, amount, arr.shape).astype(np.float32), 0, 255)


def vignette(arr, strength=0.38):
    h, w, _ = arr.shape
    y = np.linspace(-1, 1, h)[:, None]
    x = np.linspace(-1.2, 1.2, w)[None, :]
    mask = 1 - strength * np.clip((x * x + y * y) ** 1.1, 0, 1)
    return arr * mask[..., None]


def save(arr, name):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.jpg"
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB").save(
        path, "JPEG", quality=78, optimize=True
    )
    print(path)


def paint(base, draw_fn, blur=2.2):
    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(overlay, "RGBA"))
    if blur:
        overlay = overlay.filter(ImageFilter.GaussianBlur(radius=blur))
    img.paste(Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB"))
    return np.asarray(img).astype(np.float32)


def hero():
    field = noise(H, W, 4)
    # brighter sky
    sky = np.linspace(0.15, 0.85, H, dtype=np.float32)[:, None]
    sky = np.repeat(sky, W, axis=1)
    field = np.clip(field * 0.45 + sky, 0, 1)
    base = colorize(field, (92, 58, 48), (168, 112, 86), (214, 176, 146))

    def draw(d):
        d.polygon([(0, 690), (240, 610), (520, 660), (860, 560), (1220, 640), (1580, 540), (1920, 620), (1920, 860), (0, 860)], fill=(120, 74, 62, 210))
        d.polygon([(0, 780), (300, 720), (640, 790), (980, 700), (1400, 770), (1920, 710), (1920, 980), (0, 980)], fill=(72, 46, 44, 230))
        d.polygon([(0, 980), (1920, 900), (1920, 1280), (0, 1280)], fill=(78, 60, 50, 255))
        d.polygon([(820, 1280), (1040, 930), (1220, 930), (1560, 1280)], fill=(164, 136, 108, 170))
        d.rectangle((1288, 470, 1452, 980), fill=(58, 36, 38, 235))
        d.polygon([(1260, 500), (1370, 300), (1480, 500)], fill=(48, 30, 34, 240))
        d.ellipse((1336, 540, 1404, 608), fill=(226, 206, 176, 230))
        for x in (140, 260, 1040, 1700):
            d.ellipse((x, 860, x + 70, 1040), fill=(36, 30, 28, 180))

    arr = paint(base, draw, blur=1.6)
    save(vignette(grain(arr, 11, 8), 0.42), "hero-quad")


def library():
    field = noise(H, W, 12)
    base = colorize(field, (74, 52, 42), (132, 96, 74), (196, 156, 124))

    def draw(d):
        d.rectangle((0, 0, 520, H), fill=(214, 178, 146, 90))
        d.polygon([(40, 180), (430, 80), (470, 1040), (0, 1100)], fill=(232, 196, 160, 70))
        for x in range(560, 1860, 78):
            d.rectangle((x, 90, x + 36, 1160), fill=(48, 32, 30, 150))
        d.rectangle((180, 860, 980, 1180), fill=(92, 62, 48, 80))

    arr = paint(base, draw, blur=3.4)
    save(vignette(grain(arr, 9, 15), 0.3), "library")


def halls():
    field = noise(H, W, 21)
    base = colorize(field, (110, 72, 58), (168, 112, 88), (206, 160, 130))

    def draw(d):
        d.rectangle((120, 260, 1800, 1100), fill=(132, 84, 70, 230))
        d.rectangle((120, 200, 1800, 300), fill=(78, 48, 44, 200))
        for row in range(6):
            for col in range(11):
                x = 210 + col * 142
                y = 340 + row * 120
                shade = 210 - (row * 8)
                d.rectangle((x, y, x + 72, y + 92), fill=(shade, shade - 28, shade - 58, 200))

    arr = paint(base, draw, blur=1.2)
    save(vignette(grain(arr, 8, 19), 0.28), "residence-halls")


def students():
    field = noise(H, W, 33)
    base = colorize(field, (96, 64, 52), (176, 124, 96), (220, 184, 156))

    def draw(d):
        d.polygon([(0, 820), (1920, 740), (1920, 1280), (0, 1280)], fill=(84, 62, 52, 230))
        colors = [(48, 36, 40, 200), (92, 48, 44, 200), (36, 48, 64, 200), (120, 86, 58, 190), (60, 44, 40, 210)]
        spots = [(380, 700), (520, 760), (690, 690), (860, 780), (1040, 720), (1220, 800), (1410, 710), (1580, 770)]
        for i, (x, y) in enumerate(spots):
            color = colors[i % len(colors)]
            d.ellipse((x, y - 54, x + 46, y - 8), fill=color)
            d.rounded_rectangle((x - 10, y - 8, x + 56, y + 150), radius=18, fill=color)

    arr = paint(base, draw, blur=7.5)
    save(vignette(grain(arr, 10, 28), 0.34), "students")


def lecture():
    field = noise(H, W, 44)
    base = colorize(field, (28, 22, 24), (72, 48, 44), (150, 112, 90))

    def draw(d):
        d.polygon([(520, 80), (1680, 120), (1600, 560), (600, 520)], fill=(214, 186, 156, 180))
        for i in range(8):
            y = 540 + i * 80
            inset = 40 + i * 50
            tone = 90 - i * 6
            d.polygon(
                [(inset, y), (W - inset, y - 20), (W - inset + 30, y + 48), (inset - 20, y + 64)],
                fill=(tone, tone - 24, tone - 30, 210),
            )

    arr = paint(base, draw, blur=2.0)
    save(vignette(grain(arr, 8, 40), 0.45), "lecture-hall")


def research():
    field = noise(H, W, 55)
    sky = np.linspace(0.05, 0.75, H, dtype=np.float32)[:, None]
    sky = np.repeat(sky, W, axis=1)
    field = np.clip(field * 0.35 + sky, 0, 1)
    base = colorize(field, (28, 36, 58), (92, 64, 72), (186, 120, 96))

    def draw(d):
        d.polygon([(0, 860), (480, 760), (900, 820), (1400, 700), (1920, 800), (1920, 1280), (0, 1280)], fill=(48, 36, 38, 240))
        d.rectangle((760, 620, 1180, 980), fill=(70, 56, 54, 230))
        d.chord((860, 390, 1100, 680), 200, 340, fill=(46, 58, 78, 235))
        d.ellipse((910, 450, 1050, 610), fill=(18, 24, 36, 220))

    arr = paint(base, draw, blur=1.4)
    save(vignette(grain(arr, 9, 48), 0.36), "research")


if __name__ == "__main__":
    hero()
    library()
    halls()
    students()
    lecture()
    research()
