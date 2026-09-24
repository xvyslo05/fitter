"""Assemble variant for the eMs Raglan Hoodie ALEX PDF.

The PDF was printed through Foxit, so every stroke is a filled outline
polygon and tiles butt-join at the page frame (no overlap). This clips each
page's fills to its frame, drops the frame itself, and writes the same
sheet.json / sheet.png as assemble.py. Paths keep their fill colour and get
"closed": true so extraction can fill them.

Usage: python raglan-hoodie-alex_assemble.py <config.json> <out_dir>
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
import pymupdf
from shapely.geometry import Polygon, box

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from assemble import flatten  # noqa: E402


def main():
    cfg_path = Path(sys.argv[1])
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    cfg = json.loads(cfg_path.read_text())
    doc = pymupdf.open(cfg_path.parent / cfg["pdf"])
    step_x, step_y = cfg["step"]
    ox, oy = cfg["origin"]
    fx0, fy0, fx1, fy1 = cfg["frame"]
    clip = box(fx0, fy0, fx1, fy1)
    paths = []
    for key, (col, row) in cfg["pages"].items():
        pno = int(key)
        page = doc[pno - 1]
        tx = col * step_x - ox
        ty = row * step_y - oy
        for d in page.get_drawings():
            r = d["rect"]
            if r.width > 480 and r.height > 700:  # page frame
                continue
            col_ = d.get("fill") or d.get("color")
            for sp in flatten(d):
                if len(sp) < 3:
                    continue
                poly = Polygon(sp).buffer(0)
                if poly.is_empty:
                    continue
                poly = poly.intersection(clip)
                if poly.is_empty:
                    continue
                geoms = getattr(poly, "geoms", [poly])
                for gm in geoms:
                    if gm.geom_type != "Polygon" or gm.area <= 0:
                        continue
                    paths.append({
                        "page": pno,
                        "pts": [(round(x + tx, 3), round(y + ty, 3)) for x, y in gm.exterior.coords],
                        "color": None,
                        "fill": [round(c, 3) for c in col_],
                        "width": None,
                        "dashes": None,
                    })
    (out / "sheet.json").write_text(json.dumps({"paths": paths, "texts": []}))
    allx = [p[0] for d in paths for p in d["pts"]]
    ally = [p[1] for d in paths for p in d["pts"]]
    minx, miny = min(allx), min(ally)
    s = 1.5 * 25.4 / 72  # 1.5 px per mm
    W = int((max(allx) - minx) * s) + 10
    H = int((max(ally) - miny) * s) + 10
    img = np.full((H, W, 3), 255, np.uint8)
    for d in paths:
        bgr = tuple(int(c * 255) for c in d["fill"][::-1])
        pts = np.array([[(x - minx) * s, (y - miny) * s] for x, y in d["pts"]], np.int32)
        cv2.fillPoly(img, [pts], bgr)
    # tile borders for orientation
    for key, (col, row) in cfg["pages"].items():
        x0 = (col * step_x - minx) * s
        y0 = (row * step_y - miny) * s
        cv2.rectangle(img, (int(x0), int(y0)), (int(x0 + step_x * s), int(y0 + step_y * s)), (220, 220, 220), 1)
        cv2.putText(img, str(int(key) - 6), (int(x0 + 10), int(y0 + 40)), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (180, 180, 180), 2)
    cv2.imwrite(str(out / "sheet.png"), img)
    print(f"paths={len(paths)} extent_pt=({minx:.1f},{miny:.1f})-({max(allx):.1f},{max(ally):.1f}) png={W}x{H}")


if __name__ == "__main__":
    main()
