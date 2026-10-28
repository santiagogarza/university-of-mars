/**
 * Spring Semester 2027 sample schedule of classes for the course planner.
 * Every course, section, instructor, room, and seat count is fictional.
 */

export type DayCode = 'M' | 'T' | 'W' | 'R' | 'F';
export type MeetingKind = 'Lecture' | 'Lab' | 'Discussion' | 'Seminar' | 'Studio' | 'Clinical';

export type Meeting = {
  kind: MeetingKind;
  days: DayCode[];
  /** 24-hour campus clock, "HH:MM". */
  start: string;
  end: string;
  building: string;
  room: string;
};

export type Section = {
  id: string;
  instructor: string;
  seats: number;
  capacity: number;
  meetings: Meeting[];
};

export type Course = {
  code: string;
  dept: string;
  number: number;
  title: string;
  credits: number;
  /** Every inner list is one requirement; any course in it satisfies that requirement. */
  prereqs: string[][];
  summary: string;
  sections: Section[];
};

export const DAYS: { code: DayCode; short: string; long: string; ics: string }[] = [
  { code: 'M', short: 'Mon', long: 'Monday', ics: 'MO' },
  { code: 'T', short: 'Tue', long: 'Tuesday', ics: 'TU' },
  { code: 'W', short: 'Wed', long: 'Wednesday', ics: 'WE' },
  { code: 'R', short: 'Thu', long: 'Thursday', ics: 'TH' },
  { code: 'F', short: 'Fri', long: 'Friday', ics: 'FR' },
];

export const BUILDINGS: Record<string, string> = {
  ARG: 'Argyre Hall',
  ARS: 'Ares Health Sciences',
  DMS: 'Deimos Studios',
  GAL: 'Gale Hall',
  HEL: 'Hellas Hall',
  LIB: 'University Library',
  NOC: 'Noctis Commons',
  OBS: 'Jezero Observatory',
  PHB: 'Phobos Lecture Hall',
  TSP: 'Tharsis Science Pavilion',
  UTO: 'Utopia Hall',
  VEC: 'Valles Engineering Center',
};

export const DEPARTMENTS: { code: string; name: string; college: string }[] = [
  { code: 'ARTS', name: 'Studio Art', college: 'Arts & Letters' },
  { code: 'BIOL', name: 'Biology', college: 'Science' },
  { code: 'CHEM', name: 'Chemistry', college: 'Science' },
  { code: 'ECON', name: 'Economics', college: 'Public Policy' },
  { code: 'EDUC', name: 'Education', college: 'Education' },
  { code: 'EECE', name: 'Electrical Engineering', college: 'Engineering' },
  { code: 'ENGL', name: 'English', college: 'Arts & Letters' },
  { code: 'ENVE', name: 'Environmental Engineering', college: 'Engineering' },
  { code: 'GEOL', name: 'Geology', college: 'Science' },
  { code: 'HIST', name: 'History', college: 'Arts & Letters' },
  { code: 'MATH', name: 'Mathematics', college: 'Science' },
  { code: 'MECH', name: 'Mechanical Engineering', college: 'Engineering' },
  { code: 'NURS', name: 'Nursing', college: 'Health' },
  { code: 'PHIL', name: 'Philosophy', college: 'Arts & Letters' },
  { code: 'PHYS', name: 'Physics', college: 'Science' },
  { code: 'PLSC', name: 'Planetary Science', college: 'Science' },
  { code: 'PPOL', name: 'Public Policy', college: 'Public Policy' },
  { code: 'PUBH', name: 'Public Health', college: 'Health' },
  { code: 'SPAN', name: 'Spanish', college: 'Arts & Letters' },
];

/** The sample second-year student whose record the planner checks prerequisites against. */
export const SAMPLE_RECORD: string[] = [
  'BIOL 110',
  'CHEM 111',
  'ECON 101',
  'ENGL 101',
  'HIST 105',
  'MATH 121',
  'MATH 122',
  'PHYS 151',
  'PLSC 101',
  'SPAN 101',
];

/** Spring Semester 2027 instruction, from the academic calendar. */
export const TERM = {
  name: 'Spring Semester 2027',
  firstDay: '2027-01-04',
  lastDay: '2027-04-30',
  /** Presidents Day and spring recess. Classes do not meet. */
  noClassDays: ['2027-02-15', '2027-03-22', '2027-03-23', '2027-03-24', '2027-03-25', '2027-03-26'],
  minCredits: 12,
  maxCredits: 18,
};

