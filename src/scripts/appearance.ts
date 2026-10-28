import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  THEME_COLORS,
  clampTextScale,
  isDefaultAppearance,
  isThemePreference,
  parseAppearance,
  resolveReduceMotion,
  resolveTheme,
  serializeAppearance,
  type AppearanceSettings,
  type ResolvedTheme,
} from '../lib/appearance';

const root = document.documentElement;
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
const systemReduce = window.matchMedia('(prefers-reduced-motion: reduce)');

const container = document.querySelector<HTMLElement>('[data-appearance]');
const toggle = document.querySelector<HTMLButtonElement>('[data-appearance-toggle]');
const panel = document.querySelector<HTMLElement>('[data-appearance-panel]');
const themeInputs = Array.from(document.querySelectorAll<HTMLInputElement>('[data-appearance-theme]'));
const scaleInput = document.querySelector<HTMLInputElement>('[data-appearance-scale]');
const scaleValue = document.querySelector<HTMLOutputElement>('[data-appearance-scale-value]');
const dyslexicInput = document.querySelector<HTMLInputElement>('[data-appearance-dyslexic]');
const motionInput = document.querySelector<HTMLInputElement>('[data-appearance-motion]');
const systemHint = document.querySelector<HTMLElement>('[data-appearance-system-hint]');
const systemMode = document.querySelector<HTMLElement>('[data-appearance-system-mode]');
const resetButton = document.querySelector<HTMLButtonElement>('[data-appearance-reset]');
const doneButton = document.querySelector<HTMLButtonElement>('[data-appearance-done]');
const status = document.querySelector<HTMLElement>('[data-appearance-status]');

const THEME_FADE_MS = 450;
const THEME_REVEAL_MS = 620;

