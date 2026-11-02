import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_CONTROL, parseControl, SimulatedPlayers } from './control.ts';

test('controls reject invalid values and preserve settings in partial updates', () => {
  assert.deepEqual(parseControl({ simulatedPlayers: 5 }, DEFAULT_CONTROL), { ...DEFAULT_CONTROL, simulatedPlayers: 5 });
  for (const input of [null, [], { simulatedPlayers: 21 }, { simulatedPlayers: -1 }, { intensity: 0 }, { muted: 'yes' }, { unknown: true }]) {
    assert.throws(() => parseControl(input, DEFAULT_CONTROL));
  }
});

test('simulation is bounded, labelled, and stops completely when disabled', () => {
  const events = [];
  const sim = new SimulatedPlayers(e => events.push(e));
  sim.configure(3, 3);
  assert.equal(events.length, 3);
  assert.ok(events.every(e => e.type === 'join' && e.user.id.startsWith('sim:') && e.user.name.startsWith('BOT')));
  sim.tick(0.2);
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
