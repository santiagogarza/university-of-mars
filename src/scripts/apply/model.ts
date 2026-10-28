import {
  activityDescriptionLimit,
  activityLimit,
  applyDates,
  essayLimit,
  essayMinimum,
  essayPrompts,
  programs,
  testTypes,
} from '../../data/admissions.ts';

export const DRAFT_KEY = 'um-apply-fall-2027';

export const STEPS = [
  { id: 'about', label: 'About you' },
  { id: 'contact', label: 'Contact' },
  { id: 'academics', label: 'Academic history' },
  { id: 'tests', label: 'Test scores' },
  { id: 'major', label: 'Intended major' },
  { id: 'essay', label: 'Essay' },
  { id: 'activities', label: 'Activities' },
  { id: 'review', label: 'Review & submit' },
] as const;

export type StepId = (typeof STEPS)[number]['id'];

export type Course = { id: string; title: string; term: string; grade: string };

export type School = {
  id: string;
  type: string;
  name: string;
  city: string;
  start: string;
  end: string;
  current: boolean;
  gpa: string;
  courses: Course[];
};

export type Score = { id: string; test: string; subject: string; value: string; date: string };

export type Activity = {
  id: string;
  type: string;
  role: string;
  org: string;
  desc: string;
  hours: string;
  weeks: string;
};

export type ApplicationData = {
  about: {
    applicantType: string;
    firstName: string;
    lastName: string;
    preferredName: string;
    pronouns: string;
    birthDate: string;
    citizenship: string;
    firstGen: string;
  };
  contact: {
    email: string;
    phone: string;
    street: string;
    city: string;
    region: string;
    postal: string;
    country: string;
    contactPref: string;
  };
  schools: School[];
  tests: { optional: boolean; scores: Score[] };
  major: { first: string; second: string };
  essay: { prompt: string; text: string };
  activities: Activity[];
  review: { certify: boolean };
};

export type AppState = {
  version: 1;
  step: number;
  furthest: number;
  savedAt: string | null;
  data: ApplicationData;
  submitted: { id: string; at: string } | null;
};

export type FieldError = { id: string; message: string };

export function uid(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function emptySchool(type = ''): School {
  return { id: uid(), type, name: '', city: '', start: '', end: '', current: false, gpa: '', courses: [] };
}

export function emptyCourse(): Course {
  return { id: uid(), title: '', term: '', grade: '' };
}

export function emptyScore(): Score {
  return { id: uid(), test: '', subject: '', value: '', date: '' };
}

export function emptyActivity(): Activity {
  return { id: uid(), type: '', role: '', org: '', desc: '', hours: '', weeks: '' };
}

export function emptyState(): AppState {
  return {
    version: 1,
    step: 0,
    furthest: 0,
    savedAt: null,
    submitted: null,
    data: {
      about: {
        applicantType: 'transfer',
        firstName: '',
        lastName: '',
        preferredName: '',
        pronouns: '',
        birthDate: '',
        citizenship: '',
        firstGen: '',
      },
      contact: {
        email: '',
        phone: '',
        street: '',
        city: '',
        region: '',
        postal: '',
        country: '',
        contactPref: 'email',
      },
      schools: [],
      tests: { optional: true, scores: [] },
      major: { first: '', second: '' },
      essay: { prompt: '', text: '' },
      activities: [],
      review: { certify: false },
    },
  };
}

const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const list = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.map(obj) : []);

