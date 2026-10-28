/**
 * Sample data for the MyMars student dashboard demo. Ava Reyes is a fictional
 * student; every name, number, and amount here is made up.
 *
 * The campus "today" is Monday, January 11, 2027 (Spring Semester 2027, week 2).
 */

export type CardId = 'schedule' | 'actions' | 'degree' | 'balance' | 'housing' | 'library';

export const defaultCardOrder: CardId[] = ['actions', 'schedule', 'balance', 'degree', 'housing', 'library'];

export const student = {
  first: 'Ava',
  name: 'Ava Reyes',
  initials: 'AR',
  email: 'ava.reyes@umars.edu',
  program: 'Planetary Science, B.S.',
  college: 'College of Science',
  standing: 'Second-year',
  advisor: 'Dr. Ines Halvorsen',
};

export const today = {
  long: 'Monday, January 11, 2027',
  term: 'Spring Semester 2027',
  week: 2,
  /** Campus clock for the "now" line on today's schedule, in minutes after midnight. */
  nowMinutes: 10 * 60 + 15,
  nowLabel: '10:15 a.m.',
};

export type ScheduleKind = 'class' | 'lab' | 'meeting' | 'housing' | 'deadline';

export interface ScheduleItem {
  kind: ScheduleKind;
  code?: string;
  title: string;
  start: number;
  end?: number;
  where: string;
}

export interface ScheduleDay {
  id: string;
  short: string;
  long: string;
  date: number;
  items: ScheduleItem[];
}

const t = (hours: number, minutes = 0) => hours * 60 + minutes;

const mineralogy: Omit<ScheduleItem, 'start' | 'end'> = {
  kind: 'class',
  code: 'GEOL 210',
  title: 'Mineralogy & Petrology',
  where: 'Science Pavilion 118',
};
const atmospheres: Omit<ScheduleItem, 'start' | 'end'> = {
  kind: 'class',
  code: 'PLSC 220',
  title: 'Planetary Atmospheres',
  where: 'Science Pavilion 204',
};
const calculus: Omit<ScheduleItem, 'start' | 'end'> = {
  kind: 'class',
  code: 'MATH 231',
  title: 'Multivariable Calculus',
  where: 'Tharsis Hall 301',
};
const settlement: Omit<ScheduleItem, 'start' | 'end'> = {
  kind: 'class',
  code: 'HIST 115',
  title: 'Settlement Histories of Mars',
  where: 'University Library, Seminar 2',
};

export const schedule: ScheduleDay[] = [
  {
    id: 'mon',
    short: 'Mon',
    long: 'Monday, January 11',
    date: 11,
    items: [
      { ...mineralogy, start: t(9), end: t(9, 50) },
      { ...atmospheres, start: t(11), end: t(11, 50) },
      {
        kind: 'meeting',
        title: 'Advising with Dr. Halvorsen',
        start: t(15, 30),
        end: t(16),
        where: 'Science Pavilion 012',
      },
    ],
  },
  {
    id: 'tue',
    short: 'Tue',
    long: 'Tuesday, January 12',
    date: 12,
    items: [
      { kind: 'housing', title: 'Heater repair visit', start: t(9), end: t(11), where: 'Isidis Hall 312' },
      { ...calculus, start: t(9, 30), end: t(10, 45) },
      { ...settlement, start: t(13), end: t(14, 15) },
    ],
  },
  {
    id: 'wed',
    short: 'Wed',
    long: 'Wednesday, January 13',
    date: 13,
    items: [
      { ...mineralogy, start: t(9), end: t(9, 50) },
      { ...atmospheres, start: t(11), end: t(11, 50) },
      {
        kind: 'lab',
        code: 'GEOL 210L',
        title: 'Thin-section lab',
        start: t(13),
        end: t(15, 50),
        where: 'Science Pavilion Lab B',
      },
      { kind: 'deadline', title: 'Library loan due: Regolith Mechanics', start: t(23, 59), where: 'University Library' },
    ],
  },
  {
    id: 'thu',
    short: 'Thu',
    long: 'Thursday, January 14',
    date: 14,
    items: [
      { ...calculus, start: t(9, 30), end: t(10, 45) },
      { ...settlement, start: t(13), end: t(14, 15) },
      {
        kind: 'class',
        code: 'UNIV 150',
        title: 'Habitat Safety & Fitness',
        start: t(16),
        end: t(16, 50),
        where: 'Recreation Dome',
      },
    ],
  },
  {
    id: 'fri',
    short: 'Fri',
    long: 'Friday, January 15',
    date: 15,
    items: [
      { ...mineralogy, start: t(9), end: t(9, 50) },
      { ...calculus, title: 'Calculus recitation', start: t(10), end: t(10, 50), where: 'Tharsis Hall 118' },
      { ...atmospheres, start: t(11), end: t(11, 50) },
      { kind: 'deadline', title: 'Add/drop closes', start: t(17), where: 'Registrar, online' },
    ],
  },
];

