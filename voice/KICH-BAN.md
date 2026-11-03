# Kịch bản lồng tiếng — Bảo Vệ Trái Đất

100 câu · bình luận viên 72 · giọng trùm 28. Tệp này được tạo tự động từ `src/game/voice-lines.ts` (`npm run voice:list`) — sửa câu ở đó rồi chạy lại.

## Cách dùng

1. Gen tiếng từng câu trong ElevenLabs (cột **Lời thoại**; nếu dùng model **Eleven v3** thì dán cột **Lời v3** có thẻ cảm xúc như `[excited]`, `[shouts]`).
2. Tải về **mp3**, đặt tên **đúng cột Tên file** (vd. `round_start_1.mp3`), bỏ vào thư mục `voice/` này. Cũng nhận `.wav`, `.ogg`, `.m4a`.
3. Tải lại trang game (bridge phải đang chạy) — game tự nhận file, câu nào chưa có thì bỏ qua.

Hoặc gen tự động cả bộ: `npm run voice:gen` (xem cuối trang).

## Gợi ý giọng

- **mc — Bình luận viên**: tạo bằng *Voice Design* với mô tả: _“Energetic young Vietnamese male esports caster, clear Northern Vietnamese accent, fast and hype, crisp studio microphone”_ (hoặc chọn 1 giọng Việt sôi nổi trong Voice Library).
- **ufo — Giọng trùm**: _“Deep, slow, menacing alien overlord speaking Vietnamese, gravelly and slightly metallic, cinematic villain, lots of gravitas”_. Game tự thêm vang cho giọng này.
- Đọc **chậm vừa phải, rõ chữ**; mỗi câu nên dưới 4 giây (riêng `countdown` ~3 giây: “Ba… hai… một…”).
- Âm lượng các file nên đều nhau (ElevenLabs mặc định đã ổn). Trong game chỉnh to/nhỏ bằng `?voice=0.8`; `?voice=0` tắt lồng tiếng.

## 🎙 Bình luận viên (mc)

