const TOKEN_KEY = 'um-staff-token';

export async function gate(app) {
  const existing = sessionStorage.getItem(TOKEN_KEY);
  if (existing) {
    app.hidden = false;
    return existing;
  }
  const panel = document.querySelector('#gate');
  const form = document.querySelector('#gate-form');
  const error = document.querySelector('#gate-error');
  panel.hidden = false;
  document.querySelector('#staff-passcode').focus();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    const passcode = new FormData(form).get('passcode');
    try {
      const response = await fetch('/api/staff/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        error.hidden = false;
        error.textContent = response.status === 401 ? 'That passcode is not recognized.' : payload.error || 'Sign-in is unavailable.';
        return;
      }
      sessionStorage.setItem(TOKEN_KEY, payload.token);
      panel.hidden = true;
      app.hidden = false;
      app.dispatchEvent(new CustomEvent('staff-ready'));
    } catch {
      error.hidden = false;
      error.textContent = 'Sign-in is unavailable.';
    }
  });
  return null;
}

export function token() {
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}), 'x-staff-token': token() };
  const response = await fetch(path, { ...options, headers });
  if (response.status === 401) {
    sessionStorage.removeItem(TOKEN_KEY);
    location.reload();
  }
  return response;
}
