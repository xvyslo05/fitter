"""Piece extraction for the eMs Raglan Hoodie ALEX (run after
raglan-hoodie-alex_assemble.py).

Why a special script: every line is a filled stroke outline, sizes are
colours, front and back share one drawing (dashed = front, solid = back),
and body/sleeve lengths are separate black cut lines (1,75 m / 1,90 m body
height, cuff or hem finish, short sleeve). Rib/band pieces exist only as
measurements on pages 4-5 and are added as rectangles.

Usage: python raglan-hoodie-alex_extract.py <config.json> <out_dir> <library_dir>
"""
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from shapely import affinity
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import split, unary_union

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from extract import PT_CM, snap_fold, write_preview  # noqa: E402

SIZES = {  # colour -> size, read from the size labels at the body hem
    "S": (0.0, 0.502, 0.0),
    "M": (1.0, 0.4, 0.0),
    "L": (0.0, 0.0, 1.0),
    "XL": (1.0, 0.0, 0.0),
    "XXL": (0.502, 0.0, 0.502),
}
BLACK = (0.0, 0.0, 0.0)
RES_MM = 0.25
GAP_MM = 4.0   # lines stop ~3 mm short of the black hem lines at tile 5/7
OPEN_MM = 2.0  # removes line spurs sticking out of an outline


def shapes(sheet):
    out = []
    for p in sheet["paths"]:
        poly = Polygon(p["pts"]).buffer(0)
        if poly.is_empty:
            continue
        minx, miny, maxx, maxy = poly.bounds
        diag = math.hypot(maxx - minx, maxy - miny)
        comp = 4 * math.pi * poly.area / poly.length**2 if poly.length else 0
        kind = "dot" if diag < 12 and comp > 0.75 else ("small" if diag < 15 else "long")
        out.append({"poly": poly, "fill": tuple(p["fill"]), "kind": kind, "bounds": poly.bounds})
    return out


def sel(shs, color, region, kinds=("long",), pred=None):
    x0, y0, x1, y1 = region
    res = []
    for s in shs:
        if s["fill"] != color or s["kind"] not in kinds:
            continue
        b = s["bounds"]
        if b[0] < x0 or b[1] < y0 or b[2] > x1 or b[3] > y1:
            continue
        if pred and not pred(s):
            continue
        res.append(s["poly"])
    return res


