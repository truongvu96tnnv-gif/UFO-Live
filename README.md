# UFO Live · Bảo Vệ Trái Đất

Game tương tác cho **TikTok Live** (khung dọc 1080×1920). Một UFO xâm lược hạ dần xuống thành phố, **cả phòng live phải bắn hạ nó trước khi chạm đất** — nếu không thì *cả live bị bắt cóc* 👽.

Hình ảnh đĩa bay, bong bóng ảnh, tia hút và tên lửa/pháo hoa được chuyển từ hiệu ứng Option 5/7 của dự án LuckyDraw.

## Cách chơi (người xem)

| Người xem làm | Trong game |
|---|---|
| Vào phòng / tương tác lần đầu | Bong bóng mang **ảnh đại diện + tên** của họ bật ra trên mái nhà |
| ❤️ Thả tim | Laser bắn từ bong bóng của họ lên UFO (1 sát thương / tim) |
| 💬 Bình luận | Tên lửa (4 sát thương, tối đa 1 phát / 1,5 s mỗi người) + bong bóng nói câu họ vừa chat |
| 🎁 Tặng quà | Mỗi món là một vũ khí riêng (bảng dưới), sát thương theo tổng **xu**; tặng liên tục hiện combo "🌹 ×12" trên bong bóng |
| 📦 Thả rương xu | Thùng tiếp tế treo dù rơi xuống thành phố, chạm đất thì nổ tung: UFO bị đẩy lùi 5% và cả phòng được **ĐẠN VÀNG** |
| ➕ Follow / ↗ Chia sẻ | Lá chắn: đẩy UFO lùi lên 4% / 6% quãng đường |

### Quà → vũ khí

| Quà (giá tham khảo) | Vũ khí |
|---|---|
| 🌹 Hoa hồng (1 xu) | Tên lửa hoa hồng, nổ ra cánh hoa |
| 🎵 TikTok · 🍦 Kem ốc quế (1 xu) | Loạt tên lửa nhỏ |
| 🫰 Tim ngón tay (5 xu) | Chùm đạn trái tim |
| 🧴 Nước hoa · 🍩 Bánh donut · 🎩 Mũ và ria (20–99 xu) | Tên lửa hạng nặng, ảnh người tặng ngồi trên |
| 🫶 Tim bằng tay · 🎉 Pháo giấy (100 xu) | Bom pháo giấy |
| 😎 Kính râm (199 xu) | Laser đôi hồng–xanh bắn từ bong bóng người tặng |
| 🐶 Corgi (299 xu) | 3 siêu tên lửa + rung màn |
| 💸 Súng bắn tiền (500 xu) | Mưa tờ tiền bay lên UFO |
| 🌌 Thiên hà · 🎆 Pháo hoa (1.000+ xu) | *PHÁO TRÁI ĐẤT*: cột năng lượng từ mặt đất |
| 🦁 Sư tử · 🪐 Vũ trụ (30.000+ xu) | *SIÊU VŨ KHÍ VŨ TRỤ*: màn tối lại, tia sáng từ quỹ đạo + phi đội tên lửa bay lên từ mọi bong bóng |

Quà không có trong danh sách vẫn dùng được, vũ khí được chọn theo giá. Khi live, bridge gửi giá thật của từng món nên sát thương luôn theo đúng số xu. Danh mục nằm ở `src/game/gifts.ts` (thêm quà = thêm 1 dòng).

**Quỹ phòng thủ & ĐẠN VÀNG**: mọi xu tặng trong trận (kể cả rương xu) dồn vào thanh *QUỸ PHÒNG THỦ*. Đầy mốc (100 xu, mốc sau ×1,6) → **ĐẠN VÀNG ×2** trong 12 giây: tim và bình luận của **cả phòng** gây gấp đôi sát thương (cộng dồn tối đa 30 giây). Người tặng giúp cả phòng mạnh lên, ai cũng có lý do ở lại thả tim.

Một vòng: **cảnh báo (3,6 s) → chiến đấu (~75 s) → thắng hoặc thua → nghỉ 6,5 s**.

