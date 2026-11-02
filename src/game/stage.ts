// Khung sân khấu dọc 9:16 cho TikTok Live (1080×1920). Mọi toạ độ trong game theo khung này.
export const W = 1080;
export const H = 1920;
export const CX = W / 2;

/** Vùng TikTok phủ giao diện lên (khung chat dưới trái, cột nút bên phải) — tránh đặt thông tin quan trọng ở đây */
export const SAFE = { top: 180, bottom: 1440, right: 940 };

/** Đĩa bay: độ cao lúc bắt đầu trận → độ cao "chạm đất" (tâm thân đĩa) */
export const UFO_START_Y = 630;
export const UFO_LAND_Y = 1040;
export const UFO_SCALE = 0.74;

/** Dải bong bóng người xem lơ lửng trên mái nhà */
export const PEOPLE_Y0 = 1130;
export const PEOPLE_Y1 = 1330;
/** Mặt đất (bệ phóng khi không biết người bắn đứng đâu) */
export const GROUND_Y = 1480;
