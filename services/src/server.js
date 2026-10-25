import { createApp } from './app.js';
import { createStorage } from './storage.js';

let app;

export function getApp() {
  if (!app) app = createApp({ storage: createStorage() });
  return app;
}

export function handle(request) {
  return getApp().handle(request);
}
