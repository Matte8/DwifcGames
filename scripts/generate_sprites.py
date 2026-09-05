"""One-off script to generate pixel-art (8-bit style) game sprites.

Not part of the game itself: run manually with `python3 scripts/generate_sprites.py`
whenever the sprite design changes. Requires Pillow. Sprites are drawn on a
small logical grid and each cell is rendered as a flat, unscaled block of
`SCALE` real pixels so the result stays crisp (no anti-aliasing/interpolation)
when later scaled in the game with image-smoothing disabled.
"""
from PIL import Image

SCALE = 6

PALETTE = {
    '.': None,
    'k': (10, 18, 36, 255),    # outline
    'd': (16, 42, 94, 255),    # dark blue (roof / sign band / pilaster)
    'b': (30, 82, 168, 255),   # main body blue
    'l': (86, 146, 224, 255),  # light blue highlight
    'w': (198, 232, 255, 255), # window
    'c': (255, 240, 202, 255), # lamp
}

TARDIS_GRID = [
    ".....kkkkkk.....",
    ".....kcccck.....",
    ".dddddddddddddd.",
    "..kkkkkkkkkkkk..",
    "..kkkkkkkkkkkk..",
    "..kwwwwddwwwwk..",
    "..kwwwwddwwwwk..",
    "..kkkkkddkkkkk..",
    "..kwwwwddwwwwk..",
    "..kwwwwddwwwwk..",
    "..kkkkkkkkkkkk..",
    "..kddddddddddk..",
    "..kddddddddddk..",
    "..kkkkkkkkkkkk..",
    "..klbbbddbbbbk..",
    "..klbbbddbbbbk..",
    "..klbbbddbbbbk..",
    "..klbbbddbbbbk..",
    "..klbbbddbbbbk..",
    "..kkkkkkkkkkkk..",
    "..kddddddddddk..",
    "................",
]


def render(grid, path):
    rows = len(grid)
    cols = len(grid[0])
    for row in grid:
        assert len(row) == cols, f"riga di lunghezza {len(row)}, attesa {cols}: {row!r}"

    img = Image.new("RGBA", (cols * SCALE, rows * SCALE), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(grid):
        for x, ch in enumerate(row):
            color = PALETTE[ch]
            if color is None:
                continue
            for dy in range(SCALE):
                for dx in range(SCALE):
                    px[x * SCALE + dx, y * SCALE + dy] = color

    img.save(path)
    print("saved", path, img.size)


render(TARDIS_GRID, "assets/sprites/tardis.png")
