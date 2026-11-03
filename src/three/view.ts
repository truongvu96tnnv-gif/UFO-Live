// Ảnh chụp trạng thái game mỗi khung hình cho lớp 3D (không phụ thuộc three.js — game.ts import được mà không kéo thư viện).
// Toạ độ theo sân khấu 2D 1080×1920 (x sang phải, y xuống dưới). Lớp 3D đổi sang thế giới 3D, mặt phẳng chơi z = 0.

import type { BossId } from "../game/bosses";

export interface LaserView {
  ref: object;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  fade: number;
  gold: boolean;
}

export interface RocketView {
  ref: object;
  kind: "rocket" | "heavy" | "mega";
  x: number;
  y: number;
  ang: number;
  sc: number;
  color: string;
}

export interface BlastView {
  ref: object;
  x: number;
  y: number;
  age: number;
  color: string;
  size: number;
}

export interface BeamView {
  ref: object;
  style: "earth" | "twin" | "orbital";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  k: number;
}

export interface View3D {
  time: number;
  phase: "intro" | "battle" | "win" | "lose" | "break";
  phaseT: number;
  boss: BossId;
  bossColor: string;
  /** trùm đang hiện trên sân khấu */
  alive: boolean;
  ux: number;
  uy: number;
  tilt: number;
  /** độ rộng model trên sân khấu (px) */
  width: number;
  /** khoảng cách tâm → bụng (px) */
  belly: number;
  hitFlash: number;
  /** 0..1: mức tàng hình */
  cloak: number;
  /** tia hút dưới bụng 0..1 */
  beam: number;
  progress: number;
  golden: boolean;
  shake: number;
  flash: number;
  /** cảnh Kẻ Nuốt Hành Tinh nuốt cả phố: nghiêng & co thế giới về phía miệng */
  tiltWorld: { k: number; mx: number; my: number } | null;
  /** đang sạc kỹ năng (mắt hủy diệt / hơi thở rồng / hố đen) 0..1 */
  charge: number;
  /** khiên tinh thể còn lại 0..1 */
  shield: number;
  lasers: LaserView[];
  rockets: RocketView[];
  blasts: BlastView[];
  beams: BeamView[];
}
