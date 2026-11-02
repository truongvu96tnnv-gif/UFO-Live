// Gộp bản build "embed" (ảnh & font đã nhúng sẵn) thành 1 file HTML duy nhất: dist-embed/ufo-live.html
// Mở trực tiếp bằng trình duyệt (thêm ?demo=1 để chạy người xem giả lập), không cần server.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "dist-embed";
let html = readFileSync(join(dir, "index.html"), "utf8");
html = html.replace(/<link rel="stylesheet"[^>]*href="\/?([^"]+\.css)"[^>]*>/g, (_, href) => `<style>${readFileSync(join(dir, href), "utf8")}</style>`);
html = html.replace(/<script type="module"[^>]*src="\/?([^"]+\.js)"[^>]*><\/script>/g, (_, src) => {
  const js = readFileSync(join(dir, src), "utf8").replace(/<\/script/gi, "<\\/script");
  return `<script type="module">${js}</script>`;
});
writeFileSync(join(dir, "ufo-live.html"), html);
console.log(`dist-embed/ufo-live.html — ${(html.length / 1024).toFixed(0)} KB`);
