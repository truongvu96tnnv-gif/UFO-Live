// Font chữ của game: Chakra Petch — dáng công nghệ (góc vát kiểu HUD), có đủ dấu tiếng Việt.
// Đóng gói sẵn qua @fontsource (không phụ thuộc mạng lúc live). Emoji tự rơi về font emoji của hệ điều hành.
import "@fontsource/chakra-petch/500.css";
import "@fontsource/chakra-petch/600.css";
import "@fontsource/chakra-petch/700.css";

export const FONT_FAMILY = `"Chakra Petch", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", system-ui, sans-serif`;

/** Chuỗi font cho canvas. Chakra Petch nặng nhất 700 nên 800/900 hiển thị như 700. */
export function font(weight: number, size: number) {
  return `${Math.min(700, Math.max(500, weight))} ${size}px ${FONT_FAMILY}`;
}

/** Chờ font tải xong (tối đa ~2,5 s) để chữ vẽ sẵn như avatar chữ cái không dùng nhầm font dự phòng */
export async function fontsReady() {
  if (!("fonts" in document)) return;
  const load = Promise.all([500, 600, 700].map((w) => document.fonts.load(`${w} 32px "Chakra Petch"`, "Bảo Vệ Trái Đất 0123"))).catch(() => undefined);
  await Promise.race([load, new Promise((r) => setTimeout(r, 2500))]);
}
