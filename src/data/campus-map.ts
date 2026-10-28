/**
 * Sample data for the Jezero campus map. Every building, office, hour, and
 * walkway here is fictional. Map units are meters; the drawing is 1600 by
 * 1000 with north up.
 */

export type PlaceCategory = 'academic' | 'housing' | 'dining' | 'services' | 'landmark' | 'transit';

export type Entrance = {
  label: string;
  x: number;
  y: number;
  /** Walkway node this entrance opens onto. */
  node: string;
  stepFree: boolean;
  /** A plaza is a routing endpoint, not a door. */
  plaza?: boolean;
};

export type HoursRow = { days: string; time: string };

export type Place = {
  id: string;
  name: string;
  /** Lines drawn on the map. */
  label: string[];
  /** Draw the label beside a small footprint instead of on the roof. */
  labelOutside?: { x: number; y: number; anchor?: 'start' | 'middle' | 'end' };
  categories: PlaceCategory[];
  kind: 'building' | 'stop';
  summary: string;
  photo?: { name: string; alt: string };
  hours: HoursRow[];
  departments: string[];
  elevator: string;
  accessNotes: string[];
  entrances: Entrance[];
  /** Footprint as [x, y, width, height] rectangles. */
  rects: [number, number, number, number][];
  keywords: string;
  link?: { href: string; label: string };
};

export type WalkNode = { id: string; x: number; y: number };
export type WalkEdge = { from: string; to: string; name: string; stairs?: boolean };

export const MAP_WIDTH = 1600;
export const MAP_HEIGHT = 1000;
export const METERS_PER_UNIT = 1;
/** An unhurried walk on level paths, about 4.8 km an hour. */
export const METERS_PER_MINUTE = 80;

/** Campus "today" is Monday, January 11, 2027. */
export const TODAY_LABEL = 'Monday, January 11';

export const categoryLabels: Record<PlaceCategory, string> = {
  academic: 'Academic',
  housing: 'Housing',
  dining: 'Dining',
  services: 'Services',
  landmark: 'Landmark',
  transit: 'Shuttle stop',
};

const photos = {
  library: {
    name: 'library',
    alt: 'Glass atrium of the University Library at dusk, with wide steps and red hills behind it.',
  },
  halls: {
    name: 'residence-halls',
    alt: 'Residence halls around a courtyard at sunset, with string lights and a red ridge beyond.',
  },
  lecture: { name: 'lecture-hall', alt: 'Tiered wooden lecture hall seen from the back row during a class.' },
  research: {
    name: 'research',
    alt: 'Research building with a rooftop observatory dome at blue hour, beside a red plain.',
  },
  students: { name: 'students', alt: 'Students studying with laptops at an outdoor table, seen mostly from behind.' },
  quad: {
    name: 'hero-quad',
    alt: 'Brick clock tower above the main quad lawn in low sun, with mesas on the horizon.',
  },
};

const shuttleHours: HoursRow[] = [
  { days: 'Weekdays', time: 'Every 8 minutes, 7 a.m. to 10 p.m.' },
  { days: 'Saturday and Sunday', time: 'Every 15 minutes, 9 a.m. to 9 p.m.' },
];

const shuttleAccess = [
  'Every Rim Loop shuttle kneels and has a fold-out ramp. Ask the driver to deploy it.',
  'The shelter has a bench, a lit timetable, and an audio button that reads the next two departures.',
];

