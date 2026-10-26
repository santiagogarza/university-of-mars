import { STAFF_TOKEN_KEY } from '../data/title-ix';
import { servicesUrl } from './services-client';

export type StaffSession = { mode: 'remote'; token: string } | { mode: 'local' };

export function setupStaffGate(onReady: (session: StaffSession) => void) {
  const gate = document.querySelector<HTMLElement>('#staff-gate');
  const app = document.querySelector<HTMLElement>('#staff-app');
  const form = document.querySelector<HTMLFormElement>('#staff-gate-form');
  const error = document.querySelector<HTMLElement>('#staff-gate-error');
  const input = document.querySelector<HTMLInputElement>('#staff-passcode');
  if (!gate || !app || !form || !error || !input) return;

  const open = (session: StaffSession) => {
    gate.hidden = true;
    app.hidden = false;
    onReady(session);
    app.querySelector<HTMLElement>('h2, input, select, a')?.focus();
  };

  const stored = sessionStorage.getItem(STAFF_TOKEN_KEY);
  if (stored && servicesUrl()) {
    open({ mode: 'remote', token: stored });
    return;
  }

  input.focus();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    const passcode = input.value;
    const expected = import.meta.env.PUBLIC_STAFF_PASSCODE ?? '';
    if (expected && passcode !== expected) {
      error.hidden = false;
      error.textContent = 'That passcode is not recognized.';
      return;
    }
    const base = servicesUrl();
    if (!base) {
      if (!expected) {
        error.hidden = false;
        error.textContent = 'Staff sign-in is not configured for this build.';
        return;
      }
      open({ mode: 'local' });
      return;
    }
    try {
      const response = await fetch(`${base}/api/staff/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      const payload = (await response.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!response.ok || !payload.token) {
        error.hidden = false;
        error.textContent = response.status === 401 ? 'That passcode is not recognized.' : payload.error || 'Sign-in is unavailable.';
        return;
      }
      sessionStorage.setItem(STAFF_TOKEN_KEY, payload.token);
      open({ mode: 'remote', token: payload.token });
    } catch {
      error.hidden = false;
      error.textContent = 'Sign-in is unavailable.';
    }
  });
}

export async function staffFetch(path: string, token: string, init: RequestInit = {}) {
  const base = servicesUrl();
  const headers = new Headers(init.headers);
  headers.set('x-staff-token', token);
  const response = await fetch(`${base}${path}`, { ...init, headers });
  if (response.status === 401) {
    sessionStorage.removeItem(STAFF_TOKEN_KEY);
    window.location.reload();
  }
  return response;
}
