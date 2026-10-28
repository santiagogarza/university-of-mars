import assert from 'node:assert/strict';
import test from 'node:test';
import { campusEvents, campusLocations, eventCategories, EVENTS_RANGE, CAMPUS_TODAY } from '../src/data/events.ts';
import {
  addMonths,
  buildIcs,
  eventDays,
  foldIcsLine,
  formatLongDate,
  formatTimeRange,
  formatWeekRange,
  isIsoDay,
  minutesOf,
  startOfWeek,
} from '../src/lib/events.ts';

test('campus today is Monday, January 11, 2027', () => {
  assert.equal(formatLongDate(CAMPUS_TODAY), 'Monday, January 11, 2027');
  assert.equal(startOfWeek(CAMPUS_TODAY), '2027-01-10');
});

test('every event is valid sample data inside January through March 2027', () => {
  assert.ok(campusEvents.length >= 45, `expected about fifty events, found ${campusEvents.length}`);
  const ids = new Set<string>();
  const locations = new Set(campusLocations.map((location) => location.id));
  const categories = new Set(eventCategories.map((category) => category.id));
  for (const event of campusEvents) {
    assert.ok(!ids.has(event.id), `duplicate id ${event.id}`);
    ids.add(event.id);
    assert.match(event.id, /^[a-z0-9-]+$/);
    assert.ok(isIsoDay(event.date), `${event.id} date`);
    assert.ok(event.date >= EVENTS_RANGE.first && event.date <= EVENTS_RANGE.last, `${event.id} is out of range`);
    if (event.endDate) {
      assert.ok(isIsoDay(event.endDate) && event.endDate > event.date, `${event.id} endDate`);
      assert.ok(event.endDate <= EVENTS_RANGE.last, `${event.id} ends out of range`);
    }
    assert.ok(locations.has(event.location), `${event.id} location ${event.location}`);
    assert.ok(categories.has(event.category), `${event.id} category`);
    assert.equal(Boolean(event.start), Boolean(event.end), `${event.id} needs both start and end`);
    if (event.start && event.end) {
      assert.ok(minutesOf(event.end) > minutesOf(event.start), `${event.id} ends before it starts`);
      assert.ok(minutesOf(event.start) >= 8 * 60 && minutesOf(event.end) <= 22 * 60, `${event.id} is outside 8 a.m.–10 p.m.`);
    }
    assert.ok(event.description.length > 20, `${event.id} description`);
  }
  for (const category of eventCategories) {
    assert.ok(
      campusEvents.some((event) => event.category === category.id),
      `no events in ${category.id}`,
    );
  }
});

test('the event data does not hand-copy the seeded add/drop date', () => {
  const text = JSON.stringify(campusEvents);
  assert.ok(!text.includes('Friday, January 15, 2027'));
  assert.ok(!text.includes('Verification Worksheet'));
});

test('times read like the rest of the site', () => {
  assert.equal(formatTimeRange('16:00', '17:30'), '4–5:30 p.m.');
  assert.equal(formatTimeRange('10:00', '14:00'), '10 a.m.–2 p.m.');
  assert.equal(formatTimeRange('12:00', '13:00'), 'noon–1 p.m.');
  assert.equal(formatTimeRange('12:15', '13:00'), '12:15–1 p.m.');
  assert.equal(formatTimeRange(), 'All day');
});

test('date math stays on civil days', () => {
  assert.equal(addMonths('2027-01-31', 1), '2027-02-28');
  assert.equal(formatWeekRange('2027-01-10'), 'January 10 – 16, 2027');
  assert.equal(formatWeekRange('2027-01-31'), 'January 31 – February 6, 2027');
  assert.equal(formatWeekRange('2026-12-27'), 'December 27, 2026 – January 2, 2027');
  assert.deepEqual(eventDays({ date: '2027-03-22', endDate: '2027-03-26' }), [
    '2027-03-22',
    '2027-03-23',
    '2027-03-24',
    '2027-03-25',
    '2027-03-26',
  ]);
  assert.equal(isIsoDay('2027-02-30'), false);
});

test('buildIcs writes a valid timed and all-day calendar', () => {
  const ics = buildIcs(
    [
      {
        uid: 'provost-lecture@events.umars.edu',
        title: 'Spring Provost’s Lecture: Water, Ice; Rock',
        description: 'Line one\nLine two',
        location: 'Tharsis Lecture Hall, Room 101',
        category: 'Lectures',
        url: 'https://example.test/events/?event=provost-lecture',
        date: '2027-01-11',
        start: '16:00',
        end: '17:30',
      },
      {
        uid: 'spring-recess@events.umars.edu',
        title: 'Spring recess',
        description: 'Classes do not meet.',
        location: 'Main Quad',
        category: 'Deadlines',
        url: 'https://example.test/events/?event=spring-recess',
        date: '2027-03-22',
        endDate: '2027-03-26',
      },
    ],
    { stamp: new Date(Date.UTC(2027, 0, 11, 9, 30)) },
  );
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(ics.includes('DTSTAMP:20270111T093000Z'));
  assert.ok(ics.includes('DTSTART:20270111T160000\r\nDTEND:20270111T173000'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20270322\r\nDTEND;VALUE=DATE:20270327'));
  assert.ok(ics.includes('SUMMARY:Spring Provost’s Lecture: Water\\, Ice\\; Rock'));
  assert.ok(ics.includes('DESCRIPTION:Line one\\nLine two'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 2);
  const encoder = new TextEncoder();
  for (const line of ics.split('\r\n')) assert.ok(encoder.encode(line).length <= 75, `line too long: ${line}`);
});

test('foldIcsLine keeps multibyte characters whole', () => {
  const folded = foldIcsLine(`DESCRIPTION:${'é'.repeat(80)}`);
  const encoder = new TextEncoder();
  for (const line of folded.split('\r\n')) assert.ok(encoder.encode(line).length <= 75);
  assert.equal(folded.replace(/\r\n /g, ''), `DESCRIPTION:${'é'.repeat(80)}`);
});
