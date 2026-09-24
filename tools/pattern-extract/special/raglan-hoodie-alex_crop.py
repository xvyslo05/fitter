"""Render a region of the raglan sheet.json (global pt) at a given px/mm.

Usage: python raglan-hoodie-alex_crop.py <out_dir> x0 y0 x1 y1 pxmm out.png
Region is given in page-tile units of the source PDF: pages are placed as
in the config; coordinates are global pt.
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np

out = Path(sys.argv[1])
x0, y0, x1, y1, pxmm = map(float, sys.argv[2:7])
sheet = json.loads((out / "sheet.json").read_text())
s = pxmm * 25.4 / 72
img = np.full((int((y1 - y0) * s), int((x1 - x0) * s), 3), 255, np.uint8)
for d in sheet["paths"]:
    pts = np.array([[(x - x0) * s, (y - y0) * s] for x, y in d["pts"]])
    if pts[:, 0].max() < 0 or pts[:, 1].max() < 0 or pts[:, 0].min() > img.shape[1] or pts[:, 1].min() > img.shape[0]:
        continue
    bgr = tuple(int(c * 255) for c in d["fill"][::-1])
    cv2.fillPoly(img, [np.round(pts * 8).astype(np.int32)], bgr, cv2.LINE_AA, shift=3)
cv2.imwrite(sys.argv[7], img)
