import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import WebSocket from 'ws';

test('control HTTP API and game WebSocket share simulation state without inflating real stats', { timeout: 20000 }, async t => {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', TIKTOK_USERNAME: '', LOG: '0' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  const exited = once(child, 'exit');
  t.after(async () => { child.kill(); await exited; });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Bridge startup timed out')), 10000);
    child.stdout.on('data', data => { if (String(data).includes('UFO Live bridge:')) { clearTimeout(timeout); resolve(); } });
    child.once('exit', () => { clearTimeout(timeout); reject(new Error('Bridge exited early')); });
  });
  const base = `http://127.0.0.1:${port}`;
  const post = body => fetch(`${base}/api/control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await fetch(`${base}/control`, { redirect: 'manual' })).status, 302);
  assert.equal((await post({ action: 'settings', settings: { simulatedPlayers: 100 } })).status, 400);
  assert.equal((await post({ action: 'connect', username: 'https://invalid.example' })).status, 400);
  assert.equal((await post({ action: 'settings', settings: { simulatedPlayers: 3, intensity: 3, muted: true } })).status, 200);
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  t.after(() => ws.terminate());
  const messages = [];
  const firstLike = new Promise(resolve => ws.on('message', raw => {
    const data = JSON.parse(String(raw));
    messages.push(...(Array.isArray(data) ? data : [data]));
    if (data.type === 'like') resolve();
  }));
  await firstLike;
  assert.equal(messages.find(e => e.type === 'control').settings.simulatedPlayers, 3);
  assert.ok(messages.some(e => e.type === 'presence' && e.user.id === 'sim:1'));
  const health = await (await fetch(`${base}/health`)).json();
  assert.deepEqual(health.events, {});
  assert.equal(health.lastEventAt, null);
  assert.equal(health.viewers, 0);
  const removed = new Promise(resolve => ws.on('message', raw => {
    const data = JSON.parse(String(raw));
    if (data.type === 'remove') resolve(data);
  }));
  await post({ action: 'settings', settings: { simulatedPlayers: 0 } });
  assert.deepEqual((await removed).ids, ['sim:1', 'sim:2', 'sim:3']);
  const state = await (await fetch(`${base}/api/control`)).json();
  assert.equal(state.settings.simulatedPlayers, 0);
  assert.equal(state.settings.muted, true);
  assert.equal((await post({ action: 'disconnect' })).status, 200);
});
