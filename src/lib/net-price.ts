/**
 * Net Price Calculator model for aid year 2026–27.
 *
 * Every figure here is fictional sample data for the University of Mars demo
 * site. The on-campus budgets add up to the cost-of-attendance table on the
 * financial aid page ($34,180 for Mars residents, $64,990 for nonresidents),
 * so the two pages agree.
 *
 * This file has no imports so `node --test` can load it directly.
 */

export type Residency = 'mars' | 'earth' | 'intl';
export type Housing = 'campus' | 'off' | 'family';
export type Dependency = 'dependent' | 'independent';

export interface Scenario {
  residency: Residency;
  housing: Housing;
  dependency: Dependency;
  size: number;
  income: number;
  assets: number;
}

export type CostKey = 'tuition' | 'fees' | 'housing' | 'meals' | 'books' | 'transport' | 'personal';
export type FundingKey = 'grants' | 'loans' | 'work' | 'family';
export type GrantKey = 'pog' | 'mrag' | 'etbs' | 'ghs' | 'rps';

export interface Estimate {
  costs: Record<CostKey, number>;
  coa: number;
  contribution: number;
  grants: Record<GrantKey, number>;
  grantTotal: number;
  workStudy: number;
  loans: number;
  familyPays: number;
  netPrice: number;
}

export const AID_YEAR = '2026–27';

export const LIMITS = {
  size: { min: 1, max: 10, dependentMin: 2 },
  income: { min: 0, max: 300_000, step: 1_000, typedMax: 2_000_000 },
  assets: { min: 0, max: 400_000, step: 1_000, typedMax: 5_000_000 },
} as const;

export const DEFAULT_SCENARIO: Scenario = {
  residency: 'mars',
  housing: 'campus',
  dependency: 'dependent',
  size: 4,
  income: 72_000,
  assets: 15_000,
};

export const RESIDENCY_OPTIONS: { value: Residency; label: string; short: string; hint: string }[] = [
  {
    value: 'mars',
    label: 'Mars resident',
    short: 'Mars resident',
    hint: 'You or your parents have lived in a Martian settlement for at least 12 months.',
  },
  {
    value: 'earth',
    label: 'Earth transfer',
    short: 'Earth transfer',
    hint: 'You are transferring credits from a college or university on Earth.',
  },
  {
    value: 'intl',
    label: 'International',
    short: 'International',
    hint: 'You hold citizenship outside the Martian Republic and will study on a student visa.',
  },
];

export const HOUSING_OPTIONS: { value: Housing; label: string; short: string; hint: string }[] = [
  {
    value: 'campus',
    label: 'On campus',
    short: 'On campus',
    hint: 'A standard double in a residence hall with the 14-meal plan.',
  },
  {
    value: 'off',
    label: 'Off campus',
    short: 'Off campus',
    hint: 'A shared apartment in Jezero, with groceries and a transit pass.',
  },
  {
    value: 'family',
    label: 'With family',
    short: 'With family',
    hint: 'At home with parents or relatives, commuting to campus.',
  },
];

export const DEPENDENCY_OPTIONS: { value: Dependency; label: string; short: string; hint: string }[] = [
  {
    value: 'dependent',
    label: 'Dependent student',
    short: 'Dependent',
    hint: 'Most students under 24. You will report your parents’ income and household.',
  },
  {
    value: 'independent',
    label: 'Independent student',
    short: 'Independent',
    hint: '24 or older, married, a veteran, or supporting a child. You will report your own household.',
  },
];

export const COST_ITEMS: { key: CostKey; label: string; color: string }[] = [
  { key: 'tuition', label: 'Tuition', color: '#6b2430' },
  { key: 'fees', label: 'Fees', color: '#b4533c' },
  { key: 'housing', label: 'Housing', color: '#1b3048' },
  { key: 'meals', label: 'Meals', color: '#4a7598' },
  { key: 'books', label: 'Books and supplies', color: '#a68556' },
  { key: 'transport', label: 'Transportation', color: '#d9a35f' },
  { key: 'personal', label: 'Personal costs', color: '#8a8178' },
];