| | Tên file | Khi nào | Lời thoại | Lời v3 (Eleven v3) | Cách đọc |
|---|---|---|---|---|---|
| ⬜ | `welcome_1.mp3` | `welcome` | Chào mừng đến với Bảo Vệ Trái Đất! Thả tim để bắn laser, bình luận để phóng tên lửa! | [excited] Chào mừng đến với Bảo Vệ Trái Đất! Thả tim để bắn laser, bình luận để phóng tên lửa! | Mở màn, hào hứng như dẫn gameshow |
| ⬜ | `welcome_2.mp3` | `welcome` | Cả phòng ơi, UFO sắp tới rồi! Thả tim và bình luận để cùng bảo vệ Trái Đất nào! | [excited] Cả phòng ơi, UFO sắp tới rồi! Thả tim và bình luận để cùng bảo vệ Trái Đất nào! | Kêu gọi cả phòng |
| ⬜ | `countdown.mp3` | `countdown` | Ba... hai... một... | [dramatic] Ba... hai... một... | Đếm ngược chậm, mỗi số cách ~1 giây (tổng ~3 giây) |
| ⬜ | `revenge_1.mp3` | `revenge` | Đừng bỏ cuộc! Vòng sau chúng ta phục thù! | [determined] Đừng bỏ cuộc! Vòng sau chúng ta phục thù! | Sau khi thua, động viên |
| ⬜ | `revenge_2.mp3` | `revenge` | Thua một trận thôi! Thả tim thật nhiều để lấy lại Trái Đất! | [determined] Thua một trận thôi! Thả tim thật nhiều để lấy lại Trái Đất! | Sau khi thua |
| ⬜ | `next_boss.mp3` | `next_boss` | Cẩn thận! Vòng sau sẽ là trận đánh trùm! | [serious] Cẩn thận! Vòng sau sẽ là trận đánh trùm! | Màn nghỉ trước trận trùm mốc chuỗi thắng |
| ⬜ | `round_start_1.mp3` | `round_start` | Cảnh báo! UFO xâm lược đang hạ cánh! | [shouts] Cảnh báo! UFO xâm lược đang hạ cánh! | Còi báo động, gấp gáp |
| ⬜ | `round_start_2.mp3` | `round_start` | Radar phát hiện vật thể lạ! Chuẩn bị chiến đấu! | [urgent] Radar phát hiện vật thể lạ! Chuẩn bị chiến đấu! | Gấp gáp |
| ⬜ | `round_start_3.mp3` | `round_start` | Tất cả vào vị trí! Một chiếc đĩa bay vừa xuất hiện! | [urgent] Tất cả vào vị trí! Một chiếc đĩa bay vừa xuất hiện! | Gấp gáp |
| ⬜ | `fight_1.mp3` | `fight` | Khai hoả! | [shouts] Khai hoả! | Hô to, ngắn |
| ⬜ | `fight_2.mp3` | `fight` | Bắn! | [shouts] Bắn! | Hô to, ngắn |
| ⬜ | `fight_3.mp3` | `fight` | Cả phòng, tấn công! | [shouts] Cả phòng, tấn công! | Hô to |
| ⬜ | `boss_gold.mp3` | `boss_gold` | Trùm xuất hiện! Đĩa Vàng Hoàng Gia, giáp cực dày! Dồn hết hoả lực! | [excited] Trùm xuất hiện! Đĩa Vàng Hoàng Gia, giáp cực dày! Dồn hết hoả lực! | Trùm ngẫu nhiên |
| ⬜ | `boss_octopus.mp3` | `boss_octopus` | Bạch Tuộc Vũ Trụ! Coi chừng xúc tu tóm người! | [excited] Bạch Tuộc Vũ Trụ! Coi chừng xúc tu tóm người! | Trùm ngẫu nhiên |
| ⬜ | `boss_stealth.mp3` | `boss_stealth` | Tàu Tàng Hình Bóng Đêm! Nó có thể biến mất bất cứ lúc nào! | [excited] Tàu Tàng Hình Bóng Đêm! Nó có thể biến mất bất cứ lúc nào! | Trùm ngẫu nhiên |
| ⬜ | `boss_spider.mp3` | `boss_spider` | Nhện Vũ Trụ! Lưới tơ chặn laser, bình luận để xé lưới! | [excited] Nhện Vũ Trụ! Lưới tơ chặn laser, bình luận để xé lưới! | Trùm ngẫu nhiên |
| ⬜ | `boss_devourer.mp3` | `boss_devourer` | Kẻ Nuốt Hành Tinh! Đừng để nó nuốt mất ai! | [excited] Kẻ Nuốt Hành Tinh! Đừng để nó nuốt mất ai! | Trùm ngẫu nhiên |
| ⬜ | `boss_crystal.mp3` | `boss_crystal` | Trùm chuỗi thắng! Pháo Đài Tinh Thể với khiên pha lê! Phá khiên trước! | [excited] Trùm chuỗi thắng! Pháo Đài Tinh Thể với khiên pha lê! Phá khiên trước! | Trùm mốc chuỗi 10 |
| ⬜ | `boss_mother.mp3` | `boss_mother` | Phi Thuyền Mẹ! Bắn rơi UFO con trước khi chúng chạm phố! | [excited] Phi Thuyền Mẹ! Bắn rơi UFO con trước khi chúng chạm phố! | Trùm mốc chuỗi 20 |
| ⬜ | `boss_planet.mp3` | `boss_planet` | Hành Tinh Hủy Diệt! Ngắt mắt hủy diệt trước khi nó khai hoả! | [excited] Hành Tinh Hủy Diệt! Ngắt mắt hủy diệt trước khi nó khai hoả! | Trùm mốc chuỗi 30 |
| ⬜ | `boss_dragon.mp3` | `boss_dragon` | Không thể tin được! Trùm siêu cấp! Rồng Không Gian đã xuất hiện! | [shouts] Không thể tin được! Trùm siêu cấp! Rồng Không Gian đã xuất hiện! | Trùm siêu cấp chuỗi 50 — cao trào nhất |
| ⬜ | `danger_1.mp3` | `danger` | Nguy hiểm! UFO sắp chạm đất! Thả tim nhanh lên! | [panicked] Nguy hiểm! UFO sắp chạm đất! Thả tim nhanh lên! | Hoảng, gấp |
| ⬜ | `danger_2.mp3` | `danger` | Không còn nhiều thời gian! Dồn hết sức bắn! | [panicked] Không còn nhiều thời gian! Dồn hết sức bắn! | Hoảng, gấp |
| ⬜ | `half_hp_1.mp3` | `half_hp` | UFO đã mất một nửa máu! Cố lên cả phòng! | [excited] UFO đã mất một nửa máu! Cố lên cả phòng! | Phấn khích |
| ⬜ | `half_hp_2.mp3` | `half_hp` | Được rồi! Nó đang yếu đi! | [excited] Được rồi! Nó đang yếu đi! | Phấn khích |
| ⬜ | `low_hp_1.mp3` | `low_hp` | Sắp hạ được rồi! Một chút nữa thôi! | [excited] Sắp hạ được rồi! Một chút nữa thôi! | Rất phấn khích |
| ⬜ | `low_hp_2.mp3` | `low_hp` | Nó sắp nổ tung rồi! Bắn tiếp đi! | [shouts] Nó sắp nổ tung rồi! Bắn tiếp đi! | Rất phấn khích |
| ⬜ | `golden_1.mp3` | `golden` | Đạn vàng kích hoạt! Sát thương nhân đôi! | [excited] Đạn vàng kích hoạt! Sát thương nhân đôi! | Phấn khích |
| ⬜ | `golden_2.mp3` | `golden` | Năng lượng đầy! Đạn vàng nhân đôi! | [excited] Năng lượng đầy! Đạn vàng nhân đôi! | Phấn khích |
| ⬜ | `crate.mp3` | `crate` | Rương tiếp tế đang rơi xuống! | [excited] Rương tiếp tế đang rơi xuống! | Vui |
| ⬜ | `gift_thanks_1.mp3` | `gift_thanks` | Cảm ơn món quà! | [warm] Cảm ơn món quà! | Ấm áp, nhanh |
| ⬜ | `gift_thanks_2.mp3` | `gift_thanks` | Quá tuyệt, cảm ơn bạn! | [warm] Quá tuyệt, cảm ơn bạn! | Ấm áp, nhanh |
| ⬜ | `gift_thanks_3.mp3` | `gift_thanks` | Vũ khí mới đã sẵn sàng, cảm ơn nhé! | [warm] Vũ khí mới đã sẵn sàng, cảm ơn nhé! | Ấm áp |
| ⬜ | `gift_cannon.mp3` | `gift_cannon` | Pháo Trái Đất khai hoả! Cảm ơn bạn rất nhiều! | [shouts] Pháo Trái Đất khai hoả! Cảm ơn bạn rất nhiều! | Bùng nổ — quà lớn (Thiên hà, Pháo hoa) |
| ⬜ | `gift_orbital.mp3` | `gift_orbital` | Siêu vũ khí vũ trụ! Cả thành phố rung chuyển! | [shouts] Siêu vũ khí vũ trụ! Cả thành phố rung chuyển! | Bùng nổ tối đa — quà khủng (Sư tử, Vũ trụ) |
| ⬜ | `follow.mp3` | `follow` | Cảm ơn bạn đã theo dõi! Lá chắn đã dựng lên! | [warm] Cảm ơn bạn đã theo dõi! Lá chắn đã dựng lên! | Ấm áp |
| ⬜ | `share.mp3` | `share` | Viện binh đã tới! Cảm ơn bạn đã chia sẻ! | [warm] Viện binh đã tới! Cảm ơn bạn đã chia sẻ! | Ấm áp |
| ⬜ | `grab.mp3` | `grab` | Bạch tuộc tóm người! Dồn sát thương để giải cứu! | [urgent] Bạch tuộc tóm người! Dồn sát thương để giải cứu! | Gấp |
| ⬜ | `rescued.mp3` | `rescued` | Giải cứu thành công! | [excited] Giải cứu thành công! | Mừng rỡ |
| ⬜ | `cloak.mp3` | `cloak` | Nó tàng hình rồi! Đạn sẽ bắn trượt! | [urgent] Nó tàng hình rồi! Đạn sẽ bắn trượt! | Gấp |
| ⬜ | `web.mp3` | `web` | Lưới tơ giăng ra! Bình luận để xé lưới! | [urgent] Lưới tơ giăng ra! Bình luận để xé lưới! | Gấp |
| ⬜ | `web_torn.mp3` | `web_torn` | Lưới tơ đã rách! | [excited] Lưới tơ đã rách! | Mừng rỡ |
| ⬜ | `shield_up.mp3` | `shield_up` | Khiên tinh thể hồi phục! Phá khiên trước! | [urgent] Khiên tinh thể hồi phục! Phá khiên trước! | Gấp |
| ⬜ | `shield_break.mp3` | `shield_break` | Khiên tinh thể đã vỡ! | [excited] Khiên tinh thể đã vỡ! | Mừng rỡ |
| ⬜ | `drones.mp3` | `drones` | UFO con đang lao xuống! Bắn rơi chúng ngay! | [urgent] UFO con đang lao xuống! Bắn rơi chúng ngay! | Gấp |
| ⬜ | `charge.mp3` | `charge` | Mắt hủy diệt đang sạc! Ngắt nó ngay! | [panicked] Mắt hủy diệt đang sạc! Ngắt nó ngay! | Hoảng |
| ⬜ | `charge_stopped.mp3` | `charge_stopped` | Ngắt thành công! | [excited] Ngắt thành công! | Mừng rỡ |
| ⬜ | `charge_fired.mp3` | `charge_fired` | Ối không! Tia hủy diệt đã khai hoả! | [shocked] Ối không! Tia hủy diệt đã khai hoả! | Sốc |
| ⬜ | `breath.mp3` | `breath` | Rồng đang hít hơi! Ngắt hơi thở ngay! | [panicked] Rồng đang hít hơi! Ngắt hơi thở ngay! | Hoảng |
| ⬜ | `breath_fired.mp3` | `breath_fired` | Hơi thở hư không! Cả phòng bị choáng! | [shocked] Hơi thở hư không! Cả phòng bị choáng! | Sốc |
| ⬜ | `devour.mp3` | `devour` | Hố đen đang hút người! Bắt nó nhả ra! | [panicked] Hố đen đang hút người! Bắt nó nhả ra! | Hoảng |
| ⬜ | `devour_saved.mp3` | `devour_saved` | Nó nghẹn rồi! Mọi người được nhả ra! | [excited] Nó nghẹn rồi! Mọi người được nhả ra! | Mừng rỡ |
| ⬜ | `player_boss_queued.mp3` | `player_boss_queued` | Có người vừa giành quyền làm trùm ở vòng sau! | [excited] Có người vừa giành quyền làm trùm ở vòng sau! | Phấn khích |
| ⬜ | `player_boss_intro.mp3` | `player_boss_intro` | Trùm người xem xuất hiện! Cả phòng hạ gục người đã chiếm UFO! | [excited] Trùm người xem xuất hiện! Cả phòng hạ gục người đã chiếm UFO! | Mở trận trùm người xem |
| ⬜ | `player_boss_down.mp3` | `player_boss_down` | Trùm người xem đã bị hạ gục! Trái Đất an toàn! | [excited] Trùm người xem đã bị hạ gục! Trái Đất an toàn! | Chiến thắng |
| ⬜ | `player_boss_win.mp3` | `player_boss_win` | Trùm người xem đã chiếm Trái Đất! | [shocked] Trùm người xem đã chiếm Trái Đất! | Thua trước trùm người xem |
| ⬜ | `traitor_1.mp3` | `traitor` | Có kẻ phản bội! Bắn hạ UFO đỏ! | [shouts] Có kẻ phản bội! Bắn hạ UFO đỏ! | Gấp, phẫn nộ (vui) |
| ⬜ | `traitor_2.mp3` | `traitor` | Một người vừa đổi phe! Tập trung bắn UFO đỏ! | [shouts] Một người vừa đổi phe! Tập trung bắn UFO đỏ! | Gấp |
| ⬜ | `traitor_down_1.mp3` | `traitor_down` | Kẻ phản bội đã bị bắn hạ! | [excited] Kẻ phản bội đã bị bắn hạ! | Hả hê |
| ⬜ | `traitor_down_2.mp3` | `traitor_down` | Hạ gục UFO đỏ! Quay về phe Trái Đất đi! | [laughs] Hạ gục UFO đỏ! Quay về phe Trái Đất đi! | Hả hê |
| ⬜ | `traitor_return.mp3` | `traitor_return` | Chào mừng trở về phe Trái Đất! | [warm] Chào mừng trở về phe Trái Đất! | Ấm áp |
| ⬜ | `win_1.mp3` | `win` | Trái Đất an toàn! Cả phòng quá đỉnh! | [excited] Trái Đất an toàn! Cả phòng quá đỉnh! | Ăn mừng |
| ⬜ | `win_2.mp3` | `win` | Bắn hạ UFO! Một chiến thắng tuyệt vời! | [excited] Bắn hạ UFO! Một chiến thắng tuyệt vời! | Ăn mừng |
| ⬜ | `win_3.mp3` | `win` | Nổ tung rồi! Trái Đất vẫn an toàn! | [excited] Nổ tung rồi! Trái Đất vẫn an toàn! | Ăn mừng |
| ⬜ | `win_boss_1.mp3` | `win_boss` | Hạ gục trùm! Một chiến thắng huyền thoại! | [shouts] Hạ gục trùm! Một chiến thắng huyền thoại! | Ăn mừng lớn |
| ⬜ | `win_boss_2.mp3` | `win_boss` | Trùm đã gục ngã! Cả phòng là anh hùng! | [shouts] Trùm đã gục ngã! Cả phòng là anh hùng! | Ăn mừng lớn |
| ⬜ | `win_super.mp3` | `win_super` | Không thể tin nổi! Rồng Không Gian đã bị tiêu diệt! Huyền thoại! | [shouts] Không thể tin nổi! Rồng Không Gian đã bị tiêu diệt! Huyền thoại! | Cao trào nhất, hét to |
| ⬜ | `mvp_1.mp3` | `mvp` | Xin chúc mừng xạ thủ xuất sắc nhất trận! | [warm] Xin chúc mừng xạ thủ xuất sắc nhất trận! | Vinh danh |
| ⬜ | `mvp_2.mp3` | `mvp` | Và đây là người hùng của trận đấu! | [warm] Và đây là người hùng của trận đấu! | Vinh danh |
| ⬜ | `record.mp3` | `record` | Kỷ lục chuỗi thắng mới! | [excited] Kỷ lục chuỗi thắng mới! | Phấn khích |
| ⬜ | `lose_1.mp3` | `lose` | Không! Trái Đất đã thất thủ... | [sad] Không! Trái Đất đã thất thủ... | Tiếc nuối |
| ⬜ | `lose_2.mp3` | `lose` | Chúng ta đã không kịp ngăn nó lại... | [sighs] Chúng ta đã không kịp ngăn nó lại... | Tiếc nuối |

