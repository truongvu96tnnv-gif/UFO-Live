/**
 * Bridge TikTok Live → game.
 *
 *   TikTok LIVE ──(tiktok-live-connector)──▶ bridge ──WebSocket /ws──▶ trang game (Browser Source trong OBS / LIVE Studio)
 *
 * - Chuẩn hoá sự kiện (vào phòng, tim, bình luận, quà, rương xu, follow, chia sẻ) về dạng LiveEvent của game.
 * - Quà combo (giftType 1) được TikTok gửi lặp lại với repeatCount tăng dần → bridge chỉ phát phần MỚI để tên lửa bắn ngay theo từng lần bấm.
 * - /avatar?u=… : proxy ảnh đại diện TikTok (chỉ các CDN của TikTok) để canvas cùng origin.
 * - POST /emit  : bơm sự kiện tay (thử nghiệm, hoặc nối webhook từ công cụ khác).
 * - Phục vụ bản build trong dist/ (npm run build).
 *
 * Chạy:  TIKTOK_USERNAME=ten_kenh npm run bridge      (hoặc: npm run bridge -- ten_kenh)
 * Tuỳ chọn: PORT (mặc định 8787), HOST (mặc định 127.0.0.1), SIGN_API_KEY (khoá Euler Stream nếu cần).
 */
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ControlEvent, TikTokLiveConnection, WebcastEvent } from "tiktok-live-connector";
import { WebSocket, WebSocketServer } from "ws";
import { sendBossCommand } from "./boss-command";
import { BOSS_NAMES, isBossId } from "../src/live/boss-catalog";
import { DEFAULT_CONTROL, parseControl, SimulatedPlayers } from "./control";
import { bindLiveEvents, lagStats, takeLag } from "./live";
import type { LiveEvent, LiveUser } from "../src/live/events";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";
let USERNAME = (process.argv[2] ?? process.env.TIKTOK_USERNAME ?? "").replace(/^@/, "").trim();
const SIGN_API_KEY = process.env.SIGN_API_KEY || undefined;
const DIST = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
/** thư mục lồng tiếng: thả file mp3/wav/ogg/m4a tên đúng như voice/voice-lines.csv, tải lại trang game là có tiếng */
const VOICE_DIR = resolve(fileURLToPath(new URL("../voice", import.meta.url)));
const VOICE_EXT = /\.(mp3|wav|ogg|m4a)$/i;

// ---------------- WebSocket tới trang game ----------------

const server = createServer((req, res) => {
  route(req, res).catch((err) => {
    console.error("[http]", err);
    if (!res.headersSent) res.writeHead(500).end("error");
  });
});
const wss = new WebSocketServer({ server, path: "/ws" });
let lastStatus: LiveEvent = { type: "status", state: "idle" };

/** đếm sự kiện theo loại (xem ở /health) để biết TikTok có đang gửi về không */
const counts: Record<string, number> = {};
let lastEventAt: string | null = null;
/** người xem gần đây: trang game mở lại / điện thoại tải lại vẫn thấy ngay bong bóng thay vì phòng trống */
// Silence is not a leave event. Retain the bounded roster until explicit removal or stream end.
const recent = new Map<string, LiveUser>();
const VERBOSE = process.env.LOG !== "0";
const ICON: Record<string, string> = { join: "👋", like: "❤️", chat: "💬", gift: "🎁", envelope: "📦", follow: "➕", share: "↗" };

let control = { ...DEFAULT_CONTROL };
let botAutoStopped = false;
const simulation = new SimulatedPlayers(broadcast, () => {
  control = { ...control, simulatedPlayers: 0 };
  botAutoStopped = true;
  broadcast({ type: "control", settings: control });
});
setInterval(() => simulation.tick(0.1), 100).unref();

