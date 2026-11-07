import anime from 'animejs';

export interface RollResult {
  dieType: number;
  rolls: number[];
  modifier: number;
  total: number;
  isCrit: boolean;
  isFumble: boolean;
}

export function animateJackpotRoll(
  reelContainer: HTMLElement,
  dieType: number,
  count: number,
  modifier: number,
  onComplete: (result: RollResult) => void
) {
  // Generate real random results
  const finalRolls: number[] = [];
  for (let i = 0; i < count; i++) {
    finalRolls.push(Math.floor(Math.random() * dieType) + 1);
  }
  const sumRolls = finalRolls.reduce((a, b) => a + b, 0);
  const total = sumRolls + modifier;
  const isCrit = dieType === 20 && finalRolls.includes(20);
  const isFumble = dieType === 20 && finalRolls.includes(1);

  // Clear previous reel display
  reelContainer.innerHTML = '';
  const reelSlots: { box: HTMLElement; strip: HTMLElement; finalVal: number }[] = [];

  // Create perfectly rigid, fixed-size reel boxes with overflow-hidden
  finalRolls.forEach((finalVal, i) => {
    // 1. Rigid outer container that NEVER moves or resizes
    const box = document.createElement('div');
    box.className = 'w-16 h-20 sm:w-20 sm:h-24 rounded-2xl bg-[#10141d] border-2 border-amber-500/30 flex items-center justify-center relative overflow-hidden shadow-[inset_0_2px_12px_rgba(0,0,0,0.8)] shrink-0';

    // 2. Inner rolling element containing numbers with tabular numerals
    const strip = document.createElement('div');
    strip.className = 'w-full flex flex-col items-center justify-center text-3xl sm:text-4xl font-headline font-bold text-amber-300 tabular-nums select-none leading-none';
    
    // Initial display
    strip.textContent = '?';
    box.appendChild(strip);
    reelContainer.appendChild(box);

    reelSlots.push({ box, strip, finalVal });
  });

  let finishedCount = 0;

  reelSlots.forEach(({ box, strip, finalVal }, i) => {
    const duration = 1100 + (i * 250);

    // Rapidly cycle numbers without ANY transform on the outer box
    const interval = setInterval(() => {
      strip.textContent = String(Math.floor(Math.random() * dieType) + 1);
    }, 45);

    // Smooth Anime.js deceleration
    const dummy = { progress: 0 };
    anime({
      targets: dummy,
      progress: 100,
      duration: duration,
      easing: 'easeOutExpo',
      complete: () => {
        clearInterval(interval);
        strip.textContent = String(finalVal);

        // Subtle internal bounce on the number itself (NOT on the outer box)
        anime({
          targets: strip,
          scale: [1.3, 1],
          duration: 350,
          easing: 'easeOutBack'
        });

        // Glow effects on the box border (box size stays completely fixed)
        if (finalVal === 20 && dieType === 20) {
          box.classList.remove('border-amber-500/30');
          box.classList.add('border-amber-400', 'shadow-[0_0_20px_rgba(245,158,11,0.8)]');
          strip.classList.add('text-amber-200');
        } else if (finalVal === 1 && dieType === 20) {
          box.classList.remove('border-amber-500/30');
          box.classList.add('border-rose-500', 'shadow-[0_0_20px_rgba(239,68,68,0.8)]');
          strip.classList.remove('text-amber-300');
          strip.classList.add('text-rose-400');
        }

        finishedCount++;
        if (finishedCount === count) {
          onComplete({
            dieType,
            rolls: finalRolls,
            modifier,
            total,
            isCrit,
            isFumble
          });
        }
      }
    });
  });
}
