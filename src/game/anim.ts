/**
 * Hoạt ảnh boss theo khung (sprite sheet đã nhập bằng tools/import_boss_anim.py).
 * Mỗi bộ có các chuyển động: idle (đứng/lơ lửng), move (bay), attack (bắn trả), hit (trúng đòn).
 * idle/move lặp; attack/hit phát 1 lần rồi về chuyển động nền.
 */

export interface AnimMeta {
  cell: number;
  cols: number;
  /** bề rộng thân trong 1 ô (px ảnh) */
  bodyW: number;
  /** khoảng tâm thân → đáy thân (px ảnh) */
  belly: number;
  anims: Record<string, { frames: number[]; fps: number; loop: boolean }>;
}

export class SpriteAnim {
  img: HTMLImageElement | null = null;
  private once: { name: string; t0: number } | null = null;

  constructor(readonly meta: AnimMeta, url: string) {
    const im = new Image();
    im.decoding = "async";
    im.onload = () => (this.img = im);
    im.src = url;
  }

  has(name: string) {
    return !!this.meta.anims[name];
  }

  /** phát 1 lần (attack / hit); trả về thời lượng (giây) */
  play(name: string, t: number) {
    const a = this.meta.anims[name];
    if (!a) return 0;
    this.once = { name, t0: t };
    return a.frames.length / a.fps;
  }

  /** đang phát chuyển động 1 lần nào (nếu có) */
  playing(t: number) {
    const o = this.once;
    if (!o) return null;
    const a = this.meta.anims[o.name];
    if ((t - o.t0) * a.fps >= a.frames.length) {
      this.once = null;
      return null;
    }
    return o.name;
  }

  /** chỉ số khung cần vẽ lúc t, chuyển động nền `base` */
  frame(t: number, base: string) {
    const o = this.once;
    if (o && this.playing(t)) {
      const a = this.meta.anims[o.name];
      return a.frames[Math.min(a.frames.length - 1, Math.floor((t - o.t0) * a.fps))];
    }
    const a = this.meta.anims[base] ?? Object.values(this.meta.anims)[0];
    return a.frames[Math.floor(t * a.fps) % a.frames.length];
  }

  /** vẽ khung `i` vào hình vuông cạnh `size`, tâm (cx, cy) */
  draw(ctx: CanvasRenderingContext2D, i: number, cx: number, cy: number, size: number) {
    if (!this.img) return;
    const c = this.meta.cell;
    const sx = (i % this.meta.cols) * c;
    const sy = Math.floor(i / this.meta.cols) * c;
    ctx.drawImage(this.img, sx, sy, c, c, cx - size / 2, cy - size / 2, size, size);
  }
}
