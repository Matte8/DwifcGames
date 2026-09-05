"""One-off script to generate the PWA icon set for TARDIS vs Dalek.

Not part of the game itself: run manually with `python3 scripts/generate_icons.py`
whenever the icon design changes. Requires Pillow.
"""
from PIL import Image, ImageDraw

TARDIS_BLUE = (11, 42, 92, 255)
TARDIS_BLUE_DARK = (6, 26, 61, 255)
PANEL_LINE = (30, 70, 140, 255)
WINDOW = (170, 220, 255, 255)
LAMP = (255, 244, 200, 255)
LAMP_GLOW = (255, 230, 140, 120)


def draw_tardis(size, maskable=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    pad = size * (0.16 if maskable else 0.08)
    if maskable:
        d.rectangle([0, 0, size, size], fill=TARDIS_BLUE_DARK)

    box_w = size - pad * 2
    box_h = box_w * 1.15
    x0 = pad
    y0 = (size - box_h) / 2 + size * 0.03
    x1 = x0 + box_w
    y1 = y0 + box_h

    # roof
    roof_h = box_h * 0.10
    d.rectangle([x0 - size * 0.015, y0 - roof_h, x1 + size * 0.015, y0], fill=TARDIS_BLUE_DARK)

    # lamp
    lamp_r = box_w * 0.09
    lamp_cx, lamp_cy = size / 2, y0 - roof_h - lamp_r * 0.6
    d.ellipse([lamp_cx - lamp_r * 2.2, lamp_cy - lamp_r * 2.2, lamp_cx + lamp_r * 2.2, lamp_cy + lamp_r * 2.2], fill=LAMP_GLOW)
    d.ellipse([lamp_cx - lamp_r, lamp_cy - lamp_r, lamp_cx + lamp_r, lamp_cy + lamp_r], fill=LAMP)

    # body
    d.rectangle([x0, y0, x1, y1], fill=TARDIS_BLUE)
    d.rectangle([x0, y0, x1, y1], outline=TARDIS_BLUE_DARK, width=max(2, int(size * 0.012)))

    # vertical panel divisions
    for i in range(1, 4):
        px = x0 + box_w * i / 4
        d.line([px, y0, px, y1], fill=PANEL_LINE, width=max(1, int(size * 0.008)))

    # horizontal band
    band_y = y0 + box_h * 0.42
    d.line([x0, band_y, x1, band_y], fill=PANEL_LINE, width=max(1, int(size * 0.012)))

    # window grid on the two central panels
    win_rows, win_cols = 3, 2
    win_x0 = x0 + box_w * 0.28
    win_x1 = x0 + box_w * 0.72
    win_y0 = y0 + box_h * 0.14
    win_y1 = band_y - box_h * 0.03
    cell_w = (win_x1 - win_x0) / win_cols
    cell_h = (win_y1 - win_y0) / win_rows
    inset = cell_w * 0.16
    for r in range(win_rows):
        for c in range(win_cols):
            wx0 = win_x0 + c * cell_w + inset
            wy0 = win_y0 + r * cell_h + inset
            wx1 = win_x0 + (c + 1) * cell_w - inset
            wy1 = win_y0 + (r + 1) * cell_h - inset
            d.rectangle([wx0, wy0, wx1, wy1], fill=WINDOW)

    # "POLICE BOX" style plate (just a plain plate, no text to keep it crisp at small sizes)
    plate_h = box_h * 0.10
    plate_y0 = band_y + box_h * 0.04
    plate_y1 = plate_y0 + plate_h
    d.rectangle([x0 + box_w * 0.18, plate_y0, x1 - box_w * 0.18, plate_y1], fill=TARDIS_BLUE_DARK)

    return img


for size, maskable, name in [
    (192, False, "icon-192.png"),
    (512, False, "icon-512.png"),
    (512, True, "icon-maskable-512.png"),
    (180, False, "apple-touch-icon.png"),
    (32, False, "favicon-32.png"),
]:
    icon = draw_tardis(size, maskable=maskable)
    icon.save(f"icons/{name}")
    print("saved", name)
