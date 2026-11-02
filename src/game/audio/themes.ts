import type { BossId } from "../bosses";

/**
 * Nhạc chủ đề riêng của từng boss: tempo, số bước mỗi ô nhịp (16 = 4/4 nốt móc kép, 12 = 6/8),
 * vòng hợp âm 4 ô nhịp và giai điệu (mỗi ô nhịp 8 nốt móc đơn, null = nghỉ). Phần phối trống/nhạc cụ ở music.ts.
 */

export interface Chord {
  root: number;
  notes: number[];
}
const C = (root: number, ...notes: number[]): Chord => ({ root, notes });
type Bar = (number | null)[];

export interface Theme {
  bpm: number;
  steps: 16 | 12;
  prog: Chord[];
  /** giai điệu chính: 4 ô nhịp × 8 nốt (6/8: 6 nốt) */
  melody?: Bar[];
  /** mô tả ngắn (README / file nghe thử) */
  mood: string;
}

const _ = null;

export const THEMES: Partial<Record<BossId, Theme>> = {
  gold: {
    bpm: 116,
    steps: 16,
    mood: "Hành khúc hoàng gia: trống quân hành, kèn trumpet, chuông, chiêng — Rê trưởng",
    prog: [C(38, 62, 66, 69), C(43, 62, 67, 71), C(45, 61, 64, 69), C(38, 62, 66, 69)],
    melody: [
      [74, _, 74, 76, 78, _, 74, _],
      [79, _, 78, 76, 74, _, 71, _],
      [73, _, 76, 73, 69, _, 73, 76],
      [74, _, _, _, 69, 74, 78, _],
    ],
  },
  octopus: {
    bpm: 84,
    steps: 12,
    mood: "Nhịp 6/8 lắc lư, bass ục ục, kèn theremin rùng rợn — Mi thứ",
    prog: [C(40, 52, 55, 59), C(36, 52, 55, 60), C(45, 57, 60, 64), C(47, 54, 59, 63)],
    melody: [
      [71, _, 72, 71, _, 67],
      [72, _, 71, 67, _, 64],
      [69, _, 72, 76, _, 72],
      [75, _, 71, 66, 67, 71],
    ],
  },
  stealth: {
    bpm: 132,
    steps: 16,
    mood: "Điện tử tối giản, hi-hat dày, pluck staccato, tiếng ra-đa — Fa thăng thứ",
    prog: [C(42, 54, 57, 61), C(38, 54, 57, 62), C(42, 54, 57, 61), C(40, 56, 59, 64)],
  },
  spider: {
    bpm: 122,
    steps: 16,
    mood: "Công nghiệp: trống kim loại, arpeggio lách cách, bass méo — Đô thứ",
    prog: [C(36, 48, 51, 55), C(36, 48, 51, 55), C(44, 56, 60, 63), C(43, 55, 59, 62)],
  },
  devourer: {
    bpm: 70,
    steps: 16,
    mood: "Doom trầm nặng, bass dưới âm trượt xuống, hợp xướng tối — Si giáng thứ",
    prog: [C(34, 58, 61, 65), C(30, 54, 58, 61), C(34, 58, 61, 65), C(33, 57, 61, 64)],
  },
  crystal: {
    bpm: 108,
    steps: 16,
    mood: "Chuông pha lê lấp lánh, arpeggio 16 nốt, pad sáng — Fa thăng thứ",
    prog: [C(42, 66, 69, 73), C(38, 66, 69, 74), C(45, 64, 69, 73), C(40, 64, 68, 71)],
  },
  mother: {
    bpm: 96,
    steps: 16,
    mood: "Sử thi: trống taiko, hợp xướng dày, kèn đồng — Đô thứ",
    prog: [C(36, 60, 63, 67), C(32, 60, 63, 68), C(39, 58, 63, 67), C(34, 58, 62, 65)],
    melody: [
      [72, _, _, 74, 75, _, 74, 72],
      [75, _, _, 77, 79, _, 77, 75],
      [74, _, _, 75, 74, _, 70, _],
      [74, _, 72, _, 70, _, 74, _],
    ],
  },
  planet: {
    bpm: 84,
    steps: 16,
    mood: "U ám điệu Phrygian, chuông nguyện hồn, trống nặng — Mi Phrygian",
    prog: [C(40, 52, 55, 59), C(41, 53, 57, 60), C(40, 52, 55, 59), C(47, 59, 63, 66)],
  },
  dragon: {
    bpm: 144,
    steps: 16,
    mood: "Sử thi hoành tráng nhất: double-kick, kèn đồng, hợp xướng, dây tremolo — Rê thứ hoà âm",
    prog: [C(38, 62, 65, 69), C(34, 62, 65, 70), C(36, 60, 64, 67), C(33, 61, 64, 69)],
    melody: [
      [74, _, 77, _, 81, 79, 77, 76],
      [74, _, 70, _, 74, _, 77, _],
      [76, _, 79, _, 76, 74, 72, _],
      [73, _, 76, 79, 81, _, 73, _],
    ],
  },
};
