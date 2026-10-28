import { balance, defaultCardOrder, library, type CardId } from '../data/mymars';

const STORE_KEY = 'um-mymars';

interface DashboardState {
  order: CardId[];
  holdCleared: boolean;
  todos: Record<string, boolean>;
  renewed: Record<string, boolean>;
  read: Record<string, boolean>;
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const motionOk = () => !reduceMotion.matches;

function loadState(): DashboardState {
  const fallback: DashboardState = { order: [...defaultCardOrder], holdCleared: false, todos: {}, renewed: {}, read: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') as Partial<DashboardState>;
    const order = Array.isArray(saved.order) ? saved.order.filter((id) => defaultCardOrder.includes(id)) : [];
    return {
      order: order.length === defaultCardOrder.length ? order : fallback.order,
      holdCleared: saved.holdCleared === true,
      todos: saved.todos ?? {},
      renewed: saved.renewed ?? {},
      read: saved.read ?? {},
    };
  } catch {
    return fallback;
  }
}

const state = loadState();

function save(): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    /* Private mode or a full store: the dashboard still works for this visit. */
  }
}

const live = document.querySelector<HTMLElement>('[data-live]');
function announce(message: string): void {
  if (!live) return;
  live.textContent = '';
  window.setTimeout(() => {
    live.textContent = message;
  }, 30);
}

const money = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

function tweenMoney(el: Element, from: number, to: number, duration = 900): void {
  if (!motionOk()) {
    el.textContent = money(to);
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = money(from + (to - from) * eased);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  el.classList.remove('is-ticking');
  void (el as HTMLElement).offsetWidth;
  el.classList.add('is-ticking');
}

/* ---------- Card order: pointer drag, keyboard moves, FLIP ---------- */

const grid = document.querySelector<HTMLElement>('#mm-grid');
const cards = () => Array.from(grid?.querySelectorAll<HTMLElement>(':scope > .mm-card') ?? []);
const cardId = (card: HTMLElement) => card.dataset.card as CardId;
const cardTitle = (card: HTMLElement) => card.querySelector('h2')?.textContent?.trim() ?? 'Card';

function flip(mutate: () => void, skip?: HTMLElement): void {
  const before = new Map(cards().map((card) => [card, card.getBoundingClientRect()]));
  mutate();
  if (!motionOk()) return;
  for (const card of cards()) {
    if (card === skip) continue;
    const first = before.get(card);
    if (!first) continue;
    const last = card.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    if (!dx && !dy) continue;
    card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
      duration: 260,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    });
  }
}

function persistOrder(): void {
  state.order = cards().map(cardId);
  save();
}

function applyOrder(order: CardId[], animate = true): void {
  if (!grid) return;
  const run = () => {
    for (const id of order) {
      const card = grid.querySelector<HTMLElement>(`:scope > [data-card="${id}"]`);
      if (card) grid.appendChild(card);
    }
  };
  if (animate) flip(run);
  else run();
}

function positionText(card: HTMLElement): string {
  const all = cards();
  return `position ${all.indexOf(card) + 1} of ${all.length}`;
}

function layoutRect(card: HTMLElement) {
  return { left: card.offsetLeft, top: card.offsetTop, width: card.offsetWidth, height: card.offsetHeight };
}

