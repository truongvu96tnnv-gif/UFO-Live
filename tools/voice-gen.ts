// Gen cả bộ lồng tiếng qua API ElevenLabs → voice/<file>.mp3
//   ELEVENLABS_API_KEY=... ELEVEN_VOICE_MC=<voice id> ELEVEN_VOICE_UFO=<voice id> npm run voice:gen
//   tuỳ chọn: ELEVEN_MODEL (mặc định eleven_v3) · -- --force (gen lại file đã có) · -- --only <tiền tố tên file>
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VOICE_LINES } from "../src/game/voice-lines";

const DIR = resolve(fileURLToPath(new URL("../voice", import.meta.url)));
const KEY = process.env.ELEVENLABS_API_KEY;
const VOICES = { mc: process.env.ELEVEN_VOICE_MC, ufo: process.env.ELEVEN_VOICE_UFO };
const MODEL = process.env.ELEVEN_MODEL || "eleven_v3";
const force = process.argv.includes("--force");
const oi = process.argv.indexOf("--only");
const only = oi >= 0 ? process.argv[oi + 1] ?? "" : "";

if (!KEY) {
  console.error("Thiếu ELEVENLABS_API_KEY (khoá API trong ElevenLabs → Profile → API Keys).");
  process.exit(1);
}
mkdirSync(DIR, { recursive: true });

const todo = VOICE_LINES.filter((l) => (!only || l.file.startsWith(only)) && (force || !existsSync(join(DIR, `${l.file}.mp3`))));
const missing = [...new Set(todo.map((l) => l.speaker))].filter((s) => !VOICES[s]);
if (missing.length) {
  console.error(`Thiếu mã giọng cho: ${missing.map((s) => (s === "mc" ? "ELEVEN_VOICE_MC" : "ELEVEN_VOICE_UFO")).join(", ")}`);
  process.exit(1);
}
const v3 = MODEL.startsWith("eleven_v3");
console.log(`${todo.length} câu cần gen · model ${MODEL}`);

let ok = 0;
for (const [i, l] of todo.entries()) {
  // model không phải v3 sẽ đọc to cả thẻ [excited] → dùng lời không thẻ
  const text = v3 ? l.v3 : l.text.replace(/\[[^\]]*\]\s*/g, "");
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICES[l.speaker]}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": KEY, "content-type": "application/json", accept: "audio/mpeg" },
        body: JSON.stringify({ text, model_id: MODEL, ...(process.env.ELEVEN_LANG ? { language_code: process.env.ELEVEN_LANG } : {}) }),
      });
      if (r.status === 429 && attempt < 3) {
        await new Promise((res) => setTimeout(res, 4000 * attempt));
        continue;
      }
      if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
      writeFileSync(join(DIR, `${l.file}.mp3`), Buffer.from(await r.arrayBuffer()));
      ok++;
      console.log(`  [${i + 1}/${todo.length}] ✅ ${l.file}.mp3 — ${l.text}`);
      break;
    } catch (e) {
      if (attempt === 3) console.error(`  [${i + 1}/${todo.length}] ❌ ${l.file}: ${e instanceof Error ? e.message : e}`);
    }
  }
}
console.log(`Xong ${ok}/${todo.length}. Tải lại trang game để nghe (bridge đang chạy).`);
