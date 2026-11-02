import assert from 'node:assert/strict';
import { test } from 'node:test';
import { likeBurst } from './like-burst.ts';

test('likes begin immediately and preserve total damage even for large batched counts', () => {
  for (const count of [1, 5, 12, 50, 1000]) {
    const shots = likeBurst(count, 2);
    assert.equal(shots[0].delay, 0);
    assert.equal(shots.length, Math.min(12, count));
    assert.ok(shots.at(-1).delay < 0.5);
    assert.ok(Math.abs(shots.reduce((n, s) => n + s.damage, 0) - count * 2) < 1e-8);
  }
});
