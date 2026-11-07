import anime from 'animejs';

export function openDrawer(drawerEl: HTMLElement, backdropEl?: HTMLElement) {
  drawerEl.classList.remove('hidden');
  drawerEl.style.bottom = '';
  drawerEl.style.maxHeight = '';
  drawerEl.classList.remove('keyboard-open');
  if (backdropEl) backdropEl.classList.remove('hidden');

  anime.remove(drawerEl);
  if (backdropEl) anime.remove(backdropEl);

  (drawerEl as HTMLElement).style.willChange = 'transform, opacity';

  anime({
    targets: drawerEl,
    translateY: ['100%', '0%'],
    opacity: [0.7, 1],
    duration: 220,
    easing: 'easeOutCubic',
    complete: () => {
      (drawerEl as HTMLElement).style.willChange = 'auto';
    }
  });

  if (backdropEl) {
    (backdropEl as HTMLElement).style.willChange = 'opacity';
    anime({
      targets: backdropEl,
      opacity: [0, 0.75],
      duration: 180,
      easing: 'linear',
      complete: () => {
        (backdropEl as HTMLElement).style.willChange = 'auto';
      }
    });
  }
}

export function closeDrawer(drawerEl: HTMLElement, backdropEl?: HTMLElement, onComplete?: () => void) {
  anime.remove(drawerEl);
  if (backdropEl) anime.remove(backdropEl);

  anime({
    targets: drawerEl,
    translateY: ['0%', '100%'],
    opacity: [1, 0],
    duration: 180,
    easing: 'easeInCubic',
    complete: () => {
      drawerEl.classList.add('hidden');
      drawerEl.style.bottom = '';
      drawerEl.style.maxHeight = '';
      drawerEl.classList.remove('keyboard-open');
      if (onComplete) onComplete();
    }
  });

  if (backdropEl) {
    anime({
      targets: backdropEl,
      opacity: [0.75, 0],
      duration: 180,
      easing: 'linear',
      complete: () => {
        backdropEl.classList.add('hidden');
      }
    });
  }
}

export function openModal(modalEl: HTMLElement, backdropEl?: HTMLElement) {
  modalEl.classList.remove('hidden');
  if (backdropEl) backdropEl.classList.remove('hidden');

  const content = (modalEl.querySelector('.modal-content') || modalEl) as HTMLElement;
  anime.remove(content);
  if (backdropEl) anime.remove(backdropEl);

  content.style.willChange = 'transform, opacity';

  anime({
    targets: content,
    scale: [0.94, 1],
    opacity: [0.3, 1],
    duration: 180,
    easing: 'easeOutCubic',
    complete: () => {
      content.style.willChange = 'auto';
    }
  });

  if (backdropEl) {
    (backdropEl as HTMLElement).style.willChange = 'opacity';
    anime({
      targets: backdropEl,
      opacity: [0, 0.8],
      duration: 150,
      easing: 'linear',
      complete: () => {
        (backdropEl as HTMLElement).style.willChange = 'auto';
      }
    });
  }
}

export function closeModal(modalEl: HTMLElement, backdropEl?: HTMLElement, onComplete?: () => void) {
  const content = (modalEl.querySelector('.modal-content') || modalEl) as HTMLElement;
  anime.remove(content);
  if (backdropEl) anime.remove(backdropEl);

  anime({
    targets: content,
    scale: [1, 0.95],
    opacity: [1, 0],
    duration: 140,
    easing: 'easeInQuad',
    complete: () => {
      modalEl.classList.add('hidden');
      if (onComplete) onComplete();
    }
  });

  if (backdropEl) {
    anime({
      targets: backdropEl,
      opacity: [0.8, 0],
      duration: 140,
      easing: 'linear',
      complete: () => {
        backdropEl.classList.add('hidden');
      }
    });
  }
}
