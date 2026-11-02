import { FONT_FAMILY } from "../game/font";
import { GIFTS } from "../game/gifts";
import type { EventSink, LiveUser } from "../live/events";

/**
 * Thanh thử tương tác + bảng tặng quà kiểu TikTok — chỉ hiện ở chế độ demo (khi lên live thật thì ẩn,
 * vì Browser Source sẽ phát mọi thứ trên trang lên sóng).
 */
const CSS = `
#ufo-pad {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 4;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px));
  padding-block: 10px calc(10px + env(safe-area-inset-bottom, 0px));
  display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.85), rgba(0, 0, 0, 0));
  font-family: ${FONT_FAMILY};
}
#ufo-pad button, #ufo-gifts button {
  font: 600 14px/1 ${FONT_FAMILY}; letter-spacing: 0.02em; color: #e8eeff; background: rgba(8, 12, 28, 0.88);
  border: 1px solid #2c3a66; border-radius: 999px; padding: 10px 14px; cursor: pointer;
}
#ufo-pad button:hover { border-color: #9dff7a; }
#ufo-pad button:focus-visible, #ufo-gifts button:focus-visible { outline: 2px solid #9dff7a; outline-offset: 2px; }
#ufo-pad .gold { color: #ffd55a; border-color: rgba(255, 213, 90, 0.55); }
#ufo-gifts {
  position: fixed; left: 50%; bottom: 0; z-index: 5; transform: translateX(-50%);
  width: min(560px, 100%); box-sizing: border-box; max-height: 72%; overflow-y: auto;
  padding: 14px max(16px, env(safe-area-inset-right, 0px)) calc(16px + env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px));
  background: rgba(14, 14, 22, 0.97); color: #e8eeff; border-radius: 18px 18px 0 0; border-top: 1px solid #2c3a66;
  font-family: ${FONT_FAMILY};
}
#ufo-gifts header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
#ufo-gifts h2 { font-size: 16px; margin: 0; }
#ufo-gifts p { margin: 2px 0 0; font-size: 12px; color: #9aa6c8; }
#ufo-gifts .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
#ufo-gifts .grid button {
  border-radius: 12px; padding: 10px 4px; display: flex; flex-direction: column; align-items: center; gap: 4px;
  font-weight: 600; font-size: 12px; min-width: 0; background: rgba(255, 255, 255, 0.04);
}
#ufo-gifts .grid button:hover { border-color: #ffd55a; }
#ufo-gifts .grid button:active { transform: scale(0.94); }
#ufo-gifts .ic { font-size: 30px; line-height: 1.1; }
#ufo-gifts .nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
#ufo-gifts .xu { color: #ffd55a; font-variant-numeric: tabular-nums; }
#ufo-pad[hidden], #ufo-gifts[hidden] { display: none; }
@media (max-width: 360px) { #ufo-gifts .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
`;

export function mountDemoPanel(sink: EventSink, user: LiveUser, unlock: () => void, onBoss?: () => void, onMusic?: () => boolean, onLose?: () => void) {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const pad = document.createElement("div");
  pad.id = "ufo-pad";
  pad.setAttribute("aria-label", "Thử tương tác như người xem");
  const buttons: [string, string, string?][] = [
    ["like", "❤️ Thả tim"],
    ["chat", "💬 Bình luận"],
    ["gifts", "🎁 Tặng quà", "gold"],
    ["envelope", "📦 Rương xu", "gold"],
    ["follow", "➕ Follow"],
    ["share", "↗ Chia sẻ"],
    ["boss", "☠ Gọi trùm", "gold"],
    ["lose", "💀 Cho thua"],
    ["music", "🎵 Nhạc: bật"],
  ];
  for (const [ev, label, cls] of buttons) {
    const b = document.createElement("button");
    b.type = "button";
    b.id = `ufo-b-${ev}`;
    b.dataset.ev = ev;
    b.textContent = label;
    if (cls) b.className = cls;
    pad.appendChild(b);
  }

  const sheet = document.createElement("div");
  sheet.id = "ufo-gifts";
  sheet.hidden = true;
  sheet.innerHTML = `<header><div><h2>Tặng quà</h2><p>Mỗi món là một vũ khí riêng · bấm liên tục để combo</p></div><button type="button" id="ufo-gifts-close">Đóng</button></header><div class="grid"></div>`;
  const grid = sheet.querySelector(".grid")!;
  for (const g of GIFTS) {
    const b = document.createElement("button");
    b.type = "button";
    b.id = `ufo-g-${g.key}`;
    b.title = `${g.name} · ${g.coins.toLocaleString("vi-VN")} xu`;
    b.innerHTML = `<span class="ic">${g.icon}</span><span class="nm">${g.name}</span><span class="xu">🪙 ${g.coins.toLocaleString("vi-VN")}</span>`;
    b.addEventListener("click", () => {
      unlock();
      sink({ type: "gift", user, gift: g.name, coins: g.coins, count: 1 });
    });
    grid.appendChild(b);
  }

  pad.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    unlock();
    switch (b.dataset.ev) {
      case "like":
        return sink({ type: "like", user, count: 10 });
      case "chat":
        return sink({ type: "chat", user, text: "bắn nó đi!!!" });
      case "gifts":
        sheet.hidden = !sheet.hidden;
        return;
      case "envelope":
        return sink({ type: "envelope", user, coins: 199 });
      case "follow":
        return sink({ type: "follow", user });
      case "share":
        return sink({ type: "share", user });
      case "boss":
        onBoss?.();
        return;
      case "lose":
        onLose?.();
        return;
      case "music": {
        const on = onMusic?.() ?? true;
        b.textContent = on ? "🎵 Nhạc: bật" : "🎵 Nhạc: tắt";
        return;
      }
    }
  });
  sheet.querySelector("#ufo-gifts-close")!.addEventListener("click", () => (sheet.hidden = true));

  document.body.append(pad, sheet);
  return {
    show(on: boolean) {
      pad.hidden = !on;
      if (!on) sheet.hidden = true;
    },
    toggleGifts() {
      sheet.hidden = !sheet.hidden;
    },
  };
}