/** Rebuild a draft from storage, keeping only known fields of the right type. */
export function parseState(raw: unknown): AppState | null {
  const source = obj(raw);
  if (source.version !== 1) return null;
  const base = emptyState();
  const data = obj(source.data);
  const about = obj(data.about);
  const contact = obj(data.contact);
  const tests = obj(data.tests);
  const major = obj(data.major);
  const essay = obj(data.essay);
  const review = obj(data.review);
  const pick = <T extends Record<string, string>>(defaults: T, from: Record<string, unknown>): T => {
    const out = { ...defaults };
    for (const key of Object.keys(defaults) as (keyof T)[]) out[key] = str(from[key as string], defaults[key]) as T[keyof T];
    return out;
  };
  const submitted = obj(source.submitted);
  const last = STEPS.length - 1;
  const clampStep = (value: unknown) =>
    typeof value === 'number' && Number.isInteger(value) ? Math.min(Math.max(value, 0), last) : 0;
  const furthest = clampStep(source.furthest);
  return {
    version: 1,
    step: Math.min(clampStep(source.step), furthest),
    furthest,
    savedAt: typeof source.savedAt === 'string' ? source.savedAt : null,
    submitted:
      typeof submitted.id === 'string' && typeof submitted.at === 'string'
        ? { id: submitted.id, at: submitted.at }
        : null,
    data: {
      about: pick(base.data.about, about),
      contact: pick(base.data.contact, contact),
      schools: list(data.schools).map((school) => ({
        id: str(school.id) || uid(),
        type: str(school.type),
        name: str(school.name),
        city: str(school.city),
        start: str(school.start),
        end: str(school.end),
        current: school.current === true,
        gpa: str(school.gpa),
        courses: list(school.courses).map((course) => ({
          id: str(course.id) || uid(),
          title: str(course.title),
          term: str(course.term),
          grade: str(course.grade),
        })),
      })),
      tests: {
        optional: tests.optional !== false,
        scores: list(tests.scores).map((score) => ({
          id: str(score.id) || uid(),
          test: str(score.test),
          subject: str(score.subject),
          value: str(score.value),
          date: str(score.date),
        })),
      },
      major: pick(base.data.major, major),
      essay: pick(base.data.essay, essay),
      activities: list(data.activities)
        .slice(0, activityLimit)
        .map((activity) => ({
          id: str(activity.id) || uid(),
          type: str(activity.type),
          role: str(activity.role),
          org: str(activity.org),
          desc: str(activity.desc),
          hours: str(activity.hours),
          weeks: str(activity.weeks),
        })),
      review: { certify: review.certify === true },
    },
  };
}

