# Checks every token's provenance comment against the real pixel in the named source file.
import re, os, sys
from PIL import Image
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = {'logo jpg': os.path.join(root, 'brand', 'LOGO KAIVO JPG JPG.jpg.jpeg')}
for n in range(1, 7): src['deck KAIVO %d' % n] = os.path.join(root, 'reference', 'KAIVO %d.jpg.jpeg' % n)
bad = 0; n = 0
for line in open(os.path.join(root, 'src', 'tokens.css'), encoding='utf8'):
    m = re.search(r'--([\w-]+):\s*#([0-9A-Fa-f]{6});\s*/\*\s*(logo jpg|deck KAIVO \d) \((\d+),(\d+)\) rgb (\d+) (\d+) (\d+)', line)
    if not m: continue
    n += 1
    name, hexv, s, x, y, r, g, b = m.groups()
    px = Image.open(src[s]).convert('RGB').getpixel((int(x), int(y)))
    want = tuple(int(hexv[i:i+2], 16) for i in (0, 2, 4))
    ok = px == want == (int(r), int(g), int(b))
    if not ok: bad += 1; print('MISMATCH', name, hexv, s, (x, y), px)
print('palette tokens verified:', n, 'mismatches:', bad)
sys.exit(1 if bad or n < 8 else 0)
