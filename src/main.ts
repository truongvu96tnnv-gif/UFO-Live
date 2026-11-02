import { balanceFromQuery } from "./game/balance";
import { fontsReady } from "./game/font";
import type { BossId } from "./game/bosses";
import { GIFTS } from "./game/gifts";
import { Game, type Phase } from "./game/game";
import { H, W } from "./game/stage";
import { DemoCrowd } from "./live/demo";
import { addBannedWords } from "./live/filter";
import type { LiveEvent, LiveUser } from "./live/events";
import { connectBridge } from "./live/socket";
import { mountDemoPanel } from "./ui/panel";

// Bản nhúng (vd trang chơi thử) có thể đặt sẵn tham số qua window.UFO_PRESET thay cho query string
const preset = (window as unknown as { UFO_PRESET?: string }).UFO_PRESET;
const q = new URLSearchParams(preset ?? location.search);
await fontsReady();
const game = new Game(balanceFromQuery(q));
game.sfx.muted = q.get("mute") === "1";
game.sfx.musicOn = q.get("music") !== "0";
if (q.get("vol")) game.sfx.musicLevel = Math.max(0, Math.min(1, +q.get("vol")! || 0.5));
// OBS / TikTok LIVE Studio cho phát tiếng ngay; trình duyệt thường thì chờ lần chạm/phím đầu tiên
game.sfx.unlock();

const canvas = document.createElement("canvas");
canvas.width = W;
canvas.height = H;
document.body.appendChild(canvas);
const ctx = canvas.getContext("2d")!;

/** co giãn giữ tỉ lệ 9:16, nền đen hai bên (Browser Source 1080×1920 thì vừa khít) */
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  canvas.style.width = `${W * s}px`;
  canvas.style.height = `${H * s}px`;
  canvas.style.left = `${(innerWidth - W * s) / 2}px`;
  canvas.style.top = `${(innerHeight - H * s) / 2}px`;
}
addEventListener("resize", fit);
fit();

const sink = (e: LiveEvent) => game.handle(e);

// Nguồn sự kiện: ?demo=1 → người xem giả lập; mặc định → bridge TikTok qua WebSocket (cùng host, đường dẫn /ws)
const demo = new DemoCrowd(sink);
const demoOn = q.get("demo") === "1";
game.demo = demoOn;
if (demoOn) {
  demo.level = Math.min(3, Math.max(0, +(q.get("crowd") ?? 1) || 0));
  demo.start();
}
// Đang nối TikTok thật → KHOÁ mọi thứ tạo tương tác giả: không bật được người xem giả, phím tắt không bơm tim/quà/rương,
// không ép thắng/thua. (?keys=1 mở lại để thử bridge khi chưa lên live.)
const liveMode = q.get("ws") !== "0" && !demoOn;
const fakeOk = !liveMode || q.get("keys") === "1";
game.showChat = q.get("bubbles") !== "0";
addBannedWords(q.get("ban"));
if (liveMode) {
  const url = q.get("ws") ?? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
  connectBridge(url, sink);
}

