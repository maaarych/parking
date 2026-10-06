"""Helpers for hand-annotating spots.

  python analyzer/preview.py grid 7-1 8-1     # 1024px-wide frame with a pixel grid (read coordinates off it)
  python analyzer/preview.py spots 7-1 8-1    # overlay spots (+ detections/occupancy if data/analysis.json exists)
  python analyzer/preview.py add spots_px.json  # merge polygons given in 1024px-wide image coordinates into data/spots.json
        spots_px.json: {"<camera>": [[[x,y],[x,y],[x,y],[x,y]], ...]}  (replaces that camera's spots)
Output images: analyzer/preview/<mode>-<camera>.jpg
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "analyzer" / "preview"
OUT.mkdir(exist_ok=True)
VIEW_W = 1024


def load(cam: str) -> Image.Image:
    im = Image.open(ROOT / "public" / "frames" / f"{cam}.jpg").convert("RGB")
    return im.resize((VIEW_W, round(VIEW_W * im.height / im.width)))


def grid(cam: str) -> None:
    im = load(cam)
    w, h = im.size
    font = ImageFont.load_default(size=13)
    d = ImageDraw.Draw(im, "RGBA")
    for x in range(0, w, 50):
        major = x % 100 == 0
        d.line([(x, 0), (x, h)], fill=(255, 255, 0, 120 if major else 45), width=1)
        if major:
            d.text((x + 2, h - 16), str(x), fill=(255, 255, 0, 255), font=font)
            d.text((x + 2, 2), str(x), fill=(255, 255, 0, 255), font=font)
    for y in range(0, h, 50):
        major = y % 100 == 0
        d.line([(0, y), (w, y)], fill=(255, 255, 0, 120 if major else 45), width=1)
        if major:
            d.text((2, y + 1), str(y), fill=(255, 255, 0, 255), font=font)
            d.text((w - 30, y + 1), str(y), fill=(255, 255, 0, 255), font=font)
    im.save(OUT / f"grid-{cam}.jpg", quality=90)


def spots(cam: str) -> None:
    im = load(cam)
    w, h = im.size
    d = ImageDraw.Draw(im, "RGBA")
    items = []
    analysis = ROOT / "data" / "analysis.json"
    if analysis.exists():
        for c in json.loads(analysis.read_text())["cameras"]:
            if c["cameraId"] == cam:
                for v in c["vehicles"]:
                    x1, y1, x2, y2 = v["box"]
                    d.rectangle([x1 * w, y1 * h, x2 * w, y2 * h], outline=(56, 189, 248, 255), width=2)
                items = [(s["polygon"], s["occupied"]) for s in c["spots"]]
    if not items:
        sp = json.loads((ROOT / "data" / "spots.json").read_text()).get(cam, {}).get("spots", [])
        items = [(s["polygon"], None) for s in sp]
    for poly, occ in items:
        pts = [(x * w, y * h) for x, y in poly]
        col = (120, 120, 255) if occ is None else ((239, 68, 68) if occ else (34, 197, 94))
        d.polygon(pts, fill=col + (90,), outline=col + (255,))
    im.save(OUT / f"spots-{cam}.jpg", quality=90)


def add(path: str) -> None:
    given = json.loads(Path(path).read_text())
    target = ROOT / "data" / "spots.json"
    data = json.loads(target.read_text()) if target.exists() else {}
    for cam, polys in given.items():
        w, h = load(cam).size
        data[cam] = {
            "spots": [
                {
                    "id": f"{cam}-{i}",
                    "polygon": [[round(min(max(x, 0), w) / w, 4), round(min(max(y, 0), h) / h, 4)] for x, y in poly],
                }
                for i, poly in enumerate(polys, 1)
            ]
        }
        print(f"{cam}: {len(polys)} spots")
    target.write_text(json.dumps(data, indent=2))


if __name__ == "__main__":
    mode, args = sys.argv[1], sys.argv[2:]
    if mode == "add":
        add(args[0])
    else:
        for c in args:
            (grid if mode == "grid" else spots)(c)