function setupDrag(): void {
  if (!grid) return;
  const slot = document.createElement('div');
  slot.className = 'mm-drop-slot';
  slot.setAttribute('aria-hidden', 'true');

  let drag: {
    card: HTMLElement;
    handle: HTMLElement;
    pointerId: number;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    moved: boolean;
    startOrder: CardId[];
  } | null = null;
  let scrollFrame = 0;

  const placeSlot = (card: HTMLElement) => {
    const r = layoutRect(card);
    slot.style.transform = `translate(${r.left}px, ${r.top}px)`;
    slot.style.width = `${r.width}px`;
    slot.style.height = `${r.height}px`;
  };

  const follow = () => {
    if (!drag) return;
    const gridBox = grid.getBoundingClientRect();
    const r = layoutRect(drag.card);
    const dx = drag.x - drag.offsetX - (gridBox.left + r.left);
    const dy = drag.y - drag.offsetY - (gridBox.top + r.top);
    drag.card.style.transform = `translate(${dx}px, ${dy}px) rotate(0.6deg) scale(1.02)`;
  };

  const hitTest = () => {
    if (!drag) return;
    const gridBox = grid.getBoundingClientRect();
    const px = drag.x - gridBox.left;
    const py = drag.y - gridBox.top;
    const all = cards();
    const target = all.find((card) => {
      if (card === drag!.card) return false;
      const r = layoutRect(card);
      return px >= r.left && px <= r.left + r.width && py >= r.top && py <= r.top + r.height;
    });
    if (!target) return;
    const from = all.indexOf(drag.card);
    const to = all.indexOf(target);
    const dragged = drag.card;
    flip(() => {
      if (from < to) target.after(dragged);
      else target.before(dragged);
    }, dragged);
    placeSlot(dragged);
    follow();
  };

  const autoScroll = () => {
    if (!drag) return;
    const edge = 80;
    let delta = 0;
    if (drag.y < edge) delta = -Math.ceil((edge - drag.y) / 6);
    else if (drag.y > window.innerHeight - edge) delta = Math.ceil((drag.y - (window.innerHeight - edge)) / 6);
    if (delta) {
      window.scrollBy(0, delta);
      follow();
      hitTest();
    }
    scrollFrame = requestAnimationFrame(autoScroll);
  };

  const end = (commit: boolean) => {
    if (!drag) return;
    const { card, moved, startOrder } = drag;
    cancelAnimationFrame(scrollFrame);
    drag = null;
    document.body.classList.remove('mm-dragging');
    if (!commit) applyOrder(startOrder, true);
    const current = card.style.transform;
    card.style.transform = '';
    card.classList.remove('is-lifted');
    slot.remove();
    if (moved && current && motionOk()) {
      card.animate([{ transform: current }, { transform: 'none' }], {
        duration: 240,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      });
    }
    if (moved) {
      persistOrder();
      announce(`${cardTitle(card)} moved to ${positionText(card)}.`);
    }
  };

  grid.addEventListener('pointerdown', (event) => {
    const handle = (event.target as Element).closest<HTMLElement>('[data-handle]');
    if (!handle || event.button !== 0 || drag) return;
    const card = handle.closest<HTMLElement>('.mm-card');
    if (!card) return;
    event.preventDefault();
    const box = card.getBoundingClientRect();
    drag = {
      card,
      handle,
      pointerId: event.pointerId,
      offsetX: event.clientX - box.left,
      offsetY: event.clientY - box.top,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      startOrder: cards().map(cardId),
    };
  });

  window.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (!drag.moved) {
      if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 6) return;
      drag.moved = true;
      drag.card.classList.add('is-lifted');
      document.body.classList.add('mm-dragging');
      placeSlot(drag.card);
      grid.appendChild(slot);
      scrollFrame = requestAnimationFrame(autoScroll);
    }
    follow();
    hitTest();
  });

  window.addEventListener('pointerup', (event) => {
    if (drag && event.pointerId === drag.pointerId) end(true);
  });
  window.addEventListener('pointercancel', () => end(false));
  window.addEventListener('keydown', (event) => {
    if (drag?.moved && event.key === 'Escape') end(false);
  });

  /* Keyboard: Space or Enter lifts, arrows move, Space or Enter drops, Escape cancels. */
  let grabbed: { card: HTMLElement; handle: HTMLElement; startOrder: CardId[] } | null = null;

  const release = (commit: boolean) => {
    if (!grabbed) return;
    const { card, handle, startOrder } = grabbed;
    grabbed = null;
    card.classList.remove('is-grabbed');
    handle.setAttribute('aria-pressed', 'false');
    if (commit) {
      persistOrder();
      announce(`${cardTitle(card)} dropped at ${positionText(card)}.`);
    } else {
      applyOrder(startOrder, true);
      handle.focus({ preventScroll: true });
      announce(`Move canceled. ${cardTitle(card)} is back at ${positionText(card)}.`);
    }
  };

  grid.addEventListener('keydown', (event) => {
    const handle = (event.target as Element).closest<HTMLElement>('[data-handle]');
    if (!handle) return;
    const card = handle.closest<HTMLElement>('.mm-card');
    if (!card) return;
    const key = event.key;

    if (key === ' ' || key === 'Enter') {
      event.preventDefault();
      if (grabbed) {
        release(true);
      } else {
        grabbed = { card, handle, startOrder: cards().map(cardId) };
        card.classList.add('is-grabbed');
        handle.setAttribute('aria-pressed', 'true');
        announce(
          `${cardTitle(card)} picked up, ${positionText(card)}. Use the arrow keys to move it, Space to drop, Escape to cancel.`,
        );
      }
      return;
    }
    if (!grabbed) return;
    if (key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      release(false);
      return;
    }
    const back = key === 'ArrowLeft' || key === 'ArrowUp';
    const forward = key === 'ArrowRight' || key === 'ArrowDown';
    if (!back && !forward) return;
    event.preventDefault();
    const all = cards();
    const index = all.indexOf(card);
    const next = back ? all[index - 1] : all[index + 1];
    if (!next) {
      announce(`${cardTitle(card)} is already at ${positionText(card)}.`);
      return;
    }
    flip(() => {
      if (back) next.before(card);
      else next.after(card);
    });
    handle.focus({ preventScroll: true });
    card.scrollIntoView({ block: 'nearest', behavior: motionOk() ? 'smooth' : 'auto' });
    announce(`${positionText(card)}.`);
  });

  grid.addEventListener('focusout', (event) => {
    if (!grabbed || event.target !== grabbed.handle) return;
    // Moving the card in the DOM blurs its handle for a moment; only a real focus change drops it.
    window.setTimeout(() => {
      if (grabbed && document.activeElement !== grabbed.handle) release(true);
    }, 0);
  });

  document.querySelector('[data-reset-layout]')?.addEventListener('click', () => {
    applyOrder(defaultCardOrder, true);
    persistOrder();
    announce('Layout reset to the default order.');
  });
}

