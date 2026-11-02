// Bảng cân bằng — chỉnh được qua tham số URL (xem README).

export interface Balance {
  /** thời gian UFO hạ từ độ cao xuất phát tới mặt đất nếu không ai đẩy lùi (giây) */
  battleTime: number;
  /** máu cơ bản + mỗi người xem hoạt động trong 2 phút gần nhất cộng thêm */
  hpBase: number;
  hpPerViewer: number;
  /** sát thương mỗi lượt tim */
  likeDmg: number;
  /** sát thương mỗi bình luận (mỗi người tối đa 1 phát / chatCooldown giây) */
  chatDmg: number;
  chatCooldown: number;
  /** sát thương mỗi kim cương quà tặng */
  giftDmg: number;
  /** follow / chia sẻ đẩy UFO lùi lên bao nhiêu phần quãng đường */
  followPush: number;
  sharePush: number;
  /** xác suất 1 vòng là UFO VÀNG (trùm: máu ×2.2) */
  bossChance: number;
}

export const DEFAULT_BALANCE: Balance = {
  battleTime: 75,
  hpBase: 260,
  hpPerViewer: 30,
  likeDmg: 1,
  chatDmg: 4,
  chatCooldown: 1.5,
  giftDmg: 12,
  followPush: 0.04,
  sharePush: 0.06,
  bossChance: 0.08,
};

export function balanceFromQuery(q: URLSearchParams): Balance {
  const b = { ...DEFAULT_BALANCE };
  const num = (k: string) => {
    const v = q.get(k);
    return v !== null && v !== "" && Number.isFinite(+v) ? +v : null;
  };
  b.battleTime = num("time") ?? b.battleTime;
  b.hpBase = num("hp") ?? b.hpBase;
  b.hpPerViewer = num("hpv") ?? b.hpPerViewer;
  b.likeDmg = num("like") ?? b.likeDmg;
  b.chatDmg = num("chat") ?? b.chatDmg;
  b.giftDmg = num("gift") ?? b.giftDmg;
  b.bossChance = num("boss") ?? b.bossChance;
  return b;
}

/** Cấp vũ khí theo tổng kim cương của 1 lượt tặng */
export type GiftTier = "rocket" | "heavy" | "mega" | "cannon";
export function giftTier(totalDiamonds: number): GiftTier {
  if (totalDiamonds >= 1000) return "cannon";
  if (totalDiamonds >= 100) return "mega";
  if (totalDiamonds >= 10) return "heavy";
  return "rocket";
}

/**
 * Trần sát thương của 1 lượt tặng (tỉ lệ máu tối đa của UFO): quà lớn rất mạnh nhưng không kết thúc trận ngay —
 * giữ hồi hộp cho cả phòng và tránh cảm giác "mua thắng".
 */
export const TIER_CAP: Record<GiftTier, number> = { rocket: 0.12, heavy: 0.2, mega: 0.35, cannon: 0.6 };

export const TIER_LABEL: Record<GiftTier, string> = {
  rocket: "Tên lửa",
  heavy: "Tên lửa hạng nặng",
  mega: "Siêu tên lửa",
  cannon: "PHÁO TRÁI ĐẤT",
};
