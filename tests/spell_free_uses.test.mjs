import { test } from 'node:test';
import assert from 'node:assert';
import { characterStore } from '../src/scripts/state/characterStore.ts';
import { toCatalogEntry } from '../src/scripts/dnd/catalog.ts';

test('Magia innata y usos gratuitos de conjuros (Dotes, Rasgos, Objetos)', () => {
  characterStore.resetToDefault();

  // 1. Crear un recurso para usos gratuitos de un conjuro (ej: Dote Fey Touched que concede Paso Brumoso 1/descanso largo)
  const res = characterStore.addResource({
    name: 'Paso Brumoso (Dote)',
    max: 1,
    rechargeOn: 'longRest',
    source: 'custom'
  });
  assert.ok(res.id, 'El recurso debe tener un ID asignado');
  assert.strictEqual(res.max, 1);
  assert.strictEqual(res.used, 0);

  // 2. Registrar el conjuro vinculado al recurso en el Grimorio
  characterStore.addSpell({
    name: 'Paso Brumoso',
    level: 2,
    school: 'Conjuración',
    castingTime: '1 acción adicional',
    range: 'Personal',
    duration: 'Instantáneo',
    notes: 'Concedido por la dote Tocado por las Hadas. Te teletransportas hasta 30 pies.',
    resourceId: res.id
  });

  const char = characterStore.get();
  const misty = char.spellcasting.spells.find((s) => s.name === 'Paso Brumoso');
  assert.ok(misty, 'Paso Brumoso debe estar en el grimorio');
  assert.strictEqual(misty.resourceId, res.id, 'Debe tener el resourceId vinculado');

  // 3. toCatalogEntry debe conservar resourceId en meta
  const entry = toCatalogEntry('spell', misty);
  assert.strictEqual(entry.meta.resourceId, res.id, 'CatalogEntry.meta debe incluir resourceId');

  // 4. Lanzar el conjuro consumiendo el uso gratuito (gastando el recurso)
  characterStore.spendResource(misty.resourceId, 1);
  const charAfterCast = characterStore.get();
  const resAfterCast = charAfterCast.resources.find((r) => r.id === res.id);
  assert.strictEqual(resAfterCast.used, 1, 'El recurso debe marcar 1 uso consumido');
  assert.strictEqual(resAfterCast.max - resAfterCast.used, 0, 'No deben quedar usos disponibles');

  // 5. Descanso largo recupera automáticamente los usos gratuitos
  characterStore.longRest();
  const charAfterRest = characterStore.get();
  const resAfterRest = charAfterRest.resources.find((r) => r.id === res.id);
  assert.strictEqual(resAfterRest.used, 0, 'Descanso largo debe restablecer el uso a 0');
  assert.strictEqual(resAfterRest.max - resAfterRest.used, 1, 'Vuelve a tener 1 uso disponible');

  // 6. Editar el conjuro para desvincular o cambiar el recurso
  characterStore.updateSpell(misty.id || misty.name, {
    resourceId: undefined,
    notes: 'Paso Brumoso estándar sin usos gratuitos'
  });
  const charAfterUpdate = characterStore.get();
  const mistyUpdated = charAfterUpdate.spellcasting.spells.find((s) => s.name === 'Paso Brumoso');
  assert.strictEqual(mistyUpdated.resourceId, undefined, 'El conjuro ahora no tiene recurso vinculado');
});