export const FUNDING_ITEMS: { key: FundingKey; label: string; color: string; note: string }[] = [
  { key: 'grants', label: 'Grants and scholarships', color: '#2e6a4c', note: 'Free money. Not repaid.' },
  { key: 'loans', label: 'Student loans', color: '#a68556', note: 'Borrowed. Repaid with interest.' },
  { key: 'work', label: 'Work-study', color: '#4a7598', note: 'Earned through a campus job.' },
  { key: 'family', label: 'You and your family pay', color: '#6b2430', note: 'Savings, income, or a payment plan.' },
];

export const GRANT_ITEMS: { key: GrantKey; label: string; source: string }[] = [
  { key: 'pog', label: 'Planetary Opportunity Grant', source: 'Public, need-based' },
  { key: 'mrag', label: 'Mars Resident Access Grant', source: 'Martian Republic, need-based' },
  { key: 'etbs', label: 'Earth Transfer Bridge Scholarship', source: 'University, transfer award' },
  { key: 'ghs', label: 'Global Horizons Scholarship', source: 'University, international award' },
  { key: 'rps', label: 'Red Planet Scholars', source: 'University, need-based' },
];

const TUITION: Record<Residency, number> = { mars: 12_180, earth: 42_450, intl: 42_450 };
const FEES = 1_760;
const HOUSING: Record<Housing, number> = { campus: 10_320, off: 9_840, family: 3_600 };
const MEALS: Record<Housing, number> = { campus: 6_160, off: 5_480, family: 2_880 };
const BOOKS = 1_120;
const TRANSPORT_BASE: Record<Residency, number> = { mars: 980, earth: 1_520, intl: 1_520 };
const TRANSPORT_COMMUTE: Record<Housing, number> = { campus: 0, off: 640, family: 860 };
const PERSONAL: Record<Housing, number> = { campus: 1_660, off: 1_660, family: 1_240 };

const POG_MAX = 7_395;
const POG_MIN = 740;
const MRAG_MAX = 5_200;
const MRAG_FULL_BELOW = 60_000;
const MRAG_ZERO_AT = 125_000;
const ETBS = 4_000;
const GHS = 6_000;
const RPS_SHARE: Record<Residency, number> = { mars: 0.55, earth: 0.45, intl: 0.3 };
const RPS_CAP: Record<Residency, number> = { mars: 16_000, earth: 22_000, intl: 18_000 };
const WORK_STUDY_MAX = 2_800;
const LOAN: Record<Dependency, number> = { dependent: 5_500, independent: 9_500 };
const BRACKETS: [number, number][] = [
  [18_000, 0.22],
  [18_000, 0.29],
  [18_000, 0.37],
  [Infinity, 0.47],
];

const roundTen = (value: number) => Math.round(value / 10) * 10;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function normalizeScenario(input: Scenario): Scenario {
  const minSize = input.dependency === 'dependent' ? LIMITS.size.dependentMin : LIMITS.size.min;
  return {
    ...input,
    size: clamp(Math.round(input.size) || minSize, minSize, LIMITS.size.max),
    income: clamp(Math.round(input.income) || 0, 0, LIMITS.income.typedMax),
    assets: clamp(Math.round(input.assets) || 0, 0, LIMITS.assets.typedMax),
  };
}

/** A simplified, fictional need analysis. Not the federal formula. */
export function familyContribution(scenario: Scenario): number {
  const { dependency, size, income, assets } = normalizeScenario(scenario);
  const allowance = (dependency === 'dependent' ? 20_000 : 14_000) + 6_800 * (size - 1);
  const available = Math.max(0, income - allowance - income * 0.12);
  const protectedAssets = dependency === 'dependent' ? 25_000 : 10_000;
  let remaining = available + Math.max(0, assets - protectedAssets) * 0.12;
  let contribution = 0;
  for (const [width, rate] of BRACKETS) {
    const slice = Math.min(remaining, width);
    contribution += slice * rate;
    remaining -= slice;
    if (remaining <= 0) break;
  }
  return roundTen(contribution);
}

