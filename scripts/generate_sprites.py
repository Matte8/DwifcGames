"""One-off script to generate pixel-art (16-bit style) game sprites.

Not part of the game itself: run manually with `python3 scripts/generate_sprites.py`
whenever the sprite design changes. Requires Pillow. Sprites are drawn on a
small logical grid and each cell is rendered as a flat, unscaled block of
`SCALE` real pixels so the result stays crisp (no anti-aliasing/interpolation)
when later scaled in the game with image-smoothing disabled.

Structural markers are shaded procedurally (light-to-dark band across the
body, top-to-bottom band across the windows) to get a richer, more detailed
16-bit look without hand-authoring every shaded pixel.
"""
from PIL import Image

SCALE = 6

PALETTE = {
    '.': None,
    'k': (10, 18, 36, 255),    # outline
    'R': (26, 44, 80, 255),    # rim highlight (left edge, lit side)
    'd': (16, 42, 94, 255),    # dark blue flat (roof / sign band / pilaster / plinth)
    'L': (74, 138, 222, 255),  # body: light shading band
    'M': (30, 82, 168, 255),   # body: mid shading band
    'D': (18, 50, 108, 255),   # body: dark shading band
    'W': (204, 236, 255, 255), # window: light pane
    'V': (146, 196, 234, 255), # window: shaded pane
    'c': (255, 240, 202, 255), # lamp
}

# Marcatori strutturali prima dell'ombreggiatura procedurale:
# 'B' = corpo (diventa L/M/D in base alla colonna), 'w' = finestra (diventa W/V in base alla riga)
BODY_LEFT, BODY_RIGHT = 3, 20  # colonne di bordo del corpo (outline incluso)

TARDIS_GRID = [
    "..........kkkk..........",  # 0  lampada, contorno
    "..........kcck..........",  # 1  lampada, vetro
    "...........kk...........",  # 2  stelo verso il tetto
    "..kkkkkkkkkkkkkkkkkkkk..",  # 3  tetto, bordo superiore
    "..kddddddddddddddddddk..",  # 4  tetto, riempimento
    "..kddddddddddddddddddk..",  # 5  tetto, riempimento
    "...kkkkkkkkkkkkkkkkkk...",  # 6  giunzione tetto/corpo
    "...kwwwkwwwddwwwkwwwk...",  # 7  finestre superiori
    "...kwwwkwwwddwwwkwwwk...",  # 8  finestre superiori
    "...kwwwkwwwddwwwkwwwk...",  # 9  finestre superiori
    "...kwwwkwwwddwwwkwwwk...",  # 10 finestre superiori
    "...kkkkkkkkddkkkkkkkk...",  # 11 traversa orizzontale
    "...kwwwkwwwddwwwkwwwk...",  # 12 finestre inferiori
    "...kwwwkwwwddwwwkwwwk...",  # 13 finestre inferiori
    "...kwwwkwwwddwwwkwwwk...",  # 14 finestre inferiori
    "...kwwwkwwwddwwwkwwwk...",  # 15 finestre inferiori
    "...kkkkkkkkddkkkkkkkk...",  # 16 traversa orizzontale
    "...kkkkkkkkkkkkkkkkkk...",  # 17 chiusura zona finestre
    "...kddddddddddddddddk...",  # 18 fascia targa
    "...kddddddddddddddddk...",  # 19 fascia targa
    "...kkkkkkkkkkkkkkkkkk...",  # 20 chiusura fascia targa
    "...kBBBBBBBddBBBBBBBk...",  # 21 pannelli porta
    "...kBBBBBBBddBBBBBBBk...",  # 22 pannelli porta
    "...kBBBBBBBddBBBBBBBk...",  # 23 pannelli porta
    "...kBBBBBBBddBBBBBBBk...",  # 24 pannelli porta
    "...kBBBBBBBddBBBBBBBk...",  # 25 pannelli porta
    "...kBBBBBBBddBBBBBBBk...",  # 26 pannelli porta
    "...kBBBBBBBddBBBBBBBk...",  # 27 pannelli porta
    "...kBBBBBBBddBBBBBBBk...",  # 28 pannelli porta
    "...kBBBBBBBddBBBBBBBk...",  # 29 pannelli porta
    "...kBBBBBBBddBBBBBBBk...",  # 30 pannelli porta
    "...kkkkkkkkkkkkkkkkkk...",  # 31 chiusura corpo
    "..kddddddddddddddddddk..",  # 32 zoccolo/base
    "........................",  # 33 margine trasparente
]

WINDOW_TOP_ROWS = {7, 8, 9, 10}


def shade(grid):
    shaded = [list(row) for row in grid]
    width = BODY_RIGHT - BODY_LEFT
    for y, row in enumerate(shaded):
        for x, ch in enumerate(row):
            if ch == 'B':
                t = (x - BODY_LEFT) / width
                row[x] = 'L' if t < 0.35 else ('M' if t < 0.7 else 'D')
            elif ch == 'w':
                row[x] = 'W' if y in WINDOW_TOP_ROWS else 'V'
        # filo di luce sul bordo sinistro del corpo (lato illuminato)
        if row[BODY_LEFT] == 'k' and 7 <= y <= 30:
            row[BODY_LEFT] = 'R'
    return [''.join(row) for row in shaded]


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


render(shade(TARDIS_GRID), "assets/sprites/tardis.png")