function broadcast(e: LiveEvent) {
  if (e.type === "control" || e.type === "summonBoss") {
    // Settings are replayed separately to new game displays.
  } else if (e.type === "remove") {
    for (const id of e.ids) recent.delete(id);
  } else if (e.type === "status") {
    lastStatus = e;
    if (e.state === "offline") recent.clear();
  } else {
    if (e.type !== "presence" && !e.user.id.startsWith("sim:")) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
      lastEventAt = new Date().toISOString();
    }
    const previous = recent.get(e.user.id);
    recent.delete(e.user.id);
    recent.set(e.user.id, { ...e.user, avatar: e.user.avatar || previous?.avatar });
    if (recent.size > 30) recent.delete(recent.keys().next().value!);
    if (VERBOSE && e.type !== "presence" && !e.user.id.startsWith("sim:")) {
      const extra = e.type === "chat" ? `: ${e.text}` : e.type === "like" ? ` ×${e.count}` : e.type === "gift" ? `: ${e.gift} ×${e.count} (${e.coins} xu)` : e.type === "envelope" ? `: rương ${e.coins} xu` : "";
      const ms = takeLag();
      const lag = ms !== null ? ` (TikTok trễ ${(ms / 1000).toFixed(1)}s)` : "";
      console.log(`  ${ICON[e.type] ?? "•"} ${e.user.name}${extra}${lag}`);
    }
  }
  const msg = JSON.stringify(e);
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(msg);
}

wss.on("connection", (ws) => {
  ws.send(JSON.stringify(lastStatus));
  ws.send(JSON.stringify({ type: "control", settings: control }));
  const back = [...recent.values()].map((user) => ({ type: "presence", user }) as LiveEvent);
  if (back.length) ws.send(JSON.stringify(back));
  console.log(`[game] màn hình game kết nối (${wss.clients.size} đang mở)${back.length ? ` — gửi lại ${back.length} người xem gần đây` : ""}`);
});

// ---------------- HTTP ----------------

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".webmanifest": "application/manifest+json",
};

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://local");
  if (url.pathname === "/api/control") return controlRoute(req, res);
  if (url.pathname === "/control" || url.pathname === "/control/") {
    res.writeHead(302, { location: "/control.html" }).end();
    return;
  }
  if (url.pathname === "/avatar") return avatar(url.searchParams.get("u") ?? "", res);
  if (url.pathname === "/emit" && req.method === "POST") return emit(req, res);
  if (url.pathname === "/health") return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, username: USERNAME || null, status: lastStatus, roomId: roomIdNow, roomStatus, clients: wss.clients.size, viewers: viewerCount, events: counts, lastEventAt, tiktokLag: lagStats(), tiktokPackets: raw, lastPacketAt }));
  if (req.method !== "GET" && req.method !== "HEAD") return void res.writeHead(405).end();
  if (url.pathname.startsWith("/voice/")) return voiceRoute(decodeURIComponent(url.pathname.slice(7)), res);

  if (!existsSync(DIST)) {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("Chưa có bản build. Chạy `npm run build` (hoặc dùng `npm run dev` rồi mở http://localhost:5173).");
    return;
  }
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  let file = resolve(join(DIST, rel || "index.html"));
  if (!file.startsWith(DIST)) return void res.writeHead(403).end();
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, "index.html");
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": (file.endsWith(".html") || file.endsWith("control.js")) ? "no-cache" : "max-age=31536000" });
  createReadStream(file).pipe(res);
}

/** Bơm sự kiện tay: curl -X POST localhost:8787/emit -d '{"type":"gift","user":{"id":"a","name":"An"},"gift":"Rose","coins":1,"count":5}' */
async function emit(req: IncomingMessage, res: ServerResponse) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 64_000) return void res.writeHead(413).end();
  }
  try {
    const list = ([] as unknown[]).concat(JSON.parse(body));
    let n = 0;
    for (const raw of list) {
      const e = sanitize(raw);
      if (e) {
        broadcast(e);
        n++;
      }
    }
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ sent: n }));
  } catch {
    res.writeHead(400).end("JSON không hợp lệ");
  }
}

