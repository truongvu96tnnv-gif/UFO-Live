import type { EventSink, LiveEvent } from "./events";

/** Nhận sự kiện từ bridge (server/index.ts) qua WebSocket, tự kết nối lại khi rớt mạng */
export function connectBridge(url: string, sink: EventSink) {
  let ws: WebSocket | null = null;
  let wait = 1000;
  let stopped = false;
  const open = () => {
    if (stopped) return;
    sink({ type: "status", state: "connecting", detail: "đang kết nối bridge" });
    ws = new WebSocket(url);
    ws.onopen = () => {
      wait = 1000;
    };
    ws.onmessage = (m) => {
      try {
        const data = JSON.parse(String(m.data)) as LiveEvent | LiveEvent[];
        for (const e of Array.isArray(data) ? data : [data]) if (e && typeof e === "object" && "type" in e) sink(e);
      } catch {
        /* bỏ qua gói hỏng */
      }
    };
    ws.onclose = () => {
      sink({ type: "status", state: "disconnected", detail: "mất kết nối bridge" });
      setTimeout(open, wait);
      wait = Math.min(15000, wait * 2);
    };
  };
  open();
  return () => {
    stopped = true;
    ws?.close();
  };
}