- **Thắng**: slow-motion, nổ dây chuyền, nổ lớn, mảnh vỡ, pháo hoa; vinh danh **người ra đòn kết liễu** + top 3 xạ thủ.
- **Thua**: tia hút xanh bật, mọi bong bóng bị hút xoắn ốc vào bụng đĩa — *"CẢ LIVE ĐÃ BỊ BẮT CÓC!"*, rồi mọi người được thả về ở vòng sau.
- Còn 25% độ cao: màn đỏ nhấp nháy, còi báo động, "THẢ TIM NGAY! CÒN X GIÂY" — khoảnh khắc lật kèo phút chót dễ cắt clip.
- **Trùm**: có trùm theo mốc chuỗi thắng và trùm ngẫu nhiên. Mỗi trùm có model và kỹ năng riêng (bảng bên dưới).
- **Tự cân bằng**: máu UFO = (260 + 30 × số người tương tác trong 2 phút) × hệ số độ khó; thắng → hệ số ×1,18, thua → ×0,8. Phòng đông hay vắng đều có trận sát nút.
- **Quà mạnh nhưng không "mua thắng"**: mỗi lượt tặng gây tối đa 12% (quà nhỏ) / 20% / 35% / 60% (Pháo Trái Đất) / 85% (Siêu vũ khí) máu tối đa. ĐẠN VÀNG chỉ nhân đôi tim & bình luận, không nhân đôi quà.

> ⚠️ Không gắn quà/tim với cơ hội nhận **phần thưởng có giá trị thật** (tiền, voucher…) — dễ bị coi là cờ bạc / vi phạm chính sách quà tặng LIVE của TikTok. Phần thưởng trong game chỉ là vinh danh trên màn hình.

## Trùm

**Chuỗi thắng** = số vòng thắng liên tiếp (thua 1 vòng là về 0). Tỉ số, chuỗi và kỷ lục được lưu trong trình duyệt nên tải lại trang giữa buổi live không mất. HUD luôn hiện `🔥 CHUỖI 7/10`, màn nghỉ nhắc "thắng thêm 3 trận gặp Pháo Đài Tinh Thể". Thua trùm thì màn hình báo chuỗi bị cắt đứt.

| Trùm | Xuất hiện | Model | Kỹ năng | Máu / thời gian |
|---|---|---|---|---|
| UFO Xâm Lược | vòng thường | đĩa bay thép | — | ×1 / ×1 |
| Đĩa Vàng Hoàng Gia | ngẫu nhiên | đĩa mạ vàng, vương miện gai, ngọc đỏ | **Giáp vàng**: máu dày | ×2,2 / ×1,15 |
| Bạch Tuộc Vũ Trụ | ngẫu nhiên | đầu thịt tím lốm đốm, mắt vàng con ngươi dọc, 8 xúc tu uốn lượn | **Xúc tu tóm người**: nhấc 1 bong bóng lên; cả phòng dồn đủ sát thương trong 6 s thì cứu được, không thì người đó bị bắt và UFO hạ thêm 3 km | ×1,8 / ×1,1 |
| Tàu Tàng Hình Bóng Đêm | ngẫu nhiên | cánh bay chữ V đen nhám viền neon | **Tàng hình** 4 s trong mỗi 11 s: 70% sát thương bị trượt | ×1,6 / ×0,9 |
| Nhện Vũ Trụ | ngẫu nhiên | nhện cơ khí 8 chân, 2 súng gatling trên lưng, lõi xanh (chân bò so le bằng lưới biến dạng) | **Lưới tơ** = 8% máu giăng dưới bụng: tim (laser) dính tơ chỉ gây 30%; bình luận (tên lửa) & quà xé lưới; rách thì 12 s sau giăng lại | ×2 / ×1,1 |
| Pháo Đài Tinh Thể | chuỗi **10** | cụm tinh thể lục giác, vòng phù văn quay | **Khiên tinh thể** = 12% máu, hứng sát thương trước; vỡ thì 12 s sau tự hồi | ×2,4 / ×1,4 |
| Phi Thuyền Mẹ | chuỗi **20** | đĩa khổng lồ 3 tầng, vòm kính, khoang chứa phát sáng | **UFO con**: mỗi 7 s thả 2 chiếc lao xuống phố; chạm phố là bắt 1 người. ~45% đạn tự nhắm UFO con | ×2,8 / ×1,5 |
| Hành Tinh Hủy Diệt | chuỗi **30** | khối cầu nứt dung nham, vành đai nghiêng, mắt khổng lồ | **Mắt hủy diệt** sạc 5 s: dồn đủ 7% máu để ngắt, không thì tia đỏ bắn xuống, UFO tụt 8 km | ×3,2 / ×1,6 |
| **Rồng Không Gian** — TRÙM SIÊU CẤP | chuỗi **50, 75, 100…** | rồng cơ khí giáp đen, cánh thiên hà tím (cánh vỗ, ngực phập phồng, đuôi quẫy, đầu rướn khi hít hơi) | **Hơi thở hư không**: hít sâu 4 s — dồn 6% máu để ngắt, không thì luồng tím quét cả phố: mọi người choáng 6 s (−50%) & UFO tụt 6 km | ×4 / ×1,8 |