/* ---------- Schedule tabs ---------- */

function setupTabs(): void {
  const list = document.querySelector<HTMLElement>('[data-tabs]');
  if (!list) return;
  const tabs = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const select = (tab: HTMLButtonElement, focus = true) => {
    for (const other of tabs) {
      const selected = other === tab;
      other.setAttribute('aria-selected', String(selected));
      other.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(other.getAttribute('aria-controls') || '');
      if (panel) {
        panel.hidden = !selected;
        if (selected) {
          panel.classList.remove('is-entering');
          void panel.offsetWidth;
          panel.classList.add('is-entering');
        }
      }
    }
    if (focus) tab.focus();
  };
  list.addEventListener('click', (event) => {
    const tab = (event.target as Element).closest<HTMLButtonElement>('[role="tab"]');
    if (tab) select(tab);
  });
  list.addEventListener('keydown', (event) => {
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    let next = -1;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    select(tabs[next]!);
  });
}

/* ---------- Action items, hold, and balance ---------- */

const hold = document.querySelector<HTMLElement>('[data-hold]');
const balanceCard = document.querySelector<HTMLElement>('[data-balance-card]');
const chargesTotal = balance.charges.reduce((sum, line) => sum + line.amount, 0);
const creditsTotal = balance.credits.reduce((sum, line) => sum + line.amount, 0);
const heldBalance = chargesTotal - creditsTotal;
const releasedBalance = heldBalance - balance.heldAid.amount;
const installments = balance.plan.installments.length;

function updateCounts(): void {
  const todosOpen = document.querySelectorAll('[data-todo]:not(:checked)').length;
  const open = todosOpen + (state.holdCleared ? 0 : 1);
  const count = document.querySelector('[data-action-count]');
  if (count) count.textContent = open ? `${open} open` : 'All done';
  const holdCount = document.querySelector('[data-hold-count]');
  const holdGlance = document.querySelector('[data-hold-glance]');
  const glance = document.querySelector<HTMLElement>('[data-glance="holds"]');
  if (holdCount) holdCount.textContent = state.holdCleared ? 'No holds' : '1 hold';
  if (holdGlance) holdGlance.textContent = state.holdCleared ? 'Aid can pay' : 'on your account';
  glance?.classList.toggle('is-clear', state.holdCleared);
}

