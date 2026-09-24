"""Extract piece outlines from an assembled sheet (see assemble.py).

Usage:
  python extract.py candidates <config.json> <out_dir>
      Traces closed outlines for every size and writes candidates.json and
      candidates.png (reference size, numbered) so pieces can be identified.
  python extract.py build <config.json> <out_dir> <library_dir>
      Uses the "pieces" section of the config to write
      <library_dir>/<id>.json (fitter-pattern@1) and a preview.svg.

Config keys used here (besides the assemble.py ones):
  id, name, author, notes, seamAllowance ("included" | "none" | "mixed")
  scale        {"squarePt": <measured side in pt>, "squareCm": 5}
  sizes        {"<size>": {"width": [min, max], "color": [r, g, b] | null,
                           "dashes": "<exact dashes string>" | null}}
               color/dashes omitted = any; color compared with tolerance 0.08
  refSize      size used for numbering candidates (default: first size)
  rasterMm     raster resolution (default 0.5)
  gapMm        gaps up to this size are closed (default 1.0)
  minAreaCm2   drop smaller outlines (default 15)
  pieces       [{"at": [x, y] global pt inside the piece (ref size),
                 "id", "name", "cut": [{"material", "count"}],
                 "grain": angle deg (0 = +x, 90 = +y) or [[x1,y1],[x2,y2]],
                 "fold": [[x1,y1],[x2,y2]] approx. fold edge in global pt | null,
                 "optional": bool, "variant": str, "note": str,
                 "sizes": [..] restrict to these sizes}]
"""
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union
from shapely import affinity

PT_CM = 2.54 / 72


def load(cfg_path, out):
    cfg = json.loads(Path(cfg_path).read_text())
    sheet = json.loads((Path(out) / "sheet.json").read_text())
    return cfg, sheet


def match_style(p, st):
    if p["fill"] and not p["color"]:
        return False
    w = p["width"] or 0
    lo, hi = st.get("width", [0, 1e9])
    if not (lo <= w <= hi):
        return False
    if st.get("color") is not None:
        c = p["color"] or (0, 0, 0)
        if max(abs(a - b) for a, b in zip(c, st["color"])) > st.get("colorTol", 0.08):
            return False
    if "dashes" in st and st["dashes"] is not None and str(p["dashes"]) != st["dashes"]:
        return False
    return True