export const places: Place[] = [
  {
    id: 'library',
    name: 'University Library',
    label: ['University', 'Library'],
    categories: ['academic'],
    kind: 'building',
    summary:
      'The main library on the north side of the quad. Reading rooms on the first floor, stacks above, and the university archives on the lower level.',
    photo: photos.library,
    hours: [
      { days: 'Monday to Friday', time: '8 a.m. to midnight' },
      { days: 'Saturday', time: '10 a.m. to 8 p.m.' },
      { days: 'Sunday', time: 'Noon to midnight' },
    ],
    departments: ['Reading rooms and stacks', 'University archives (lower level)', 'Special collections', 'Research help desk'],
    elevator: 'Two elevators by the south atrium serve every floor, including the archives.',
    accessNotes: [
      'The south entrance has a ramp beside the wide steps and an automatic door.',
      'A campus card is required after 10 p.m.',
      'Adjustable-height tables are in the first-floor reading room.',
    ],
    entrances: [
      { label: 'South entrance (atrium)', x: 800, y: 360, node: 'qn', stepFree: true },
      { label: 'North entrance (Library Loop)', x: 800, y: 262, node: 'loop', stepFree: true },
    ],
    rects: [[690, 262, 220, 98]],
    keywords: 'books study reading room archives special collections quiet late',
    link: { href: '/academics/#libraries', label: 'Library services' },
  },
  {
    id: 'clock-tower',
    name: 'Clock Tower',
    label: ['Clock Tower'],
    labelOutside: { x: 800, y: 576 },
    categories: ['landmark'],
    kind: 'building',
    summary:
      'The tower at the center of the main quad. The motto, Lux ultra horizontem, is cut into its east face. The quad east of the tower is the campus assembly point in an emergency.',
    photo: photos.quad,
    hours: [
      { days: 'Daily', time: 'Plaza open at all hours' },
      { days: 'First Saturday of the month', time: 'Tower tours at 11 a.m. and 2 p.m.' },
    ],
    departments: ['Emergency assembly point (east lawn)', 'Carillon, played at noon on class days'],
    elevator: 'No elevator. The tower stair has 142 steps.',
    accessNotes: [
      'The plaza around the tower is level with the north–south and east–west walks.',
      'The diagonal walks into the plaza have three steps each.',
      'A captioned video of the tour plays at the library research help desk.',
    ],
    entrances: [
      { label: 'Tower plaza', x: 800, y: 520, node: 'tower', stepFree: true, plaza: true },
      { label: 'Tower door (two steps)', x: 800, y: 534, node: 'tower', stepFree: false },
    ],
    rects: [[786, 506, 28, 28]],
    keywords: 'quad assembly emergency motto carillon tour landmark',
    link: { href: '/emergency/', label: 'Emergency information' },
  },
  {
    id: 'isidis',
    name: 'Isidis Hall',
    label: ['Isidis', 'Hall'],
    categories: ['housing', 'services'],
    kind: 'building',
    summary:
      'First-year and second-year suites east of the library, with a shared kitchen on each floor. The housing office is on the ground floor, Room 10.',
    photo: photos.halls,
    hours: [
      { days: 'Weekdays', time: 'Housing office, Room 10: 9 a.m. to 4 p.m.' },
      { days: 'Daily', time: 'Hall desk: 8 a.m. to midnight' },
    ],
    departments: ['Residential Life and Housing office (Room 10)', 'First-year and second-year suites'],
    elevator: 'One elevator inside the west entrance serves all four floors.',
    accessNotes: [
      'The west entrance is level with the Isidis Walk and has a power door.',
      'The south door opens onto the Mesa Walk by four steps.',
      'Two accessible suites are on the ground floor. Ask the housing office.',
    ],
    entrances: [
      { label: 'West entrance', x: 970, y: 300, node: 'ie', stepFree: true },
      { label: 'South door (four steps)', x: 1025, y: 350, node: 'mw1', stepFree: false },
    ],
    rects: [
      [970, 240, 110, 46],
      [970, 286, 52, 64],
    ],
    keywords: 'residence hall dorm suites housing office room 10 first-year second-year kitchen',
    link: { href: '/housing/#halls', label: 'Residence halls' },
  },
  {
    id: 'olympus-mons',
    name: 'Olympus Mons Hall',
    label: ['Olympus', 'Mons Hall'],
    categories: ['housing'],
    kind: 'building',
    summary: 'First-year traditional rooms on the south quad. 420 beds. The desk is staffed until midnight.',
    photo: photos.halls,
    hours: [{ days: 'Daily', time: 'Hall desk: 8 a.m. to midnight' }],
    departments: ['First-year traditional rooms', 'Resident director office'],
    elevator: 'Elevators in both wings, beside the east lobby and at the north stair.',
    accessNotes: [
      'The east lobby faces Olympus Way and is step-free.',
      'The north door on the quad has two steps.',
      'Visual fire alarms are installed in every room.',
    ],
    entrances: [
      { label: 'East lobby (Olympus Way)', x: 770, y: 735, node: 'ow', stepFree: true },
      { label: 'North door (two steps)', x: 700, y: 680, node: 'qsm', stepFree: false },
    ],
    rects: [
      [635, 680, 135, 44],
      [635, 724, 60, 66],
    ],
    keywords: 'residence hall dorm first-year traditional rooms south quad',
    link: { href: '/housing/#halls', label: 'Residence halls' },
  },
  {
    id: 'syrtis',
    name: 'Syrtis Court',
    label: ['Syrtis Court'],
    labelOutside: { x: 625, y: 36 },
    categories: ['housing'],
    kind: 'building',
    summary:
      'Upper-division apartments on the north edge of campus, past the Rim Road. Nine-month and twelve-month contracts.',
    photo: photos.halls,
    hours: [{ days: 'Weekdays', time: 'Community office: 10 a.m. to 6 p.m.' }],
    departments: ['Upper-division apartments', 'Community office (Building B)'],
    elevator: 'Each of the three buildings has an elevator by its south door.',
    accessNotes: [
      'The south doors of all three buildings are at grade.',
      'The crosswalk on the Rim Road has a raised table and audible signal.',
    ],
    entrances: [{ label: 'South doors', x: 625, y: 130, node: 'syw', stepFree: true }],
    rects: [
      [500, 50, 70, 80],
      [590, 50, 70, 80],
      [680, 50, 70, 80],
    ],
    keywords: 'apartments upper-division twelve-month housing north',
    link: { href: '/housing/#halls', label: 'Residence halls' },
  },
  {
    id: 'elysium',
    name: 'Elysium Hall',
    label: ['Elysium', 'Hall'],
    categories: ['housing'],
    kind: 'building',
    summary: 'Upper-division singles and doubles around a courtyard in the west village. Quiet house by agreement.',
    photo: photos.halls,
    hours: [{ days: 'Daily', time: 'Hall desk: 8 a.m. to 10 p.m.' }],
    departments: ['Upper-division singles and doubles', 'West village quiet house'],
    elevator: 'One elevator at the east lobby.',
    accessNotes: [
      'The east lobby and the south courtyard gate are both step-free.',
      'The courtyard paths are paved and level.',
    ],
    entrances: [
      { label: 'East lobby', x: 400, y: 450, node: 'elE', stepFree: true },
      { label: 'South courtyard gate', x: 325, y: 520, node: 'ec', stepFree: true },
    ],
    rects: [
      [250, 380, 150, 36],
      [250, 416, 36, 104],
      [364, 416, 36, 104],
      [286, 484, 78, 36],
    ],
    keywords: 'residence hall dorm upper-division quiet west village singles',
    link: { href: '/housing/#halls', label: 'Residence halls' },
  },
  {
    id: 'chryse',
    name: 'Chryse Hall',
    label: ['Chryse', 'Hall'],
    categories: ['academic'],
    kind: 'building',
    summary: 'Home of the College of Arts & Letters and the School of Education, northwest of the quad.',
    photo: photos.lecture,
    hours: [
      { days: 'Monday to Friday', time: '7 a.m. to 10 p.m.' },
      { days: 'Saturday', time: '9 a.m. to 5 p.m.' },
    ],
    departments: ['College of Arts & Letters', 'English', 'History', 'School of Education'],
    elevator: 'One elevator in the east lobby serves all three floors.',
    accessNotes: [
      'The east entrance on the Syrtis Walk is step-free with a power door.',
      'The south door has six steps and a handrail.',
    ],
    entrances: [
      { label: 'East entrance', x: 600, y: 300, node: 'cw', stepFree: true },
      { label: 'South door (six steps)', x: 535, y: 350, node: 'hn', stepFree: false },
    ],
    rects: [[470, 250, 130, 100]],
    keywords: 'arts letters english history education humanities',
    link: { href: '/academics/#college-arts', label: 'College of Arts & Letters' },
  },
  {
    id: 'hesperia',
    name: 'Hesperia Lecture Hall',
    label: ['Hesperia', 'Lecture Hall'],
    categories: ['academic'],
    kind: 'building',
    summary:
      'The large tiered lecture rooms on the west side of the quad, plus the School of Public Policy and the Center for Teaching.',
    photo: photos.lecture,
    hours: [
      { days: 'Monday to Friday', time: '7 a.m. to 10 p.m.' },
      { days: 'Saturday and Sunday', time: 'Closed except for scheduled exams' },
    ],
    departments: ['Lecture rooms H100 to H140', 'School of Public Policy', 'Economics', 'Center for Teaching'],
    elevator: 'Elevator beside the east lobby reaches the top row of every tiered room.',
    accessNotes: [
      'The east entrance on the quad is step-free.',
      'Each tiered room has wheelchair spaces at the front and back rows, and a hearing loop.',
      'The north door has five steps.',
    ],
    entrances: [
      { label: 'East entrance (quad)', x: 590, y: 475, node: 'qw', stepFree: true },
      { label: 'North door (five steps)', x: 530, y: 410, node: 'hn', stepFree: false },
    ],
    rects: [[470, 410, 120, 130]],
    keywords: 'lecture rooms classes public policy economics center for teaching exams',
    link: { href: '/academics/#college-policy', label: 'School of Public Policy' },
  },
  {
    id: 'noachis',
    name: 'Noachis Lecture Center',
    label: ['Noachis', 'Lecture', 'Center'],
    categories: ['academic'],
    kind: 'building',
    summary:
      'Science lecture rooms and teaching labs on the east side of the quad. Teaching labs keep their own hours, separate from the library.',
    photo: photos.lecture,
    hours: [
      { days: 'Monday to Friday', time: '7 a.m. to 9 p.m.' },
      { days: 'Saturday', time: 'Teaching labs by appointment' },
    ],
    departments: ['College of Science lecture rooms', 'Biology teaching labs', 'Planetary Science undergraduate office'],
    elevator: 'One elevator by the west entrance.',
    accessNotes: [
      'The west entrance on the quad is step-free.',
      'The east door to Science Row has three steps.',
      'Each teaching lab has one adjustable bench.',
    ],
    entrances: [
      { label: 'West entrance (quad)', x: 1010, y: 475, node: 'qe', stepFree: true },
      { label: 'East door (three steps)', x: 1120, y: 470, node: 'sr1', stepFree: false },
    ],
    rects: [[1010, 420, 110, 105]],
    keywords: 'science lectures teaching labs biology planetary',
    link: { href: '/academics/#college-science', label: 'College of Science' },
  },
  {
    id: 'observatory',
    name: 'Science Research Building and Jezero Observatory',
    label: ['Science', 'Research'],
    categories: ['academic'],
    kind: 'building',
    summary:
      'The research building with the rooftop dome. The Jezero Observatory is a shared facility of the College of Science; class and research time comes first.',
    photo: photos.research,
    hours: [
      { days: 'Monday to Friday', time: '7 a.m. to 8 p.m., card access after hours' },
      { days: 'Monthly', time: 'Public viewing nights, posted each month during the term' },
    ],
    departments: ['Jezero Observatory', 'Planetary Science research labs', 'Imaging core facility'],
    elevator: 'Elevator to the roof terrace. The dome itself is reached by a short stair.',
    accessNotes: [
      'The south entrance on Science Row is step-free.',
      'The west door is reached by the Observatory Steps.',
      'On public nights, a telescope feed is shown on a screen on the roof terrace.',
    ],
    entrances: [
      { label: 'South entrance', x: 1180, y: 325, node: 'sr0', stepFree: true },
      { label: 'West door (Observatory Steps)', x: 1130, y: 285, node: 'obw', stepFree: false },
    ],
    rects: [[1130, 215, 150, 110]],
    keywords: 'observatory telescope dome research planetary imaging viewing night',
    link: { href: '/research/#observatory', label: 'Jezero Observatory' },
  },
  {
    id: 'arcadia',
    name: 'Arcadia Engineering Labs',
    label: ['Arcadia', 'Engineering'],
    categories: ['academic'],
    kind: 'building',
    summary:
      'The College of Engineering labs on Science Row, including the environmental engineering wing and the shared machine shop.',
    photo: photos.research,
    hours: [
      { days: 'Monday to Friday', time: '7 a.m. to 9 p.m.' },
      { days: 'Machine shop', time: 'By lab sponsor request only' },
    ],
    departments: [
      'College of Engineering',
      'Mechanical Engineering',
      'Center for Water and Climate (environmental engineering wing)',
      'Machine shop (core facility)',
    ],
    elevator: 'Freight and passenger elevators by the west entrance.',
    accessNotes: ['The west entrance on Science Row is step-free with a power door.', 'High-bay lab floors are level throughout.'],
    entrances: [{ label: 'West entrance', x: 1175, y: 450, node: 'sr1', stepFree: true }],
    rects: [[1175, 390, 125, 115]],
    keywords: 'engineering mechanical environmental water climate machine shop labs',
    link: { href: '/academics/#college-engineering', label: 'College of Engineering' },
  },
  {
    id: 'greenhouse',
    name: 'Research Greenhouse',
    label: ['Greenhouse'],
    categories: ['academic'],
    kind: 'building',
    summary: 'A core research facility for plant and soil work. A principal investigator requests bench time.',
    photo: photos.research,
    hours: [{ days: 'Monday to Friday', time: '8 a.m. to 6 p.m., card access only' }],
    departments: ['Core facilities', 'Biology plant growth rooms'],
    elevator: 'Single story. No elevator needed.',
    accessNotes: ['The west entrance is at grade.', 'Aisles between benches are at least 1.2 m wide.'],
    entrances: [{ label: 'West entrance', x: 1175, y: 580, node: 'sr2', stepFree: true }],
    rects: [[1175, 545, 125, 70]],
    keywords: 'greenhouse plants soil biology core facility',
    link: { href: '/research/#facilities', label: 'Core facilities' },
  },
  {
    id: 'argyre',
    name: 'Argyre Health Sciences',
    label: ['Argyre', 'Health Sci.'],
    categories: ['academic'],
    kind: 'building',
    summary: 'The College of Health and the Institute for Public Health, southeast of the quad.',
    photo: photos.research,
    hours: [{ days: 'Monday to Friday', time: '7 a.m. to 9 p.m.' }],
    departments: ['College of Health', 'Public Health', 'Institute for Public Health'],
    elevator: 'One elevator inside the north entrance.',
    accessNotes: ['The north entrance on the Health Walk is step-free.', 'The west door has two steps.'],
    entrances: [
      { label: 'North entrance', x: 1070, y: 680, node: 'hw', stepFree: true },
      { label: 'West door (two steps)', x: 1010, y: 730, node: 'agw', stepFree: false },
    ],
    rects: [[1010, 680, 120, 95]],
    keywords: 'health public health institute nursing college of health',
    link: { href: '/academics/#college-health', label: 'College of Health' },
  },
  {
    id: 'health-services',
    name: 'University Health Services',
    label: ['Health', 'Services'],
    categories: ['services'],
    kind: 'building',
    summary: 'Primary care and counseling appointments for students. The after-hours nurse line is on the back of the student ID card.',
    photo: photos.students,
    hours: [
      { days: 'Weekdays', time: '8 a.m. to 6 p.m.' },
      { days: 'Saturday', time: '10 a.m. to 2 p.m.' },
      { days: 'Sunday', time: 'Closed' },
    ],
    departments: ['University Health Services', 'Counseling', 'Pharmacy window'],
    elevator: 'Single story. No elevator needed.',
    accessNotes: [
      'The west entrance has a power door and a covered drop-off on Science Row.',
      'An exam room with a height-adjustable table is available on request.',
    ],
    entrances: [{ label: 'West entrance', x: 1170, y: 720, node: 'sr4', stepFree: true }],
    rects: [[1170, 680, 110, 80]],
    keywords: 'clinic doctor nurse counseling health wellbeing pharmacy appointment',
    link: { href: '/students/#health', label: 'Health and wellbeing' },
  },
  {
    id: 'union',
    name: 'Student Union',
    label: ['Student', 'Union'],
    categories: ['services', 'dining'],
    kind: 'building',
    summary:
      'The campus life office, the Help Center desk, the Access office, and the Union Market food hall, southwest of the quad.',
    photo: photos.students,
    hours: [
      { days: 'Monday to Friday', time: '7 a.m. to 11 p.m.' },
      { days: 'Saturday and Sunday', time: '9 a.m. to 11 p.m.' },
      { days: 'Help Center and Access office', time: 'Weekdays, 9 a.m. to 4 p.m.' },
    ],
    departments: [
      'Campus life office and student organizations',
      'Help Center walk-in desk',
      'Access office (Room 140)',
      'Union Market food hall',
      'Campus bookstore',
    ],
    elevator: 'Two elevators in the central atrium.',
    accessNotes: [
      'The north and east entrances are both step-free with power doors.',
      'An all-gender, accessible restroom is on every floor.',
      'A quiet room is on the second floor, next to the Access office.',
    ],
    entrances: [
      { label: 'North entrance', x: 520, y: 665, node: 'un', stepFree: true },
      { label: 'East entrance', x: 600, y: 720, node: 'uE', stepFree: true },
    ],
    rects: [[440, 665, 160, 115]],
    keywords: 'food market bookstore campus life clubs organizations help center access office coffee lunch',
    link: { href: '/support/', label: 'Help Center' },
  },
  {
    id: 'hellas',
    name: 'Hellas Commons',
    label: ['Hellas', 'Commons'],
    categories: ['dining'],
    kind: 'building',
    summary: 'The all-you-care-to-eat dining hall for the west village and Elysium Hall.',
    photo: photos.students,
    hours: [
      { days: 'Monday to Friday', time: '7 a.m. to 8 p.m.' },
      { days: 'Saturday and Sunday', time: 'Brunch 10 a.m. to 2 p.m., dinner 5 to 8 p.m.' },
    ],
    departments: ['Residential dining', 'Allergen-aware station'],
    elevator: 'Single story. No elevator needed.',
    accessNotes: ['The east entrance on the Village Walk is step-free.', 'The north door has two steps.'],
    entrances: [
      { label: 'East entrance', x: 395, y: 595, node: 'ws', stepFree: true },
      { label: 'North door (two steps)', x: 330, y: 560, node: 'ec', stepFree: false },
    ],
    rects: [[265, 560, 130, 70]],
    keywords: 'dining hall meals food breakfast lunch dinner meal plan',
    link: { href: '/housing/', label: 'Housing and dining' },
  },
  {
    id: 'delta-cafe',
    name: 'Delta Café',
    label: ['Delta Café'],
    labelOutside: { x: 1055, y: 645 },
    categories: ['dining'],
    kind: 'building',
    summary: 'A coffee and sandwich pavilion on the Café Walk, between the quad and Science Row.',
    photo: photos.students,
    hours: [
      { days: 'Monday to Friday', time: '7:30 a.m. to 7 p.m.' },
      { days: 'Saturday and Sunday', time: 'Closed' },
    ],
    departments: ['Coffee, tea, and sandwiches'],
    elevator: 'Single story. No elevator needed.',
    accessNotes: ['The north entrance is at grade.', 'The counter has a lowered section by the register.'],
    entrances: [{ label: 'North entrance', x: 1055, y: 575, node: 'cafe', stepFree: true }],
    rects: [[1020, 575, 70, 50]],
    keywords: 'coffee tea sandwiches snacks cafe',
  },
  {
    id: 'enrollment',
    name: 'Enrollment Services',
    label: ['Enrollment', 'Services'],
    categories: ['services'],
    kind: 'building',
    summary:
      'Admissions, financial aid, the registrar, and the cashier, inside the Olympus Way gate at 1 Olympus Way. The Title IX office is in Room 210.',
    photo: photos.quad,
    hours: [{ days: 'Weekdays', time: '9 a.m. to 4 p.m.' }],
    departments: [
      'Admissions and campus visits',
      'Financial aid',
      'Registrar',
      'Cashier and billing',
      'Title IX and civil rights (Room 210)',
    ],
    elevator: 'One elevator in the main lobby serves all three floors.',
    accessNotes: [
      'The west lobby on Olympus Way and the east door are both step-free.',
      'Each service counter has a seated section.',
    ],
    entrances: [
      { label: 'West lobby (Olympus Way)', x: 830, y: 735, node: 'ow', stepFree: true },
      { label: 'East door', x: 965, y: 735, node: 'agw', stepFree: true },
    ],
    rects: [[830, 680, 135, 110]],
    keywords: 'admissions financial aid registrar cashier billing transcript title ix visit tours',
    link: { href: '/admissions/#visit', label: 'Visit campus' },
  },
  {
    id: 'rec',
    name: 'Tharsis Recreation Center',
    label: ['Tharsis', 'Rec Center'],
    categories: ['services'],
    kind: 'building',
    summary: 'Gym, pool, and climbing wall in the southwest corner. Membership is included in tuition for 2026–27.',
    photo: photos.students,
    hours: [
      { days: 'Monday to Friday', time: '6 a.m. to 11 p.m.' },
      { days: 'Saturday and Sunday', time: '8 a.m. to 9 p.m.' },
    ],
    departments: ['Fitness floor', 'Pool', 'Climbing wall', 'Intramural sports office'],
    elevator: 'One elevator by the east entrance. The pool has a lift.',
    accessNotes: ['The east entrance is step-free.', 'The north door has four steps.', 'Accessible family changing rooms are by the pool.'],
    entrances: [
      { label: 'East entrance', x: 410, y: 760, node: 'rE', stepFree: true },
      { label: 'North door (four steps)', x: 330, y: 700, node: 'vw', stepFree: false },
    ],
    rects: [[250, 700, 160, 120]],
    keywords: 'gym fitness pool climbing sports intramural rec recreation',
    link: { href: '/students/', label: 'Campus life' },
  },
  {
    id: 'safety',
    name: 'Campus Safety',
    label: ['Campus Safety'],
    labelOutside: { x: 952, y: 852, anchor: 'start' },
    categories: ['services'],
    kind: 'building',
    summary: 'The campus safety office at the Olympus Way gate. UM Alert messages are sent from here. Lost and found is at the front counter.',
    photo: photos.quad,
    hours: [{ days: 'Daily', time: 'Open 24 hours' }],
    departments: ['Campus Safety dispatch', 'UM Alert', 'Lost and found'],
    elevator: 'Single story. No elevator needed.',
    accessNotes: ['The west door is at grade and has an intercom at seated height.'],
    entrances: [{ label: 'West door', x: 870, y: 848, node: 'gate', stepFree: true }],
    rects: [[870, 825, 70, 45]],
    keywords: 'police security safety alert lost and found escort emergency',
    link: { href: '/emergency/', label: 'Emergency information' },
  },
];

