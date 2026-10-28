import {
  COST_ITEMS,
  DEFAULT_SCENARIO,
  DEPENDENCY_OPTIONS,
  FUNDING_ITEMS,
  GRANT_ITEMS,
  HOUSING_OPTIONS,
  LIMITS,
  RESIDENCY_OPTIONS,
  decodeScenario,
  encodeScenario,
  estimate,
  formatMoney,
  normalizeScenario,
  type Dependency,
  type Estimate,
  type Housing,
  type Residency,
  type Scenario,
} from '../lib/net-price';

type Id = 'a' | 'b';
type Values = Record<string, number>;

const STEP_NAMES = ['Residency', 'Housing', 'Household', 'Income & assets', 'Review'];
const LAST_STEP = STEP_NAMES.length;
const DURATION = 700;
const RING = 2 * Math.PI * 78;
const SEGMENT_GAP = 1.8;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

class Tween {
  current: Values = {};
  private from: Values = {};
  private target: Values = {};
  private started = 0;
  private frame = 0;
  private readonly draw: (values: Values) => void;

  constructor(draw: (values: Values) => void) {
    this.draw = draw;
  }

  to(target: Values, instant = false) {
    this.from = { ...this.current };
    this.target = { ...target };
    if (instant || reduceMotion.matches) {
      this.finish();
      return;
    }
    this.started = performance.now();
    if (!this.frame) this.frame = requestAnimationFrame(this.tick);
  }

  finish() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.current = { ...this.target };
    this.draw(this.current);
  }

  private tick = (now: number) => {
    const t = Math.min(1, (now - this.started) / DURATION);
    const k = easeOut(t);
    for (const [key, end] of Object.entries(this.target)) {
      const start = this.from[key] ?? 0;
      this.current[key] = start + (end - start) * k;
    }
    this.draw(this.current);
    this.frame = t < 1 ? requestAnimationFrame(this.tick) : 0;
  };
}

function flatten(result: Estimate): Values {
  const values: Values = {
    net: result.netPrice,
    coa: result.coa,
    grantTotal: result.grantTotal,
    contribution: result.contribution,
    'pay.grants': result.grantTotal,
    'pay.loans': result.loans,
    'pay.work': result.workStudy,
    'pay.family': result.familyPays,
  };
  for (const item of COST_ITEMS) values[`cost.${item.key}`] = result.costs[item.key];
  for (const item of GRANT_ITEMS) values[`grant.${item.key}`] = result.grants[item.key];
  return values;
}

const labelFor = <T extends string>(options: { value: T; short: string }[], value: T) =>
  options.find((option) => option.value === value)?.short ?? value;

function summarize(scenario: Scenario): string {
  const people = `${scenario.size} ${scenario.size === 1 ? 'person' : 'people'}`;
  return [
    labelFor(RESIDENCY_OPTIONS, scenario.residency),
    labelFor(HOUSING_OPTIONS, scenario.housing),
    labelFor(DEPENDENCY_OPTIONS, scenario.dependency),
    people,
    `${formatMoney(scenario.income)} income`,
  ].join(' · ');
}

class ResultView {
  readonly el: HTMLElement;
  private readonly tween: Tween;
  private readonly fields: [HTMLElement, string][];
  private readonly segments: Map<string, SVGCircleElement>;
  private readonly bars: Map<string, HTMLElement>;
  private readonly centerLabel: HTMLElement;
  private readonly centerValue: HTMLElement;
  private active: string | null = null;