function sanitize(raw: unknown): LiveEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const u = r.user as Record<string, unknown> | undefined;
  const user: LiveUser | null = u && typeof u.id === "string" ? { id: u.id.slice(0, 80), name: String(u.name ?? u.id).slice(0, 60), avatar: typeof u.avatar === "string" ? u.avatar : undefined } : null;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  switch (r.type) {
    case "join":
    case "follow":
    case "share":
      return user ? { type: r.type, user } : null;
    case "like":
      return user ? { type: "like", user, count: Math.min(1000, Math.max(1, num(r.count, 1))) } : null;
    case "chat":
      return user ? { type: "chat", user, text: String(r.text ?? "").slice(0, 200) } : null;
    case "gift":
      // nhận cả "diamonds" (tên trường cũ) cho tương thích
      return user ? { type: "gift", user, gift: String(r.gift ?? "Quà").slice(0, 40), coins: Math.max(0, num(r.coins ?? r.diamonds, 1)), count: Math.min(10_000, Math.max(1, num(r.count, 1))) } : null;
    case "envelope":
      return user ? { type: "envelope", user, coins: Math.min(1_000_000, Math.max(1, num(r.coins, 1))) } : null;
    default:
      return null;
  }
}

// ---------------- proxy ảnh đại diện ----------------

const AVATAR_HOSTS = ["tiktokcdn.com", "tiktokcdn-us.com", "tiktokcdn-eu.com", "ibyteimg.com", "byteimg.com", "muscdn.com"];
const avatarCache = new Map<string, { type: string; body: Buffer }>();

async function avatar(u: string, res: ServerResponse) {
  let target: URL;
  try {
    target = new URL(u);
  } catch {
    return void res.writeHead(400).end();
  }
  const okHost = AVATAR_HOSTS.some((h) => target.hostname === h || target.hostname.endsWith("." + h));
  if (target.protocol !== "https:" || !okHost) return void res.writeHead(403).end();
  let hit = avatarCache.get(target.href);
  if (!hit) {
    const r = await fetch(target, { signal: AbortSignal.timeout(8000), redirect: "error" }).catch(() => null);
    const type = r?.headers.get("content-type") ?? "";
    if (!r || !r.ok || !type.startsWith("image/")) return void res.writeHead(502).end();
    const body = Buffer.from(await r.arrayBuffer());
    if (body.length > 2_000_000) return void res.writeHead(413).end();
    hit = { type, body };
    avatarCache.set(target.href, hit);
    if (avatarCache.size > 600) avatarCache.delete(avatarCache.keys().next().value!);
  }
  res.writeHead(200, { "content-type": hit.type, "cache-control": "max-age=86400" }).end(hit.body);
}

// ---------------- TikTok ----------------

/* Dữ liệu từ connector đi qua kiểu protobuf rất lớn; chỉ đọc vài trường nên dùng truy cập lỏng có kiểm tra. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

let conn: TikTokLiveConnection | null = null;
let viewerCount = 0;
/** chẩn đoán: phòng đang nối, trạng thái phòng (2 = đang live, 4 = đã kết thúc), mọi gói TikTok gửi về theo loại */
let roomIdNow: string | null = null;
let roomStatus: number | null = null;
const raw: Record<string, number> = {};
let lastPacketAt: string | null = null;
let lastPacketMs = 0;
let retry = 5000;
let generation = 0;

