import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import type { BossId } from "../src/live/boss-catalog";

/** A connected socket is not proof that its game bundle understands this command. */
export async function sendBossCommand(clients: Iterable<WebSocket>, bossId: BossId, timeoutMs = 4000) {
  const targets = [...clients].filter(client => client.readyState === WebSocket.OPEN);
  if (!targets.length) throw new Error("Chưa có màn hình game kết nối. Hãy mở màn hình game trước.");
  const requestId = randomUUID();
  const payload = JSON.stringify({ type: "summonBoss", bossId, requestId });
  const results = await Promise.allSettled(targets.map(client => new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      client.off("message", onMessage);
      client.off("close", onClose);
      if (error) reject(error); else resolve();
    };
    const onMessage = (raw: import("ws").RawData) => {
      let data;
      try { data = JSON.parse(String(raw)); } catch { return; }
      if (data?.type !== "commandResult" || data.requestId !== requestId) return;
      finish(data.ok === true ? undefined : new Error("Game không thực thi được lệnh"));
    };
    const onClose = () => finish(new Error("Màn hình game đã ngắt kết nối"));
    const timer = setTimeout(() => finish(new Error("Màn hình game không xác nhận")), timeoutMs);
    client.on("message", onMessage);
    client.on("close", onClose);
    client.send(payload, error => { if (error) finish(error); });
  })));
  const applied = results.filter(result => result.status === "fulfilled").length;
  if (applied !== targets.length) {
    throw new Error(`${applied}/${targets.length} màn hình xác nhận gọi boss. Hãy chạy npm run build, khởi động lại bridge và tải lại nguồn trình duyệt OBS/game. Kiểm tra game và control dùng cùng bridge.`);
  }
  return { applied, bossId };
}
