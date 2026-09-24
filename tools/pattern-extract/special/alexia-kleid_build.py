"""Special builder for MY IMAGE S1047 "Alexia" (košilové šaty makerist.pdf).

All 10 sizes are drawn with the same black 1 pt line, so extract.py's
style-based tracing cannot separate them. Instead this script:
  1. de-duplicates the vector paths (every tile repeats the full paths),
  2. chains paths whose end points meet pairwise into "strands",
  3. builds each size outline from strands (closed strands directly, open
     strands closed with the shared fold / hem line),
  4. ranks the 10 outlines of each piece by area (smallest = 34).

Usage: python special/alexia-kleid_build.py <config.json> <out_dir> <library_dir>
(run assemble.py first so <out_dir>/sheet.json exists)
"""
import collections
import json
import math
import sys
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree
from shapely import affinity, make_valid
from shapely.geometry import LineString, Point, Polygon

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from extract import PT_CM, grain_angle, snap_fold, write_preview  # noqa: E402

EPS = 1.0
SIZES = ["34", "36", "38", "40", "42", "44", "46", "48", "50", "52"]


def unique_paths(sheet):
    blk = [p for p in sheet["paths"] if p["width"] == 1.0 and p["color"] == [0, 0, 0] and not p["fill"]]
    out = []
    for p in blk:
        a, b = p["pts"][0], p["pts"][-1]
        L = sum(math.dist(u, v) for u, v in zip(p["pts"], p["pts"][1:]))
        dup = any(abs(q["_l"] - L) < 0.6 and (
            (math.dist(a, q["pts"][0]) < 0.6 and math.dist(b, q["pts"][-1]) < 0.6) or
            (math.dist(a, q["pts"][-1]) < 0.6 and math.dist(b, q["pts"][0]) < 0.6)) for q in out)
        if not dup:
            p["_l"] = L
            out.append(p)
    return out


def strands(U):
    n = len(U)
    ends = np.array([p["pts"][0] for p in U] + [p["pts"][-1] for p in U])
    parent = list(range(2 * n))

    def f(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for a, b in cKDTree(ends).query_pairs(EPS):
        parent[f(a)] = f(b)
    cl = collections.defaultdict(list)
    for k in range(2 * n):
        cl[f(k)].append(k)
    link = {}
    for mem in cl.values():
        if len(mem) == 2:
            link[mem[0]], link[mem[1]] = mem[1], mem[0]

    def other(k):
        return k + n if k < n else k - n

    used, res = set(), []
    for i in range(n):
        if i in used:
            continue
        used.add(i)
        chain = [(i, False)]
        for direction in (0, 1):
            endk = i + n if direction == 0 else i
            while endk in link:
                nk = link[endk]
                j = nk if nk < n else nk - n
                if j in used:
                    break
                used.add(j)
                rev = nk >= n
                if direction == 0:
                    chain.append((j, rev))
                else:
                    chain.insert(0, (j, not rev))
                endk = other(nk)
        pts = []
        for j, rev in chain:
            q = U[j]["pts"][::-1] if rev else U[j]["pts"]
            pts.extend(q if not pts else q[1:])
        L = sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))
        res.append({"pts": pts, "len": L, "closed": math.dist(pts[0], pts[-1]) < EPS})
    return res


def valid_poly(pts):
    P = Polygon(pts)
    if not P.is_valid:
        g = make_valid(P)
        polys = [x for x in getattr(g, "geoms", [g]) if x.geom_type == "Polygon"]
        P = max(polys, key=lambda x: x.area)
    return Polygon(P.exterior.coords)


def near(p, q, tol=3.0):
    return math.dist(p, q) <= tol


def open_between(S, a, b, min_len, max_len):
    """Open strands running from a to b (either direction), oriented a -> b."""
    out = []
    for s in S:
        if s["closed"] or not (min_len <= s["len"] <= max_len):
            continue
        p, q = s["pts"][0], s["pts"][-1]
        if near(p, a) and near(q, b):
            out.append(s["pts"])
        elif near(p, b) and near(q, a):
            out.append(s["pts"][::-1])
    return out


def in_box(poly, box):
    x0, y0, x1, y1 = poly.bounds
    return x0 >= box[0] and y0 >= box[1] and x1 <= box[2] and y1 <= box[3]


