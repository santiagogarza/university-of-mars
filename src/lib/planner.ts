import { DAYS, TERM, buildingName } from '../data/courses.ts';
import type { Course, DayCode, Meeting, Section } from '../data/courses.ts';

export type Pick = { code: string; section: string };
export type Entry = { course: Course; section: Section };
export type Period = 'morning' | 'afternoon' | 'evening';
export type SortKey = 'days' | 'late' | 'gaps' | 'early';

/** One meeting on one weekday, the unit the calendar draws. */
export type Placement = {
  course: Course;
  section: Section;
  meeting: Meeting;
  day: DayCode;
  start: number;
  end: number;
};

export type Conflict = {
  day: DayCode;
  start: number;
  end: number;
  first: Placement;
  second: Placement;
};

export const DAY_ORDER: DayCode[] = DAYS.map((day) => day.code);

export function toMinutes(clock: string): number {
  const [hours = '0', minutes = '0'] = clock.split(':');
  return Number(hours) * 60 + Number(minutes);
}

export function formatTime(minutes: number): string {
  const hours24 = Math.floor(minutes / 60);
  const hours12 = ((hours24 + 11) % 12) + 1;
  return `${hours12}:${String(minutes % 60).padStart(2, '0')} ${hours24 < 12 ? 'AM' : 'PM'}`;
}

export function formatRange(start: number, end: number): string {
  const samePeriod = start < 720 === end < 720;
  const first = samePeriod ? formatTime(start).replace(/ (AM|PM)$/, '') : formatTime(start);
  return `${first}–${formatTime(end)}`;
}

export function dayLong(code: DayCode): string {
  return DAYS.find((day) => day.code === code)?.long ?? code;
}

export function dayShort(code: DayCode): string {
  return DAYS.find((day) => day.code === code)?.short ?? code;
}

export function daysLabel(days: DayCode[]): string {
  return [...days].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b)).join('');
}

export function meetingLabel(meeting: Meeting): string {
  return `${daysLabel(meeting.days)} ${formatRange(toMinutes(meeting.start), toMinutes(meeting.end))}`;
}

export function whereLabel(meeting: Meeting): string {
  return `${buildingName(meeting.building)} ${meeting.room}`;
}

export function periodOf(start: number): Period {
  if (start < 12 * 60) return 'morning';
  if (start < 17 * 60) return 'afternoon';
  return 'evening';
}

export function placements(course: Course, section: Section): Placement[] {
  const out: Placement[] = [];
  for (const meeting of section.meetings) {
    for (const day of meeting.days) {
      out.push({ course, section, meeting, day, start: toMinutes(meeting.start), end: toMinutes(meeting.end) });
    }
  }
  return out.sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.start - b.start);
}

function overlaps(a: Placement, b: Placement): boolean {
  return a.day === b.day && a.start < b.end && b.start < a.end;
}

export function sectionsConflict(a: Section, b: Section): boolean {
  for (const ma of a.meetings) {
    for (const mb of b.meetings) {
      if (!ma.days.some((day) => mb.days.includes(day))) continue;
      if (toMinutes(ma.start) < toMinutes(mb.end) && toMinutes(mb.start) < toMinutes(ma.end)) return true;
    }
  }
  return false;
}

export function findConflicts(entries: Entry[]): Conflict[] {
  const all = entries.flatMap((entry) => placements(entry.course, entry.section));
  const conflicts: Conflict[] = [];
  for (let i = 0; i < all.length; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      const a = all[i]!;
      const b = all[j]!;
      if (a.course.code === b.course.code || !overlaps(a, b)) continue;
      conflicts.push({ day: a.day, start: Math.max(a.start, b.start), end: Math.min(a.end, b.end), first: a, second: b });
    }
  }
  return conflicts;
}

/** The same two meetings colliding on several weekdays, reported once. */
export type ConflictGroup = {
  first: Placement;
  second: Placement;
  days: DayCode[];
  minutes: number;
};

export function conflictKey(conflict: { first: Placement; second: Placement }): string {
  const { first, second } = conflict;
  return [first.course.code, first.meeting.kind, second.course.code, second.meeting.kind].join('|');
}

export function groupConflicts(conflicts: Conflict[]): ConflictGroup[] {
  const groups = new Map<string, ConflictGroup>();
  for (const conflict of conflicts) {
    const { first, second } = conflict;
    const key = conflictKey(conflict);
    const group = groups.get(key);
    if (group) {
      if (!group.days.includes(conflict.day)) group.days.push(conflict.day);
    } else {
      groups.set(key, { first, second, days: [conflict.day], minutes: conflict.end - conflict.start });
    }
  }
  return [...groups.values()];
}

