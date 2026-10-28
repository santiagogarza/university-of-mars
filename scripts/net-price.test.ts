import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SCENARIO,
  decodeScenario,
  encodeScenario,
  estimate,
  type Scenario,
} from '../src/lib/net-price.ts';

const scenario = (patch: Partial<Scenario> = {}): Scenario => ({ ...DEFAULT_SCENARIO, ...patch });

test('on-campus budgets match the cost table on the financial aid page', () => {
  assert.equal(estimate(scenario({ residency: 'mars' })).coa, 13_940 + 16_480 + 1_120 + 2_640);
  assert.equal(estimate(scenario({ residency: 'earth' })).coa, 44_210 + 16_480 + 1_120 + 3_180);
  assert.equal(estimate(scenario({ residency: 'intl' })).coa, 44_210 + 16_480 + 1_120 + 3_180);
});

test('every way of paying adds up to the cost of attendance', () => {
  for (const residency of ['mars', 'earth', 'intl'] as const) {
    for (const housing of ['campus', 'off', 'family'] as const) {
      for (const income of [0, 40_000, 90_000, 160_000, 300_000]) {
        const result = estimate(scenario({ residency, housing, income }));
        const paid = result.grantTotal + result.loans + result.workStudy + result.familyPays;
        assert.equal(paid, result.coa, `${residency}/${housing}/${income}`);
        assert.equal(result.netPrice, result.coa - result.grantTotal);
        assert.ok(result.familyPays >= 0);
      }
    }
  }
});

test('net price rises with income', () => {
  const prices = [20_000, 60_000, 100_000, 140_000, 200_000].map((income) => estimate(scenario({ income })).netPrice);
  for (let i = 1; i < prices.length; i += 1) assert.ok(prices[i] >= prices[i - 1], prices.join(', '));
});

test('international students receive no public grants, loans, or work-study', () => {
  const result = estimate(scenario({ residency: 'intl', income: 20_000 }));
  assert.equal(result.grants.pog, 0);
  assert.equal(result.grants.mrag, 0);
  assert.equal(result.loans, 0);
  assert.equal(result.workStudy, 0);
  assert.ok(result.grants.ghs > 0);
});

test('living with family lowers the cost of attendance', () => {
  assert.ok(estimate(scenario({ housing: 'family' })).coa < estimate(scenario({ housing: 'campus' })).coa);
});

test('scenarios round-trip through the shareable URL format', () => {
  const original = scenario({ residency: 'earth', housing: 'off', dependency: 'independent', size: 3, income: 48_500 });
  const encoded = encodeScenario(original);
  assert.equal(encoded, 'earth-off-ind-3-48500-15000');
  assert.deepEqual(decodeScenario(encoded), original);
});

test('bad shared values are rejected or clamped', () => {
  assert.equal(decodeScenario('pluto-campus-dep-4-1-1'), null);
  assert.equal(decodeScenario('mars-campus-dep-4-abc-1'), null);
  assert.equal(decodeScenario(''), null);
  assert.equal(decodeScenario('mars-campus-dep-1-0-0')?.size, 2);
  assert.equal(decodeScenario('mars-campus-ind-99-0-0')?.size, 10);
});