  constructor(el: HTMLElement) {
    this.el = el;
    this.fields = [...el.querySelectorAll<HTMLElement>('[data-v]')].map((node) => [node, node.dataset.v ?? '']);
    this.segments = new Map(
      [...el.querySelectorAll<SVGCircleElement>('[data-seg]')].map((node) => [node.dataset.seg ?? '', node]),
    );
    this.bars = new Map(
      [...el.querySelectorAll<HTMLElement>('[data-bar-seg]')].map((node) => [node.dataset.barSeg ?? '', node]),
    );
    this.centerLabel = el.querySelector<HTMLElement>('[data-center-label]')!;
    this.centerValue = el.querySelector<HTMLElement>('[data-center-value]')!;
    this.tween = new Tween((values) => this.draw(values));

    const highlight = (key: string | null) => {
      this.active = key;
      this.draw(this.tween.current);
    };
    el.querySelectorAll<HTMLElement>('.npc-cost [data-legend]').forEach((item) => {
      const key = item.dataset.legend ?? null;
      item.addEventListener('mouseenter', () => highlight(key));
      item.addEventListener('focus', () => highlight(key));
      item.addEventListener('mouseleave', () => highlight(null));
      item.addEventListener('blur', () => highlight(null));
    });
    this.segments.forEach((segment, key) => {
      segment.addEventListener('mouseenter', () => highlight(key));
      segment.addEventListener('mouseleave', () => highlight(null));
    });
  }

  update(scenario: Scenario, result: Estimate, instant = false) {
    this.el.querySelector<HTMLElement>('[data-summary]')!.textContent = summarize(scenario);

    let anyGrant = false;
    for (const item of GRANT_ITEMS) {
      const row = this.el.querySelector<HTMLElement>(`[data-grant="${item.key}"]`)!;
      row.hidden = result.grants[item.key] <= 0;
      anyGrant ||= !row.hidden;
    }
    this.el.querySelector<HTMLElement>('[data-grant-empty]')!.hidden = anyGrant;

    const costParts = COST_ITEMS.map((item) => `${item.label} ${formatMoney(result.costs[item.key])}`);
    this.el
      .querySelector('[data-donut]')!
      .setAttribute('aria-label', `Cost of attendance ${formatMoney(result.coa)}: ${costParts.join(', ')}.`);
    const payValues = flatten(result);
    const payParts = FUNDING_ITEMS.map((item) => `${item.label} ${formatMoney(payValues[`pay.${item.key}`])}`);
    this.el.querySelector('[data-bar]')!.setAttribute('aria-label', `How the year could be paid: ${payParts.join(', ')}.`);

    this.tween.to(flatten(result), instant);
  }

  finish() {
    this.tween.finish();
  }

  private draw(values: Values) {
    for (const [node, key] of this.fields) node.textContent = formatMoney(values[key] ?? 0);

    const total = COST_ITEMS.reduce((sum, item) => sum + Math.max(0, values[`cost.${item.key}`] ?? 0), 0) || 1;
    let offset = 0;
    for (const item of COST_ITEMS) {
      const segment = this.segments.get(item.key);
      if (!segment) continue;
      const length = (Math.max(0, values[`cost.${item.key}`] ?? 0) / total) * RING;
      const visible = Math.max(0, length - (length > SEGMENT_GAP * 2 ? SEGMENT_GAP : 0));
      segment.setAttribute('stroke-dasharray', `${visible.toFixed(2)} ${RING.toFixed(2)}`);
      segment.setAttribute('stroke-dashoffset', (-offset).toFixed(2));
      segment.classList.toggle('is-dim', this.active !== null && this.active !== item.key);
      segment.classList.toggle('is-active', this.active === item.key);
      offset += length;
    }
    this.el.querySelectorAll<HTMLElement>('.npc-cost [data-legend]').forEach((row) => {
      row.classList.toggle('is-active', row.dataset.legend === this.active);
    });

    const activeItem = COST_ITEMS.find((item) => item.key === this.active);
    if (activeItem) {
      const value = values[`cost.${activeItem.key}`] ?? 0;
      this.centerLabel.textContent = `${activeItem.label} · ${Math.round((value / total) * 100)}%`;
      this.centerValue.textContent = formatMoney(value);
    } else {
      this.centerLabel.textContent = 'Total per year';
      this.centerValue.textContent = formatMoney(values.coa ?? 0);
    }

    const coa = Math.max(1, values.coa ?? 1);
    for (const item of FUNDING_ITEMS) {
      const bar = this.bars.get(item.key);
      if (!bar) continue;
      const pct = Math.max(0, ((values[`pay.${item.key}`] ?? 0) / coa) * 100);
      bar.style.width = `${pct}%`;
      bar.querySelector('[data-bar-pct]')!.textContent = pct >= 9 ? `${Math.round(pct)}%` : '';
    }
  }
}