function renderBalance(animateFrom?: number): void {
  if (!balanceCard) return;
  const due = state.holdCleared ? releasedBalance : heldBalance;
  balanceCard.dataset.state = state.holdCleared ? 'released' : 'held';
  const amount = balanceCard.querySelector('[data-balance-amount]');
  if (amount) {
    if (animateFrom !== undefined) tweenMoney(amount, animateFrom, due);
    else amount.textContent = money(due);
  }
  const each = due / installments;
  const fromEach = animateFrom !== undefined ? animateFrom / installments : undefined;
  const targets = [
    ...balanceCard.querySelectorAll('[data-installment]'),
    ...document.querySelectorAll('[data-glance-installment]'),
  ];
  for (const el of targets) {
    if (fromEach !== undefined) tweenMoney(el, fromEach, each);
    else el.textContent = money(each);
  }
  const heldText = balanceCard.querySelector('[data-held-text]');
  if (heldText) {
    heldText.innerHTML = state.holdCleared
      ? `${balance.heldAid.label}, ${balance.heldAid.releasedNote} <b>${money(balance.heldAid.amount)}</b>`
      : `${balance.heldAid.label}, on hold <b>${money(balance.heldAid.amount)}</b>`;
  }
  const heldRow = balanceCard.querySelector<HTMLElement>('[data-held-row]');
  if (heldRow) heldRow.hidden = !state.holdCleared;
}

function setupTodos(): void {
  for (const box of document.querySelectorAll<HTMLInputElement>('[data-todo]')) {
    const id = box.dataset.todo!;
    box.checked = state.todos[id] === true;
    box.addEventListener('change', () => {
      state.todos[id] = box.checked;
      save();
      updateCounts();
    });
  }
}

/* ---------- Resolve dialog ---------- */

function openModal(dialog: HTMLDialogElement): void {
  dialog.showModal();
  requestAnimationFrame(() => dialog.classList.add('is-open'));
}

function closeModal(dialog: HTMLDialogElement, after?: () => void): void {
  dialog.classList.remove('is-open');
  const done = () => {
    if (dialog.open) dialog.close();
    after?.();
  };
  if (motionOk()) window.setTimeout(done, 220);
  else done();
}

function setupResolve(): void {
  const dialog = document.querySelector<HTMLDialogElement>('[data-resolve-dialog]');
  const trigger = document.querySelector<HTMLButtonElement>('[data-resolve]');
  if (!dialog || !trigger || !hold) return;
  const steps = Array.from(dialog.querySelectorAll<HTMLElement>('[data-step]'));
  const markers = Array.from(dialog.querySelectorAll<HTMLElement>('[data-step-marker]'));
  const attached = new Set<string>();
  const docsError = dialog.querySelector<HTMLElement>('[data-docs-error]');
  const form = dialog.querySelector<HTMLFormElement>('[data-sign-form]');
  const signature = dialog.querySelector<HTMLInputElement>('#mm-signature');
  const signatureError = dialog.querySelector<HTMLElement>('#mm-signature-error');
  const certify = dialog.querySelector<HTMLInputElement>('#mm-certify');
  const certifyError = dialog.querySelector<HTMLElement>('#mm-certify-error');
  const send = dialog.querySelector<HTMLButtonElement>('[data-send]');
  const sendLabel = dialog.querySelector<HTMLElement>('[data-send-label]');
  let finished = false;

  const goTo = (n: number) => {
    for (const step of steps) {
      const active = Number(step.dataset.step) === n;
      step.hidden = !active;
      if (active) {
        step.classList.remove('is-entering');
        void step.offsetWidth;
        step.classList.add('is-entering');
      }
    }
    for (const marker of markers) {
      const m = Number(marker.dataset.stepMarker);
      marker.classList.toggle('is-done', m < n);
      if (m === Math.min(n, 3) && n < 4) marker.setAttribute('aria-current', 'step');
      else marker.removeAttribute('aria-current');
    }
    dialog.querySelector<HTMLElement>(`[data-step="${n}"] h3`)?.focus();
  };

  const reset = () => {
    finished = false;
    attached.clear();
    for (const row of dialog.querySelectorAll<HTMLElement>('[data-doc]')) {
      row.dataset.state = 'empty';
      const button = row.querySelector<HTMLButtonElement>('[data-attach]');
      if (button) {
        button.textContent = 'Attach';
        button.disabled = false;
      }
    }
    if (docsError) docsError.hidden = true;
    form?.reset();
    for (const el of [signatureError, certifyError]) if (el) el.hidden = true;
    signature?.setAttribute('aria-invalid', 'false');
    if (send) {
      send.disabled = false;
      send.classList.remove('is-busy');
    }
    if (sendLabel) sendLabel.textContent = 'Send packet';
  };

  trigger.addEventListener('click', () => {
    reset();
    goTo(1);
    openModal(dialog);
    dialog.querySelector<HTMLElement>('[data-step="1"] h3')?.focus();
  });

  const close = () =>
    closeModal(dialog, () => {
      if (finished) clearHold();
      else trigger.focus();
    });

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });
  for (const button of dialog.querySelectorAll('[data-close-dialog]')) button.addEventListener('click', close);
  dialog.querySelector('[data-finish]')?.addEventListener('click', close);

  for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-next]')) {
    button.addEventListener('click', () => {
      const n = Number(button.dataset.next);
      if (n === 3 && attached.size < 2) {
        if (docsError) docsError.hidden = false;
        dialog.querySelector<HTMLButtonElement>('[data-doc][data-state="empty"] [data-attach]')?.focus();
        return;
      }
      goTo(n);
    });
  }

  for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-attach]')) {
    button.addEventListener('click', () => {
      const id = button.dataset.attach!;
      const row = button.closest<HTMLElement>('[data-doc]');
      if (!row) return;
      if (row.dataset.state === 'done') {
        attached.delete(id);
        row.dataset.state = 'empty';
        button.textContent = 'Attach';
        button.setAttribute('aria-label', `Attach ${row.querySelector('.mm-doc-label')?.textContent ?? 'document'}`);
        return;
      }
      row.dataset.state = 'uploading';
      button.disabled = true;
      button.textContent = 'Uploading…';
      window.setTimeout(
        () => {
          row.dataset.state = 'done';
          attached.add(id);
          button.disabled = false;
          button.textContent = 'Remove';
          const label = row.querySelector('.mm-doc-label')?.textContent ?? 'document';
          button.setAttribute('aria-label', `Remove ${label}`);
          button.focus();
          announce(`${label} attached.`);
          if (attached.size === 2 && docsError) docsError.hidden = true;
        },
        motionOk() ? 900 : 50,
      );
    });
  }

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = signature?.value.trim().replace(/\s+/g, ' ').toLowerCase() ?? '';
    const badName = name !== 'ava reyes';
    const badCertify = !certify?.checked;
    if (signatureError) {
      signatureError.hidden = !badName;
      signatureError.textContent = name ? 'The signature must match the name on your account, Ava Reyes.' : 'Type your full name.';
    }
    signature?.setAttribute('aria-invalid', String(badName));
    if (certifyError) certifyError.hidden = !badCertify;
    certify?.setAttribute('aria-invalid', String(badCertify));
    if (badName) return signature?.focus();
    if (badCertify) return certify?.focus();
    if (send) {
      send.disabled = true;
      send.classList.add('is-busy');
    }
    if (sendLabel) sendLabel.textContent = 'Sending…';
    window.setTimeout(
      () => {
        finished = true;
        goTo(4);
        announce('Packet received. Financial aid hold released.');
      },
      motionOk() ? 1400 : 50,
    );
  });
}

