"""
Tách 8 trùm từ ảnh tổng hợp art-source/bosses-sheet.webp (lưới 4×2, mỗi ô 500 px) thành
src/assets/bosses/<id>.webp có nền trong suốt.

  python -m venv .venv && .venv/bin/pip install "rembg[cpu]" opencv-python-headless pillow
  .venv/bin/python tools/cut_bosses.py

- 6 trùm thân đặc dùng rembg (model isnet-general-use).
- Pháo Đài Tinh Thể (trong suốt, phát sáng) tách theo độ lệch màu so với nền trời.
- Hành Tinh Hủy Diệt dùng mặt nạ hình tròn (tâm/bán kính đo tay) + giữ quầng lửa cam, bỏ logo watermark góc.
Thay art: giữ đúng bố cục lưới, chạy lại script, rồi chỉnh BOSS_ART trong src/game/bosses.ts nếu tỉ lệ khác.
"""
import numpy as np
import cv2
from PIL import Image
from rembg import new_session, remove

SHEET = "art-source/bosses-sheet.webp"
OUT = "src/assets/bosses"
IDS = ["ufo", "gold", "octopus", "stealth", "cruiser", "crystal", "mother", "planet"]


def cell(i):
    col, row = i % 4, i // 4
    return (col * 500, 0 if row == 0 else 560, (col + 1) * 500, 490 if row == 0 else 1045)


def trim_save(im, name):
    bb = im.getchannel("A").point(lambda a: 255 if a > 10 else 0).getbbox()
    im.crop(bb).save(f"{OUT}/{name}.webp", "WEBP", quality=90, method=6)
    print(name, im.crop(bb).size)


def key_by_color(crop, lo, hi):
    border = np.concatenate([crop[:12].reshape(-1, 3), crop[-12:].reshape(-1, 3), crop[:, :12].reshape(-1, 3), crop[:, -12:].reshape(-1, 3)])
    d = np.sqrt(((crop - np.median(border, axis=0)) ** 2).sum(-1))
    return np.clip((d - lo) / (hi - lo), 0, 1)


def main():
    sheet = Image.open(SHEET).convert("RGB")
    arr = np.array(sheet).astype(np.float32)
    sess = new_session("isnet-general-use")
    for i, bid in enumerate(IDS):
        x0, y0, x1, y1 = cell(i)
        if bid == "crystal":
            c = arr[y0:y1, x0:x1]
            a = key_by_color(c, 28, 110)
            m = cv2.dilate((a > 0.3).astype(np.uint8), np.ones((31, 31), np.uint8))
            n, lab, stats, _ = cv2.connectedComponentsWithStats(m)
            keep = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
            a *= cv2.GaussianBlur((lab == keep).astype(np.float32), (31, 31), 0)
            trim_save(Image.fromarray(np.dstack([c, a * 255]).clip(0, 255).astype(np.uint8), "RGBA"), bid)
        elif bid == "planet":
            c = arr[y0:y1, x0:x1]
            R, B = c[..., 0], c[..., 2]
            cx, cy, r = 250, 268, 143
            yy, xx = np.mgrid[0 : c.shape[0], 0 : c.shape[1]]
            dist = np.hypot(xx - cx, yy - cy)
            disk = np.clip((r - dist) / 3 + 0.5, 0, 1)
            fire = np.clip((R - B - 45) / 70, 0, 1) * np.clip((R - 80) / 80, 0, 1) * np.clip((r * 1.4 - dist) / 25, 0, 1)
            a = np.maximum(disk, fire)
            a[(xx > 370) & (yy > 420)] = 0
            trim_save(Image.fromarray(np.dstack([c, a * 255]).clip(0, 255).astype(np.uint8), "RGBA"), bid)
        else:
            trim_save(remove(sheet.crop((x0, y0, x1, y1)), session=sess), bid)


if __name__ == "__main__":
    main()
