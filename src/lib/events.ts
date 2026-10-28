/**
 * Date, time, and calendar-file helpers for the events calendar.
 *
 * Days are ISO civil dates (YYYY-MM-DD) and are computed in UTC so the grid
 * never shifts with the viewer's time zone. Times are campus clock strings
 * (HH:MM, 24-hour) and are written to .ics files as floating local times.
 */

const DAY_MS = 86_400_000;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export type EventSpan = {
  date: string;
  endDate?: string;
  start?: string;
  end?: string;
};

export function dayValue(iso: string): number {
  const match = ISO_DAY.exec(iso);
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function isIsoDay(value: string | null | undefined): value is string {
  if (!value) return false;
  const time = dayValue(value);
  return !Number.isNaN(time) && isoFromValue(time) === value;
}

export function isoFromValue(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return isoFromValue(dayValue(iso) + days * DAY_MS);
}

export function addMonths(iso: string, months: number): string {
  const date = new Date(dayValue(iso));
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return isoFromValue(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((dayValue(to) - dayValue(from)) / DAY_MS);
}

export function weekday(iso: string): number {
  return new Date(dayValue(iso)).getUTCDay();
}

/** Sunday that starts the week containing `iso`. */
export function startOfWeek(iso: string): string {
  return addDays(iso, -weekday(iso));
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

export function clampDay(iso: string, first: string, last: string): string {
  if (iso < first) return first;
  if (iso > last) return last;
  return iso;
}

function formatDay(iso: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(dayValue(iso)).toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });
}

/** "Monday, January 11, 2027" */
export function formatLongDate(iso: string): string {
  return formatDay(iso, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/** "Monday, January 11" */
export function formatDayHeading(iso: string): string {
  return formatDay(iso, { weekday: 'long', month: 'long', day: 'numeric' });
}

/** "January 2027" */
export function formatMonthYear(iso: string): string {
  return formatDay(iso, { month: 'long', year: 'numeric' });
}

/** "Jan 11" */
export function formatShortDate(iso: string): string {
  return formatDay(iso, { month: 'short', day: 'numeric' });
}

/** "Mon" */
export function formatWeekdayShort(iso: string): string {
  return formatDay(iso, { weekday: 'short' });
}

/** "January 10 – 16, 2027" or "January 31 – February 6, 2027" */
export function formatWeekRange(firstDay: string): string {
  const lastDay = addDays(firstDay, 6);
  const startMonth = formatDay(firstDay, { month: 'long' });
  const endMonth = formatDay(lastDay, { month: 'long' });
  const startYear = firstDay.slice(0, 4);
  const endYear = lastDay.slice(0, 4);
  const startDay = Number(firstDay.slice(8));
  const endDay = Number(lastDay.slice(8));
  if (startYear !== endYear) {
    return `${startMonth} ${startDay}, ${startYear} – ${endMonth} ${endDay}, ${endYear}`;
  }
  if (startMonth === endMonth) return `${startMonth} ${startDay} – ${endDay}, ${endYear}`;
  return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${endYear}`;
}

export function minutesOf(clock: string): number {
  const [hours = '0', minutes = '0'] = clock.split(':');
  return Number(hours) * 60 + Number(minutes);
}

function clockParts(clock: string): { text: string; meridiem: 'a.m.' | 'p.m.' | '' } {
  const total = minutesOf(clock);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 12 && minutes === 0) return { text: 'noon', meridiem: '' };
  const meridiem = hours < 12 ? 'a.m.' : 'p.m.';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const text = minutes === 0 ? String(hour12) : `${hour12}:${String(minutes).padStart(2, '0')}`;
  return { text, meridiem };
}

/** "4 p.m.", "12:15 p.m.", "noon" */
export function formatClock(clock: string): string {
  const { text, meridiem } = clockParts(clock);
  return meridiem ? `${text} ${meridiem}` : text;
}

/** "4–5:30 p.m.", "11 a.m.–2 p.m.", "noon–1 p.m.", or "All day" */
export function formatTimeRange(start?: string, end?: string): string {
  if (!start) return 'All day';
  if (!end) return formatClock(start);
  const a = clockParts(start);
  const b = clockParts(end);
  if (a.meridiem && a.meridiem === b.meridiem) return `${a.text}–${b.text} ${b.meridiem}`;
  return `${formatClock(start)}–${formatClock(end)}`;
}

export function isAllDay(event: EventSpan): boolean {
  return !event.start;
}

/** Every civil day the event appears on. */
export function eventDays(event: EventSpan): string[] {
  const last = event.endDate && event.endDate > event.date ? event.endDate : event.date;
  const days: string[] = [];
  for (let day = event.date; day <= last; day = addDays(day, 1)) days.push(day);
  return days;
}

/** "Monday, March 22 – Friday, March 26, 2027" for a multi-day event, else the long date. */
export function formatEventDates(event: EventSpan): string {
  if (!event.endDate || event.endDate === event.date) return formatLongDate(event.date);
  return `${formatDayHeading(event.date)} – ${formatLongDate(event.endDate)}`;
}

export type IcsEvent = EventSpan & {
  uid: string;
  title: string;
  description: string;
  location: string;
  category: string;
  url: string;
};

export type IcsOptions = {
  /** UTC timestamp written to DTSTAMP. */
  stamp: Date;
  calendarName?: string;
};

function icsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function icsDate(iso: string): string {
  return iso.replace(/-/g, '');
}

function icsDateTime(iso: string, clock: string): string {
  return `${icsDate(iso)}T${clock.replace(':', '')}00`;
}

function icsStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

const encoder = new TextEncoder();

/** Fold a content line at 75 octets without splitting a UTF-8 character (RFC 5545 §3.1). */
export function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function buildIcs(events: IcsEvent[], options: IcsOptions): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//University of Mars//Events Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  if (options.calendarName) lines.push(`X-WR-CALNAME:${icsText(options.calendarName)}`);
  for (const event of events) {
    lines.push('BEGIN:VEVENT', `UID:${event.uid}`, `DTSTAMP:${icsStamp(options.stamp)}`);
    if (event.start) {
      lines.push(`DTSTART:${icsDateTime(event.date, event.start)}`);
      lines.push(`DTEND:${icsDateTime(event.date, event.end ?? event.start)}`);
    } else {
      const last = event.endDate && event.endDate > event.date ? event.endDate : event.date;
      lines.push(`DTSTART;VALUE=DATE:${icsDate(event.date)}`);
      lines.push(`DTEND;VALUE=DATE:${icsDate(addDays(last, 1))}`);
    }
    lines.push(
      `SUMMARY:${icsText(event.title)}`,
      `LOCATION:${icsText(event.location)}`,
      `DESCRIPTION:${icsText(event.description)}`,
      `CATEGORIES:${icsText(event.category)}`,
      `URL:${event.url}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}
