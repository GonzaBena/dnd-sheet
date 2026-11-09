// tests/character_avatars.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Mock browser environment for node testing
if (typeof globalThis.window === 'undefined') {
  const listeners = new Map();
  globalThis.window = {
    addEventListener: (type, cb) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(cb);
    },
    removeEventListener: (type, cb) => {
      if (listeners.has(type)) {
        listeners.set(type, listeners.get(type).filter(fn => fn !== cb));
      }
    },
    dispatchEvent: (event) => {
      const cbs = listeners.get(event.type) || [];
      cbs.forEach(cb => cb(event));
      return true;
    },
    CustomEvent: class CustomEvent {
      constructor(type, eventInitDict) {
        this.type = type;
        this.detail = eventInitDict?.detail;
      }
    }
  };
}

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear()
  };
}

const {
  CHARACTER_PRESET_IMAGES,
  getRandomCharacterAvatar,
  isBrokenAvatarUrl,
  sanitizeAvatarUrl,
} = await import('../src/scripts/data/characterAvatars.ts');

const { defaultCharacter } = await import('../src/scripts/data/defaultCharacter.ts');
const { campaignStore } = await import('../src/scripts/state/campaignStore.ts');
const { characterStore } = await import('../src/scripts/state/characterStore.ts');

test('Character Avatars & Random Selection Tests', async (t) => {
  await t.test('1. Preset images correspond to existing files in public/characters', () => {
    assert.equal(CHARACTER_PRESET_IMAGES.length, 5, 'Should have 5 preset character images');
    for (const imgPath of CHARACTER_PRESET_IMAGES) {
      assert.ok(imgPath.startsWith('/characters/ch-'), `Image path must start with /characters/ch-: ${imgPath}`);
      assert.ok(imgPath.endsWith('.avif'), `Image path must end with .avif: ${imgPath}`);
      const diskPath = path.resolve(process.cwd(), 'public', imgPath.replace(/^\//, ''));
      assert.ok(fs.existsSync(diskPath), `File on disk must exist: ${diskPath}`);
    }
  });

  await t.test('2. getRandomCharacterAvatar returns an image from the preset list', () => {
    for (let i = 0; i < 50; i++) {
      const avatar = getRandomCharacterAvatar();
      assert.ok(CHARACTER_PRESET_IMAGES.includes(avatar), `Avatar ${avatar} must be in CHARACTER_PRESET_IMAGES`);
    }
  });

  await t.test('3. isBrokenAvatarUrl detects broken / google AIDA urls and empty values', () => {
    assert.equal(isBrokenAvatarUrl(null), true);
    assert.equal(isBrokenAvatarUrl(undefined), true);
    assert.equal(isBrokenAvatarUrl(''), true);
    assert.equal(isBrokenAvatarUrl('   '), true);
    assert.equal(isBrokenAvatarUrl('https://lh3.googleusercontent.com/aida/ALJJyrBB58Th1LIT...'), true);
    assert.equal(isBrokenAvatarUrl('/characters/ch-1.avif'), false);
    assert.equal(isBrokenAvatarUrl('https://example.com/my-pic.png'), false);
  });

  await t.test('4. sanitizeAvatarUrl returns random preset if broken, or original if valid', () => {
    const fixed = sanitizeAvatarUrl('https://lh3.googleusercontent.com/aida/broken-url');
    assert.ok(CHARACTER_PRESET_IMAGES.includes(fixed));

    const valid = '/characters/ch-3.avif';
    assert.equal(sanitizeAvatarUrl(valid), valid);
  });

  await t.test('5. defaultCharacter has a valid avatar and not a broken googleusercontent URL', () => {
    assert.ok(
      CHARACTER_PRESET_IMAGES.includes(defaultCharacter.avatarUrl) || !isBrokenAvatarUrl(defaultCharacter.avatarUrl),
      'defaultCharacter avatarUrl must be valid and not broken'
    );
    assert.equal(defaultCharacter.avatarUrl.includes('googleusercontent.com'), false);
  });

  await t.test('6. campaignStore.createCharacter generates random preset avatar for new character', () => {
    const newChar = campaignStore.createCharacter({ name: 'Héroe del Bosque' }, null);
    assert.ok(newChar.id, 'Must have ID');
    assert.equal(newChar.name, 'Héroe del Bosque');
    assert.ok(
      CHARACTER_PRESET_IMAGES.includes(newChar.avatarUrl),
      `Avatar ${newChar.avatarUrl} must be one of the preset images from /characters/`
    );
    assert.equal(isBrokenAvatarUrl(newChar.avatarUrl), false);
  });

  await t.test('7. campaignStore.cloneCharacter with template (__template__) assigns random preset avatar', () => {
    const fromTemplate = campaignStore.cloneCharacter('__template__', null, 'Novato');
    assert.ok(
      CHARACTER_PRESET_IMAGES.includes(fromTemplate.avatarUrl),
      `Template clone avatar ${fromTemplate.avatarUrl} must be from preset images`
    );
    assert.equal(isBrokenAvatarUrl(fromTemplate.avatarUrl), false);
  });

  await t.test('8. campaignStore.cloneCharacter replaces broken avatar with random preset', () => {
    const brokenChar = {
      ...defaultCharacter,
      id: 'char-with-broken-img',
      name: 'Personaje Antiguo',
      avatarUrl: 'https://lh3.googleusercontent.com/aida/expired-link',
      userId: 'user-me'
    };
    campaignStore.saveCharacter(brokenChar);

    const cloned = campaignStore.cloneCharacter('char-with-broken-img', null, 'Personaje Reparado');
    assert.ok(
      CHARACTER_PRESET_IMAGES.includes(cloned.avatarUrl),
      'Broken avatar must be replaced with a valid preset image from /characters/'
    );
    assert.equal(cloned.avatarUrl.includes('googleusercontent.com'), false);
  });

  await t.test('9. characterStore.resetToDefault assigns a random preset avatar', () => {
    characterStore.resetToDefault();
    const current = characterStore.get();
    assert.ok(
      CHARACTER_PRESET_IMAGES.includes(current.avatarUrl),
      `Reset character avatar ${current.avatarUrl} must be from /characters/`
    );
    assert.equal(isBrokenAvatarUrl(current.avatarUrl), false);
  });
});
