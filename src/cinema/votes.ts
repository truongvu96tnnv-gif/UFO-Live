// Bình chọn của cả rạp: đọc bình luận "1" / "2" (và các cách viết khác), đếm phiếu, phiếu vàng từ quà.

export type Pick = 0 | 1;

const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLowerCase();

/**
 * "1", "2", "11111", "số 1", "chọn 2!!", "1️⃣", "A", "b", "một", "hai", "#2", "vote 1" → lựa chọn; câu thường → null.
 * Chỉ nhận khi con số đứng đầu câu, để "2 đứa sợ quá" vẫn tính là phiếu (người ta hay gõ vậy) nhưng "sợ 2 đứa" thì không.
 */
export function parseVote(text: string): Pick | null {
  // bỏ tiền tố khi còn dấu: "số 2" là phiếu, "sợ 2 đứa" thì không (bỏ dấu rồi cả hai đều thành "so")
  let s = text.normalize("NFC").toLowerCase().replace(/[⃣️]/g, "").trim();
  s = s.replace(/^(?:#|chọn|chon|số|so|vote|bình chọn|binh chon|bầu|bau)\s*/u, "").trim();
  s = plain(s);
  let m = s.match(/^([12])\1*(?!\d)/);
  if (m) return m[1] === "1" ? 0 : 1;
  m = s.match(/^([ab])\1*(?![\p{L}\p{N}])/u);
  if (m) return m[1] === "a" ? 0 : 1;
  m = s.match(/^(mot|hai)(?![\p{L}\p{N}])/u);
  if (m) return m[1] === "mot" ? 0 : 1;
  return null;
}

/** Phiếu vàng tối đa 1 người được cộng thêm trong 1 lần bình chọn nhờ tặng quà */
export const GOLD_PER_USER = 10;

export class VoteBox {
  /** phiếu thường: mỗi người 1 phiếu, đổi ý được (lấy phiếu cuối) */
  readonly votes = new Map<string, Pick>();
  /** phiếu vàng đã cộng cho từng người */
  private gold = new Map<string, number>();
  readonly bonus: [number, number] = [0, 0];

  /** "new" = phiếu mới, "changed" = đổi ý, "same" = bình luận lại cùng lựa chọn */
  cast(userId: string, pick: Pick): "new" | "changed" | "same" {
    const prev = this.votes.get(userId);
    this.votes.set(userId, pick);
    if (prev === undefined) return "new";
    if (prev === pick) return "same";
    // phiếu vàng đi theo lựa chọn hiện tại của người tặng
    const g = this.gold.get(userId) ?? 0;
    this.bonus[prev] -= g;
    this.bonus[pick] += g;
    return "changed";
  }

  /**
   * Quà của người ĐÃ bình chọn → phiếu vàng cho lựa chọn của họ (căn bậc hai số xu, tối đa GOLD_PER_USER / người).
   * Tổng phiếu vàng không vượt quá số người bình chọn — quà không thể thắng áp đảo cả rạp. Trả về số phiếu vừa cộng.
   */
  giftGold(userId: string, coins: number): number {
    const pick = this.votes.get(userId);
    if (pick === undefined || coins <= 0) return 0;
    const had = this.gold.get(userId) ?? 0;
    const room = Math.max(0, Math.max(3, this.votes.size) - this.bonus[0] - this.bonus[1]);
    const add = Math.min(GOLD_PER_USER - had, Math.ceil(Math.sqrt(coins)), room);
    if (add <= 0) return 0;
    this.gold.set(userId, had + add);
    this.bonus[pick] += add;
    return add;
  }

  goldOf(userId: string) {
    return this.gold.get(userId) ?? 0;
  }

  totals(): [number, number] {
    const t: [number, number] = [this.bonus[0], this.bonus[1]];
    for (const p of this.votes.values()) t[p]++;
    return t;
  }

  get voters() {
    return this.votes.size;
  }

  /** Lựa chọn thắng; hoà (kể cả không ai bình chọn) thì bốc ngẫu nhiên */
  winner(rng: () => number = Math.random): { pick: Pick; tie: boolean } {
    const [a, b] = this.totals();
    if (a === b) return { pick: rng() < 0.5 ? 0 : 1, tie: true };
    return { pick: a > b ? 0 : 1, tie: false };
  }
}

const REACTIONS: [RegExp, string][] = [
  [/(?:ha){2,}|(?:hi){2,}|(?:he){2,}|kk+|=\)\)|😂|🤣|cuoi|buon cuoi|hai qua/u, "😂"],
  [/so qua|so vl|so that|so chet|so ghe|ghe qua|ghe so|hu hon|rung minh|😱|😨|ma kia|cuu voi/u, "😱"],
  [/khoc|huhu|hu hu|😭|😢|cam dong|thuong qua|buon qua/u, "😭"],
  [/yeu|hay qua|hay the|dinh|tuyet|❤|😍|🥰|xuat sac|cuon qua/u, "😍"],
  [/wow|\boi\b|\boa\b|😮|😲|bat ngo|vai ca|vai that|plot twist|cu lua/u, "😮"],
];

/** Bình luận thể hiện cảm xúc → emoji bay lên trên ghế người đó (null nếu không nhận ra) */
export function reactionOf(text: string): string | null {
  const s = plain(text);
  for (const [re, emoji] of REACTIONS) if (re.test(s)) return emoji;
  return null;
}
