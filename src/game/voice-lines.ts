// Kịch bản lồng tiếng — nguồn duy nhất cho: game (biết câu nào phát lúc nào), file CSV/bảng gửi ElevenLabs
// (`npm run voice:list` → voice/voice-lines.csv + voice/KICH-BAN.md) và công cụ gen tự động (`npm run voice:gen`).
//
// Mỗi câu là 1 file âm thanh: voice/<file>.mp3 (hoặc .wav/.ogg/.m4a). Nhiều câu cùng `key` = các biến thể,
// game chọn ngẫu nhiên (không lặp câu vừa nói). Thiếu file nào thì game bỏ qua câu đó — thêm dần được.
//
// speaker:
//   mc  — Bình luận viên: giọng Việt, sôi nổi kiểu bình luận esports/bóng đá, rõ chữ.
//   ufo — Giọng trùm ngoài hành tinh: trầm, chậm, đe doạ, hơi máy móc.
// v3: cùng câu nhưng có thẻ cảm xúc cho model eleven_v3 ([excited], [shouts], [laughs]…). Model khác thì dùng `text`.
// prio: 1 = phụ (cảm ơn, nhắc nhẹ) · 2 = thường · 3 = quan trọng (mở/kết trận) — câu ưu tiên cao cắt câu thấp hơn.
// cd: giây tối thiểu giữa 2 lần phát cùng key (tránh nói lặp khi live đông).

export type Speaker = "mc" | "ufo";

export interface VoiceLine {
  file: string;
  key: string;
  speaker: Speaker;
  prio: 1 | 2 | 3;
  cd?: number;
  text: string;
  v3: string;
  /** hướng dẫn diễn cho người gen tiếng */
  note: string;
}

const L = (file: string, key: string, speaker: Speaker, prio: 1 | 2 | 3, text: string, v3: string, note: string, cd?: number): VoiceLine => ({ file, key, speaker, prio, text, v3, note, cd });

