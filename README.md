# UFO Live · Bảo Vệ Trái Đất

Game tương tác cho **TikTok Live** (khung dọc 1080×1920). Một UFO xâm lược hạ dần xuống thành phố, **cả phòng live phải bắn hạ nó trước khi chạm đất** — nếu không thì *cả live bị bắt cóc* 👽.

Hình ảnh đĩa bay, bong bóng ảnh, tia hút và tên lửa/pháo hoa được chuyển từ hiệu ứng Option 5/7 của dự án LuckyDraw.

## Cách chơi (người xem)

| Người xem làm | Trong game |
|---|---|
| Vào phòng / tương tác lần đầu | Bong bóng mang **ảnh đại diện + tên** của họ bật ra trên mái nhà |
| ❤️ Thả tim | Laser bắn từ bong bóng của họ lên UFO (1 sát thương / tim) |
| 💬 Bình luận | Tên lửa (4 sát thương, tối đa 1 phát / 1,5 s mỗi người) + bong bóng nói câu họ vừa chat |
| 🎁 Tặng quà | Vũ khí theo tổng kim cương: **<10💎** loạt tên lửa · **10–99💎** tên lửa hạng nặng có ảnh người tặng ngồi trên · **100–999💎** 3 siêu tên lửa + rung màn · **≥1000💎** *PHÁO TRÁI ĐẤT* (cột năng lượng từ mặt đất) |
| ➕ Follow / ↗ Chia sẻ | Lá chắn: đẩy UFO lùi lên 4% / 6% quãng đường |

Một vòng: **cảnh báo (3,6 s) → chiến đấu (~75 s) → thắng hoặc thua → nghỉ 6,5 s**.

- **Thắng**: slow-motion, nổ dây chuyền, nổ lớn, mảnh vỡ, pháo hoa; vinh danh **người ra đòn kết liễu** + top 3 xạ thủ.
- **Thua**: tia hút xanh bật, mọi bong bóng bị hút xoắn ốc vào bụng đĩa — *"CẢ LIVE ĐÃ BỊ BẮT CÓC!"*, rồi mọi người được thả về ở vòng sau.
- Còn 25% độ cao: màn đỏ nhấp nháy, còi báo động, "THẢ TIM NGAY! CÒN X GIÂY" — khoảnh khắc lật kèo phút chót dễ cắt clip.
- **UFO VÀNG** (trùm, máu ×2,2): ~8% số vòng và mỗi vòng thứ 10.
- **Tự cân bằng**: máu UFO = (260 + 30 × số người tương tác trong 2 phút) × hệ số độ khó; thắng → hệ số ×1,18, thua → ×0,8. Phòng đông hay vắng đều có trận sát nút.
- **Quà mạnh nhưng không "mua thắng"**: mỗi lượt tặng gây tối đa 12% / 20% / 35% / 60% máu tối đa theo cấp vũ khí.

> ⚠️ Không gắn quà/tim với cơ hội nhận **phần thưởng có giá trị thật** (tiền, voucher…) — dễ bị coi là cờ bạc / vi phạm chính sách quà tặng LIVE của TikTok. Phần thưởng trong game chỉ là vinh danh trên màn hình.

## Chạy thử (không cần lên live)

Yêu cầu Node.js ≥ 22.

```bash
npm install
```

```bash
npm run dev
```

Mở `http://localhost:5173/?demo=1` — người xem giả lập tự vào phòng, thả tim, chat, tặng quà. Bấm **H** để xem phím tắt.

## Lên live

1. Build và chạy bridge, kết nối tới kênh đang live:

   ```bash
   npm run build
   ```

   ```bash
   TIKTOK_USERNAME=ten_kenh_cua_ban npm run bridge
   ```

2. Trong **TikTok LIVE Studio** hoặc **OBS**: thêm **Browser Source** `http://localhost:8787/`, kích thước **1080 × 1920**, bật *Control audio via OBS* nếu muốn tiếng.
3. Phím tắt cho người vận hành: chuột phải Browser Source → *Interact*.

| Phím | Tác dụng |
|---|---|
| L / C | thử tim ×10 / bình luận |
| 1 2 3 4 | thử quà 5×1💎 / 20💎 / 199💎 / 1000💎 |
| F / S / J | thử follow / chia sẻ / thêm người xem |
| D, `[` `]` | bật/tắt người xem giả, đổi độ đông |
| R / B / N | chơi lại / vòng sau UFO VÀNG / qua pha tiếp |
| M / H | tắt âm / bảng trợ giúp |

### Tham số URL

`?demo=1&crowd=0..3` người xem giả · `time=75` thời gian hạ (giây) · `hp=260` máu cơ bản · `hpv=30` máu thêm mỗi người xem · `like=1` `chat=4` `gift=12` sát thương · `boss=0.08` xác suất UFO VÀNG · `mute=1` · `ws=ws://host:port/ws` địa chỉ bridge khác.

### Biến môi trường của bridge

| Biến | Mặc định | |
|---|---|---|
| `TIKTOK_USERNAME` | — | kênh cần đọc sự kiện (hoặc `npm run bridge -- ten_kenh`) |
| `PORT` / `HOST` | `8787` / `127.0.0.1` | |
| `SIGN_API_KEY` | — | khoá Euler Stream, nếu connector yêu cầu ký |

### Nối nguồn sự kiện khác

`POST /emit` nhận 1 sự kiện hoặc mảng sự kiện JSON — dùng để thử hoặc nối webhook từ công cụ khác:

```bash
curl -X POST localhost:8787/emit -d '{"type":"gift","user":{"id":"an","name":"An"},"gift":"Hoa hồng","diamonds":1,"count":5}'
```

Dạng sự kiện: xem `src/live/events.ts` (`join`, `like`, `chat`, `gift`, `follow`, `share`).

## Lưu ý về kết nối TikTok

Bridge dùng thư viện cộng đồng [`tiktok-live-connector`](https://github.com/zerodytrash/TikTok-Live-Connector) — **không phải API chính thức** của TikTok. Nó có thể ngừng hoạt động khi TikTok thay đổi, và việc dùng có thể không phù hợp điều khoản dịch vụ. Trước khi dùng thương mại, nên tìm hiểu chương trình đối tác / LIVE Studio chính thức. Mọi phần còn lại của game không phụ thuộc vào thư viện này (chỉ cần nguồn sự kiện đúng dạng `LiveEvent`).

## Cấu trúc

```
src/main.ts            khởi động, co giãn 9:16, phím tắt, vòng lặp
src/game/game.ts       toàn bộ luật chơi + vẽ (intro / battle / win / lose / break)
src/game/sprites.ts    đĩa bay, bong bóng, nền thành phố (vẽ bằng code)
src/game/balance.ts    bảng cân bằng, cấp vũ khí theo kim cương
src/game/avatars.ts    ảnh đại diện tròn (tải qua /avatar)
src/game/sfx.ts        âm thanh tổng hợp WebAudio
src/live/              kiểu sự kiện, WebSocket client, người xem giả lập
server/index.ts        bridge TikTok → WebSocket, proxy ảnh, phục vụ dist/
```
