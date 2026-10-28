/**
 * Fall 2027 undergraduate application. Every program note, prompt, and date
 * below is sample content for the fictional University of Mars.
 */

export const applyTerm = 'Fall 2027';

export const applyDates = {
  campusToday: 'Monday, January 11, 2027',
  campusTodayIso: '2027-01-11',
  firstYearClosed: 'Friday, January 8, 2027',
  portalEmailBy: 'Wednesday, January 13, 2027',
  aidPriority: 'Monday, February 15, 2027',
  transferDeadline: 'Monday, March 1, 2027',
  transferDecisions: 'Friday, April 16, 2027',
  replyBy: 'Tuesday, June 1, 2027',
  orientation: 'August 2027',
};

export const applicantTypes = [
  {
    value: 'transfer',
    label: 'Transfer',
    hint: `You have taken college courses after high school. Open through ${applyDates.transferDeadline}.`,
    open: true,
  },
  {
    value: 'first-year',
    label: 'First-year',
    hint: `Regular decision for ${applyTerm} closed ${applyDates.firstYearClosed}.`,
    open: false,
  },
] as const;

export type College = {
  id: string;
  name: string;
  short: string;
};

export const colleges: College[] = [
  { id: 'arts', name: 'College of Arts & Letters', short: 'Arts & Letters' },
  { id: 'science', name: 'College of Science', short: 'Science' },
  { id: 'engineering', name: 'College of Engineering', short: 'Engineering' },
  { id: 'education', name: 'School of Education', short: 'Education' },
  { id: 'health', name: 'College of Health', short: 'Health' },
  { id: 'policy', name: 'School of Public Policy', short: 'Public Policy' },
  { id: 'exploratory', name: 'Undergraduate Studies', short: 'Exploratory' },
];

export type Program = {
  id: string;
  name: string;
  degree: string;
  college: string;
  blurb: string;
  signature: string;
  tags: string[];
  note?: string;
};

