import assert from "node:assert/strict";
import test from "node:test";
import { checkFilm, fill, FILMS } from "./films.ts";
import { GOLD_PER_USER, parseVote, reactionOf, VoteBox } from "./votes.ts";

test("mọi phim: mọi nhánh đều tới được cái kết, không cảnh thừa", () => {
  for (const f of FILMS) assert.deepEqual(checkFilm(f), [], f.id);
});

test("mỗi phim có ít nhất 4 cái kết và 3 lần bình chọn trên đường dài nhất", () => {
  for (const f of FILMS) {
    const endings = Object.values(f.scenes).filter((s) => s.ending);
    assert.ok(endings.length >= 4, f.id);
    const depth = (id) => {
      const s = f.scenes[id];
      return s.choice ? 1 + Math.max(...s.choice.options.map((o) => depth(o.next))) : 0;
    };
    assert.ok(depth(f.start) >= 3, f.id);
  }
});

test("thay tên người xem vào lời thoại", () => {
  assert.equal(fill("{hero} gọi {friend}, {hero} chạy", "An", "Bình"), "An gọi Bình, An chạy");
});

test("nhận phiếu 1 / 2 với nhiều cách gõ", () => {
  for (const s of ["1", "11111", "số 1", "Chọn 1!!", "1️⃣", "a", "A", "một", "#1", "vote 1", "1 đi mọi người"]) assert.equal(parseVote(s), 0, s);
  for (const s of ["2", "222", "so 2", "chọn 2", "2️⃣", "b", "B!!", "hai", "2 nha"]) assert.equal(parseVote(s), 1, s);
});

test("bình luận thường không bị tính là phiếu", () => {
  for (const s of ["haha", "12", "21", "100 điểm", "ai cũng được", "bạn ơi", "anh ơi", "hay quá", "sợ 2 đứa", "3"]) assert.equal(parseVote(s), null, s);
});

test("mỗi người 1 phiếu, đổi ý được", () => {
  const box = new VoteBox();
  assert.equal(box.cast("an", 0), "new");
  assert.equal(box.cast("an", 0), "same");
  assert.equal(box.cast("binh", 1), "new");
  assert.deepEqual(box.totals(), [1, 1]);
  assert.equal(box.cast("an", 1), "changed");
  assert.deepEqual(box.totals(), [0, 2]);
  assert.deepEqual(box.winner(), { pick: 1, tie: false });
});

test("phiếu vàng: chỉ cho người đã chọn, có trần, đi theo khi đổi ý", () => {
  const box = new VoteBox();
  assert.equal(box.giftGold("an", 100), 0, "chưa chọn thì không có phiếu vàng");
  for (let i = 0; i < 20; i++) box.cast(`u${i}`, 0);
  box.cast("an", 1);
  assert.equal(box.giftGold("an", 100), 10);
  assert.equal(box.giftGold("an", 30000), 0, `tối đa ${GOLD_PER_USER} / người`);
  assert.deepEqual(box.totals(), [20, 11]);
  box.cast("an", 0);
  assert.deepEqual(box.totals(), [31, 0]);
});

test("phiếu vàng không vượt quá số người bình chọn", () => {
  const box = new VoteBox();
  box.cast("whale", 1);
  box.cast("x", 0);
  box.cast("y", 0);
  box.cast("z", 0);
  box.cast("w", 0);
  assert.equal(box.giftGold("whale", 30000), 5);
  assert.deepEqual(box.totals(), [4, 6]);
});

test("hoà hoặc không ai chọn → bốc thăm", () => {
  const box = new VoteBox();
  assert.deepEqual(box.winner(() => 0.1), { pick: 0, tie: true });
  assert.deepEqual(box.winner(() => 0.9), { pick: 1, tie: true });
});

test("nhận ra cảm xúc trong bình luận", () => {
  assert.equal(reactionOf("hahaha"), "😂");
  assert.equal(reactionOf("Sợ quá trời"), "😱");
  assert.equal(reactionOf("huhu khóc mất"), "😭");
  assert.equal(reactionOf("hay quá"), "😍");
  assert.equal(reactionOf("bất ngờ ghê"), "😮");
  assert.equal(reactionOf("vai chính là ai"), null);
  assert.equal(reactionOf("ok"), null);
});
