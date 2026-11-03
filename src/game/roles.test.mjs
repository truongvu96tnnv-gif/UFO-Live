import assert from "node:assert/strict";
import test from "node:test";
import { guideRows, isDefect, isReturn } from "./roles.ts";

test("nhận lệnh đổi phe có dấu / không dấu / hoa thường / dấu câu", () => {
  for (const s of ["đổi phe", "Đổi Phe!!!", "doi phe nha", "HAIL UFO", "hail ufo 👽", "theo UFO luôn", "team ufo", "UFO muôn năm"]) assert.ok(isDefect(s), s);
});

test("bình luận thường không bị coi là đổi phe", () => {
  for (const s of ["bắn!!!", "ufo yếu quá", "đổi màu đi", "phe ta mạnh", "cứu trái đất", "hailstorm"]) assert.equal(isDefect(s), false, s);
});

test("nhận lệnh về phe", () => {
  for (const s of ["về phe", "Quay về thôi", "team trái đất", "bảo vệ trái đất"]) assert.ok(isReturn(s), s);
  assert.equal(isReturn("bắn đi"), false);
});

test("bảng hướng dẫn có tim, bình luận, quà và các vai trò mới", () => {
  const rows = guideRows();
  const how = rows.map((r) => r[1]);
  assert.ok(how.includes("Thả tim") && how.includes("Bình luận") && how.includes("Hoa hồng"));
  assert.ok(rows.some((r) => r[0] === "👑" && r[1] === "Quà lớn"));
  assert.ok(!rows.some((r) => /\d+\s*xu/.test(r[1] + r[2])), "không ghi số xu trên bảng");
  assert.ok(rows.some((r) => r[0] === "😈"));
});
