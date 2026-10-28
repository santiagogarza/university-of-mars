import assert from 'node:assert/strict';
import test from 'node:test';
import {
  campusInstant,
  coordinatedMarsTime,
  diurnalTemperature,
  localSolClock,
  marsSolDate,
  marsYear,
  seasonAt,
  solarLongitude,
  stationWeather,
} from '../src/lib/mars-time.ts';
import { campuses } from '../src/data/campuses.ts';

const TT_OFFSET_MS = 69_184;

test('MSD matches the Allison & McEwen epoch', () => {
  const epochTT = new Date((2451549.5 - 2440587.5) * 86_400_000 - TT_OFFSET_MS);
  assert.ok(Math.abs(marsSolDate(epochTT) - 44795.9990374) < 1e-7);
});

test('one sol of Earth time advances the sol date by one', () => {
  const start = new Date(Date.UTC(2027, 0, 11, 12));
  const later = new Date(start.getTime() + 1.0274912517 * 86_400_000);
  assert.ok(Math.abs(marsSolDate(later) - marsSolDate(start) - 1) < 1e-6);
});

test('local time is MTC shifted by east longitude', () => {
  const when = new Date(Date.UTC(2027, 0, 11, 9, 30));
  const mtc = coordinatedMarsTime(when);
  assert.ok(Math.abs(localSolClock(when, 0).hours - mtc) < 1e-9);
  assert.ok(Math.abs(localSolClock(when, 90).hours - ((mtc + 6) % 24)) < 1e-9);
  assert.match(localSolClock(when, 77.58).label, /^\d{2}:\d{2}:\d{2}$/);
});

test('Mars Year 38 began near November 12, 2024', () => {
  const ls = solarLongitude(new Date(Date.UTC(2024, 10, 12, 12)));
  assert.ok(ls < 1 || ls > 359, `Ls was ${ls}`);
  assert.equal(marsYear(new Date(Date.UTC(2024, 11, 1))), 38);
});

test('the campus day falls in northern spring of Mars Year 39', () => {
  const day = campusInstant(new Date(2026, 9, 28, 15, 45, 10));
  assert.equal(day.getFullYear(), 2027);
  assert.equal(day.getMonth(), 0);
  assert.equal(day.getDate(), 11);
  assert.equal(day.getHours(), 15);
  assert.equal(marsYear(day), 39);
  assert.equal(seasonAt(day, 18.4), 'Northern spring');
  assert.equal(seasonAt(day, -5.4), 'Southern autumn');
});

test('the diurnal curve hits the low at dawn and the high mid-afternoon', () => {
  assert.equal(diurnalTemperature(5.5, -80, -20), -80);
  assert.equal(diurnalTemperature(14, -80, -20), -20);
  const evening = diurnalTemperature(20, -80, -20);
  assert.ok(evening < -20 && evening > -80);
});

test('station weather is repeatable and stays inside the day range', () => {
  for (const campus of campuses) {
    const clock = localSolClock(new Date(Date.UTC(2027, 0, 11, 18)), campus.lon);
    const a = stationWeather(campus.id, campus.weather, clock);
    const b = stationWeather(campus.id, campus.weather, clock);
    assert.deepEqual(a, b);
    assert.ok(a.nowC >= a.lowC && a.nowC <= a.highC, `${campus.id} ${a.nowC}`);
    assert.ok(a.pressurePa > 0 && a.windKph > 0);
  }
});