def build_outlines(S):
    cm = 1 / PT_CM
    closed = [valid_poly(s["pts"]) for s in S if s["closed"] and s["len"] > 100 * cm]
    pieces = {}
    pieces["1"] = [p for p in closed if in_box(p, (1690, 80, 2280, 3040))]
    pieces["2"] = [p for p in closed if in_box(p, (170, 160, 1050, 2960))]
    pieces["4"] = [p for p in closed if in_box(p, (730, 15, 1490, 2790))]

    # 5 sleeve: 5 closed outlines + 5 open ones sharing two straight hem lines.
    sleeve = [p for p in closed if in_box(p, (870, 395, 2270, 2220))]
    A, B = (2251, 2034), (1492, 2211)
    A2, B2 = (2233, 2039), (1543, 2199)
    for a, b in ((A, B), (A2, B2)):
        for pts in open_between(S, a, b, 100 * cm, 200 * cm):
            sleeve.append(valid_poly(pts + [b, a]))
    pieces["5"] = sleeve

    # 3 back and 3a back facing: open strands meeting at the CB neck point.
    cbn, cbf = (567, 140), (567, 282)
    bodies = []
    for s in S:
        if not s["closed"] and s["len"] > 150 * cm:
            if near(s["pts"][0], cbn):
                bodies.append(s)
            elif near(s["pts"][-1], cbn):
                bodies.append({**s, "pts": s["pts"][::-1]})
    necks = [s for s in S if not s["closed"] and 10 * cm < s["len"] < 25 * cm and (near(s["pts"][0], cbn) or near(s["pts"][-1], cbn))]
    facings = [s for s in S if not s["closed"] and 10 * cm < s["len"] < 25 * cm and (near(s["pts"][0], cbf) or near(s["pts"][-1], cbf))]
    back, facing = [], []
    for b in bodies:
        sh = b["pts"][-1]  # shoulder / armhole point of this size
        neck = [n for n in necks if near(n["pts"][-1], sh) or near(n["pts"][0], sh)]
        fac = [x for x in facings if near(x["pts"][0], sh) or near(x["pts"][-1], sh)]
        if len(neck) != 1 or len(fac) != 1:
            raise SystemExit(f"back: shoulder {sh} matched neck={len(neck)} facing={len(fac)}")
        npts = neck[0]["pts"] if near(neck[0]["pts"][0], cbn) else neck[0]["pts"][::-1]  # cbn -> sh
        fpts = fac[0]["pts"] if near(fac[0]["pts"][0], sh) else fac[0]["pts"][::-1]  # sh -> cbf
        back.append(valid_poly(b["pts"] + npts[::-1][1:]))
        facing.append(valid_poly(npts + fpts[1:] + [cbn]))
    pieces["3"], pieces["3a"] = back, facing

    # 6 collar and 7 collar stand: per-size open strands + one shared fold end.
    for pid, a, b in (("6", (1640, 798), (1543, 781)), ("7", (1593, 2320), (1651, 2361))):
        pieces[pid] = [valid_poly(pts + [a]) for pts in open_between(S, a, b, 30 * cm, 80 * cm)]

    for pid, polys in pieces.items():
        if len(polys) != 10:
            raise SystemExit(f"piece {pid}: expected 10 outlines, got {len(polys)}")
        polys.sort(key=lambda p: p.area)
    return pieces


def check_labels(sheet, pieces):
    """Printed size numbers sit just inside their own line, so the labelled
    size should be one of the two outlines nearest to the label."""
    ok = bad = 0
    seen = set()
    for t in sheet["texts"]:
        tx = t["text"].strip()
        key = (tx, round(t["bbox"][0]), round(t["bbox"][1]))
        if tx not in SIZES or t["size"] > 12 or key in seen:
            continue
        seen.add(key)
        c = Point((t["bbox"][0] + t["bbox"][2]) / 2, (t["bbox"][1] + t["bbox"][3]) / 2)
        d, pid = min((min(p.exterior.distance(c) for p in ps), pid) for pid, ps in pieces.items())
        if d > 20:
            continue
        nearest = sorted((p.exterior.distance(c), SIZES[i]) for i, p in enumerate(pieces[pid]))
        if tx in [s for _, s in nearest[:2]]:
            ok += 1
        else:
            bad += 1
    return ok, bad


def main():
    cfg_path, out, lib_dir = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    cfg = json.loads(cfg_path.read_text())
    sheet = json.loads((out / "sheet.json").read_text())
    S = strands(unique_paths(sheet))
    outlines = build_outlines(S)
    ok, bad = check_labels(sheet, outlines)
    print(f"size labels matching one of the 2 nearest outlines: {ok}, not matching: {bad}")

    sc = cfg["scale"]
    k = sc["squareCm"] / sc["squarePt"]
    pieces = []
    for pc in cfg["pieces"]:
        if "rect" in pc:
            w = pc["rect"]["w"]
            h = pc["rect"]["h"]
            entry = {x: pc[x] for x in ("id", "name", "cut", "optional", "variant", "note") if x in pc}
            entry["sizes"] = {}
            for i, size in enumerate(SIZES):
                ww = w[i] if isinstance(w, list) else w
                entry["sizes"][size] = {"outline": [[0, 0], [ww, 0], [ww, h], [0, h]], "bbox": [ww, h], "area": round(ww * h, 1)}
            pieces.append(entry)
            continue
        polys = outlines[pc["ref"]]
        rot = 90 - grain_angle(pc["grain"])
        origin = polys[-1].centroid
        entry = {x: pc[x] for x in ("id", "name", "cut", "optional", "variant", "note") if x in pc}
        entry["sizes"] = {}
        for size, poly in zip(SIZES, polys):
            poly = poly.simplify(0.3 / 10 / PT_CM)
            fold = snap_fold(poly, pc["fold"], cfg.get("foldTolMm", 2.5) / 10 / PT_CM) if pc.get("fold") else None
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

    # Sanity: bbox and area should not shrink with growing size.
    for p in pieces:
        v = [p["sizes"][s] for s in SIZES]
        for a, b in zip(v, v[1:]):
            if b["area"] < a["area"] or b["bbox"][0] < a["bbox"][0] - 0.3 or b["bbox"][1] < a["bbox"][1] - 0.3:
                print(f"WARNING {p['id']}: non-monotonic growth {a['bbox']} -> {b['bbox']}")

    lib = {
        "format": "fitter-pattern@1",
        "id": cfg["id"],
        "name": cfg["name"],
        "author": cfg.get("author"),
        "source": Path(cfg["pdf"]).name,
        "seamAllowance": cfg.get("seamAllowance"),
        "notes": cfg.get("notes"),
        "sizes": SIZES,
        "pieces": pieces,
    }
    lib_dir.mkdir(parents=True, exist_ok=True)
    (lib_dir / f"{cfg['id']}.json").write_text(json.dumps(lib, ensure_ascii=False, indent=1))
    write_preview(lib, out / "preview.svg")
    for p in pieces:
        s40 = p["sizes"]["40"]
        print(p["id"], "40:", s40["bbox"], "34:", p["sizes"]["34"]["bbox"], "52:", p["sizes"]["52"]["bbox"], "fold" if "fold" in s40 else "")


if __name__ == "__main__":
    main()
