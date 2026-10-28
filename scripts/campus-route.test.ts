import assert from 'node:assert/strict';
import test from 'node:test';
import { allPlaces, places, walkEdges, walkNodes } from '../src/data/campus-map.ts';
import { buildGraph, findRoute, hasStepFreeDoor, placeMatches, walkingMinutes } from '../src/lib/campus-route.ts';

const graph = buildGraph(walkNodes, walkEdges);
const byId = new Map(allPlaces.map((place) => [place.id, place]));
const get = (id: string) => {
  const place = byId.get(id);
  assert.ok(place, `missing place ${id}`);
  return place;
};

test('place ids are unique and every entrance opens onto a walk node', () => {
  assert.equal(byId.size, allPlaces.length);
  const nodeIds = new Set(walkNodes.map((node) => node.id));
  for (const place of allPlaces) {
    assert.ok(place.entrances.length > 0, `${place.id} has no entrance`);
    for (const entrance of place.entrances) {
      assert.ok(nodeIds.has(entrance.node), `${place.id} entrance ${entrance.label} names ${entrance.node}`);
    }
  }
});

test('every building can reach every other building', () => {
  for (const a of places) {
    for (const b of places) {
      if (a.id === b.id) continue;
      assert.ok(findRoute(graph, a, b), `${a.id} → ${b.id}`);
    }
  }
});

test('a step-free route never uses steps between buildings with step-free doors', () => {
  const accessible = places.filter(hasStepFreeDoor);
  for (const a of accessible) {
    for (const b of accessible) {
      if (a.id === b.id) continue;
      const route = findRoute(graph, a, b, { stepFree: true });
      assert.ok(route, `${a.id} → ${b.id}`);
      assert.equal(route.usesStairs, false, `${a.id} → ${b.id} uses steps`);
    }
  }
});

test('the quad diagonal is shorter, and the step-free route goes around it', () => {
  const direct = findRoute(graph, get('chryse'), get('clock-tower'));
  const stepFree = findRoute(graph, get('chryse'), get('clock-tower'), { stepFree: true });
  assert.ok(direct && stepFree);
  assert.ok(direct.steps.some((step) => step.text.includes('diagonal walk')));
  assert.ok(!stepFree.steps.some((step) => step.text.includes('diagonal walk')));
  assert.ok(stepFree.meters > direct.meters);
});

test('library to Isidis Hall is a short walk with named steps', () => {
  const route = findRoute(graph, get('library'), get('isidis'));
  assert.ok(route);
  assert.ok(route.minutes >= 2 && route.minutes <= 5, `${route.minutes} minutes`);
  assert.match(route.steps[0]?.text ?? '', /^Leave University Library by the /);
  assert.match(route.steps.at(-1)?.text ?? '', /^Arrive at Isidis Hall, west entrance$/);
});

test('walking time rounds to whole minutes and is never zero', () => {
  assert.equal(walkingMinutes(10), 1);
  assert.equal(walkingMinutes(400), 5);
  assert.equal(walkingMinutes(1000, 80), 13);
});

test('search matches names, departments, and keywords', () => {
  assert.ok(placeMatches(get('enrollment'), 'registrar'));
  assert.ok(placeMatches(get('union'), 'coffee'));
  assert.ok(placeMatches(get('observatory'), 'jezero observ'));
  assert.ok(!placeMatches(get('library'), 'pool'));
});
