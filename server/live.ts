import { WebcastEvent, type TikTokLiveConnection } from "tiktok-live-connector";
import type { LiveEvent, LiveUser } from "../src/live/events";

// Connector 2.5 emits the v3 protobuf fields without legacy field renaming.
type Loose = any;

function toUser(u: Loose): LiveUser | null {
  if (!u) return null;
  const id = String(u.displayId || u.uniqueId || u.idStr || u.id || u.userId || "");
  if (!id || id === "0") return null;
  const pic: string | undefined = u.avatarThumb?.urlList?.[0] ?? u.avatarMedium?.urlList?.[0] ?? u.profilePicture?.urls?.[0] ?? u.profilePictureUrl;
  return {
    id,
    name: String(u.nickname || u.displayId || u.uniqueId || id).slice(0, 60),
    avatar: pic ? `/avatar?u=${encodeURIComponent(pic)}` : undefined,
  };
}

export function bindLiveEvents(c: TikTokLiveConnection, broadcast: (event: LiveEvent) => void, setViewerCount: (count: number) => void) {
  /** combo đang chạy: khoá người+quà+nhóm → repeatCount đã phát */
  const streaks = new Map<string, { n: number; at: number }>();

  function onGift(d: Loose) {
    const old = Date.now() - 120_000;
    for (const [key, value] of streaks) if (value.at < old) streaks.delete(key);
    const user = toUser(d.user);
    if (!user) return;
    const giftType = d.gift?.type ?? d.giftDetails?.giftType ?? d.giftType;
    // TikTok gọi trường này là diamondCount nhưng giá trị là giá quà tính bằng xu (Hoa hồng = 1)
    const coins = Number(d.gift?.diamondCount ?? d.giftDetails?.diamondCount ?? d.diamondCount ?? 1) || 1;
    const gift = String(d.gift?.name || d.giftDetails?.giftName || d.giftName || "Quà");
    const repeat = Math.max(1, Number(d.repeatCount) || 1);
    let count = repeat;
    if (giftType === 1) {
      const key = `${user.id}:${d.giftId}:${d.groupId ?? ""}`;
      const prev = streaks.get(key)?.n ?? 0;
      count = repeat - prev;
      if (d.repeatEnd) streaks.delete(key);
      else streaks.set(key, { n: repeat, at: Date.now() });
    }
    if (count > 0) broadcast({ type: "gift", user, gift, coins, count });
  }

  // danh sách người xem hàng đầu TikTok gửi định kỳ (kèm số người xem): đưa họ vào thành phố ngay,
  // không cần đợi họ tương tác — người đã ở trong phòng từ trước khi bridge kết nối cũng hiện
  // Rankings are not a complete attendance list; only seed once per connection.
  const seeded = new Set<string>();
  c.on(WebcastEvent.ROOM_USER, (d: Loose) => {
    const count = Number(d.total ?? d.viewerCount);
    if (Number.isFinite(count) && count >= 0) setViewerCount(count);
    for (const t of (d.ranks ?? d.topViewers ?? []).slice(0, 20)) {
      const user = toUser(t?.user);
      if (user && !seeded.has(user.id)) {
        seeded.add(user.id);
        broadcast({ type: "presence", user });
      }
    }
  });
  c.on(WebcastEvent.MEMBER, (d: Loose) => {
    const user = toUser(d.user);
    if (user) broadcast({ type: "join", user });
  });
  c.on(WebcastEvent.LIKE, (d: Loose) => {
    const user = toUser(d.user);
    if (user) broadcast({ type: "like", user, count: Math.max(1, Number(d.count ?? d.likeCount) || 1) });
  });
  c.on(WebcastEvent.CHAT, (d: Loose) => {
    const user = toUser(d.user);
    if (user) broadcast({ type: "chat", user, text: String(d.content ?? d.comment ?? "").slice(0, 200) });
  });
  c.on(WebcastEvent.GIFT, onGift);
  c.on(WebcastEvent.ENVELOPE, (d: Loose) => {
    const info = d.envelopeInfo;
    const user = info ? toUser({ id: info.sendUserId, nickname: info.sendUserName, avatarThumb: info.sendUserAvatar })
      : toUser(d.treasureBoxUser?.user2?.user3?.[0]?.user4?.user ?? d.user);
    const coins = Number(info?.diamondCount ?? d.treasureBoxData?.coins) || 0;
    if (user && coins > 0) broadcast({ type: "envelope", user, coins });
  });
  c.on(WebcastEvent.FOLLOW, (d: Loose) => {
    const user = toUser(d.user);
    if (user) broadcast({ type: "follow", user });
  });
  c.on(WebcastEvent.SHARE, (d: Loose) => {
    const user = toUser(d.user);
    if (user) broadcast({ type: "share", user });
  });
}