async function connectTikTok() {
  if (!USERNAME) return;
  const attempt = ++generation;
  conn?.removeAllListeners();
  try {
    await conn?.disconnect();
  } catch {
    /* đã đóng */
  }
  if (attempt !== generation) return;
  const c = new TikTokLiveConnection(USERNAME, { signApiKey: SIGN_API_KEY, enableExtendedGiftInfo: false });
  conn = c;
  // chẩn đoán: đếm mọi gói TikTok gửi về (xem /health → tiktokPackets) + canh chừng kết nối không có dữ liệu
  c.on(ControlEvent.DECODED_DATA, (type: string) => {
    if (conn !== c) return;
    if (!raw[type]) console.log(`[tiktok] gói đầu tiên loại ${type}`);
    raw[type] = (raw[type] ?? 0) + 1;
    lastPacketMs = Date.now();
    lastPacketAt = new Date().toISOString();
  });
  bindLiveEvents(c, broadcast, (count) => { viewerCount = count; simulation.observeViewers(count); });
  c.on(WebcastEvent.STREAM_END, () => {
    broadcast({ type: "status", state: "offline", detail: "live đã kết thúc" });
    schedule();
  });
  c.on(ControlEvent.DISCONNECTED, () => {
    if (conn !== c) return;
    broadcast({ type: "status", state: "disconnected", detail: "mất kết nối TikTok" });
    schedule();
  });
  c.on(ControlEvent.ERROR, (err: Loose) => console.error("[tiktok]", err?.info ?? err?.message ?? err));

  broadcast({ type: "status", state: "connecting", detail: `@${USERNAME}` });
  try {
    const state: Loose = await c.connect();
    if (conn !== c || attempt !== generation) return;
    retry = 5000;
    roomIdNow = String(state?.roomId ?? "") || null;
    roomStatus = Number(state?.roomInfo?.status ?? state?.roomInfo?.data?.status) || null;
    lastPacketMs = Date.now();
    lastCheckMs = Date.now();
    const title = state?.roomInfo?.title ?? state?.roomInfo?.data?.title;
    console.log(`[tiktok] đã kết nối @${USERNAME} (room ${roomIdNow ?? "?"}${roomStatus ? `, trạng thái ${roomStatus === 2 ? "ĐANG LIVE" : roomStatus === 4 ? "ĐÃ KẾT THÚC" : roomStatus}` : ""}${title ? `, "${title}"` : ""})`);
    if (roomStatus === 4) console.log("[tiktok] ⚠ phòng này đã kết thúc — có thể đang nối vào phiên live cũ, sẽ thử lại");
    broadcast({ type: "status", state: "connected" });
  } catch (err: Loose) {
    if (conn !== c || attempt !== generation) return;
    const msg = String(err?.message ?? err);
    console.error(`[tiktok] kết nối thất bại: ${msg}`);
    broadcast({ type: "status", state: /offline|not.*live/i.test(msg) ? "offline" : "error", detail: msg.slice(0, 80) });
    schedule();
  }
}

// Canh chừng: phòng live ít người có thể im lặng vài phút — im lặng KHÔNG phải mất kết nối, nên không nối lại vì im.
// Chỉ khi đã im ≥ 60 giây mới hỏi TikTok (tối đa 1 lần / phút): kết nối còn sống không, kênh còn live không,
// và mã phòng hiện tại có đổi không (tắt live rồi phát lại → phòng mới). Đổi phòng / chết kết nối → nối lại.
let checking = false;
let lastCheckMs = 0;
setInterval(async () => {
  const c = conn;
  if (!c || checking || lastStatus.type !== "status" || lastStatus.state !== "connected") return;
  if (Date.now() - lastPacketMs < 60_000 || Date.now() - lastCheckMs < 60_000) return;
  checking = true;
  lastCheckMs = Date.now();
  try {
    let reason = "";
    if (!c.isConnected) reason = "kết nối đã đóng";
    else {
      const live = await c.fetchIsLive().catch(() => null);
      if (live === false) reason = "kênh không còn live";
      else {
        const room = await c.fetchRoomId().catch(() => "");
        if (room && roomIdNow && room !== roomIdNow) reason = `phòng mới ${room}`;
      }
    }
    if (conn !== c) return;
    if (reason) {
      console.log(`[tiktok] ⚠ ${reason} — nối lại`);
      broadcast({ type: "status", state: "connecting", detail: reason });
      retry = 5000;
      void connectTikTok();
    } else if (VERBOSE) console.log(`[tiktok] phòng đang yên lặng ${Math.round((Date.now() - lastPacketMs) / 1000)}s — kết nối vẫn ổn`);
  } finally {
    checking = false;
  }
}, 15_000).unref();

let pending: NodeJS.Timeout | null = null;
function schedule() {
  if (pending || !USERNAME) return;
  console.log(`[tiktok] thử lại sau ${retry / 1000}s`);
  pending = setTimeout(() => {
    pending = null;
    void connectTikTok();
  }, retry);
  retry = Math.min(60_000, retry * 2);
}