Mỗi kỹ năng có dòng nhắc nhấp nháy trên HUD (vd. `🐙 CỨU AN: 120/399 · còn 4s`) để chủ phòng hô hào cả phòng.

## Đồ hoạ

- **Trùm** dùng art vẽ tay trong `src/assets/bosses/*.webp`, tách nền từ `art-source/bosses-sheet.webp` bằng `tools/cut_bosses.py` (model BiRefNet + bước làm sạch: bỏ khói/sương/vạch lưới, khử viền màu nền, phóng 2× làm nét).
- **Bộ chuyển động theo khung** (sprite sheet): boss có bộ chuyển động thì game dùng nó thay art tĩnh — `idle` (lơ lửng), `move` (bay ngang nhanh), `attack` (bắn trả), `hit` (trúng đòn nặng / giãy chết). Hiện chưa boss nào dùng. Nhập bộ mới:

  ```bash
  .venv/bin/python tools/import_boss_anim.py <thư-mục-có-atlas.json> <boss-id>
  ```

  rồi thêm 1 dòng vào `BOSS_ANIM` trong `src/game/bosses.ts`. Công cụ tự căn tâm thân từng khung (khung gốc lệch tới ~100 px làm hình nhảy), nới ô, xoá mảnh khung bên cạnh lọt sang, làm mờ mép bị cắt. Boss có hoạt ảnh `attack` và không có kỹ năng riêng thì cứ 8–12 giây sạc rồi xả 5 tia laser đỏ xuống phố (chỉ hiệu ứng).
