import assert from 'node:assert/strict';
import { test } from 'node:test';
import { register } from 'node:module';
// Font CSS is bundled by Vite in the browser; it has no role in cache tests.
register('data:text/javascript,' + encodeURIComponent(`
  export async function load(url, context, nextLoad) {
    if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
    return nextLoad(url, context);
  }
`), import.meta.url);
const { Avatars } = await import('./avatars.ts');

// Minimal canvas/image doubles: exercise loading lifecycle without network access.
test('avatars arriving after the first event load, refresh, and retry failed requests', () => {
  const oldDocument = globalThis.document;
  const oldImage = globalThis.Image;
  const oldNow = Date.now;
  const images = [];
  let now = 0;
  Date.now = () => now;
  globalThis.document = { createElement: () => ({ getContext: () => new Proxy({}, {
    get: (_, key) => key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}
  }) }) };
  globalThis.Image = class {
    naturalWidth = 128;
    naturalHeight = 128;
    constructor() { images.push(this); }
  };
  try {
    const avatars = new Avatars();
    const user = { id: 'viewer', name: 'Viewer' };
    const placeholder = avatars.get(user);
    user.avatar = '/avatar?u=first';
    assert.equal(avatars.get(user), placeholder);
    assert.equal(images.length, 1);
    avatars.get(user);
    assert.equal(images.length, 1, 'do not issue a request every frame');
    images[0].onload();
    assert.notEqual(avatars.get(user), placeholder);
    user.avatar = '/avatar?u=second';
    avatars.get(user);
    images[1].onerror();
    avatars.get(user);
    assert.equal(images.length, 2);
    now = 30_001;
    avatars.get(user);
    assert.equal(images.length, 3);
    user.avatar = '/avatar?u=third';
    avatars.get(user);
    images[3].onload();
    const current = avatars.get(user);
    images[2].onload();
    assert.equal(avatars.get(user), current, 'stale image cannot replace the newer avatar');
  } finally {
    globalThis.document = oldDocument;
    globalThis.Image = oldImage;
    Date.now = oldNow;
  }
});