export const programs: Program[] = [
  {
    id: 'english',
    name: 'English',
    degree: 'B.A.',
    college: 'arts',
    blurb: 'Literature, rhetoric, and creative writing, taught in seminars of eighteen or fewer.',
    signature: 'ENGL 240 Writing the Frontier',
    tags: ['Writing', 'Seminars', 'Literary journal'],
  },
  {
    id: 'history',
    name: 'History',
    degree: 'B.A.',
    college: 'arts',
    blurb: 'From Earth antiquity to the settlement charters. Majors work in the university archive by the third year.',
    signature: 'HIST 315 The Charter Years, 2004–2020',
    tags: ['Archives', 'Research', 'Public history'],
  },
  {
    id: 'philosophy',
    name: 'Philosophy',
    degree: 'B.A.',
    college: 'arts',
    blurb: 'Ethics, logic, and the philosophy of science, with a strong pre-law advising track.',
    signature: 'PHIL 220 Ethics at a Distance',
    tags: ['Ethics', 'Logic', 'Pre-law'],
  },
  {
    id: 'languages',
    name: 'World Languages',
    degree: 'B.A.',
    college: 'arts',
    blurb: 'Spanish, Mandarin, French, and Arabic, with a required immersion term at a partner campus.',
    signature: 'LANG 300 Translation Workshop',
    tags: ['Immersion', 'Translation'],
  },
  {
    id: 'studio-art',
    name: 'Studio Art',
    degree: 'B.F.A.',
    college: 'arts',
    blurb: 'Painting, ceramics from local regolith clays, and digital media. Seniors show in the Union gallery.',
    signature: 'ART 260 Regolith Ceramics',
    tags: ['Portfolio', 'Studio', 'Exhibition'],
    note: 'Portfolio of 10 to 15 pieces requested after you apply.',
  },
  {
    id: 'biology',
    name: 'Biology',
    degree: 'B.S.',
    college: 'science',
    blurb: 'Cell, molecular, and organismal biology, with greenhouse research in the science pavilion.',
    signature: 'BIOL 230 Life in Closed Habitats',
    tags: ['Labs', 'Pre-health', 'Research'],
  },
  {
    id: 'chemistry',
    name: 'Chemistry',
    degree: 'B.S.',
    college: 'science',
    blurb: 'Analytical, organic, and atmospheric chemistry. Undergraduates run the department’s mass spectrometer.',
    signature: 'CHEM 340 Atmospheric Chemistry',
    tags: ['Labs', 'Instrumentation'],
  },
  {
    id: 'physics',
    name: 'Physics',
    degree: 'B.S.',
    college: 'science',
    blurb: 'Classical and modern physics, with an observatory track that uses the campus 1-meter telescope.',
    signature: 'PHYS 250 Observing from Thin Air',
    tags: ['Observatory', 'Computation'],
  },
  {
    id: 'mathematics',
    name: 'Mathematics',
    degree: 'B.S.',
    college: 'science',
    blurb: 'Pure and applied tracks. The quantitative reasoning course every student takes is taught here.',
    signature: 'MATH 310 Orbital Mechanics',
    tags: ['Applied', 'Proof', 'Statistics'],
  },
  {
    id: 'geology',
    name: 'Geology',
    degree: 'B.S.',
    college: 'science',
    blurb: 'Field courses in the Jezero delta every spring. Mapping, sedimentology, and core analysis.',
    signature: 'GEOL 210 Delta Field Methods',
    tags: ['Fieldwork', 'Mapping'],
  },
  {
    id: 'planetary-science',
    name: 'Planetary Science',
    degree: 'B.S.',
    college: 'science',
    blurb: 'Geology, atmosphere, and orbital data together. Our most requested major for transfer students.',
    signature: 'PLSC 200 Reading a Crater',
    tags: ['Remote sensing', 'Fieldwork', 'Research'],
  },
  {
    id: 'civil-engineering',
    name: 'Civil Engineering',
    degree: 'B.S.',
    college: 'engineering',
    blurb: 'Structures, water, and pressurized habitats. The senior design sequence runs a full spring semester.',
    signature: 'CIVE 330 Habitat Structures',
    tags: ['Design', 'Structures'],
  },
  {
    id: 'mechanical-engineering',
    name: 'Mechanical Engineering',
    degree: 'B.S.',
    college: 'engineering',
    blurb: 'Thermal systems, robotics, and machine design in the Olympus Way maker labs.',
    signature: 'MECH 280 Rover Design Studio',
    tags: ['Robotics', 'Design', 'Maker labs'],
  },
  {
    id: 'electrical-engineering',
    name: 'Electrical Engineering',
    degree: 'B.S.',
    college: 'engineering',
    blurb: 'Circuits, signals, and power systems, including the solar microgrid that serves the west village.',
    signature: 'ELEC 320 Microgrids',
    tags: ['Power', 'Signals'],
  },
  {
    id: 'environmental-engineering',
    name: 'Environmental Engineering',
    degree: 'B.S.',
    college: 'engineering',
    blurb: 'Air, water, and soil systems for settlements that have to recycle almost everything.',
    signature: 'ENVE 240 Closed-Loop Water',
    tags: ['Water', 'Sustainability'],
  },
  {
    id: 'elementary-education',
    name: 'Elementary Education',
    degree: 'B.A.',
    college: 'education',
    blurb: 'Teacher preparation with classroom placements in Jezero public schools from the second year.',
    signature: 'EDUC 210 Teaching Young Scientists',
    tags: ['Licensure', 'Placements'],
  },
  {
    id: 'nursing',
    name: 'Nursing',
    degree: 'B.S.N.',
    college: 'health',
    blurb: 'Clinical rotations at Jezero General and the campus health center, arranged by the college.',
    signature: 'NURS 300 Care in Low Gravity',
    tags: ['Clinical', 'Licensure'],
    note: 'Limited seats. Transfer applicants need two lab sciences with a C or better.',
  },
  {
    id: 'public-health',
    name: 'Public Health',
    degree: 'B.S.',
    college: 'health',
    blurb: 'Epidemiology, habitat health, and community programs, with a required field practicum.',
    signature: 'PUBH 250 Health in Shared Air',
    tags: ['Epidemiology', 'Practicum'],
  },
  {
    id: 'public-policy',
    name: 'Public Policy',
    degree: 'B.A.',
    college: 'policy',
    blurb: 'Governance, law, and settlement planning. The major includes a spring policy workshop.',
    signature: 'PPOL 330 Spring Policy Workshop',
    tags: ['Law', 'Workshop'],
  },
  {
    id: 'economics',
    name: 'Economics',
    degree: 'B.A.',
    college: 'policy',
    blurb: 'Micro, macro, and resource economics, with a data lab for interplanetary trade research.',
    signature: 'ECON 310 Scarcity and Supply Lines',
    tags: ['Data', 'Markets'],
  },
  {
    id: 'exploratory',
    name: 'Exploratory Studies',
    degree: 'Undeclared',
    college: 'exploratory',
    blurb: 'Take courses across the colleges with an advisor, then declare by the end of the second year.',
    signature: 'UGST 101 Choosing a Major',
    tags: ['Advising', 'Flexible'],
  },
];

