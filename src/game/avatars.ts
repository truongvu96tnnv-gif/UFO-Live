import type { LiveUser } from "../live/events";
import { hashStr } from "./math";
import { circleCrop, makeInitialAvatar, type Img } from "./sprites";

/**
 * Kho ảnh đại diện tròn. Trả về ngay ảnh tạm (chữ cái đầu) rồi thay bằng ảnh thật khi tải xong.
 * Ảnh TikTok đi qua proxy /avatar của bridge nên cùng origin — canvas không bị "taint".
 */
export class Avatars {
  private cache = new Map<string, Img>();
  private sources = new Map<string, string>();
  private retryAt = new Map<string, number>();

  hue(user: LiveUser) {
    const m = user.avatar?.match(/^demo:(\d+)/);
    return m ? +m[1] : hashStr(user.id) % 360;
  }

  get(user: LiveUser): Img {
    const hit = this.cache.get(user.id);
    const tmp = hit ?? makeInitialAvatar(user.name, this.hue(user));
    this.cache.set(user.id, tmp);
    const url = user.avatar;
    if (url && !url.startsWith("demo:") && (this.sources.get(user.id) !== url || Date.now() >= (this.retryAt.get(user.id) ?? Infinity))) {
      this.sources.set(user.id, url);
      this.retryAt.delete(user.id);
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        if (this.sources.get(user.id) !== url) return;
        this.cache.set(user.id, circleCrop(img, img.naturalWidth, img.naturalHeight));
        this.retryAt.delete(user.id);
      };
      img.onerror = () => {
        if (this.sources.get(user.id) === url) this.retryAt.set(user.id, Date.now() + 30_000);
      };
      img.src = url;
    }
    // giới hạn bộ nhớ khi live dài
    if (this.cache.size > 1500) {
      const first = this.cache.keys().next().value;
      if (first !== undefined) {
        this.cache.delete(first);
        this.sources.delete(first);
        this.retryAt.delete(first);
      }
    }
    return tmp;
  }
}
