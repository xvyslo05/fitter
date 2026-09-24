"""Dandelion dress (P1703A) builder.

Why a special builder:
  * sizes 34/44 and 42/48 share one line style each; they are told apart by
    nesting (the smaller outline is the smaller size),
  * size 40 is a double line drawn as filled bands,
  * sleeve and skirt have length variants (cut lines drawn inside the outline).
Outlines come straight from the closed vector subpaths of sheet.json instead of
the raster trace in extract.py.

Usage: python special/dandelion-dress_build.py <config.json> <out_dir> <library_dir>
(run assemble.py first so <out_dir>/sheet.json exists)
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from extract import grain_angle, snap_fold, trace, write_preview  # noqa: E402

from shapely import affinity  # noqa: E402
from shapely.geometry import LineString, Point, Polygon, box  # noqa: E402
from shapely.ops import nearest_points, unary_union  # noqa: E402


def plen(pts):
    return sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))


def is_closed(pts):
    return len(pts) > 3 and math.dist(pts[0], pts[-1]) < 1


def bbox(pts):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def dedupe(paths):
    seen, out = set(), []
    for p in paths:
        b = bbox(p["pts"])
        key = (p["width"], str(p["dashes"]), bool(p["fill"]), len(p["pts"]),
               tuple(round(v / 2) for v in b), round(plen(p["pts"])))
        if key not in seen:
            seen.add(key)
            out.append(p)
    return out


class Sheet:
    def __init__(self, cfg, sheet):
        self.cfg = cfg
        self.paths = dedupe(sheet["paths"])
        self.k = cfg["scale"]["squareCm"] / cfg["scale"]["squarePt"]  # cm per pt
        self.shared = {}
        for size, st in cfg["sizes"].items():
            if not st.get("fillBand"):
                self.shared.setdefault((st["dashes"], tuple(st["width"])), []).append(size)

    def style_paths(self, size):
        st = self.cfg["sizes"][size]
        if st.get("fillBand"):
            return [p for p in self.paths if p["fill"] and not p["color"]]
        lo, hi = st["width"]
        return [p for p in self.paths if not p["fill"] and p["width"] is not None
                and lo <= p["width"] <= hi and str(p["dashes"]) == st["dashes"]]

    def rank_info(self, size):
        st = self.cfg["sizes"][size]
        group = self.shared[(st["dashes"], tuple(st["width"]))]
        return st.get("rank", 0), len(group)

    def outline(self, size, at):
        """Closed outline (global pt) of the piece containing `at` for `size`."""
        at = Point(at)
        st = self.cfg["sizes"][size]
        if st.get("fillBand"):
            bands = [p for p in self.style_paths(size)
                     if plen(p["pts"]) * self.k > 40 and box(*bbox(p["pts"])).contains(at)]
            polys = [q for q in trace(bands, {"rasterMm": 0.2, "gapMm": 0.6, "minAreaCm2": 5}) if q.contains(at)]
            if not polys:
                raise SystemExit(f"size {size}: no band outline around {at}")
            # trace follows the outer edge of the double line; its centre is 1.2 pt inside.
            poly = min(polys, key=lambda q: q.area).buffer(-1.2, join_style=2)
            return Polygon(poly.exterior.coords)
        cands = {}
        for p in self.style_paths(size):
            if is_closed(p["pts"]) and plen(p["pts"]) * self.k > 15:
                poly = Polygon(p["pts"]).buffer(0)
                if poly.geom_type == "Polygon" and poly.contains(at):
                    cands.setdefault(round(poly.area / 50), poly)
        polys = sorted(cands.values(), key=lambda q: q.area)
        rank, n = self.rank_info(size)
        if len(polys) != n:
            raise SystemExit(f"size {size}: expected {n} outlines around {at}, found {len(polys)} "
                             f"(areas cm2 {[round(q.area * self.k ** 2) for q in polys]})")
        return polys[rank]

    def one_size_outline(self, at):
        at = Point(at)
        polys = [Polygon(p["pts"]).buffer(0) for p in self.paths
                 if not p["fill"] and p["width"] == 1.0 and str(p["dashes"]) == "[] 0" and is_closed(p["pts"])]
        polys = [q for q in polys if q.geom_type == "Polygon" and q.contains(at)]
        return min(polys, key=lambda q: q.area)


def chains(segs, tol=8.0):
    """Join open polylines whose endpoints meet (within tol) into longer polylines."""
    segs = [list(s) for s in segs]
    merged = True
    while merged:
        merged = False
        for i in range(len(segs)):
            for j in range(len(segs)):
                if i == j:
                    continue
                a, b = segs[i], segs[j]
                if math.dist(a[-1], b[0]) < tol:
                    segs[i] = a + b[1:]
                elif math.dist(a[-1], b[-1]) < tol:
                    segs[i] = a + b[::-1][1:]
                else:
                    continue
                del segs[j]
                merged = True
                break
            if merged:
                break
    return segs


def extend(pts, d_start, d_end):
    """Extend a polyline along its end tangents."""
    pts = list(pts)

    def ext(p, q, d):  # continue from q away from p
        L = math.dist(p, q)
        return (q[0] + (q[0] - p[0]) / L * d, q[1] + (q[1] - p[1]) / L * d)

    if d_start > 0:
        pts.insert(0, ext(pts[1], pts[0], d_start))
    if d_end > 0:
        pts.append(ext(pts[-2], pts[-1], d_end))
    return pts


def cut_keep(poly, cutter, keep_at, label=""):
    parts = poly.difference(cutter.buffer(0.3))
    geoms = list(parts.geoms) if hasattr(parts, "geoms") else [parts]
    if len(geoms) < 2:
        raise SystemExit(f"{label}: cut line does not split the outline")
    keep = [g for g in geoms if g.contains(Point(keep_at))]
    if not keep:
        raise SystemExit(f"no part contains {keep_at}")
    return Polygon(keep[0].exterior.coords)


# ---------- sleeve ----------

def cut_chain(sh, size, poly, x0, x1):
    """The cut line (polyline, global pt) of `size` lying between x0 and x1."""
    inside = [p for p in sh.style_paths(size)
              if not is_closed(p["pts"]) and all(x0 <= q[0] <= x1 for q in p["pts"])
              and all(130 < q[1] < 1400 for q in p["pts"])]
    cands = chains([p["pts"] for p in inside if plen(p["pts"]) * sh.k > 2])
    cands = [c for c in cands if plen(c) * sh.k > 15]
    # Lines of the other size sharing this style: this size's line lies inside
    # this size's outline and ends closest to it.
    grown = poly.buffer(2)
    boundary = poly.exterior
    cands = [c for c in cands if grown.contains(LineString(c))]
    cands.sort(key=lambda c: boundary.distance(Point(c[0])) + boundary.distance(Point(c[-1])))
    if not cands:
        raise SystemExit(f"cut line {x0}-{x1} for size {size} not found")
    return cands[0]


def band_chain(sh, size, base, x0, x1):
    """Size 40 draws cut lines as filled bands: average the neighbouring sizes' lines
    and check the result runs inside the bands."""
    i = list(sh.cfg["sizes"]).index(size)
    lo, hi = list(sh.cfg["sizes"])[i - 1], list(sh.cfg["sizes"])[i + 1]
    a, b = cut_chain(sh, lo, base[lo], x0, x1), cut_chain(sh, hi, base[hi], x0, x1)
    if math.dist(a[0], b[0]) > math.dist(a[0], b[-1]):
        b = b[::-1]
    la, lb = LineString(a), LineString(b)
    n = 80
    avg = [((pa.x + pb.x) / 2, (pa.y + pb.y) / 2)
           for pa, pb in ((la.interpolate(t / n, normalized=True), lb.interpolate(t / n, normalized=True)) for t in range(n + 1))]
    bands = unary_union([Polygon(p["pts"]).buffer(0) for p in sh.style_paths(size)
                         if all(x0 <= q[0] <= x1 for q in p["pts"]) and plen(p["pts"]) * sh.k > 5
                         and all(130 < q[1] < 1400 for q in p["pts"])])
    off = max(bands.distance(Point(q)) for q in avg)
    if off > 8:
        raise SystemExit(f"size {size}: averaged cut line is {off:.1f} pt off the drawn band")
    # grading is not exactly linear: snap onto the drawn band
    return [nearest_points(bands, Point(q))[0].coords[0] for q in avg]


def sleeve_variants(sh, size, base, spec):
    """Return {"lang": poly, "3/4": poly, "kurz": poly} for one size."""
    poly = base[size]
    out = {"lang": poly}
    boundary = poly.exterior
    for name, (x0, x1) in spec["lines"].items():
        if sh.cfg["sizes"][size].get("fillBand"):
            c = band_chain(sh, size, base, x0, x1)
        else:
            c = cut_chain(sh, size, poly, x0, x1)
        d0, d1 = boundary.distance(Point(c[0])), boundary.distance(Point(c[-1]))
        if max(d0, d1) > 40:
            raise SystemExit(f"sleeve {name} line for size {size} ends {d0:.1f}/{d1:.1f} pt off the outline")
        c = extend(c, d0 + 30, d1 + 30)
        out[name] = cut_keep(poly, LineString(c), spec["cap"], f"sleeve {name} size {size}")
    return out


# ---------- skirt ----------

def length_lines(sh, spec):
    reg = box(*spec["region"])
    lines = [p["pts"] for p in sh.paths
             if not p["fill"] and p["width"] == 2.0 and str(p["dashes"]) == "[ 2 5 2 5 ] 0"
             and not is_closed(p["pts"]) and plen(p["pts"]) * sh.k > 40 and reg.contains(box(*bbox(p["pts"])))]
    wx = spec["waist"][0]
    lines.sort(key=lambda pts: abs(sum(q[0] for q in pts) / len(pts) - wx))
    if len(lines) != 11:
        raise SystemExit(f"expected 11 length lines (45..95 cm), found {len(lines)}")
    return {45 + 5 * i: pts for i, pts in enumerate(lines)}


def skirt_edges(poly, fold_approx):
    """Split the outline ring into (side seam end index, fold end index) at the hem."""
    pts = list(poly.exterior.coords)[:-1]
    n = len(pts)
    fl = LineString(fold_approx)
    edges = [(i, math.dist(pts[i], pts[(i + 1) % n])) for i in range(n)]
    fold_i = [i for i, _ in edges if fl.distance(Point(pts[i])) < 8 and fl.distance(Point(pts[(i + 1) % n])) < 8]
    fold_i = max(fold_i, key=lambda i: math.dist(pts[i], pts[(i + 1) % n]))
    side_i = max((e for e in edges if e[0] != fold_i), key=lambda e: e[1])[0]
    return pts, side_i, fold_i


def skirt_big(poly, fold_approx, waist, far):
    """Outline with the hem pushed 40 cm out along side seam and fold, for clipping."""
    pts, si, fi = skirt_edges(poly, fold_approx)
    n = len(pts)
    w = Point(waist)
    # hem end of each long edge = the endpoint farther from the waist
    s_a, s_b = pts[si], pts[(si + 1) % n]
    f_a, f_b = pts[fi], pts[(fi + 1) % n]
    s_hem_idx = (si + 1) % n if w.distance(Point(s_b)) > w.distance(Point(s_a)) else si
    f_hem_idx = (fi + 1) % n if w.distance(Point(f_b)) > w.distance(Point(f_a)) else fi

    def push(i_hem, i_other, d):
        p, q = pts[i_other], pts[i_hem]
        L = math.dist(p, q)
        return (q[0] + (q[0] - p[0]) / L * d, q[1] + (q[1] - p[1]) / L * d)

    s_other = si if s_hem_idx == (si + 1) % n else (si + 1) % n
    f_other = fi if f_hem_idx == (fi + 1) % n else (fi + 1) % n
    s_far, f_far = push(s_hem_idx, s_other, far), push(f_hem_idx, f_other, far)
    # hem vertices run from s_hem_idx to f_hem_idx, walking away from the side seam
    step = -1 if s_other == (s_hem_idx + 1) % n else 1
    hem_pts, i = [], s_hem_idx
    while True:
        hem_pts.append(pts[i])
        if i == f_hem_idx:
            break
        i = (i + step) % n
    # new ring: f_hem -> fold -> waist -> side seam -> s_hem -> s_far -> f_far
    ring, i = [], f_hem_idx
    while True:
        ring.append(pts[i])
        if i == s_hem_idx:
            break
        i = (i + step) % n
    ring += [s_far, f_far]
    big = Polygon(ring).buffer(0)
    if not big.contains(poly.buffer(-1)):
        raise SystemExit("extended skirt does not contain original outline")
    return big, hem_pts


def offset_away(pts, d, waist):
    ls = LineString(pts)
    a, b = ls.offset_curve(d), ls.offset_curve(-d)
    w = Point(waist)
    return max((a, b), key=lambda g: g.centroid.distance(w))


def skirt_variants(sh, poly, pc, variants, hem_add_cm):
    spec = pc["lengths"]
    lines = length_lines(sh, spec)
    big, hem_pts = skirt_big(poly, pc["fold"], spec["waist"], 40 / sh.k)
    d = hem_add_cm / sh.k
    out = {}
    for L, label in variants:
        base = lines[L] if L in lines else hem_pts
        if L not in lines and L != 100:
            raise SystemExit(f"no length line for {L} cm")
        off = offset_away(base, d, spec["waist"])
        cutter = LineString(extend(list(off.coords), 10 / sh.k, 10 / sh.k))
        out[(L, label)] = cut_keep(big, cutter, spec["waist"], f"{pc['id']} {L} cm")
    return out


# ---------- output ----------

def normalize(poly, fold, rot, origin, k):
    rp = affinity.scale(affinity.rotate(poly, rot, origin=origin), k, k, origin=(0, 0))
    minx, miny = rp.bounds[0], rp.bounds[1]
    rp = affinity.translate(rp, -minx, -miny)
    rp = Polygon(rp.exterior.coords).simplify(0.01)
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
    return item


def main():
    cfg_path, out, lib_dir = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    cfg = json.loads(cfg_path.read_text())
    sh = Sheet(cfg, json.loads((out / "sheet.json").read_text()))
    sizes = list(cfg["sizes"])
    tol = cfg.get("foldTolMm", 2.5) / 10 / sh.k
    pieces = []

    def emit(pc, per_size, suffix=None, variant=None, name=None):
        rot = 90 - grain_angle(pc["grain"])
        origin = per_size[sizes[len(sizes) // 2]].centroid
        entry = {"id": pc["id"] + (f"-{suffix}" if suffix else ""), "name": name or pc["name"]}
        for key in ("cut", "optional", "note"):
            if key in pc:
                entry[key] = pc[key]
        if variant:
            entry["variant"] = variant
            entry["variantGroup"] = pc.get("variantGroup", pc["id"])
        entry["sizes"] = {}
        for size, poly in per_size.items():
            fold = snap_fold(poly, pc["fold"], tol) if pc.get("fold") else None
            entry["sizes"][size] = normalize(poly, fold, rot, origin, sh.k)
        pieces.append(entry)

    for pc in cfg["pieces"]:
        if pc.get("oneSize"):
            poly = sh.one_size_outline(pc["at"])
            emit(pc, {s: poly for s in sizes})
            continue
        base = {s: sh.outline(s, pc["at"]) for s in sizes}
        if "variants" in pc:
            per = {s: sleeve_variants(sh, s, base, pc["variants"]) for s in sizes}
            labels = {"lang": ("lang", "dlouhý"), "3/4": ("34", "3/4"), "kurz": ("kurz", "krátký")}
            for v, (suffix, cz) in labels.items():
                emit(pc, {s: per[s][v] for s in sizes}, suffix, f"{cz} rukáv",
                     f"Ärmel {'lang' if v == 'lang' else ('3/4' if v == '3/4' else 'kurz')} (rukáv {cz})")
        elif "lengths" in pc:
            per = {s: skirt_variants(sh, base[s], pc, cfg["skirtVariants"], cfg["hemAddCm"]) for s in sizes}
            de, cz = pc["name"].split(" (")
            for L, label in cfg["skirtVariants"]:
                emit(pc, {s: per[s][(L, label)] for s in sizes}, str(L), f"délka {L} cm ({label})",
                     f"{de} {L} cm ({cz[:-1]}, {label})")
        else:
            emit(pc, base)

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
    lib_dir.mkdir(parents=True, exist_ok=True)
    (lib_dir / f"{cfg['id']}.json").write_text(json.dumps(lib, ensure_ascii=False, indent=1))
    write_preview(lib, out / "preview.svg")
    for p in pieces:
        bb = {s: v["bbox"] for s, v in p["sizes"].items()}
        print(p["id"], "34:", bb["34"], "42:", bb["42"], "50:", bb["50"], "fold" if "fold" in p["sizes"]["42"] else "")


if __name__ == "__main__":
    main()
