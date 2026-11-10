import { test } from 'node:test';
import assert from 'node:assert';
import { durationFromText, effectFromEntry, sortForPanel, modifierText } from '../src/scripts/dnd/effectFactory.ts';

const fx = (id, duration) => ({ id, name: id, sourceType: 'custom', duration, modifiers: [], appliedAt: 0 });

test('durationFromText: tabla del plan', () => {
  assert.strictEqual(durationFromText('Instantáneo'), null);
  assert.strictEqual(durationFromText('Instantaneous'), null);
  assert.deepStrictEqual(durationFromText('Concentración, hasta 1 minuto'), { kind: 'concentration' });
  assert.deepStrictEqual(durationFromText('Concentration, up to 1 minute'), { kind: 'concentration' });
  assert.deepStrictEqual(durationFromText('1 minuto'), { kind: 'rounds', remaining: 10 });
  assert.deepStrictEqual(durationFromText('1 minute'), { kind: 'rounds', remaining: 10 });
  assert.deepStrictEqual(durationFromText('1 hora'), { kind: 'untilRest', rest: 'long' });
  assert.deepStrictEqual(durationFromText('Hasta disipar'), { kind: 'indefinite' });
  assert.deepStrictEqual(durationFromText('Until dispelled'), { kind: 'indefinite' });
  assert.strictEqual(durationFromText('hasta el amanecer'), null);
});

test('durationFromText: vacío, minutos y horas', () => {
  assert.strictEqual(durationFromText(''), null);
  assert.strictEqual(durationFromText(undefined), null);
  assert.deepStrictEqual(durationFromText('10 minutos'), { kind: 'rounds', remaining: 100 });
  assert.deepStrictEqual(durationFromText('8 horas'), { kind: 'untilRest', rest: 'long' });
  assert.deepStrictEqual(durationFromText('2 rondas'), { kind: 'rounds', remaining: 2 });
});

test('effectFromEntry copia datos de la entrada', () => {
  const mods = [{ target: 'ac', op: 'add', value: 2 }];
  const entry = { id: 'e1', kind: 'feat', source: 'custom', name: 'Furia', description: '', meta: { resourceId: 'r1' }, effects: mods };
  const e = effectFromEntry(entry, { kind: 'indefinite' }, 123);
  assert.strictEqual(e.name, 'Furia');
  assert.strictEqual(e.sourceType, 'feat');
  assert.strictEqual(e.sourceId, 'e1');
  assert.strictEqual(e.resourceId, 'r1');
  assert.strictEqual(e.appliedAt, 123);
  assert.deepStrictEqual(e.modifiers, mods);
  assert.notStrictEqual(e.modifiers[0], mods[0]);
  assert.strictEqual(effectFromEntry({ ...entry, kind: 'spell', meta: {} }, { kind: 'indefinite' }, 1).sourceType, 'spell');
  assert.strictEqual(effectFromEntry({ ...entry, kind: 'item', meta: {} }, { kind: 'indefinite' }, 1).sourceType, 'item');
  assert.strictEqual('resourceId' in effectFromEntry({ ...entry, meta: {} }, { kind: 'indefinite' }, 1), false);
});

test('sortForPanel: concentración, rondas ascendente, resto estable', () => {
  const list = [
    fx('i1', { kind: 'indefinite' }),
    fx('r5', { kind: 'rounds', remaining: 5 }),
    fx('c', { kind: 'concentration' }),
    fx('r2', { kind: 'rounds', remaining: 2 }),
    fx('i2', { kind: 'untilRest', rest: 'long' }),
  ];
  assert.deepStrictEqual(sortForPanel(list).map((e) => e.id), ['c', 'r2', 'r5', 'i1', 'i2']);
});

test('modifierText', () => {
  assert.strictEqual(modifierText({ target: 'ac', op: 'add', value: 2 }), 'CA +2');
  assert.strictEqual(modifierText({ target: 'attack', op: 'add', value: -1 }), 'ataque -1');
  assert.strictEqual(modifierText({ target: 'save.dex', op: 'advantage' }), 'ventaja en salvaciones de DES');
  assert.strictEqual(modifierText({ target: 'speed', op: 'set', value: 40 }), 'velocidad = 40');
  assert.strictEqual(modifierText({ target: 'damage', op: 'resistance', value: 'fuego', when: 'mientras dure' }), 'resistencia a fuego (mientras dure)');
});
