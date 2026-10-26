import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCampusWhen } from '../src/lib/campus-time.ts';

const oct26 = new Date(2026, 9, 26, 12, 0);

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

test('the short date uses the fictional year and omits the real year', () => {
  const shown = formatCampusWhen('2026-09-08', oct26);
  assert.equal(shown, 'Nov 24');
  assert.equal(shown.includes('2026'), false);
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
