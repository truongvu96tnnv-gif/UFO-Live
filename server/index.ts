/**
 * Bridge TikTok Live → game.
 *
 *   TikTok LIVE ──(tiktok-live-connector)──▶ bridge ──WebSocket /ws──▶ trang game (Browser Source trong OBS / LIVE Studio)
 *
 * - Chuẩn hoá sự kiện (vào phòng, tim, bình luận, quà, follow, chia sẻ) về dạng LiveEvent của game.
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

function broadcast(e: LiveEvent) {
  if (e.type === "status") lastStatus = e;
  const msg = JSON.stringify(e);
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(msg);
}

wss.on("connection", (ws) => {
  ws.send(JSON.stringify(lastStatus));
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
};

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://local");
  if (url.pathname === "/avatar") return avatar(url.searchParams.get("u") ?? "", res);
  if (url.pathname === "/emit" && req.method === "POST") return emit(req, res);
  if (url.pathname === "/health") return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, username: USERNAME || null, status: lastStatus, clients: wss.clients.size }));
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

/** Bơm sự kiện tay: curl -X POST localhost:8787/emit -d '{"type":"gift","user":{"id":"a","name":"An"},"gift":"Rose","diamonds":1,"count":5}' */
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
      return user ? { type: "gift", user, gift: String(r.gift ?? "Quà").slice(0, 40), diamonds: Math.max(0, num(r.diamonds, 1)), count: Math.min(10_000, Math.max(1, num(r.count, 1))) } : null;
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
  const diamonds = Number(d.giftDetails?.diamondCount ?? d.diamondCount ?? 1) || 1;
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
  if (count > 0) broadcast({ type: "gift", user, gift, diamonds, count });
}

setInterval(() => {
  const old = Date.now() - 120_000;
  for (const [k, v] of streaks) if (v.at < old) streaks.delete(k);
}, 60_000).unref();

let conn: TikTokLiveConnection | null = null;
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
    console.log(`[tiktok] đã kết nối @${USERNAME} (room ${state?.roomId ?? "?"})`);
    broadcast({ type: "status", state: "connected" });
  } catch (err: Loose) {
    const msg = String(err?.message ?? err);
    console.error(`[tiktok] kết nối thất bại: ${msg}`);
    broadcast({ type: "status", state: /offline|not.*live/i.test(msg) ? "offline" : "error", detail: msg.slice(0, 80) });
    schedule();
  }
}

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