export const VOICE_LINES: VoiceLine[] = [
  // ───────── mở màn / giữa các vòng ─────────
  L("welcome_1", "welcome", "mc", 3, "Chào mừng đến với Bảo Vệ Trái Đất! Thả tim để bắn laser, bình luận để phóng tên lửa!", "[excited] Chào mừng đến với Bảo Vệ Trái Đất! Thả tim để bắn laser, bình luận để phóng tên lửa!", "Mở màn, hào hứng như dẫn gameshow"),
  L("welcome_2", "welcome", "mc", 3, "Cả phòng ơi, UFO sắp tới rồi! Thả tim và bình luận để cùng bảo vệ Trái Đất nào!", "[excited] Cả phòng ơi, UFO sắp tới rồi! Thả tim và bình luận để cùng bảo vệ Trái Đất nào!", "Kêu gọi cả phòng"),
  L("countdown", "countdown", "mc", 2, "Ba... hai... một...", "[dramatic] Ba... hai... một...", "Đếm ngược chậm, mỗi số cách ~1 giây (tổng ~3 giây)"),
  L("revenge_1", "revenge", "mc", 2, "Đừng bỏ cuộc! Vòng sau chúng ta phục thù!", "[determined] Đừng bỏ cuộc! Vòng sau chúng ta phục thù!", "Sau khi thua, động viên"),
  L("revenge_2", "revenge", "mc", 2, "Thua một trận thôi! Thả tim thật nhiều để lấy lại Trái Đất!", "[determined] Thua một trận thôi! Thả tim thật nhiều để lấy lại Trái Đất!", "Sau khi thua"),
  L("next_boss", "next_boss", "mc", 2, "Cẩn thận! Vòng sau sẽ là trận đánh trùm!", "[serious] Cẩn thận! Vòng sau sẽ là trận đánh trùm!", "Màn nghỉ trước trận trùm mốc chuỗi thắng"),

  // ───────── bắt đầu trận ─────────
  L("round_start_1", "round_start", "mc", 3, "Cảnh báo! UFO xâm lược đang hạ cánh!", "[shouts] Cảnh báo! UFO xâm lược đang hạ cánh!", "Còi báo động, gấp gáp"),
  L("round_start_2", "round_start", "mc", 3, "Radar phát hiện vật thể lạ! Chuẩn bị chiến đấu!", "[urgent] Radar phát hiện vật thể lạ! Chuẩn bị chiến đấu!", "Gấp gáp"),
  L("round_start_3", "round_start", "mc", 3, "Tất cả vào vị trí! Một chiếc đĩa bay vừa xuất hiện!", "[urgent] Tất cả vào vị trí! Một chiếc đĩa bay vừa xuất hiện!", "Gấp gáp"),
  L("fight_1", "fight", "mc", 2, "Khai hoả!", "[shouts] Khai hoả!", "Hô to, ngắn"),
  L("fight_2", "fight", "mc", 2, "Bắn!", "[shouts] Bắn!", "Hô to, ngắn"),
  L("fight_3", "fight", "mc", 2, "Cả phòng, tấn công!", "[shouts] Cả phòng, tấn công!", "Hô to"),
  L("taunt_ufo_1", "taunt_ufo", "ufo", 2, "Lũ người Trái Đất... hãy đầu hàng đi.", "[menacing] Lũ người Trái Đất... hãy đầu hàng đi.", "Trầm, chậm, khinh thường"),
  L("taunt_ufo_2", "taunt_ufo", "ufo", 2, "Hành tinh này... sẽ thuộc về chúng ta.", "[menacing] Hành tinh này... sẽ thuộc về chúng ta.", "Trầm, chậm"),

  // ───────── trùm xuất hiện (bình luận viên) + câu khiêu khích của trùm ─────────
  L("boss_gold", "boss_gold", "mc", 3, "Trùm xuất hiện! Đĩa Vàng Hoàng Gia, giáp cực dày! Dồn hết hoả lực!", "[excited] Trùm xuất hiện! Đĩa Vàng Hoàng Gia, giáp cực dày! Dồn hết hoả lực!", "Trùm ngẫu nhiên"),
  L("taunt_gold", "taunt_gold", "ufo", 2, "Vàng của ta... không gì xuyên thủng được.", "[arrogant] Vàng của ta... không gì xuyên thủng được.", "Kiêu ngạo, quý tộc"),
  L("boss_octopus", "boss_octopus", "mc", 3, "Bạch Tuộc Vũ Trụ! Coi chừng xúc tu tóm người!", "[excited] Bạch Tuộc Vũ Trụ! Coi chừng xúc tu tóm người!", "Trùm ngẫu nhiên"),
  L("taunt_octopus", "taunt_octopus", "ufo", 2, "Tám xúc tu... đủ để tóm tất cả các ngươi.", "[mischievously] Tám xúc tu... đủ để tóm tất cả các ngươi.", "Nhầy nhụa, ranh mãnh"),
  L("boss_stealth", "boss_stealth", "mc", 3, "Tàu Tàng Hình Bóng Đêm! Nó có thể biến mất bất cứ lúc nào!", "[excited] Tàu Tàng Hình Bóng Đêm! Nó có thể biến mất bất cứ lúc nào!", "Trùm ngẫu nhiên"),
  L("taunt_stealth", "taunt_stealth", "ufo", 2, "Các ngươi... không thể bắn thứ mình không nhìn thấy.", "[whispers] Các ngươi... không thể bắn thứ mình không nhìn thấy.", "Thì thầm, lạnh lùng"),
  L("boss_spider", "boss_spider", "mc", 3, "Nhện Vũ Trụ! Lưới tơ chặn laser, bình luận để xé lưới!", "[excited] Nhện Vũ Trụ! Lưới tơ chặn laser, bình luận để xé lưới!", "Trùm ngẫu nhiên"),
  L("taunt_spider", "taunt_spider", "ufo", 2, "Lại gần đây... mắc vào lưới của ta đi.", "[mischievously] Lại gần đây... mắc vào lưới của ta đi.", "Rít, ranh mãnh"),
  L("boss_devourer", "boss_devourer", "mc", 3, "Kẻ Nuốt Hành Tinh! Đừng để nó nuốt mất ai!", "[excited] Kẻ Nuốt Hành Tinh! Đừng để nó nuốt mất ai!", "Trùm ngẫu nhiên"),
  L("taunt_devourer", "taunt_devourer", "ufo", 2, "Đói quá... Trái Đất trông thật ngon miệng.", "[hungry] Đói quá... Trái Đất trông thật ngon miệng.", "Gầm gừ, thèm thuồng"),
  L("boss_crystal", "boss_crystal", "mc", 3, "Trùm chuỗi thắng! Pháo Đài Tinh Thể với khiên pha lê! Phá khiên trước!", "[excited] Trùm chuỗi thắng! Pháo Đài Tinh Thể với khiên pha lê! Phá khiên trước!", "Trùm mốc chuỗi 10"),
  L("taunt_crystal", "taunt_crystal", "ufo", 2, "Pha lê của ta... vĩnh cửu.", "[cold] Pha lê của ta... vĩnh cửu.", "Lạnh, vang vọng"),
  L("boss_mother", "boss_mother", "mc", 3, "Phi Thuyền Mẹ! Bắn rơi UFO con trước khi chúng chạm phố!", "[excited] Phi Thuyền Mẹ! Bắn rơi UFO con trước khi chúng chạm phố!", "Trùm mốc chuỗi 20"),
  L("taunt_mother", "taunt_mother", "ufo", 2, "Các con của ta... hãy đi bắt chúng về.", "[commanding] Các con của ta... hãy đi bắt chúng về.", "Ra lệnh, uy quyền"),
  L("boss_planet", "boss_planet", "mc", 3, "Hành Tinh Hủy Diệt! Ngắt mắt hủy diệt trước khi nó khai hoả!", "[excited] Hành Tinh Hủy Diệt! Ngắt mắt hủy diệt trước khi nó khai hoả!", "Trùm mốc chuỗi 30"),
  L("taunt_planet", "taunt_planet", "ufo", 2, "Ta đã thiêu rụi hàng nghìn thế giới. Các ngươi là kế tiếp.", "[menacing] Ta đã thiêu rụi hàng nghìn thế giới. Các ngươi là kế tiếp.", "Rất trầm, vang"),
  L("boss_dragon", "boss_dragon", "mc", 3, "Không thể tin được! Trùm siêu cấp! Rồng Không Gian đã xuất hiện!", "[shouts] Không thể tin được! Trùm siêu cấp! Rồng Không Gian đã xuất hiện!", "Trùm siêu cấp chuỗi 50 — cao trào nhất"),
  L("taunt_dragon", "taunt_dragon", "ufo", 2, "Quỳ xuống... trước Rồng Không Gian!", "[roars] Quỳ xuống... trước Rồng Không Gian!", "Gầm, uy lực tối đa"),

  // ───────── trong trận ─────────
  L("danger_1", "danger", "mc", 2, "Nguy hiểm! UFO sắp chạm đất! Thả tim nhanh lên!", "[panicked] Nguy hiểm! UFO sắp chạm đất! Thả tim nhanh lên!", "Hoảng, gấp"),
  L("danger_2", "danger", "mc", 2, "Không còn nhiều thời gian! Dồn hết sức bắn!", "[panicked] Không còn nhiều thời gian! Dồn hết sức bắn!", "Hoảng, gấp"),
  L("half_hp_1", "half_hp", "mc", 1, "UFO đã mất một nửa máu! Cố lên cả phòng!", "[excited] UFO đã mất một nửa máu! Cố lên cả phòng!", "Phấn khích"),
  L("half_hp_2", "half_hp", "mc", 1, "Được rồi! Nó đang yếu đi!", "[excited] Được rồi! Nó đang yếu đi!", "Phấn khích"),
  L("low_hp_1", "low_hp", "mc", 2, "Sắp hạ được rồi! Một chút nữa thôi!", "[excited] Sắp hạ được rồi! Một chút nữa thôi!", "Rất phấn khích"),
  L("low_hp_2", "low_hp", "mc", 2, "Nó sắp nổ tung rồi! Bắn tiếp đi!", "[shouts] Nó sắp nổ tung rồi! Bắn tiếp đi!", "Rất phấn khích"),
  L("golden_1", "golden", "mc", 2, "Đạn vàng kích hoạt! Sát thương nhân đôi!", "[excited] Đạn vàng kích hoạt! Sát thương nhân đôi!", "Phấn khích", 10),
  L("golden_2", "golden", "mc", 2, "Năng lượng đầy! Đạn vàng nhân đôi!", "[excited] Năng lượng đầy! Đạn vàng nhân đôi!", "Phấn khích", 10),
  L("crate", "crate", "mc", 2, "Rương tiếp tế đang rơi xuống!", "[excited] Rương tiếp tế đang rơi xuống!", "Vui", 8),
  L("gift_thanks_1", "gift_thanks", "mc", 1, "Cảm ơn món quà!", "[warm] Cảm ơn món quà!", "Ấm áp, nhanh", 15),
  L("gift_thanks_2", "gift_thanks", "mc", 1, "Quá tuyệt, cảm ơn bạn!", "[warm] Quá tuyệt, cảm ơn bạn!", "Ấm áp, nhanh", 15),
  L("gift_thanks_3", "gift_thanks", "mc", 1, "Vũ khí mới đã sẵn sàng, cảm ơn nhé!", "[warm] Vũ khí mới đã sẵn sàng, cảm ơn nhé!", "Ấm áp", 15),
  L("gift_cannon", "gift_cannon", "mc", 3, "Pháo Trái Đất khai hoả! Cảm ơn bạn rất nhiều!", "[shouts] Pháo Trái Đất khai hoả! Cảm ơn bạn rất nhiều!", "Bùng nổ — quà lớn (Thiên hà, Pháo hoa)", 6),
  L("gift_orbital", "gift_orbital", "mc", 3, "Siêu vũ khí vũ trụ! Cả thành phố rung chuyển!", "[shouts] Siêu vũ khí vũ trụ! Cả thành phố rung chuyển!", "Bùng nổ tối đa — quà khủng (Sư tử, Vũ trụ)", 6),
  L("follow", "follow", "mc", 1, "Cảm ơn bạn đã theo dõi! Lá chắn đã dựng lên!", "[warm] Cảm ơn bạn đã theo dõi! Lá chắn đã dựng lên!", "Ấm áp", 20),
  L("share", "share", "mc", 1, "Viện binh đã tới! Cảm ơn bạn đã chia sẻ!", "[warm] Viện binh đã tới! Cảm ơn bạn đã chia sẻ!", "Ấm áp", 20),

  // ───────── kỹ năng trùm ─────────
  L("grab", "grab", "mc", 2, "Bạch tuộc tóm người! Dồn sát thương để giải cứu!", "[urgent] Bạch tuộc tóm người! Dồn sát thương để giải cứu!", "Gấp"),
  L("rescued", "rescued", "mc", 2, "Giải cứu thành công!", "[excited] Giải cứu thành công!", "Mừng rỡ"),
  L("cloak", "cloak", "mc", 2, "Nó tàng hình rồi! Đạn sẽ bắn trượt!", "[urgent] Nó tàng hình rồi! Đạn sẽ bắn trượt!", "Gấp", 20),
  L("web", "web", "mc", 2, "Lưới tơ giăng ra! Bình luận để xé lưới!", "[urgent] Lưới tơ giăng ra! Bình luận để xé lưới!", "Gấp"),
  L("web_torn", "web_torn", "mc", 2, "Lưới tơ đã rách!", "[excited] Lưới tơ đã rách!", "Mừng rỡ"),
  L("shield_up", "shield_up", "mc", 2, "Khiên tinh thể hồi phục! Phá khiên trước!", "[urgent] Khiên tinh thể hồi phục! Phá khiên trước!", "Gấp"),
  L("shield_break", "shield_break", "mc", 2, "Khiên tinh thể đã vỡ!", "[excited] Khiên tinh thể đã vỡ!", "Mừng rỡ"),
  L("drones", "drones", "mc", 2, "UFO con đang lao xuống! Bắn rơi chúng ngay!", "[urgent] UFO con đang lao xuống! Bắn rơi chúng ngay!", "Gấp", 14),
  L("charge", "charge", "mc", 2, "Mắt hủy diệt đang sạc! Ngắt nó ngay!", "[panicked] Mắt hủy diệt đang sạc! Ngắt nó ngay!", "Hoảng"),
  L("charge_stopped", "charge_stopped", "mc", 2, "Ngắt thành công!", "[excited] Ngắt thành công!", "Mừng rỡ"),
  L("charge_fired", "charge_fired", "mc", 2, "Ối không! Tia hủy diệt đã khai hoả!", "[shocked] Ối không! Tia hủy diệt đã khai hoả!", "Sốc"),
  L("breath", "breath", "mc", 2, "Rồng đang hít hơi! Ngắt hơi thở ngay!", "[panicked] Rồng đang hít hơi! Ngắt hơi thở ngay!", "Hoảng"),
  L("breath_fired", "breath_fired", "mc", 2, "Hơi thở hư không! Cả phòng bị choáng!", "[shocked] Hơi thở hư không! Cả phòng bị choáng!", "Sốc"),
  L("devour", "devour", "mc", 2, "Hố đen đang hút người! Bắt nó nhả ra!", "[panicked] Hố đen đang hút người! Bắt nó nhả ra!", "Hoảng"),
  L("devour_saved", "devour_saved", "mc", 2, "Nó nghẹn rồi! Mọi người được nhả ra!", "[excited] Nó nghẹn rồi! Mọi người được nhả ra!", "Mừng rỡ"),
  L("devour_eaten", "devour_eaten", "ufo", 2, "Ngon quá...", "[satisfied] Ngon quá...", "Trùm nuốt xong, khoái chí"),

  // ───────── trùm người xem & kẻ phản bội ─────────
  L("player_boss_queued", "player_boss_queued", "mc", 2, "Có người vừa giành quyền làm trùm ở vòng sau!", "[excited] Có người vừa giành quyền làm trùm ở vòng sau!", "Phấn khích", 8),
  L("player_boss_intro", "player_boss_intro", "mc", 3, "Trùm người xem xuất hiện! Cả phòng hạ gục người đã chiếm UFO!", "[excited] Trùm người xem xuất hiện! Cả phòng hạ gục người đã chiếm UFO!", "Mở trận trùm người xem"),
  L("player_boss_taunt_1", "player_boss_taunt", "ufo", 2, "Giờ ta mới là trùm! Thử hạ ta xem!", "[laughs] Giờ ta mới là trùm! Thử hạ ta xem!", "Khiêu khích, vui vẻ"),
  L("player_boss_taunt_2", "player_boss_taunt", "ufo", 2, "Chiếc UFO này giờ là của ta!", "[mischievously] Chiếc UFO này giờ là của ta!", "Khiêu khích"),
  L("player_boss_down", "player_boss_down", "mc", 3, "Trùm người xem đã bị hạ gục! Trái Đất an toàn!", "[excited] Trùm người xem đã bị hạ gục! Trái Đất an toàn!", "Chiến thắng"),
  L("player_boss_win", "player_boss_win", "mc", 3, "Trùm người xem đã chiếm Trái Đất!", "[shocked] Trùm người xem đã chiếm Trái Đất!", "Thua trước trùm người xem"),
  L("traitor_1", "traitor", "mc", 2, "Có kẻ phản bội! Bắn hạ UFO đỏ!", "[shouts] Có kẻ phản bội! Bắn hạ UFO đỏ!", "Gấp, phẫn nộ (vui)", 10),
  L("traitor_2", "traitor", "mc", 2, "Một người vừa đổi phe! Tập trung bắn UFO đỏ!", "[shouts] Một người vừa đổi phe! Tập trung bắn UFO đỏ!", "Gấp", 10),
  L("traitor_welcome", "traitor_welcome", "ufo", 1, "Chào mừng gia nhập phe ta...", "[mischievously] Chào mừng gia nhập phe ta...", "Ranh mãnh", 15),
  L("traitor_down_1", "traitor_down", "mc", 2, "Kẻ phản bội đã bị bắn hạ!", "[excited] Kẻ phản bội đã bị bắn hạ!", "Hả hê", 6),
  L("traitor_down_2", "traitor_down", "mc", 2, "Hạ gục UFO đỏ! Quay về phe Trái Đất đi!", "[laughs] Hạ gục UFO đỏ! Quay về phe Trái Đất đi!", "Hả hê", 6),
  L("traitor_return", "traitor_return", "mc", 1, "Chào mừng trở về phe Trái Đất!", "[warm] Chào mừng trở về phe Trái Đất!", "Ấm áp", 10),

  // ───────── kết trận: thắng ─────────
  L("win_1", "win", "mc", 3, "Trái Đất an toàn! Cả phòng quá đỉnh!", "[excited] Trái Đất an toàn! Cả phòng quá đỉnh!", "Ăn mừng"),
  L("win_2", "win", "mc", 3, "Bắn hạ UFO! Một chiến thắng tuyệt vời!", "[excited] Bắn hạ UFO! Một chiến thắng tuyệt vời!", "Ăn mừng"),
  L("win_3", "win", "mc", 3, "Nổ tung rồi! Trái Đất vẫn an toàn!", "[excited] Nổ tung rồi! Trái Đất vẫn an toàn!", "Ăn mừng"),
  L("win_boss_1", "win_boss", "mc", 3, "Hạ gục trùm! Một chiến thắng huyền thoại!", "[shouts] Hạ gục trùm! Một chiến thắng huyền thoại!", "Ăn mừng lớn"),
  L("win_boss_2", "win_boss", "mc", 3, "Trùm đã gục ngã! Cả phòng là anh hùng!", "[shouts] Trùm đã gục ngã! Cả phòng là anh hùng!", "Ăn mừng lớn"),
  L("win_super", "win_super", "mc", 3, "Không thể tin nổi! Rồng Không Gian đã bị tiêu diệt! Huyền thoại!", "[shouts] Không thể tin nổi! Rồng Không Gian đã bị tiêu diệt! Huyền thoại!", "Cao trào nhất, hét to"),
  L("mvp_1", "mvp", "mc", 2, "Xin chúc mừng xạ thủ xuất sắc nhất trận!", "[warm] Xin chúc mừng xạ thủ xuất sắc nhất trận!", "Vinh danh"),
  L("mvp_2", "mvp", "mc", 2, "Và đây là người hùng của trận đấu!", "[warm] Và đây là người hùng của trận đấu!", "Vinh danh"),
  L("record", "record", "mc", 2, "Kỷ lục chuỗi thắng mới!", "[excited] Kỷ lục chuỗi thắng mới!", "Phấn khích"),
  L("boss_death_ufo", "boss_death", "ufo", 2, "Không... thể... nào...", "[gasps] Không... thể... nào...", "Trùm trúng đòn chí mạng, hấp hối"),

  // ───────── kết trận: thua (mỗi trùm một câu, giọng trùm) ─────────
  L("lose_1", "lose", "mc", 3, "Không! Trái Đất đã thất thủ...", "[sad] Không! Trái Đất đã thất thủ...", "Tiếc nuối"),
  L("lose_2", "lose", "mc", 3, "Chúng ta đã không kịp ngăn nó lại...", "[sighs] Chúng ta đã không kịp ngăn nó lại...", "Tiếc nuối"),
  L("lose_ufo", "lose_ufo", "ufo", 2, "Hahaha! Cả live đã bị bắt cóc!", "[laughs] Hahaha! Cả live đã bị bắt cóc!", "Cười đắc thắng"),
  L("lose_ufo2", "lose_ufo2", "ufo", 2, "Dịch chuyển hoàn tất. Các ngươi thuộc về ta.", "[cold] Dịch chuyển hoàn tất. Các ngươi thuộc về ta.", "Lạnh, máy móc"),
  L("lose_ufo3", "lose_ufo3", "ufo", 2, "Mất điện rồi nhé, lũ người nhỏ bé.", "[mischievously] Mất điện rồi nhé, lũ người nhỏ bé.", "Chế giễu"),
  L("lose_gold", "lose_gold", "ufo", 2, "Tất cả... hoá vàng!", "[arrogant] Tất cả... hoá vàng!", "Kiêu ngạo"),
  L("lose_octopus", "lose_octopus", "ufo", 2, "Mực của ta nhấn chìm tất cả!", "[laughs] Mực của ta nhấn chìm tất cả!", "Cười nhầy nhụa"),
  L("lose_stealth", "lose_stealth", "ufo", 2, "Các ngươi... đã biến mất.", "[whispers] Các ngươi... đã biến mất.", "Thì thầm"),
  L("lose_spider", "lose_spider", "ufo", 2, "Cuộn kén lại... để dành ăn dần.", "[mischievously] Cuộn kén lại... để dành ăn dần.", "Rít, ranh mãnh"),
  L("lose_devourer", "lose_devourer", "ufo", 2, "Ngon... cả thành phố thật ngon.", "[satisfied] Ngon... cả thành phố thật ngon.", "Thoả mãn, ợ"),
  L("lose_crystal", "lose_crystal", "ufo", 2, "Đóng băng vĩnh viễn trong pha lê.", "[cold] Đóng băng vĩnh viễn trong pha lê.", "Lạnh, vang"),
  L("lose_mother", "lose_mother", "ufo", 2, "Trái Đất giờ là thuộc địa của ta!", "[commanding] Trái Đất giờ là thuộc địa của ta!", "Uy quyền"),
  L("lose_planet", "lose_planet", "ufo", 2, "Thiêu rụi... tất cả!", "[roars] Thiêu rụi... tất cả!", "Gầm"),
  L("lose_dragon", "lose_dragon", "ufo", 2, "Rồng Không Gian... thống trị Trái Đất!", "[roars] Rồng Không Gian... thống trị Trái Đất!", "Gầm, uy lực tối đa"),
];

/** câu theo key (các biến thể) */
export function linesFor(key: string) {
  return VOICE_LINES.filter((l) => l.key === key);
}
