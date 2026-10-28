import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STEPS,
  countWords,
  emptyActivity,
  emptyCourse,
  emptySchool,
  emptyScore,
  emptyState,
  essayMessage,
  essayTone,
  incompleteSteps,
  newApplicationId,
  parseState,
  savedLabel,
  validateAbout,
  validateAcademics,
  validateActivities,
  validateContact,
  validateEssay,
  validateMajor,
  validateTests,
} from '../src/scripts/apply/model.ts';

const ids = (errors: { id: string }[]) => errors.map((e) => e.id);

function filled() {
  const state = emptyState();
  const d = state.data;
  Object.assign(d.about, { firstName: 'Talia', lastName: 'Brightwater', birthDate: '2005-04-18', citizenship: 'Citizen' });
  Object.assign(d.contact, {
    email: 'talia@example.com',
    phone: '(628) 555-0123',
    street: '18 Ridge Lane',
    city: 'Port Hellas',
    postal: '44120',
    country: 'Mars',
  });
  const college = { ...emptySchool('community-college'), name: 'Hellas Basin Community College', city: 'Port Hellas', start: '2025-08', current: true };
  college.courses.push({ ...emptyCourse(), title: 'GEOL 101', grade: 'A' });
  d.schools.push(college);
  d.major.first = 'geology';
  d.essay.prompt = 'place';
  d.essay.text = Array.from({ length: 300 }, (_, i) => `word${i}`).join(' ');
  d.activities.push({ ...emptyActivity(), type: 'Research', role: 'Lab assistant', org: 'Basin Labs', desc: 'Sorted cores.', hours: '8', weeks: '30' });
  return state;
}

test('word count ignores extra spaces and stray punctuation', () => {
  assert.equal(countWords(''), 0);
  assert.equal(countWords('   '), 0);
  assert.equal(countWords('Red  dust,\nblue sunsets — always.'), 5);
  assert.equal(countWords("Jezero's delta is 3.5 billion years old"), 7);
});

test('essay tone moves from short to good to near to over', () => {
  assert.equal(essayTone(0), 'empty');
  assert.equal(essayTone(249), 'short');
  assert.equal(essayTone(250), 'good');
  assert.equal(essayTone(585), 'good');
  assert.equal(essayTone(586), 'near');
  assert.equal(essayTone(650), 'near');
  assert.equal(essayTone(651), 'over');
  assert.match(essayMessage(651), /1 over the 650-word limit/);
  assert.match(essayMessage(200), /50 more to reach 250/);
});

test('a complete application has no incomplete steps', () => {
  const state = filled();
  assert.deepEqual(incompleteSteps(state.data), []);
});

test('about you needs a name, a real birth date, and citizenship', () => {
  const state = emptyState();
  assert.deepEqual(ids(validateAbout(state.data)), ['first-name', 'last-name', 'birth-date', 'citizenship']);
  state.data.about.birthDate = '2005-02-30';
  assert.match(validateAbout(state.data).find((e) => e.id === 'birth-date')!.message, /real date/);
  state.data.about.applicantType = 'first-year';
  assert.ok(ids(validateAbout(state.data)).includes('type-transfer'));
});

test('contact checks email and phone shape', () => {
  const state = filled();
  state.data.contact.email = 'talia@example';
  state.data.contact.phone = '555-01';
  assert.deepEqual(ids(validateContact(state.data)), ['email', 'phone']);
});

test('transfer applicants list a college and finished schools need an end month', () => {
  const state = filled();
  state.data.schools = [];
  assert.deepEqual(ids(validateAcademics(state.data)), ['add-school']);
  const hs = { ...emptySchool('high-school'), name: 'Gale Crater Secondary', city: 'Gale', start: '2021-08', end: '2021-06' };
  state.data.schools.push(hs);
  const errors = ids(validateAcademics(state.data));
  assert.ok(errors.includes(`school-${hs.id}-type`));
  assert.ok(errors.includes(`school-${hs.id}-end`));
});

test('a course row needs a title and a grade', () => {
  const state = filled();
  const course = emptyCourse();
  state.data.schools[0].courses.push(course);
  assert.deepEqual(ids(validateAcademics(state.data)), [`course-${course.id}-title`, `course-${course.id}-grade`]);
});

test('test scores are skipped when test-optional and range-checked otherwise', () => {
  const state = filled();
  assert.deepEqual(validateTests(state.data), []);
  state.data.tests.optional = false;
  assert.deepEqual(ids(validateTests(state.data)), ['add-score']);
  const score = { ...emptyScore(), test: 'sat', value: '1605', date: '2024-10' };
  state.data.tests.scores.push(score);
  assert.deepEqual(ids(validateTests(state.data)), [`score-${score.id}-value`]);
  score.value = '1410';
  assert.deepEqual(validateTests(state.data), []);
  score.test = 'ap';
  score.value = '5';
  assert.deepEqual(ids(validateTests(state.data)), [`score-${score.id}-subject`]);
});

test('major needs a first choice and a distinct second choice', () => {
  const state = filled();
  state.data.major = { first: '', second: '' };
  assert.equal(validateMajor(state.data).length, 1);
  state.data.major = { first: 'geology', second: 'geology' };
  assert.equal(validateMajor(state.data).length, 1);
  state.data.major = { first: 'geology', second: 'physics' };
  assert.deepEqual(validateMajor(state.data), []);
});

test('essay must be between 250 and 650 words', () => {
  const state = filled();
  state.data.essay.text = 'Too short.';
  assert.match(validateEssay(state.data)[0].message, /at least 250/);
  state.data.essay.text = Array.from({ length: 651 }, () => 'dust').join(' ');
  assert.match(validateEssay(state.data)[0].message, /650 words/);
});

test('activities check hours, weeks, and description length', () => {
  const state = filled();
  const a = state.data.activities[0];
  a.hours = '0';
  a.weeks = '53';
  a.desc = 'x'.repeat(151);
  assert.deepEqual(ids(validateActivities(state.data)), [`activity-${a.id}-desc`, `activity-${a.id}-hours`, `activity-${a.id}-weeks`]);
});

test('parseState keeps known fields and drops junk', () => {
  const state = filled();
  state.step = 4;
  state.furthest = 3;
  const round = parseState(JSON.parse(JSON.stringify(state)));
  assert.ok(round);
  assert.equal(round.step, 3);
  assert.equal(round.data.schools[0].courses[0].title, 'GEOL 101');
  assert.equal(parseState({ version: 2 }), null);
  const junk = parseState({ version: 1, step: 99, furthest: 99, data: { about: { firstName: 7 }, schools: 'nope' } });
  assert.ok(junk);
  assert.equal(junk.furthest, STEPS.length - 1);
  assert.equal(junk.data.about.firstName, '');
  assert.deepEqual(junk.data.schools, []);
});

test('application IDs and saved labels', () => {
  assert.equal(newApplicationId(() => 0), 'UMA-2027-10000');
  assert.match(newApplicationId(), /^UMA-2027-\d{5}$/);
  const now = new Date('2027-01-11T15:00:00Z');
  assert.equal(savedLabel(null, now), 'Not saved yet');
  assert.equal(savedLabel('2027-01-11T14:59:50Z', now), 'Saved just now');
  assert.equal(savedLabel('2027-01-11T14:59:00Z', now), 'Saved 1 minute ago');
  assert.equal(savedLabel('2027-01-11T14:55:00Z', now), 'Saved 5 minutes ago');
});
