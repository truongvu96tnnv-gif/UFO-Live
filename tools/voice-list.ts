// Xuất kịch bản lồng tiếng ra voice/voice-lines.csv (mở bằng Excel/Google Sheets) và voice/KICH-BAN.md (đọc nhanh).
//   npm run voice:list
import { mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VOICE_LINES, type Speaker } from "../src/game/voice-lines";

const DIR = resolve(fileURLToPath(new URL("../voice", import.meta.url)));
mkdirSync(DIR, { recursive: true });
const have = new Set(existsSync(DIR) ? readdirSync(DIR).map((f) => f.replace(/\.(mp3|wav|ogg|m4a)$/i, "")) : []);

const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
const csv = [
  ["file", "speaker", "event", "text", "text_v3", "direction"].join(","),
  ...VOICE_LINES.map((l) => [`${l.file}.mp3`, l.speaker, l.key, l.text, l.v3, l.note].map(esc).join(",")),
].join("\r\n");
// BOM để Excel đọc đúng tiếng Việt
writeFileSync(join(DIR, "voice-lines.csv"), "﻿" + csv + "\r\n");

const WHO: Record<Speaker, string> = { mc: "🎙 Bình luận viên (mc)", ufo: "👽 Giọng trùm (ufo)" };
const md: string[] = [
  "# Kịch bản lồng tiếng — Bảo Vệ Trái Đất",
  "",
  `${VOICE_LINES.length} câu · bình luận viên ${VOICE_LINES.filter((l) => l.speaker === "mc").length} · giọng trùm ${VOICE_LINES.filter((l) => l.speaker === "ufo").length}. Tệp này được tạo tự động từ \`src/game/voice-lines.ts\` (\`npm run voice:list\`) — sửa câu ở đó rồi chạy lại.`,
  "",
  "## Cách dùng",
  "",
  "1. Gen tiếng từng câu trong ElevenLabs (cột **Lời thoại**; nếu dùng model **Eleven v3** thì dán cột **Lời v3** có thẻ cảm xúc như `[excited]`, `[shouts]`).",
  "2. Tải về **mp3**, đặt tên **đúng cột Tên file** (vd. `round_start_1.mp3`), bỏ vào thư mục `voice/` này. Cũng nhận `.wav`, `.ogg`, `.m4a`.",
  "3. Tải lại trang game (bridge phải đang chạy) — game tự nhận file, câu nào chưa có thì bỏ qua.",
  "",
  "Hoặc gen tự động cả bộ: `npm run voice:gen` (xem cuối trang).",
  "",
  "## Gợi ý giọng",
  "",
  "- **mc — Bình luận viên**: tạo bằng *Voice Design* với mô tả: _“Energetic young Vietnamese male esports caster, clear Northern Vietnamese accent, fast and hype, crisp studio microphone”_ (hoặc chọn 1 giọng Việt sôi nổi trong Voice Library).",
  "- **ufo — Giọng trùm**: _“Deep, slow, menacing alien overlord speaking Vietnamese, gravelly and slightly metallic, cinematic villain, lots of gravitas”_. Game tự thêm vang cho giọng này.",
  "- Đọc **chậm vừa phải, rõ chữ**; mỗi câu nên dưới 4 giây (riêng `countdown` ~3 giây: “Ba… hai… một…”).",
  "- Âm lượng các file nên đều nhau (ElevenLabs mặc định đã ổn). Trong game chỉnh to/nhỏ bằng `?voice=0.8`; `?voice=0` tắt lồng tiếng.",
  "",
];
for (const sp of ["mc", "ufo"] as Speaker[]) {
  md.push(`## ${WHO[sp]}`, "", "| | Tên file | Khi nào | Lời thoại | Lời v3 (Eleven v3) | Cách đọc |", "|---|---|---|---|---|---|");
  for (const l of VOICE_LINES.filter((x) => x.speaker === sp)) {
    md.push(`| ${have.has(l.file) ? "✅" : "⬜"} | \`${l.file}.mp3\` | \`${l.key}\` | ${l.text} | ${l.v3} | ${l.note} |`);
  }
  md.push("");
}
md.push(
  "## Gen tự động bằng API ElevenLabs",
  "",
  "PowerShell (thay khoá & mã giọng — lấy *Voice ID* trong trang giọng của ElevenLabs):",
  "",
  "```powershell",
  '$env:ELEVENLABS_API_KEY="sk_..."; $env:ELEVEN_VOICE_MC="voice_id_mc"; $env:ELEVEN_VOICE_UFO="voice_id_ufo"; npm.cmd run voice:gen',
  "```",
  "",
  "- Mặc định model `eleven_v3` (dùng cột Lời v3). Đổi model: `$env:ELEVEN_MODEL=\"eleven_multilingual_v2\"` (tự dùng cột Lời thoại, bỏ thẻ cảm xúc).",
  "- File đã có thì bỏ qua; gen lại: thêm `-- --force`. Chỉ gen 1 nhóm: `-- --only lose_` (theo tiền tố tên file).",
  "- Mỗi câu tốn ký tự trong gói ElevenLabs của bạn; cả bộ khoảng " + VOICE_LINES.reduce((n, l) => n + l.v3.length, 0) + " ký tự.",
  "",
);
writeFileSync(join(DIR, "KICH-BAN.md"), md.join("\n"));
console.log(`voice/voice-lines.csv + voice/KICH-BAN.md — ${VOICE_LINES.length} câu, đã có ${VOICE_LINES.filter((l) => have.has(l.file)).length} file`);
