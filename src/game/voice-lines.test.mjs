import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BOSS_NAMES } from "../live/boss-catalog.ts";

// UFO thường (không có câu "trùm xuất hiện"); bosses.ts nạp ảnh nên không import được trong Node
const NORMAL = new Set(["ufo", "ufo2", "ufo3"]);
import { linesFor, VOICE_LINES } from "./voice-lines.ts";

const src = readFileSync(new URL("./game.ts", import.meta.url), "utf8");

test("mọi key game gọi đều có câu trong kịch bản", () => {
  const keys = new Set();
  for (const m of src.matchAll(/(?:sfx\.say|sayOnce)\(\s*"([a-z_0-9]+)"/g)) keys.add(m[1]);
  for (const m of src.matchAll(/"([a-z_0-9]+)"/g)) if (/^(win|win_boss|win_super|player_boss_down|player_boss_win|lose|record|mvp|gift_orbital|gift_cannon|gift_thanks)$/.test(m[1])) keys.add(m[1]);
  for (const id of Object.keys(BOSS_NAMES)) {
    keys.add(`lose_${id}`);
    if (!NORMAL.has(id)) {
      keys.add(`boss_${id}`);
      keys.add(`taunt_${id}`);
    }
  }
  const missing = [...keys].filter((k) => !linesFor(k).length);
  assert.deepEqual(missing, []);
});

test("tên file không trùng, chỉ chữ thường/số/gạch dưới; biến thể cùng key cùng speaker & prio", () => {
  const files = VOICE_LINES.map((l) => l.file);
  assert.equal(new Set(files).size, files.length);
  for (const f of files) assert.match(f, /^[a-z0-9_]+$/);
  for (const l of VOICE_LINES) {
    const first = linesFor(l.key)[0];
    assert.equal(l.prio, first.prio, l.file);
    assert.ok(l.v3.includes(l.text.slice(0, 8)) || l.v3.replace(/\[[^\]]*\]\s*/g, "") === l.text, l.file);
  }
});