function m(kind: MeetingKind, days: string, start: string, end: string, where: string): Meeting {
  const [building = '', room = ''] = where.split(' ');
  return { kind, days: days.split('') as DayCode[], start, end, building, room };
}

function sec(id: string, instructor: string, seats: number, capacity: number, ...meetings: Meeting[]): Section {
  return { id, instructor, seats, capacity, meetings };
}

function course(
  code: string,
  title: string,
  credits: number,
  prereqs: string,
  summary: string,
  ...sections: Section[]
): Course {
  const [dept = '', number = '0'] = code.split(' ');
  return {
    code,
    dept,
    number: Number(number),
    title,
    credits,
    prereqs: prereqs
      ? prereqs.split(',').map((group) => group.split('|').map((item) => item.trim()))
      : [],
    summary,
    sections,
  };
}

export const COURSES: Course[] = [
  // Studio Art
  course(
    'ARTS 120',
    'Drawing the Red Landscape',
    3,
    '',
    'Observational drawing from the quad and the crater rim. Bring a sketchbook and a dust cloth.',
    sec('001', 'Inés Valcárcel', 4, 18, m('Studio', 'MW', '13:00', '15:30', 'DMS 102')),
    sec('002', 'Theo Marchetti', 11, 18, m('Studio', 'TR', '09:30', '12:00', 'DMS 102')),
  ),
  course(
    'ARTS 230',
    'Ceramics in Low Humidity',
    3,
    'ARTS 120',
    'Wheel and hand building with regolith clay bodies. Glaze firings run on Fridays.',
    sec('001', 'Theo Marchetti', 2, 14, m('Studio', 'TR', '13:00', '15:30', 'DMS 110')),
  ),
  course(
    'ARTS 345',
    'Digital Imaging and the Rover Archive',
    3,
    'ARTS 120',
    'Color, composite, and restoration work using public mission imagery.',
    sec('001', 'Inés Valcárcel', 9, 16, m('Studio', 'MW', '16:00', '18:30', 'DMS 204')),
  ),

  // Biology
  course(
    'BIOL 110',
    'Principles of Biology',
    4,
    '',
    'Cells, genetics, and evolution, with weekly labs in the science pavilion.',
    sec(
      '001',
      'Hana Lindqvist',
      38,
      180,
      m('Lecture', 'MWF', '09:00', '09:50', 'PHB 100'),
      m('Lab', 'T', '13:00', '15:50', 'TSP 140'),
    ),
    sec(
      '002',
      'Hana Lindqvist',
      21,
      180,
      m('Lecture', 'MWF', '09:00', '09:50', 'PHB 100'),
      m('Lab', 'R', '13:00', '15:50', 'TSP 140'),
    ),
  ),
  course(
    'BIOL 210',
    'Cell Biology',
    4,
    'BIOL 110, CHEM 111',
    'Membranes, signaling, and the cell cycle. The lab section cultures yeast under low pressure.',
    sec(
      '001',
      'Kwame Asante',
      14,
      72,
      m('Lecture', 'MWF', '11:00', '11:50', 'TSP 210'),
      m('Lab', 'T', '13:00', '15:50', 'TSP 144'),
    ),
  ),
  course(
    'BIOL 225',
    'Astrobiology',
    3,
    'BIOL 110',
    'What life needs, where it might persist, and how we would recognize it.',
    sec('001', 'Priya Raman', 6, 60, m('Lecture', 'TR', '09:30', '10:45', 'TSP 210')),
    sec('002', 'Priya Raman', 0, 60, m('Lecture', 'TR', '14:00', '15:15', 'TSP 210')),
  ),
  course(
    'BIOL 330',
    'Genetics',
    4,
    'BIOL 210',
    'Transmission, molecular, and population genetics, with a problem-solving discussion.',
    sec(
      '001',
      'Kwame Asante',
      19,
      64,
      m('Lecture', 'TR', '11:00', '12:15', 'TSP 220'),
      m('Discussion', 'F', '10:00', '10:50', 'TSP 118'),
    ),
  ),
  course(
    'BIOL 412',
    'Closed-Habitat Ecology',
    3,
    'BIOL 210|BIOL 225',
    'Nutrient loops, microbial balance, and the greenhouse domes as a field site.',
    sec('001', 'Priya Raman', 8, 24, m('Seminar', 'W', '14:00', '16:45', 'TSP 301')),
  ),

  // Chemistry
  course(
    'CHEM 112',
    'General Chemistry II',
    4,
    'CHEM 111',
    'Equilibrium, kinetics, thermodynamics, and electrochemistry.',
    sec(
      '001',
      'Mateo Ferreira',
      12,
      160,
      m('Lecture', 'MWF', '10:00', '10:50', 'PHB 100'),
      m('Lab', 'W', '13:00', '15:50', 'TSP 150'),
    ),
    sec(
      '002',
      'Mateo Ferreira',
      27,
      160,
      m('Lecture', 'MWF', '10:00', '10:50', 'PHB 100'),
      m('Lab', 'R', '09:00', '11:50', 'TSP 150'),
    ),
    sec(
      '003',
      'Ada Nwosu',
      5,
      80,
      m('Lecture', 'TR', '15:30', '16:45', 'PHB 120'),
      m('Lab', 'F', '13:00', '15:50', 'TSP 150'),
    ),
  ),
  course(
    'CHEM 231',
    'Organic Chemistry I',
    4,
    'CHEM 112',
    'Structure, mechanism, and synthesis of carbon compounds.',
    sec(
      '001',
      'Ada Nwosu',
      22,
      120,
      m('Lecture', 'TR', '11:00', '12:15', 'TSP 210'),
      m('Lab', 'M', '13:00', '15:50', 'TSP 152'),
    ),
  ),
  course(
    'CHEM 305',
    'Atmospheric Chemistry',
    3,
    'CHEM 112',
    'Carbon dioxide cycles, perchlorates, and the chemistry of a thin sky.',
    sec('001', 'Lena Okonkwo', 15, 40, m('Lecture', 'MW', '14:00', '15:15', 'TSP 220')),
  ),
  course(
    'CHEM 340',
    'Analytical Instrumentation',
    3,
    'CHEM 112',
    'Spectroscopy and chromatography on the instruments the rover teams use.',
    sec('001', 'Lena Okonkwo', 3, 20, m('Lab', 'TR', '13:00', '15:30', 'TSP 156')),
  ),

  // Economics
  course(
    'ECON 101',
    'Principles of Microeconomics',
    3,
    '',
    'Markets, prices, and the economics of a settlement that imports almost everything.',
    sec('001', 'Rafael Quintero', 44, 200, m('Lecture', 'MWF', '11:00', '11:50', 'PHB 120')),
    sec('002', 'Rafael Quintero', 31, 200, m('Lecture', 'TR', '12:30', '13:45', 'PHB 120')),
  ),
  course(
    'ECON 102',
    'Principles of Macroeconomics',
    3,
    'ECON 101',
    'Output, money, and trade across a two-planet supply chain.',
    sec('001', 'Mira Halvorsen', 17, 150, m('Lecture', 'TR', '09:30', '10:45', 'PHB 120')),
    sec('002', 'Mira Halvorsen', 52, 150, m('Lecture', 'MW', '18:00', '19:15', 'PHB 120')),
  ),
  course(
    'ECON 315',
    'Resource Economics',
    3,
    'ECON 101, MATH 121',
    'Water, power, and regolith as scarce goods, with case studies from the Jezero utility.',
    sec('001', 'Rafael Quintero', 10, 45, m('Lecture', 'MW', '09:30', '10:45', 'NOC 210')),
  ),

  // Education
  course(
    'EDUC 201',
    'Foundations of Teaching',
    3,
    '',
    'Learning theory and classroom practice, with observation hours in Jezero schools.',
    sec('001', 'Grace Mbatha', 13, 35, m('Lecture', 'TR', '12:30', '13:45', 'GAL 105')),
  ),
  course(
    'EDUC 340',
    'Science Teaching Methods',
    3,
    'EDUC 201',
    'Designing inquiry labs for middle school, from dust devils to plant growth.',
    sec('001', 'Grace Mbatha', 7, 24, m('Seminar', 'M', '16:00', '18:45', 'GAL 210')),
  ),

  // Electrical Engineering
  course(
    'EECE 201',
    'Circuit Analysis',
    4,
    'MATH 122, PHYS 151',
    'DC and AC circuits, op-amps, and a weekly bench lab.',
    sec(
      '001',
      'Soren Achterberg',
      9,
      90,
      m('Lecture', 'MWF', '13:00', '13:50', 'VEC 140'),
      m('Lab', 'R', '14:00', '16:50', 'VEC 220'),
    ),
  ),
  course(
    'EECE 315',
    'Signals and Systems',
    3,
    'EECE 201, MATH 221',
    'Transforms, filters, and sampling, applied to telemetry from orbit.',
    sec('001', 'Yuki Tanabe', 16, 60, m('Lecture', 'TR', '09:30', '10:45', 'VEC 140')),
  ),
  course(
    'EECE 420',
    'Power Systems for Settlements',
    3,
    'EECE 201',
    'Solar arrays, storage, and microgrids that ride out a dust season.',
    sec('001', 'Soren Achterberg', 12, 40, m('Lecture', 'MW', '15:30', '16:45', 'VEC 210')),
  ),

  // English
  course(
    'ENGL 101',
    'First-Year Writing',
    3,
    '',
    'Argument, research, and revision. Required in every college.',
    sec('001', 'Maeve Donnelly', 3, 22, m('Seminar', 'MWF', '08:00', '08:50', 'UTO 201')),
    sec('002', 'Jonah Whitfield', 8, 22, m('Seminar', 'TR', '11:00', '12:15', 'UTO 203')),
  ),
  course(
    'ENGL 210',
    'Literature of Exploration',
    3,
    'ENGL 101',
    'Travel writing and fiction from the polar voyages to the first Mars landings.',
    sec('001', 'Maeve Donnelly', 18, 40, m('Lecture', 'MW', '11:00', '12:15', 'UTO 110')),
    sec('002', 'Jonah Whitfield', 12, 40, m('Lecture', 'TR', '14:00', '15:15', 'UTO 110')),
  ),
  course(
    'ENGL 245',
    'Writing About Science',
    3,
    'ENGL 101',
    'Explaining research to the public: features, briefs, and a podcast script.',
    sec('001', 'Amaru Condori', 6, 20, m('Seminar', 'TR', '09:30', '10:45', 'LIB 310')),
  ),
  course(
    'ENGL 360',
    'Poetry Workshop',
    3,
    'ENGL 210',
    'Weekly workshop and a final chapbook. Readings in the library atrium.',
    sec('001', 'Amaru Condori', 2, 14, m('Seminar', 'W', '18:00', '20:45', 'LIB 310')),
  ),

  // Environmental Engineering
  course(
    'ENVE 220',
    'Water Treatment and Reuse',
    3,
    'CHEM 111',
    'Recovering water from ice, air, and wastewater in a closed system.',
    sec('001', 'Nadia Karimi', 20, 50, m('Lecture', 'MWF', '10:00', '10:50', 'VEC 210')),
  ),
  course(
    'ENVE 350',
    'Dust and Air Quality',
    3,
    'ENVE 220|CHEM 112',
    'Particulate transport, filtration, and indoor air in pressurized buildings.',
    sec('001', 'Nadia Karimi', 11, 36, m('Lecture', 'TR', '15:30', '16:45', 'VEC 210')),
  ),

  // Geology
  course(
    'GEOL 110',
    'Physical Geology',
    4,
    '',
    'Rocks, minerals, and landforms, with Friday field labs at the delta.',
    sec(
      '001',
      'Callum Reyes',
      25,
      90,
      m('Lecture', 'MW', '12:00', '12:50', 'TSP 230'),
      m('Lab', 'F', '09:00', '11:50', 'TSP 160'),
    ),
  ),
  course(
    'GEOL 240',
    'Sedimentology of the Jezero Delta',
    3,
    'GEOL 110',
    'Reading ancient rivers and lakes from layered rock.',
    sec('001', 'Callum Reyes', 9, 30, m('Lecture', 'TR', '11:00', '12:15', 'TSP 230')),
  ),
  course(
    'GEOL 355',
    'Volcanology',
    3,
    'GEOL 110',
    'Tharsis, Olympus Mons, and the physics of eruptions in low gravity.',
    sec('001', 'Freya Lund', 14, 30, m('Lecture', 'MW', '15:30', '16:45', 'TSP 230')),
  ),

  // History
  course(
    'HIST 105',
    'World History Since 1500',
    3,
    '',
    'Empires, revolutions, and the making of the modern world.',
    sec('001', 'Odile Brassard', 51, 150, m('Lecture', 'TR', '12:30', '13:45', 'ARG 100')),
  ),
  course(
    'HIST 220',
    'History of Spaceflight',
    3,
    '',
    'From rocketry clubs to permanent settlement, told through archives and oral histories.',
    sec('001', 'Desmond Achebe', 7, 80, m('Lecture', 'MWF', '10:00', '10:50', 'ARG 100')),
    sec('002', 'Desmond Achebe', 3, 80, m('Lecture', 'TR', '15:30', '16:45', 'ARG 100')),
  ),
  course(
    'HIST 310',
    'The Founding of Jezero',
    3,
    'HIST 105|HIST 220',
    'The settlement charter, its arguments, and the university founded in 2004.',
    sec('001', 'Odile Brassard', 12, 30, m('Seminar', 'W', '14:00', '16:45', 'LIB 220')),
  ),
  course(
    'HIST 335',
    'Science and Empire',
    3,
    'HIST 105',
    'Expeditions, collections, and who got to do science, from 1700 onward.',
    sec('001', 'Desmond Achebe', 15, 35, m('Lecture', 'TR', '09:30', '10:45', 'ARG 210')),
  ),

  // Mathematics
  course(
    'MATH 121',
    'Calculus I',
    4,
    '',
    'Limits, derivatives, and integrals, with a weekly problem session.',
    sec(
      '001',
      'Tomasz Wieczorek',
      18,
      120,
      m('Lecture', 'MWF', '08:00', '08:50', 'HEL 100'),
      m('Discussion', 'R', '08:00', '08:50', 'HEL 120'),
    ),
    sec(
      '002',
      'Lucía Herrera',
      26,
      120,
      m('Lecture', 'MWF', '12:00', '12:50', 'HEL 100'),
      m('Discussion', 'T', '12:00', '12:50', 'HEL 120'),
    ),
  ),
  course(
    'MATH 221',
    'Calculus III',
    4,
    'MATH 122',
    'Vectors, partial derivatives, and multiple integrals.',
    sec('001', 'Tomasz Wieczorek', 10, 80, m('Lecture', 'MWF', '09:00', '09:50', 'HEL 110'), m('Discussion', 'R', '10:00', '10:50', 'HEL 120')),
    sec('002', 'Lucía Herrera', 4, 80, m('Lecture', 'TR', '14:00', '15:15', 'HEL 110'), m('Discussion', 'F', '14:00', '14:50', 'HEL 120')),
    sec('003', 'Anjali Deshpande', 0, 40, m('Lecture', 'MW', '18:00', '19:50', 'HEL 110')),
  ),
  course(
    'MATH 240',
    'Linear Algebra',
    3,
    'MATH 122',
    'Vector spaces, matrices, eigenvalues, and applications to orbits and images.',
    sec('001', 'Anjali Deshpande', 22, 60, m('Lecture', 'MWF', '13:00', '13:50', 'HEL 110')),
    sec('002', 'Bao Tran', 13, 60, m('Lecture', 'TR', '09:30', '10:45', 'HEL 110')),
  ),
  course(
    'MATH 250',
    'Differential Equations',
    3,
    'MATH 122',
    'Models of growth, oscillation, and cooling, solved by hand and by computer.',
    sec('001', 'Bao Tran', 9, 60, m('Lecture', 'MWF', '11:00', '11:50', 'HEL 110')),
    sec('002', 'Lucía Herrera', 30, 60, m('Lecture', 'TR', '15:30', '16:45', 'HEL 110')),
  ),
  course(
    'MATH 320',
    'Probability',
    3,
    'MATH 221',
    'Random variables, distributions, and limit theorems.',
    sec('001', 'Tomasz Wieczorek', 17, 45, m('Lecture', 'TR', '11:00', '12:15', 'HEL 210')),
  ),
  course(
    'MATH 431',
    'Orbital Mechanics',
    3,
    'MATH 250, PHYS 151',
    'Two-body motion, transfers, and the timing of Earth–Mars launch windows.',
    sec('001', 'Anjali Deshpande', 6, 25, m('Seminar', 'TR', '12:30', '13:45', 'OBS 101')),
  ),

  // Mechanical Engineering
  course(
    'MECH 210',
    'Statics',
    3,
    'PHYS 151, MATH 122',
    'Forces, moments, and equilibrium in structures built for one-third gravity.',
    sec('001', 'Ingrid Solberg', 15, 90, m('Lecture', 'MWF', '09:00', '09:50', 'VEC 140')),
    sec('002', 'Ingrid Solberg', 28, 90, m('Lecture', 'TR', '08:00', '09:15', 'VEC 140')),
  ),
  course(
    'MECH 320',
    'Thermodynamics',
    3,
    'MECH 210, CHEM 111',
    'Energy, entropy, and cycles for habitats and engines.',
    sec('001', 'Diego Salcedo', 11, 70, m('Lecture', 'TR', '11:00', '12:15', 'VEC 140')),
  ),
  course(
    'MECH 450',
    'Senior Design: Rover Systems',
    4,
    'MECH 320',
    'Spring capstone. Teams design, build, and test a rover subsystem for the field day.',
    sec(
      '001',
      'Diego Salcedo',
      5,
      30,
      m('Lecture', 'M', '14:00', '15:15', 'VEC 110'),
      m('Lab', 'W', '13:00', '16:50', 'VEC 001'),
    ),
  ),

  // Nursing
  course(
    'NURS 210',
    'Health Assessment',
    3,
    'BIOL 110',
    'History taking and physical examination, practiced in the simulation suite.',
    sec(
      '001',
      'Rosa Albanese',
      4,
      32,
      m('Lecture', 'M', '09:00', '10:50', 'ARS 120'),
      m('Clinical', 'W', '08:00', '10:50', 'ARS 210'),
    ),
  ),
  course(
    'NURS 320',
    'Care in Reduced Gravity',
    3,
    'NURS 210',
    'Bone loss, fluid shifts, and nursing practice in the Jezero clinic.',
    sec('001', 'Rosa Albanese', 9, 30, m('Lecture', 'TR', '08:00', '09:15', 'ARS 120')),
  ),

  // Philosophy
  course(
    'PHIL 110',
    'Introduction to Ethics',
    3,
    '',
    'What we owe each other, with readings from Aristotle to the settlement charter.',
    sec('001', 'Elias Oyelaran', 37, 100, m('Lecture', 'MWF', '13:00', '13:50', 'ARG 100')),
    sec('002', 'Elias Oyelaran', 20, 100, m('Lecture', 'TR', '17:00', '18:15', 'ARG 100')),
  ),
  course(
    'PHIL 280',
    'Philosophy of Science',
    3,
    '',
    'Evidence, explanation, and what would count as a discovery of life.',
    sec('001', 'Sung-min Park', 12, 35, m('Lecture', 'TR', '14:00', '15:15', 'ARG 210')),
  ),

  // Physics
  course(
    'PHYS 152',
    'Physics II: Electricity and Magnetism',
    4,
    'PHYS 151, MATH 122',
    'Fields, circuits, and waves, with weekly labs.',
    sec(
      '001',
      'Nikolai Varga',
      16,
      140,
      m('Lecture', 'MWF', '12:00', '12:50', 'PHB 100'),
      m('Lab', 'T', '09:00', '11:50', 'TSP 170'),
    ),
    sec(
      '002',
      'Nikolai Varga',
      8,
      140,
      m('Lecture', 'MWF', '12:00', '12:50', 'PHB 100'),
      m('Lab', 'R', '14:00', '16:50', 'TSP 170'),
    ),
  ),
  course(
    'PHYS 252',
    'Modern Physics',
    3,
    'PHYS 152, MATH 221',
    'Relativity, quantum mechanics, and atomic structure.',
    sec('001', 'Chiara Bellini', 19, 60, m('Lecture', 'TR', '11:00', '12:15', 'TSP 240')),
  ),
  course(
    'PHYS 330',
    'Atmospheric Physics',
    3,
    'PHYS 152',
    'Radiative balance, dust storms, and the thin carbon dioxide atmosphere.',
    sec('001', 'Chiara Bellini', 10, 40, m('Lecture', 'MW', '14:00', '15:15', 'TSP 240')),
  ),
  course(
    'PHYS 360',
    'Observational Astronomy',
    3,
    'PHYS 151',
    'Night labs at the observatory. Dress warmly; the dome is not heated.',
    sec(
      '001',
      'Wen Li',
      7,
      24,
      m('Lecture', 'T', '16:00', '17:15', 'OBS 101'),
      m('Lab', 'R', '19:00', '20:50', 'OBS 200'),
    ),
  ),

  // Planetary Science
  course(
    'PLSC 101',
    'Introduction to Planetary Science',
    3,
    '',
    'Planets, moons, and small bodies, and how we study them from the surface of one.',
    sec('001', 'Wen Li', 63, 220, m('Lecture', 'MWF', '14:00', '14:50', 'PHB 100')),
  ),
  course(
    'PLSC 210',
    'Mars Surface Processes',
    3,
    'PLSC 101',
    'Wind, ice, impacts, and water: how the ground outside the window got its shape.',
    sec('001', 'Freya Lund', 12, 60, m('Lecture', 'TR', '09:30', '10:45', 'TSP 230')),
    sec('002', 'Freya Lund', 24, 60, m('Lecture', 'MW', '11:00', '12:15', 'TSP 230')),
  ),
  course(
    'PLSC 315',
    'Remote Sensing',
    4,
    'PLSC 101, MATH 121',
    'Spectral imaging, orbital data, and a lab on mapping hydrated minerals.',
    sec(
      '001',
      'Ibrahim Haddad',
      8,
      30,
      m('Lecture', 'MW', '09:30', '10:45', 'TSP 240'),
      m('Lab', 'F', '13:00', '15:50', 'LIB 050'),
    ),
  ),
  course(
    'PLSC 410',
    'Comparative Planetology Seminar',
    3,
    'PLSC 210',
    'Reading group on current papers. Each student leads one session.',
    sec('001', 'Ibrahim Haddad', 5, 16, m('Seminar', 'F', '09:00', '11:45', 'OBS 101')),
  ),

  // Public Policy
  course(
    'PPOL 201',
    'Introduction to Public Policy',
    3,
    '',
    'How settlement rules get made, argued, and changed.',
    sec('001', 'Hollis Ambrose', 29, 90, m('Lecture', 'MW', '11:00', '12:15', 'NOC 100')),
  ),
  course(
    'PPOL 380',
    'Spring Policy Workshop',
    4,
    'PPOL 201, ECON 101',
    'Client project for a Jezero agency. Teams brief the council in April.',
    sec('001', 'Hollis Ambrose', 3, 20, m('Seminar', 'T', '13:00', '15:50', 'NOC 220'), m('Discussion', 'R', '13:00', '13:50', 'NOC 220')),
  ),

  // Public Health
  course(
    'PUBH 101',
    'Introduction to Public Health',
    3,
    '',
    'Health of populations, from air quality in the domes to vaccination campaigns.',
    sec('001', 'Thandiwe Mokoena', 40, 120, m('Lecture', 'TR', '08:00', '09:15', 'ARS 100')),
    sec('002', 'Thandiwe Mokoena', 18, 60, m('Lecture', 'W', '18:00', '20:45', 'ARS 100')),
  ),
  course(
    'PUBH 250',
    'Epidemiology',
    3,
    'PUBH 101, MATH 121',
    'Study design, measures of risk, and outbreak investigation.',
    sec('001', 'Thandiwe Mokoena', 14, 50, m('Lecture', 'MW', '14:00', '15:15', 'ARS 100')),
  ),

  // Spanish
  course(
    'SPAN 102',
    'Elementary Spanish II',
    4,
    'SPAN 101',
    'Speaking, listening, reading, and writing, four days a week.',
    sec('001', 'Pilar Montoya', 6, 24, m('Lecture', 'MTWR', '09:00', '09:50', 'UTO 105')),
    sec('002', 'Andrés Galeano', 11, 24, m('Lecture', 'MTWR', '13:00', '13:50', 'UTO 105')),
    sec('003', 'Pilar Montoya', 7, 24, m('Lecture', 'MTWR', '08:00', '08:50', 'UTO 105')),
  ),
  course(
    'SPAN 201',
    'Intermediate Spanish',
    3,
    'SPAN 102',
    'Conversation and composition, with short films and fiction.',
    sec('001', 'Andrés Galeano', 9, 24, m('Lecture', 'MWF', '10:00', '10:50', 'UTO 107')),
  ),
  course(
    'SPAN 320',
    'Science Fiction in Spanish',
    3,
    'SPAN 201',
    'Novels and stories from Spain and Latin America that imagined other worlds.',
    sec('001', 'Pilar Montoya', 13, 22, m('Seminar', 'TR', '14:00', '15:15', 'UTO 210')),
  ),
];

export function departmentName(code: string): string {
  return DEPARTMENTS.find((dept) => dept.code === code)?.name ?? code;
}

export function buildingName(code: string): string {
  return BUILDINGS[code] ?? code;
}
