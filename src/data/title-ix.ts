export const howReceived = ['Online form', 'Email', 'In person', 'Phone', 'Third party'] as const;
export const reporterRoles = ['Complainant', 'Witness', 'Employee (mandatory reporter)', 'Anonymous'] as const;
export const affiliations = ['Student', 'Employee', 'Third party', 'Unknown'] as const;
export const allegations = [
  'Sexual harassment',
  'Sexual assault',
  'Dating violence',
  'Domestic violence',
  'Stalking',
  'Retaliation',
  'Other sex discrimination',
] as const;
export const measures = [
  'No-contact directive',
  'Class schedule change',
  'Housing change',
  'Counseling referral',
  'Academic extension',
  'None requested',
] as const;
export const nextSteps = [
  'Intake meeting scheduled',
  'Awaiting complainant response',
  'Formal complaint filed',
  'Informal resolution',
  'Closed: no further action',
] as const;
export const investigators = ['Coordinator (Title IX office)', 'Deputy coordinator A', 'Deputy coordinator B'] as const;

export const STAFF_TOKEN_KEY = 'um-staff-token';
export const LOCAL_CASES_KEY = 'um-title-ix-cases';