function clearHold(): void {
  if (!hold || state.holdCleared) return;
  state.holdCleared = true;
  state.read['n-hold'] = true;
  save();
  hold.dataset.state = 'clearing';
  hold.scrollIntoView({ block: 'center', behavior: motionOk() ? 'smooth' : 'auto' });
  window.setTimeout(
    () => {
      hold.dataset.state = 'cleared';
      renderBalance(heldBalance);
      updateCounts();
      renderNotes();
      document.querySelector<HTMLElement>('#mm-h-actions')?.focus({ preventScroll: true });
      announce(
        `Financial aid hold cleared. Balance due is now ${money(releasedBalance)}, ${money(releasedBalance / installments)} a month.`,
      );
    },
    motionOk() ? 650 : 0,
  );
}

/* ---------- Library ---------- */

function setupLibrary(): void {
  for (const loan of library.loans) {
    const row = document.querySelector<HTMLElement>(`[data-loan="${loan.id}"]`);
    if (!row) continue;
    const button = row.querySelector<HTMLButtonElement>('[data-renew]');
    const due = row.querySelector<HTMLElement>('[data-loan-due]');
    const bar = row.querySelector<HTMLElement>('[data-loan-bar]');
    const render = (animate: boolean) => {
      if (!state.renewed[loan.id]) return;
      const left = loan.dueInDays + 14;
      const period = loan.periodDays + 14;
      if (due) due.textContent = `Due ${loan.renewedDue} · ${left} days left · renewed`;
      bar?.style.setProperty('--w', `${Math.round(((period - left) / period) * 100)}%`);
      row.classList.remove('is-soon');
      row.classList.add('is-renewed');
      if (animate && due) {
        due.classList.remove('is-flipping');
        void due.offsetWidth;
        due.classList.add('is-flipping');
      }
      if (button) {
        button.textContent = 'Renewed';
        button.disabled = true;
        button.setAttribute('aria-label', `${loan.title} renewed`);
      }
    };
    render(false);
    button?.addEventListener('click', () => {
      state.renewed[loan.id] = true;
      if (loan.id === 'regolith') state.read['n-library'] = true;
      save();
      render(true);
      renderNotes();
      announce(`${loan.title} renewed. Now due ${loan.renewedDue}.`);
    });
  }
}

