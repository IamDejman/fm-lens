"""Draws every icon in this folder.

The almanac's mark: "FML" in Archivo (the app's bundled typeface, condensed and bold), white on an ink tile, under a
thick rule as the almanac sets its headings, over a bar of FM's four attribute bands. The tile keeps macOS's margin.
At 48 pixels and under, where the rule and the bands would blur to nothing, a small cut drops the rule and draws the
letters and the bands larger.

From app/, after `npm install`:

    python3 src-tauri/icons/make-icon.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
FONT = HERE.parents[1] / "node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2"

CANVAS = 1024
SCALE = 2  # drawn at twice the size and scaled down, for smooth edges
INK = (22, 24, 29, 255)
PAPER = (246, 247, 249, 255)
# FM's bands, low to high, as the app's earthy inks: brick, ochre, olive, pitch green.
BANDS = [(196, 81, 63, 255), (201, 138, 43, 255), (138, 163, 58, 255), (46, 138, 91, 255)]

# The largest size the small cut is used for.
SMALL_MAX = 48


def draw(small: bool) -> Image.Image:
    """The icon at CANVAS pixels: the full mark, or the small cut."""
    s = SCALE
    size = CANVAS * s
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas = ImageDraw.Draw(image)

    # The tile: macOS's icon body, 824 of 1024, centred; the small cut takes more of the square.
    body = (912 if small else 824) * s
    radius = (200 if small else 186) * s
    left = (size - body) // 2
    canvas.rounded_rectangle((left, left, left + body, left + body), radius, fill=INK)

    font = ImageFont.truetype(str(FONT), (520 if small else 420) * s)
    font.set_variation_by_axes([850 if small else 850, 72])  # weight, width: bold and condensed
    text = "FML"
    # The ink of the letters, not their advance box, so the rule and the bands line up with the strokes.
    probe = Image.new("L", (size, size), 0)
    ImageDraw.Draw(probe).text((0, 0), text, font=font, fill=255)
    x0, y0, x1, y1 = probe.getbbox()
    width, height = x1 - x0, y1 - y0

    rule = 0 if small else 26 * s
    rule_gap = 0 if small else 54 * s
    gap = (60 if small else 54) * s
    bar = (110 if small else 44) * s
    block = rule + rule_gap + height + gap + bar
    lx = (size - width) // 2
    top = (size - block) // 2

    if rule:
        canvas.rectangle((lx, top, lx + width, top + rule), fill=PAPER)
    canvas.text((lx - x0, top + rule + rule_gap - y0), text, font=font, fill=PAPER)

    # FM's four bands in a row under the letters.
    by = top + rule + rule_gap + height + gap
    seg_gap = (24 if small else 14) * s
    seg = (width - 3 * seg_gap) / 4
    for i, colour in enumerate(BANDS):
        sx = lx + i * (seg + seg_gap)
        canvas.rectangle((round(sx), by, round(sx + seg), by + bar), fill=colour)

    return image.resize((CANVAS, CANVAS), Image.LANCZOS)


def main() -> None:
    full, small = draw(small=False), draw(small=True)

    def at(px: int) -> Image.Image:
        return (small if px <= SMALL_MAX else full).resize((px, px), Image.LANCZOS)

    full.save(HERE / "app-icon.png")
    pngs = {
        "32x32.png": 32,
        "128x128.png": 128,
        "128x128@2x.png": 256,
        "icon.png": 512,
        "StoreLogo.png": 50,
        "Square30x30Logo.png": 30,
        "Square44x44Logo.png": 44,
        "Square71x71Logo.png": 71,
        "Square89x89Logo.png": 89,
        "Square107x107Logo.png": 107,
        "Square142x142Logo.png": 142,
        "Square150x150Logo.png": 150,
        "Square284x284Logo.png": 284,
        "Square310x310Logo.png": 310,
    }
    for name, px in pngs.items():
        at(px).save(HERE / name)

    # Windows: every size the shell asks for, the small ones from the small cut.
    ico_sizes = [16, 24, 32, 48, 64, 256]
    at(256).save(HERE / "icon.ico", sizes=[(px, px) for px in ico_sizes], append_images=[at(px) for px in ico_sizes])

    # macOS: the sizes of an icns, the 16 and 32 point ones from the small cut.
    icns_sizes = [16, 32, 64, 128, 256, 512, 1024]
    at(1024).save(HERE / "icon.icns", append_images=[at(px) for px in icns_sizes])


if __name__ == "__main__":
    main()