const stop = (
  id: string,
  name: string,
  x: number,
  y: number,
  node: string,
  summary: string,
  extra: HoursRow[] = [],
): Place => ({
  id,
  name: `${name} shuttle stop`,
  label: [name],
  categories: ['transit'],
  kind: 'stop',
  summary,
  hours: [...shuttleHours, ...extra],
  departments: ['Rim Loop shuttle, clockwise'],
  elevator: 'Not applicable.',
  accessNotes: shuttleAccess,
  entrances: [{ label: 'Shelter', x, y, node, stepFree: true, plaza: true }],
  rects: [[x - 11, y - 11, 22, 22]],
  keywords: 'shuttle bus stop rim loop transit ride',
});

const lateBus: HoursRow = { days: 'Late bus', time: 'To Syrtis Court and Elysium Hall until 12:15 a.m.' };

export const stops: Place[] = [
  stop('stop-library', 'Library Loop', 840, 212, 'loop', 'The turnaround north of the University Library. The late bus leaves from here.', [lateBus]),
  stop('stop-syrtis', 'Syrtis Court', 560, 165, 'syw', 'On the Rim Road, across the crosswalk from Syrtis Court.', [lateBus]),
  stop('stop-elysium', 'Elysium Hall', 215, 455, 'elE', 'On the west Rim Road, by the Elysium Hall courtyard.', [lateBus]),
  stop('stop-union', 'Union and Rec', 430, 905, 'sw', 'On the south Rim Road, between the Student Union and the rec center.'),
  stop('stop-gate', 'Olympus Way Gate', 735, 905, 'gate', 'At the main gate. Visitor parking is south of the gate on Olympus Way.'),
  stop('stop-science', 'Science Row', 1340, 525, 'lab', 'On the east Rim Road at the end of Lab Lane.'),
];

