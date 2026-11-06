# dmgbuild settings for the FM Lens disk image (see scripts/release-mac.sh): the app and a link to Applications on the
# background background.py draws, with no toolbar or sidebar. The app's path and the background's come in as
# -D app=... and -D background=...
import os.path

app = defines["app"]  # noqa: F821 (dmgbuild defines it)

format = "UDZO"
files = [app]
symlinks = {"Applications": "/Applications"}
hide_extensions = [os.path.basename(app)]

# dmgbuild finds background@2x.png beside it for Retina screens.
background = defines["background"]  # noqa: F821
# The window's bounds include its title bar, 28 points above the 640 by 360 background.
window_rect = ((200, 140), (640, 388))
default_view = "icon-view"
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
icon_size = 112
text_size = 13
# The icons' centres, where background.py leaves room for them.
icon_locations = {os.path.basename(app): (170, 220), "Applications": (470, 220)}
