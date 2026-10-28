/**
 * Mars clocks and sample station weather for the "Our campuses" globe.
 *
 * Time math follows Allison & McEwen (2000) as used by NASA GISS Mars24:
 * Mars Sol Date (MSD), Coordinated Mars Time (MTC), local mean solar time
 * (LMST), and the areocentric solar longitude (Ls) that names the season.
 *
 * The public site's "today" is Monday, January 11, 2027. `campusInstant`
 * keeps the viewer's wall-clock time but moves it to that day, so the sol
 * clocks tick live without contradicting the campus calendar.
 *
 * Weather is sample data: a fixed baseline per station, a daily wobble
 * seeded by the sol number, and a diurnal temperature curve.
 */

const MS_PER_DAY = 86_400_000;
const JD_UNIX_EPOCH = 2440587.5;
const TT_MINUS_UTC_SECONDS = 37 + 32.184;
const SOL_IN_DAYS = 1.0274912517;
const DEG = Math.PI / 180;

export const MARS_YEAR_ONE_JD = 2435208.5;
export const MARS_YEAR_DAYS = 686.9726;

export function campusInstant(now: Date = new Date()): Date {
  return new Date(2027, 0, 11, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
}

function julianDateTT(date: Date): number {
  return date.getTime() / MS_PER_DAY + JD_UNIX_EPOCH + TT_MINUS_UTC_SECONDS / 86_400;
}

export function marsSolDate(date: Date): number {
  const dtJ2000 = julianDateTT(date) - 2451545.0;
  return (dtJ2000 - 4.5) / SOL_IN_DAYS + 44796.0 - 0.0009626;
}

function mod(value: number, by: number): number {
  return ((value % by) + by) % by;
}

/** Coordinated Mars Time, the mean solar time at the prime meridian, in hours. */
export function coordinatedMarsTime(date: Date): number {
  return mod(24 * marsSolDate(date), 24);
}

export interface SolClock {
  /** Whole Mars Sol Date at this longitude. */
  sol: number;
  /** Local mean solar time in decimal hours, 0–24. */
  hours: number;
  /** "14:07:32" */
  label: string;
}

/** Local mean solar time at a planetocentric, east-positive longitude. */
export function localSolClock(date: Date, lonEast: number): SolClock {
  const localMsd = marsSolDate(date) + lonEast / 360;
  const hours = mod(24 * localMsd, 24);
  const total = Math.floor(hours * 3600);
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return { sol: Math.floor(localMsd), hours, label: `${pad(hh)}:${pad(mm)}:${pad(ss)}` };
}

const PERTURBERS: Array<[number, number, number]> = [
  [0.0071, 2.2353, 49.409],
  [0.0057, 2.7543, 168.173],
  [0.0039, 1.1177, 191.837],
  [0.0037, 15.7866, 21.736],
  [0.0021, 2.1354, 15.704],
  [0.002, 2.4694, 95.528],
  [0.0018, 32.8493, 49.095],
];

/** Areocentric solar longitude in degrees, 0–360. Ls 0 is the northern spring equinox. */
export function solarLongitude(date: Date): number {
  const dt = julianDateTT(date) - 2451545.0;
  const m = (19.3871 + 0.52402073 * dt) * DEG;
  const alphaFms = 270.3871 + 0.524038496 * dt;
  let pbs = 0;
  for (const [a, tau, phi] of PERTURBERS) pbs += a * Math.cos(((0.985626 * dt) / tau + phi) * DEG);
  const equationOfCenter =
    (10.691 + 3.0e-7 * dt) * Math.sin(m) +
    0.623 * Math.sin(2 * m) +
    0.05 * Math.sin(3 * m) +
    0.005 * Math.sin(4 * m) +
    0.0005 * Math.sin(5 * m) +
    pbs;
  return mod(alphaFms + equationOfCenter, 360);
}

/** Mars Year in the Clancy et al. numbering (MY 1 began April 11, 1955). */
export function marsYear(date: Date): number {
  return Math.floor((julianDateTT(date) - MARS_YEAR_ONE_JD) / MARS_YEAR_DAYS) + 1;
}

const NORTHERN_SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;

export function seasonAt(date: Date, lat: number): string {
  const ls = solarLongitude(date);
  const index = Math.floor(ls / 90) % 4;
  if (lat >= 0) return `Northern ${NORTHERN_SEASONS[index]}`;
  return `Southern ${NORTHERN_SEASONS[(index + 2) % 4]}`;
}

export interface WeatherBaseline {
  highC: number;
  lowC: number;
  pressurePa: number;
  windKph: number;
  dustTau: number;
}

export interface WeatherReadout {
  nowC: number;
  highC: number;
  lowC: number;
  pressurePa: number;
  windKph: number;
  windFrom: string;
  dustTau: number;
  sky: string;
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function seeded(key: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Temperature between the low (about 05:30 LMST) and the high (about 14:00 LMST). */
export function diurnalTemperature(hours: number, lowC: number, highC: number): number {
  const rise = 5.5;
  const peak = 14;
  const h = mod(hours, 24);
  if (h >= rise && h <= peak) {
    return lowC + (highC - lowC) * (1 - Math.cos((Math.PI * (h - rise)) / (peak - rise))) / 2;
  }
  const fall = mod(h - peak, 24) / (24 - (peak - rise));
  return highC - (highC - lowC) * (1 - Math.cos(Math.PI * fall)) / 2;
}

export function skyFor(tau: number): string {
  if (tau < 0.3) return 'Clear and dark blue at the zenith';
  if (tau < 0.55) return 'Light dust haze';
  if (tau < 0.9) return 'Dusty, butterscotch sky';
  return 'Dust storm watch';
}

export function stationWeather(id: string, base: WeatherBaseline, clock: SolClock): WeatherReadout {
  const rnd = seeded(`${id}:${clock.sol}`);
  const highC = Math.round(base.highC + (rnd() - 0.5) * 6);
  const lowC = Math.round(base.lowC + (rnd() - 0.5) * 6);
  const dustTau = Math.round(Math.max(0.05, base.dustTau + (rnd() - 0.5) * 0.2) * 100) / 100;
  const windKph = Math.max(2, Math.round(base.windKph * (0.7 + rnd() * 0.6) * (0.75 + 0.5 * Math.sin((clock.hours / 24) * Math.PI))));
  const windFrom = COMPASS[Math.floor(rnd() * COMPASS.length)];
  const pressurePa = Math.round(base.pressurePa * (1 + (rnd() - 0.5) * 0.03) * (1 + 0.012 * Math.cos(((clock.hours - 4) / 24) * 2 * Math.PI)));
  return {
    nowC: Math.round(diurnalTemperature(clock.hours, lowC, highC)),
    highC,
    lowC,
    pressurePa,
    windKph,
    windFrom,
    dustTau,
    sky: skyFor(dustTau),
  };
}
