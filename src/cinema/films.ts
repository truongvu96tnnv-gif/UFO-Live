// Kịch bản phim tương tác. Mỗi phim là một đồ thị cảnh: cảnh có lựa chọn → cả rạp bình luận 1 / 2 để chọn nhánh.
// {hero} / {friend} được thay bằng tên 2 người xem được chọn "đóng vai" ở đầu suất chiếu.
// Thêm phim = thêm 1 phần tử vào FILMS (chạy `npm test` để kiểm tra mọi nhánh đều dẫn tới một cái kết).

export type BgId = "village" | "field" | "space" | "boba" | "alley" | "house" | "kitchen" | "stage";
export type Mood = "calm" | "tense" | "spooky" | "funny" | "epic" | "sad" | "happy";
/** Ai đứng trên màn hình: 2 vai người xem, hoặc nhân vật vẽ sẵn */
export type Actor = "hero" | "friend" | "alien" | "grandma" | "ghost" | "cat" | "crowd";
export type EndingKind = "happy" | "funny" | "sad" | "twist";

export interface Option {
  label: string;
  next: string;
}

export interface Scene {
  id: string;
  bg: BgId;
  mood: Mood;
  cast: Actor[];
  lines: string[];
  choice?: { prompt: string; options: [Option, Option] };
  next?: string;
  ending?: { title: string; kind: EndingKind };
}

export interface Film {
  id: string;
  title: string;
  tagline: string;
  genre: string;
  /** màu chủ đạo của poster (hue) */
  hue: number;
  start: string;
  /** tên dự phòng khi rạp chưa có ai để đóng vai */
  fallback: [string, string];
  scenes: Record<string, Scene>;
}

const film = (f: Omit<Film, "scenes"> & { scenes: Scene[] }): Film => ({ ...f, scenes: Object.fromEntries(f.scenes.map((s) => [s.id, s])) });

