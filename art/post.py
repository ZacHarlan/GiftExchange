"""Turn raw Blender renders (art/build/*.png) into web assets (assets/*.webp).

- trims each image to its visible content (shared crop for animation frames)
- adds a bloom glow to bright areas (flames, the open gift's light)
- assembles frame sequences into horizontal sprite sheets
- exports WebP with alpha

Run with system python3 (needs Pillow):  python3 art/post.py
"""
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "art", "build")
ASSETS = os.path.join(ROOT, "assets")
os.makedirs(ASSETS, exist_ok=True)


def load(name):
    return Image.open(os.path.join(BUILD, name)).convert("RGBA")


def content_box(images, threshold=24):
    """Union bounding box of pixels whose alpha exceeds `threshold` (ignores faint shadow haze)."""
    box = None
    for im in images:
        a = im.getchannel("A").point(lambda v: 255 if v > threshold else 0)
        b = a.getbbox()
        if b is None:
            continue
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    return box


def square_crop(im, box, margin=0.06):
    """Crop to `box`, pad to a centered square with margin."""
    x0, y0, x1, y1 = box
    side = max(x1 - x0, y1 - y0)
    side = int(side * (1 + 2 * margin))
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    left, top = int(cx - side / 2), int(cy - side / 2)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(im.crop((left, top, left + side, top + side)), (0, 0))
    return edge_fade(canvas)


def edge_fade(im, inner=0.78):
    """Fade alpha to zero toward the edges so faint floor shadows never end in a hard line."""
    w, h = im.size
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    steps = 30
    for i in range(steps, -1, -1):
        t = i / steps  # 1 = outer edge
        rx, ry = w / 2 * (inner + (1 - inner) * t) * 1.18, h / 2 * (inner + (1 - inner) * t) * 1.18
        d.ellipse((w / 2 - rx, h / 2 - ry, w / 2 + rx, h / 2 + ry), fill=int(255 * (1 - t)))
    mask = mask.filter(ImageFilter.GaussianBlur(w / 40))
    im.putalpha(ImageChops.multiply(im.getchannel("A"), mask))
    return im


def bloom(im, threshold=200, radius=14, strength=1.0, tint=(255, 200, 120)):
    """Bright-pass -> blur -> composite a warm glow under and screen it over the image."""
    lum = im.convert("L")
    alpha = im.getchannel("A")
    bright = ImageChops.multiply(lum.point(lambda v: 255 if v >= threshold else int(v * 0.0)), alpha)
    glow_a = bright.filter(ImageFilter.GaussianBlur(radius))
    glow_a = glow_a.point(lambda v: min(255, int(v * 1.8 * strength)))
    glow = Image.new("RGBA", im.size, (*tint, 0))
    glow.putalpha(glow_a)
    out = Image.alpha_composite(glow, im)
    # Screen the glow onto the RGB so lit areas also brighten slightly.
    rgb = ImageChops.screen(out.convert("RGB"), Image.merge("RGB", [glow_a.point(lambda v: int(v * c / 255 * 0.45)) for c in tint]))
    rgb.putalpha(out.getchannel("A"))
    return rgb


def radial_glow(size, center, radius, color=(255, 205, 120), max_alpha=170):
    g = Image.new("RGBA", size, (*color, 0))
    mask = Image.new("L", size, 0)
    d = ImageDraw.Draw(mask)
    steps = 40
    for i in range(steps, 0, -1):
        r = radius * i / steps
        a = int(max_alpha * (1 - i / steps) ** 1.6)
        d.ellipse((center[0] - r, center[1] - r, center[0] + r, center[1] + r), fill=a)
    g.putalpha(mask.filter(ImageFilter.GaussianBlur(radius / 10)))
    return g


def save(im, name, size):
    im = im.resize((size, size), Image.LANCZOS) if im.width != size else im
    path = os.path.join(ASSETS, name)
    im.save(path, "WEBP", quality=86, method=6)
    print(f"[post] {name}  {im.width}x{im.height}  {os.path.getsize(path) // 1024} KB")


def sprite(frames, name, size):
    sheet = Image.new("RGBA", (size * len(frames), size), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f.resize((size, size), Image.LANCZOS), (i * size, 0))
    path = os.path.join(ASSETS, name)
    sheet.save(path, "WEBP", quality=84, method=6)
    print(f"[post] {name}  {len(frames)} frames of {size}px  {os.path.getsize(path) // 1024} KB")


def exists(*names):
    return all(os.path.exists(os.path.join(BUILD, n)) for n in names)


def main():
    if exists("gift.png", "gift-open.png"):
        closed, opened = load("gift.png"), load("gift-open.png")
        box = content_box([closed, opened])
        save(square_crop(closed, box), "gift.webp", 440)
        o = square_crop(opened, box)
        # Light pouring out of the box: radial glow behind, bloom on top.
        bright_box = o.convert("L").point(lambda v: 255 if v > 235 else 0).getbbox()
        if bright_box:
            c = ((bright_box[0] + bright_box[2]) / 2, (bright_box[1] + bright_box[3]) / 2 - o.height * 0.12)
            o = Image.alpha_composite(radial_glow(o.size, c, o.width * 0.55), o)
        save(edge_fade(bloom(o, threshold=225, radius=o.width // 28, strength=1.2), inner=0.7), "gift-open.webp", 440)

    for still in ("latkes", "gelt", "gelt-coin"):
        if exists(f"{still}.png"):
            im = load(f"{still}.png")
            save(square_crop(im, content_box([im])), f"{still}.webp", 400 if still != "gelt-coin" else 160)

    if exists("hero.png"):
        im = load("hero.png")
        x0, y0, x1, y1 = content_box([im])
        pad = int((x1 - x0) * 0.06)
        x0, y0, x1, y1 = x0 - pad, y0 - pad, x1 + pad, y1 + pad
        # Grow the box to the header's fixed 1000x475 aspect (index.html declares that size).
        w, h = 1000, 475
        if (x1 - x0) / (y1 - y0) < w / h:
            grow = (y1 - y0) * w / h - (x1 - x0)
            x0, x1 = x0 - grow / 2, x1 + grow / 2
        else:
            grow = (x1 - x0) * h / w - (y1 - y0)
            y0, y1 = y0 - grow / 2, y1 + grow / 2
        canvas = Image.new("RGBA", (int(x1 - x0), int(y1 - y0)), (0, 0, 0, 0))
        canvas.paste(im, (int(-x0), int(-y0)))
        im = bloom(canvas, threshold=235, radius=max(4, canvas.width // 180), strength=0.8)
        im = edge_fade(im, inner=0.93)
        im = im.resize((w, h), Image.LANCZOS)
        im.save(os.path.join(ASSETS, "hero.webp"), "WEBP", quality=86, method=6)
        print(f"[post] hero.webp  {im.width}x{im.height}  {os.path.getsize(os.path.join(ASSETS, 'hero.webp')) // 1024} KB")

    menorah = [f"menorah_{i}.png" for i in range(10)]
    if exists(*menorah):
        frames = [load(n) for n in menorah]
        box = content_box(frames)
        frames = [bloom(square_crop(f, box), threshold=215, radius=10, strength=1.3) for f in frames]
        sprite(frames, "menorah-sprite.webp", 360)
        save(frames[-1], "menorah.webp", 360)

    dreidel = [f"dreidel_{i:02d}.png" for i in range(24)]
    if exists(*dreidel):
        frames = [load(n) for n in dreidel]
        box = content_box(frames)
        sprite([square_crop(f, box) for f in frames], "dreidel-sprite.webp", 300)


if __name__ == "__main__":
    sys.exit(main())
