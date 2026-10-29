# One-off asset prep. Reads brand/ and writes src/assets/. Run: python -I tools/prep-assets.py
import numpy as np, os
from PIL import Image
from skimage import measure
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
brand = os.path.join(root, 'brand'); out = os.path.join(root, 'src', 'assets')
os.makedirs(out, exist_ok=True)
tr = Image.open(os.path.join(brand, 'LOGO KAIVO JPG PNG...png'))   # RGBA, transparent, pure-black behind alpha 0
op = Image.open(os.path.join(brand, 'LOGO KAIVO JPG PNG.png'))     # RGBA, opaque paper background
BB = (505, 534, 1495, 1468)
PAD = 70
box = (BB[0]-PAD, BB[1]-PAD, BB[2]+PAD, BB[3]+PAD)

def premul_resize(im, size):
    # pure-black transparent regions would bleed dark fringes under a straight-alpha resize
    return im.convert('RGBa').resize(size, Image.LANCZOS).convert('RGBA')

crop = tr.crop(box)
w, h = crop.size
for name, width in (('logo-640.png', 640), ('logo-192.png', 192)):
    premul_resize(crop, (width, round(h*width/w))).save(os.path.join(out, name), optimize=True)
# apple touch: logo on sampled paper colour (244,241,234 at 0,0 of the opaque source)
paper = tuple(op.getpixel((0, 0)))
ap = Image.new('RGBA', (180, 180), paper)
lg = premul_resize(crop, (132, round(h*132/w)))
ap.alpha_composite(lg, ((180-lg.width)//2, (180-lg.height)//2))
ap.convert('RGB').save(os.path.join(out, 'apple-touch-icon.png'), optimize=True)

# favicon trace from the opaque pixel grid
a = np.array(op.convert('RGB')).astype(int)[BB[1]:BB[3]+1, BB[0]:BB[2]+1]
r, g, b = a[..., 0], a[..., 1], a[..., 2]
green = (g - r > 30) & (g > 60)
ink = (a.sum(2) < 330) & ~green
D = 4
def trace(mask, tol):
    m = mask[::D, ::D].astype(float)
    m = np.pad(m, 1)
    res = []
    for c in measure.find_contours(m, 0.5):
        c = measure.approximate_polygon(c, tol)
        res.append(c)
    return res
S = 26.0 / max(a.shape[0], a.shape[1]); ox = (32 - a.shape[1]*S)/2; oy = (32 - a.shape[0]*S)/2
def path(cs):
    d = []
    for c in cs:
        pts = [((x-1)*D*S+ox, (y-1)*D*S+oy) for y, x in c]
        d.append('M' + ' '.join(f'{x:.1f} {y:.1f}' for x, y in pts[:-1]) + 'Z')
    return ''.join(d)
jp = Image.open(os.path.join(brand, 'LOGO KAIVO JPG JPG.jpg.jpeg')).convert('RGB')
hx = lambda p: '#%02X%02X%02X' % tuple(p[:3])
inkc = hx(jp.getpixel((1282, 537))); grc = hx(jp.getpixel((1085, 1010)))  # k-means centres snapped to real pixels
svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">'
       f'<rect width="32" height="32" rx="7" fill="{hx(jp.getpixel((0, 0)))}"/>'
       f'<path fill="{inkc}" fill-rule="evenodd" d="{path(trace(ink, 0.9))}"/>'
       f'<path fill="{grc}" fill-rule="evenodd" d="{path(trace(green, 0.6))}"/></svg>')
assert '--' not in svg
open(os.path.join(out, 'favicon.svg'), 'w').write(svg)
Image.open(os.path.join(out, 'apple-touch-icon.png')).resize((32, 32), Image.LANCZOS).save(os.path.join(out, 'favicon-32.png'))
print('paper', paper, 'ink', inkc, 'green', grc, 'svg bytes', len(svg))