function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

export function describeConflict(group: ConflictGroup): string {
  const { first, second } = group;
  return (
    `${first.course.code} ${first.meeting.kind.toLowerCase()} (${formatRange(first.start, first.end)}) and ` +
    `${second.course.code} ${second.meeting.kind.toLowerCase()} (${formatRange(second.start, second.end)}) ` +
    `overlap for ${group.minutes} minutes on ${listJoin(group.days.map(dayLong))}.`
  );
}

/** Days, period, and open-seat filters for one section. */
export function sectionMatches(
  section: Section,
  filters: { days?: Set<DayCode>; periods?: Set<Period>; openOnly?: boolean },
): boolean {
  if (filters.openOnly && section.seats <= 0) return false;
  return section.meetings.every((meeting) => {
    const daysOk = !filters.days || meeting.days.every((day) => filters.days!.has(day));
    const periodOk = !filters.periods || filters.periods.has(periodOf(toMinutes(meeting.start)));
    return daysOk && periodOk;
  });
}

export type GenerateResult = {
  /** Each schedule lists one section per input course, in input order. */
  schedules: Section[][];
  truncated: boolean;
  /** Why nothing fits, when no schedule exists. */
  blockers: string[];
};

export function generateSchedules(
  courses: Course[],
  options: { openOnly?: boolean; limit?: number } = {},
): GenerateResult {
  const limit = options.limit ?? 2000;
  const pools = courses.map((course) =>
    course.sections.filter((section) => !options.openOnly || section.seats > 0),
  );
  const empty = courses.filter((_, index) => pools[index]!.length === 0);
  if (courses.length === 0) return { schedules: [], truncated: false, blockers: [] };
  if (empty.length) {
    return {
      schedules: [],
      truncated: false,
      blockers: empty.map((course) => `${course.code} has no sections with open seats.`),
    };
  }

  // Search the most constrained course first, then put each result back in input order.
  const order = courses.map((_, index) => index).sort((a, b) => pools[a]!.length - pools[b]!.length);
  const schedules: Section[][] = [];
  const chosen: Section[] = [];
  let truncated = false;

  const walk = (depth: number) => {
    if (truncated) return;
    if (depth === order.length) {
      const result: Section[] = new Array(courses.length);
      order.forEach((courseIndex, position) => {
        result[courseIndex] = chosen[position]!;
      });
      schedules.push(result);
      if (schedules.length >= limit) truncated = true;
      return;
    }
    for (const section of pools[order[depth]!]!) {
      if (chosen.some((other) => sectionsConflict(other, section))) continue;
      chosen.push(section);
      walk(depth + 1);
      chosen.pop();
      if (truncated) return;
    }
  };
  walk(0);

  return { schedules, truncated, blockers: schedules.length ? [] : explainBlockers(courses, pools) };
}

function explainBlockers(courses: Course[], pools: Section[][]): string[] {
  const out: string[] = [];
  for (let i = 0; i < courses.length; i += 1) {
    for (let j = i + 1; j < courses.length; j += 1) {
      const clash = pools[i]!.every((a) => pools[j]!.every((b) => sectionsConflict(a, b)));
      if (clash) {
        out.push(`Every section of ${courses[i]!.code} overlaps every section of ${courses[j]!.code}.`);
      }
    }
  }
  if (!out.length) out.push('No single pair is the problem: three or more of these courses compete for the same times.');
  return out;
}

export type ScheduleStats = {
  daysOnCampus: number;
  earliest: number;
  latest: number;
  gapMinutes: number;
  classMinutes: number;
};

export function scheduleStats(entries: Entry[]): ScheduleStats {
  const all = entries.flatMap((entry) => placements(entry.course, entry.section));
  const byDay = new Map<DayCode, Placement[]>();
  for (const item of all) byDay.set(item.day, [...(byDay.get(item.day) ?? []), item]);
  let gapMinutes = 0;
  for (const list of byDay.values()) {
    list.sort((a, b) => a.start - b.start);
    let reach = list[0]!.end;
    for (const item of list.slice(1)) {
      if (item.start > reach) gapMinutes += item.start - reach;
      reach = Math.max(reach, item.end);
    }
  }
  return {
    daysOnCampus: byDay.size,
    earliest: all.length ? Math.min(...all.map((item) => item.start)) : 0,
    latest: all.length ? Math.max(...all.map((item) => item.end)) : 0,
    gapMinutes,
    classMinutes: all.reduce((sum, item) => sum + (item.end - item.start), 0),
  };
}

