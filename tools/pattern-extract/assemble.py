"""Assemble tiled A4 pattern PDF pages into one global coordinate space.

Usage: python assemble.py <config.json> <out_dir>

Config keys:
  pdf      path to the PDF (relative to config file)
  pages    {"<1-based page>": [col, row], ...}  grid position of each tile
  step     [dx, dy]  distance in pt between neighbouring tiles
  origin   [x, y]    page-local point (pt) that sits at the tile's grid corner
  offsets  optional {"<page>": [dx, dy]} extra per-page correction in pt
  rotate   optional {"<page>": 90|180|270} page content rotation before placing

Writes <out_dir>/sheet.json (all vector paths and text in global pt) and
<out_dir>/sheet.png (a render for visual checking).
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
import pymupdf
import cv2


def bezier(p0, p1, p2, p3, n=12):
    pts = []
    for i in range(1, n + 1):
        t = i / n
        mt = 1 - t
        x = mt**3 * p0.x + 3 * mt**2 * t * p1.x + 3 * mt * t**2 * p2.x + t**3 * p3.x
        y = mt**3 * p0.y + 3 * mt**2 * t * p1.y + 3 * mt * t**2 * p2.y + t**3 * p3.y
        pts.append((x, y))
    return pts


def flatten(drawing):
    """Return list of subpaths, each a list of (x, y) points in page space."""
    subpaths = []
    cur = []

    def start(p):
        nonlocal cur
        if cur and (abs(cur[-1][0] - p.x) > 0.01 or abs(cur[-1][1] - p.y) > 0.01):
            subpaths.append(cur)
            cur = [(p.x, p.y)]
        elif not cur:
            cur = [(p.x, p.y)]

    for it in drawing["items"]:
        kind = it[0]
        if kind == "l":
            start(it[1])
            cur.append((it[2].x, it[2].y))
        elif kind == "c":
            start(it[1])
            cur.extend(bezier(it[1], it[2], it[3], it[4]))
        elif kind == "re":
            r = it[1]
            if cur:
                subpaths.append(cur)
            subpaths.append([(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1), (r.x0, r.y0)])
            cur = []
        elif kind == "qu":
            q = it[1]
            if cur:
                subpaths.append(cur)
            subpaths.append([(q.ul.x, q.ul.y), (q.ur.x, q.ur.y), (q.lr.x, q.lr.y), (q.ll.x, q.ll.y), (q.ul.x, q.ul.y)])
            cur = []
    if cur:
        subpaths.append(cur)
    if drawing.get("closePath"):
        subpaths = [sp + [sp[0]] if len(sp) > 2 else sp for sp in subpaths]
    return [sp for sp in subpaths if len(sp) >= 2]


def rot_point(x, y, w, h, deg):
    if deg == 90:
        return h - y, x
    if deg == 180:
        return w - x, h - y
    if deg == 270:
        return y, w - x
    return x, y


def main():
    cfg_path = Path(sys.argv[1])
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    cfg = json.loads(cfg_path.read_text())
    doc = pymupdf.open(cfg_path.parent / cfg["pdf"])
    step_x, step_y = cfg["step"]
    ox, oy = cfg["origin"]
    extra = cfg.get("offsets", {})
    rotate = cfg.get("rotate", {})

    paths, texts = [], []
    for key, (col, row) in cfg["pages"].items():
        pno = int(key)
        page = doc[pno - 1]
        w, h = page.rect.width, page.rect.height
        deg = rotate.get(key, 0)
        ex, ey = extra.get(key, [0, 0])
        tx = col * step_x - ox + ex
        ty = row * step_y - oy + ey

        def g(x, y):
            x, y = rot_point(x, y, w, h, deg)
            return round(x + tx, 3), round(y + ty, 3)

        for d in page.get_drawings():
            for sp in flatten(d):
                paths.append({
                    "page": pno,
                    "pts": [g(x, y) for x, y in sp],
                    "color": d.get("color"),
                    "fill": d.get("fill"),
                    "width": round(d["width"], 3) if d.get("width") is not None else None,
                    "dashes": d.get("dashes"),
                })
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line["spans"]:
                    if not span["text"].strip():
                        continue
                    x0, y0, x1, y1 = span["bbox"]
                    a = g(x0, y0)
                    b = g(x1, y1)
                    texts.append({
                        "page": pno,
                        "text": span["text"],
                        "bbox": [min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1])],
                        "size": round(span["size"], 2),
                        "color": span["color"],
                        "dir": line["dir"],
                    })

    (out / "sheet.json").write_text(json.dumps({"paths": paths, "texts": texts}))

    # Render: colour-preserving, 2 px per mm.
    allx = [p[0] for d in paths for p in d["pts"]]
    ally = [p[1] for d in paths for p in d["pts"]]
    minx, miny = min(allx), min(ally)
    ppt = 2 * 25.4 / 72  # 2 px per mm
    W = int((max(allx) - minx) * ppt) + 10
    H = int((max(ally) - miny) * ppt) + 10
    img = np.full((H, W, 3), 255, np.uint8)
    for d in paths:
        col = d["color"] or d["fill"] or (0, 0, 0)
        bgr = tuple(int(c * 255) for c in col[::-1])
        pts = np.array([[(x - minx) * ppt, (y - miny) * ppt] for x, y in d["pts"]], np.int32)
        if d["fill"] and not d["color"]:
            if len(pts) >= 3:
                cv2.fillPoly(img, [pts], bgr)
        else:
            cv2.polylines(img, [pts], False, bgr, 1, cv2.LINE_AA)
    cv2.imwrite(str(out / "sheet.png"), img)
    print(f"paths={len(paths)} texts={len(texts)} extent_pt=({minx:.1f},{miny:.1f})-({max(allx):.1f},{max(ally):.1f}) png={W}x{H}")


if __name__ == "__main__":
    main()