- **Chuyển động trùm** (`src/game/bossfx.ts`) phân tích từ video giới thiệu boss: mỗi trùm có nhịp lơ lửng/chao riêng; UFO phụt 4 luồng phản lực xanh + đèn chạy quanh vành; Đĩa Vàng có 2 vòng năng lượng quay quanh + tia đỏ từ ngọc; Pháo Đài Tinh Thể có lõi plasma đập, tia điện, 12 mảnh tinh thể bay vòng (che trước/sau); Bạch Tuộc cuộn/duỗi xúc tu chậm (lưới biến dạng); Phi Thuyền Mẹ có 2 vòng con quay chữ X quay quanh vòm + ánh xanh dưới bụng; Hành Tinh xoay chậm, viền lửa lập loè, vành đá vụn bay quanh. Mỗi trùm có lớp hiệu ứng động riêng vẽ chồng lên art: mắt bạch tuộc sáng/chớp, nhiễu sóng khi tàu tàng hình, lõi tinh thể đập + vòng phù văn + khiên, dung nham phập phồng & lõi sạc pháo của hành tinh, đèn khoang phi thuyền mẹ, chớp nòng chiến hạm. Ảnh chưa tải được thì tự dùng model vẽ bằng code.
- **Khung cảnh** (`src/game/scene.ts`): mây trôi quanh UFO, khói phủ mái nhà, đám cháy trên mái, 4 tháp pháo phòng không xoay nòng theo UFO và bắn đạn vạch đường (càng nhiều người bắn, tháp pháo bắn càng dày), tàn lửa bay lên. Thuần trang trí, không gây sát thương.
- **Âm thanh** (`src/game/audio/`, tự tổng hợp bằng WebAudio — không file nhạc, không lo bản quyền):
  - *Nhạc nền đổi theo trận* (chuyển ở đầu ô nhịp): chờ 90 BPM êm · vào trận 112 BPM (Am–F–C–G, kick 4/4, bass nảy, arpeggio) · UFO sắp chạm đất 128 BPM dồn dập + tiếng rít dâng · trùm 100 BPM nửa nhịp nặng, kèn đồng trầm, hợp xướng · kèn chiến thắng / nhạc thua. Đạn vàng làm nhạc sáng hơn.
  - *Không khí*: gió đêm thành phố, tiếng động cơ UFO trầm & to dần khi hạ thấp (mỗi trùm âm sắc riêng), pháo phòng không nổ xa.
  - *Hiệu ứng*: laser, tên lửa rít (to theo cỡ), nổ 3 lớp có vang, UFO nổ tung nhiều đợt, pháo hoa, xu, đạn vàng, rương xu, 3 loại tia năng lượng, còi báo động, "braam" khi trùm xuất hiện, tiếng kỹ năng trùm (tóm, xẹt điện, khiên pha lê, kính vỡ, UFO con, sạc mắt hủy diệt).
  - *Giọng riêng từng boss* (`audio/voices.ts`): xuất hiện · bị đau · bắn trả · gục ngã — UFO tiếng theremin rền rĩ, Đĩa Vàng chiêng & kèn hoàng gia + mưa xu khi chết, Bạch Tuộc gào (formant) & nhớp nháp, Tàu Tàng Hình phản lực lướt + ra-đa, Tinh Thể hợp âm pha lê + vỡ vụn, Phi Thuyền Mẹ "BRAAAM" kép, Hành Tinh động đất + hợp xướng.
  - *Trúng đạn theo chất liệu*: kim loại (keng + đạn nảy "piu"), vàng (chuông), thịt (bẹp), pha lê (tinh tang), đá (ục + vụn).
  - *5 kiểu súng laser* — pew, zap (điện), blaster, plasma, rail — mỗi người xem cố định 1 kiểu theo tài khoản; đạn vàng thêm tiếng chuông. Tên lửa hoa hồng & bình luận huýt sáo "vèo", bom pháo giấy "bốp".
  - Bộ nén + chặn đỉnh ở cuối để không vỡ tiếng; tiếng đặt trái–phải theo vị trí trên màn.
  - Phím **M** tắt/bật toàn bộ, **U** tắt/bật nhạc; tham số `?music=0`, `?vol=0.5` (âm lượng nhạc).
- **Font** Chakra Petch (đủ dấu tiếng Việt), đóng gói sẵn.
- `npm run build:embed` → `dist-embed/ufo-live.html`: 1 file duy nhất đã nhúng ảnh & font, mở trực tiếp bằng trình duyệt (thêm `?demo=1`).

## Chạy thử (không cần lên live)

Yêu cầu Node.js ≥ 22.

```bash
npm install
```

```bash
npm run dev
```

Mở `http://localhost:5173/?demo=1` — người xem giả lập tự vào phòng, thả tim, chat, tặng quà, thả rương xu. Ở chế độ demo có thanh nút và **bảng tặng quà** ở dưới (chạm màn hình = thả tim); bấm **H** để xem phím tắt.

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
| G / E | mở bảng quà / thả rương xu 199 xu |
| 1 … 8 | hoa hồng ×5 · tim ngón tay · nước hoa · pháo giấy · kính râm · súng bắn tiền · thiên hà · vũ trụ |
| F / S / J | thử follow / chia sẻ / thêm người xem |
| D, `[` `]` | bật/tắt người xem giả, đổi độ đông |
| R / B / N | chơi lại (xoá tỉ số & chuỗi) / chọn trùm cho vòng sau (bấm tiếp để đổi) / qua pha tiếp |
| M / U / H | tắt âm / tắt nhạc nền / bảng trợ giúp |

