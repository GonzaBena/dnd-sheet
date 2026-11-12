import { test } from 'node:test';
import assert from 'node:assert';
import { CHARACTER_CLASSES, matchClass } from '../src/scripts/dnd/classes.ts';

test('cada clase de la lista se reconoce a sí misma', () => {
  for (const c of CHARACTER_CLASSES) assert.strictEqual(matchClass(c), c);
});

test('valores antiguos en texto libre se normalizan (género, tildes, inglés)', () => {
  assert.strictEqual(matchClass('Maga'), 'Mago');
  assert.strictEqual(matchClass('wizard'), 'Mago');
  assert.strictEqual(matchClass('  GUERRERA '), 'Guerrero');
  assert.strictEqual(matchClass('Paladin'), 'Paladín');
  assert.strictEqual(matchClass('Picara'), 'Pícaro');
});

test('texto sin coincidencia devuelve undefined', () => {
  assert.strictEqual(matchClass('Artífice'), undefined);
  assert.strictEqual(matchClass(''), undefined);
  assert.strictEqual(matchClass(undefined), undefined);
});