export const essayLimit = 650;
export const essayMinimum = 250;

export const essayPrompts = [
  {
    id: 'unsolved',
    title: 'A problem without an answer key',
    text: 'Describe a problem you worked on that did not have an answer in the back of the book. What did you try, and what changed?',
  },
  {
    id: 'place',
    title: 'A place that shaped you',
    text: 'Jezero was a lake once. Tell us about a place that shaped you and what it holds that a map does not show.',
  },
  {
    id: 'changed-mind',
    title: 'Changing your mind',
    text: 'Write about something you changed your mind about, and who or what changed it.',
  },
  {
    id: 'transfer',
    title: 'Why transfer now',
    text: 'What have you learned in college so far, and what do you want to study at the University of Mars that you cannot study where you are?',
  },
] as const;

export type TestType = {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  subject?: boolean;
  hint: string;
};

export const testTypes: TestType[] = [
  { id: 'sat', label: 'SAT', min: 400, max: 1600, step: 10, hint: 'Total score, 400 to 1600.' },
  { id: 'act', label: 'ACT', min: 1, max: 36, step: 1, hint: 'Composite score, 1 to 36.' },
  { id: 'ap', label: 'AP exam', min: 1, max: 5, step: 1, subject: true, hint: 'Exam score, 1 to 5.' },
  { id: 'ib', label: 'IB subject', min: 1, max: 7, step: 1, subject: true, hint: 'Subject score, 1 to 7.' },
  { id: 'toefl', label: 'TOEFL iBT', min: 0, max: 120, step: 1, hint: 'Total score, 0 to 120.' },
  { id: 'ielts', label: 'IELTS Academic', min: 0, max: 9, step: 0.5, hint: 'Overall band, 0 to 9.' },
];

export const schoolTypes = [
  { value: 'high-school', label: 'High school or secondary school' },
  { value: 'community-college', label: 'Community college' },
  { value: 'university', label: 'College or university' },
] as const;

export const gradeOptions = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F', 'P', 'In progress'];

export const activityTypes = [
  'Academic club',
  'Arts or music',
  'Athletics',
  'Community service',
  'Family responsibilities',
  'Research',
  'Student government',
  'Work (paid)',
  'Other',
];

export const activityLimit = 10;
export const activityDescriptionLimit = 150;

export const nextSteps = [
  {
    when: applyDates.campusToday,
    title: 'Application received',
    body: 'Your answers are in the admissions queue. Nothing else is needed today.',
  },
  {
    when: `By ${applyDates.portalEmailBy}`,
    title: 'Applicant portal opens',
    body: 'We email a MyUM applicant sign-in with your checklist. Use the application ID above in any message.',
  },
  {
    when: applyDates.aidPriority,
    title: 'Aid priority date for 2027–28',
    body: 'File the 2027–28 FAFSA and the state grant application by this date for first consideration.',
  },
  {
    when: applyDates.transferDeadline,
    title: 'Transcripts due',
    body: 'Official transcripts from every college you listed must arrive by the transfer deadline.',
  },
  {
    when: applyDates.transferDecisions,
    title: 'Decision in MyUM',
    body: 'Transfer decisions post in the portal with a transfer credit estimate. Aid offers follow.',
  },
  {
    when: applyDates.replyBy,
    title: 'Reply to your offer',
    body: 'Accept and reserve your place, then sign up for transfer orientation in August 2027.',
  },
];
