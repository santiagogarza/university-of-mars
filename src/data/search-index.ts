import { site } from './site';

export type SearchItem = {
  title: string;
  href: string;
  group: string;
  text: string;
};

export const searchIndex: SearchItem[] = [
  {
    title: 'Student Support',
    href: '/support/',
    group: 'Help Center',
    text: 'search articles submit a request financial aid housing registration billing accounts accessibility',
  },
  {
    title: 'My requests',
    href: '/support/requests/',
    group: 'Help Center',
    text: 'ticket status requests you submitted',
  },
  {
    title: 'Financial aid hold',
    href: '/support/articles/financial-aid-hold/',
    group: 'Help Center',
    text: 'verification hold disbursement documents aid year 2026-27',
  },
  {
    title: 'Housing repair',
    href: '/support/articles/housing-repair/',
    group: 'Help Center',
    text: 'maintenance work order emergency repairs residence hall',
  },
  {
    title: 'Registration and records',
    href: '/support/articles/registration/',
    group: 'Help Center',
    text: 'add drop spring semester 2027 transcript enrollment',
  },
  {
    title: 'Password and MyUM sign-in',
    href: '/support/articles/password/',
    group: 'Help Center',
    text: 'password reset email account lock',
  },
  {
    title: 'Billing and payments',
    href: '/support/articles/billing/',
    group: 'Help Center',
    text: 'cashier tuition bill refund payment plan',
  },
  {
    title: 'Accommodations',
    href: '/support/articles/accommodations/',
    group: 'Help Center',
    text: 'disability access exam housing accommodation',
  },
  {
    title: 'Financial aid',
    href: '/financial-aid/',
    group: 'Offices',
    text: 'aid year 2026-27 grants loans scholarships verification holds cost of attendance',
  },
  {
    title: 'Housing and Residential Life',
    href: '/housing/',
    group: 'Offices',
    text: 'Olympus Mons Hall Isidis Syrtis Elysium move-in maintenance call housing support',
  },
  {
    title: 'Housing work orders',
    href: '/housing/work-orders/',
    group: 'Offices',
    text: 'facilities schedule booked repairs confirmation number',
  },
  {
    title: 'Accessibility',
    href: '/accessibility/',
    group: 'Offices',
    text: 'WCAG barrier report accommodation access',
  },
  {
    title: 'Admissions',
    href: '/admissions/',
    group: 'Admissions',
    text: 'Fall 2027 apply visit tuition transfer international',
  },
  {
    title: 'Academics',
    href: '/academics/',
    group: 'Academics',
    text: 'colleges majors library graduate programs',
  },
  {
    title: 'Academic calendar',
    href: '/academics/calendar/',
    group: 'Academics',
    text: 'fall 2026 spring semester 2027 finals commencement summer',
  },
  {
    title: 'Research',
    href: '/research/',
    group: 'Research',
    text: 'observatory undergraduate fellowship centers facilities',
  },
  {
    title: 'About the university',
    href: '/about/',
    group: 'About',
    text: `founded ${site.founded} leadership jezero chancellor contact`,
  },
  {
    title: 'Campus map',
    href: '/campus-map/',
    group: 'About',
    text: 'map buildings directions walking route shuttle stops step-free entrances elevators hours jezero campus',
  },
  {
    title: 'Title IX and civil rights',
    href: '/title-ix/',
    group: 'About',
    text: 'report harassment discrimination coordinator confidential',
  },
  {
    title: 'Emergency information',
    href: '/emergency/',
    group: 'About',
    text: 'campus safety UM Alert evacuation clock tower',
  },
  {
    title: 'Privacy',
    href: '/privacy/',
    group: 'About',
    text: 'FERPA directory information education records',
  },
  {
    title: 'Give',
    href: '/give/',
    group: 'Giving',
    text: 'Red Planet Scholars gift fund library',
  },
  {
    title: 'Students',
    href: '/students/',
    group: 'Audiences',
    text: 'student life health help center housing',
  },
  {
    title: 'Faculty and staff',
    href: '/faculty/',
    group: 'Audiences',
    text: 'syllabus grades research account',
  },
  {
    title: 'Parents and families',
    href: '/parents/',
    group: 'Audiences',
    text: 'family visit billing FERPA',
  },
  {
    title: 'Alumni',
    href: '/alumni/',
    group: 'Audiences',
    text: 'alumni weekend transcript records',
  },
];
