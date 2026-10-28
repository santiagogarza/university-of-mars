export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface AppearanceSettings {
  theme: ThemePreference;
  /** Percent of the browser's base font size. */
  textScale: number;
  dyslexicFont: boolean;
  /** `null` follows the device's reduced-motion setting. */
  reduceMotion: boolean | null;
}

/** Also read by the inline boot script in `src/layouts/Base.astro`. */
export const APPEARANCE_STORAGE_KEY = 'um-appearance';
export const TEXT_SCALE_MIN = 90;
export const TEXT_SCALE_MAX = 140;
export const TEXT_SCALE_STEP = 5;

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: 'light',
  textScale: 100,
  dyslexicFont: false,
  reduceMotion: null,
};

export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: '#6B2430',
  dark: '#0c1620',
};

const THEMES: readonly ThemePreference[] = ['light', 'dark', 'system'];

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

export function clampTextScale(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return DEFAULT_APPEARANCE.textScale;
  const stepped = Math.round(number / TEXT_SCALE_STEP) * TEXT_SCALE_STEP;
  return Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, stepped));
}

export function normalizeAppearance(value: unknown): AppearanceSettings {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    theme: isThemePreference(input.theme) ? input.theme : DEFAULT_APPEARANCE.theme,
    textScale: 'textScale' in input ? clampTextScale(input.textScale) : DEFAULT_APPEARANCE.textScale,
    dyslexicFont: input.dyslexicFont === true,
    reduceMotion: typeof input.reduceMotion === 'boolean' ? input.reduceMotion : null,
  };
}

export function parseAppearance(raw: string | null | undefined): AppearanceSettings {
  if (!raw) return { ...DEFAULT_APPEARANCE };
  try {
    return normalizeAppearance(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function serializeAppearance(settings: AppearanceSettings): string {
  return JSON.stringify(normalizeAppearance(settings));
}

export function isDefaultAppearance(settings: AppearanceSettings): boolean {
  const normal = normalizeAppearance(settings);
  return (
    normal.theme === DEFAULT_APPEARANCE.theme &&
    normal.textScale === DEFAULT_APPEARANCE.textScale &&
    normal.dyslexicFont === DEFAULT_APPEARANCE.dyslexicFont &&
    normal.reduceMotion === DEFAULT_APPEARANCE.reduceMotion
  );
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

export function resolveReduceMotion(preference: boolean | null, systemPrefersReduce: boolean): boolean {
  return preference ?? systemPrefersReduce;
}
