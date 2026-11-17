// tests/companions.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { characterStore } from '../src/scripts/state/characterStore.ts';

test('characterStore companions management: add, get, update, linkToken, and remove', () => {
  const initialCompanions = characterStore.getCompanions();
  assert.ok(Array.isArray(initialCompanions));

  // 1. Añadir compañero (Familiar lechuza)
  const owlId = characterStore.addCompanion({
    name: 'Archimedes',
    type: 'familiar',
    size: 1,
    hp: { current: 1, max: 1 },
    armorClass: 11,
    speedFt: 60,
    notes: 'Visión en la oscuridad 120 pies, ventaja en Percepción que use la vista o el oído.',
  });

  assert.ok(owlId.startsWith('comp-'));
  const compsAfterAdd = characterStore.getCompanions();
  const addedOwl = compsAfterAdd.find((c) => c.id === owlId);
  assert.notEqual(addedOwl, undefined);
  assert.equal(addedOwl?.name, 'Archimedes');
  assert.equal(addedOwl?.type, 'familiar');
  assert.equal(addedOwl?.size, 1);
  assert.equal(addedOwl?.hp.current, 1);
  assert.equal(addedOwl?.hp.max, 1);
  assert.equal(addedOwl?.armorClass, 11);
  assert.equal(addedOwl?.speedFt, 60);

  // 2. Añadir montura (Caballo de guerra)
  const steedId = characterStore.addCompanion({
    name: 'Relámpago',
    type: 'mount',
    size: 2, // Grande
    hp: { current: 19, max: 19 },
    armorClass: 11,
    speedFt: 60,
    notes: 'Ataque con cascos +6 al impacto, 2d6+4 de daño contundente.',
  });

  assert.ok(steedId.startsWith('comp-'));
  assert.equal(characterStore.getCompanions().length, compsAfterAdd.length + 1);
  const steed = characterStore.getCompanions().find((c) => c.id === steedId);
  assert.equal(steed?.size, 2);

  // 3. Modificar PG y notas del compañero
  characterStore.updateCompanion(steedId, {
    hp: { current: 12, max: 19 },
    notes: 'Herido en el flanco izquierdo.',
  });

  const updatedSteed = characterStore.getCompanions().find((c) => c.id === steedId);
  assert.equal(updatedSteed?.hp.current, 12);
  assert.equal(updatedSteed?.notes, 'Herido en el flanco izquierdo.');

  // 4. Vincular token del mapa
  characterStore.linkCompanionToken(steedId, 'tok-steed-123');
  const linkedSteed = characterStore.getCompanions().find((c) => c.id === steedId);
  assert.equal(linkedSteed?.tokenId, 'tok-steed-123');

  // Desvincular token
  characterStore.linkCompanionToken(steedId, null);
  const unlinkedSteed = characterStore.getCompanions().find((c) => c.id === steedId);
  assert.equal(unlinkedSteed?.tokenId, undefined);

  // 5. Eliminar compañeros creados para dejar estado limpio
  characterStore.removeCompanion(owlId);
  characterStore.removeCompanion(steedId);

  assert.equal(characterStore.getCompanions().find((c) => c.id === owlId), undefined);
  assert.equal(characterStore.getCompanions().find((c) => c.id === steedId), undefined);
});
