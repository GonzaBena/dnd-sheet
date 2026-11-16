import { test, beforeEach } from 'node:test';
import assert from 'node:assert';

function createMockElement() {
  const classes = new Set();
  return {
    style: { overflow: '' },
    classList: {
      add: (cls) => classes.add(cls),
      remove: (cls) => classes.delete(cls),
      contains: (cls) => classes.has(cls)
    }
  };
}

let scrollLockModule;

test.before(async () => {
  // Set up mock DOM environment for Node.js
  global.document = {
    body: createMockElement(),
    documentElement: createMockElement()
  };
  scrollLockModule = await import('../src/scripts/ui/scrollLock.ts');
});

test.beforeEach(() => {
  global.document.body = createMockElement();
  global.document.documentElement = createMockElement();
  scrollLockModule.resetBodyScroll();
});

test('lockBodyScroll añade la clase modal-open y overflow hidden', () => {
  const { lockBodyScroll, isBodyScrollLocked } = scrollLockModule;
  assert.strictEqual(isBodyScrollLocked(), false);

  lockBodyScroll();

  assert.strictEqual(isBodyScrollLocked(), true);
  assert.strictEqual(global.document.body.classList.contains('modal-open'), true);
  assert.strictEqual(global.document.documentElement.classList.contains('modal-open'), true);
  assert.strictEqual(global.document.body.style.overflow, 'hidden');
});

test('unlockBodyScroll restaura el scroll y remueve modal-open cuando llega a 0', () => {
  const { lockBodyScroll, unlockBodyScroll, isBodyScrollLocked } = scrollLockModule;

  lockBodyScroll();
  assert.strictEqual(isBodyScrollLocked(), true);

  unlockBodyScroll();
  assert.strictEqual(isBodyScrollLocked(), false);
  assert.strictEqual(global.document.body.classList.contains('modal-open'), false);
  assert.strictEqual(global.document.documentElement.classList.contains('modal-open'), false);
  assert.strictEqual(global.document.body.style.overflow, '');
});

test('soporta modales anidados conservando el bloqueo hasta que se cierra el último', () => {
  const { lockBodyScroll, unlockBodyScroll, isBodyScrollLocked } = scrollLockModule;

  // Abrir modal 1
  lockBodyScroll();
  assert.strictEqual(isBodyScrollLocked(), true);

  // Abrir modal 2 (p. ej. compendio o diálogo sobre el modal actual)
  lockBodyScroll();
  assert.strictEqual(isBodyScrollLocked(), true);

  // Cerrar modal 2: el body debe seguir bloqueado
  unlockBodyScroll();
  assert.strictEqual(isBodyScrollLocked(), true);
  assert.strictEqual(global.document.body.classList.contains('modal-open'), true);
  assert.strictEqual(global.document.body.style.overflow, 'hidden');

  // Cerrar modal 1: ahora sí se desbloquea
  unlockBodyScroll();
  assert.strictEqual(isBodyScrollLocked(), false);
  assert.strictEqual(global.document.body.classList.contains('modal-open'), false);
  assert.strictEqual(global.document.body.style.overflow, '');
});

test('unlockBodyScroll no desciende de cero si se llama de más', () => {
  const { unlockBodyScroll, isBodyScrollLocked } = scrollLockModule;

  unlockBodyScroll();
  unlockBodyScroll();
  assert.strictEqual(isBodyScrollLocked(), false);
});

test('resetBodyScroll fuerza el desbloqueo y restablece el contador', () => {
  const { lockBodyScroll, resetBodyScroll, isBodyScrollLocked } = scrollLockModule;

  lockBodyScroll();
  lockBodyScroll();
  lockBodyScroll();
  assert.strictEqual(isBodyScrollLocked(), true);

  resetBodyScroll();
  assert.strictEqual(isBodyScrollLocked(), false);
  assert.strictEqual(global.document.body.classList.contains('modal-open'), false);
  assert.strictEqual(global.document.body.style.overflow, '');
});