export const allPlaces: Place[] = [...places, ...stops];

export const walkNodes: WalkNode[] = [
  { id: 'qnw', x: 620, y: 400 },
  { id: 'qn', x: 800, y: 400 },
  { id: 'qne', x: 980, y: 400 },
  { id: 'qw', x: 620, y: 520 },
  { id: 'tower', x: 800, y: 520 },
  { id: 'qe', x: 980, y: 520 },
  { id: 'qsw', x: 620, y: 640 },
  { id: 'qsm', x: 700, y: 640 },
  { id: 'qs', x: 800, y: 640 },
  { id: 'qse', x: 980, y: 640 },
  { id: 'loop', x: 800, y: 238 },
  { id: 'syw', x: 640, y: 238 },
  { id: 'cw', x: 640, y: 300 },
  { id: 'ne', x: 940, y: 238 },
  { id: 'ie', x: 940, y: 300 },
  { id: 'nn', x: 1100, y: 205 },
  { id: 'obw', x: 1100, y: 285 },
  { id: 'mw1', x: 1030, y: 388 },
  { id: 'sr0', x: 1150, y: 365 },
  { id: 'sr1', x: 1150, y: 450 },
  { id: 'sr15', x: 1150, y: 525 },
  { id: 'sr2', x: 1150, y: 580 },
  { id: 'sr3', x: 1150, y: 655 },
  { id: 'sr4', x: 1150, y: 720 },
  { id: 'lab', x: 1325, y: 525 },
  { id: 'cafe', x: 1055, y: 553 },
  { id: 'hw', x: 1070, y: 650 },
  { id: 'agw', x: 988, y: 730 },
  { id: 'hn', x: 530, y: 388 },
  { id: 'wn', x: 430, y: 388 },
  { id: 'elE', x: 430, y: 450 },
  { id: 'ec', x: 330, y: 542 },
  { id: 'ec2', x: 430, y: 542 },
  { id: 'ws', x: 430, y: 595 },
  { id: 'wsu', x: 430, y: 650 },
  { id: 'un', x: 520, y: 650 },
  { id: 'vw', x: 330, y: 662 },
  { id: 'rE', x: 430, y: 760 },
  { id: 'sw', x: 430, y: 862 },
  { id: 'uE', x: 618, y: 720 },
  { id: 'sw2', x: 618, y: 862 },
  { id: 'ow', x: 800, y: 735 },
  { id: 'gate', x: 800, y: 882 },
];

