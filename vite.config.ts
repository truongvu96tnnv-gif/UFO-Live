import { defineConfig } from "vite";

// Lúc dev: Vite phục vụ trang game, còn /ws (sự kiện live) và /avatar (proxy ảnh đại diện) chuyển sang bridge ở cổng 8787.
const BRIDGE = process.env.BRIDGE_URL ?? "http://localhost:8787";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/ws": { target: BRIDGE.replace(/^http/, "ws"), ws: true },
      "/avatar": BRIDGE,
    },
  },
  build: { outDir: "dist", target: "es2022" },
});
