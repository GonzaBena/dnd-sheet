// src/scripts/ui/endTurnButton.ts
// Botón reutilizable "Terminar turno" con confirmación de doble toque (T-68, RF-70, RF-71).
// DECISION: FC-2 — El primer toque cambia el texto a "¿Terminar? Tocá de nuevo" durante 3 s;
// el segundo confirma sin abrir modal para que sea rápido en la mesa.

import { endMyTurn } from '../data/combatService.ts';
import { showBanner } from './alerts.ts';

const CONFIRM_TIMEOUT_MS = 3000;

export interface MountEndTurnButtonOptions {
  cid: string;
  getKey: () => string | null;
}

export function mountEndTurnButton(
  container: HTMLElement,
  opts: MountEndTurnButtonOptions
): void {
  container.innerHTML = '';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.endTurnBtn = 'true';

  const baseClass =
    'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold font-label transition-all cursor-pointer select-none shadow-xs active:scale-95 whitespace-nowrap shrink-0';
  const idleClass =
    'bg-amber-500 hover:bg-amber-400 text-[#0a0d12] border border-amber-400/80 shadow-[0_0_12px_rgba(245,158,11,0.3)]';
  const confirmClass =
    'bg-rose-500 hover:bg-rose-400 text-white border border-rose-400 shadow-[0_0_14px_rgba(244,63,94,0.4)] animate-pulse';

  let armed = false;
  let busy = false;
  let armTimer: ReturnType<typeof setTimeout> | null = null;

  function setIdleState(): void {
    armed = false;
    if (armTimer) {
      clearTimeout(armTimer);
      armTimer = null;
    }
    btn.disabled = false;
    btn.className = `${baseClass} ${idleClass}`;
    btn.innerHTML = `
      <span class="material-symbols-outlined text-[15px] shrink-0">skip_next</span>
      <span>Terminar turno</span>
    `;
  }

  function setArmedState(): void {
    armed = true;
    if (armTimer) clearTimeout(armTimer);
    btn.className = `${baseClass} ${confirmClass}`;
    btn.innerHTML = `
      <span class="material-symbols-outlined text-[15px] shrink-0">touch_app</span>
      <span>¿Terminar? Tocá de nuevo</span>
    `;
    armTimer = setTimeout(() => {
      if (!busy) setIdleState();
    }, CONFIRM_TIMEOUT_MS);
  }

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (busy) return;

    if (!armed) {
      setArmedState();
      return;
    }

    // Segundo toque: confirmar
    if (armTimer) {
      clearTimeout(armTimer);
      armTimer = null;
    }
    const key = opts.getKey();
    if (!key) {
      setIdleState();
      return;
    }

    busy = true;
    btn.disabled = true;
    btn.className = `${baseClass} ${idleClass} opacity-60 pointer-events-none`;
    btn.innerHTML = `
      <span class="material-symbols-outlined text-[15px] shrink-0">hourglass_top</span>
      <span>Avanzando…</span>
    `;

    try {
      const res = await endMyTurn(opts.cid, key);
      if (res === 'ok') {
        // La barra / fila se actualiza sola cuando llega el snapshot de Firestore
        return;
      }
      if (res === 'stale') {
        showBanner({
          title: 'El turno ya avanzó',
          tone: 'next',
          timeoutMs: 2500,
        });
        busy = false;
        setIdleState();
        return;
      }
      showBanner({
        title: 'No se pudo terminar el turno',
        subtitle: 'Verificá que la partida esté en curso y sea tu turno.',
        tone: 'next',
        timeoutMs: 3000,
      });
      busy = false;
      setIdleState();
    } catch (err: any) {
      showBanner({
        title: 'No se pudo terminar el turno',
        subtitle: err?.message || 'Error de conexión.',
        tone: 'next',
        timeoutMs: 3000,
      });
      busy = false;
      setIdleState();
    }
  });

  setIdleState();
  container.appendChild(btn);
}