def trace(paths, cfg):
    """Return list of shapely Polygons (global pt) enclosed by the given paths."""
    if not paths:
        return []
    res_mm = cfg.get("rasterMm", 0.5)
    gap_mm = cfg.get("gapMm", 1.0)
    px_per_pt = (25.4 / 72) / res_mm
    xs = [q[0] for p in paths for q in p["pts"]]
    ys = [q[1] for p in paths for q in p["pts"]]
    minx, miny = min(xs) - 20, min(ys) - 20
    W = int((max(xs) + 20 - minx) * px_per_pt) + 1
    H = int((max(ys) + 20 - miny) * px_per_pt) + 1
    img = np.zeros((H, W), np.uint8)
    for p in paths:
        pts = np.array([[(x - minx) * px_per_pt, (y - miny) * px_per_pt] for x, y in p["pts"]])
        cv2.polylines(img, [np.round(pts * 8).astype(np.int32)], False, 255, 1, cv2.LINE_8, shift=3)
    g = max(1, int(round(gap_mm / res_mm / 2)))
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * g + 1, 2 * g + 1))
    closed = cv2.dilate(img, k)
    ff = closed.copy()
    mask = np.zeros((H + 2, W + 2), np.uint8)
    cv2.floodFill(ff, mask, (0, 0), 128)
    solid = np.where(ff == 128, 0, 255).astype(np.uint8)
    solid = cv2.erode(solid, k)
    contours, _ = cv2.findContours(solid, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    min_area_pt2 = cfg.get("minAreaCm2", 15) / PT_CM**2
    polys = []
    for c in contours:
        c = c[:, 0, :].astype(float)
        if len(c) < 4:
            continue
        pts = [(x / px_per_pt + minx, y / px_per_pt + miny) for x, y in c]
        poly = Polygon(pts).buffer(0)
        if poly.area < min_area_pt2:
            continue
        poly = poly.simplify(0.3 / 10 / PT_CM)  # 0.3 mm
        if poly.geom_type == "MultiPolygon":
            poly = max(poly.geoms, key=lambda q: q.area)
        polys.append(Polygon(poly.exterior.coords))
    return polys


def straight_segments(paths, poly, min_len_pt):
    segs = []
    for p in paths:
        pts = p["pts"]
        for a, b in zip(pts, pts[1:]):
            L = math.dist(a, b)
            if L >= min_len_pt and poly.contains(Point((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)):
                ang = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) % 180
                segs.append({"a": [round(v, 1) for v in a], "b": [round(v, 1) for v in b],
                             "lenCm": round(L * PT_CM, 1), "angle": round(ang, 1),
                             "width": p["width"], "color": p["color"]})
    segs.sort(key=lambda s: -s["lenCm"])
    return segs[:8]


def all_traces(cfg, sheet):
    out = {}
    for size, st in cfg["sizes"].items():
        sel = [p for p in sheet["paths"] if match_style(p, st)]
        out[size] = trace(sel, cfg)
    return out


def cmd_candidates(cfg_path, out):
    cfg, sheet = load(cfg_path, out)
    traces = all_traces(cfg, sheet)
    ref = cfg.get("refSize", next(iter(cfg["sizes"])))
    cands = []
    for i, poly in enumerate(traces[ref]):
        labels = [t["text"] for t in sheet["texts"]
                  if poly.contains(Point((t["bbox"][0] + t["bbox"][2]) / 2, (t["bbox"][1] + t["bbox"][3]) / 2))]
        rp = poly.representative_point()
        minx, miny, maxx, maxy = poly.bounds
        cands.append({
            "index": i,
            "at": [round(rp.x, 1), round(rp.y, 1)],
            "bboxCm": [round((maxx - minx) * PT_CM, 1), round((maxy - miny) * PT_CM, 1)],
            "areaCm2": round(poly.area * PT_CM**2, 1),
            "labels": labels[:12],
            "segments": straight_segments(sheet["paths"], poly, 3 / PT_CM),
            "perSize": {s: sum(1 for q in traces[s] if q.intersects(poly)) for s in traces},
        })
    (Path(out) / "candidates.json").write_text(json.dumps(cands, ensure_ascii=False, indent=1))
    for s, polys in traces.items():
        print(f"size {s}: {len(polys)} outlines, areas cm2 = {sorted(round(p.area * PT_CM**2) for p in polys)}")

    # Render all sizes, reference numbered.
    allp = [p for ps in traces.values() for p in ps]
    if not allp:
        return
    minx = min(p.bounds[0] for p in allp) - 20
    miny = min(p.bounds[1] for p in allp) - 20
    maxx = max(p.bounds[2] for p in allp) + 20
    maxy = max(p.bounds[3] for p in allp) + 20
    s = 3 * 25.4 / 72 / 2  # 1.5 px per mm
    img = np.full((int((maxy - miny) * s), int((maxx - minx) * s), 3), 255, np.uint8)
    palette = [(0, 0, 0), (200, 0, 200), (0, 140, 0), (0, 0, 220), (220, 120, 0), (0, 160, 200), (120, 60, 0), (150, 150, 0), (100, 100, 255), (255, 0, 0)]
    for k, (size, polys) in enumerate(traces.items()):
        for poly in polys:
            pts = np.array([[(x - minx) * s, (y - miny) * s] for x, y in poly.exterior.coords], np.int32)
            cv2.polylines(img, [pts], True, palette[k % len(palette)], 1, cv2.LINE_AA)
    for c in cands:
        x, y = c["at"]
        cv2.putText(img, str(c["index"]), (int((x - minx) * s), int((y - miny) * s)), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 255), 2)
    cv2.imwrite(str(Path(out) / "candidates.png"), img)


def snap_fold(poly, approx, tol_pt):
    """Fit the fold line to outline vertices lying within tol of the approximate line."""
    line = LineString(approx)
    pts = np.array([p for p in poly.exterior.coords if line.distance(Point(p)) <= tol_pt])
    if len(pts) < 2:
        raise SystemExit(f"fold line {approx} does not touch outline")
    d = np.array(approx[1]) - np.array(approx[0])
    d = d / np.linalg.norm(d)
    c = pts.mean(axis=0)
    # principal direction of the snapped points
    u, sv, vt = np.linalg.svd(pts - c)
    dirv = vt[0] if np.dot(vt[0], d) >= 0 else -vt[0]
    t = (pts - c) @ dirv
    return [tuple(c + t.min() * dirv), tuple(c + t.max() * dirv)]


def grain_angle(spec):
    if isinstance(spec, (int, float)):
        return float(spec)
    (x1, y1), (x2, y2) = spec
    return math.degrees(math.atan2(y2 - y1, x2 - x1))