def envelope(polys, clip=None):
    """Outline(s) enclosed by the given stroke polygons (global pt)."""
    geom = unary_union(polys)
    if clip is not None:
        geom = geom.intersection(clip)
    minx, miny, maxx, maxy = geom.bounds
    minx -= 30
    miny -= 30
    ppt = (25.4 / 72) / RES_MM
    W = int((maxx + 30 - minx) * ppt) + 1
    H = int((maxy + 30 - miny) * ppt) + 1
    img = np.zeros((H, W), np.uint8)
    for g in getattr(geom, "geoms", [geom]):
        if g.geom_type != "Polygon":
            continue
        pts = np.array([[(x - minx) * ppt, (y - miny) * ppt] for x, y in g.exterior.coords])
        cv2.fillPoly(img, [np.round(pts * 8).astype(np.int32)], 255, cv2.LINE_8, shift=3)
    r = int(round(GAP_MM / RES_MM / 2))
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    closed = cv2.dilate(img, k)
    ff = closed.copy()
    cv2.floodFill(ff, np.zeros((H + 2, W + 2), np.uint8), (0, 0), 128)
    solid = np.where(ff == 128, 0, 255).astype(np.uint8)
    solid = cv2.erode(solid, k)
    o = int(round(OPEN_MM / RES_MM / 2))
    ko = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * o + 1, 2 * o + 1))
    solid = cv2.morphologyEx(solid, cv2.MORPH_OPEN, ko)
    contours, _ = cv2.findContours(solid, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    polys = []
    for c in contours:
        c = c[:, 0, :].astype(float)
        if len(c) < 4:
            continue
        poly = Polygon([(x / ppt + minx, y / ppt + miny) for x, y in c]).buffer(0)
        if poly.area * PT_CM**2 < 20:
            continue
        poly = poly.simplify(0.3 / 10 / PT_CM)
        if poly.geom_type == "MultiPolygon":
            poly = max(poly.geoms, key=lambda q: q.area)
        polys.append(Polygon(poly.exterior.coords))
    return sorted(polys, key=lambda p: -p.area)


def centerline(polys, ext=40):
    """Centre line of a near-horizontal stroke (possibly split over tiles), extended at both ends."""
    pts = np.array([p for poly in polys for p in poly.exterior.coords])
    xs = np.arange(pts[:, 0].min(), pts[:, 0].max() + 1, 3.0)
    line = []
    for x in xs:
        m = np.abs(pts[:, 0] - x) < 2.5
        if m.any():
            line.append((x, pts[m, 1].mean()))
    (x0, y0), (x1, y1) = line[0], line[min(5, len(line) - 1)]
    a = math.atan2(y1 - y0, x1 - x0)
    head = (x0 - ext * math.cos(a), y0 - ext * math.sin(a))
    (x0, y0), (x1, y1) = line[-1], line[max(-6, -len(line))]
    a = math.atan2(y0 - y1, x0 - x1)
    tail = (x0 + ext * math.cos(a), y0 + ext * math.sin(a))
    return LineString([head] + line + [tail]).simplify(0.8)


def cut_keep(poly, line, seed):
    parts = split(poly, line)
    keep = [g for g in parts.geoms if g.contains(Point(seed))]
    if len(parts.geoms) < 2 or not keep:
        raise SystemExit(f"cut failed ({len(parts.geoms)} parts)")
    return keep[0]


def pick(polys, seed, what):
    hit = [p for p in polys if p.contains(Point(seed))]
    if not hit:
        raise SystemExit(f"{what}: no outline contains {seed}")
    return min(hit, key=lambda p: p.area)


def main():
    cfg_path, out, lib_dir = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    cfg = json.loads(cfg_path.read_text())
    sheet = json.loads((out / "sheet.json").read_text())
    shs = shapes(sheet)
    sc = cfg["scale"]
    k = sc["squareCm"] / sc["squarePt"]

    BODY = (0, 0, 1010, 2980)
    SLEEVE = (1500, 0, 3020, 2980)
    HOOD = (0, 3700, 1500, 5210)
    POCKET = (2000, 3700, 3020, 4470)

    def black_long(region, pred):
        return sel(shs, BLACK, region, ("long",), pred)

    fold = black_long(BODY, lambda s: 960 < s["bounds"][0] < 975 and s["bounds"][3] - s["bounds"][1] > 300)
    hem = {}
    for name, (ylo, yhi) in {"F175": (2225, 2245), "B175": (2325, 2345), "F190": (2445, 2462), "B190": (2540, 2558)}.items():
        hem[name] = black_long(BODY, lambda s, ylo=ylo, yhi=yhi: ylo < s["bounds"][1] and s["bounds"][3] < yhi and s["bounds"][2] - s["bounds"][0] > 150)
    sl_lines = {}
    for name, (ylo, yhi) in {"B175": (2380, 2400), "S175": (2470, 2485), "B190": (2518, 2535), "S190": (2605, 2620)}.items():
        sl_lines[name] = black_long(SLEEVE, lambda s, ylo=ylo, yhi=yhi: ylo < s["bounds"][1] and s["bounds"][3] < yhi and s["bounds"][2] - s["bounds"][0] > 60)
    wide = lambda s: s["bounds"][2] - s["bounds"][0] > 200  # skips the label glyphs between the lines
    sl_lines["shortB"] = black_long(SLEEVE, lambda s: wide(s) and 1255 < s["bounds"][1] < 1312 and s["bounds"][3] < 1410)
    sl_lines["shortS"] = black_long(SLEEVE, lambda s: wide(s) and 1315 < s["bounds"][1] < 1370 and s["bounds"][3] > 1340)
    hood_front = black_long(HOOD, lambda s: s["bounds"][0] > 1280)
    # Pocket lines are split at x~2475/2511/2557, so classify by position.
    def pdiag(s):
        b = s["bounds"]
        return math.hypot(b[2] - b[0], b[3] - b[1])
    pk = [s for s in shs if s["fill"] == BLACK and s["kind"] == "long" and pdiag(s) >= 20
          and s["bounds"][0] > POCKET[0] and s["bounds"][1] > POCKET[1] and s["bounds"][3] < POCKET[3]]
    is_big = lambda b: (b[1] > 4380) or (b[0] < 2132 and b[3] > 4390)
    is_small = lambda b: (4270 < b[1] < 4330 and b[3] < 4330) or (2180 < b[0] < 2185 and 4270 < b[3] < 4290)
    pocket = {
        "base": [s["poly"] for s in pk if not is_big(s["bounds"]) and not is_small(s["bounds"])],
        "big": [s["poly"] for s in pk if is_big(s["bounds"])],
        "small": [s["poly"] for s in pk if is_small(s["bounds"])],
    }
    for n, v in list(hem.items()) + list(sl_lines.items()) + list(pocket.items()) + [("fold", fold), ("hoodFront", hood_front)]:
        if not v:
            raise SystemExit(f"black line {n} not found")
        print(f"line {n}: {len(v)} parts, x {min(p.bounds[0] for p in v):.0f}-{max(p.bounds[2] for p in v):.0f}")

    per_piece = {}  # piece id -> {size: (poly, fold_line or None)}

    def put(pid, size, poly, fl=None):
        per_piece.setdefault(pid, {})[size] = (poly, fl)

    fold_x = unary_union(fold).centroid.x
    for size, col in SIZES.items():
        solid = sel(shs, col, BODY)
        dashes = sel(shs, col, BODY, ("small",), lambda s: s["bounds"][3] < 2000)
        corner_y = max(p.bounds[3] for p in dashes)  # dashed front line ends at the armpit corner
        solid_low = [p for p in solid if p.bounds[1] >= corner_y - 25]
        for v in ("175", "190"):
            fh, bh = hem["F" + v], hem["B" + v]
            clip_f = box(-100, -100, 2000, max(p.bounds[3] for p in fh) + 1)
            clip_b = box(-100, -100, 2000, max(p.bounds[3] for p in bh) + 1)
            front = envelope(dashes + solid_low + fold + fh, clip_f)
            back = envelope(solid + fold + bh, clip_b)
            seed = (fold_x - 60, 1500)
            fp, bp = pick(front, seed, f"front {size}"), pick(back, seed, f"back {size}")
            fx = [(fold_x, 100), (fold_x, 2600)]
            put("vorderteil-" + v, size, fp, snap_fold(fp, fx, 0.3 / PT_CM))
            put("rueckenteil-" + v, size, bp, snap_fold(bp, fx, 0.3 / PT_CM))

        # sleeve: full outline down to the lowest line, then cut per finish
        sl = sel(shs, col, SLEEVE)
        clip = box(1400, -100, 3100, max(p.bounds[3] for p in sl_lines["S190"]) + 1)
        full = pick(envelope(sl + sl_lines["S190"], clip), (2260, 700), f"sleeve {size}")
        top = (2260, 400)
        for name, key in (("aermel-lang-buendchen-175", "B175"), ("aermel-lang-saum-175", "S175"),
                          ("aermel-lang-buendchen-190", "B190"), ("aermel-lang-saum-190", "S190"),
                          ("aermel-kurz-buendchen", "shortB"), ("aermel-kurz-saum", "shortS")):
            poly = full if key == "S190" else cut_keep(full, centerline(sl_lines[key]), top)
            put(name, size, poly)

        # hood: coloured back/neck/top edges + shared black front edge
        hd = sel(shs, col, HOOD)
        hp = pick(envelope(hd + hood_front), (900, 4700), f"hood {size}")
        put("kapuze", size, hp)
        top_edge = [p for p in hd if p.bounds[1] < 4220 and p.bounds[2] - p.bounds[0] > 200 and p.bounds[3] - p.bounds[1] < 30]
        if len(top_edge) != 1:
            raise SystemExit(f"hood top edge {size}: {len(top_edge)} candidates")
        te = np.array(top_edge[0].exterior.coords)
        approx = [tuple(te[te[:, 0].argmin()]), tuple(te[te[:, 0].argmax()])]
        put("kapuze-bruch", size, hp, snap_fold(hp, approx, 0.3 / PT_CM))

    # pockets: black only, identical for all sizes
    big = pick(envelope(pocket["base"] + pocket["big"]), (2700, 4100), "big pocket")
    small = pick(envelope(pocket["base"] + pocket["small"]), (2700, 4100), "small pocket")
    for size in SIZES:
        put("tasche-gross", size, big)
        put("tasche-klein", size, small)

    (out / "global_outlines.json").write_text(json.dumps({pid: {sz: list(v[0].exterior.coords) for sz, v in d.items()} for pid, d in per_piece.items()}))

    # ---- assemble library entries -------------------------------------
    pieces = []
    for pc in cfg["pieces"]:
        pid = pc["id"]
        entry = {kk: pc[kk] for kk in ("id", "name", "cut", "optional", "variant", "variantGroup", "note") if kk in pc}
        entry["sizes"] = {}
        if "rect" in pc:  # measurement-only rectangles, grain along height
            for size, (w, h) in pc["rect"].items():
                coords = [(0, 0), (0, h), (w, h), (w, 0)]
                entry["sizes"][size] = {"outline": [[float(x), float(y)] for x, y in coords], "bbox": [float(w), float(h)], "area": round(w * h, 1)}
            pieces.append(entry)
            continue
        rot = 90 - pc["grain"]
        ref = per_piece[pid]["L"][0]
        origin = ref.centroid
        for size in SIZES:
            poly, fl = per_piece[pid][size]
            rp = affinity.scale(affinity.rotate(poly, rot, origin=origin), k, k, origin=(0, 0))
            minx, miny = rp.bounds[0], rp.bounds[1]
            rp = affinity.translate(rp, -minx, -miny)
            coords = list(rp.exterior.coords)[:-1]
            if Polygon(coords).exterior.is_ccw:
                coords.reverse()
            item = {"outline": [[round(x, 2), round(y, 2)] for x, y in coords]}
            if fl:
                f = affinity.translate(affinity.scale(affinity.rotate(LineString(fl), rot, origin=origin), k, k, origin=(0, 0)), -minx, -miny)
                item["fold"] = [[round(x, 2), round(y, 2)] for x, y in f.coords]
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
        "sizes": list(SIZES),
        "pieces": pieces,
    }
    lib_dir.mkdir(parents=True, exist_ok=True)
    (lib_dir / f"{cfg['id']}.json").write_text(json.dumps(lib, ensure_ascii=False, indent=1))
    write_preview(lib, out / "preview.svg")
    for p in pieces:
        print(f'{p["id"]:28s}', {s: v["bbox"] for s, v in p["sizes"].items()})


if __name__ == "__main__":
    main()