export function countWords(text: string): number {
  const words = text.trim().split(/\s+/);
  return words.filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

export type EssayTone = 'empty' | 'short' | 'good' | 'near' | 'over';

export function essayTone(words: number): EssayTone {
  if (words === 0) return 'empty';
  if (words < essayMinimum) return 'short';
  if (words > essayLimit) return 'over';
  if (words > essayLimit * 0.9) return 'near';
  return 'good';
}

export function essayMessage(words: number): string {
  const tone = essayTone(words);
  if (tone === 'empty') return `Aim for ${essayMinimum} to ${essayLimit} words.`;
  if (tone === 'short') return `${essayMinimum - words} more to reach ${essayMinimum}.`;
  if (tone === 'over') return `${words - essayLimit} over the ${essayLimit}-word limit. Trim a little.`;
  if (tone === 'near') return `${essayLimit - words} left. You are close to the limit.`;
  return `In range. ${essayLimit - words} words left.`;
}

const CAMPUS_TODAY = applyDates.campusTodayIso;
const CAMPUS_MONTH = CAMPUS_TODAY.slice(0, 7);
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function ageOn(birth: string, today: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  const [ty, tm, td] = today.split('-').map(Number);
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age -= 1;
  return age;
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateAbout(data: ApplicationData): FieldError[] {
  const a = data.about;
  const errors: FieldError[] = [];
  if (a.applicantType !== 'transfer') {
    errors.push({ id: 'type-transfer', message: 'Choose Transfer. First-year applications for Fall 2027 have closed.' });
  }
  if (!a.firstName.trim()) errors.push({ id: 'first-name', message: 'Enter your legal first name.' });
  if (!a.lastName.trim()) errors.push({ id: 'last-name', message: 'Enter your legal last name.' });
  const age = ageOn(a.birthDate, CAMPUS_TODAY);
  if (!a.birthDate) errors.push({ id: 'birth-date', message: 'Enter your date of birth.' });
  else if (age === null) errors.push({ id: 'birth-date', message: 'Enter a real date, like 2005-04-18.' });
  else if (age < 14 || age > 90) errors.push({ id: 'birth-date', message: 'Check the year of your date of birth.' });
  if (!a.citizenship) errors.push({ id: 'citizenship', message: 'Choose a citizenship status.' });
  return errors;
}

export function validateContact(data: ApplicationData): FieldError[] {
  const c = data.contact;
  const errors: FieldError[] = [];
  if (!c.email.trim()) errors.push({ id: 'email', message: 'Enter an email address.' });
  else if (!EMAIL.test(c.email.trim())) errors.push({ id: 'email', message: 'Enter an email like name@example.com.' });
  const digits = c.phone.replace(/\D/g, '');
  if (!digits) errors.push({ id: 'phone', message: 'Enter a phone number.' });
  else if (digits.length < 10 || digits.length > 15) errors.push({ id: 'phone', message: 'Enter a phone number with 10 to 15 digits.' });
  if (!c.street.trim()) errors.push({ id: 'street', message: 'Enter a street address.' });
  if (!c.city.trim()) errors.push({ id: 'city', message: 'Enter a city.' });
  if (!c.postal.trim()) errors.push({ id: 'postal', message: 'Enter a postal code.' });
  if (!c.country.trim()) errors.push({ id: 'country', message: 'Enter a country or territory.' });
  return errors;
}

export function validateAcademics(data: ApplicationData): FieldError[] {
  const errors: FieldError[] = [];
  if (data.schools.length === 0) {
    errors.push({ id: 'add-school', message: 'Add at least one school.' });
    return errors;
  }
  if (data.about.applicantType === 'transfer' && !data.schools.some((s) => s.type && s.type !== 'high-school')) {
    errors.push({ id: `school-${data.schools[0].id}-type`, message: 'Transfer applicants list at least one college.' });
  }
  data.schools.forEach((school, index) => {
    const n = `School ${index + 1}`;
    const p = `school-${school.id}`;
    if (!school.type) errors.push({ id: `${p}-type`, message: `${n}: choose the kind of school.` });
    if (!school.name.trim()) errors.push({ id: `${p}-name`, message: `${n}: enter the school name.` });
    if (!school.city.trim()) errors.push({ id: `${p}-city`, message: `${n}: enter the city.` });
    if (!MONTH.test(school.start)) errors.push({ id: `${p}-start`, message: `${n}: enter the month you started.` });
    else if (school.start > CAMPUS_MONTH) errors.push({ id: `${p}-start`, message: `${n}: the start month is in the future.` });
    if (!school.current) {
      if (!MONTH.test(school.end)) errors.push({ id: `${p}-end`, message: `${n}: enter the month you finished, or check “I attend now”.` });
      else if (MONTH.test(school.start) && school.end < school.start) {
        errors.push({ id: `${p}-end`, message: `${n}: the end month is before the start month.` });
      } else if (school.end > CAMPUS_MONTH) {
        errors.push({ id: `${p}-end`, message: `${n}: the end month is in the future. Check “I attend now” if you still attend.` });
      }
    }
    if (school.gpa.trim()) {
      const gpa = Number(school.gpa);
      if (!/^\d(\.\d{1,2})?$/.test(school.gpa.trim()) || gpa > 5) {
        errors.push({ id: `${p}-gpa`, message: `${n}: enter a GPA between 0.00 and 5.00, or leave it blank.` });
      }
    }
    school.courses.forEach((course, ci) => {
      const c = `course-${course.id}`;
      if (!course.title.trim()) errors.push({ id: `${c}-title`, message: `${n}, course ${ci + 1}: enter the course title.` });
      if (!course.grade) errors.push({ id: `${c}-grade`, message: `${n}, course ${ci + 1}: choose a grade.` });
    });
  });
  return errors;
}

export function validateTests(data: ApplicationData): FieldError[] {
  const errors: FieldError[] = [];
  if (data.tests.optional) return errors;
  if (data.tests.scores.length === 0) {
    errors.push({ id: 'add-score', message: 'Add a score, or turn on test-optional.' });
    return errors;
  }
  data.tests.scores.forEach((score, index) => {
    const n = `Score ${index + 1}`;
    const p = `score-${score.id}`;
    const type = testTypes.find((t) => t.id === score.test);
    if (!type) {
      errors.push({ id: `${p}-test`, message: `${n}: choose a test.` });
      return;
    }
    if (type.subject && !score.subject.trim()) errors.push({ id: `${p}-subject`, message: `${n}: enter the subject.` });
    const value = Number(score.value);
    const onStep = Number.isFinite(value) && Math.abs(value / type.step - Math.round(value / type.step)) < 1e-9;
    if (!score.value.trim()) errors.push({ id: `${p}-value`, message: `${n}: enter the score.` });
    else if (!Number.isFinite(value) || value < type.min || value > type.max || !onStep) {
      errors.push({ id: `${p}-value`, message: `${n}: ${type.label} scores run ${type.min} to ${type.max}.` });
    }
    if (!MONTH.test(score.date)) errors.push({ id: `${p}-date`, message: `${n}: enter the month you tested.` });
    else if (score.date > CAMPUS_MONTH) errors.push({ id: `${p}-date`, message: `${n}: the test month is in the future.` });
  });
  return errors;
}

export function validateMajor(data: ApplicationData): FieldError[] {
  const errors: FieldError[] = [];
  const ids = new Set(programs.map((p) => p.id));
  if (!ids.has(data.major.first)) errors.push({ id: 'major-search', message: 'Choose a first-choice program.' });
  if (data.major.second && (!ids.has(data.major.second) || data.major.second === data.major.first)) {
    errors.push({ id: 'major-search', message: 'Choose a different second choice, or remove it.' });
  }
  return errors;
}

export function validateEssay(data: ApplicationData): FieldError[] {
  const errors: FieldError[] = [];
  if (!essayPrompts.some((p) => p.id === data.essay.prompt)) {
    errors.push({ id: `essay-prompt-${essayPrompts[0].id}`, message: 'Choose an essay prompt.' });
  }
  const words = countWords(data.essay.text);
  if (words === 0) errors.push({ id: 'essay-text', message: 'Write your essay.' });
  else if (words < essayMinimum) errors.push({ id: 'essay-text', message: `Write at least ${essayMinimum} words. You have ${words}.` });
  else if (words > essayLimit) errors.push({ id: 'essay-text', message: `Trim the essay to ${essayLimit} words. You have ${words}.` });
  return errors;
}

export function validateActivities(data: ApplicationData): FieldError[] {
  const errors: FieldError[] = [];
  if (data.activities.length === 0) {
    errors.push({ id: 'add-activity', message: 'Add at least one activity.' });
    return errors;
  }
  data.activities.forEach((activity, index) => {
    const n = `Activity ${index + 1}`;
    const p = `activity-${activity.id}`;
    if (!activity.type) errors.push({ id: `${p}-type`, message: `${n}: choose a type.` });
    if (!activity.role.trim()) errors.push({ id: `${p}-role`, message: `${n}: enter your role.` });
    if (!activity.org.trim()) errors.push({ id: `${p}-org`, message: `${n}: enter the organization.` });
    if (!activity.desc.trim()) errors.push({ id: `${p}-desc`, message: `${n}: add a short description.` });
    else if (activity.desc.length > activityDescriptionLimit) {
      errors.push({ id: `${p}-desc`, message: `${n}: keep the description to ${activityDescriptionLimit} characters.` });
    }
    const hours = Number(activity.hours);
    if (!activity.hours.trim() || !Number.isInteger(hours) || hours < 1 || hours > 60) {
      errors.push({ id: `${p}-hours`, message: `${n}: enter hours per week, 1 to 60.` });
    }
    const weeks = Number(activity.weeks);
    if (!activity.weeks.trim() || !Number.isInteger(weeks) || weeks < 1 || weeks > 52) {
      errors.push({ id: `${p}-weeks`, message: `${n}: enter weeks per year, 1 to 52.` });
    }
  });
  return errors;
}

export function validateReview(data: ApplicationData): FieldError[] {
  return data.review.certify ? [] : [{ id: 'certify', message: 'Check the box to certify your application.' }];
}

export const validators: Record<StepId, (data: ApplicationData) => FieldError[]> = {
  about: validateAbout,
  contact: validateContact,
  academics: validateAcademics,
  tests: validateTests,
  major: validateMajor,
  essay: validateEssay,
  activities: validateActivities,
  review: validateReview,
};

export function validateStep(index: number, data: ApplicationData): FieldError[] {
  const step = STEPS[index];
  return step ? validators[step.id](data) : [];
}

/** Steps before review that still have a problem, by index. */
export function incompleteSteps(data: ApplicationData): number[] {
  return STEPS.slice(0, -1)
    .map((_, index) => index)
    .filter((index) => validateStep(index, data).length > 0);
}

export function newApplicationId(random: () => number = Math.random): string {
  const n = Math.floor(random() * 90000) + 10000;
  return `UMA-2027-${n}`;
}

export function savedLabel(savedAt: string | null, now: Date = new Date()): string {
  if (!savedAt) return 'Not saved yet';
  const at = new Date(savedAt);
  if (Number.isNaN(at.getTime())) return 'Not saved yet';
  const seconds = Math.max(0, Math.round((now.getTime() - at.getTime()) / 1000));
  if (seconds < 45) return 'Saved just now';
  if (seconds < 90) return 'Saved 1 minute ago';
  if (seconds < 3600) return `Saved ${Math.round(seconds / 60)} minutes ago`;
  const clock = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/[\u202f\u00a0]/g, ' ');
  return `Saved at ${clock}`;
}

export function monthLabel(value: string): string {
  if (!MONTH.test(value)) return '';
  const [y, m] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