const chain = (name: string, ids: string[], stairs = false): WalkEdge[] =>
  ids.slice(1).map((id, i) => ({ from: ids[i] as string, to: id, name, stairs }));

export const walkEdges: WalkEdge[] = [
  ...chain('the Quad Walk', ['qnw', 'qn', 'qne', 'qe', 'qse', 'qs', 'qsm', 'qsw', 'qw', 'qnw']),
  ...chain('the Tower Walk', ['qn', 'tower', 'qs']),
  ...chain('the Cross Walk', ['qw', 'tower', 'qe']),
  ...chain('the diagonal walk', ['qnw', 'tower'], true),
  ...chain('the diagonal walk', ['qne', 'tower'], true),
  ...chain('the diagonal walk', ['qsw', 'tower'], true),
  ...chain('the diagonal walk', ['qse', 'tower'], true),
  ...chain('the North Walk', ['syw', 'loop', 'ne']),
  ...chain('the Syrtis Walk', ['syw', 'cw', 'qnw']),
  ...chain('the Isidis Walk', ['ne', 'ie', 'qne']),
  ...chain('the Mesa Walk', ['qne', 'mw1', 'sr0']),
  ...chain('the Rim Path', ['ne', 'nn', 'obw']),
  ...chain('the Observatory Steps', ['obw', 'sr0'], true),
  ...chain('Science Row', ['sr0', 'sr1', 'sr15', 'sr2', 'sr3', 'sr4']),
  ...chain('Lab Lane', ['sr15', 'lab']),
  ...chain('the Café Walk', ['qe', 'cafe', 'sr2']),
  ...chain('the Health Walk', ['qse', 'hw', 'sr3']),
  ...chain('the Argyre Walk', ['qse', 'agw']),
  ...chain('the College Walk', ['qnw', 'hn', 'wn']),
  ...chain('the Village Walk', ['wn', 'elE', 'ec2', 'ws', 'wsu', 'rE', 'sw']),
  ...chain('Commons Lane', ['ec', 'ec2']),
  ...chain('Commons Lane', ['vw', 'wsu']),
  ...chain('the Union Walk', ['wsu', 'un', 'qsw']),
  ...chain('the Hall Walk', ['qsw', 'uE', 'sw2']),
  ...chain('the South Walk', ['sw', 'sw2', 'gate']),
  ...chain('Olympus Way', ['qs', 'ow', 'gate']),
];

/** The Rim Road loop and the Library Loop spur, drawn under the shuttle line. */
export const rimRoad =
  'M 430 165 H 1250 Q 1340 165 1340 255 V 815 Q 1340 905 1250 905 H 300 Q 215 905 215 820 V 370 Q 215 165 430 165 Z';
export const libraryLoop = 'M 800 165 V 190 A 22 22 0 1 0 800.1 190';
