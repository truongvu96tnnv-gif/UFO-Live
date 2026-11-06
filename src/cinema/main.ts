// Khởi động trang Rạp Chiếu Phim Tương Tác (cinema.html): co giãn 9:16, nối bridge, phím tắt, vòng lặp.
import { fontsReady } from "../game/font";
import { H, W } from "../game/stage";
import { DemoCrowd } from "../live/demo";
import type { LiveEvent, LiveUser } from "../live/events";
import { addBannedWords } from "../live/filter";
import { connectBridge } from "../live/socket";
import { Cinema, cinemaConfigFromQuery } from "./cinema";

const q = new URLSearchParams(location.search);
await fontsReady();
const cinema = new Cinema(cinemaConfigFromQuery(q));
cinema.audio.muted = q.get("mute") === "1";
cinema.audio.musicOn = q.get("music") !== "0";
cinema.showChat = q.get("bubbles") !== "0";
addBannedWords(q.get("ban"));
cinema.audio.unlock();

const canvas = document.createElement("canvas");
canvas.width = W;
canvas.height = H;
canvas.style.position = "fixed";
const cover = q.get("fit") === "cover";
function fit() {
  const vw = document.documentElement.clientWidth || innerWidth;
  const vh = document.documentElement.clientHeight || innerHeight;
  const s = cover ? Math.max(vw / W, vh / H) : Math.min(vw / W, vh / H);
  canvas.style.width = `${W * s}px`;
  canvas.style.height = `${H * s}px`;
  canvas.style.left = `${(vw - W * s) / 2}px`;
  canvas.style.top = `${(vh - H * s) / 2}px`;
}
addEventListener("resize", fit);
visualViewport?.addEventListener("resize", fit);
document.addEventListener("fullscreenchange", () => setTimeout(fit, 50));
fit();
document.body.appendChild(canvas);
const ctx = canvas.getContext("2d")!;

const sink = (e: LiveEvent) => cinema.handle(e);
const demoOn = q.get("demo") === "1";
const demo = new DemoCrowd(sink, () => cinema.demoChat());
cinema.demo = demoOn;
if (demoOn) {
  demo.level = Math.min(3, Math.max(0, +(q.get("crowd") ?? 1) || 0));
  demo.start();
}
// Đang nối TikTok thật → khoá phím tạo tương tác giả (?keys=1 mở lại để thử khi chưa lên live)
const liveMode = q.get("ws") !== "0" && !demoOn;
const fakeOk = !liveMode || q.get("keys") === "1";
if (q.get("ws") !== "0" && (location.protocol !== "file:" || q.has("ws"))) {
  const url = q.get("ws") ?? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
  connectBridge(url, (event) => {
    if (demoOn && event.type !== "control" && event.type !== "summonBoss") return;
    sink(event);
  });
}

// ---------------- phím tắt người vận hành ----------------
const me: LiveUser = { id: "host", name: "Chủ phòng", avatar: "demo:140" };
const help = document.getElementById("help")!;
help.innerHTML = [
  "<b>RẠP PHIM LIVE</b> — phím tắt",
  ...(fakeOk ? [] : ["<b>ĐANG NỐI LIVE THẬT</b>: phím tạo tương tác giả (1 2 L C G F D) đã bị khoá"]),
  "1 / 2: bình chọn · L: tim ×10 · C: bình luận “haha” · G: quà 100 xu · F: follow",
  "N: qua pha tiếp (bỏ qua cảnh / chốt bình chọn) · P: đổi sang phim kế tiếp",
  "D: bật/tắt người xem giả · [ ]: độ đông demo",
  "M: tắt/bật âm thanh · U: tắt/bật nhạc · H: ẩn/hiện bảng này",
].join("\n");
const FAKE = new Set(["1", "2", "l", "c", "g", "f", "d", "[", "]"]);
addEventListener("keydown", (e) => {
  cinema.audio.unlock();
  const k = e.key.toLowerCase();
  if (k === "h") help.style.display = help.style.display === "block" ? "none" : "block";
  else if (!fakeOk && FAKE.has(k)) return;
  else if (k === "1" || k === "2") sink({ type: "chat", user: me, text: k });
  else if (k === "l") sink({ type: "like", user: me, count: 10 });
  else if (k === "c") sink({ type: "chat", user: me, text: "hahaha" });
  else if (k === "g") sink({ type: "gift", user: me, gift: "Pháo giấy", coins: 100, count: 1 });
  else if (k === "f") sink({ type: "follow", user: me });
  else if (k === "n") cinema.skip();
  else if (k === "p") cinema.nextFilm();
  else if (k === "m") cinema.audio.muted = !cinema.audio.muted;
  else if (k === "u") cinema.audio.musicOn = !cinema.audio.musicOn;
  else if (k === "d") {
    cinema.demo = !cinema.demo;
    pad.style.display = cinema.demo ? "flex" : "none";
    if (cinema.demo) demo.start();
    else demo.stop();
  } else if (k === "[") demo.level = Math.max(0, demo.level - 1);
  else if (k === "]") demo.level = Math.min(3, demo.level + 1);
});
addEventListener("pointerdown", () => cinema.audio.unlock());