export function costOfAttendance(scenario: Scenario): Record<CostKey, number> {
  const { residency, housing } = scenario;
  return {
    tuition: TUITION[residency],
    fees: FEES,
    housing: HOUSING[housing],
    meals: MEALS[housing],
    books: BOOKS,
    transport: TRANSPORT_BASE[residency] + TRANSPORT_COMMUTE[housing],
    personal: PERSONAL[housing],
  };
}

export function estimate(input: Scenario): Estimate {
  const scenario = normalizeScenario(input);
  const { residency, dependency, income } = scenario;
  const costs = costOfAttendance(scenario);
  const coa = Object.values(costs).reduce((sum, value) => sum + value, 0);
  const contribution = familyContribution(scenario);
  const publicAid = residency !== 'intl';

  const grants: Record<GrantKey, number> = { pog: 0, mrag: 0, etbs: 0, ghs: 0, rps: 0 };

  if (publicAid) {
    const pog = POG_MAX - contribution;
    grants.pog = pog >= POG_MIN ? roundTen(pog) : 0;
  }
  if (residency === 'mars' && income < MRAG_ZERO_AT) {
    const share = income <= MRAG_FULL_BELOW ? 1 : (MRAG_ZERO_AT - income) / (MRAG_ZERO_AT - MRAG_FULL_BELOW);
    grants.mrag = roundTen(MRAG_MAX * share);
  }
  if (residency === 'earth') grants.etbs = ETBS;
  if (residency === 'intl') grants.ghs = GHS;

  const otherGrants = grants.pog + grants.mrag + grants.etbs + grants.ghs;
  const unmetNeed = Math.max(0, coa - contribution - otherGrants);
  grants.rps = roundTen(Math.min(unmetNeed * RPS_SHARE[residency], RPS_CAP[residency]));

  const grantTotal = Math.min(coa, otherGrants + grants.rps);
  const remainingNeed = Math.max(0, coa - contribution - grantTotal);
  const workStudy = publicAid ? roundTen(Math.min(WORK_STUDY_MAX, remainingNeed)) : 0;
  const loans = publicAid ? Math.min(LOAN[dependency], Math.max(0, coa - grantTotal - workStudy)) : 0;
  const familyPays = Math.max(0, coa - grantTotal - workStudy - loans);

  return {
    costs,
    coa,
    contribution,
    grants,
    grantTotal,
    workStudy,
    loans,
    familyPays,
    netPrice: coa - grantTotal,
  };
}

const RESIDENCY_CODES: Residency[] = ['mars', 'earth', 'intl'];
const HOUSING_CODES: Housing[] = ['campus', 'off', 'family'];
const DEPENDENCY_CODES: Record<string, Dependency> = { dep: 'dependent', ind: 'independent' };

/** `mars-campus-dep-4-72000-15000`: short enough to read in a shared link. */
export function encodeScenario(scenario: Scenario): string {
  const s = normalizeScenario(scenario);
  const dependency = s.dependency === 'dependent' ? 'dep' : 'ind';
  return [s.residency, s.housing, dependency, s.size, s.income, s.assets].join('-');
}

export function decodeScenario(value: string | null | undefined): Scenario | null {
  if (!value) return null;
  const parts = value.split('-');
  if (parts.length !== 6) return null;
  const [residency, housing, dependency, size, income, assets] = parts;
  if (!RESIDENCY_CODES.includes(residency as Residency)) return null;
  if (!HOUSING_CODES.includes(housing as Housing)) return null;
  if (!(dependency in DEPENDENCY_CODES)) return null;
  const numbers = [size, income, assets].map((part) => (/^\d{1,8}$/.test(part) ? Number(part) : NaN));
  if (numbers.some(Number.isNaN)) return null;
  return normalizeScenario({
    residency: residency as Residency,
    housing: housing as Housing,
    dependency: DEPENDENCY_CODES[dependency],
    size: numbers[0],
    income: numbers[1],
    assets: numbers[2],
  });
}

export function formatMoney(value: number): string {
  const sign = value < 0 ? '−' : '';
  return `${sign}$${Math.abs(Math.round(value)).toLocaleString('en-US')}`;
}
