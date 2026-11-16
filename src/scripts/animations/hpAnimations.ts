import anime from 'animejs';

export function animateHpBar(
  barElement: HTMLElement,
  numberElement: HTMLElement,
  fromHp: number,
  toHp: number,
  maxHp: number
) {
  const targetPct = Math.max(0, Math.min(100, (toHp / maxHp) * 100));

  // 1. Bar animation
  anime({
    targets: barElement,
    width: `${targetPct}%`,
    duration: 650,
    easing: 'easeOutElastic(1, .8)'
  });

  // 2. Número: se muestra el valor nuevo directamente. Antes un contador animado partía de fromHp y
  // volvía a mostrar el valor anterior después de que la ficha ya había renderizado el nuevo
  // (se veía como 2 → 3 → 2). Además, si llegaba otro cambio durante la animación, la pisaba.
  numberElement.textContent = String(toHp);

  // 3. Pulse effect
  const isHeal = toHp > fromHp;
  anime({
    targets: numberElement,
    scale: [1, 1.25, 1],
    color: isHeal ? ['#f1f5f9', '#f59e0b', '#f1f5f9'] : ['#f1f5f9', '#ef4444', '#f1f5f9'],
    duration: 450,
    easing: 'easeOutQuad'
  });
}
