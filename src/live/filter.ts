/**
 * Lọc chữ của người xem trước khi đưa lên màn hình live (tên + bình luận).
 * Mọi thứ hiện trên màn hình là do live của chủ phòng phát ra → chặn chửi bậy, miệt thị vùng miền / chủng tộc,
 * số điện thoại, link và lời mời kết bạn ngoài nền tảng (Zalo, Telegram…).
 *
 * Thêm từ cấm riêng qua tham số URL: ?ban=tu1,tu2 (so khớp không dấu, không khoảng trắng).
 */

/** bỏ dấu tiếng Việt, đ → d, chữ thường */
function plain(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase();
}

/** chỉ giữ chữ & số (bỏ khoảng trắng, dấu chấm… mà người ta chèn để lách: "d.i.t m.e") */
const squash = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, "");

/** leetspeak hay gặp */
const unleet = (s: string) => s.replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e").replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t").replace(/\$/g, "s").replace(/@/g, "a");

/**
 * Cụm chỉ có nghĩa xấu kể cả khi bỏ dấu & ép liền. Chỉ để những cụm KHÔNG trùng câu thường
 * (vd. không để "concac" vì "còn các bạn", không để "cailon" vì "cái lớn" — mấy từ đó do ACCENT_SUB lo).
 */
const PLAIN_SUB = [
  // chửi tục viết tắt / không dấu
  "ditme", "ditmia", "ditbo", "dmm", "dcm", "dkm", "dmcs", "vcl", "vkl", "vcc", "clgt", "cmm", "cmnr", "dume", "duma", "dumia", "dutme", "djt", "dodiem",
  // miệt thị vùng miền
  "backy", "namky", "parky", "namkiki",
  // tiếng Anh
  "fuck", "fuk", "fck", "shit", "bitch", "cunt", "pussy", "whore", "slut", "nigg", "faggot", "retard", "porn", "onlyfans", "nude",
];
/** Từ ngắn: chỉ cấm khi đứng riêng (không dấu) */
const PLAIN_WORD = new Set(["dm", "dmm", "dit", "djt", "vl", "cl", "cc", "loz", "cak", "dech", "sex", "xxx", "fk", "wtf", "stfu", "dick"]);
/** Phải có dấu mới chắc là tục ("lồn" ≠ "lớn", "cặc" ≠ "các", "đĩ" ≠ "đi") → so trên chuỗi có dấu */
const ACCENT_SUB = ["lồn", "buồi", "cặc", "địt", "đéo", "đếch", "óc chó", "ngu như chó", "mẹ mày", "con mẹ nó", "bố mày", "chó má", "chó chết", "khốn nạn", "súc vật", "mọi rợ", "khựa", "thằng chó", "con chó cái", "đồ điếm"];
const ACCENT_WORD = new Set(["đụ", "đĩ"]);

const extra: string[] = [];
export function addBannedWords(list: string | null | undefined) {
  if (!list) return;
  for (const w of list.split(",")) {
    const k = squash(plain(w.trim()));
    if (k.length >= 2) extra.push(k);
  }
}

const words = (s: string) => s.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

function profane(raw: string) {
  const low = raw.toLowerCase().replace(/\s+/g, " ");
  const pl = unleet(plain(raw));
  const flat = squash(pl);
  for (const w of PLAIN_SUB) if (flat.includes(w)) return true;
  for (const w of extra) if (flat.includes(w)) return true;
  for (const w of words(pl)) if (PLAIN_WORD.has(w)) return true;
  for (const w of ACCENT_SUB) if (low.includes(w)) return true;
  for (const w of words(low)) if (ACCENT_WORD.has(w)) return true;
  // "ngu" chỉ cấm khi nhắm vào người: "thằng ngu", "đồ ngu", "ngu vãi"
  if (/(thằng|con|đồ|mày|bọn|lũ) ngu|ngu (vãi|vl|vcl|như)/u.test(low)) return true;
  return false;
}

/** số điện thoại (≥ 8 chữ số liền, kể cả chèn dấu cách / chấm / gạch), link, mời sang nền tảng khác */
function contact(raw: string) {
  const digits = raw.replace(/[\s.\-_()+]/g, "");
  if (/\d{8,}/.test(digits)) return true;
  const p = plain(raw);
  if (/https?:|www\.|\b[\w-]+\.(com|vn|net|org|me|io|xyz|link|ly|top|site|shop|club|info|biz)\b/i.test(p)) return true;
  if (/(zalo|telegram|tele|t\.me|facebook|fb\.com|instagram|ig:|messenger|inbox|ib\s*(minh|em|anh)|ket\s*ban|kb\s*zl|sdt|so\s*dt)/i.test(p)) return true;
  return false;
}

export function unsafeText(s: string) {
  return profane(s) || contact(s);
}

/** Bình luận: trả về chuỗi an toàn để hiện, hoặc "" nếu phải ẩn (vẫn tính là tương tác) */
export function cleanChat(text: string) {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || unsafeText(t)) return "";
  return t;
}

const nameCache = new Map<string, string>();
/** Tên hiển thị: tên vi phạm → "Người xem #xxxx" (ổn định theo id), cắt bớt tên quá dài */
export function cleanName(name: string, id: string) {
  const key = id + "\u0000" + name;
  const hit = nameCache.get(key);
  if (hit) return hit;
  let out = name.replace(/\s+/g, " ").trim();
  if (!out || unsafeText(out)) {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    out = `Người xem #${(h % 9000) + 1000}`;
  } else if ([...out].length > 20) out = [...out].slice(0, 19).join("") + "…";
  if (nameCache.size > 5000) nameCache.clear();
  nameCache.set(key, out);
  return out;
}
