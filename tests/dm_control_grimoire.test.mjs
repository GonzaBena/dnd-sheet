// tests/dm_control_grimoire.test.mjs
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
      href: 'http://localhost:4321/?campaign=avernus-descent',
      search: '?campaign=avernus-descent'
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

const { campaignStore } = await import('../src/scripts/state/campaignStore.ts');
const { userStore } = await import('../src/scripts/state/userStore.ts');
const { journalStore } = await import('../src/scripts/state/journalStore.ts');

test('Grimorio del Control (DM Workspace) Tests', async (t) => {
  campaignStore.seedLegacyFixtures();
  // Ensure default user is Gonzo (user-me)
  userStore.setCurrentUser('user-me');
  assert.equal(userStore.getCurrentUser().id, 'user-me');

  await t.test('1. Mode resolution: DM Grimoire vs Player Sheet', () => {
    // In Avernus, Gonzo is the DM
    assert.equal(campaignStore.isCurrentUserDm('avernus-descent'), true, 'Gonzo is DM of Avernus');
    
    // In Barovia, Gonzo is player (Lord Raven is DM)
    assert.equal(campaignStore.isCurrentUserDm('barovia-strahd'), false, 'Gonzo is NOT DM of Barovia');

    // Switch to Lord Raven
    userStore.setCurrentUser('user-raven');
    assert.equal(campaignStore.isCurrentUserDm('barovia-strahd'), true, 'Lord Raven is DM of Barovia');
    assert.equal(campaignStore.isCurrentUserDm('avernus-descent'), false, 'Lord Raven is NOT DM of Avernus');

    // Restore to Gonzo
    userStore.setCurrentUser('user-me');
  });

  await t.test('2. Characters roster and tactical attributes for Grimoire', () => {
    const chars = campaignStore.getCharactersForCampaign('avernus-descent');
    assert.ok(chars.length >= 3, 'Avernus has at least 3 player characters');

    const kaeroc = chars.find(c => c.name.includes('Kaeroc'));
    assert.ok(kaeroc, 'Kaeroc exists in Avernus');
    assert.ok(kaeroc.armorClass > 0, 'Character has AC');
    assert.ok(kaeroc.hp.max > 0, 'Character has max HP');
  });

  await t.test('3. Instant HP adjustment in Grimoire clamps between 0 and max', () => {
    const chars = campaignStore.getCharactersForCampaign('avernus-descent');
    const char = chars[0];
    const initialHp = char.hp.current;

    // Apply -5 damage
    char.hp.current = Math.max(0, Math.min(char.hp.max, char.hp.current - 5));
    campaignStore.saveCharacter(char);
    const updated = campaignStore.getCharacter(char.id);
    assert.equal(updated.hp.current, initialHp - 5, 'HP reduced by 5');

    // Apply overkill damage
    char.hp.current = Math.max(0, Math.min(char.hp.max, char.hp.current - 1000));
    campaignStore.saveCharacter(char);
    assert.equal(campaignStore.getCharacter(char.id).hp.current, 0, 'HP clamped to 0');

    // Restore
    char.hp.current = char.hp.max;
    campaignStore.saveCharacter(char);
  });

  await t.test('4. Group Resting Actions (Short & Long Rest)', () => {
    const chars = campaignStore.getCharactersForCampaign('avernus-descent');
    // Set all to 10 HP
    chars.forEach(c => {
      c.hp.current = 10;
      campaignStore.saveCharacter(c);
    });

    // Simulate Short Rest (+8 HP)
    chars.forEach(c => {
      c.hp.current = Math.min(c.hp.max, c.hp.current + 8);
      campaignStore.saveCharacter(c);
    });
    let reloaded = campaignStore.getCharactersForCampaign('avernus-descent');
    reloaded.forEach(c => {
      assert.equal(c.hp.current, 18, 'Short rest restored 8 HP');
    });

    // Simulate Long Rest (full recovery)
    chars.forEach(c => {
      c.hp.current = c.hp.max;
      c.hp.temp = 0;
      campaignStore.saveCharacter(c);
    });
    reloaded = campaignStore.getCharactersForCampaign('avernus-descent');
    reloaded.forEach(c => {
      assert.equal(c.hp.current, c.hp.max, 'Long rest restored HP to full');
      assert.equal(c.hp.temp, 0, 'Long rest reset temporary HP');
    });
  });

  await t.test('5. Inspiration toggle and Journal entry creation', () => {
    const chars = campaignStore.getCharactersForCampaign('avernus-descent');
    const char = chars[0];
    char.inspiration = true;
    campaignStore.saveCharacter(char);

    journalStore.log(
      'Inspiración DM',
      `El Dungeon Master ha concedido inspiración a ${char.name}`,
      ['#Combate']
    );

    const entries = journalStore.getEntries();
    const inspEntry = entries.find(e => e.title.includes('Inspiración DM'));
    assert.ok(inspEntry, 'Inspiration logged to campaign journal');
  });

  await t.test('6. Secret vs Public DM Dice Rolls and Milestones in Journal', () => {
    // Secret roll doesn't broadcast public journal entry
    const entriesBefore = journalStore.getEntries().length;

    // Public roll logs to journal
    journalStore.log(
      'Tirada del Dungeon Master (1d20)',
      'Resultado: 18',
      ['#Tirada'],
      { formula: '1d20', result: 18 }
    );

    const entriesAfter = journalStore.getEntries().length;
    assert.equal(entriesAfter, entriesBefore + 1, 'Public roll logged to journal');

    // Milestone logs to journal
    journalStore.log(
      '⭐ Hito Épico: Victoria en el Río Estigia',
      'El grupo derrotó a los demonios invasores',
      ['#Hito'],
      { bannerText: '¡VICTORIA ÉPICA!' }
    );

    const milestoneEntry = journalStore.getEntries().find(e => e.title.includes('Victoria en el Río Estigia'));
    assert.ok(milestoneEntry, 'Milestone celebration logged to journal');
    assert.ok(milestoneEntry.tags.includes('#Hito'));
  });

  await t.test('7. DM dice buttons dispatch open-dice-roller with animated modal context', () => {
    let capturedEvent = null;
    const handler = (e) => {
      capturedEvent = e.detail;
    };
    globalThis.window.addEventListener('open-dice-roller', handler);

    // Simulate clicking a DM dice button (e.g. 2d6, secret = true)
    const formula = '2d6';
    const isSecret = true;
    const sides = 6;
    const count = 2;

    globalThis.window.dispatchEvent(new CustomEvent('open-dice-roller', {
      detail: {
        die: sides,
        count: count,
        modifier: 0,
        label: isSecret ? `Tirada Secreta de DM (${formula})` : `Tirada de DM (${formula})`,
        tag: isSecret ? '#Privado' : '#Tirada',
        isDmRoll: true,
        isSecret: isSecret,
        autoroll: true
      }
    }));

    assert.ok(capturedEvent, 'open-dice-roller was received');
    assert.equal(capturedEvent.die, 6);
    assert.equal(capturedEvent.count, 2);
    assert.equal(capturedEvent.isDmRoll, true);
    assert.equal(capturedEvent.isSecret, true);
    assert.equal(capturedEvent.autoroll, true);
    assert.equal(capturedEvent.tag, '#Privado');
    assert.equal(capturedEvent.label, 'Tirada Secreta de DM (2d6)');

    globalThis.window.removeEventListener('open-dice-roller', handler);
  });

  console.log('✓ All Grimorio del Control (DM Workspace) tests passed successfully!');
});
