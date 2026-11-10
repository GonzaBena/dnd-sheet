import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFS, parsePrefs } from '../src/scripts/ui/alertPrefs.ts';

test('parsePrefs(null) devuelve defaults con sound: true y keepAwake: false', () => {
  const prefs = parsePrefs(null);
  assert.deepEqual(prefs, {
    enabled: true,
    vibrate: true,
    sound: true,
    nextUp: true,
    keepAwake: false,
  });
  assert.deepEqual(prefs, DEFAULT_PREFS);
});

test('parsePrefs con JSON inválido devuelve defaults', () => {
  assert.deepEqual(parsePrefs('{invalido'), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs('[]'), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs('"texto"'), DEFAULT_PREFS);
});

test('parsePrefs completa campos faltantes e ignora campos desconocidos', () => {
  const prefs = parsePrefs(JSON.stringify({ sound: false, keepAwake: true, extra: 123, vibrate: 'no-bool' }));
  assert.deepEqual(prefs, {
    enabled: true,
    vibrate: true,
    sound: false,
    nextUp: true,
    keepAwake: true,
  });
});
