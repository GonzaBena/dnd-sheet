// src/scripts/ui/swipeToDelete.ts
/**
 * Robust touch & pointer swipe-to-delete gesture utility.
 * Guarantees smooth swipe left, visual fade-in of delete background,
 * and 100% reliable reset so cards never get stuck.
 */

export interface SwipeToDeleteOptions {
  card: HTMLElement;
  container?: HTMLElement;
  threshold?: number; // Distance in px to trigger delete (default: 60)
  onTrigger: () => void;
  onCancel?: () => void;
}

export function attachSwipeToDelete(options: SwipeToDeleteOptions): () => void {
  const { card, container = card, threshold = 60, onTrigger, onCancel } = options;

  const bgEl = container.querySelector('.swipe-delete-bg') as HTMLElement | null;

  let startX = 0;
  let startY = 0;
  let currentDeltaX = 0;
  let isTouching = false;
  let isSwipingHorizontal = false;
  let isAxisDecided = false;

  // Ensure card has touch-action for vertical scrolling
  card.style.touchAction = 'pan-y';

  function resetCardVisuals(animated = true) {
    if (animated) {
      card.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1)';
      if (bgEl) bgEl.style.transition = 'opacity 0.22s ease-out';
    } else {
      card.style.transition = 'none';
      if (bgEl) bgEl.style.transition = 'none';
    }
    card.style.transform = 'translateX(0px)';
    if (bgEl) bgEl.style.opacity = '0';
    container.removeAttribute('data-swipe-active');
  }

  function handleStart(clientX: number, clientY: number, target: EventTarget | null) {
    const el = target as HTMLElement | null;
    // Don't intercept touches that start on actionable controls
    if (el && el.closest('button, input, select, textarea, a')) {
      return false;
    }

    startX = clientX;
    startY = clientY;
    currentDeltaX = 0;
    isTouching = true;
    isSwipingHorizontal = false;
    isAxisDecided = false;

    card.style.transition = 'none';
    if (bgEl) bgEl.style.transition = 'none';
    return true;
  }

  function handleMove(clientX: number, clientY: number, e?: Event) {
    if (!isTouching) return;

    const deltaX = clientX - startX;
    const deltaY = clientY - startY;

    if (!isAxisDecided) {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // Wait until at least 8px of movement to decide axis
      if (absX >= 8 || absY >= 8) {
        isAxisDecided = true;
        // If horizontal movement dominates and is moving leftwards
        if (absX > absY) {
          isSwipingHorizontal = true;
        } else {
          // Vertical scroll - abandon swipe so browser scrolls naturally
          isTouching = false;
          resetCardVisuals(false);
          return;
        }
      } else {
        return;
      }
    }

    if (isSwipingHorizontal) {
      // Prevent browser default vertical scroll during active horizontal swipe
      if (e && e.cancelable) {
        e.preventDefault();
      }

      // We only drag to the left (negative deltaX)
      if (deltaX < 0) {
        // Clamp drag distance with gentle resistance past threshold
        const resistance = deltaX < -threshold ? (deltaX + threshold) * 0.4 - threshold : deltaX;
        const clampedX = Math.max(resistance, -120);
        currentDeltaX = deltaX;

        card.style.transform = `translateX(${clampedX}px)`;

        if (bgEl) {
          const progress = Math.min(1, Math.abs(clampedX) / 50);
          bgEl.style.opacity = progress.toString();
        }

        if (Math.abs(deltaX) >= threshold) {
          container.setAttribute('data-swipe-active', 'true');
        } else {
          container.removeAttribute('data-swipe-active');
        }
      } else {
        currentDeltaX = 0;
        card.style.transform = 'translateX(0px)';
        if (bgEl) bgEl.style.opacity = '0';
        container.removeAttribute('data-swipe-active');
      }
    }
  }

  function handleEnd() {
    if (!isTouching && !isSwipingHorizontal) {
      resetCardVisuals(true);
      return;
    }

    const wasSwiping = isSwipingHorizontal;
    const finalDeltaX = currentDeltaX;

    isTouching = false;
    isSwipingHorizontal = false;
    isAxisDecided = false;

    // ALWAYS reset card back to resting position
    resetCardVisuals(true);

    if (wasSwiping && finalDeltaX <= -threshold) {
      onTrigger();
    } else if (wasSwiping && onCancel) {
      onCancel();
    }
  }

  // Touch event listeners (Primary for mobile)
  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    handleStart(e.touches[0].clientX, e.touches[0].clientY, e.target);
  };

  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    handleMove(e.touches[0].clientX, e.touches[0].clientY, e);
  };

  const onTouchEnd = () => handleEnd();
  const onTouchCancel = () => handleEnd();

  // Pointer event listeners (For desktop mouse dragging)
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return; // Handled by TouchEvent for mobile stability
    if (e.button !== 0) return;
    handleStart(e.clientX, e.clientY, e.target);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    handleMove(e.clientX, e.clientY, e);
  };

  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    handleEnd();
  };

  card.addEventListener('touchstart', onTouchStart, { passive: true });
  card.addEventListener('touchmove', onTouchMove, { passive: false });
  card.addEventListener('touchend', onTouchEnd, { passive: true });
  card.addEventListener('touchcancel', onTouchCancel, { passive: true });

  card.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  // Return cleanup function
  return () => {
    card.removeEventListener('touchstart', onTouchStart);
    card.removeEventListener('touchmove', onTouchMove);
    card.removeEventListener('touchend', onTouchEnd);
    card.removeEventListener('touchcancel', onTouchCancel);

    card.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  };
}
