import {
  MAP_HEIGHT,
  MAP_WIDTH,
  METERS_PER_MINUTE,
  METERS_PER_UNIT,
  allPlaces,
  walkEdges,
  walkNodes,
  type Place,
} from '../data/campus-map';
import { buildGraph, findRoute, hasStepFreeDoor, placeMatches, type Route } from '../lib/campus-route';

type View = { x: number; y: number; w: number; h: number };
type Box = { x: number; y: number; w: number; h: number };

const HOME: Box = { x: 200, y: 28, w: 1160, h: 900 };
const MAX_ZOOM = 5;

function init(root: HTMLElement) {
  const $ = <T extends Element>(selector: string) => root.querySelector<T>(selector);
  const $$ = <T extends Element>(selector: string) => [...root.querySelectorAll<T>(selector)];
  const need = <T extends Element>(selector: string): T => {
    const el = root.querySelector<T>(selector);
    if (!el) throw new Error(`Campus map markup is missing ${selector}`);
    return el;
  };

  const stage = need<HTMLElement>('[data-cm-stage]');
  const viewport = need<HTMLElement>('[data-cm-viewport]');
  const svg = need<SVGSVGElement>('[data-cm-svg]');
  const panel = need<HTMLElement>('[data-cm-panel]');
  const search = need<HTMLInputElement>('#cm-q');
  const count = need<HTMLElement>('#cm-count');
  const none = need<HTMLElement>('[data-cm-none]');
  const findSection = need<HTMLElement>('[data-cm-find]');
  const dirSection = need<HTMLElement>('[data-cm-directions]');
  const dirToggle = need<HTMLButtonElement>('[data-cm-dir-toggle]');
  const fromSelect = need<HTMLSelectElement>('[data-cm-from]');
  const toSelect = need<HTMLSelectElement>('[data-cm-to]');
  const stepFreeBox = need<HTMLInputElement>('[data-cm-stepfree]');
  const result = need<HTMLElement>('[data-cm-route-result]');
  const stepsList = need<HTMLOListElement>('[data-cm-steps]');
  const hint = need<HTMLElement>('[data-cm-hint]');
  const banner = need<HTMLElement>('[data-cm-pick-banner]');
  const routeGroup = need<SVGGElement>('[data-cm-route]');
  const routeLine = need<SVGPathElement>('[data-cm-route-line]');
  const routeCasing = need<SVGPathElement>('[data-cm-route-casing]');
  const routeDots = need<SVGPathElement>('[data-cm-route-dots]');
  const pinA = need<SVGGElement>('[data-cm-pin-a]');
  const pinB = need<SVGGElement>('[data-cm-pin-b]');
  const scaleBar = need<HTMLElement>('[data-cm-scale-bar]');
  const scaleLabel = need<HTMLElement>('[data-cm-scale-label]');

  const graph = buildGraph(walkNodes, walkEdges);
  const byId = new Map(allPlaces.map((p) => [p.id, p]));
  const shapes = new Map($$<SVGGElement>('[data-place]').map((g) => [g.dataset.place as string, g]));
  const items = new Map($$<HTMLLIElement>('[data-cm-item]').map((li) => [li.dataset.cmItem as string, li]));
  const details = new Map($$<HTMLElement>('[data-cm-detail]').map((a) => [a.dataset.cmDetail as string, a]));
  const doors = $$<SVGUseElement>('[data-door-of]');
  const chips = $$<HTMLButtonElement>('[data-cm-filter]');
  const zoomIn = $<HTMLButtonElement>('[data-cm-zoom="in"]');
  const zoomOut = $<HTMLButtonElement>('[data-cm-zoom="out"]');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const wide = window.matchMedia('(min-width: 961px)');

  const state = {
    view: { ...HOME } as View,
    selected: null as string | null,
    directions: false,
    categories: new Set<string>(),
    access: false,
    query: '',
    route: null as Route | null,
    trigger: null as HTMLElement | SVGElement | null,
  };

  // ---------- View: zoom and pan by rewriting the SVG viewBox ----------

  const size = () => ({ w: viewport.clientWidth || 1, h: viewport.clientHeight || 1 });
  const panelPx = () => (wide.matches && !panel.hidden ? panel.offsetWidth : 0);
  const fitScale = (box: Box, availW: number, availH: number, pad = 24) =>
    Math.min((availW - 2 * pad) / box.w, (availH - 2 * pad) / box.h);
  const minScale = () => {
    const { w, h } = size();
    return Math.min(w / MAP_WIDTH, h / MAP_HEIGHT) * 0.95;
  };
  const homeScale = () => {
    const { w, h } = size();
    return fitScale(HOME, w, h, 8);
  };
  const maxScale = () => homeScale() * MAX_ZOOM;
  const scaleOf = (v: View) => size().w / v.w;

  function clampView(v: View): View {
    const { w: pw, h: ph } = size();
    const s = Math.min(maxScale(), Math.max(minScale(), pw / v.w));
    const w = pw / s;
    const h = ph / s;
    const cx = Math.min(MAP_WIDTH, Math.max(0, v.x + v.w / 2));
    const cy = Math.min(MAP_HEIGHT, Math.max(0, v.y + v.h / 2));
    const scaleChanged = Math.abs(w - v.w) > 0.01;
    const x = scaleChanged ? cx - w / 2 : Math.min(MAP_WIDTH - w / 2, Math.max(-w / 2, v.x));
    const y = scaleChanged ? cy - h / 2 : Math.min(MAP_HEIGHT - h / 2, Math.max(-h / 2, v.y));
    return { x, y, w, h };
  }

  function apply(v: View) {
    state.view = v;
    svg.setAttribute('viewBox', `${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.w.toFixed(2)} ${v.h.toFixed(2)}`);
    const s = scaleOf(v);
    const meters = [10, 20, 25, 50, 100, 200, 250, 500].find((m) => (m / METERS_PER_UNIT) * s >= 56) ?? 500;
    scaleBar.style.width = `${Math.round((meters / METERS_PER_UNIT) * s)}px`;
    scaleLabel.textContent = `${meters} m`;
    if (zoomIn) zoomIn.disabled = s >= maxScale() - 1e-6;
    if (zoomOut) zoomOut.disabled = s <= minScale() + 1e-6;
  }

  /** View that fits a box into the part of the map not covered by the panel. */
  function viewFor(box: Box, { pad = 40, maxS = maxScale() * 0.8, right = 0 } = {}): View {
    const { w: pw, h: ph } = size();
    const offset = panelPx() + right;
    const availW = Math.max(200, pw - offset);
    const s = Math.max(minScale(), Math.min(maxS, fitScale(box, availW, ph, pad)));
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    return { x: cx - availW / 2 / s, y: cy - ph / 2 / s, w: pw / s, h: ph / s };
  }

  let frame = 0;
  function animateTo(target: View, duration = 700) {
    cancelAnimationFrame(frame);
    if (reduceMotion.matches || duration <= 0) {
      apply(target);
      return;
    }
    const from = { ...state.view };
    const start = performance.now();
    const fc = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
    const tc = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const k = ease(t);
      const w = from.w * (target.w / from.w) ** k;
      const h = from.h * (target.h / from.h) ** k;
      const cx = fc.x + (tc.x - fc.x) * k;
      const cy = fc.y + (tc.y - fc.y) * k;
      apply({ x: cx - w / 2, y: cy - h / 2, w, h });
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  function zoomAt(factor: number, px: number, py: number, animate = false) {
    const v = state.view;
    const { w: pw, h: ph } = size();
    const mx = v.x + (px / pw) * v.w;
    const my = v.y + (py / ph) * v.h;
    const s = Math.min(maxScale(), Math.max(minScale(), scaleOf(v) * factor));
    const w = pw / s;
    const h = ph / s;
    const next = { x: mx - (px / pw) * w, y: my - (py / ph) * h, w, h };
    if (animate) animateTo(next, 320);
    else {
      cancelAnimationFrame(frame);
      apply(next);
    }
  }

  const goHome = (duration = 700) => animateTo(clampView(viewFor(HOME, { pad: 8, maxS: Infinity })), duration);

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = viewport.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  viewport.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? 400 : 1;
      const factor = Math.exp((-event.deltaY * unit) / 500);
      const p = local(event);
      zoomAt(factor, p.x, p.y);
    },
    { passive: false },
  );

  const pointers = new Map<number, { x: number; y: number }>();
  let dragging = false;
  let suppressClick = false;
  let downAt = { x: 0, y: 0 };
  let pinch: { dist: number; mid: { x: number; y: number }; view: View } | null = null;

  const pinchInfo = () => {
    const [a, b] = [...pointers.values()];
    if (!a || !b) return null;
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };

  viewport.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if ((event.target as Element).closest('.cm-zoom, .cm-panel')) return;
    pointers.set(event.pointerId, local(event));
    if (pointers.size === 1) {
      downAt = local(event);
      dragging = false;
    }
    if (pointers.size === 2) {
      const info = pinchInfo();
      if (info) pinch = { ...info, view: { ...state.view } };
      dragging = true;
      for (const id of pointers.keys()) {
        if (!viewport.hasPointerCapture(id)) viewport.setPointerCapture(id);
      }
    }
  });

  viewport.addEventListener('pointermove', (event) => {
    const last = pointers.get(event.pointerId);
    if (!last) return;
    const p = local(event);
    pointers.set(event.pointerId, p);
    const { w: pw, h: ph } = size();

    if (pointers.size >= 2 && pinch) {
      const info = pinchInfo();
      if (!info) return;
      const s0 = pw / pinch.view.w;
      const s = Math.min(maxScale(), Math.max(minScale(), s0 * (info.dist / pinch.dist)));
      const mx = pinch.view.x + pinch.mid.x / s0;
      const my = pinch.view.y + pinch.mid.y / s0;
      cancelAnimationFrame(frame);
      apply({ x: mx - info.mid.x / s, y: my - info.mid.y / s, w: pw / s, h: ph / s });
      return;
    }

    if (!dragging && Math.hypot(p.x - downAt.x, p.y - downAt.y) > 5) {
      dragging = true;
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add('is-dragging');
    }
    if (dragging) {
      cancelAnimationFrame(frame);
      const v = state.view;
      apply(clampView({ ...v, x: v.x - ((p.x - last.x) * v.w) / pw, y: v.y - ((p.y - last.y) * v.h) / ph }));
    }
  });

  const endPointer = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      if (dragging) {
        suppressClick = true;
        window.setTimeout(() => (suppressClick = false), 0);
      }
      dragging = false;
      viewport.classList.remove('is-dragging');
    }
  };
  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);

  // Focusing an SVG element outside the visible viewBox can scroll a clipped ancestor.
  for (const el of [stage, viewport]) {
    el.addEventListener('scroll', () => {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    });
  }

  viewport.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const place = (event.target as Element).closest<SVGGElement>('[data-place]');
    if (place && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      activate(place.dataset.place as string, place);
      return;
    }
    const v = state.view;
    const { w: pw, h: ph } = size();
    const pan = (dx: number, dy: number) => animateTo(clampView({ ...v, x: v.x + dx * v.w, y: v.y + dy * v.h }), 220);
    switch (event.key) {
      case 'ArrowLeft':
        pan(-0.15, 0);
        break;
      case 'ArrowRight':
        pan(0.15, 0);
        break;
      case 'ArrowUp':
        pan(0, -0.15);
        break;
      case 'ArrowDown':
        pan(0, 0.15);
        break;
      case '+':
      case '=':
        zoomAt(1.4, pw / 2, ph / 2, true);
        break;
      case '-':
      case '_':
        zoomAt(1 / 1.4, pw / 2, ph / 2, true);
        break;
      case '0':
        goHome(450);
        break;
      default:
        return;
    }
    event.preventDefault();
  });

  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!panel.hidden) {
      event.preventDefault();
      closePanel();
    }
  });

  svg.addEventListener('focusin', (event) => {
    const place = (event.target as Element).closest<SVGGElement>('[data-place]');
    if (!place || pointers.size) return;
    const box = placeBox(byId.get(place.dataset.place as string));
    if (!box) return;
    const v = state.view;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const visibleW = v.w - panelPx() / scaleOf(v);
    const inside = cx > v.x + v.w * 0.08 && cx < v.x + visibleW - v.w * 0.08 && cy > v.y + v.h * 0.1 && cy < v.y + v.h * 0.9;
    if (!inside) animateTo(clampView({ ...v, x: cx - visibleW / 2, y: cy - v.h / 2 }), 380);
  });

  $$<HTMLButtonElement>('[data-cm-zoom]').forEach((button) =>
    button.addEventListener('click', () => {
      const { w: pw, h: ph } = size();
      const kind = button.dataset.cmZoom;
      const cx = (pw - panelPx()) / 2;
      if (kind === 'in') zoomAt(1.5, cx, ph / 2, true);
      else if (kind === 'out') zoomAt(1 / 1.5, cx, ph / 2, true);
      else goHome();
    }),
  );

  let lastSize = size();
  new ResizeObserver(() => {
    const next = size();
    if (next.w === lastSize.w && next.h === lastSize.h) return;
    const v = state.view;
    const s = lastSize.w / v.w;
    const cx = v.x + v.w / 2;
    const cy = v.y + v.h / 2;
    lastSize = next;
    const w = next.w / s;
    const h = next.h / s;
    apply(clampView({ x: cx - w / 2, y: cy - h / 2, w, h }));
  }).observe(viewport);

  // ---------- Places ----------

  function placeBox(place: Place | undefined): Box | null {
    if (!place) return null;
    const xs = place.rects.flatMap(([x, , w]) => [x, x + w]);
    const ys = place.rects.flatMap(([, y, , h]) => [y, y + h]);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
  }

  const grow = (box: Box, minW: number, minH: number): Box => {
    const w = Math.max(box.w, minW);
    const h = Math.max(box.h, minH);
    return { x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h };
  };

  function setUrl(params: Record<string, string | null>) {
    const url = new URL(window.location.href);
    for (const key of ['place', 'from', 'to', 'stepfree']) url.searchParams.delete(key);
    for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
    window.history.replaceState(null, '', url);
  }

  function activate(id: string, trigger: HTMLElement | SVGElement | null) {
    if (state.directions) {
      pickForRoute(id);
      return;
    }
    state.trigger = trigger;
    select(id, true);
  }

  function select(id: string, moveFocus: boolean) {
    const place = byId.get(id);
    if (!place) return;
    state.selected = id;
    for (const [key, g] of shapes) g.classList.toggle('is-selected', key === id);
    for (const [key, li] of items) {
      const button = li.querySelector('button');
      if (key === id) button?.setAttribute('aria-current', 'true');
      else button?.removeAttribute('aria-current');
    }
    for (const [key, article] of details) article.hidden = key !== id;
    panel.hidden = false;
    panel.scrollTop = 0;
    stage.classList.add('has-panel');

    const box = placeBox(place);
    if (box) animateTo(clampView(viewFor(grow(box, 440, 330), { pad: 30 })), 850);
    setUrl({ place: id });

    if (moveFocus) {
      const title = details.get(id)?.querySelector<HTMLElement>('.cm-detail-title');
      title?.focus({ preventScroll: wide.matches });
    }
  }

  function closePanel() {
    if (panel.hidden) return;
    panel.hidden = true;
    stage.classList.remove('has-panel');
    for (const g of shapes.values()) g.classList.remove('is-selected');
    for (const li of items.values()) li.querySelector('button')?.removeAttribute('aria-current');
    state.selected = null;
    if (!state.directions) setUrl({});
    const back = state.trigger;
    state.trigger = null;
    if (back && back.isConnected && !(back.closest('li')?.hidden ?? false)) back.focus({ preventScroll: true });
    else viewport.focus({ preventScroll: true });
  }

  svg.addEventListener('click', (event) => {
    if (suppressClick) return;
    const g = (event.target as Element).closest<SVGGElement>('[data-place]');
    if (g) activate(g.dataset.place as string, g);
  });

  $$<HTMLButtonElement>('[data-cm-select]').forEach((button) =>
    button.addEventListener('click', () => activate(button.dataset.cmSelect as string, button)),
  );

  $<HTMLButtonElement>('[data-cm-close]')?.addEventListener('click', closePanel);

  // ---------- Search and filters ----------

  const isVisible = (place: Place) =>
    placeMatches(place, state.query) &&
    (state.categories.size === 0 || place.categories.some((c) => state.categories.has(c))) &&
    (!state.access || hasStepFreeDoor(place));

  let announce = 0;
  let refit = 0;
  function applyFilters({ fit = false } = {}) {
    const filtering = Boolean(state.query.trim()) || state.categories.size > 0 || state.access;
    const visible = allPlaces.filter(isVisible);
    const visibleIds = new Set(visible.map((p) => p.id));
    for (const [id, li] of items) li.hidden = !visibleIds.has(id);
    for (const [id, g] of shapes) g.classList.toggle('is-dimmed', !state.directions && filtering && !visibleIds.has(id));
    for (const door of doors) door.classList.toggle('is-dimmed', !visibleIds.has(door.dataset.doorOf as string));
    root.dataset.access = String(state.access);
    none.hidden = visible.length > 0;

    window.clearTimeout(announce);
    announce = window.setTimeout(() => {
      const total = allPlaces.length;
      count.textContent = filtering
        ? `${visible.length} of ${total} places shown${state.access ? ', with step-free entrance markers on the map' : ''}`
        : `${total} places`;
    }, 250);

    if (!fit) return;
    window.clearTimeout(refit);
    refit = window.setTimeout(() => {
      if (!filtering) {
        if (!state.selected) goHome();
        return;
      }
      const boxes = visible.map(placeBox).filter((b): b is Box => Boolean(b));
      if (!boxes.length || state.selected) return;
      const x0 = Math.min(...boxes.map((b) => b.x));
      const y0 = Math.min(...boxes.map((b) => b.y));
      const x1 = Math.max(...boxes.map((b) => b.x + b.w));
      const y1 = Math.max(...boxes.map((b) => b.y + b.h));
      animateTo(clampView(viewFor(grow({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, 520, 380), { pad: 48 })));
    }, 320);
  }

  search.addEventListener('input', () => {
    state.query = search.value;
    applyFilters({ fit: true });
  });

  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const first = [...items.values()].find((li) => !li.hidden)?.querySelector('button');
      first?.click();
    } else if (event.key === 'Escape' && search.value) {
      event.stopPropagation();
      search.value = '';
      state.query = '';
      applyFilters({ fit: true });
    }
  });

  for (const chip of chips) {
    chip.addEventListener('click', () => {
      const key = chip.dataset.cmFilter as string;
      const on = chip.getAttribute('aria-pressed') !== 'true';
      chip.setAttribute('aria-pressed', String(on));
      if (key === 'access') state.access = on;
      else if (on) state.categories.add(key);
      else state.categories.delete(key);
      applyFilters({ fit: true });
    });
  }

  $<HTMLButtonElement>('[data-cm-reset-filters]')?.addEventListener('click', () => {
    search.value = '';
    state.query = '';
    state.categories.clear();
    state.access = false;
    for (const chip of chips) chip.setAttribute('aria-pressed', 'false');
    applyFilters({ fit: true });
    search.focus();
  });

  // ---------- Walking directions ----------

  function setDirections(on: boolean, { focus = true } = {}) {
    state.directions = on;
    dirToggle.setAttribute('aria-pressed', String(on));
    findSection.hidden = on;
    dirSection.hidden = !on;
    root.classList.toggle('is-directions', on);
    if (on) {
      const keep = state.selected;
      if (!panel.hidden) closePanel();
      if (keep && !fromSelect.value && !toSelect.value) toSelect.value = keep;
      updatePicking();
      computeRoute();
      if (focus) fromSelect.focus();
    } else {
      clearRouteDrawing();
      banner.hidden = true;
      setUrl({});
      if (focus) dirToggle.focus();
    }
    applyFilters();
  }

  function updatePicking() {
    const from = fromSelect.value;
    const to = toSelect.value;
    let text = '';
    if (!from) text = 'Pick a starting place on the map';
    else if (!to) text = `From ${byId.get(from)?.name}: now pick a destination`;
    banner.textContent = text;
    banner.hidden = !state.directions || !text;
    hint.textContent = !from
      ? 'Choose a starting place, then a destination. You can pick either on the map.'
      : !to
        ? 'Now choose a destination, from the list or on the map.'
        : 'Pick another place on the map to start a new route.';
  }

  function pickForRoute(id: string) {
    if (!fromSelect.value || (fromSelect.value && toSelect.value)) {
      fromSelect.value = id;
      toSelect.value = '';
    } else if (id !== fromSelect.value) {
      toSelect.value = id;
    }
    updatePicking();
    computeRoute({ pickedOnMap: true });
  }

  function clearRouteDrawing() {
    state.route = null;
    routeGroup.classList.remove('is-shown', 'is-drawn');
    for (const g of shapes.values()) g.classList.remove('is-route-end');
    result.replaceChildren();
    result.classList.remove('is-warning');
    stepsList.replaceChildren();
    stepsList.hidden = true;
  }

  function showMessage(text: string) {
    const p = document.createElement('p');
    p.textContent = text;
    result.replaceChildren(p);
    result.classList.add('is-warning');
  }

  function computeRoute({ pickedOnMap = false } = {}) {
    clearRouteDrawing();
    const fromId = fromSelect.value;
    const toId = toSelect.value;
    const stepFree = stepFreeBox.checked;
    for (const id of [fromId, toId]) if (id) shapes.get(id)?.classList.add('is-route-end');
    if (state.directions) setUrl({ from: fromId || null, to: toId || null, stepfree: stepFree ? '1' : null });
    if (!fromId || !toId) {
      const only = byId.get(fromId || toId);
      const box = placeBox(only);
      if (box && state.directions && !pickedOnMap) animateTo(clampView(viewFor(grow(box, 520, 380), { pad: 30 })), 600);
      return;
    }
    if (fromId === toId) {
      showMessage('Choose two different places.');
      return;
    }
    const from = byId.get(fromId);
    const to = byId.get(toId);
    if (!from || !to) return;
    const route = findRoute(graph, from, to, { stepFree, metersPerUnit: METERS_PER_UNIT, metersPerMinute: METERS_PER_MINUTE });
    if (!route) {
      showMessage('No walking route connects those places.');
      return;
    }
    state.route = route;
    renderRoute(route, from, to, stepFree);
  }

  function renderRoute(route: Route, from: Place, to: Place, stepFree: boolean) {
    const time = document.createElement('p');
    time.className = 'cm-route-time';
    time.textContent = `${route.minutes} min walk`;
    const meta = document.createElement('p');
    meta.className = 'cm-route-meta';
    const notes = [`About ${Math.round(route.meters / 10) * 10} m from ${from.name} to ${to.name}`];
    if (stepFree) notes.push(route.usesStairs ? 'no fully step-free route found' : 'step-free');
    else if (route.usesStairs) notes.push('includes steps');
    meta.textContent = notes.join(' · ');
    result.replaceChildren(time, meta);

    stepsList.replaceChildren(
      ...route.steps.map((step) => {
        const li = document.createElement('li');
        li.textContent = step.text;
        return li;
      }),
    );
    stepsList.hidden = false;

    const d = route.points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('');
    for (const path of [routeCasing, routeLine, routeDots]) path.setAttribute('d', d);
    const first = route.points[0];
    const last = route.points.at(-1);
    if (first) pinA.setAttribute('transform', `translate(${first.x} ${first.y})`);
    if (last) pinB.setAttribute('transform', `translate(${last.x} ${last.y})`);
    routeGroup.classList.add('is-shown');

    const xs = route.points.map((p) => p.x);
    const ys = route.points.map((p) => p.y);
    const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    animateTo(clampView(viewFor(grow(box, 320, 240), { pad: 80, right: 56 })), 900);

    const length = routeLine.getTotalLength();
    const draw = [routeCasing, routeLine];
    if (reduceMotion.matches) {
      routeGroup.classList.add('is-drawn');
      return;
    }
    for (const path of draw) {
      path.style.transition = 'none';
      path.style.strokeDasharray = `${length} ${length}`;
      path.style.strokeDashoffset = String(length);
    }
    void routeLine.getBoundingClientRect();
    const duration = Math.min(2.2, 0.9 + length / 900);
    for (const path of draw) {
      path.style.transition = `stroke-dashoffset ${duration}s cubic-bezier(0.45, 0, 0.25, 1) 0.25s`;
      path.style.strokeDashoffset = '0';
    }
    const token = route;
    window.setTimeout(() => {
      if (state.route === token) routeGroup.classList.add('is-drawn');
    }, (duration + 0.25) * 1000);
  }

  dirToggle.addEventListener('click', () => setDirections(!state.directions));
  fromSelect.addEventListener('change', () => {
    updatePicking();
    computeRoute();
  });
  toSelect.addEventListener('change', () => {
    updatePicking();
    computeRoute();
  });
  stepFreeBox.addEventListener('change', () => computeRoute());
  $<HTMLButtonElement>('[data-cm-swap]')?.addEventListener('click', () => {
    const a = fromSelect.value;
    fromSelect.value = toSelect.value;
    toSelect.value = a;
    updatePicking();
    computeRoute();
  });
  $<HTMLButtonElement>('[data-cm-clear-route]')?.addEventListener('click', () => {
    fromSelect.value = '';
    toSelect.value = '';
    clearRouteDrawing();
    updatePicking();
    setUrl({});
    goHome(600);
    fromSelect.focus();
  });

  root.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-cm-route-to], [data-cm-route-from]');
    if (!button) return;
    const to = button.dataset.cmRouteTo;
    const from = button.dataset.cmRouteFrom;
    if (!panel.hidden) closePanel();
    if (to) {
      toSelect.value = to;
      if (fromSelect.value === to) fromSelect.value = '';
    }
    if (from) {
      fromSelect.value = from;
      if (toSelect.value === from) toSelect.value = '';
    }
    setDirections(true, { focus: false });
    (!fromSelect.value ? fromSelect : !toSelect.value ? toSelect : fromSelect).focus();
  });

  // ---------- Start ----------

  apply(clampView(viewFor(HOME, { pad: 8, maxS: Infinity })));
  applyFilters();
  root.classList.add('is-ready');

  const params = new URL(window.location.href).searchParams;
  const from = params.get('from');
  const to = params.get('to');
  const place = params.get('place');
  if ((from && byId.has(from)) || (to && byId.has(to))) {
    if (from && byId.has(from)) fromSelect.value = from;
    if (to && byId.has(to)) toSelect.value = to;
    stepFreeBox.checked = params.get('stepfree') === '1';
    setDirections(true, { focus: false });
  } else if (place && byId.has(place)) {
    select(place, false);
  }
}

const root = document.querySelector<HTMLElement>('[data-cm]');
if (root) init(root);
