import { defineConfig } from "vite";

// Lúc dev: Vite phục vụ trang game, còn /ws (sự kiện live) và /avatar (proxy ảnh đại diện) chuyển sang bridge ở cổng 8787.
const BRIDGE = process.env.BRIDGE_URL ?? "http://localhost:8787";

export default defineConfig(({ mode }) => ({
  server: {
    port: 5173,
    proxy: {
      "/ws": { target: BRIDGE.replace(/^http/, "ws"), ws: true },
      "/avatar": BRIDGE,
      "/api": BRIDGE,
      "/health": BRIDGE,
      "/control": BRIDGE,
      "/voice": BRIDGE,
    },
  },
  // mode "embed": nhúng mọi ảnh & font vào JS/CSS → scripts/embed.mjs gộp thành 1 file HTML chạy offline
  build:
    mode === "embed"
      ? { outDir: "dist-embed", target: "es2022", assetsInlineLimit: 100_000_000, modulePreload: false }
      : {
          outDir: "dist",
          target: "es2022",
          // 2 trang: game UFO (index.html) và Rạp Phim Tương Tác (cinema.html), dùng chung bridge
          rollupOptions: { input: { main: "index.html", cinema: "cinema.html" } },
        },
}));
