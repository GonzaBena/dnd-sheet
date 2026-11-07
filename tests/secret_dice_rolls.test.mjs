// tests/secret_dice_rolls.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

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
    location: {
      href: 'http://localhost:4321/?campaign=barovia-strahd',
      search: '?campaign=barovia-strahd'
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

const { journalStore } = await import('../src/scripts/state/journalStore.ts');
const { characterStore } = await import('../src/scripts/state/characterStore.ts');
const { campaignStore } = await import('../src/scripts/state/campaignStore.ts');

test('Secret Dice Rolls for Users & Table Isolation', async (t) => {
  console.log('Running Secret Dice Rolls Tests for Users & Privacy Isolation...');

  // Setup initial mock character
  const userChar = {
    id: 'char-elysian-secret',
    name: 'Elysian Ventosombra',
    level: 5,
    stats: {
      dex: { score: 16, modifier: 3, savingProficient: true },
      wis: { score: 14, modifier: 2, savingProficient: false }
    },
    skills: [
      { id: 'stealth', name: 'Sigilo', stat: 'dex', proficient: true, expertise: false, value: 6 },
      { id: 'perception', name: 'Percepción', stat: 'wis', proficient: true, expertise: false, value: 5 }
    ]
  };

  const otherChar = {
    id: 'char-morgana-other',
    name: 'Morgana la Hechicera',
    level: 5
  };

  await t.test('1. User secret dice roll logs with private isolation flags and tags', () => {
    const secretRollEntry = journalStore.addEntry({
      sessionNumber: 15,
      title: '[Secreta] Prueba Secreta de Sigilo: 19',
      content: 'Tirada de 1d20 + 6 con resultado 19 (Dados: [13] (+6)).',
      tags: ['#Tirada', '#Privado'],
      isSecret: true,
      isPrivate: true,
      characterId: userChar.id,
      authorName: userChar.name,
      diceRoll: {
        formula: '1d20 + 6 (Prueba Secreta de Sigilo)',
        result: 19,
        breakdown: '[13] (+6)'
      }
    });

    assert.ok(secretRollEntry.id, 'Entry ID generated');
    assert.strictEqual(secretRollEntry.isSecret, true, 'Entry marked as secret');
    assert.strictEqual(secretRollEntry.isPrivate, true, 'Entry marked as private');
    assert.strictEqual(secretRollEntry.characterId, userChar.id, 'Entry author character ID set');
    assert.strictEqual(secretRollEntry.authorName, 'Elysian Ventosombra');
    assert.ok(secretRollEntry.tags.includes('#Privado'), 'Tags include #Privado');
    assert.ok(secretRollEntry.tags.includes('#Tirada'), 'Tags include #Tirada');
    assert.ok(secretRollEntry.title.startsWith('[Secreta]'), 'Title has secret prefix');
  });

  await t.test('2. User public dice roll logs without private flag', () => {
    const publicRollEntry = journalStore.addEntry({
      sessionNumber: 15,
      title: 'Ataque con Espada Corta +1: 22',
      content: 'Tirada de 1d20 + 7 con resultado 22 (Dados: [15] (+7)).',
      tags: ['#Combate', '#Tirada'],
      isSecret: false,
      isPrivate: false,
      characterId: userChar.id,
      authorName: userChar.name,
      diceRoll: {
        formula: '1d20 + 7 (Ataque con Espada Corta +1)',
        result: 22,
        breakdown: '[15] (+7)'
      }
    });

    assert.strictEqual(publicRollEntry.isSecret, false);
    assert.strictEqual(publicRollEntry.isPrivate, false);
    assert.strictEqual(publicRollEntry.tags.includes('#Privado'), false);
  });

  await t.test('3. Privacy Isolation: User sees their secret roll, but other users cannot', () => {
    // Current user views entries
    const userView = journalStore.getEntries(userChar.id);
    const userSecretRoll = userView.find(e => e.title.includes('Prueba Secreta de Sigilo'));
    assert.ok(userSecretRoll, 'Elysian MUST see his own secret roll');

    // Other player views entries
    const otherView = journalStore.getEntries(otherChar.id);
    const otherSecretRoll = otherView.find(e => e.title.includes('Prueba Secreta de Sigilo'));
    assert.strictEqual(otherSecretRoll, undefined, 'Morgana must NEVER see Elysian secret roll');

    // Both see the public roll
    const userPublicRoll = userView.find(e => e.title.includes('Espada Corta +1'));
    const otherPublicRoll = otherView.find(e => e.title.includes('Espada Corta +1'));
    assert.ok(userPublicRoll, 'Elysian sees public roll');
    assert.ok(otherPublicRoll, 'Morgana sees public roll');
  });

  await t.test('4. Cloud Sync Isolation: Secret rolls excluded from public campaign payload', () => {
    const publicCloudEntries = journalStore.getPublicCampaignEntries();
    const leakedSecret = publicCloudEntries.find(e => e.title.includes('Prueba Secreta de Sigilo') || e.isSecret || e.isPrivate);
    assert.strictEqual(leakedSecret, undefined, 'Secret rolls MUST NEVER be exported to public campaign sync');

    const publicSynced = publicCloudEntries.find(e => e.title.includes('Espada Corta +1'));
    assert.ok(publicSynced, 'Public rolls MUST be exported for campaign sync');
  });

  await t.test('5. open-dice-roller event dispatching with isSecret detail', () => {
    let captured = null;
    const listener = (e) => {
      captured = e.detail;
    };

    globalThis.window.addEventListener('open-dice-roller', listener);

    // Simulate clicking Header "Tirada Secreta"
    globalThis.window.dispatchEvent(new CustomEvent('open-dice-roller', {
      detail: {
        die: 20,
        count: 1,
        modifier: 0,
        label: 'Tirada Secreta de Usuario',
        tag: '#Privado',
        isSecret: true,
        autoroll: false
      }
    }));

    assert.ok(captured, 'Event captured');
    assert.strictEqual(captured.isSecret, true, 'isSecret detail is true');
    assert.strictEqual(captured.tag, '#Privado');
    assert.strictEqual(captured.label, 'Tirada Secreta de Usuario');

    // Simulate clicking standard public roll
    globalThis.window.dispatchEvent(new CustomEvent('open-dice-roller', {
      detail: {
        die: 20,
        count: 1,
        modifier: 3,
        label: 'Prueba de Carisma',
        tag: '#Tirada',
        isSecret: false,
        autoroll: false
      }
    }));

    assert.strictEqual(captured.isSecret, false, 'Standard roll has isSecret false');
    assert.strictEqual(captured.modifier, 3);

    globalThis.window.removeEventListener('open-dice-roller', listener);
  });

  await t.test('6. Distinguishing User Secret Rolls vs DM Secret Rolls', () => {
    // DM secret roll
    const dmSecret = journalStore.addEntry({
      sessionNumber: 15,
      title: '[Secreta] Tirada Secreta de DM (1d20): 17',
      content: 'Tirada de 1d20 con resultado 17',
      tags: ['#Tirada', '#Privado'],
      isSecret: true,
      isPrivate: true,
      authorName: 'Dungeon Master'
    });

    // Player secret roll
    const playerSecret = journalStore.addEntry({
      sessionNumber: 15,
      title: '[Secreta] Salvación Secreta de Sabiduría: 14',
      content: 'Tirada de 1d20 + 2 con resultado 14',
      tags: ['#Tirada', '#Privado'],
      isSecret: true,
      isPrivate: true,
      characterId: userChar.id,
      authorName: userChar.name
    });

    assert.strictEqual(dmSecret.authorName, 'Dungeon Master');
    assert.strictEqual(playerSecret.authorName, 'Elysian Ventosombra');
    assert.strictEqual(playerSecret.characterId, userChar.id);
  });

  console.log('✓ All Secret Dice Rolls & Isolation tests passed successfully!');
});
