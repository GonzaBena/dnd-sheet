// src/scripts/ui/scrollLock.ts
// Gestión unificada de bloqueo de scroll en body/html cuando hay modales o diálogos abiertos.

let lockCount = 0;
let originalBodyOverflow = '';
let originalHtmlOverflow = '';

/**
 * Bloquea el scroll del body y html cuando se abre un modal.
 * Maneja anidación (p. ej. abrir el compendio desde el modal de conjuro):
 * solo desbloquea cuando todos los modales se hayan cerrado.
 */
export function lockBodyScroll(): void {
  if (typeof document === 'undefined' || !document.body) return;

  if (lockCount === 0) {
    originalBodyOverflow = document.body.style.overflow || '';
    originalHtmlOverflow = document.documentElement.style.overflow || '';
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
  }
  lockCount++;
}

/**
 * Desbloquea el scroll cuando se cierra un modal.
 * Si aún quedan otros modales abiertos, conserva el bloqueo hasta que se cierre el último.
 */
export function unlockBodyScroll(): void {
  if (typeof document === 'undefined' || !document.body) return;

  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
    document.body.style.overflow = originalBodyOverflow;
  }
}

/**
 * Devuelve true si el scroll está actualmente bloqueado por al menos un modal.
 */
export function isBodyScrollLocked(): boolean {
  return lockCount > 0;
}

/**
 * Restablece forzosamente el scroll del body a su estado normal (limpieza o salvaguarda).
 */
export function resetBodyScroll(): void {
  if (typeof document === 'undefined' || !document.body) return;
  lockCount = 0;
  document.body.classList.remove('modal-open');
  document.documentElement.classList.remove('modal-open');
  document.body.style.overflow = originalBodyOverflow;
}