export const FILMS: Film[] = [
  film({
    id: "ufo-lang",
    title: "ĐÊM UFO GHÉ LÀNG",
    tagline: "Một vệt sáng xanh rơi xuống ruộng lúa…",
    genre: "👽 Viễn tưởng · Hài",
    hue: 160,
    start: "u1",
    fallback: ["Tí", "Tèo"],
    scenes: [
      {
        id: "u1", bg: "village", mood: "calm", cast: ["hero"],
        lines: ["Đêm rằm. Cả làng Vân Nội mất điện.", "{hero} ra đồng bắt đom đóm thì…", "VÙUUU! Một vệt sáng xanh lao xuống ruộng lúa!"],
        choice: { prompt: "{hero} nên làm gì?", options: [{ label: "Chạy lại xem", next: "u2a" }, { label: "Gọi {friend} đi cùng", next: "u2b" }] },
      },
      {
        id: "u2a", bg: "field", mood: "tense", cast: ["hero", "alien"],
        lines: ["{hero} rón rén lại gần. Một chiếc đĩa bay bé xíu đang bốc khói.", "Cửa mở. Một sinh vật xanh lè ló đầu ra, mắt to như hai cái bát.", "Nó nhìn {hero}… rồi chìa ra một cái xô rỗng."],
        choice: { prompt: "Sinh vật lạ chìa cái xô ra…", options: [{ label: "Múc nước cho nó", next: "u3water" }, { label: "Bỏ chạy về nhà", next: "u3run" }] },
      },
      {
        id: "u2b", bg: "field", mood: "funny", cast: ["hero", "friend", "alien"],
        lines: ["{friend} đang ngủ thì bị dựng dậy bằng 3 cuộc gọi nhỡ.", "Hai đứa cầm đèn pin… và thêm cái chổi để phòng thân.", "Giữa ruộng: một chiếc đĩa bay bốc khói, bên cạnh là sinh vật xanh đang khóc hu hu."],
        choice: { prompt: "Sinh vật xanh đang khóc!", options: [{ label: "Dỗ dành nó", next: "u3water" }, { label: "Quay video đăng TikTok", next: "u3tiktok" }] },
      },
      {
        id: "u3water", bg: "field", mood: "happy", cast: ["hero", "alien"],
        lines: ["Sinh vật uống một hơi hết sạch xô nước. Đĩa bay sáng đèn trở lại!", "Nó tự giới thiệu: tên là Bíp, 312 tuổi, lạc đường khi đi giao trà sữa liên ngân hà.", "Bíp vẫy tay mời {hero} lên tàu."],
        choice: { prompt: "Bíp mời lên tàu!", options: [{ label: "Lên tàu bay thử", next: "u4fly" }, { label: "Mời Bíp ở lại ăn cơm", next: "uEndDinner" }] },
      },
      {
        id: "u3run", bg: "village", mood: "spooky", cast: ["hero", "alien"],
        lines: ["{hero} chạy một mạch về nhà, trùm chăn kín mít.", "Cộc. Cộc. Cộc. Có tiếng gõ cửa sổ.", "Ngoài cửa sổ, sinh vật xanh vẫn đứng đó, tay cầm cái xô… và một bó lúa làm quà."],
        choice: { prompt: "Nó đang gõ cửa sổ…", options: [{ label: "Mở cửa", next: "u3water" }, { label: "Gọi cả làng dậy", next: "uEndVillage" }] },
      },
      {
        id: "u3tiktok", bg: "field", mood: "funny", cast: ["hero", "friend", "alien"],
        lines: ["Video lên xu hướng sau 7 phút. 2 triệu lượt xem.", "Bíp thấy mình nổi tiếng, mắt sáng rực như đèn pha.", "Nó xin {hero} dạy cách… live TikTok."],
        choice: { prompt: "Bíp muốn làm idol!", options: [{ label: "Dạy Bíp live", next: "uEndLive" }, { label: "Giúp Bíp sửa tàu", next: "u4fly" }] },
      },
      {
        id: "u4fly", bg: "space", mood: "epic", cast: ["hero", "alien"],
        lines: ["Đĩa bay vọt lên trời. Làng Vân Nội bé lại như hạt đậu.", "Bíp chỉ vào nút đỏ: “Nút này là đi nhanh. Hoặc tự huỷ. Tôi quên rồi.”", "Phía trước là một hố đen… và một quán trà sữa đang sáng đèn."],
        choice: { prompt: "Hố đen ngay phía trước!", options: [{ label: "Bấm nút đỏ", next: "uEndLoop" }, { label: "Ghé quán trà sữa", next: "uEndBoba" }] },
      },
      {
        id: "uEndDinner", bg: "village", mood: "happy", cast: ["hero", "friend", "alien"],
        lines: ["Bíp ăn hết 4 bát cơm, khen nước mắm là “ngon nhất thiên hà”.", "Từ đó, mỗi đêm rằm, làng Vân Nội lại thấy một ánh đèn xanh ghé ăn ké."],
        ending: { title: "BẠN THÂN NGOÀI HÀNH TINH", kind: "happy" },
      },
      {
        id: "uEndVillage", bg: "village", mood: "funny", cast: ["hero", "crowd"],
        lines: ["Cả làng kéo ra với nồi niêu xoong chảo, gõ inh ỏi.", "Bíp sợ quá bay mất, bỏ quên cái xô.", "Cái xô giờ được trưng ở đình làng: “XÔ NGƯỜI NGOÀI HÀNH TINH — CẤM SỜ”."],
        ending: { title: "CÁI XÔ HUYỀN THOẠI", kind: "funny" },
      },
      {
        id: "uEndLive", bg: "stage", mood: "funny", cast: ["hero", "alien"],
        lines: ["Phiên live đầu tiên của Bíp: 3 triệu người xem. Toàn người ngoài hành tinh.", "Họ thả tim bằng… xúc tu.", "{hero} trở thành quản lý của idol ngoài hành tinh đầu tiên."],
        ending: { title: "IDOL LIÊN NGÂN HÀ", kind: "funny" },
      },
      {
        id: "uEndLoop", bg: "space", mood: "tense", cast: ["hero", "alien"],
        lines: ["Hoá ra đó là nút đi nhanh. Nhanh tới mức… quay ngược thời gian.", "{hero} tỉnh dậy giữa ruộng lúa. Đêm rằm. Mất điện.", "VÙUUU! Một vệt sáng xanh lao xuống…"],
        ending: { title: "VÒNG LẶP VÔ TẬN", kind: "twist" },
      },
      {
        id: "uEndBoba", bg: "boba", mood: "happy", cast: ["hero", "alien"],
        lines: ["Đó là quán trà sữa của mẹ Bíp. Bíp bị mắng vì giao hàng trễ 300 năm.", "{hero} được tặng thẻ thành viên trọn đời: trà sữa miễn phí ở mọi hành tinh."],
        ending: { title: "TRÀ SỮA VŨ TRỤ", kind: "happy" },
      },
    ],
  }),
  film({
    id: "nha-cuoi-hem",
    title: "NGÔI NHÀ CUỐI HẺM",
    tagline: "20 năm bỏ hoang. Tối nay, đèn bỗng sáng.",
    genre: "👻 Kinh dị · Hài",
    hue: 280,
    start: "h1",
    fallback: ["Bin", "Bon"],
    scenes: [
      {
        id: "h1", bg: "alley", mood: "spooky", cast: ["hero", "friend"],
        lines: ["Hẻm 13, 11 giờ đêm. Căn nhà cuối hẻm đã bỏ hoang 20 năm.", "Tối nay, cửa sổ tầng hai bỗng sáng đèn.", "{hero} và {friend} đứng trước cổng, tim đập thình thịch."],
        choice: { prompt: "Vào bằng đường nào?", options: [{ label: "Cửa chính", next: "h2door" }, { label: "Trèo cửa sau", next: "h2back" }] },
      },
      {
        id: "h2door", bg: "house", mood: "spooky", cast: ["hero", "friend", "ghost"],
        lines: ["Cánh cửa kêu kẽo kẹt… rồi tự đóng sầm sau lưng.", "Trong bóng tối có tiếng thì thầm: “Ai… ăn… cơm… chưa…?”", "{friend} nắm tay {hero} chặt tới mức tê rần."],
        choice: { prompt: "Tiếng thì thầm hỏi: ăn cơm chưa?", options: [{ label: "Trả lời: “Chưa ạ”", next: "h3kitchen" }, { label: "Hét thật to", next: "h3scream" }] },
      },
      {
        id: "h2back", bg: "kitchen", mood: "tense", cast: ["hero", "friend", "cat"],
        lines: ["Cửa sau dẫn vào bếp. Trên bếp, một nồi nước đang sôi lục bục.", "Không có ai. Nhưng con dao tự thái hành: xoạch, xoạch, xoạch.", "Một con mèo đen ngồi trên tủ, nhìn hai đứa không chớp mắt."],
        choice: { prompt: "Con mèo đang nhìn…", options: [{ label: "Bắt chuyện với con mèo", next: "h3cat" }, { label: "Nếm thử nồi nước", next: "h3kitchen" }] },
      },
      {
        id: "h3scream", bg: "house", mood: "funny", cast: ["hero", "friend", "grandma"],
        lines: ["AAAAA! {hero} hét. {friend} hét. Cái gì đó trong bóng tối cũng hét.", "Đèn bật. Một bà cụ tóc bạc đeo tai nghe, tay cầm cái muôi.", "“Hét gì mà hét! Bà đang tập hát karaoke!”"],
        choice: { prompt: "Bà cụ đang bực mình!", options: [{ label: "Xin lỗi bà", next: "hEndGrandma" }, { label: "Hát cùng bà", next: "hEndKaraoke" }] },
      },
      {
        id: "h3kitchen", bg: "kitchen", mood: "calm", cast: ["hero", "friend", "ghost"],
        lines: ["Bếp sáng đèn. Một bà cụ… trong suốt… đang đổ bánh xèo.", "“Hai mươi năm nay chẳng ai ghé ăn. Ngồi đi các cháu.”", "Mùi bánh xèo thơm tới mức {friend} quên luôn cả sợ."],
        choice: { prompt: "Bà ma mời ăn bánh xèo…", options: [{ label: "Ăn luôn", next: "hEndGrandma" }, { label: "Hỏi vì sao bà ở đây", next: "hEndSad" }] },
      },
      {
        id: "h3cat", bg: "kitchen", mood: "funny", cast: ["hero", "friend", "cat"],
        lines: ["“Meo… à nhầm, chào.” Con mèo nói tiếng người.", "“Ta là chủ căn nhà này. Bà cụ chỉ là người làm bánh thuê.”", "“Muốn ở lại thì trả tiền nhà: một con cá khô mỗi ngày.”"],
        choice: { prompt: "Mèo đòi tiền thuê nhà!", options: [{ label: "Đồng ý thuê", next: "hEndCat" }, { label: "Bỏ chạy", next: "hEndRun" }] },
      },
      {
        id: "hEndGrandma", bg: "kitchen", mood: "happy", cast: ["hero", "friend", "grandma"],
        lines: ["Ba bà cháu ăn hết 27 cái bánh xèo.", "Hoá ra bà là hàng xóm cũ, ngày nào cũng nấu chờ con cháu về.", "Từ đó, tối thứ bảy nào {hero} và {friend} cũng ghé."],
        ending: { title: "BÁNH XÈO NỬA ĐÊM", kind: "happy" },
      },
      {
        id: "hEndKaraoke", bg: "stage", mood: "funny", cast: ["hero", "friend", "grandma"],
        lines: ["Máy chấm điểm: {hero} 42 điểm. {friend} 38 điểm.", "Bà cụ: 100 điểm. Bà là ma, nhưng hát hay thật.", "Cả hẻm 13 bị đánh thức. Không ai dám phàn nàn."],
        ending: { title: "ĐÊM NHẠC MA", kind: "funny" },
      },
      {
        id: "hEndSad", bg: "house", mood: "sad", cast: ["hero", "ghost"],
        lines: ["“Bà chờ đứa cháu đi xa. Nó hứa về ăn bánh xèo, mà chưa về.”", "{hero} ngồi ăn cùng bà tới khi trời sáng.", "Gà gáy. Bà mỉm cười, tan vào nắng sớm: “Cảm ơn cháu đã về.”"],
        ending: { title: "LỜI HỨA", kind: "sad" },
      },
      {
        id: "hEndCat", bg: "kitchen", mood: "funny", cast: ["hero", "friend", "cat"],
        lines: ["Hợp đồng được ký bằng dấu chân mèo.", "{hero} và {friend} giờ là người thuê nhà… của một con mèo.", "Từ tháng sau tiền nhà tăng lên hai con cá khô."],
        ending: { title: "CHỦ NHÀ LÀ MÈO", kind: "twist" },
      },
      {
        id: "hEndRun", bg: "alley", mood: "tense", cast: ["hero", "friend"],
        lines: ["Hai đứa chạy một mạch ra đầu hẻm. Ngoảnh lại: căn nhà đã tắt đèn.", "Sáng hôm sau, căn nhà được sơn mới, treo biển:", "“BÁNH XÈO BÀ MA — chỉ mở cửa lúc 11 giờ đêm.”"],
        ending: { title: "QUÁN MA", kind: "twist" },
      },
    ],
  }),
];

