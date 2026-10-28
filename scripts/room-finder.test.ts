import assert from 'node:assert/strict';
import test from 'node:test';
import { allRooms, halls, rateCeiling, rateFloor } from '../src/data/rooms.ts';
import { defaultFilters, isFiltering, matchesFilters, roomStatus, toggleCompare } from '../src/lib/room-finder.ts';

test('status follows open beds', () => {
  assert.equal(roomStatus(1, 0), 'available');
  assert.equal(roomStatus(1, 1), 'full');
  assert.equal(roomStatus(2, 0), 'available');
  assert.equal(roomStatus(2, 1), 'limited');
  assert.equal(roomStatus(3, 1), 'available');
  assert.equal(roomStatus(3, 2), 'limited');
  assert.equal(roomStatus(3, 3), 'full');
});

test('four halls, including Isidis Hall, each with three floors', () => {
  assert.deepEqual(
    halls.map((hall) => hall.name),
    ['Olympus Mons Hall', 'Isidis Hall', 'Syrtis Court', 'Elysium Hall'],
  );
  for (const hall of halls) assert.deepEqual(hall.floors.map((floor) => floor.level), [1, 2, 3]);
});

test('room ids are unique and every status appears', () => {
  assert.equal(new Set(allRooms.map((room) => room.id)).size, allRooms.length);
  for (const status of ['available', 'limited', 'full']) {
    assert.ok(allRooms.some((room) => room.status === status), status);
  }
});

test('roommates match taken beds in shared rooms', () => {
  for (const room of allRooms) {
    assert.equal(room.roommates.length, room.beds > 1 ? room.taken : 0, room.id);
    assert.equal(room.features.length > 0, room.accessible, room.id);
  }
});

test('rooms stay inside the plan', () => {
  for (const room of allRooms) {
    assert.ok(room.x >= 30 && room.x + room.w <= 970, room.id);
    assert.ok(room.y >= 40 && room.y + room.h <= 480, room.id);
  }
});

test('default filters match every room', () => {
  const filters = defaultFilters(rateCeiling);
  assert.equal(isFiltering(filters, rateCeiling), false);
  assert.ok(allRooms.every((room) => matchesFilters(room, filters)));
  assert.ok(rateFloor <= Math.min(...allRooms.map((room) => room.rate)));
});

test('filters combine', () => {
  const filters = { ...defaultFilters(rateCeiling), accessibleOnly: true, quietFloor: true };
  assert.equal(isFiltering(filters, rateCeiling), true);
  const matched = allRooms.filter((room) => matchesFilters(room, filters));
  assert.ok(matched.length > 0);
  assert.ok(matched.every((room) => room.accessible && room.quiet));

  const cheap = allRooms.filter((room) => matchesFilters(room, { ...defaultFilters(rateCeiling), maxRate: 5000 }));
  assert.ok(cheap.length > 0 && cheap.every((room) => room.rate <= 5000));

  const suites = allRooms.filter((room) => matchesFilters(room, { ...defaultFilters(rateCeiling), type: 'Suite single' }));
  assert.ok(suites.length > 0 && suites.every((room) => room.hallId === 'isidis'));
});

test('compare keeps at most three rooms', () => {
  let list: string[] = [];
  for (const id of ['a', 'b', 'c']) list = toggleCompare(list, id).list;
  const fourth = toggleCompare(list, 'd');
  assert.equal(fourth.full, true);
  assert.deepEqual(fourth.list, ['a', 'b', 'c']);
  assert.deepEqual(toggleCompare(list, 'b').list, ['a', 'c']);
});