// ---------------- phím tắt cho người vận hành (OBS: chuột phải Browser Source → Interact) ----------------
const me: LiveUser = { id: "host", name: "Chủ phòng", avatar: "demo:140" };
const help = document.getElementById("help")!;
help.innerHTML = [
  "<b>BẢO VỆ TRÁI ĐẤT</b> — phím tắt",
  ...(fakeOk ? [] : ["<b>ĐANG NỐI LIVE THẬT</b>: các phím tạo tương tác giả (L C E G F S J 1–8) và ép kết quả (K N D) đã bị khoá"]),
  "L: tim ×10 · C: bình luận · G: bảng quà · E: rương 199 xu",
  "Quà: 1 hoa hồng ×5 · 2 tim ngón tay · 3 nước hoa · 4 pháo giấy · 5 kính râm · 6 súng bắn tiền · 7 thiên hà · 8 vũ trụ",
  "F: follow · S: chia sẻ · J: thêm người xem giả",
  "D: bật/tắt người xem giả · [ ]: độ đông demo",
  "R: chơi lại từ đầu (xoá tỉ số & chuỗi) · B: chọn trùm cho vòng sau (bấm tiếp để đổi) · N: qua pha tiếp · K: cho thua ngay (xem cảnh hạ đất)",
  "M: tắt/bật toàn bộ âm thanh · U: tắt/bật nhạc nền · H: ẩn/hiện bảng này",
].join("\n");
/** phím bơm tương tác giả / ép kết quả — bị khoá khi đang nối TikTok thật */
const FAKE_KEYS = new Set(["l", "c", "e", "g", "f", "s", "j", "k", "n", "d", "[", "]"]);
const GIFT_KEYS: Record<string, [string, number]> = {
  "1": ["rose", 5],
  "2": ["fingerheart", 1],
  "3": ["perfume", 1],
  "4": ["confetti", 1],
  "5": ["sunglasses", 1],
  "6": ["moneygun", 1],
  "7": ["galaxy", 1],
  "8": ["universe", 1],
};
let joinN = 0;
addEventListener("keydown", (e) => {
  game.sfx.unlock();
  const k = e.key.toLowerCase();
  if (k === "h") help.style.display = help.style.display === "block" ? "none" : "block";
  else if (!fakeOk && (FAKE_KEYS.has(k) || GIFT_KEYS[k])) return; // live thật: phím tạo tương tác giả bị khoá
  else if (k === "l") sink({ type: "like", user: me, count: 10 });
  else if (k === "c") sink({ type: "chat", user: me, text: "bắn!!!" });
  else if (GIFT_KEYS[k]) {
    const [key, count] = GIFT_KEYS[k];
    const g = GIFTS.find((x) => x.key === key)!;
    sink({ type: "gift", user: me, gift: g.name, coins: g.coins, count });
  } else if (k === "e") sink({ type: "envelope", user: me, coins: 199 });
  else if (k === "g") panel.toggleGifts();
  else if (k === "f") sink({ type: "follow", user: me });
  else if (k === "s") sink({ type: "share", user: me });
  else if (k === "j") sink({ type: "join", user: { id: `guest-${++joinN}`, name: `Khách ${joinN}`, avatar: `demo:${(joinN * 67) % 360}` } });
  else if (k === "r") game.restart();
  else if (k === "b") game.cycleBoss();
  else if (k === "k" && (game.phase === "intro" || game.phase === "battle")) game.debugPhase("lose");
  else if (k === "m") game.sfx.muted = !game.sfx.muted;
  else if (k === "u") game.sfx.musicOn = !game.sfx.musicOn;
  else if (k === "n") {
    const order: Phase[] = ["intro", "battle", "win", "break"];
    game.debugPhase(order[(order.indexOf(game.phase) + 1) % order.length]);
  } else if (k === "d") {
    game.demo = !game.demo;
    panel.show(game.demo);
    if (game.demo) demo.start();
    else demo.stop();
  } else if (k === "[") demo.level = Math.max(0, demo.level - 1);
  else if (k === "]") demo.level = Math.min(3, demo.level + 1);
});
addEventListener("pointerdown", () => game.sfx.unlock());
// chế độ demo: chạm vào màn hình = thả tim, thanh nút + bảng quà để thử trên điện thoại
const you: LiveUser = { id: "you", name: "Bạn", avatar: "demo:200" };
// nút "Gọi trùm": đánh ngay trùm kế tiếp trong danh sách để xem model & kỹ năng
const BOSS_ORDER: BossId[] = ["ufo", "ufo2", "ufo3", "gold", "octopus", "stealth", "spider", "devourer", "crystal", "mother", "planet", "dragon"];
let bossI = -1;
// lời nhắc bật âm thanh (trình duyệt chặn tiếng tới khi người xem chạm)
const hint = document.createElement("button");
hint.type = "button";
hint.textContent = "🔊 Chạm để bật âm thanh";
hint.style.cssText = "position:fixed;left:50%;top:calc(12px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:7;padding:10px 16px;border-radius:999px;border:1px solid #ffd55a;background:rgba(8,12,28,.9);color:#ffd55a;font:600 15px 'Chakra Petch',system-ui,sans-serif;cursor:pointer";
hint.addEventListener("click", () => game.sfx.unlock());
document.body.appendChild(hint);
const hideHint = () => {
  if (game.sfx.running || game.sfx.muted) hint.remove();
  else setTimeout(hideHint, 400);
};
hideHint();

const panel = mountDemoPanel(sink, you, () => game.sfx.unlock(), () => {
  bossI = (bossI + 1) % BOSS_ORDER.length;
  game.debugBoss(BOSS_ORDER[bossI]);
}, () => {
  game.sfx.unlock();
  game.sfx.musicOn = !game.sfx.musicOn;
  return game.sfx.musicOn;
}, () => {
  // xem ngay cảnh hạ đất của trùm đang đánh
  game.sfx.unlock();
  if (game.phase === "intro" || game.phase === "battle") game.debugPhase("lose");
});
panel.show(game.demo);
canvas.addEventListener("pointerdown", () => {
  if (game.demo) sink({ type: "like", user: you, count: 5 });
});

// ---------------- vòng lặp ----------------
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  game.draw(ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// cho trang thử tự động / bảng chẩn đoán
(window as unknown as { __game: Game; __sink: typeof sink }).__game = game;
(window as unknown as { __sink: typeof sink }).__sink = sink;
