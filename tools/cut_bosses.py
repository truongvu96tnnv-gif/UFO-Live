"""
Tách 8 trùm từ ảnh tổng hợp art-source/bosses-sheet.webp (lưới 4×2, mỗi ô 500 px) thành
src/assets/bosses/<id>.webp có nền trong suốt.

  python -m venv .venv && .venv/bin/pip install "rembg[cpu]" opencv-python-headless pillow
  .venv/bin/python tools/cut_bosses.py            # cả 8 trùm (mỗi trùm 1 tiến trình — model BiRefNet ~1 GB RAM)
  .venv/bin/python tools/cut_bosses.py gold       # chỉ 1 trùm

- 6 trùm thân đặc: rembg + model BiRefNet (mép sắc, không dính khói/lửa/vạch lưới của ảnh gốc).
- Pháo Đài Tinh Thể: hình dáng từ BiRefNet + độ đặc theo độ sáng tinh thể (BiRefNet coi tinh thể phát sáng là trong suốt).
- Hành Tinh Hủy Diệt: mặt nạ hình tròn (tâm/bán kính đo tay) + giữ quầng lửa cam, bỏ khói & logo watermark góc.
- Sau cùng: làm sạch (bỏ sương xám, mảnh rời), khử viền màu nền, phóng 2× + làm nét.
Thay art: giữ đúng bố cục lưới, chạy lại script, rồi chỉnh BOSS_ART trong src/game/bosses.ts nếu tỉ lệ khác.
"""
import numpy as np
import cv2
from PIL import Image, ImageFilter
from rembg import new_session, remove

SHEET = "art-source/bosses-sheet.webp"
OUT = "src/assets/bosses"
IDS = ["ufo", "gold", "octopus", "stealth", "cruiser", "crystal", "mother", "planet"]


# Vùng cắt riêng cho trùm tràn ra ngoài ô 500 px (mũi chiến hạm, gai đĩa vàng) — đo trên ảnh gốc
CROP = {
    "gold": (505, 0, 1035, 490),
    "cruiser": (0, 600, 582, 1045),
    "crystal": (583, 560, 1000, 1045),
}


def cell(i):
    if IDS[i] in CROP:
        return CROP[IDS[i]]
    col, row = i % 4, i // 4
    return (col * 500, 0 if row == 0 else 560, (col + 1) * 500, 490 if row == 0 else 1045)


