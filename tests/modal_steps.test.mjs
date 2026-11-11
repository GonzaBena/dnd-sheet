import { test } from 'node:test';
import assert from 'node:assert';
import { resolvePage, newPages } from '../src/scripts/ui/modalSteps.ts';

test('resolvePage conserva el paso actual si sigue disponible', () => {
  assert.strictEqual(resolvePage(['basic', 'use', 'armor'], 'use'), 'use');
});

test('resolvePage vuelve al primero si el paso desaparece o no hay actual', () => {
  // Ejemplo real: se está en "Armadura" y se cambia la categoría a "Equipo".
  assert.strictEqual(resolvePage(['basic', 'use'], 'armor'), 'basic');
  assert.strictEqual(resolvePage(['atk', 'manual', 'tags'], undefined), 'atk');
  assert.strictEqual(resolvePage(['atk', 'calc'], ''), 'atk');
});

test('newPages marca solo los pasos que aparecen, nunca en el primer render', () => {
  assert.deepStrictEqual(newPages([], ['basic', 'use']), []);
  assert.deepStrictEqual(newPages(['basic', 'use'], ['basic', 'use', 'custom']), ['custom']);
  assert.deepStrictEqual(newPages(['basic', 'use', 'custom'], ['basic', 'use']), []);
  // Modo automático → manual en el modal de arma: el paso "manual" es el nuevo.
  assert.deepStrictEqual(newPages(['atk', 'calc', 'bonus', 'tags'], ['atk', 'manual', 'tags']), ['manual']);
});