/** Thay {hero} / {friend} trong lời thoại */
export function fill(text: string, hero: string, friend: string) {
  return text.replaceAll("{hero}", hero).replaceAll("{friend}", friend);
}

/** Mọi cảnh đều tới được và mọi nhánh đều kết thúc — trả về danh sách lỗi (rỗng = kịch bản hợp lệ) */
export function checkFilm(f: Film): string[] {
  const errors: string[] = [];
  if (!f.scenes[f.start]) errors.push(`${f.id}: thiếu cảnh mở đầu ${f.start}`);
  const seen = new Set<string>();
  const walk = (id: string, path: string[]) => {
    const s = f.scenes[id];
    if (!s) return void errors.push(`${f.id}: cảnh ${path.at(-1)} trỏ tới cảnh không tồn tại "${id}"`);
    if (path.includes(id)) return void errors.push(`${f.id}: vòng lặp ${[...path, id].join(" → ")}`);
    seen.add(id);
    const outs = [s.choice?.options[0].next, s.choice?.options[1].next, s.next].filter((x): x is string => !!x);
    if (!outs.length && !s.ending) errors.push(`${f.id}: cảnh ${id} không có lựa chọn, cảnh tiếp hay cái kết`);
    if (s.ending && outs.length) errors.push(`${f.id}: cảnh kết ${id} vẫn còn nhánh tiếp`);
    for (const o of outs) walk(o, [...path, id]);
  };
  walk(f.start, []);
  for (const id of Object.keys(f.scenes)) if (!seen.has(id)) errors.push(`${f.id}: cảnh ${id} không bao giờ tới được`);
  return errors;
}