function readStored(): AppearanceSettings {
  try {
    return parseAppearance(window.localStorage.getItem(APPEARANCE_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

function store(next: AppearanceSettings) {
  try {
    if (isDefaultAppearance(next)) window.localStorage.removeItem(APPEARANCE_STORAGE_KEY);
    else window.localStorage.setItem(APPEARANCE_STORAGE_KEY, serializeAppearance(next));
  } catch {
    // Private browsing can refuse storage; the choice still applies to this page.
  }
}

let settings = readStored();

function motionReduced(): boolean {
  return resolveReduceMotion(settings.reduceMotion, systemReduce.matches);
}

function setThemeAttribute(theme: ResolvedTheme) {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
}

type Origin = { x: number; y: number };

function switchTheme(theme: ResolvedTheme, origin?: Origin) {
  if (root.dataset.theme === theme) return;

  if (motionReduced()) {
    setThemeAttribute(theme);
    return;
  }

  if (origin && typeof document.startViewTransition === 'function') {
    root.classList.add('theme-reveal');
    const transition = document.startViewTransition(() => setThemeAttribute(theme));
    transition.ready
      .then(() => {
        const radius = Math.hypot(
          Math.max(origin.x, window.innerWidth - origin.x),
          Math.max(origin.y, window.innerHeight - origin.y),
        );
        root.animate(
          {
            clipPath: [
              `circle(0px at ${origin.x}px ${origin.y}px)`,
              `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
            ],
          },
          {
            duration: THEME_REVEAL_MS,
            easing: 'cubic-bezier(0.45, 0, 0.2, 1)',
            pseudoElement: '::view-transition-new(root)',
          },
        );
      })
      .catch(() => {});
    transition.finished.finally(() => root.classList.remove('theme-reveal'));
    return;
  }

  root.classList.add('theme-fade');
  setThemeAttribute(theme);
  window.setTimeout(() => root.classList.remove('theme-fade'), THEME_FADE_MS);
}

function applySettings(origin?: Origin) {
  switchTheme(resolveTheme(settings.theme, systemDark.matches), origin);
  root.dataset.themePreference = settings.theme;
  root.style.setProperty('--um-text-scale', String(settings.textScale / 100));
  if (settings.dyslexicFont) root.dataset.font = 'dyslexic';
  else delete root.dataset.font;
  if (motionReduced()) root.dataset.motion = 'reduce';
  else delete root.dataset.motion;
  document.dispatchEvent(new CustomEvent('um:appearance-change'));
}

function syncControls() {
  themeInputs.forEach((input) => {
    input.checked = input.value === settings.theme;
  });
  if (scaleInput) {
    scaleInput.value = String(settings.textScale);
    scaleInput.setAttribute('aria-valuetext', `${settings.textScale} percent`);
    const range = (settings.textScale - Number(scaleInput.min)) / (Number(scaleInput.max) - Number(scaleInput.min));
    scaleInput.style.setProperty('--fill', `${Math.round(range * 100)}%`);
  }
  if (scaleValue) scaleValue.textContent = `${settings.textScale}%`;
  if (dyslexicInput) dyslexicInput.checked = settings.dyslexicFont;
  if (motionInput) motionInput.checked = motionReduced();
  if (systemHint) systemHint.hidden = settings.theme !== 'system';
  if (systemMode) systemMode.textContent = systemDark.matches ? 'dark' : 'light';
}

function update(patch: Partial<AppearanceSettings>, origin?: Origin) {
  settings = { ...settings, ...patch };
  store(settings);
  applySettings(origin);
  syncControls();
}

function announce(message: string) {
  if (!status) return;
  status.textContent = '';
  window.setTimeout(() => {
    status.textContent = message;
  }, 50);
}

function originOf(element: Element | null): Origin | undefined {
  if (!element) return undefined;
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

function isOpen(): boolean {
  return toggle?.getAttribute('aria-expanded') === 'true';
}

function open() {
  if (!toggle || !panel) return;
  syncControls();
  panel.hidden = false;
  toggle.setAttribute('aria-expanded', 'true');
  const target = themeInputs.find((input) => input.checked) || themeInputs[0];
  target?.focus({ preventScroll: true });
}

function close(returnFocus = false) {
  if (!toggle || !panel || !isOpen()) return;
  panel.hidden = true;
  toggle.setAttribute('aria-expanded', 'false');
  if (returnFocus) toggle.focus();
}

toggle?.addEventListener('click', () => {
  if (isOpen()) close();
  else open();
});

doneButton?.addEventListener('click', () => close(true));

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !isOpen()) return;
  event.stopPropagation();
  close(true);
});

document.addEventListener('pointerdown', (event) => {
  if (!isOpen() || !container) return;
  if (event.target instanceof Node && container.contains(event.target)) return;
  close();
});

document.addEventListener('focusin', (event) => {
  if (!isOpen() || !container) return;
  if (event.target instanceof Node && container.contains(event.target)) return;
  close();
});

themeInputs.forEach((input) => {
  input.addEventListener('change', () => {
    if (!input.checked || !isThemePreference(input.value)) return;
    update({ theme: input.value }, originOf(input.closest('.theme-option')));
    const resolved = resolveTheme(settings.theme, systemDark.matches);
    announce(settings.theme === 'system' ? `System theme, ${resolved} right now` : `${input.value} theme`);
  });
});

scaleInput?.addEventListener('input', () => {
  update({ textScale: clampTextScale(scaleInput.value) });
});

dyslexicInput?.addEventListener('change', () => {
  update({ dyslexicFont: dyslexicInput.checked });
  announce(dyslexicInput.checked ? 'Dyslexia-friendly font on' : 'Dyslexia-friendly font off');
});

motionInput?.addEventListener('change', () => {
  update({ reduceMotion: motionInput.checked });
  announce(motionInput.checked ? 'Reduce motion on' : 'Reduce motion off');
});

resetButton?.addEventListener('click', () => {
  update({ ...DEFAULT_APPEARANCE }, originOf(resetButton));
  announce('Display settings reset');
});

systemDark.addEventListener('change', () => {
  applySettings();
  syncControls();
});

systemReduce.addEventListener('change', () => {
  applySettings();
  syncControls();
});

window.addEventListener('storage', (event) => {
  if (event.key !== APPEARANCE_STORAGE_KEY && event.key !== null) return;
  settings = readStored();
  applySettings();
  syncControls();
});

applySettings();
syncControls();
