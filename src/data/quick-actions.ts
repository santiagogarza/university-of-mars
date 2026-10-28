import { site } from './site';

export type QuickAction = {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: 'wrench' | 'aid' | 'calendar' | 'ticket' | 'list' | 'key' | 'phone' | 'book' | 'access' | 'map' | 'card';
  keywords: string;
  /** Shown before the person types anything. */
  featured?: boolean;
};

export const quickActions: QuickAction[] = [
  {
    id: 'report-repair',
    title: 'Report a housing repair',
    description: 'Open the Help Center form with Housing repair already chosen.',
    href: '/support/?category=housing-repair#request',
    icon: 'wrench',
    keywords: 'maintenance broken fix leak heat plumbing work order residence hall dorm room',
    featured: true,
  },
  {
    id: 'aid-status',
    title: 'Check my aid status',
    description: 'Holds, verification, and disbursement for aid year 2026–27.',
    href: '/financial-aid/#holds',
    icon: 'aid',
    keywords: 'financial aid hold disbursement refund fafsa grant loan verification status',
    featured: true,
  },
  {
    id: 'spring-calendar',
    title: 'Spring 2027 calendar',
    description: 'Instruction, add/drop, recess, and finals for Spring Semester 2027.',
    href: '/academics/calendar/#:~:text=Spring%20Semester%202027',
    icon: 'calendar',
    keywords: 'academic calendar dates deadlines add drop finals spring break semester registrar',
    featured: true,
  },
  {
    id: 'submit-request',
    title: 'Submit a Help Center request',
    description: 'Send a question to Student Support and get a UMS ticket number.',
    href: '/support/#request',
    icon: 'ticket',
    keywords: 'ticket help ask question contact support form',
    featured: true,
  },
  {
    id: 'my-requests',
    title: 'Track my requests',
    description: 'See the status of tickets you sent from this browser.',
    href: '/support/requests/',
    icon: 'list',
    keywords: 'ticket status my requests follow up',
    featured: true,
  },
  {
    id: 'reset-password',
    title: 'Reset my MyUM password',
    description: 'Unlock the account you use for registration, aid, and the bill.',
    href: '/support/articles/password/',
    icon: 'key',
    keywords: 'password locked out login sign in account myum reset',
    featured: true,
  },
  {
    id: 'call-safety',
    title: 'Call Campus Safety',
    description: `${site.safetyPhone}, answered 24 hours a day.`,
    href: site.safetyHref,
    icon: 'phone',
    keywords: 'emergency police security escort danger help now',
  },
  {
    id: 'library-hours',
    title: 'Spring library hours',
    description: 'The main library is open 8 a.m. to midnight on class days.',
    href: '/news/library-hours/',
    icon: 'book',
    keywords: 'library open hours study late night',
  },
  {
    id: 'accommodation',
    title: 'Request an accommodation',
    description: 'Start an academic, exam, or housing accommodation.',
    href: '/support/articles/accommodations/',
    icon: 'access',
    keywords: 'disability accessibility exam extra time accommodation',
  },
  {
    id: 'visit',
    title: 'Plan a campus visit',
    description: 'Tours of the Jezero campus for Fall 2027 applicants.',
    href: '/admissions/#visit',
    icon: 'map',
    keywords: 'tour visit campus admissions prospective',
  },
  {
    id: 'pay-bill',
    title: 'Pay or read my bill',
    description: 'Tuition, payment plans, and refunds from the cashier.',
    href: '/support/articles/billing/',
    icon: 'card',
    keywords: 'tuition bill payment plan cashier refund bursar',
  },
];
