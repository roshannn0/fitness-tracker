"""Draw the app's geometric mark without dependencies in the delivered app."""
from PIL import Image, ImageDraw
from pathlib import Path

public = Path(__file__).resolve().parents[1] / 'public'
for size, filename in [(192, 'icon-192.png'), (512, 'icon-512.png'), (180, 'apple-touch-icon.png')]:
    side = size * 3
    background = Image.new('RGB', (side, side), '#234333')
    mark = Image.new('RGBA', (side, side))
    draw = ImageDraw.Draw(mark)
    for left, top in [(0.29, 0.51), (0.43, 0.40), (0.57, 0.28)]:
        draw.rounded_rectangle((left * side, top * side, (left + 0.09) * side, 0.69 * side),
                               radius=0.045 * side, fill='#d7ec9e')
    mark = mark.rotate(-13, resample=Image.Resampling.BICUBIC)
    background.paste(mark, (0, 0), mark)
    background.resize((size, size), Image.Resampling.LANCZOS).save(public / filename, optimize=True)
