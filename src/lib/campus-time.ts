/**
 * Display a ticket, work-order, or case date on the campus clock.
 *
 * The public site's "today" is Monday, January 11, 2027. A value on the
 * viewer's current local day is "Today, 5:18 PM", and the previous local day
 * is "Yesterday, 9:02 AM". Every other day keeps that same distance from
 * January 11 and is shown as a short date in the fictional year ("Jan 8").
 * A calendar date with no clock time omits the time.
 */
const CAMPUS_TODAY_UTC = Date.UTC(2027, 0, 11);
const DAY_MS = 86_400_000;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatCampusWhen(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (value == null || value === '') return '';
  const parsed = parseCampusInput(value);
  if (!parsed) return '';

  const dayDelta = Math.round((civilUtc(now) - civilUtc(parsed.date)) / DAY_MS);
  if (dayDelta === 0) return label('Today', parsed);
  if (dayDelta === 1) return label('Yesterday', parsed);

  const campus = new Date(CAMPUS_TODAY_UTC - dayDelta * DAY_MS);
  return campus.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function label(day: 'Today' | 'Yesterday', parsed: { date: Date; dateOnly: boolean }): string {
  if (parsed.dateOnly) return day;
  return `${day}, ${clock(parsed.date)}`;
}

function clock(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/[\u202f\u00a0]/g, ' ');
}

function civilUtc(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseCampusInput(value: string | Date): { date: Date; dateOnly: boolean } | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : { date: value, dateOnly: false };
  }
  const text = value.trim();
  const match = DATE_ONLY.exec(text);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, month, day);
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
    return { date, dateOnly: true };
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return { date, dateOnly: false };
}
