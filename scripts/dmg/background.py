"""Draws the background of the disk image window: the FM Lens wordmark, and an arrow from the app to Applications.

Usage: python3 scripts/dmg/background.py (needs Pillow). Writes background.png and background@2x.png beside this file;
settings.py places the icons where this draws around them. Run it again after changing the layout or the wordmark.
"""

from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
WORDMARK = HERE.parent.parent / "app" / "src" / "assets" / "brand" / "fm-lens-logo.png"

# The window's content, in points; settings.py uses the same numbers.
WIDTH, HEIGHT = 640, 360
ICON_Y = 220
APP_X, APPLICATIONS_X = 170, 470

BACKGROUND = "#f4f5f9"
GREEN = "#44e103"


def draw(scale: int) -> Image.Image:
    image = Image.new("RGB", (WIDTH * scale, HEIGHT * scale), BACKGROUND)

    wordmark = Image.open(WORDMARK).convert("RGBA")
    height = 60 * scale
    wordmark = wordmark.resize((round(wordmark.width * height / wordmark.height), height), Image.LANCZOS)
    image.paste(wordmark, ((image.width - wordmark.width) // 2, 32 * scale), wordmark)

    # Drawn four times larger and scaled down, for smooth edges.
    big = 4 * scale
    arrow = Image.new("RGBA", (WIDTH * big, HEIGHT * big), (0, 0, 0, 0))
    pen = ImageDraw.Draw(arrow)
    width = 8 * big
    start, end, y = (APP_X + 86) * big, (APPLICATIONS_X - 86) * big, ICON_Y * big
    head = 20 * big
    pen.line([(start, y), (end - width // 2, y)], fill=GREEN, width=width)
    pen.line([(end - head, y - head), (end, y), (end - head, y + head)], fill=GREEN, width=width, joint="curve")
    for x, cy in [(start, y), (end - head, y - head), (end - head, y + head), (end, y)]:
        pen.ellipse([x - width // 2, cy - width // 2, x + width // 2, cy + width // 2], fill=GREEN)
    arrow = arrow.resize(image.size, Image.LANCZOS)
    image.paste(arrow, (0, 0), arrow)
    return image


if __name__ == "__main__":
    draw(1).save(HERE / "background.png", optimize=True)
    draw(2).save(HERE / "background@2x.png", optimize=True)