## 👽 Giọng trùm (ufo)

| | Tên file | Khi nào | Lời thoại | Lời v3 (Eleven v3) | Cách đọc |
|---|---|---|---|---|---|
| ⬜ | `taunt_ufo_1.mp3` | `taunt_ufo` | Lũ người Trái Đất... hãy đầu hàng đi. | [menacing] Lũ người Trái Đất... hãy đầu hàng đi. | Trầm, chậm, khinh thường |
| ⬜ | `taunt_ufo_2.mp3` | `taunt_ufo` | Hành tinh này... sẽ thuộc về chúng ta. | [menacing] Hành tinh này... sẽ thuộc về chúng ta. | Trầm, chậm |
| ⬜ | `taunt_gold.mp3` | `taunt_gold` | Vàng của ta... không gì xuyên thủng được. | [arrogant] Vàng của ta... không gì xuyên thủng được. | Kiêu ngạo, quý tộc |
| ⬜ | `taunt_octopus.mp3` | `taunt_octopus` | Tám xúc tu... đủ để tóm tất cả các ngươi. | [mischievously] Tám xúc tu... đủ để tóm tất cả các ngươi. | Nhầy nhụa, ranh mãnh |
| ⬜ | `taunt_stealth.mp3` | `taunt_stealth` | Các ngươi... không thể bắn thứ mình không nhìn thấy. | [whispers] Các ngươi... không thể bắn thứ mình không nhìn thấy. | Thì thầm, lạnh lùng |
| ⬜ | `taunt_spider.mp3` | `taunt_spider` | Lại gần đây... mắc vào lưới của ta đi. | [mischievously] Lại gần đây... mắc vào lưới của ta đi. | Rít, ranh mãnh |
| ⬜ | `taunt_devourer.mp3` | `taunt_devourer` | Đói quá... Trái Đất trông thật ngon miệng. | [hungry] Đói quá... Trái Đất trông thật ngon miệng. | Gầm gừ, thèm thuồng |
| ⬜ | `taunt_crystal.mp3` | `taunt_crystal` | Pha lê của ta... vĩnh cửu. | [cold] Pha lê của ta... vĩnh cửu. | Lạnh, vang vọng |
| ⬜ | `taunt_mother.mp3` | `taunt_mother` | Các con của ta... hãy đi bắt chúng về. | [commanding] Các con của ta... hãy đi bắt chúng về. | Ra lệnh, uy quyền |
| ⬜ | `taunt_planet.mp3` | `taunt_planet` | Ta đã thiêu rụi hàng nghìn thế giới. Các ngươi là kế tiếp. | [menacing] Ta đã thiêu rụi hàng nghìn thế giới. Các ngươi là kế tiếp. | Rất trầm, vang |
| ⬜ | `taunt_dragon.mp3` | `taunt_dragon` | Quỳ xuống... trước Rồng Không Gian! | [roars] Quỳ xuống... trước Rồng Không Gian! | Gầm, uy lực tối đa |
| ⬜ | `devour_eaten.mp3` | `devour_eaten` | Ngon quá... | [satisfied] Ngon quá... | Trùm nuốt xong, khoái chí |
| ⬜ | `player_boss_taunt_1.mp3` | `player_boss_taunt` | Giờ ta mới là trùm! Thử hạ ta xem! | [laughs] Giờ ta mới là trùm! Thử hạ ta xem! | Khiêu khích, vui vẻ |
| ⬜ | `player_boss_taunt_2.mp3` | `player_boss_taunt` | Chiếc UFO này giờ là của ta! | [mischievously] Chiếc UFO này giờ là của ta! | Khiêu khích |
| ⬜ | `traitor_welcome.mp3` | `traitor_welcome` | Chào mừng gia nhập phe ta... | [mischievously] Chào mừng gia nhập phe ta... | Ranh mãnh |
| ⬜ | `boss_death_ufo.mp3` | `boss_death` | Không... thể... nào... | [gasps] Không... thể... nào... | Trùm trúng đòn chí mạng, hấp hối |
| ⬜ | `lose_ufo.mp3` | `lose_ufo` | Hahaha! Cả live đã bị bắt cóc! | [laughs] Hahaha! Cả live đã bị bắt cóc! | Cười đắc thắng |
| ⬜ | `lose_ufo2.mp3` | `lose_ufo2` | Dịch chuyển hoàn tất. Các ngươi thuộc về ta. | [cold] Dịch chuyển hoàn tất. Các ngươi thuộc về ta. | Lạnh, máy móc |
| ⬜ | `lose_ufo3.mp3` | `lose_ufo3` | Mất điện rồi nhé, lũ người nhỏ bé. | [mischievously] Mất điện rồi nhé, lũ người nhỏ bé. | Chế giễu |
| ⬜ | `lose_gold.mp3` | `lose_gold` | Tất cả... hoá vàng! | [arrogant] Tất cả... hoá vàng! | Kiêu ngạo |
| ⬜ | `lose_octopus.mp3` | `lose_octopus` | Mực của ta nhấn chìm tất cả! | [laughs] Mực của ta nhấn chìm tất cả! | Cười nhầy nhụa |
| ⬜ | `lose_stealth.mp3` | `lose_stealth` | Các ngươi... đã biến mất. | [whispers] Các ngươi... đã biến mất. | Thì thầm |
| ⬜ | `lose_spider.mp3` | `lose_spider` | Cuộn kén lại... để dành ăn dần. | [mischievously] Cuộn kén lại... để dành ăn dần. | Rít, ranh mãnh |
| ⬜ | `lose_devourer.mp3` | `lose_devourer` | Ngon... cả thành phố thật ngon. | [satisfied] Ngon... cả thành phố thật ngon. | Thoả mãn, ợ |
| ⬜ | `lose_crystal.mp3` | `lose_crystal` | Đóng băng vĩnh viễn trong pha lê. | [cold] Đóng băng vĩnh viễn trong pha lê. | Lạnh, vang |
| ⬜ | `lose_mother.mp3` | `lose_mother` | Trái Đất giờ là thuộc địa của ta! | [commanding] Trái Đất giờ là thuộc địa của ta! | Uy quyền |
| ⬜ | `lose_planet.mp3` | `lose_planet` | Thiêu rụi... tất cả! | [roars] Thiêu rụi... tất cả! | Gầm |
| ⬜ | `lose_dragon.mp3` | `lose_dragon` | Rồng Không Gian... thống trị Trái Đất! | [roars] Rồng Không Gian... thống trị Trái Đất! | Gầm, uy lực tối đa |

## Gen tự động bằng API ElevenLabs

PowerShell (thay khoá & mã giọng — lấy *Voice ID* trong trang giọng của ElevenLabs):

```powershell
$env:ELEVENLABS_API_KEY="sk_..."; $env:ELEVEN_VOICE_MC="voice_id_mc"; $env:ELEVEN_VOICE_UFO="voice_id_ufo"; npm.cmd run voice:gen
```

- Mặc định model `eleven_v3` (dùng cột Lời v3). Đổi model: `$env:ELEVEN_MODEL="eleven_multilingual_v2"` (tự dùng cột Lời thoại, bỏ thẻ cảm xúc).
- File đã có thì bỏ qua; gen lại: thêm `-- --force`. Chỉ gen 1 nhóm: `-- --only lose_` (theo tiền tố tên file).
- Mỗi câu tốn ký tự trong gói ElevenLabs của bạn; cả bộ khoảng 4766 ký tự.