def cmd_build(cfg_path, out, lib_dir):
    cfg, sheet = load(cfg_path, out)
    traces = all_traces(cfg, sheet)
    sizes = list(cfg["sizes"].keys())
    ref = cfg.get("refSize", sizes[0])
    # cm per pt from the test square (1.0 when printed at 100 %).
    sc = cfg.get("scale")
    k = sc["squareCm"] / sc["squarePt"] if sc else PT_CM
    pieces = []
    for pc in cfg["pieces"]:
        at = Point(pc["at"])
        ref_polys = [p for p in traces[ref] if p.contains(at)]
        if not ref_polys:
            raise SystemExit(f"piece {pc['id']}: no {ref} outline contains {pc['at']}")
        ref_poly = min(ref_polys, key=lambda p: p.area)
        # Rotate so the grain runs along +y (fabric length).
        rot = 90 - grain_angle(pc["grain"])
        per_size = {}
        for size in pc.get("sizes", sizes):
            if size == ref:
                poly = ref_poly
            else:
                cand = [p for p in traces[size] if p.intersects(ref_poly)]
                if not cand:
                    raise SystemExit(f"piece {pc['id']}: size {size} not found")
                poly = max(cand, key=lambda p: p.intersection(ref_poly).area / max(p.area, ref_poly.area))
            fold = snap_fold(poly, pc["fold"], cfg.get("foldTolMm", 2.5) / 10 / PT_CM) if pc.get("fold") else None
            per_size[size] = (poly, fold)
        # Common rotation origin keeps sizes aligned with each other.
        origin = ref_poly.centroid
        entry = {k: pc[k] for k in ("id", "name", "cut", "optional", "variant", "note") if k in pc}
        entry["sizes"] = {}
        for size, (poly, fold) in per_size.items():
            rp = affinity.scale(affinity.rotate(poly, rot, origin=origin), k, k, origin=(0, 0))
            minx, miny = rp.bounds[0], rp.bounds[1]
            rp = affinity.translate(rp, -minx, -miny)
            coords = list(rp.exterior.coords)[:-1]
            if Polygon(coords).exterior.is_ccw:
                coords.reverse()
            item = {"outline": [[round(x, 2), round(y, 2)] for x, y in coords]}
            if fold:
                fl = affinity.translate(affinity.scale(affinity.rotate(LineString(fold), rot, origin=origin), k, k, origin=(0, 0)), -minx, -miny)
                item["fold"] = [[round(x, 2), round(y, 2)] for x, y in fl.coords]
            b = rp.bounds
            item["bbox"] = [round(b[2], 1), round(b[3], 1)]
            item["area"] = round(rp.area, 1)
            entry["sizes"][size] = item
        pieces.append(entry)

    lib = {
        "format": "fitter-pattern@1",
        "id": cfg["id"],
        "name": cfg["name"],
        "author": cfg.get("author"),
        "source": Path(cfg["pdf"]).name,
        "seamAllowance": cfg.get("seamAllowance"),
        "notes": cfg.get("notes"),
        "sizes": sizes,
        "pieces": pieces,
    }
    lib_dir = Path(lib_dir)
    lib_dir.mkdir(parents=True, exist_ok=True)
    (lib_dir / f"{cfg['id']}.json").write_text(json.dumps(lib, ensure_ascii=False, indent=1))
    write_preview(lib, Path(out) / "preview.svg")
    for p in pieces:
        print(p["id"], {s: v["bbox"] for s, v in p["sizes"].items()})


def write_preview(lib, path):
    """All pieces side by side, all sizes overlaid, grain arrow vertical, fold dashed red."""
    parts, x0 = [], 2
    colors = ["#000", "#c0c", "#080", "#00c", "#c70", "#0aa", "#730", "#990", "#66f", "#f00"]
    H = 0
    for p in lib["pieces"]:
        w = max(v["bbox"][0] for v in p["sizes"].values())
        h = max(v["bbox"][1] for v in p["sizes"].values())
        H = max(H, h)
        for k, (size, v) in enumerate(p["sizes"].items()):
            pts = " ".join(f"{x + x0:.2f},{y + 6:.2f}" for x, y in v["outline"])
            parts.append(f'<polygon points="{pts}" fill="none" stroke="{colors[k % len(colors)]}" stroke-width="0.15"/>')
            if "fold" in v:
                (a, b), (c, d) = v["fold"]
                parts.append(f'<line x1="{a + x0}" y1="{b + 6}" x2="{c + x0}" y2="{d + 6}" stroke="red" stroke-width="0.4" stroke-dasharray="1 0.6"/>')
        parts.append(f'<line x1="{x0 + w / 2}" y1="{6 + h * 0.3}" x2="{x0 + w / 2}" y2="{6 + h * 0.7}" stroke="#08f" stroke-width="0.3" marker-end="url(#a)"/>')
        parts.append(f'<text x="{x0}" y="4" font-size="2.2">{p["name"]}</text>')
        x0 += w + 6
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {x0} {H + 10}" width="{x0 * 4}" height="{(H + 10) * 4}">'
           '<defs><marker id="a" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0L10,5L0,10z" fill="#08f"/></marker></defs>'
           f'<rect width="100%" height="100%" fill="#fff"/>{"".join(parts)}</svg>')
    path.write_text(svg)


if __name__ == "__main__":
    if sys.argv[1] == "candidates":
        cmd_candidates(sys.argv[2], sys.argv[3])
    elif sys.argv[1] == "build":
        cmd_build(sys.argv[2], sys.argv[3], sys.argv[4])
    else:
        raise SystemExit(__doc__)
