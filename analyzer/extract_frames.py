"""Extract camera frames and satellite maps from ПАРКОВКИ_1.pdf.

Output (relative to the repo root):
  public/frames/<location>-<n>.jpg   camera frames (MVP stand-in for live cameras)
  public/maps/<location>.jpg         satellite map with camera position / view cone

Usage: python analyzer/extract_frames.py
"""
import io
from pathlib import Path

import fitz  # PyMuPDF
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "ПАРКОВКИ_1.pdf"

# PDF page -> location id (a location can span several pages).
PAGE_TO_LOCATION = {p: p for p in range(1, 15)}
PAGE_TO_LOCATION.update({15: 14, 16: 14, 17: 15, 18: 16, 19: 16})
PAGE_TO_LOCATION.update({p: p - 3 for p in range(20, 34)})


def is_camera(w: int, h: int) -> bool:
    return w >= 1200 and abs(w / h - 16 / 9) < 0.05


def overlaps(a, b) -> bool:
    return not (a.x1 <= b.x0 or b.x1 <= a.x0 or a.y1 <= b.y0 or b.y1 <= a.y0)


def main() -> None:
    frames_dir = ROOT / "public" / "frames"
    maps_dir = ROOT / "public" / "maps"
    frames_dir.mkdir(parents=True, exist_ok=True)
    maps_dir.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(PDF)
    cam_count: dict[int, int] = {}
    seen_xrefs: set[int] = set()
    saved_map: set[int] = set()

    for page_no, page in enumerate(doc, 1):
        loc = PAGE_TO_LOCATION[page_no]
        imgs = []
        for info in page.get_images(full=True):
            xref, w, h = info[0], info[2], info[3]
            rects = page.get_image_rects(xref)
            if rects:
                imgs.append((xref, w, h, rects[0]))

        cams = [i for i in imgs if is_camera(i[1], i[2])]
        cam_rects = [c[3] for c in cams]
        # drop drop-shadow images that sit underneath a camera frame
        others = [
            i for i in imgs
            if not is_camera(i[1], i[2]) and not any(overlaps(i[3], r) for r in cam_rects)
        ]

        for xref, w, h, _ in cams:
            n = cam_count.get(loc, 0) + 1
            cam_count[loc] = n
            save(doc, xref, frames_dir / f"{loc}-{n}.jpg")
            print(f"page {page_no:2d} loc {loc:2d}: frame {loc}-{n} ({w}x{h})")

        for xref, w, h, _ in others:
            if loc in saved_map or xref in seen_xrefs and loc in saved_map:
                continue
            seen_xrefs.add(xref)
            saved_map.add(loc)
            save(doc, xref, maps_dir / f"{loc}.jpg")
            print(f"page {page_no:2d} loc {loc:2d}: map ({w}x{h})")

    print("locations with camera frames:", sorted(cam_count))
    print("locations without:", sorted(set(range(1, 31)) - set(cam_count)))


def save(doc: fitz.Document, xref: int, path: Path) -> None:
    data = doc.extract_image(xref)["image"]
    Image.open(io.BytesIO(data)).convert("RGB").save(path, quality=92)


if __name__ == "__main__":
    main()
