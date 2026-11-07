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

  // 2. Number counter animation
  const counterObj = { value: fromHp };
  anime({
    targets: counterObj,
    value: toHp,
    round: 1,
    duration: 400,
    easing: 'easeOutQuad',
    update: () => {
      numberElement.textContent = String(counterObj.value);
    }
  });

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
