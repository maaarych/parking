"""Detect vehicles on camera frames and decide which parking spots are occupied.

Reads  : public/frames/<camera>.jpg   (camera frames; swap for live snapshots later)
         data/spots.json              (hand-drawn spot polygons, normalized 0..1)
Writes : data/analysis.json

Usage:
    analyzer/.venv/bin/python analyzer/analyze.py [--model PATH] [--imgsz 1920] [--conf 0.2] [--redetect]
"""
import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image
from shapely.geometry import Polygon, box as shapely_box

ROOT = Path(__file__).resolve().parent.parent
FRAMES = ROOT / "public" / "frames"
SPOTS = ROOT / "data" / "spots.json"
OUT = ROOT / "data" / "analysis.json"
CAMERAS = ROOT / "data" / "cameras.json"  # list of enabled camera ids (shared with the web app)

# COCO class ids we treat as "a vehicle that can occupy a spot".
VEHICLE_CLASSES = {2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}

# A spot counts as occupied when this share of its area is covered by a vehicle's footprint.
OCCUPIED_COVERAGE = 0.30
# Footprint = lower part of the detection box (where the car touches the ground).
FOOTPRINT_SHARE = 0.55


def camera_sort_key(path: Path):
    loc, n = path.stem.split("-")
    return int(loc), int(n)


def detect(model, image_path: Path, imgsz: int, conf: float):
    result = model.predict(str(image_path), imgsz=imgsz, conf=conf, classes=list(VEHICLE_CLASSES), verbose=False)[0]
    h, w = result.orig_shape
    vehicles = []
    for xyxy, c, k in zip(result.boxes.xyxy.tolist(), result.boxes.conf.tolist(), result.boxes.cls.tolist()):
        x1, y1, x2, y2 = xyxy
        vehicles.append(
            {
                "box": [round(x1 / w, 4), round(y1 / h, 4), round(x2 / w, 4), round(y2 / h, 4)],
                "cls": VEHICLE_CLASSES[int(k)],
                "conf": round(c, 3),
            }
        )
    return vehicles


def spot_coverage(polygon_norm, vehicles, w: int, h: int) -> float:
    """Best share of the spot polygon covered by any vehicle footprint."""
    poly = Polygon([(x * w, y * h) for x, y in polygon_norm])
    if not poly.is_valid or poly.area <= 0:
        return 0.0
    best = 0.0
    for v in vehicles:
        x1, y1, x2, y2 = v["box"]
        x1, x2 = x1 * w, x2 * w
        y1, y2 = y1 * h, y2 * h
        foot = shapely_box(x1, y2 - (y2 - y1) * FOOTPRINT_SHARE, x2, y2)
        best = max(best, poly.intersection(foot).area / poly.area)
    return best


def load_previous() -> dict:
    if not OUT.exists():
        return {}
    try:
        return {c["cameraId"]: c for c in json.loads(OUT.read_text())["cameras"]}
    except (ValueError, KeyError):
        return {}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=str(ROOT / "analyzer" / "models" / "yolov8x.pt"))
    ap.add_argument("--imgsz", type=int, default=1920)
    ap.add_argument("--conf", type=float, default=0.2)
    ap.add_argument("--redetect", action="store_true", help="ignore cached detections and re-run the model on every frame")
    ap.add_argument("--only", help="comma-separated camera ids to process (others are kept as they are in analysis.json)")
    ap.add_argument("--no-write", action="store_true", help="do not touch data/analysis.json")
    ap.add_argument("--json", action="store_true", help="print the processed cameras as one 'RESULT_JSON {...}' line")
    args = ap.parse_args()
    only = set(args.only.split(",")) if args.only else None

    model_name = Path(args.model).name
    params = f"{model_name}|{args.imgsz}|{args.conf}"
    all_previous = load_previous()
    previous = {} if args.redetect else all_previous
    spots_file = json.loads(SPOTS.read_text()) if SPOTS.exists() else {}
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    model = None

    enabled = json.loads(CAMERAS.read_text()) if CAMERAS.exists() else None  # None = all frames

    cameras = []
    for path in sorted(FRAMES.glob("*.jpg"), key=camera_sort_key):
        if not re.fullmatch(r"\d+-\d+", path.stem):
            continue
        if enabled is not None and path.stem not in enabled:
            continue
        if only is not None and path.stem not in only:
            continue
        camera_id = path.stem
        with Image.open(path) as im:
            w, h = im.size

        # Reuse stored detections while the frame is unchanged: editing spots then re-evaluates instantly.
        prev = previous.get(camera_id)
        frame_time = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
        reuse = (
            prev is not None
            and prev.get("detectParams", params) == params
            and datetime.fromisoformat(prev.get("detectedAt", prev["analyzedAt"])) >= frame_time
        )
        if reuse:
            vehicles, detected_at, note = prev["vehicles"], prev.get("detectedAt", prev["analyzedAt"]), "cached"
        else:
            if model is None:
                from ultralytics import YOLO  # imported late: cached runs don't need torch

                Path(args.model).parent.mkdir(parents=True, exist_ok=True)
                model = YOLO(args.model)
            vehicles, detected_at, note = detect(model, path, args.imgsz, args.conf), now, "detected"

        spots = []
        for s in spots_file.get(camera_id, {}).get("spots", []):
            cov = spot_coverage(s["polygon"], vehicles, w, h)
            spots.append({**s, "occupied": cov >= OCCUPIED_COVERAGE, "coverage": round(cov, 3)})
        cameras.append(
            {
                "cameraId": camera_id,
                "locationId": int(camera_id.split("-")[0]),
                "frame": f"/frames/{path.name}",
                "width": w,
                "height": h,
                "analyzedAt": now,
                "detectedAt": detected_at,
                "detectParams": params,
                "vehicles": vehicles,
                "spots": spots,
            }
        )
        free = sum(1 for s in spots if not s["occupied"])
        print(f"{camera_id:>5}: {len(vehicles):2d} vehicles ({note}), spots free {free}/{len(spots)}")

    if args.json:
        print("RESULT_JSON " + json.dumps(cameras, ensure_ascii=False))
    if args.no_write:
        return

    if only is not None:  # partial run: keep the other cameras' stored results
        by_id = {**all_previous, **{c["cameraId"]: c for c in cameras}}
        cameras = sorted(by_id.values(), key=lambda c: tuple(map(int, c["cameraId"].split("-"))))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"generatedAt": now, "model": model_name, "cameras": cameras}, ensure_ascii=False))
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
