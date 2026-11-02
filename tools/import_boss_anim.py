"""
Nhập bộ chuyển động (sprite sheet + atlas.json kiểu TexturePacker/Aseprite) của 1 boss vào game.

  .venv/bin/python tools/import_boss_anim.py <thư-mục-bộ-chuyển-động> <boss-id> [--body-sat 0.35]
  vd: tools/import_boss_anim.py ~/Downloads/01-ufo-xam-luoc ufo

Đầu vào: thư mục có atlas.json (frames + animations) và spritesheet.png.
Đầu ra:  src/assets/bosses/<id>-anim.webp  (lưới ô vuông CELL px, mỗi khung đã căn tâm)
         src/assets/bosses/<id>-anim.json  (kích thước ô, số cột, tâm neo, bề rộng thân, danh sách chuyển động)
         art-source/<id>-anim/              (bản gốc để đối chiếu)

Xử lý từng khung:
  1) Căn tâm: tìm "thân" (pixel đặc, ít bão hoà — bỏ phản lực, laser, khói, lửa) rồi dịch khung để tâm thân
     về đúng giữa ô → đổi chuyển động không bị nhảy, idle không rung ngang.
  2) Nới ô (thêm lề) để hiệu ứng tràn ra (tia laser, khói) không bị cắt khi dịch.
  3) Xoá mảnh rời chạm mép ô (mảnh của khung bên cạnh lọt sang), giữ khói/lửa rời nằm trong ô.
  4) Làm mờ dần ở chỗ hình chạm mép ô gốc (hiệu ứng bị cắt) → không còn vết cắt thẳng.
"""
import json
import os
import shutil
import sys

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "assets", "bosses")
FEATHER = 36  # px làm mờ ở mép bị cắt


def body_center(a: np.ndarray, sat_max: float):
    rgb = a[..., :3].astype(np.float32)
    al = a[..., 3]
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1)
    m = (al > 200) & (sat < sat_max)
    ys, xs = np.nonzero(m)
    if len(xs) < 50:  # khung toàn hiệu ứng → dùng tâm alpha
        ys, xs = np.nonzero(al > 128)
    return float(xs.mean()), float(ys.mean()), int(xs.max() - xs.min()), int(np.percentile(ys, 97))


def drop_strays(a: np.ndarray) -> np.ndarray:
    """mảnh rời (không nối với thân) mà chạm mép ô → là phần của khung bên cạnh → xoá"""
    h, w = a.shape[:2]
    m = (a[..., 3] > 20).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(cv2.dilate(m, np.ones((5, 5), np.uint8)), connectivity=8)
    if n <= 2:
        return a
    main = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    out = a.copy()
    for i in range(1, n):
        if i == main:
            continue
        x, y, bw, bh, _ = stats[i]
        if x <= 2 or y <= 2 or x + bw >= w - 2 or y + bh >= h - 2:
            out[..., 3][lab == i] = 0
    return out


def feather_edges(a: np.ndarray) -> np.ndarray:
    a = drop_strays(a)
    h, w = a.shape[:2]
    al = a[..., 3].astype(np.float32)
    ramp = np.clip(np.arange(max(h, w)) / FEATHER, 0, 1)
    k = np.ones((h, w), np.float32)
    if (al[:3] > 20).any():
        k *= ramp[:h][:, None]
    if (al[-3:] > 20).any():
        k *= ramp[:h][::-1][:, None]
    if (al[:, :3] > 20).any():
        k *= ramp[:w][None, :]
    if (al[:, -3:] > 20).any():
        k *= ramp[:w][::-1][None, :]
    out = a.copy()
    out[..., 3] = (al * k).astype(np.uint8)
    return out


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    src, bid = sys.argv[1], sys.argv[2]
    sat_max = float(sys.argv[sys.argv.index("--body-sat") + 1]) if "--body-sat" in sys.argv else 0.35
    atlas = json.load(open(os.path.join(src, "atlas.json"), encoding="utf-8"))
    sheet = Image.open(os.path.join(src, atlas["meta"].get("image", "spritesheet.png"))).convert("RGBA")
    frames = atlas["frames"]
    anims = atlas.get("animations") or {
        t["name"]: {"frames": list(frames)[t["from"] : t["to"] + 1], "fps": 1000 / frames[list(frames)[t["from"]]]["duration"], "loop": t.get("repeat", 0) == 0}
        for t in atlas["meta"]["frameTags"]
    }
    order = [f for a in anims.values() for f in a["frames"]]
    order = list(dict.fromkeys(order))
    fw = max(frames[n]["sourceSize"]["w"] for n in order)
    fh = max(frames[n]["sourceSize"]["h"] for n in order)
    cell = int(round(max(fw, fh) * 1.2 / 8) * 8)
    cols = int(np.ceil(np.sqrt(len(order))))
    rows = int(np.ceil(len(order) / cols))
    out = Image.new("RGBA", (cols * cell, rows * cell))
    widths, bellies, report = [], [], []
    for i, n in enumerate(order):
        f = frames[n]
        r = f["frame"]
        im = sheet.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]))
        a = feather_edges(np.array(im))
        cx, cy, bw, bottom = body_center(a, sat_max)
        sx = f.get("spriteSourceSize", {"x": 0, "y": 0})
        cx += sx["x"]
        cy += sx["y"]
        widths.append(bw)
        bellies.append(bottom + sx["y"] - cy)
        ox = int(round(cell / 2 - cx)) + sx["x"]
        oy = int(round(cell / 2 - cy)) + sx["y"]
        tile = Image.new("RGBA", (cell, cell))
        tile.paste(Image.fromarray(a, "RGBA"), (ox, oy))
        out.paste(tile, ((i % cols) * cell, (i // cols) * cell))
        report.append(f"  {n}: tâm thân ({cx:.0f},{cy:.0f}) → dịch ({ox - sx['x']:+d},{oy - sx['y']:+d})")
    os.makedirs(OUT, exist_ok=True)
    out.save(os.path.join(OUT, f"{bid}-anim.webp"), "WEBP", quality=88, method=6)
    meta = {
        "cell": cell,
        "cols": cols,
        "bodyW": int(np.median(widths)),
        "belly": int(np.median(bellies)),
        "anims": {k: {"frames": [order.index(f) for f in v["frames"]], "fps": round(float(v.get("fps", 6.25)), 3), "loop": bool(v.get("loop", True))} for k, v in anims.items()},
    }
    json.dump(meta, open(os.path.join(OUT, f"{bid}-anim.json"), "w"), ensure_ascii=False, indent=1)
    keep = os.path.join(ROOT, "art-source", f"{bid}-anim")
    os.makedirs(keep, exist_ok=True)
    for fn in ("atlas.json", atlas["meta"].get("image", "spritesheet.png")):
        shutil.copy(os.path.join(src, fn), keep)
    print(f"{bid}: {len(order)} khung, ô {cell}px, lưới {cols}×{rows}, thân rộng ~{meta['bodyW']}px, chuyển động {list(meta['anims'])}")
    print("\n".join(report))
    print(f"→ {os.path.join(OUT, bid + '-anim.webp')} ({os.path.getsize(os.path.join(OUT, bid + '-anim.webp')) // 1024} KB)")


if __name__ == "__main__":
    main()