export interface ActionItem {
  id: string;
  title: string;
  detail: string;
  due?: string;
}

export const aidHold = {
  id: 'aid-hold',
  office: 'Office of Financial Aid',
  title: 'Financial aid hold',
  summary: 'Verification for aid year 2026–27 is incomplete. Your Federal Direct Loan can’t pay until it clears.',
  placed: 'Placed Dec 18, 2026',
  blocks: 'Blocks: aid disbursement',
  documents: [
    { id: 'form', label: 'Signed verification form', file: 'reyes-verification-signed.pdf', size: '184 KB' },
    { id: 'transcript', label: '2025 tax return transcript', file: 'reyes-2025-tax-transcript.pdf', size: '96 KB' },
  ],
  reference: 'FA-27-30418',
};

export const actionItems: ActionItem[] = [
  {
    id: 'emergency-contact',
    title: 'Confirm emergency contact',
    detail: 'Required once each semester.',
    due: 'Due Jan 22',
  },
  {
    id: 'meal-plan',
    title: 'Review Spring meal plan',
    detail: 'Red 14 plan · change by Jan 18.',
  },
];

export interface DegreeArea {
  id: string;
  label: string;
  required: number;
  done: number;
  inProgress: number;
  color: string;
}

export const degree = {
  program: 'Planetary Science, B.S.',
  catalog: '2025–26 catalog',
  required: 120,
  expected: 'Expected graduation: Spring 2029',
  gpa: '3.62',
  areas: [
    { id: 'major', label: 'Major: Planetary Science', required: 48, done: 19, inProgress: 7, color: '#6b2430' },
    { id: 'core', label: 'University core', required: 30, done: 24, inProgress: 3, color: '#24486a' },
    { id: 'support', label: 'Math & supporting science', required: 18, done: 12, inProgress: 4, color: '#8e3b2e' },
    { id: 'electives', label: 'Free electives', required: 24, done: 6, inProgress: 1, color: '#8a6a3c' },
  ] satisfies DegreeArea[],
};

export interface LedgerLine {
  label: string;
  amount: number;
  note?: string;
}

export const balance = {
  term: 'Spring Semester 2027',
  charges: [
    { label: 'Tuition and fees', amount: 6970 },
    { label: 'Housing and meals', amount: 8240 },
    { label: 'GEOL 210L lab fee', amount: 85 },
  ] satisfies LedgerLine[],
  credits: [
    { label: 'Red Planet Scholars grant', amount: 6400 },
    { label: 'Jezero Opportunity Grant', amount: 3700 },
    { label: 'Housing deposit', amount: 300 },
  ] satisfies LedgerLine[],
  heldAid: { label: 'Federal Direct Loan', amount: 2750, releasedNote: 'disburses Jan 19' },
  plan: {
    name: 'Spring payment plan',
    enrolled: 'Enrolled Jan 6',
    installments: [
      { id: 'jan', due: 'Jan 20' },
      { id: 'feb', due: 'Feb 20' },
      { id: 'mar', due: 'Mar 20' },
      { id: 'apr', due: 'Apr 20' },
    ],
  },
};

