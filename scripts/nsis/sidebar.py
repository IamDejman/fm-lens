"""Draws the picture on the left of the Windows installer's first and last pages: the FM Lens wordmark, on the background
of the Mac disk image window (scripts/dmg/background.py).

Usage: python3 scripts/nsis/sidebar.py (needs Pillow). Writes sidebar.bmp beside this file, at the 164 by 314 pixels the
installer shows it; bundle.windows.nsis.sidebarImage in app/src-tauri/tauri.conf.json points at it. Run it again after
changing the wordmark.
"""

from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
WORDMARK = HERE.parent.parent / "app" / "src" / "assets" / "brand" / "fm-lens-logo.png"

WIDTH, HEIGHT = 164, 314
BACKGROUND = "#f4f5f9"


def draw() -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), BACKGROUND)
    wordmark = Image.open(WORDMARK).convert("RGBA")
    width = 136
    wordmark = wordmark.resize((width, round(wordmark.height * width / wordmark.width)), Image.LANCZOS)
    image.paste(wordmark, ((WIDTH - wordmark.width) // 2, 40), wordmark)
    return image


if __name__ == "__main__":
    draw().save(HERE / "sidebar.bmp")