export function sortSchedules(courses: Course[], schedules: Section[][], key: SortKey): Section[][] {
  const scored = schedules.map((sections, index) => ({
    sections,
    index,
    stats: scheduleStats(sections.map((section, i) => ({ course: courses[i]!, section }))),
  }));
  const compare: Record<SortKey, (a: ScheduleStats, b: ScheduleStats) => number> = {
    days: (a, b) => a.daysOnCampus - b.daysOnCampus || a.gapMinutes - b.gapMinutes,
    late: (a, b) => b.earliest - a.earliest || a.daysOnCampus - b.daysOnCampus,
    gaps: (a, b) => a.gapMinutes - b.gapMinutes || a.daysOnCampus - b.daysOnCampus,
    early: (a, b) => a.latest - b.latest || a.gapMinutes - b.gapMinutes,
  };
  return scored
    .sort((a, b) => compare[key](a.stats, b.stats) || a.index - b.index)
    .map((item) => item.sections);
}

export type PrereqCheck = {
  /** Unmet requirements; each inner list is "any one of". */
  missing: string[][];
  /** Unmet requirements that are in the current plan but not yet completed. */
  plannedOnly: string[][];
};

export function checkPrereqs(course: Course, completed: Set<string>, planned: Set<string>): PrereqCheck {
  const missing = course.prereqs.filter((group) => !group.some((code) => completed.has(code)));
  return { missing, plannedOnly: missing.filter((group) => group.some((code) => planned.has(code))) };
}

export function requirementLabel(group: string[]): string {
  return group.join(' or ');
}

export type CreditState = 'under' | 'full' | 'over';

export function creditState(total: number): CreditState {
  if (total < TERM.minCredits) return 'under';
  if (total > TERM.maxCredits) return 'over';
  return 'full';
}

function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold to 75 octets per RFC 5545, never splitting a multi-byte character. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    const max = parts.length === 0 ? 75 : 74;
    if (size + bytes > max) {
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

function compactDate(iso: string): string {
  return iso.replace(/-/g, '');
}

function compactClock(clock: string): string {
  return `${clock.replace(':', '')}00`;
}

function isoWeekdayCode(iso: string): DayCode | null {
  const [y, mo, d] = iso.split('-').map(Number);
  const weekday = new Date(Date.UTC(y!, mo! - 1, d!)).getUTCDay();
  return (['', 'M', 'T', 'W', 'R', 'F', ''][weekday] || null) as DayCode | null;
}

function addDays(iso: string, days: number): string {
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, mo! - 1, d! + days)).toISOString().slice(0, 10);
}

function firstMeetingDate(days: DayCode[]): string {
  let date = TERM.firstDay;
  for (let i = 0; i < 7; i += 1) {
    const code = isoWeekdayCode(date);
    if (code && days.includes(code)) return date;
    date = addDays(date, 1);
  }
  return TERM.firstDay;
}

function utcStamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Weekly recurring events for each meeting, in floating campus time, skipping days without classes. */
export function buildIcs(entries: Entry[], now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//University of Mars//Course Planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(`UM ${TERM.name}`)}`,
  ];
  const stamp = utcStamp(now);
  const until = `${compactDate(TERM.lastDay)}T235959`;

  for (const { course, section } of entries) {
    section.meetings.forEach((meeting, index) => {
      const first = firstMeetingDate(meeting.days);
      const byDay = DAYS.filter((day) => meeting.days.includes(day.code)).map((day) => day.ics);
      const skipped = TERM.noClassDays.filter((iso) => {
        const code = isoWeekdayCode(iso);
        return code !== null && meeting.days.includes(code);
      });
      lines.push(
        'BEGIN:VEVENT',
        `UID:${course.code.replace(' ', '')}-${section.id}-${index + 1}-spring2027@planner.umars.edu`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${compactDate(first)}T${compactClock(meeting.start)}`,
        `DTEND:${compactDate(first)}T${compactClock(meeting.end)}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${byDay.join(',')};UNTIL=${until}`,
      );
      if (skipped.length) {
        lines.push(`EXDATE:${skipped.map((iso) => `${compactDate(iso)}T${compactClock(meeting.start)}`).join(',')}`);
      }
      lines.push(
        `SUMMARY:${icsEscape(`${course.code} ${meeting.kind} · ${course.title}`)}`,
        `LOCATION:${icsEscape(whereLabel(meeting))}`,
        `DESCRIPTION:${icsEscape(
          `Section ${section.id} · ${section.instructor} · ${course.credits} credits\nSample schedule from the University of Mars course planner.`,
        )}`,
        'END:VEVENT',
      );
    });
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