### Tham số URL

`?demo=1&crowd=0..3` người xem giả · `time=75` thời gian hạ (giây) · `hp=260` máu cơ bản · `hpv=30` máu thêm mỗi người xem · `like=1` `chat=4` `gift=12` sát thương (gift = mỗi xu) · `fund=100` mốc quỹ đầu tiên · `boss=0.15` xác suất vòng thường gặp trùm ngẫu nhiên · `mute=1` · `ws=ws://host:port/ws` địa chỉ bridge khác.

### Biến môi trường của bridge

| Biến | Mặc định | |
|---|---|---|
| `TIKTOK_USERNAME` | — | kênh cần đọc sự kiện (hoặc `npm run bridge -- ten_kenh`) |
| `PORT` / `HOST` | `8787` / `127.0.0.1` | |
| `SIGN_API_KEY` | — | khoá Euler Stream, nếu connector yêu cầu ký |

### Nối nguồn sự kiện khác

`POST /emit` nhận 1 sự kiện hoặc mảng sự kiện JSON — dùng để thử hoặc nối webhook từ công cụ khác:

```bash
curl -X POST localhost:8787/emit -d '{"type":"gift","user":{"id":"an","name":"An"},"gift":"Hoa hồng","coins":1,"count":5}'
```

```bash
curl -X POST localhost:8787/emit -d '{"type":"envelope","user":{"id":"an","name":"An"},"coins":199}'
```

Dạng sự kiện: xem `src/live/events.ts` (`join`, `like`, `chat`, `gift`, `envelope`, `follow`, `share`).

## Lưu ý về kết nối TikTok

Bridge dùng thư viện cộng đồng [`tiktok-live-connector`](https://github.com/zerodytrash/TikTok-Live-Connector) — **không phải API chính thức** của TikTok. Nó có thể ngừng hoạt động khi TikTok thay đổi, và việc dùng có thể không phù hợp điều khoản dịch vụ. Trước khi dùng thương mại, nên tìm hiểu chương trình đối tác / LIVE Studio chính thức. Mọi phần còn lại của game không phụ thuộc vào thư viện này (chỉ cần nguồn sự kiện đúng dạng `LiveEvent`).

## Cấu trúc

```
src/main.ts            khởi động, co giãn 9:16, phím tắt, vòng lặp
src/game/game.ts       toàn bộ luật chơi + vẽ (intro / battle / win / lose / break)
src/game/sprites.ts    đĩa bay, bong bóng, nền thành phố (vẽ bằng code)
src/game/balance.ts    bảng cân bằng (máu, sát thương, quỹ phòng thủ)
src/game/gifts.ts      danh mục quà → vũ khí, trần sát thương
src/game/bosses.ts     danh sách trùm, mốc chuỗi thắng, model vẽ bằng code + bảng art (BOSS_ART) + bộ chuyển động (BOSS_ANIM)
src/game/anim.ts       trình phát hoạt ảnh theo khung
src/game/scene.ts      mây khói, tháp pháo phòng không, đám cháy, tàn lửa
src/assets/bosses/     art trùm đã tách nền (webp)
art-source/            ảnh gốc của bộ asset
tools/cut_bosses.py    script tách art trùm
tools/import_boss_anim.py  nhập bộ chuyển động (sprite sheet + atlas.json) cho 1 boss
src/game/avatars.ts    ảnh đại diện tròn (tải qua /avatar)
src/game/sfx.ts        âm thanh tổng hợp WebAudio
src/live/              kiểu sự kiện, WebSocket client, người xem giả lập
src/ui/panel.ts        thanh nút + bảng tặng quà (chỉ chế độ demo)
server/index.ts        bridge TikTok → WebSocket, proxy ảnh, phục vụ dist/
```