// thanh nút thử (chỉ chế độ demo — không phát trang demo lên live)
const you: LiveUser = { id: "you", name: "Bạn", avatar: "demo:200" };
const pad = document.createElement("div");
pad.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:4;display:flex;flex-wrap:wrap;gap:8px;justify-content:center;padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px));background:linear-gradient(to top,rgba(0,0,0,.85),rgba(0,0,0,0))";
const BUTTONS: [string, () => void][] = [
  ["1️⃣ Chọn 1", () => sink({ type: "chat", user: you, text: "1" })],
  ["2️⃣ Chọn 2", () => sink({ type: "chat", user: you, text: "2" })],
  ["❤️ Tim", () => sink({ type: "like", user: you, count: 10 })],
  ["😂 Haha", () => sink({ type: "chat", user: you, text: "hahaha" })],
  ["🌹 Hoa hồng", () => sink({ type: "gift", user: you, gift: "Hoa hồng", coins: 1, count: 5 })],
  ["🎉 Quà 100 xu", () => sink({ type: "gift", user: you, gift: "Pháo giấy", coins: 100, count: 1 })],
  ["➕ Follow", () => sink({ type: "follow", user: you })],
  ["⏭ Tiếp", () => cinema.skip()],
  ["🎞 Phim khác", () => cinema.nextFilm()],
  ["🎵 Nhạc", () => (cinema.audio.musicOn = !cinema.audio.musicOn)],
];
for (const [text, act] of BUTTONS) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  b.style.cssText = "font:600 14px/1 'Chakra Petch',system-ui,sans-serif;color:#e8eeff;background:rgba(8,12,28,.88);border:1px solid #2c3a66;border-radius:999px;padding:10px 14px;cursor:pointer";
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    cinema.audio.unlock();
    act();
  });
  pad.appendChild(b);
}
pad.style.display = cinema.demo ? "flex" : "none";
document.body.appendChild(pad);
canvas.addEventListener("pointerdown", () => {
  if (cinema.demo) sink({ type: "like", user: you, count: 5 });
});

// lời nhắc bật âm thanh (trình duyệt chặn tiếng tới khi người dùng chạm)
const hint = document.createElement("button");
hint.type = "button";
hint.textContent = "🔊 Chạm để bật âm thanh";
hint.style.cssText = "position:fixed;left:50%;top:calc(12px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:7;padding:10px 16px;border-radius:999px;border:1px solid #ffd55a;background:rgba(8,12,28,.9);color:#ffd55a;font:600 15px 'Chakra Petch',system-ui,sans-serif;cursor:pointer";
hint.addEventListener("click", () => cinema.audio.unlock());
document.body.appendChild(hint);
const hideHint = () => {
  if (cinema.audio.running || cinema.audio.muted) hint.remove();
  else setTimeout(hideHint, 400);
};
hideHint();

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  cinema.update(dt);
  cinema.draw(ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

(window as unknown as { __cinema: Cinema; __sink: typeof sink }).__cinema = cinema;
(window as unknown as { __sink: typeof sink }).__sink = sink;
