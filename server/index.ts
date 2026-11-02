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
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ControlEvent, TikTokLiveConnection, WebcastEvent } from "tiktok-live-connector";
import { WebSocket, WebSocketServer } from "ws";
import type { LiveEvent, LiveUser } from "../src/live/events";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";
const USERNAME = (process.argv[2] ?? process.env.TIKTOK_USERNAME ?? "").replace(/^@/, "").trim();
const SIGN_API_KEY = process.env.SIGN_API_KEY || undefined;
const DIST = resolve(fileURLToPath(new URL("../dist", import.meta.url)));

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
const recent = new Map<string, LiveUser>();
const VERBOSE = process.env.LOG !== "0";
const ICON: Record<string, string> = { join: "👋", like: "❤️", chat: "💬", gift: "🎁", envelope: "📦", follow: "➕", share: "↗" };

function broadcast(e: LiveEvent) {
  if (e.type === "status") lastStatus = e;
  else {
    counts[e.type] = (counts[e.type] ?? 0) + 1;
    lastEventAt = new Date().toISOString();
    recent.delete(e.user.id);
    recent.set(e.user.id, e.user);
    if (recent.size > 30) recent.delete(recent.keys().next().value!);
    if (VERBOSE) {
      const extra = e.type === "chat" ? `: ${e.text}` : e.type === "like" ? ` ×${e.count}` : e.type === "gift" ? `: ${e.gift} ×${e.count} (${e.coins} xu)` : e.type === "envelope" ? `: rương ${e.coins} xu` : "";
      console.log(`  ${ICON[e.type] ?? "•"} ${e.user.name}${extra}`);
    }
  }
  const msg = JSON.stringify(e);
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(msg);
}

wss.on("connection", (ws) => {
  ws.send(JSON.stringify(lastStatus));
  const back = [...recent.values()].map((user) => ({ type: "join", user }) as LiveEvent);
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
  if (url.pathname === "/avatar") return avatar(url.searchParams.get("u") ?? "", res);
  if (url.pathname === "/emit" && req.method === "POST") return emit(req, res);
  if (url.pathname === "/health") return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, username: USERNAME || null, status: lastStatus, roomId: roomIdNow, roomStatus, clients: wss.clients.size, viewers: viewerCount, events: counts, lastEventAt, tiktokPackets: raw, lastPacketAt }));
  if (req.method !== "GET" && req.method !== "HEAD") return void res.writeHead(405).end();

  if (!existsSync(DIST)) {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("Chưa có bản build. Chạy `npm run build` (hoặc dùng `npm run dev` rồi mở http://localhost:5173).");
    return;
  }
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  let file = resolve(join(DIST, rel || "index.html"));
  if (!file.startsWith(DIST)) return void res.writeHead(403).end();
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, "index.html");
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": file.endsWith("index.html") ? "no-cache" : "max-age=31536000" });
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

function toUser(u: Loose): LiveUser | null {
  if (!u) return null;
  const id = String(u.uniqueId || u.userId || "");
  if (!id) return null;
  const pic: string | undefined = u.profilePicture?.urls?.[0] ?? u.profilePictureUrl;
  return {
    id,
    name: String(u.nickname || u.uniqueId || id).slice(0, 60),
    avatar: pic ? `/avatar?u=${encodeURIComponent(pic)}` : undefined,
  };
}

/** combo đang chạy: khoá người+quà+nhóm → repeatCount đã phát */
const streaks = new Map<string, { n: number; at: number }>();

function onGift(d: Loose) {
  const user = toUser(d.user);
  if (!user) return;
  const giftType = d.giftDetails?.giftType ?? d.giftType;
  // TikTok gọi trường này là diamondCount nhưng giá trị là giá quà tính bằng xu (Hoa hồng = 1)
  const coins = Number(d.giftDetails?.diamondCount ?? d.diamondCount ?? 1) || 1;
  const gift = String(d.giftDetails?.giftName || d.giftName || "Quà");
  const repeat = Math.max(1, Number(d.repeatCount) || 1);
  let count = repeat;
  if (giftType === 1) {
    const key = `${user.id}:${d.giftId}:${d.groupId ?? ""}`;
    const prev = streaks.get(key)?.n ?? 0;
    count = repeat - prev;
    if (d.repeatEnd) streaks.delete(key);
    else streaks.set(key, { n: repeat, at: Date.now() });
  }
  if (count > 0) broadcast({ type: "gift", user, gift, coins, count });
}

setInterval(() => {
  const old = Date.now() - 120_000;
  for (const [k, v] of streaks) if (v.at < old) streaks.delete(k);
}, 60_000).unref();

let conn: TikTokLiveConnection | null = null;
let viewerCount = 0;
/** chẩn đoán: phòng đang nối, trạng thái phòng (2 = đang live, 4 = đã kết thúc), mọi gói TikTok gửi về theo loại */
let roomIdNow: string | null = null;
let roomStatus: number | null = null;
const raw: Record<string, number> = {};
let lastPacketAt: string | null = null;
let lastPacketMs = 0;
let connectedMs = 0;
let watchdogHits = 0;
let retry = 5000;

