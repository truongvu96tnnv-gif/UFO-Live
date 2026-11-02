/**
 * Vẽ ảnh lên lưới biến dạng (mesh warp) bằng tam giác ánh xạ affine — để art tĩnh (vd. xúc tu bạch tuộc)
 * uốn lượn thật thay vì chỉ lắc nguyên khối.
 */

export type Displace = (u: number, v: number) => [number, number];

/** ô lưới hoàn toàn trong suốt thì bỏ qua (tính 1 lần cho mỗi ảnh & cỡ lưới) */
const coverage = new WeakMap<HTMLImageElement, Map<string, boolean[]>>();

function cellsWithPixels(img: HTMLImageElement, cols: number, rows: number): boolean[] {
  let byGrid = coverage.get(img);
  if (!byGrid) coverage.set(img, (byGrid = new Map()));
  const key = `${cols}x${rows}`;
  const hit = byGrid.get(key);
  if (hit) return hit;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const out = new Array<boolean>(cols * rows).fill(true);
  try {
    const c = document.createElement("canvas");
    c.width = iw;
    c.height = ih;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, iw, ih).data;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x0 = Math.floor((i / cols) * iw);
        const x1 = Math.ceil(((i + 1) / cols) * iw);
        const y0 = Math.floor((j / rows) * ih);
        const y1 = Math.ceil(((j + 1) / rows) * ih);
        let any = false;
        for (let y = y0; y < y1 && !any; y += 2) {
          for (let x = x0; x < x1; x += 2) {
            if (data[(y * iw + x) * 4 + 3] > 8) {
              any = true;
              break;
            }
          }
        }
        out[j * cols + i] = any;
      }
    }
  } catch {
    /* ảnh khác nguồn: vẽ đủ mọi ô */
  }
  byGrid.set(key, out);
  return out;
}

/** Vẽ phần ảnh trong tam giác nguồn (s) lên tam giác đích (d) */
function tri(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  s0x: number, s0y: number, s1x: number, s1y: number, s2x: number, s2y: number,
  d0x: number, d0y: number, d1x: number, d1y: number, d2x: number, d2y: number,
  /** ô nguồn chứa tam giác — chỉ vẽ đúng ô này thay vì cả ảnh (nhanh hơn nhiều) */
  cx0: number, cy0: number, cx1: number, cy1: number,
) {
  const den = s0x * (s2y - s1y) - s1x * s2y + s2x * s1y + (s1x - s2x) * s0y;
  if (Math.abs(den) < 1e-6) return;
  const a = -(s0y * (d2x - d1x) - s1y * d2x + s2y * d1x + (s1y - s2y) * d0x) / den;
  const b = (s1y * d2y + s0y * (d1y - d2y) - s2y * d1y + (s2y - s1y) * d0y) / den;
  const c = (s0x * (d2x - d1x) - s1x * d2x + s2x * d1x + (s1x - s2x) * d0x) / den;
  const d = -(s1x * d2y + s0x * (d1y - d2y) - s2x * d1y + (s2x - s1x) * d0y) / den;
  const e = (s0x * (s2y * d1x - s1y * d2x) + s0y * (s1x * d2x - s2x * d1x) + (s2x * s1y - s1x * s2y) * d0x) / den;
  const f = (s0x * (s2y * d1y - s1y * d2y) + s0y * (s1x * d2y - s2x * d1y) + (s2x * s1y - s1x * s2y) * d0y) / den;
  // nới vùng cắt ~1px quanh trọng tâm để không lộ đường nối giữa các tam giác
  const mx = (d0x + d1x + d2x) / 3;
  const my = (d0y + d1y + d2y) / 3;
  const grow = (x: number, y: number): [number, number] => {
    const dx = x - mx;
    const dy = y - my;
    const l = Math.hypot(dx, dy) || 1;
    return [x + (dx / l) * 1.2, y + (dy / l) * 1.2];
  };
  const [p0x, p0y] = grow(d0x, d0y);
  const [p1x, p1y] = grow(d1x, d1y);
  const [p2x, p2y] = grow(d2x, d2y);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p0x, p0y);
  ctx.lineTo(p1x, p1y);
  ctx.lineTo(p2x, p2y);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, d, e, f);
  const x0 = Math.max(0, Math.floor(cx0) - 2);
  const y0 = Math.max(0, Math.floor(cy0) - 2);
  const x1 = Math.min(img.naturalWidth, Math.ceil(cx1) + 2);
  const y1 = Math.min(img.naturalHeight, Math.ceil(cy1) + 2);
  ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  ctx.restore();
}

/**
 * Vẽ ảnh vào khung (x, y, w, h) trên lưới cols×rows; `displace(u, v)` trả độ lệch (px) cho điểm lưới
 * ở toạ độ chuẩn hoá u, v ∈ [0, 1].
 */
export function drawWarped(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, cols: number, rows: number, displace: Displace) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const has = cellsWithPixels(img, cols, rows);
  const px = new Float32Array((cols + 1) * (rows + 1) * 2);
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const v = j / rows;
      const [dx, dy] = displace(u, v);
      const k = (j * (cols + 1) + i) * 2;
      px[k] = x + u * w + dx;
      px[k + 1] = y + v * h + dy;
    }
  }
  const P = (i: number, j: number) => (j * (cols + 1) + i) * 2;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (!has[j * cols + i]) continue;
      const sx0 = (i / cols) * iw;
      const sx1 = ((i + 1) / cols) * iw;
      const sy0 = (j / rows) * ih;
      const sy1 = ((j + 1) / rows) * ih;
      const a = P(i, j);
      const b = P(i + 1, j);
      const c = P(i, j + 1);
      const d = P(i + 1, j + 1);
      tri(ctx, img, sx0, sy0, sx1, sy0, sx1, sy1, px[a], px[a + 1], px[b], px[b + 1], px[d], px[d + 1], sx0, sy0, sx1, sy1);
      tri(ctx, img, sx0, sy0, sx1, sy1, sx0, sy1, px[a], px[a + 1], px[d], px[d + 1], px[c], px[c + 1], sx0, sy0, sx1, sy1);
    }
  }
}