export const housing = {
  hall: 'Isidis Hall',
  room: 'Suite 312, Room B',
  type: 'Suite double',
  term: 'Spring Semester 2027 contract',
  roommate: 'Priya Nandakumar',
  mealPlan: 'Red 14 meal plan',
  desk: 'Isidis front desk, open until midnight',
  workOrders: [
    {
      id: 'HWO-2027-0981',
      title: 'Bedroom heater runs uneven',
      status: 'scheduled' as const,
      statusLabel: 'Scheduled',
      detail: 'Tue, Jan 12 · 9–11 a.m. window',
      progress: 2,
    },
    {
      id: 'HWO-2027-0964',
      title: 'Closet door off its track',
      status: 'received' as const,
      statusLabel: 'Received',
      detail: 'Submitted Jan 8 · awaiting a technician',
      progress: 1,
    },
  ],
};

export interface LibraryLoan {
  id: string;
  title: string;
  author: string;
  callNumber: string;
  borrowed: string;
  due: string;
  dueInDays: number;
  periodDays: number;
  renewedDue: string;
  renewable: boolean;
  note?: string;
}

export const library = {
  loans: [
    {
      id: 'regolith',
      title: 'Regolith Mechanics, 3rd ed.',
      author: 'T. Okafor',
      callNumber: 'QB 641 .O43',
      borrowed: 'Dec 16',
      due: 'Wed, Jan 13',
      dueInDays: 2,
      periodDays: 28,
      renewedDue: 'Wed, Jan 27',
      renewable: true,
    },
    {
      id: 'basalts',
      title: 'A Field Guide to Jezero Basalts',
      author: 'M. Castellanos & R. Iwu',
      callNumber: 'QE 461 .C37',
      borrowed: 'Jan 5',
      due: 'Tue, Feb 2',
      dueInDays: 22,
      periodDays: 28,
      renewedDue: 'Tue, Feb 16',
      renewable: true,
    },
    {
      id: 'ice',
      title: 'Water Under Ice: A Hydrology of Mars',
      author: 'Sun-Hee Park',
      callNumber: 'QB 643 .P37',
      borrowed: 'Jan 4',
      due: 'Mon, Jan 18',
      dueInDays: 7,
      periodDays: 14,
      renewedDue: 'Mon, Jan 18',
      renewable: false,
      note: 'Course reserve · no renewals',
    },
  ] satisfies LibraryLoan[],
  holdShelf: { title: 'Dust Devils: Weather at the Surface', pickup: 'Ready at the circulation desk until Jan 16' },
};

export type NotificationTone = 'alert' | 'info' | 'success';

export interface DashboardNotification {
  id: string;
  tone: NotificationTone;
  title: string;
  body: string;
  when: string;
  card?: CardId;
}

export const notifications: DashboardNotification[] = [
  {
    id: 'n-hold',
    tone: 'alert',
    title: 'Action needed: financial aid hold',
    body: 'Send your verification packet so your Federal Direct Loan can pay.',
    when: 'Today, 8:02 a.m.',
    card: 'actions',
  },
  {
    id: 'n-repair',
    tone: 'info',
    title: 'Repair visit scheduled',
    body: 'HWO-2027-0981, bedroom heater. A technician arrives Tuesday between 9 and 11 a.m.',
    when: 'Today, 7:45 a.m.',
    card: 'housing',
  },
  {
    id: 'n-library',
    tone: 'info',
    title: 'Library loan due Wednesday',
    body: 'Regolith Mechanics, 3rd ed. is due in 2 days. You can renew it once.',
    when: 'Yesterday',
    card: 'library',
  },
  {
    id: 'n-adddrop',
    tone: 'info',
    title: 'Add/drop closes Friday at 5 p.m.',
    body: 'Changes after the deadline need a petition to the Registrar.',
    when: 'Jan 9',
    card: 'schedule',
  },
  {
    id: 'n-plan',
    tone: 'success',
    title: 'Payment plan confirmed',
    body: 'Your Spring payment plan is active. The first payment is due Jan 20.',
    when: 'Jan 6',
    card: 'balance',
  },
];
