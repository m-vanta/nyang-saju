"""Cream-background cutout: flood fill from border (barrier at ink), feather 1px, trim, save RGBA."""
import sys
import numpy as np
import cv2
from PIL import Image

def cut(inp, outp, tol=30, trim=True):
    im = Image.open(inp).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    h, w, _ = a.shape
    # background estimate: median of border pixels
    border = np.concatenate([a[0:3].reshape(-1, 3), a[-3:].reshape(-1, 3),
                             a[:, 0:3].reshape(-1, 3), a[:, -3:].reshape(-1, 3)])
    bg = np.median(border, axis=0)

    # candidate background: light pixels close to bg color
    dist = np.abs(a - bg).max(axis=2)
    light = a.min(axis=2) > 198
    cand = ((dist < tol) & light).astype(np.uint8)

    # connected components on candidate, keep those touching the border
    n, lab = cv2.connectedComponents(cand, connectivity=4)
    border_labels = set(lab[0, :].tolist()) | set(lab[-1, :].tolist()) | \
        set(lab[:, 0].tolist()) | set(lab[:, -1].tolist())
    border_labels.discard(0)
    bgmask = np.isin(lab, list(border_labels))

    alpha = np.where(bgmask, 0, 255).astype(np.uint8)
    # soften: blur alpha a touch so anti-aliased edges blend
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0.6)
    alpha[bgmask & (alpha < 60)] = 0

    out = np.dstack([np.asarray(im), alpha])
    if trim:
        ys, xs = np.where(alpha > 8)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        out = out[y0:y1, x0:x1]
    Image.fromarray(out, 'RGBA').save(outp, optimize=True)
    print(outp, f'{w}x{h} -> {out.shape[1]}x{out.shape[0]}', 'bg', bg, 'removed%', round(100 * bgmask.mean(), 1))

if __name__ == '__main__':
    cut(sys.argv[1], sys.argv[2], tol=int(sys.argv[3]) if len(sys.argv) > 3 else 30)
