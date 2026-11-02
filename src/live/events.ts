// Sự kiện live đã chuẩn hoá — bridge (server/index.ts), chế độ demo và phím tắt đều phát ra đúng dạng này.

export interface LiveUser {
  /** id ổn định (TikTok uniqueId / userId) */
  id: string;
  /** tên hiển thị */
  name: string;
  /** URL ảnh đại diện (đã qua proxy /avatar) hoặc "demo:<hue>" */
  avatar?: string;
}

export const PRESENCE_TTL_MS = 120_000;

export type LiveEvent =
  | { type: "presence"; user: LiveUser; remainingMs?: number }
  | { type: "join"; user: LiveUser }
  | { type: "like"; user: LiveUser; count: number }
  | { type: "chat"; user: LiveUser; text: string }
  /** coins = giá 1 món (xu); count = số món MỚI trong sự kiện này (bridge đã trừ phần combo gửi trước đó) */
  | { type: "gift"; user: LiveUser; gift: string; coins: number; count: number }
  /** Rương xu (treasure box) người xem thả vào phòng */
  | { type: "envelope"; user: LiveUser; coins: number }
  | { type: "follow"; user: LiveUser }
  | { type: "share"; user: LiveUser }
  | { type: "status"; state: "connecting" | "connected" | "disconnected" | "offline" | "error" | "idle"; detail?: string };

export type EventSink = (e: LiveEvent) => void;
