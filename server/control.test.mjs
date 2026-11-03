import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_CONTROL, parseControl, SimulatedPlayers } from './control.ts';

test('controls reject invalid values and preserve settings in partial updates', () => {
  assert.deepEqual(parseControl({ simulatedPlayers: 5 }, DEFAULT_CONTROL), { ...DEFAULT_CONTROL, simulatedPlayers: 5 });
  for (const input of [null, [], { simulatedPlayers: 21 }, { simulatedPlayers: -1 }, { intensity: 0 }, { muted: 'yes' }, { unknown: true }]) {
    assert.throws(() => parseControl(input, DEFAULT_CONTROL));
  }
});

test('simulation is bounded, identifiable, and stops completely when disabled', () => {
  const events = [];
  const sim = new SimulatedPlayers(e => events.push(e), () => {}, () => 0.5);
  sim.configure(3, 3);
  assert.deepEqual(events.map(e => e.user.name), ['Minh Anh', 'Gia Huy', 'Khánh Linh']);
  assert.equal(events.length, 3);
  assert.ok(events.every(e => e.user.avatar === '/avatars/default-profile.svg'));
  assert.ok(events.every(e => e.type === 'join' && e.user.id.startsWith('sim:') && Boolean(e.user.name)));
  for (let i = 0; i < 20; i++) sim.tick(0.1);
  assert.equal(events.at(-1).type, 'like');
  sim.configure(1, 1);
  assert.deepEqual(events.at(-1), { type: 'remove', ids: ['sim:2', 'sim:3'] });
  sim.configure(0, 1);
  assert.deepEqual(events.at(-1), { type: 'remove', ids: ['sim:1'] });
  const count = events.length;
  sim.tick(30);
  assert.equal(events.length, count);
  assert.ok(events.every(e => e.type !== 'gift'));
});


test('21 real viewers remove every bot, block re-enabling, and do not auto-resume at 20', () => {
  const events = [];
  let stopped = 0;
  const sim = new SimulatedPlayers(e => events.push(e), () => stopped++, () => 0.5);
  sim.autoStop = true;
  sim.configure(4, 2);
  sim.observeViewers(20);
  assert.equal(stopped, 0);
  sim.observeViewers(21);
  assert.equal(stopped, 1);
  assert.deepEqual(events.at(-1), { type: 'remove', ids: ['sim:1', 'sim:2', 'sim:3', 'sim:4'] });
  assert.throws(() => sim.configure(1, 1), /20/);
  sim.observeViewers(100);
  assert.equal(stopped, 1);
  sim.observeViewers(20);
  const count = events.length;
  for (let i = 0; i < 100; i++) sim.tick(0.1);
  assert.equal(events.length, count);
  sim.configure(1, 1);
  assert.equal(events.at(-1).type, 'join');
});

test('independent bot rhythms produce varied likes and chats without paid gifts', () => {
  let seed = 42;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const events = [];
  const sim = new SimulatedPlayers(e => events.push(e), () => {}, random);
  sim.configure(6, 3);
  for (let i = 0; i < 1200; i++) sim.tick(0.1);
  const likes = events.filter(e => e.type === 'like');
  const chats = events.filter(e => e.type === 'chat');
  assert.ok(new Set(likes.map(e => e.count)).size > 1);
  assert.equal(new Set(likes.map(e => e.user.id)).size, 6);
  assert.ok(new Set(chats.map(e => e.text)).size > 1);
  assert.ok(events.every(e => ['join', 'like', 'chat'].includes(e.type)));
  const before = events.length;
  sim.tick(3600);
  assert.ok(events.length - before <= 6, 'no backlog flood after a stalled tick');
});

test('auto-stop off by default: bots keep running above 20 viewers and can be enabled manually', () => {
  const events = [];
  let stopped = 0;
  const sim = new SimulatedPlayers(e => events.push(e), () => stopped++, () => 0.5);
  sim.configure(3, 1);
  sim.observeViewers(500);
  assert.equal(stopped, 0);
  assert.ok(!events.some(e => e.type === 'remove'));
  sim.configure(5, 2);
  assert.equal(events.filter(e => e.type === 'join').length, 5);
  sim.configure(0, 2);
  assert.deepEqual(events.at(-1), { type: 'remove', ids: ['sim:1', 'sim:2', 'sim:3', 'sim:4', 'sim:5'] });
});
