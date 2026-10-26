import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCampusReceived, formatCampusWhen } from '../src/lib/campus-time.ts';
import seed from '../services/seed-data.json' with { type: 'json' };

const oct26 = new Date(2026, 9, 26, 12, 0);
const oct25 = new Date(2026, 9, 25, 17, 48);
const oct28 = new Date(2026, 9, 28, 12, 0);

const CASE_LABELS: Record<string, string> = {
  'TIX-2026-0039': 'Sep 8',
  'TIX-2026-0040': 'Nov 2',
  'TIX-2026-0041': 'Dec 14',
};

test('today keeps the clock time', () => {
  assert.equal(formatCampusWhen(new Date(2026, 9, 26, 17, 18), oct26), 'Today, 5:18 PM');
});

test('yesterday keeps the clock time', () => {
  assert.equal(formatCampusWhen(new Date(2026, 9, 25, 9, 2), oct26), 'Yesterday, 9:02 AM');
});

test('older days land on the January 2027 campus calendar', () => {
  assert.equal(formatCampusWhen(new Date(2026, 9, 23, 10, 30), oct26), 'Jan 8');
  assert.equal(formatCampusWhen(new Date(2026, 9, 19, 9, 12), oct26), 'Jan 4');
  assert.equal(formatCampusWhen('2026-10-23', oct26), 'Jan 8');
});

test('a date-only value does not shift across midnight UTC', () => {
  assert.equal(formatCampusWhen('2026-10-26', oct26), 'Today');
  assert.equal(formatCampusWhen('2026-10-25', oct26), 'Yesterday');
});

test('a shifted short date omits the year', () => {
  const shown = formatCampusWhen('2026-10-23', oct26);
  assert.equal(shown, 'Jan 8');
  assert.equal(shown.includes('2026'), false);
  assert.equal(shown.includes('2027'), false);
});

test('when the real day is already January 11, older dates stay put', () => {
  const campusToday = new Date(2027, 0, 11, 15, 0);
  assert.equal(formatCampusWhen(new Date(2027, 0, 11, 17, 18), campusToday), 'Today, 5:18 PM');
  assert.equal(formatCampusWhen(new Date(2027, 0, 8, 9, 0), campusToday), 'Jan 8');
});

test('daylight saving does not change the calendar-day count', () => {
  const now = new Date(2026, 2, 15, 12, 0);
  assert.equal(formatCampusWhen(new Date(2026, 2, 7, 12, 0), now), 'Jan 3');
});

test('invalid values render as nothing', () => {
  assert.equal(formatCampusWhen(''), '');
  assert.equal(formatCampusWhen('not-a-date'), '');
  assert.equal(formatCampusWhen(null), '');
  assert.equal(formatCampusWhen(new Date(NaN)), '');
});

test('seeded Title IX received dates stay on their campus days', () => {
  for (const now of [oct25, oct26, oct28]) {
    const labels = seed.cases.map((item) => formatCampusWhen(item.dateReceived, now));
    assert.deepEqual(labels, ['Sep 8', 'Nov 2', 'Dec 14']);
    for (const item of seed.cases) {
      assert.equal(formatCampusWhen(item.dateReceived, now), CASE_LABELS[item.caseNumber]);
      assert.equal(formatCampusReceived(item.dateReceived, item.createdAt, now), CASE_LABELS[item.caseNumber]);
      assert.equal(item.caseNumber.startsWith('TIX-2026-'), true);
    }
  }
});

test('those campus days stay in received order and on or before January 11', () => {
  const labels = seed.cases.map((item) => formatCampusWhen(item.dateReceived, oct25));
  assert.deepEqual(
    labels.map(campusInstant),
    [Date.UTC(2026, 8, 8), Date.UTC(2026, 10, 2), Date.UTC(2026, 11, 14)],
  );
  for (const label of labels) {
    assert.ok(onOrBeforeCampusToday(label), label);
  }
});

test('UMS0412207, created six days ago, shows Jan 5', () => {
  const ticket = seed.tickets.find((item) => item.id === 'UMS0412207');
  assert.ok(ticket);
  const created = new Date(ticket.createdAt);
  const sixDaysLater = new Date(created);
  sixDaysLater.setDate(sixDaysLater.getDate() + 6);
  assert.equal(formatCampusWhen(ticket.createdAt, sixDaysLater), 'Jan 5');
  assert.equal(formatCampusWhen(new Date(2026, 9, 19, 9, 12), oct25), 'Jan 5');
});

test('the October ticket cluster still maps on October 28', () => {
  assert.equal(formatCampusWhen(new Date(2026, 9, 19, 9, 12), oct28), 'Jan 2');
  assert.equal(formatCampusWhen(new Date(2026, 9, 26, 10, 9), oct28), 'Jan 9');
  for (const ticket of seed.tickets) {
    const label = formatCampusWhen(ticket.createdAt, oct28);
    assert.ok(onOrBeforeCampusToday(label), `${ticket.id} ${label}`);
  }
});

test('a day after the viewer is not slid past January 11', () => {
  assert.equal(formatCampusWhen(new Date(2026, 9, 27, 9, 0), oct26), 'Oct 27');
  assert.equal(formatCampusWhen('2026-11-02', oct28), 'Nov 2');
  assert.equal(formatCampusWhen('2026-12-14', oct28), 'Dec 14');
});

test('a ticket or case filed on stage shows today with the clock', () => {
  const filed = new Date(2026, 9, 28, 17, 18);
  assert.equal(formatCampusWhen(filed, oct28), 'Today, 5:18 PM');
  assert.equal(formatCampusReceived('2026-10-28', filed, oct28), 'Today, 5:18 PM');
  assert.equal(formatCampusReceived('2026-10-28', filed.toISOString(), oct28), 'Today, 5:18 PM');
});

test('a case filed yesterday keeps yesterday and the clock', () => {
  const filed = new Date(2026, 9, 27, 9, 2);
  assert.equal(formatCampusReceived('2026-10-27', filed, oct28), 'Yesterday, 9:02 AM');
});

const MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

function onOrBeforeCampusToday(label: string): boolean {
  if (label.startsWith('Today') || label.startsWith('Yesterday')) return true;
  return campusInstant(label) <= Date.UTC(2027, 0, 11);
}

function campusInstant(label: string): number {
  const [monthName, dayText] = label.split(' ');
  const month = MONTHS[monthName];
  assert.equal(typeof month, 'number', label);
  const day = Number(dayText);
  const year = month < 8 ? 2027 : 2026;
  return Date.UTC(year, month, day);
}
