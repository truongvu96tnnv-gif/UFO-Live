/** Shared by the game and control API; contains no browser rendering code. */
export const BOSS_NAMES = {
  ufo: "UFO Xâm Lược",
  ufo2: "UFO Tuần Tra",
  ufo3: "UFO Lõi Plasma",
  gold: "Đĩa Vàng Hoàng Gia",
  octopus: "Bạch Tuộc Vũ Trụ",
  stealth: "Tàu Tàng Hình Bóng Đêm",
  spider: "Nhện Vũ Trụ",
  devourer: "Kẻ Nuốt Hành Tinh",
  crystal: "Pháo Đài Tinh Thể",
  mother: "Phi Thuyền Mẹ",
  planet: "Hành Tinh Hủy Diệt",
  dragon: "Rồng Không Gian",
} as const;

export type BossId = keyof typeof BOSS_NAMES;

export function isBossId(value: unknown): value is BossId {
  return typeof value === "string" && Object.hasOwn(BOSS_NAMES, value);
}
