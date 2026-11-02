// Danh mục quà TikTok → vũ khí trong game. Giá quà tính bằng XU (coin) — đơn vị người xem bỏ ra để tặng.
// Giá dưới đây là giá tham khảo phổ biến; khi chạy live, bridge gửi giá thật của từng quà nên game luôn dùng giá thật.
// Quà không có trong danh mục vẫn dùng được: vũ khí được chọn theo số xu.

export type Weapon =
  | "rocket" // loạt tên lửa nhỏ
  | "rose" // tên lửa hoa hồng, nổ ra cánh hoa
  | "heart" // đạn trái tim bay thành chùm
  | "heavy" // tên lửa hạng nặng, người tặng ngồi trên
  | "confetti" // bom pháo giấy
  | "twinLaser" // laser đôi từ kính râm
  | "moneyGun" // súng bắn tiền: mưa tờ tiền bay lên
  | "mega" // 3 siêu tên lửa
  | "cannon" // PHÁO TRÁI ĐẤT: cột năng lượng từ mặt đất
  | "orbital"; // SIÊU VŨ KHÍ VŨ TRỤ: tia từ quỹ đạo + phi đội tên lửa

export interface GiftDef {
  key: string;
  /** tên hiển thị tiếng Việt */
  name: string;
  icon: string;
  /** giá tham khảo (xu) */
  coins: number;
  weapon: Weapon;
  /** tên quà TikTok gửi về (tiếng Anh / tiếng Việt), so khớp không phân biệt hoa thường */
  aliases: string[];
}

export const GIFTS: GiftDef[] = [
  { key: "rose", name: "Hoa hồng", icon: "🌹", coins: 1, weapon: "rose", aliases: ["rose", "hoa hồng"] },
  { key: "tiktok", name: "TikTok", icon: "🎵", coins: 1, weapon: "rocket", aliases: ["tiktok"] },
  { key: "icecream", name: "Kem ốc quế", icon: "🍦", coins: 1, weapon: "rocket", aliases: ["ice cream cone", "ice cream", "kem", "kem ốc quế"] },
  { key: "fingerheart", name: "Tim ngón tay", icon: "🫰", coins: 5, weapon: "heart", aliases: ["finger heart", "tim ngón tay"] },
  { key: "perfume", name: "Nước hoa", icon: "🧴", coins: 20, weapon: "heavy", aliases: ["perfume", "nước hoa"] },
  { key: "doughnut", name: "Bánh donut", icon: "🍩", coins: 30, weapon: "heavy", aliases: ["doughnut", "donut", "bánh donut"] },
  { key: "hat", name: "Mũ và ria", icon: "🎩", coins: 99, weapon: "heavy", aliases: ["hat and mustache", "mũ và ria"] },
  { key: "handhearts", name: "Tim bằng tay", icon: "🫶", coins: 100, weapon: "confetti", aliases: ["hand hearts", "tim bằng tay"] },
  { key: "confetti", name: "Pháo giấy", icon: "🎉", coins: 100, weapon: "confetti", aliases: ["confetti", "pháo giấy"] },
  { key: "sunglasses", name: "Kính râm", icon: "😎", coins: 199, weapon: "twinLaser", aliases: ["sunglasses", "kính râm"] },
  { key: "corgi", name: "Corgi", icon: "🐶", coins: 299, weapon: "mega", aliases: ["corgi"] },
  { key: "moneygun", name: "Súng bắn tiền", icon: "💸", coins: 500, weapon: "moneyGun", aliases: ["money gun", "súng bắn tiền"] },
  { key: "galaxy", name: "Thiên hà", icon: "🌌", coins: 1000, weapon: "cannon", aliases: ["galaxy", "thiên hà"] },
  { key: "fireworks", name: "Pháo hoa", icon: "🎆", coins: 1088, weapon: "cannon", aliases: ["fireworks", "pháo hoa"] },
  { key: "lion", name: "Sư tử", icon: "🦁", coins: 29999, weapon: "orbital", aliases: ["lion", "sư tử"] },
  { key: "universe", name: "Vũ trụ", icon: "🪐", coins: 34999, weapon: "orbital", aliases: ["universe", "tiktok universe", "vũ trụ"] },
];

export const WEAPON_LABEL: Record<Weapon, string> = {
  rocket: "Tên lửa",
  rose: "Tên lửa hoa hồng",
  heart: "Đạn trái tim",
  heavy: "Tên lửa hạng nặng",
  confetti: "Bom pháo giấy",
  twinLaser: "Laser kính râm",
  moneyGun: "Súng bắn tiền",
  mega: "Siêu tên lửa",
  cannon: "PHÁO TRÁI ĐẤT",
  orbital: "SIÊU VŨ KHÍ VŨ TRỤ",
};

/**
 * Trần sát thương của 1 lượt tặng (tỉ lệ máu tối đa của UFO): quà lớn rất mạnh nhưng không kết thúc trận ngay —
 * giữ hồi hộp cho cả phòng và tránh cảm giác "mua thắng".
 */
export const WEAPON_CAP: Record<Weapon, number> = {
  rocket: 0.12,
  rose: 0.12,
  heart: 0.12,
  heavy: 0.2,
  confetti: 0.2,
  twinLaser: 0.35,
  moneyGun: 0.35,
  mega: 0.35,
  cannon: 0.6,
  orbital: 0.85,
};

/** Vũ khí cho quà lạ, chọn theo giá 1 món */
function weaponByCoins(coins: number): Weapon {
  if (coins >= 10000) return "orbital";
  if (coins >= 1000) return "cannon";
  if (coins >= 100) return "mega";
  if (coins >= 10) return "heavy";
  return "rocket";
}

const norm = (s: string) => s.trim().toLowerCase().normalize("NFC");
const BY_ALIAS = new Map<string, GiftDef>();
for (const g of GIFTS) for (const a of g.aliases) BY_ALIAS.set(norm(a), g);

export interface ResolvedGift {
  name: string;
  icon: string;
  weapon: Weapon;
}

export function resolveGift(name: string, coins: number): ResolvedGift {
  const def = BY_ALIAS.get(norm(name));
  if (def) return { name: def.name, icon: def.icon, weapon: def.weapon };
  return { name: name || "Quà", icon: "🎁", weapon: weaponByCoins(coins) };
}
