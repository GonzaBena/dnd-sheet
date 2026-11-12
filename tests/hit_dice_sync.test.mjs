import { test } from 'node:test';
import assert from 'node:assert';
import { recalculateCharacter } from '../src/scripts/dnd/calculations.ts';
import { defaultCharacter } from '../src/scripts/data/defaultCharacter.ts';

const make = (level, total, remaining) => {
  const c = JSON.parse(JSON.stringify(defaultCharacter));
  c.level = level;
  c.hitDice = { total, remaining, die: 'd10' };
  return c;
};

test('el total de dados de golpe se alinea con el nivel', () => {
  const up = recalculateCharacter(make(8, 5, 5));
  assert.deepStrictEqual([up.hitDice.total, up.hitDice.remaining], [8, 8]);

  const partial = recalculateCharacter(make(8, 5, 2));
  assert.deepStrictEqual([partial.hitDice.total, partial.hitDice.remaining], [8, 5]);

  const down = recalculateCharacter(make(3, 5, 5));
  assert.deepStrictEqual([down.hitDice.total, down.hitDice.remaining], [3, 3]);

  const again = JSON.stringify(recalculateCharacter(up).hitDice);
  assert.strictEqual(again, JSON.stringify(up.hitDice)); // idempotente
});
