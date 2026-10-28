import { campuses, type Campus } from '../data/campuses';
import {
  campusInstant,
  coordinatedMarsTime,
  localSolClock,
  marsSolDate,
  marsYear,
  seasonAt,
  solarLongitude,
  stationWeather,
} from '../lib/mars-time';
import { u } from '../lib/paths';
import type { GlobeHandle } from './mars-globe-scene';

type Mode = 'pending' | 'loading' | '3d' | 'map';

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

const minus = (n: number) => (n < 0 ? `−${Math.abs(n)}` : String(n));
const solNumber = (n: number) => n.toLocaleString('en-US');

function dayPart(hours: number): string {
  if (hours < 5) return 'Night';
  if (hours < 7) return 'Dawn';
  if (hours < 12) return 'Morning';
  if (hours < 17) return 'Afternoon';
  if (hours < 19) return 'Dusk';
  return 'Night';
}

function init(root: HTMLElement) {
  const stage = root.querySelector<HTMLElement>('[data-globe-stage]')!;
  const host = root.querySelector<HTMLElement>('[data-globe-canvas]')!;
  const status = root.querySelector<HTMLElement>('[data-globe-status]')!;
  const live = root.querySelector<HTMLElement>('[data-globe-live]')!;
  const optIn = root.querySelector<HTMLButtonElement>('[data-globe-optin]')!;
  const cardsBox = root.querySelector<HTMLElement>('[data-campus-cards]')!;
  const cards = new Map<string, HTMLElement>();
  for (const card of root.querySelectorAll<HTMLElement>('[data-campus-card]')) cards.set(card.dataset.campusCard!, card);
  const selectors = [...root.querySelectorAll<HTMLAnchorElement>('[data-campus-select]')];
  const mapPins = selectors.filter((el) => el.classList.contains('map-pin'));
  const byId = new Map<string, Campus>(campuses.map((c) => [c.id, c]));
  const order = campuses.map((c) => c.id);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const webgl = hasWebGL();

  let mode: Mode = 'pending';
  let globe: GlobeHandle | null = null;
  let active: string | null = null;

  root.classList.add('is-enhanced');
  for (const card of cards.values()) card.hidden = true;
  cardsBox.hidden = true;

  function setMode(next: Mode) {
    mode = next;
    root.dataset.mode = next;
    const interactive = next === '3d';
    if (interactive) {
      stage.tabIndex = 0;
      stage.setAttribute('role', 'application');
      stage.setAttribute('aria-roledescription', '3D globe');
      stage.setAttribute('aria-label', 'Globe of Mars with the Jezero campus and three field stations');
    } else {
      stage.removeAttribute('tabindex');
      stage.removeAttribute('role');
      stage.removeAttribute('aria-roledescription');
      stage.removeAttribute('aria-label');
    }
    optIn.hidden = !(next === 'map' && webgl);
    if (next === 'loading') status.textContent = 'Loading the globe…';
    else if (next === 'map')
      status.textContent = webgl
        ? 'Motion is reduced on this device, so the campuses are shown on a flat map.'
        : 'This browser cannot draw the 3D globe, so the campuses are shown on a flat map.';
    else status.textContent = '';
  }

  async function load3d() {
    if (globe || mode === 'loading') return;
    setMode('loading');
    try {
      const { createGlobe } = await import('./mars-globe-scene');
      globe = createGlobe({
        host,
        sites: campuses.map((c) => ({ id: c.id, label: c.short, lat: c.lat, lon: c.lon, main: c.kind === 'Main campus' })),
        colorUrl: u('/textures/mars-color.jpg'),
        bumpUrl: u('/textures/mars-bump.jpg'),
        reducedMotion: reduce.matches,
        onPick: (id) => select(id),
        onReady: () => {
          setMode('3d');
          if (active) {
            globe?.focus(active);
            syncInset();
          }
        },
        onError: () => {
          globe = null;
          setMode('map');
        },
      });
    } catch {
      globe = null;
      setMode('map');
    }
  }

  function syncInset() {
    if (!globe) return;
    const overlay = active && mode === '3d' && getComputedStyle(cardsBox).position === 'absolute';
    globe.setCardInset(overlay ? cardsBox.offsetWidth + 24 : 0);
  }

  function refresh() {
    const now = campusInstant();
    const msd = marsSolDate(now);
    const mtc = coordinatedMarsTime(now);
    const hh = Math.floor(mtc);
    const mm = Math.floor((mtc - hh) * 60);
    setText(root, '[data-hud-mtc]', `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
    setText(root, '[data-hud-sol]', solNumber(Math.floor(msd)));
    setText(root, '[data-hud-year]', String(marsYear(now)));
    setText(root, '[data-hud-ls]', `${Math.round(solarLongitude(now))}°`);

    if (!active) return;
    const campus = byId.get(active)!;
    const card = cards.get(active)!;
    const clock = localSolClock(now, campus.lon);
    const weather = stationWeather(campus.id, campus.weather, clock);
    setText(card, '[data-clock]', clock.label);
    setText(card, '[data-daypart]', dayPart(clock.hours));
    setText(card, '[data-sol]', solNumber(clock.sol));
    setText(card, '[data-season]', seasonAt(now, campus.lat));
    setText(card, '[data-w-now]', `${minus(weather.nowC)} °C`);
    setText(card, '[data-w-range]', `${minus(weather.highC)} / ${minus(weather.lowC)} °C`);
    setText(card, '[data-w-pressure]', `${weather.pressurePa.toLocaleString('en-US')} Pa`);
    setText(card, '[data-w-wind]', `${weather.windKph} km/h from the ${weather.windFrom}`);
    setText(card, '[data-w-sky]', `${weather.sky} (τ ${weather.dustTau.toFixed(2)})`);
  }

  function setText(scope: ParentNode, selector: string, text: string) {
    const el = scope.querySelector(selector);
    if (el && el.textContent !== text) el.textContent = text;
  }

  function select(id: string, opts: { focusPin?: boolean } = {}) {
    const campus = byId.get(id);
    if (!campus) return;
    active = id;
    cardsBox.hidden = false;
    for (const [key, card] of cards) card.hidden = key !== id;
    for (const el of selectors) {
      if (el.dataset.campusSelect === id) el.setAttribute('aria-current', 'true');
      else el.removeAttribute('aria-current');
    }
    root.dataset.active = id;
    refresh();
    globe?.focus(id);
    syncInset();
    if (opts.focusPin && mode === 'map') mapPins.find((pin) => pin.dataset.campusSelect === id)?.focus();
    const index = order.indexOf(id) + 1;
    live.textContent = `${campus.name}, ${campus.kind.toLowerCase()}, ${index} of ${order.length}. Founded ${campus.founded}.`;
  }

  function close() {
    if (!active) return;
    const hadFocus = cardsBox.contains(document.activeElement);
    active = null;
    delete root.dataset.active;
    cardsBox.hidden = true;
    for (const card of cards.values()) card.hidden = true;
    for (const el of selectors) el.removeAttribute('aria-current');
    globe?.release();
    syncInset();
    live.textContent = 'Campus details closed.';
    if (hadFocus) (mode === '3d' ? stage : selectors[0]).focus();
  }

  function cycle(step: number) {
    const current = active ? order.indexOf(active) : step > 0 ? -1 : 0;
    const next = order[(current + step + order.length) % order.length];
    select(next, { focusPin: true });
  }

  for (const el of selectors) {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      select(el.dataset.campusSelect!);
    });
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-campus-close]')) {
    button.addEventListener('click', close);
  }
  root.querySelector('[data-globe-zoom-in]')?.addEventListener('click', () => globe?.zoomBy(0.8));
  root.querySelector('[data-globe-zoom-out]')?.addEventListener('click', () => globe?.zoomBy(1.25));
  root.querySelector('[data-globe-reset]')?.addEventListener('click', () => {
    close();
    globe?.resetView();
  });
  optIn.addEventListener('click', () => {
    load3d().then(() => stage.focus());
  });

  root.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    const onStage = target === stage;
    const onPin = mapPins.includes(target as HTMLAnchorElement);
    const inCard = cardsBox.contains(target);
    if (event.key === 'Escape' && (onStage || onPin || inCard) && active) {
      event.preventDefault();
      close();
      return;
    }
    if (!onStage && !onPin) return;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        cycle(1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        cycle(-1);
        break;
      case '+':
      case '=':
        globe?.zoomBy(0.8);
        break;
      case '-':
      case '_':
        globe?.zoomBy(1.25);
        break;
      case 'Home':
      case '0':
        close();
        globe?.resetView();
        break;
      case 'Enter':
      case ' ':
        if (!onStage) return;
        select(active ?? order[0]);
        break;
      default:
        return;
    }
    event.preventDefault();
  });

  window.addEventListener('resize', syncInset);
  reduce.addEventListener('change', (event) => globe?.setReducedMotion(event.matches));

  refresh();
  window.setInterval(refresh, 1000);

  if (reduce.matches || !webgl) {
    setMode('map');
    return;
  }
  setMode('pending');
  const lazy = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      lazy.disconnect();
      load3d();
    },
    { rootMargin: '200px 0px' },
  );
  lazy.observe(stage);
}

const explorer = document.querySelector<HTMLElement>('[data-campus-globe]');
if (explorer) init(explorer);