def keep_main(im):
    """Chỉ giữ thân chính (thành phần lớn nhất) — bỏ mảnh lạc của trùm bên cạnh lọt vào vùng cắt"""
    arr = np.array(im)
    m = cv2.dilate((arr[..., 3] > 30).astype(np.uint8), np.ones((15, 15), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m)
    if n > 2:
        keep = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
        arr[..., 3][lab != keep] = 0
    return Image.fromarray(arr, "RGBA")


# Màu nền trời của ảnh gốc (xanh navy tối) — dùng để khử viền tối ở mép bán trong suốt
SKY = np.array([14, 18, 38], np.float32)

# Ngưỡng làm sạch riêng: trùm phát sáng (lửa, tinh thể) giữ được nhiều quầng màu hơn
CLEAN = {
    "planet": dict(haze_sat=0.18, solid=0.55),
    "crystal": dict(haze_sat=0.2, solid=0.5),
    # UFO, chiến hạm: bỏ mẩu lửa rời ở mép (game tự vẽ lửa phụt & khói động)
    "ufo": dict(haze_sat=0.28, solid=0.7, no_fire=True),
    "cruiser": dict(haze_sat=0.28, solid=0.7, no_fire=True),
}


def clean(im, name):
    """
    Làm sạch ảnh đã tách nền:
      1) bỏ vùng bán trong suốt màu xám (khói, sương, vạch lưới của ảnh gốc) — giữ quầng sáng có màu (lửa, vàng, tím)
      2) bỏ hạt li ti & nét mảnh rời rạc, chỉ giữ thân chính
      3) khử viền: tách màu nền trời khỏi pixel mép (hết viền đen/xanh quanh thân)
      4) phóng 2× + làm nét nhẹ để hiển thị lớn trong game không bị mờ
    """
    cfg = CLEAN.get(name, dict(haze_sat=0.28, solid=0.7))
    arr = np.array(im.convert("RGBA")).astype(np.float32)
    rgb, a = arr[..., :3], arr[..., 3] / 255.0
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = np.where(mx > 1, (mx - mn) / np.maximum(mx, 1), 0)
    val = mx / 255.0
    haze = (a < cfg["solid"]) & (sat < cfg["haze_sat"]) & (val < cfg.get("haze_val", 0.75))
    if "light_gray" in cfg:
        haze |= (sat < 0.22) & (val > cfg["light_gray"])
    if cfg.get("no_fire"):
        r_, g_, b_ = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        haze |= (a < 0.85) & (r_ > g_ * 1.15) & (r_ > b_ * 1.4) & (val > 0.45)
    a = np.where(haze, 0, a)
    a[a < 0.12] = 0
    # bỏ nét mảnh (vạch lưới) & hạt rời: mở hình thái học rồi giữ thành phần lớn
    m = (a > 0.2).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(cv2.dilate(m, np.ones((9, 9), np.uint8)))
    if n > 1:
        big = stats[1:, cv2.CC_STAT_AREA].max()
        keep = np.zeros(n, bool)
        keep[1:] = stats[1:, cv2.CC_STAT_AREA] >= big * 0.04
        mask = keep[lab].astype(np.float32)
        a = a * cv2.GaussianBlur(mask, (5, 5), 0)
    # khử viền: C = (C_trộn - (1-a)·nền) / a
    aa = np.clip(a, 1e-3, 1)[..., None]
    rgb = np.where(aa < 0.98, (rgb - (1 - aa) * SKY) / aa, rgb)
    rgb = np.clip(rgb, 0, 255)
    out = Image.fromarray(np.dstack([rgb, a * 255]).clip(0, 255).astype(np.uint8), "RGBA")
    out = out.resize((out.width * 2, out.height * 2), Image.LANCZOS)
    r, g, b, al = out.split()
    sharp = Image.merge("RGB", (r, g, b)).filter(ImageFilter.UnsharpMask(radius=2, percent=70, threshold=2))
    return Image.merge("RGBA", (*sharp.split(), al))


def trim_save(im, name):
    im = clean(im, name)
    bb = im.getchannel("A").point(lambda a: 255 if a > 10 else 0).getbbox()
    im.crop(bb).save(f"{OUT}/{name}.webp", "WEBP", quality=90, method=6)
    print(name, im.crop(bb).size)


def key_by_color(crop, lo, hi):
    border = np.concatenate([crop[:12].reshape(-1, 3), crop[-12:].reshape(-1, 3), crop[:, :12].reshape(-1, 3), crop[:, -12:].reshape(-1, 3)])
    d = np.sqrt(((crop - np.median(border, axis=0)) ** 2).sum(-1))
    return np.clip((d - lo) / (hi - lo), 0, 1)


def main(ids):
    sheet = Image.open(SHEET).convert("RGB")
    arr = np.array(sheet).astype(np.float32)
    sess = new_session("birefnet-general")
    for bid in ids:
        i = IDS.index(bid)
        x0, y0, x1, y1 = cell(i)
        if bid == "planet":
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
            continue
        cut = remove(sheet.crop((x0, y0, x1, y1)), session=sess)
        if bid == "crystal":
            # BiRefNet cho hình dáng; độ đặc lấy theo độ sáng (khối tinh thể sáng → đặc, quầng tím tối → bỏ)
            c = arr[y0:y1, x0:x1]
            shape = np.array(cut)[..., 3].astype(np.float32) / 255
            region = cv2.dilate((shape > 0.12).astype(np.uint8), np.ones((7, 7), np.uint8)).astype(np.float32)
            bright = np.clip((key_by_color(c, 28, 110) - 0.45) / 0.3, 0, 1)
            a = np.maximum(shape, bright) * cv2.GaussianBlur(region, (5, 5), 0)
            cut = Image.fromarray(np.dstack([c, a * 255]).clip(0, 255).astype(np.uint8), "RGBA")
        trim_save(keep_main(cut), bid)


if __name__ == "__main__":
    import subprocess
    import sys

    want = sys.argv[1:] or IDS
    if len(want) == 1:
        main(want)
    else:
        # mỗi trùm 1 tiến trình: BiRefNet giữ ~1 GB RAM, chạy liền nhiều ảnh dễ bị hệ điều hành dừng
        for bid in want:
            subprocess.run([sys.executable, *sys.argv[:1], bid], check=True)
