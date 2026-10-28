import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DEFAULT_APPEARANCE,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
  clampTextScale,
  isDefaultAppearance,
  parseAppearance,
  resolveReduceMotion,
  resolveTheme,
  serializeAppearance,
} from '../src/lib/appearance.ts';

test('missing or broken storage falls back to the defaults', () => {
  assert.deepEqual(parseAppearance(null), DEFAULT_APPEARANCE);
  assert.deepEqual(parseAppearance(''), DEFAULT_APPEARANCE);
  assert.deepEqual(parseAppearance('{not json'), DEFAULT_APPEARANCE);
  assert.deepEqual(parseAppearance('null'), DEFAULT_APPEARANCE);
  assert.deepEqual(parseAppearance('"dark"'), DEFAULT_APPEARANCE);
});

test('the default theme stays light so the site looks the same until someone opts in', () => {
  assert.equal(DEFAULT_APPEARANCE.theme, 'light');
  assert.equal(DEFAULT_APPEARANCE.textScale, 100);
});

test('saved settings round-trip', () => {
  const saved = { theme: 'dark', textScale: 125, dyslexicFont: true, reduceMotion: false } as const;
  assert.deepEqual(parseAppearance(serializeAppearance(saved)), saved);
});

test('unknown values are dropped field by field', () => {
  const parsed = parseAppearance(JSON.stringify({ theme: 'sepia', textScale: 120, dyslexicFont: 'yes', reduceMotion: 1 }));
  assert.deepEqual(parsed, { theme: 'light', textScale: 120, dyslexicFont: false, reduceMotion: null });
});

test('text size is clamped to the slider range and snapped to its step', () => {
  assert.equal(clampTextScale(50), TEXT_SCALE_MIN);
  assert.equal(clampTextScale(400), TEXT_SCALE_MAX);
  assert.equal(clampTextScale(117), 115);
  assert.equal(clampTextScale(118), 120);
  assert.equal(clampTextScale('130'), 130);
  assert.equal(clampTextScale('large'), 100);
  assert.equal(clampTextScale(Number.NaN), 100);
});

test('system theme follows the device, explicit themes do not', () => {
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});

test('reduce motion starts from the device setting until the person chooses', () => {
  assert.equal(resolveReduceMotion(null, true), true);
  assert.equal(resolveReduceMotion(null, false), false);
  assert.equal(resolveReduceMotion(false, true), false);
  assert.equal(resolveReduceMotion(true, false), true);
});

test('defaults are recognised so storage can be cleared', () => {
  assert.equal(isDefaultAppearance({ ...DEFAULT_APPEARANCE }), true);
  assert.equal(isDefaultAppearance({ ...DEFAULT_APPEARANCE, textScale: 110 }), false);
  assert.equal(isDefaultAppearance({ ...DEFAULT_APPEARANCE, reduceMotion: false }), false);
});

// ---------- Dark theme contrast ----------

const css = readFileSync(new URL('../src/styles/appearance.css', import.meta.url), 'utf8');
const darkBlock = css.match(/\[data-theme='dark'\]\s*\{([^}]*)\}/)?.[1] ?? '';
const tokens = Object.fromEntries(
  [...darkBlock.matchAll(/--(um-[\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(([, name, value]) => [name, value.toLowerCase()]),
);

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const surfaces = ['um-bg', 'um-surface', 'um-surface-raised'];
const bodyText = ['um-ink', 'um-ink-soft', 'um-heading', 'um-link', 'um-link-hover', 'um-accent', 'um-error'];

const textPairs: Array<[string, string]> = [
  ...bodyText.flatMap((text) => surfaces.map((surface) => [text, surface] as [string, string])),
  ['um-ink', 'um-frame'],
  ['um-ink-soft', 'um-frame'],
  ['um-meta', 'um-surface'],
  ['um-ink', 'um-surface-sunken'],
  ['um-placeholder', 'um-surface-sunken'],
  ['um-on-btn', 'um-btn'],
  ['um-on-btn', 'um-btn-hover'],
  ['um-on-btn', 'um-btn-navy'],
  ['um-on-btn', 'um-btn-navy-hover'],
  ['um-on-btn', 'um-give'],
  ['um-on-btn', 'um-give-hover'],
  ['um-on-light', 'um-link'],
  ['um-on-chrome', 'um-chrome'],
  ['um-on-chrome', 'um-footer'],
  ['um-on-chrome', 'um-band'],
  ['um-error-ink', 'um-error-bg'],
  ['um-pill-progress-ink', 'um-pill-progress-bg'],
  ['um-pill-resolved-ink', 'um-pill-resolved-bg'],
  ['um-ink', 'um-filled-bg'],
];

const nonTextPairs: Array<[string, string]> = [
  ['um-control-border', 'um-surface'],
  ['um-control-border', 'um-surface-sunken'],
  ['um-link', 'um-bg'],
  ['um-heading', 'um-surface-sunken'],
];

test('dark theme tokens are parsed from appearance.css', () => {
  assert.ok(Object.keys(tokens).length > 30, 'expected the dark token block in appearance.css');
});

for (const [text, background] of textPairs) {
  test(`dark text --${text} on --${background} meets WCAG AA (4.5:1)`, () => {
    assert.ok(tokens[text], `missing --${text}`);
    assert.ok(tokens[background], `missing --${background}`);
    const ratio = contrast(tokens[text], tokens[background]);
    assert.ok(ratio >= 4.5, `${tokens[text]} on ${tokens[background]} is ${ratio.toFixed(2)}:1`);
  });
}

for (const [part, background] of nonTextPairs) {
  test(`dark control --${part} on --${background} meets 3:1`, () => {
    const ratio = contrast(tokens[part], tokens[background]);
    assert.ok(ratio >= 3, `${tokens[part]} on ${tokens[background]} is ${ratio.toFixed(2)}:1`);
  });
}