server.listen(PORT, HOST, () => {
  console.log(`UFO Live bridge: http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  console.log(`  Điều khiển: http://localhost:${PORT}/control`);
  console.log(`  Browser Source (1080×1920): http://localhost:${PORT}/`);
  if (USERNAME) void connectTikTok();
  else console.log("  Chưa đặt TIKTOK_USERNAME — chỉ phục vụ trang game và POST /emit.");
});

/** /voice/manifest.json = danh sách file đang có (quét mỗi lần gọi); /voice/<file> = file âm thanh */
function voiceRoute(name: string, res: ServerResponse) {
  if (name === "manifest.json") {
    const files = existsSync(VOICE_DIR) ? readdirSync(VOICE_DIR).filter((f) => VOICE_EXT.test(f)).sort() : [];
    return void res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify({ files }));
  }
  if (!VOICE_EXT.test(name) || name.includes("/") || name.includes("\\") || name.includes("..")) return void res.writeHead(404).end();
  const file = join(VOICE_DIR, name);
  if (!existsSync(file)) return void res.writeHead(404).end();
  const type = { ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".m4a": "audio/mp4" }[extname(file).toLowerCase()] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
  createReadStream(file).pipe(res);
}

async function controlRoute(req: IncomingMessage, res: ServerResponse) {
  const respond = (code: number, data: unknown) => res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(data));
  const snapshot = () => ({ settings: control, username: USERNAME, status: lastStatus, viewers: viewerCount, clients: wss.clients.size, events: counts, lastEventAt, botAutoStopped, bosses: Object.entries(BOSS_NAMES).map(([id, name]) => ({ id, name })) });
  if (req.method === "GET") return void respond(200, snapshot());
  if (req.method !== "POST") return void respond(405, { error: "Method not allowed" });
  if (!req.headers["content-type"]?.startsWith("application/json")) return void respond(415, { error: "JSON required" });
  if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return void respond(403, { error: "Origin not allowed" });
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 4096) return void respond(413, { error: "Request too large" });
  }
  try {
    const data = JSON.parse(body);
    if (data.action === "settings") {
      const next = parseControl(data.settings, control);
      simulation.autoStop = next.autoStop;
      simulation.configure(next.simulatedPlayers, next.intensity);
      control = next;
      // vừa bật "tự tắt" mà đang vượt ngưỡng → áp dụng ngay
      if (control.autoStop) simulation.observeViewers(viewerCount);
      if (control.simulatedPlayers > 0) botAutoStopped = false;
      broadcast({ type: "control", settings: control });
    } else if (data.action === "summonBoss") {
      if (!isBossId(data.bossId)) throw new Error("Boss không hợp lệ");
      if (![...wss.clients].some(client => client.readyState === WebSocket.OPEN)) {
        return void respond(409, { error: "Chưa có màn hình game kết nối. Hãy mở màn hình game trước." });
      }
      try {
        const bossResult = await sendBossCommand(wss.clients, data.bossId);
        return void respond(200, { ...snapshot(), bossResult });
      } catch (error) {
        return void respond(504, { error: error instanceof Error ? error.message : "Game không phản hồi" });
      }
    } else if (data.action === "connect") {
      if (typeof data.username !== "string" || !/^@?[a-zA-Z0-9_.]{1,64}$/.test(data.username.trim())) throw new Error("Nhập username TikTok, không nhập đường dẫn");
      USERNAME = data.username.trim().replace(/^@/, "");
      if (pending) clearTimeout(pending);
      pending = null;
      retry = 5000;
      broadcast({ type: "remove", ids: [...recent.keys()].filter(id => !id.startsWith("sim:")) });
      viewerCount = 0;
      simulation.observeViewers(0);
      void connectTikTok();
    } else if (data.action === "disconnect") {
      USERNAME = "";
      generation++;
      if (pending) clearTimeout(pending);
      pending = null;
      const old = conn;
      conn = null;
      old?.removeAllListeners();
      await old?.disconnect();
      viewerCount = 0;
      simulation.observeViewers(0);
      broadcast({ type: "remove", ids: [...recent.keys()].filter(id => !id.startsWith("sim:")) });
      broadcast({ type: "status", state: "idle", detail: "đã ngắt kết nối" });
    } else throw new Error("Lệnh không hợp lệ");
    respond(200, snapshot());
  } catch (err) {
    respond(400, { error: err instanceof Error ? err.message : "Lệnh không hợp lệ" });
  }
}