const root = document.querySelector<HTMLElement>('[data-npc]');
if (root) init(root);

function init(root: HTMLElement) {
  const form = root.querySelector<HTMLFormElement>('[data-npc-form]')!;
  const layout = root.querySelector<HTMLElement>('[data-layout]')!;
  const formCard = root.querySelector<HTMLElement>('[data-form-card]')!;
  const switcher = root.querySelector<HTMLElement>('[data-scenario-switch]')!;
  const compareButton = root.querySelector<HTMLButtonElement>('[data-compare-toggle]')!;
  const compareLabel = root.querySelector<HTMLElement>('[data-compare-label]')!;
  const editingTag = root.querySelector<HTMLElement>('[data-editing-tag]')!;
  const statusEl = root.querySelector<HTMLElement>('[data-status]')!;
  const announceEl = root.querySelector<HTMLElement>('[data-announce]')!;
  const prev = root.querySelector<HTMLButtonElement>('[data-prev]')!;
  const next = root.querySelector<HTMLButtonElement>('[data-next]')!;
  const review = root.querySelector<HTMLElement>('[data-review]')!;
  const progress = root.querySelector<HTMLElement>('[data-progress]')!;
  const sizeInput = form.querySelector<HTMLInputElement>('#npc-size')!;
  const incomeRange = form.querySelector<HTMLInputElement>('#npc-income-range')!;
  const incomeText = form.querySelector<HTMLInputElement>('#npc-income')!;
  const assetsRange = form.querySelector<HTMLInputElement>('#npc-assets-range')!;
  const assetsText = form.querySelector<HTMLInputElement>('#npc-assets')!;
  const incomeOut = form.querySelector<HTMLOutputElement>('[data-income-out]')!;
  const assetsOut = form.querySelector<HTMLOutputElement>('[data-assets-out]')!;

  const views: Record<Id, ResultView> = {
    a: new ResultView(root.querySelector<HTMLElement>('[data-result="a"]')!),
    b: new ResultView(root.querySelector<HTMLElement>('[data-result="b"]')!),
  };

  const deltaEl = root.querySelector<HTMLElement>('[data-delta]')!;
  const deltaValue = deltaEl.querySelector<HTMLElement>('[data-delta-value]')!;
  const deltaFour = deltaEl.querySelector<HTMLElement>('[data-delta-four]')!;
  const deltaTween = new Tween((values) => {
    deltaValue.textContent = formatMoney(values.delta ?? 0);
    deltaFour.textContent = formatMoney((values.delta ?? 0) * 4);
  });

  const params = new URLSearchParams(window.location.search);
  const shared = decodeScenario(params.get('a'));
  const sharedB = decodeScenario(params.get('b'));
  const state = {
    scenarios: { a: shared ?? { ...DEFAULT_SCENARIO }, b: sharedB ?? null } as Record<Id, Scenario | null>,
    compare: Boolean(sharedB),
    editing: 'a' as Id,
    step: shared ? LAST_STEP : 1,
    visited: new Set<number>(shared ? [1, 2, 3, 4, 5] : [1]),
    touched: false,
  };

  const editingScenario = () => state.scenarios[state.editing] ?? state.scenarios.a!;

  function setStatus(message: string) {
    statusEl.textContent = message;
    window.clearTimeout(Number(statusEl.dataset.timer));
    statusEl.dataset.timer = String(window.setTimeout(() => (statusEl.textContent = ''), 5000));
  }

  function setRangeFill(range: HTMLInputElement) {
    const max = Number(range.max) || 1;
    const pct = Math.min(100, (Number(range.value) / max) * 100);
    range.style.setProperty('--fill', `${pct}%`);
  }

  function moneyValueText(value: number, max: number) {
    return value >= max ? `${formatMoney(max)} or more` : formatMoney(value);
  }

  function syncMoney(kind: 'income' | 'assets', value: number, fromTyping = false) {
    const range = kind === 'income' ? incomeRange : assetsRange;
    const text = kind === 'income' ? incomeText : assetsText;
    const out = kind === 'income' ? incomeOut : assetsOut;
    const max = Number(range.max);
    range.value = String(Math.min(value, max));
    range.setAttribute('aria-valuetext', moneyValueText(value, max));
    setRangeFill(range);
    out.textContent = formatMoney(value);
    if (!fromTyping) text.value = value.toLocaleString('en-US');
  }

  function populateForm() {
    const s = editingScenario();
    form.querySelectorAll<HTMLInputElement>('input[type="radio"]').forEach((input) => {
      input.checked = s[input.name as 'residency' | 'housing' | 'dependency'] === input.value;
    });
    const independent = s.dependency === 'independent';
    sizeInput.min = String(independent ? LIMITS.size.min : LIMITS.size.dependentMin);
    sizeInput.value = String(s.size);
    form.querySelector('[data-size-label]')!.textContent = independent
      ? 'People in your household'
      : 'People in your parents’ household';
    form.querySelector('[data-size-hint]')!.textContent = independent
      ? 'Count yourself, a spouse or partner, and anyone you support.'
      : 'Count yourself, your parents, and anyone they support.';
    form.querySelector('[data-income-label]')!.textContent = independent
      ? 'Your household income'
      : 'Parents’ household income';
    form.querySelector('[data-assets-label]')!.textContent = independent
      ? 'Your savings and investments'
      : 'Parents’ savings and investments';
    syncMoney('income', s.income);
    syncMoney('assets', s.assets);
  }

  function change(patch: Partial<Scenario>, options: { repopulate?: boolean } = {}) {
    const id = state.editing;
    state.scenarios[id] = normalizeScenario({ ...editingScenario(), ...patch });
    state.touched = true;
    if (options.repopulate) populateForm();
    refresh();
  }

  function renderReview() {
    const s = editingScenario();
    const rows: [string, string, number][] = [
      ['Residency', labelFor(RESIDENCY_OPTIONS, s.residency), 1],
      ['Housing', labelFor(HOUSING_OPTIONS, s.housing), 2],
      ['Dependency status', labelFor(DEPENDENCY_OPTIONS, s.dependency), 3],
      ['Household size', `${s.size} ${s.size === 1 ? 'person' : 'people'}`, 3],
      ['Household income', formatMoney(s.income), 4],
      ['Savings and investments', formatMoney(s.assets), 4],
    ];
    review.replaceChildren(
      ...rows.map(([term, value, step]) => {
        const row = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        const edit = document.createElement('button');
        dt.textContent = term;
        dd.textContent = value;
        edit.type = 'button';
        edit.className = 'linkish';
        edit.dataset.goto = String(step);
        edit.innerHTML = `Change<span class="sr-only"> ${term.toLowerCase()}</span>`;
        dd.append(' ', edit);
        row.append(dt, dd);
        return row;
      }),
    );
  }

  function showStep(step: number, focus = false) {
    state.step = Math.min(LAST_STEP, Math.max(1, step));
    state.visited.add(state.step);
    form.querySelectorAll<HTMLElement>('[data-step]').forEach((panel) => {
      panel.hidden = Number(panel.dataset.step) !== state.step;
    });
    root.querySelectorAll<HTMLButtonElement>('.npc-step-btn').forEach((button) => {
      const n = Number(button.dataset.goto);
      const current = n === state.step;
      const done = !current && state.visited.has(n);
      if (current) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
      button.classList.toggle('is-done', done);
      button.querySelector('[data-step-state]')!.textContent = current ? ', current step' : done ? ', answered' : '';
    });
    progress.style.width = `${((state.step - 1) / (LAST_STEP - 1)) * 100}%`;
    prev.hidden = state.step === 1;
    next.hidden = state.step === LAST_STEP;
    next.textContent = state.step < LAST_STEP ? `Next: ${STEP_NAMES[state.step]}` : '';
    if (state.step === LAST_STEP) renderReview();
    if (focus) {
      form.querySelector<HTMLElement>(`[data-step="${state.step}"] .npc-step-title`)?.focus({ preventScroll: true });
      const top = formCard.getBoundingClientRect().top;
      if (top < 80) formCard.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    }
  }

  function setEditing(id: Id) {
    if (id === 'b' && !state.compare) return;
    state.editing = id;
    switcher.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.edit === id));
    });
    editingTag.textContent = `Scenario ${id.toUpperCase()}`;
    formCard.dataset.editing = id;
    root.querySelectorAll<HTMLElement>('[data-result]').forEach((card) => {
      card.classList.toggle('is-editing', state.compare && card.dataset.result === id);
    });
    populateForm();
    if (state.step === LAST_STEP) renderReview();
  }

  function setCompare(on: boolean, instant = false) {
    state.compare = on;
    if (on && !state.scenarios.b) state.scenarios.b = { ...state.scenarios.a! };
    layout.classList.toggle('is-compare', on);
    root.classList.toggle('is-compare', on);
    switcher.hidden = !on;
    editingTag.hidden = !on;
    deltaEl.hidden = !on;
    views.b.el.hidden = !on;
    compareButton.setAttribute('aria-pressed', String(on));
    compareLabel.textContent = on ? 'Stop comparing' : 'Compare two scenarios';
    setEditing(on ? 'b' : 'a');
    refresh(instant);
  }

  let urlTimer = 0;
  let announceTimer = 0;

  function shareUrl() {
    const query = new URLSearchParams();
    query.set('a', encodeScenario(state.scenarios.a!));
    if (state.compare && state.scenarios.b) query.set('b', encodeScenario(state.scenarios.b));
    return `${window.location.origin}${window.location.pathname}?${query}`;
  }

  function refresh(instant = false) {
    const a = state.scenarios.a!;
    const resultA = estimate(a);
    views.a.update(a, resultA, instant);

    let announcement = `Estimated net price ${formatMoney(resultA.netPrice)} per year.`;
    if (state.compare && state.scenarios.b) {
      const b = state.scenarios.b;
      const resultB = estimate(b);
      views.b.update(b, resultB, instant);
      const delta = resultB.netPrice - resultA.netPrice;
      const same = Math.abs(delta) < 10;
      deltaEl.dataset.trend = same ? 'same' : delta < 0 ? 'down' : 'up';
      deltaEl.querySelector('[data-delta-text]')!.textContent = same ? 'Both scenarios have about the same net price.' : 'Scenario B costs';
      deltaEl.querySelector('[data-delta-tail]')!.textContent = same ? '' : `${delta < 0 ? 'less' : 'more'} per year than Scenario A.`;
      deltaEl.querySelector<HTMLElement>('.npc-delta-four')!.hidden = same;
      deltaValue.hidden = same;
      deltaTween.to({ delta: Math.abs(delta) }, instant);
      announcement = `Scenario A ${formatMoney(resultA.netPrice)}, Scenario B ${formatMoney(resultB.netPrice)} per year.`;
    }

    if (state.step === LAST_STEP) renderReview();
    root.querySelector<HTMLElement>('[data-print-url]')!.textContent = shareUrl();

    if (state.touched) {
      window.clearTimeout(urlTimer);
      urlTimer = window.setTimeout(() => window.history.replaceState(null, '', shareUrl()), 200);
      window.clearTimeout(announceTimer);
      announceTimer = window.setTimeout(() => (announceEl.textContent = announcement), 900);
    }
  }

  const parseMoney = (value: string) => Number(value.split('.')[0].replace(/[^\d]/g, '').slice(0, 8)) || 0;

  form.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement;
    if (target.type !== 'radio') return;
    if (target.name === 'residency') change({ residency: target.value as Residency });
    if (target.name === 'housing') change({ housing: target.value as Housing });
    if (target.name === 'dependency') change({ dependency: target.value as Dependency }, { repopulate: true });
  });
  form.addEventListener('submit', (event) => event.preventDefault());

  incomeRange.addEventListener('input', () => {
    const value = Number(incomeRange.value);
    syncMoney('income', value);
    change({ income: value });
  });
  assetsRange.addEventListener('input', () => {
    const value = Number(assetsRange.value);
    syncMoney('assets', value);
    change({ assets: value });
  });
  incomeText.addEventListener('input', () => {
    const value = Math.min(parseMoney(incomeText.value), LIMITS.income.typedMax);
    syncMoney('income', value, true);
    change({ income: value });
  });
  assetsText.addEventListener('input', () => {
    const value = Math.min(parseMoney(assetsText.value), LIMITS.assets.typedMax);
    syncMoney('assets', value, true);
    change({ assets: value });
  });
  incomeText.addEventListener('blur', () => syncMoney('income', editingScenario().income));
  assetsText.addEventListener('blur', () => syncMoney('assets', editingScenario().assets));

  sizeInput.addEventListener('input', () => {
    if (sizeInput.value === '') return;
    change({ size: Number(sizeInput.value) });
  });
  sizeInput.addEventListener('blur', () => (sizeInput.value = String(editingScenario().size)));
  form.querySelectorAll<HTMLButtonElement>('[data-size-step]').forEach((button) => {
    button.addEventListener('click', () => {
      change({ size: editingScenario().size + Number(button.dataset.sizeStep) }, { repopulate: true });
    });
  });

  prev.addEventListener('click', () => showStep(state.step - 1, true));
  next.addEventListener('click', () => showStep(state.step + 1, true));
  root.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-goto], [data-edit]');
    if (!target) return;
    if (target.dataset.goto) showStep(Number(target.dataset.goto), true);
    if (target.dataset.edit) {
      setEditing(target.dataset.edit as Id);
      if (target.closest('[data-result]')) {
        formCard.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
      }
    }
  });

  compareButton.addEventListener('click', () => {
    const on = !state.compare;
    state.touched = true;
    setCompare(on);
    setStatus(on ? 'Scenario B starts as a copy of A. Change any answer to compare.' : 'Showing one scenario.');
  });

  root.querySelectorAll<HTMLButtonElement>('[data-copy-link]').forEach((button) => {
    button.addEventListener('click', async () => {
      const url = shareUrl();
      window.history.replaceState(null, '', url);
      try {
        await navigator.clipboard.writeText(url);
        setStatus('Link copied. Anyone who opens it sees this estimate.');
      } catch {
        setStatus(`Copy this link: ${url}`);
      }
    });
  });

  const breakdowns = () => [...root.querySelectorAll<HTMLDetailsElement>('.npc-breakdown')];
  let openBeforePrint: boolean[] = [];
  window.addEventListener('beforeprint', () => {
    views.a.finish();
    views.b.finish();
    deltaTween.finish();
    openBeforePrint = breakdowns().map((details) => details.open);
    breakdowns().forEach((details) => (details.open = true));
  });
  window.addEventListener('afterprint', () => {
    breakdowns().forEach((details, index) => (details.open = openBeforePrint[index] ?? false));
  });
  root.querySelectorAll<HTMLButtonElement>('[data-print]').forEach((button) => {
    button.addEventListener('click', () => window.print());
  });

  root.querySelector<HTMLButtonElement>('[data-reset]')!.addEventListener('click', () => {
    state.scenarios = { a: { ...DEFAULT_SCENARIO }, b: null };
    state.visited = new Set([1]);
    state.touched = false;
    window.history.replaceState(null, '', window.location.pathname);
    setCompare(false);
    showStep(1, true);
    setStatus('Started over with the sample answers.');
  });

  formCard.dataset.editing = 'a';
  populateForm();
  showStep(state.step);
  setCompare(state.compare);
}
