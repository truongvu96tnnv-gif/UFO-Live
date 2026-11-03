import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { sendBossCommand } from './boss-command.ts';

class Display extends EventEmitter {
  readyState = 1;
  constructor(reply) { super(); this.reply = reply; }
  send(payload, callback) {
    callback();
    const event = JSON.parse(payload);
    setImmediate(() => this.reply?.(this, event));
  }
}

test('boss command succeeds only after every display acknowledges its request ID', async () => {
  const displays = [0, 1].map(() => new Display((client, event) => client.emit('message', JSON.stringify({ type: 'commandResult', requestId: event.requestId, ok: true }))));
  assert.deepEqual(await sendBossCommand(displays, 'dragon', 200), { applied: 2, bossId: 'dragon' });
  for (const client of displays) assert.equal(client.listenerCount('message'), 0);
});

test('old game builds and mismatched acknowledgements produce an actionable error', async () => {
  const client = new Display(c => c.emit('message', JSON.stringify({ type: 'commandResult', requestId: 'old-request', ok: true })));
  await assert.rejects(sendBossCommand([client], 'crystal', 30), /0\/1.*npm run build/);
  assert.equal(client.listenerCount('message'), 0);
  assert.equal(client.listenerCount('close'), 0);
});

test('game handler errors, disconnected displays and missing displays do not report success', async () => {
  const failed = new Display((client, event) => client.emit('message', JSON.stringify({ type: 'commandResult', requestId: event.requestId, ok: false })));
  await assert.rejects(sendBossCommand([failed], 'dragon', 200), /0\/1/);
  const closed = new Display(client => client.emit('close'));
  await assert.rejects(sendBossCommand([closed], 'dragon', 200), /0\/1/);
  await assert.rejects(sendBossCommand([], 'dragon'), /Chưa có màn hình/);
});