/* ---------- Notifications drawer ---------- */

const drawer = document.querySelector<HTMLDialogElement>('[data-drawer]');

function renderNotes(): void {
  if (!drawer) return;
  const cleared = drawer.querySelector<HTMLElement>('[data-note="n-hold-cleared"]');
  if (cleared) cleared.hidden = !state.holdCleared;
  let unread = 0;
  for (const note of drawer.querySelectorAll<HTMLElement>('[data-note]')) {
    if (note.hidden) continue;
    const isUnread = !state.read[note.dataset.note!];
    note.classList.toggle('is-unread', isUnread);
    const label = note.querySelector<HTMLElement>('[data-unread-label]');
    if (label) label.hidden = !isUnread;
    if (isUnread) unread += 1;
  }
  const badge = document.querySelector<HTMLElement>('[data-unread-badge]');
  const count = document.querySelector<HTMLElement>('[data-unread-count]');
  if (count && count.textContent !== String(unread)) {
    count.textContent = String(unread);
    badge?.classList.remove('is-bumped');
    void badge?.offsetWidth;
    badge?.classList.add('is-bumped');
  }
  if (badge) badge.hidden = unread === 0;
}

function setupDrawer(): void {
  const opener = document.querySelector<HTMLButtonElement>('[data-open-drawer]');
  if (!drawer || !opener) return;
  const close = (after?: () => void) => closeModal(drawer, after ?? (() => opener.focus()));

  opener.addEventListener('click', () => {
    opener.setAttribute('aria-expanded', 'true');
    openModal(drawer);
  });
  drawer.addEventListener('close', () => opener.setAttribute('aria-expanded', 'false'));
  drawer.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  drawer.addEventListener('click', (event) => {
    if (event.target === drawer) close();
  });
  drawer.querySelector('[data-close-drawer]')?.addEventListener('click', () => close());
  drawer.querySelector('[data-mark-all]')?.addEventListener('click', () => {
    for (const note of drawer.querySelectorAll<HTMLElement>('[data-note]')) state.read[note.dataset.note!] = true;
    save();
    renderNotes();
    announce('All notifications marked as read.');
  });
  for (const button of drawer.querySelectorAll<HTMLButtonElement>('[data-goto]')) {
    button.addEventListener('click', () => {
      const note = button.closest<HTMLElement>('[data-note]');
      if (note) state.read[note.dataset.note!] = true;
      save();
      renderNotes();
      const target = document.querySelector<HTMLElement>(`[data-card="${button.dataset.goto}"]`);
      close(() => {
        if (!target) return opener.focus();
        target.scrollIntoView({ block: 'center', behavior: motionOk() ? 'smooth' : 'auto' });
        target.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
        target.classList.remove('is-flash');
        void target.offsetWidth;
        target.classList.add('is-flash');
      });
    });
  }
}

/* ---------- Degree rings ---------- */

function setupRings(): void {
  const rings = document.querySelector('.mm-rings');
  if (!rings) return;
  const draw = () => rings.classList.add('is-drawn');
  if (!('IntersectionObserver' in window) || !motionOk()) return draw();
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        window.setTimeout(draw, 120);
        observer.disconnect();
      }
    },
    { threshold: 0.2 },
  );
  observer.observe(rings);
}

/* ---------- Reset demo ---------- */

document.querySelector('[data-reset-demo]')?.addEventListener('click', () => {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    /* Nothing stored. */
  }
  window.location.reload();
});

applyOrder(state.order, false);
if (state.holdCleared) hold?.setAttribute('data-state', 'cleared');
setupDrag();
setupTabs();
setupTodos();
setupResolve();
setupLibrary();
setupDrawer();
setupRings();
renderBalance();
updateCounts();
renderNotes();