async function connectTikTok() {
  if (!USERNAME) return;
  conn?.removeAllListeners();
  try {
    await conn?.disconnect();
  } catch {
    /* đã đóng */
  }
  const c = new TikTokLiveConnection(USERNAME, { signApiKey: SIGN_API_KEY, enableExtendedGiftInfo: false });
  conn = c;
  // danh sách người xem hàng đầu TikTok gửi định kỳ (kèm số người xem): đưa họ vào thành phố ngay,
  // không cần đợi họ tương tác — người đã ở trong phòng từ trước khi bridge kết nối cũng hiện
  const seeded = new Set<string>();
  c.on(ControlEvent.DECODED_DATA, (type: string) => {
    if (conn !== c) return;
    if (!raw[type]) console.log(`[tiktok] gói đầu tiên loại ${type}`);
    raw[type] = (raw[type] ?? 0) + 1;
    watchdogHits = 0;
    lastPacketMs = Date.now();
    lastPacketAt = new Date().toISOString();
  });
  c.on(WebcastEvent.ROOM_USER, (d: Loose) => {
    viewerCount = Number(d.viewerCount) || viewerCount;
    for (const t of (d.topViewers ?? []).slice(0, 20)) {
      const user = toUser(t?.user);
      if (user && !seeded.has(user.id)) {
        seeded.add(user.id);
        broadcast({ type: "join", user });
      }
    }
  });
  c.on(WebcastEvent.MEMBER, (d: Loose) => {
    const user = toUser(d.user);
    if (user) broadcast({ type: "join", user });
  });
  c.on(WebcastEvent.LIKE, (d: Loose) => {
    const user = toUser(d.user);
    if (user) broadcast({ type: "like", user, count: Math.max(1, Number(d.likeCount) || 1) });
  });
  c.on(WebcastEvent.CHAT, (d: Loose) => {
    const user = toUser(d.user);
    if (user) broadcast({ type: "chat", user, text: String(d.comment ?? "").slice(0, 200) });
  });
  c.on(WebcastEvent.GIFT, onGift);
  c.on(WebcastEvent.ENVELOPE, (d: Loose) => {
    // rương xu: người thả nằm khá sâu trong gói tin
    const user = toUser(d.treasureBoxUser?.user2?.user3?.[0]?.user4?.user ?? d.user);
    const coins = Number(d.treasureBoxData?.coins) || 0;
    if (user && coins > 0) broadcast({ type: "envelope", user, coins });
  });
  c.on(WebcastEvent.FOLLOW, (d: Loose) => {
    const user = toUser(d.user);
    if (user) broadcast({ type: "follow", user });
  });
  c.on(WebcastEvent.SHARE, (d: Loose) => {
    const user = toUser(d.user);
    if (user) broadcast({ type: "share", user });
  });
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
    retry = 5000;
    roomIdNow = String(state?.roomId ?? "") || null;
    roomStatus = Number(state?.roomInfo?.status ?? state?.roomInfo?.data?.status) || null;
    connectedMs = lastPacketMs = Date.now();
    const title = state?.roomInfo?.title ?? state?.roomInfo?.data?.title;
    console.log(`[tiktok] đã kết nối @${USERNAME} (room ${roomIdNow ?? "?"}${roomStatus ? `, trạng thái ${roomStatus === 2 ? "ĐANG LIVE" : roomStatus === 4 ? "ĐÃ KẾT THÚC" : roomStatus}` : ""}${title ? `, "${title}"` : ""})`);
    if (roomStatus === 4) console.log("[tiktok] ⚠ phòng này đã kết thúc — có thể đang nối vào phiên live cũ, sẽ thử lại");
    broadcast({ type: "status", state: "connected" });
  } catch (err: Loose) {
    const msg = String(err?.message ?? err);
    console.error(`[tiktok] kết nối thất bại: ${msg}`);
    broadcast({ type: "status", state: /offline|not.*live/i.test(msg) ? "offline" : "error", detail: msg.slice(0, 80) });
    schedule();
  }
}

// Canh chừng: đã "connected" mà 45 giây không có gói nào từ TikTok (bình thường vài giây đã có gói) →
// nhiều khả năng đang nối vào phiên live cũ / kết nối chết → tự nối lại để lấy phòng mới.
setInterval(() => {
  if (!conn || lastStatus.type !== "status" || lastStatus.state !== "connected") return;
  // nối lại liên tục mà vẫn trống thì giãn dần (45s → 90s → … tối đa 3 phút) để khỏi bị TikTok / máy chủ ký chặn
  if (Date.now() - lastPacketMs > 45_000 * Math.min(4, watchdogHits + 1)) {
    watchdogHits++;
    console.log(`[tiktok] ⚠ ${Math.round((Date.now() - connectedMs) / 1000)}s không nhận được gói nào từ TikTok — nối lại`);
    broadcast({ type: "status", state: "connecting", detail: "không có dữ liệu, đang nối lại" });
    retry = 5000;
    void connectTikTok();
  }
}, 15_000).unref();

let pending: NodeJS.Timeout | null = null;
function schedule() {
  if (pending) return;
  console.log(`[tiktok] thử lại sau ${retry / 1000}s`);
  pending = setTimeout(() => {
    pending = null;
    void connectTikTok();
  }, retry);
  retry = Math.min(60_000, retry * 2);
}

server.listen(PORT, HOST, () => {
  console.log(`UFO Live bridge: http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  console.log(`  Browser Source (1080×1920): http://localhost:${PORT}/`);
  if (USERNAME) void connectTikTok();
  else console.log("  Chưa đặt TIKTOK_USERNAME — chỉ phục vụ trang game và POST /emit.");
});
