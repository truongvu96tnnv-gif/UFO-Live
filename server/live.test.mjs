import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TikTokLiveConnection, deserializeMessage } from 'tiktok-live-connector';
import * as proto from 'tiktok-live-proto/v3';
import { bindLiveEvents } from './live.ts';

// Round-trip through the installed connector's protobuf decoder, not legacy fixtures.
const message = (name, fields) => ({ ...proto[name].decode(new Uint8Array()), ...fields });
const user = message('User', { id: '12345', displayId: 'viewer', nickname: 'Viewer',
  avatarThumb: message('ImageModel', { urlList: ['https://p.tiktokcdn.com/avatar.jpg'] }) });
function harness() {
  const connection = new TikTokLiveConnection('test_host', {});
  const events = [];
  const viewers = [];
  bindLiveEvents(connection, event => events.push(event), count => viewers.push(count));
  return { events, viewers, async emit(type, fields) {
    const data = deserializeMessage(type, proto[type].encode(message(type, fields)).finish());
    await connection.processDecodedData({ type, data });
  } };
}

test('protobuf join, chat, likes, follow and share reach the game with user identity', async () => {
  const h = harness();
  await h.emit('WebcastMemberMessage', { user });
  await h.emit('WebcastChatMessage', { user, content: 'hello live' });
  await h.emit('WebcastLikeMessage', { user, count: 23 });
  for (const action of ['follow', 'share']) {
    await h.emit('WebcastSocialMessage', { user, common: message('CommonMessageData', {
      displayText: { key: action, defaultPattern: '', defaultFormat: undefined, pieces: [] } }) });
  }
  assert.deepEqual(h.events.map(e => e.type), ['join', 'chat', 'like', 'follow', 'share']);
  for (const e of h.events) {
    assert.equal(e.user.id, 'viewer');
    assert.equal(e.user.name, 'Viewer');
    assert.equal(e.user.avatar, '/avatar?u=https%3A%2F%2Fp.tiktokcdn.com%2Favatar.jpg');
  }
  assert.equal(h.events[1].text, 'hello live');
  assert.equal(h.events[2].count, 23);
});

test('room count includes zero and repeated rankings do not duplicate presence events', async () => {
  const h = harness();
  const ranks = [message('Contributor', { user })];
  await h.emit('WebcastRoomUserSeqMessage', { total: '100', ranks });
  await h.emit('WebcastRoomUserSeqMessage', { total: '0', ranks });
  assert.deepEqual(h.viewers, [100, 0]);
  assert.equal(h.events.length, 1);
  assert.ok(h.events.every(event => event.type === "presence"));
});

test('numeric ID fallback works and empty users are ignored', async () => {
  const h = harness();
  await h.emit('WebcastChatMessage', { user: message('User', { id: '98765' }), content: 'hello' });
  await h.emit('WebcastChatMessage', { user: message('User', {}) });
  await h.emit('WebcastChatMessage', {});
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0].user.id, '98765');
});

test('gift value and combo deltas use protobuf gift fields without counting the final packet twice', async () => {
  const h = harness();
  const gift = message('Gift', { type: 1, name: 'Rose', diamondCount: 1 });
  for (const [repeatCount, repeatEnd] of [[1, 0], [3, 0], [3, 1]]) {
    await h.emit('WebcastGiftMessage', { user, gift, giftId: '1', groupId: '10', repeatCount, repeatEnd });
  }
  await h.emit('WebcastGiftMessage', { user, gift: message('Gift', { type: 0, name: 'Galaxy', diamondCount: 1000 }), repeatCount: 1 });
  assert.deepEqual(h.events.map(({ gift, coins, count }) => ({ gift, coins, count })), [
    { gift: 'Rose', coins: 1, count: 1 }, { gift: 'Rose', coins: 1, count: 2 },
    { gift: 'Galaxy', coins: 1000, count: 1 }
  ]);
});

test('envelopes use sender and coins from envelopeInfo', async () => {
  const h = harness();
  await h.emit('WebcastEnvelopeMessage', { envelopeInfo: message('MessageRedEnvelopInfo', {
    sendUserId: '54321', sendUserName: 'Sender', diamondCount: 199
  }) });
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0].type, 'envelope');
  assert.equal(h.events[0].user.id, '54321');
  assert.equal(h.events[0].coins, 199);
});

test('reconnect replay: same chat msgId is ingested once across connections; stale messages dropped', async () => {
  const common = (msgId, createTime) => message('CommonMessageData', { msgId, createTime: String(createTime) });
  const a = harness();
  await a.emit('WebcastChatMessage', { user, content: 'doi phe', common: common('7001', Date.now()) });
  const b = harness(); // kết nối lại: connector phát lại loạt bình luận gần nhất
  await b.emit('WebcastChatMessage', { user, content: 'doi phe', common: common('7001', Date.now()) });
  await b.emit('WebcastChatMessage', { user, content: 'cũ từ 5 phút trước', common: common('7002', Date.now() - 300_000) });
  await b.emit('WebcastChatMessage', { user, content: 'mới', common: common('7003', Date.now()) });
  assert.deepEqual(a.events.filter(e => e.type === 'chat').map(e => e.text), ['doi phe']);
  assert.deepEqual(b.events.filter(e => e.type === 'chat').map(e => e.text), ['mới']);
});

test('gift combo steps sharing one msgId are all counted; exact replay is not', async () => {
  const h = harness();
  const gift = message('Gift', { type: 1, name: 'Rose', diamondCount: 1 });
  const common = message('CommonMessageData', { msgId: '9100', createTime: String(Date.now()) });
  for (const [repeatCount, repeatEnd] of [[1, 0], [4, 0], [4, 0], [4, 1]]) {
    await h.emit('WebcastGiftMessage', { user, gift, giftId: '2', groupId: '20', repeatCount, repeatEnd, common });
  }
  assert.deepEqual(h.events.map((e) => e.count), [1, 3]);
});

test('measures TikTok delivery lag from message createTime', async () => {
  const { lagStats } = await import('./live.ts');
  const h = harness();
  await h.emit('WebcastChatMessage', { user, content: 'trễ 3 giây', common: message('CommonMessageData', { msgId: '8801', createTime: String(Date.now() - 3000) }) });
  const s = lagStats();
  assert.ok(s && s.maxMs >= 2900 && s.maxMs < 4000, JSON.stringify(s));
});
