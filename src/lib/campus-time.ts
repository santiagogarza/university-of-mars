/**
 * Display a ticket, work-order, or case date on the campus clock.
 *
 * The public site's "today" is Monday, January 11, 2027. A value on the
 * viewer's current local day is "Today, 5:18 PM", and the previous local day
 * is "Yesterday, 9:02 AM". A calendar date with no clock time omits the time.
 *
 * Reset does not rebuild timestamps. It copies seed-data.json.
 * - Tickets are relative: fixed instants from October 19–26, 2026, a few
 *   days before the workshop. Work orders are not seeded; a new one is
 *   stamped with the real current time, same as a ticket filed on stage.
 * - Title IX received dates are absolute campus days (September 8,
 *   November 2, December 14). Their createdAt values repeat those days.
 *
 * Only a civil day on the viewer's today, or within RELATIVE_LOOKBACK_DAYS
 * before it, is slid so that same distance lands on January 11. Anything
 * later than the viewer, and any older seeded campus day, is printed as
 * itself ("Dec 14"). On October 28 that still maps the October ticket
 * cluster, including after another reset restores the same seed, and it
 * leaves the three case dates on their own month and day.
 */
const CAMPUS_TODAY_UTC = Date.UTC(2027, 0, 11);
const DAY_MS = 86_400_000;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const RELATIVE_LOOKBACK_DAYS = 14;

export function formatCampusWhen(value: string | Date | null | undefined, now: Date = new Date()): string {
  const parsed = parsedCampus(value);
  if (!parsed) return '';

  const dayDelta = Math.round((civilUtc(now) - civilUtc(parsed.date)) / DAY_MS);
  if (dayDelta === 0) return label('Today', parsed);
  if (dayDelta === 1) return label('Yesterday', parsed);
  if (dayDelta < 0 || dayDelta > RELATIVE_LOOKBACK_DAYS) return shortLocal(parsed.date);

  const campus = new Date(CAMPUS_TODAY_UTC - dayDelta * DAY_MS);
  return campus.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Received column on the case log. Seeded rows keep the campus day.
 * A case filed on stage stores that same local day on createdAt, with the
 * clock, and the column shows "Today, 5:18 PM".
 */
export function formatCampusReceived(
  dateReceived: string | Date | null | undefined,
  createdAt: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  if (sameCivilDay(dateReceived, createdAt)) {
    const filed = formatCampusWhen(createdAt, now);
    if (filed.startsWith('Today,') || filed.startsWith('Yesterday,')) return filed;
  }
  return formatCampusWhen(dateReceived, now);
}

function label(day: 'Today' | 'Yesterday', parsed: { date: Date; dateOnly: boolean }): string {
  if (parsed.dateOnly) return day;
  return `${day}, ${clock(parsed.date)}`;
}

function clock(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/[\u202f\u00a0]/g, ' ');
}

function shortLocal(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function civilUtc(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function parsedCampus(value: string | Date | null | undefined): { date: Date; dateOnly: boolean } | null {
  if (value == null || value === '') return null;
  return parseCampusInput(value);
}

function sameCivilDay(
  left: string | Date | null | undefined,
  right: string | Date | null | undefined,
): boolean {
  const a = parsedCampus(left);
  const b = parsedCampus(right);
  if (!a || !b) return false;
  return civilUtc(a.date) === civilUtc(b.date);
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
