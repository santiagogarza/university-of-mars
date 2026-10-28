export type NavLink = { label: string; href: string };
export type NavGroup = { title: string; links: NavLink[] };
export type NavItem = {
  id: string;
  label: string;
  href: string;
  summary: string;
  groups: NavGroup[];
};

export const utilityAudiences: NavLink[] = [
  { label: 'Students', href: '/students/' },
  { label: 'Faculty & Staff', href: '/faculty/' },
  { label: 'Parents & Families', href: '/parents/' },
  { label: 'Alumni', href: '/alumni/' },
];

export const utilityTools: NavLink[] = [
  { label: 'MyUM', href: '/login/' },
  { label: 'Campus map', href: '/campus-map/' },
  { label: 'Search', href: '/search/' },
];

export const primaryNav: NavItem[] = [
  {
    id: 'academics',
    label: 'Academics',
    href: '/academics/',
    summary: 'Eight colleges, the university library, and the registrar’s calendar.',
    groups: [
      {
        title: 'Study',
        links: [
          { label: 'Majors and programs', href: '/academics/' },
          { label: 'Colleges and schools', href: '/academics/#colleges' },
          { label: 'Graduate study', href: '/academics/#graduate' },
          { label: 'University Library', href: '/academics/#libraries' },
        ],
      },
      {
        title: 'Records',
        links: [
          { label: 'Academic calendar', href: '/academics/calendar/' },
          { label: 'Registration and records', href: '/support/articles/registration/' },
          { label: 'Help Center', href: '/support/' },
        ],
      },
    ],
  },
  {
    id: 'admissions',
    label: 'Admissions & Aid',
    href: '/admissions/',
    summary: 'Fall 2027 admission, tuition, and aid for the year you will enroll.',
    groups: [
      {
        title: 'Apply',
        links: [
          { label: 'First-year admission', href: '/admissions/' },
          { label: 'Transfer admission', href: '/admissions/#transfer' },
          { label: 'International students', href: '/admissions/#international' },
          { label: 'Visit campus', href: '/admissions/#visit' },
        ],
      },
      {
        title: 'Cost',
        links: [
          { label: 'Tuition and fees', href: '/admissions/#tuition' },
          { label: 'Financial aid', href: '/financial-aid/' },
          { label: 'Scholarships', href: '/financial-aid/#scholarships' },
        ],
      },
    ],
  },
  {
    id: 'campus',
    label: 'Campus Life',
    href: '/students/',
    summary: 'Housing, the Help Center, and the offices students use most.',
    groups: [
      {
        title: 'Live here',
        links: [
          { label: 'Housing and dining', href: '/housing/' },
          { label: 'Residence halls', href: '/housing/#halls' },
          { label: 'Spring move-in', href: '/housing/#move-in' },
        ],
      },
      {
        title: 'Support',
        links: [
          { label: 'Help Center', href: '/support/' },
          { label: 'Accessibility', href: '/accessibility/' },
          { label: 'Health and wellbeing', href: '/students/#health' },
          { label: 'Report a repair', href: '/support/?category=housing-repair#request' },
        ],
      },
    ],
  },
  {
    id: 'research',
    label: 'Research',
    href: '/research/',
    summary: 'Faculty research, the observatory, and funded work for undergraduates.',
    groups: [
      {
        title: 'On campus',
        links: [
          { label: 'Research at UM', href: '/research/' },
          { label: 'Centers and institutes', href: '/research/#centers' },
          { label: 'Core facilities', href: '/research/#facilities' },
        ],
      },
      {
        title: 'Students',
        links: [
          { label: 'Undergraduate research', href: '/research/#undergraduate' },
          { label: 'Summer fellowships', href: '/news/fellowships/' },
          { label: 'Jezero Observatory', href: '/research/#observatory' },
        ],
      },
    ],
  },
  {
    id: 'about',
    label: 'About',
    href: '/about/',
    summary: 'The Jezero campus, university leadership, and how to reach us.',
    groups: [
      {
        title: 'The university',
        links: [
          { label: 'About UM', href: '/about/' },
          { label: 'Campus map', href: '/campus-map/' },
          { label: 'Leadership', href: '/about/#leadership' },
          { label: 'Facts and figures', href: '/about/#facts' },
          { label: 'News', href: '/#news' },
        ],
      },
      {
        title: 'Offices',
        links: [
          { label: 'Title IX and civil rights', href: '/title-ix/' },
          { label: 'Emergency information', href: '/emergency/' },
          { label: 'Privacy', href: '/privacy/' },
          { label: 'Contact', href: '/about/#contact' },
        ],
      },
    ],
  },
];
