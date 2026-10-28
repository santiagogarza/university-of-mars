import assert from 'node:assert/strict';
import test from 'node:test';
import { COURSES, SAMPLE_RECORD } from '../src/data/courses.ts';
import {
  buildIcs,
  checkPrereqs,
  creditState,
  describeConflict,
  findConflicts,
  groupConflicts,
  formatRange,
  generateSchedules,
  scheduleStats,
  sectionMatches,
  sortSchedules,
} from '../src/lib/planner.ts';

function course(code: string) {
  const found = COURSES.find((item) => item.code === code);
  assert.ok(found, `${code} is in the catalog`);
  return found;
}

function section(code: string, id: string) {
  const found = course(code).sections.find((item) => item.id === id);
  assert.ok(found, `${code} section ${id} exists`);
  return found;
}

test('catalog has about sixty unique courses with valid meetings', () => {
  assert.ok(COURSES.length >= 55 && COURSES.length <= 65, `${COURSES.length} courses`);
  assert.equal(new Set(COURSES.map((item) => item.code)).size, COURSES.length);
  for (const item of COURSES) {
    assert.ok(item.sections.length > 0, `${item.code} has a section`);
    for (const sec of item.sections) {
      for (const meeting of sec.meetings) {
        assert.ok(meeting.start < meeting.end, `${item.code} ${sec.id} starts before it ends`);
        assert.ok(meeting.start >= '08:00' && meeting.end <= '21:00', `${item.code} ${sec.id} fits the grid`);
      }
    }
  }
});

test('every prerequisite names a course in the catalog or on the sample record', () => {
  const known = new Set([...COURSES.map((item) => item.code), ...SAMPLE_RECORD]);
  for (const item of COURSES) {
    for (const group of item.prereqs) {
      for (const code of group) assert.ok(known.has(code), `${item.code} prerequisite ${code}`);
    }
  }
});

test('formats a meeting range without repeating the period', () => {
  assert.equal(formatRange(9 * 60 + 30, 10 * 60 + 45), '9:30–10:45 AM');
  assert.equal(formatRange(11 * 60, 12 * 60 + 15), '11:00 AM–12:15 PM');
});

test('a Tuesday lab and a Tuesday lecture overlap with the shared minutes', () => {
  const conflicts = findConflicts([
    { course: course('BIOL 210'), section: section('BIOL 210', '001') },
    { course: course('MATH 221'), section: section('MATH 221', '002') },
  ]);
  assert.equal(conflicts.length, 1);
  const [conflict] = conflicts;
  assert.equal(conflict?.day, 'T');
  assert.equal(conflict?.start, 14 * 60);
  assert.equal(conflict?.end, 15 * 60 + 15);
});

test('a clash on three weekdays is explained once', () => {
  const groups = groupConflicts(
    findConflicts([
      { course: course('MATH 221'), section: section('MATH 221', '001') },
      { course: course('BIOL 110'), section: section('BIOL 110', '001') },
    ]),
  );
  assert.equal(groups.length, 1);
  assert.equal(
    describeConflict(groups[0]!),
    'MATH 221 lecture (9:00–9:50 AM) and BIOL 110 lecture (9:00–9:50 AM) overlap for 50 minutes on Monday, Wednesday, and Friday.',
  );
});

test('generates only conflict-free combinations and keeps input order', () => {
  const picked = [course('BIOL 210'), course('MATH 221'), course('CHEM 112')];
  const { schedules, blockers } = generateSchedules(picked);
  assert.ok(schedules.length > 0);
  assert.deepEqual(blockers, []);
  for (const sections of schedules) {
    sections.forEach((sec, index) => assert.ok(picked[index]!.sections.includes(sec)));
    const entries = sections.map((sec, index) => ({ course: picked[index]!, section: sec }));
    assert.deepEqual(findConflicts(entries), []);
  }
  const total = picked.reduce((product, item) => product * item.sections.length, 1);
  assert.ok(schedules.length < total, 'some combinations were rejected');
});

test('explains when two single-section courses always collide', () => {
  const { schedules, blockers } = generateSchedules([course('PHYS 252'), course('BIOL 330')]);
  assert.equal(schedules.length, 0);
  assert.match(blockers[0] ?? '', /PHYS 252.*BIOL 330/);
});

test('open-only skips full sections', () => {
  const { schedules } = generateSchedules([course('BIOL 225')], { openOnly: true });
  assert.deepEqual(
    schedules.map(([sec]) => sec?.id),
    ['001'],
  );
});

test('sorting by fewest days puts the most compact week first', () => {
  const picked = [course('ECON 102'), course('MATH 240')];
  const { schedules } = generateSchedules(picked);
  const days = sortSchedules(picked, schedules, 'days').map(
    (sections) => scheduleStats(sections.map((sec, index) => ({ course: picked[index]!, section: sec }))).daysOnCampus,
  );
  assert.deepEqual(days, [3, 4, 5]);
});

test('prerequisites count only completed courses', () => {
  const completed = new Set(SAMPLE_RECORD);
  const check = checkPrereqs(course('PHYS 252'), completed, new Set(['MATH 221']));
  assert.deepEqual(check.missing, [['PHYS 152'], ['MATH 221']]);
  assert.deepEqual(check.plannedOnly, [['MATH 221']]);
  assert.deepEqual(checkPrereqs(course('BIOL 412'), new Set(['BIOL 225']), new Set()).missing, []);
});

test('credit range is 12 to 18', () => {
  assert.equal(creditState(11), 'under');
  assert.equal(creditState(12), 'full');
  assert.equal(creditState(18), 'full');
  assert.equal(creditState(19), 'over');
});

test('day and period filters apply to every meeting of a section', () => {
  const lab = section('BIOL 210', '001');
  assert.equal(sectionMatches(lab, { days: new Set(['M', 'W', 'F']) }), false);
  assert.equal(sectionMatches(lab, { periods: new Set(['morning', 'afternoon']) }), true);
  assert.equal(sectionMatches(section('BIOL 225', '002'), { openOnly: true }), false);
});

test('ics export repeats weekly through April 30 and skips holidays', () => {
  const ics = buildIcs(
    [{ course: course('MATH 121'), section: section('MATH 121', '001') }],
    new Date(Date.UTC(2027, 0, 11, 15, 0, 0)),
  );
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20270104T080000/);
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20270430T235959/);
  assert.match(ics, /EXDATE:20270215T080000,20270322T080000,20270324T080000,20270326T080000/);
  assert.match(ics, /DTSTART:20270107T080000/, 'Thursday discussion starts on the first Thursday');
  assert.match(ics, /DTSTAMP:20270111T150000Z/);
  assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, 2);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
});
