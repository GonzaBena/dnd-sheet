// tests/firestore_cache_mode.test.mjs
// En WebKit (Safari, iOS) Firestore usa caché en memoria: la persistente multi-pestaña se colgaba sin
// entregar snapshots y el panel quedaba vacío tras iniciar sesión.
import test from 'node:test';
import assert from 'node:assert/strict';

const { isWebKitBrowser, firestoreCacheMode } = await import('../src/scripts/firebase/client.ts');

const UA = {
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0.0.0 Mobile/15E148 Safari/604.1',
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15',
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
  firefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:145.0) Gecko/20100101 Firefox/145.0',
};

test('isWebKitBrowser: Safari y todo iOS/iPadOS son WebKit', () => {
  assert.equal(isWebKitBrowser(UA.safariMac), true);
  assert.equal(isWebKitBrowser(UA.iphone), true);
  assert.equal(isWebKitBrowser(UA.chromeIos), true, 'Chrome en iOS también usa WebKit');
  assert.equal(isWebKitBrowser(UA.ipadDesktop, 5), true, 'iPadOS se presenta como Mac con pantalla táctil');
});

test('isWebKitBrowser: Chrome, Brave, Edge, Android y Firefox no lo son', () => {
  assert.equal(isWebKitBrowser(UA.chromeMac), false, 'Chrome/Brave en Mac');
  assert.equal(isWebKitBrowser(UA.edge), false);
  assert.equal(isWebKitBrowser(UA.android), false);
  assert.equal(isWebKitBrowser(UA.firefox), false);
});

test('firestoreCacheMode: el override de localStorage manda', () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  try {
    store.set('dnd_firestore_cache', 'memory');
    assert.equal(firestoreCacheMode(), 'memory');
    store.set('dnd_firestore_cache', 'persistent');
    assert.equal(firestoreCacheMode(), 'persistent');
  } finally {
    delete globalThis.localStorage;
  }
});
