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
  /** sát thương mỗi xu quà tặng */
  giftDmg: number;
  /** quỹ phòng thủ: cả phòng góp đủ bấy nhiêu xu → ĐẠN VÀNG ×2 (mốc sau tăng dần) */
  fundGoal: number;
  /** đạn vàng kéo dài (giây) */
  goldTime: number;
  /** follow / chia sẻ đẩy UFO lùi lên bao nhiêu phần quãng đường */
  followPush: number;
  sharePush: number;
  /** xác suất 1 vòng thường gặp trùm ngẫu nhiên (Đĩa Vàng / Bạch Tuộc / Tàu Tàng Hình) */
  bossChance: number;
  /** 1 lượt quà từ bấy nhiêu xu → người tặng làm TRÙM ở vòng sau */
  bossGift: number;
}

export const DEFAULT_BALANCE: Balance = {
  battleTime: 75,
  hpBase: 260,
  hpPerViewer: 30,
  likeDmg: 1,
  chatDmg: 4,
  chatCooldown: 1.5,
  giftDmg: 12,
  fundGoal: 100,
  goldTime: 12,
  followPush: 0.04,
  sharePush: 0.06,
  bossChance: 0.15,
  bossGift: 100,
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
  b.fundGoal = num("fund") ?? b.fundGoal;
  b.bossGift = num("bossgift") ?? b.bossGift;
  return b;
}
