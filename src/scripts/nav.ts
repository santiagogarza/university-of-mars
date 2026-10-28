const nav = document.querySelector<HTMLElement>('[data-nav]');
const toggle = document.querySelector<HTMLButtonElement>('[data-nav-toggle]');
const desktop = window.matchMedia('(min-width: 1041px)');
const root = document.documentElement;

/** Desktop width with room for the full menu row (see the fit check in Header.astro). */
function isDesktop(): boolean {
  return desktop.matches && root.dataset.header !== 'compact';
}

function setExpanded(button: HTMLButtonElement, open: boolean) {
  button.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function closeMegas() {
  document.querySelectorAll<HTMLButtonElement>('[data-mega] > button').forEach((button) => {
    setExpanded(button, false);
  });
}

function closePanel() {
  nav?.classList.remove('is-open');
  toggle?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('nav-lock');
}

toggle?.addEventListener('click', () => {
  const open = !nav?.classList.contains('is-open');
  nav?.classList.toggle('is-open', open);
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  document.body.classList.toggle('nav-lock', open);
  if (!open) closeMegas();
});

document.querySelectorAll<HTMLElement>('[data-mega]').forEach((item) => {
  const button = item.querySelector<HTMLButtonElement>(':scope > button');
  if (!button) return;

  item.addEventListener('mouseenter', () => {
    if (!isDesktop()) return;
    closeMegas();
    setExpanded(button, true);
  });

  item.addEventListener('mouseleave', () => {
    if (!isDesktop()) return;
    setExpanded(button, false);
  });

  button.addEventListener('click', () => {
    const next = button.getAttribute('aria-expanded') !== 'true';
    closeMegas();
    setExpanded(button, next);
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const item = document.activeElement?.closest<HTMLElement>('[data-mega]');
  closeMegas();
  closePanel();
  item?.querySelector<HTMLButtonElement>(':scope > button')?.focus();
});

document.querySelectorAll('#primary-menu a').forEach((link) => {
  link.addEventListener('click', () => {
    closeMegas();
    closePanel();
  });
});

desktop.addEventListener('change', () => {
  closeMegas();
  closePanel();
});

function refitHeader() {
  const before = root.dataset.header;
  (window as Window & { umFitHeader?: () => void }).umFitHeader?.();
  if (root.dataset.header !== before) {
    closeMegas();
    closePanel();
  }
}

let resizeFrame = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(refitHeader);
});
document.addEventListener('um:appearance-change', refitHeader);
document.fonts?.ready.then(refitHeader);
document.fonts?.addEventListener('loadingdone', refitHeader);
refitHeader();
