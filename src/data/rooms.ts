/**
 * Residence Hall Room Finder sample data. Every hall layout, rate, resident,
 * and opening here is fictional. Openings are computed from a fixed hash of
 * each room id, so the build and the browser always agree.
 */
import { roomStatus } from '../lib/room-finder.ts';
import type { RoomStatus, RoomType } from '../lib/room-finder.ts';

export const roomFinderAsOf = 'Monday, January 11, 2027';

export const PLAN_WIDTH = 1000;
export const PLAN_HEIGHT = 520;

export type Side = 'n' | 's' | 'e' | 'w';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SpaceKind =
  | 'stairs'
  | 'elevator'
  | 'bath'
  | 'lounge'
  | 'kitchen'
  | 'office'
  | 'lobby'
  | 'common'
  | 'staff'
  | 'atrium'
  | 'courtyard';

export interface Space extends Box {
  kind: SpaceKind;
  label: string;
}

export interface Room extends Box {
  id: string;
  number: string;
  hallId: string;
  hallName: string;
  floorId: string;
  floorLabel: string;
  type: RoomType;
  beds: number;
  taken: number;
  status: RoomStatus;
  sqft: number;
  rate: number;
  accessible: boolean;
  features: string[];
  view: string;
  roommates: string[];
  quiet: boolean;
  genderInclusive: boolean;
  door: Side;
}

export interface Floor {
  id: string;
  level: number;
  label: string;
  quiet: boolean;
  genderInclusive: boolean;
  note: string;
  outline: string;
  corridors: Box[];
  spaces: Space[];
  rooms: Room[];
}

export interface Hall {
  id: string;
  name: string;
  short: string;
  years: string;
  blurb: string;
  amenities: string[];
  floors: Floor[];
}

const BEDS: Record<RoomType, number> = {
  Single: 1,
  Double: 2,
  Triple: 3,
  'Suite single': 1,
  'Suite double': 2,
  'Studio apartment': 1,
  'Two-bedroom apartment': 2,
};

export const TYPE_ABBR: Record<RoomType, string> = {
  Single: 'SGL',
  Double: 'DBL',
  Triple: 'TPL',
  'Suite single': 'STE · 1',
  'Suite double': 'STE · 2',
  'Studio apartment': 'STUDIO',
  'Two-bedroom apartment': '2 BR',
};

const MAJORS = [
  'Geology',
  'Planetary science',
  'Mechanical engineering',
  'Nursing',
  'Public policy',
  'History',
  'Chemistry',
  'Studio art',
  'Environmental engineering',
  'Biology',
  'Economics',
  'Education',
  'Mathematics',
  'Physics',
  'English',
  'Public health',
];

const HABITS = [
  'early riser',
  'studies late',
  'quiet studier',
  'works weekends at the library desk',
  'plays intramural crater-ball',
  'keeps a basil plant on the sill',
  'often home on weekends',
  'cooks on Sundays',
];

/** FNV-1a, 32 bit. Stable across the build and the browser. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

function takenBeds(id: string, beds: number, busy: number): number {
  const roll = hash(`${id}:beds`) % 100;
  if (beds === 1) return roll < 34 + busy * 30 ? 1 : 0;
  if (roll < 22 + busy * 25) return beds;
  if (roll < 56 + busy * 15) return beds - 1;
  return beds === 3 ? roll % 2 : 0;
}

function residents(id: string, count: number, years: string[]): string[] {
  const list: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const roll = hash(`${id}:resident:${index}`);
    const year = years[roll % years.length];
    const major = MAJORS[(roll >>> 4) % MAJORS.length];
    const habit = HABITS[(roll >>> 9) % HABITS.length];
    list.push(`${year}, ${major}, ${habit}`);
  }
  return list;
}

interface Slot extends Box {
  n: string;
  door: Side;
  view: string;
}

interface HallSpec {
  id: string;
  name: string;
  short: string;
  years: string;
  residentYears: string[];
  blurb: string;
  amenities: string[];
  rates: Partial<Record<RoomType, number>>;
  sizes: Partial<Record<RoomType, number>>;
  features: string[];
  outline: string;
  corridors: Box[];
  slots: Slot[];
  spaces: Space[];
}

interface FloorSpec {
  level: number;
  quiet: boolean;
  genderInclusive: boolean;
  busy: number;
  note: string;
  types: Record<string, RoomType>;
  accessible: string[];
  /** Slot keys that are not rooms on this floor. */
  skip?: string[];
  extraSpaces?: Space[];
  roomNumber?: (slot: Slot, level: number) => string;
}

function buildHall(spec: HallSpec, floors: FloorSpec[]): Hall {
  return {
    id: spec.id,
    name: spec.name,
    short: spec.short,
    years: spec.years,
    blurb: spec.blurb,
    amenities: spec.amenities,
    floors: floors.map((floor) => {
      const floorId = `${spec.id}-${floor.level}`;
      const label = `Floor ${floor.level}`;
      const rooms: Room[] = [];
      for (const slot of spec.slots) {
        if (floor.skip?.includes(slot.n)) continue;
        const type = floor.types[slot.n] ?? 'Double';
        const number = floor.roomNumber ? floor.roomNumber(slot, floor.level) : `${floor.level}${slot.n}`;
        const id = `${spec.id}-${number}`.toLowerCase();
        const beds = BEDS[type];
        const taken = takenBeds(id, beds, floor.busy);
        const accessible = floor.accessible.includes(slot.n);
        const others = beds > 1 ? residents(id, taken, spec.residentYears) : [];
        rooms.push({
          id,
          number,
          hallId: spec.id,
          hallName: spec.name,
          floorId,
          floorLabel: label,
          type,
          beds,
          taken,
          status: roomStatus(beds, taken),
          sqft: (spec.sizes[type] ?? 200) + (hash(`${id}:size`) % 5) * 4,
          rate: spec.rates[type] ?? 5000,
          accessible,
          features: accessible ? spec.features : [],
          view: slot.view,
          roommates: others,
          quiet: floor.quiet,
          genderInclusive: floor.genderInclusive,
          door: slot.door,
          x: slot.x,
          y: slot.y,
          w: slot.w,
          h: slot.h,
        });
      }
      return {
        id: floorId,
        level: floor.level,
        label,
        quiet: floor.quiet,
        genderInclusive: floor.genderInclusive,
        note: floor.note,
        outline: spec.outline,
        corridors: spec.corridors,
        spaces: [...spec.spaces, ...(floor.extraSpaces ?? [])],
        rooms,
      };
    }),
  };
}

const RECT_OUTLINE = 'M30 40 H970 V480 H30 Z';

/* Olympus Mons Hall: a double-loaded corridor of traditional rooms. */
const omNorth = 'Service drive and the dining commons';
const omSouth = 'South quad lawn';
const olympus = buildHall(
  {
    id: 'olympus-mons',
    name: 'Olympus Mons Hall',
    short: 'Olympus Mons',
    years: 'First-year',
    residentYears: ['First-year'],
    blurb: 'Traditional rooms on the south quad. Staffed desk until midnight.',
    amenities: ['Staffed desk until midnight', 'Community bathroom on each floor', 'Study lounge on floors 2 and 3'],
    rates: { Single: 5480, Double: 4720, Triple: 4180 },
    sizes: { Single: 142, Double: 208, Triple: 286 },
    features: [
      'Roll-in shower in the room',
      '36-inch doorway with automatic opener',
      'Lowered closet rod and desk',
      'Strobe and bed-shaker fire alarm',
    ],
    outline: RECT_OUTLINE,
    corridors: [{ x: 40, y: 220, w: 920, h: 80 }],
    slots: [
      { n: '01', x: 40, y: 50, w: 86, h: 170, door: 's', view: `Corner: ${omNorth.toLowerCase()} and the western mesas` },
      { n: '02', x: 126, y: 50, w: 86, h: 170, door: 's', view: omNorth },
      { n: '03', x: 212, y: 50, w: 86, h: 170, door: 's', view: omNorth },
      { n: '04', x: 298, y: 50, w: 86, h: 170, door: 's', view: omNorth },
      { n: '05', x: 384, y: 50, w: 86, h: 170, door: 's', view: omNorth },
      { n: '06', x: 530, y: 50, w: 86, h: 170, door: 's', view: omNorth },
      { n: '07', x: 616, y: 50, w: 86, h: 170, door: 's', view: omNorth },
      { n: '08', x: 702, y: 50, w: 86, h: 170, door: 's', view: omNorth },
      { n: '09', x: 788, y: 50, w: 86, h: 170, door: 's', view: omNorth },
      { n: '10', x: 874, y: 50, w: 86, h: 170, door: 's', view: 'Corner: the clock tower over the main quad' },
      { n: '11', x: 874, y: 300, w: 86, h: 170, door: 'n', view: 'Corner: south quad and the observatory dome' },
      { n: '12', x: 788, y: 300, w: 86, h: 170, door: 'n', view: omSouth },
      { n: '13', x: 702, y: 300, w: 86, h: 170, door: 'n', view: omSouth },
      { n: '15', x: 212, y: 300, w: 86, h: 170, door: 'n', view: omSouth },
      { n: '16', x: 126, y: 300, w: 86, h: 170, door: 'n', view: omSouth },
      { n: '17', x: 40, y: 300, w: 86, h: 170, door: 'n', view: 'Corner: south quad and the mesas at sunset' },
    ],
    spaces: [
      { kind: 'stairs', label: 'Stairs', x: 470, y: 50, w: 60, h: 170 },
      { kind: 'staff', label: 'RA', x: 298, y: 300, w: 86, h: 170 },
      { kind: 'bath', label: 'Bath', x: 384, y: 300, w: 86, h: 170 },
      { kind: 'elevator', label: 'Lift', x: 470, y: 300, w: 60, h: 170 },
    ],
  },
  [
    {
      level: 1,
      quiet: false,
      genderInclusive: false,
      busy: 0.35,
      note: 'Lobby and the hall desk are on this floor.',
      types: { '01': 'Triple', '05': 'Single', '06': 'Single', '10': 'Triple', '11': 'Triple', '17': 'Triple' },
      accessible: ['13', '15'],
      extraSpaces: [{ kind: 'lobby', label: 'Lobby and desk', x: 530, y: 300, w: 172, h: 170 }],
    },
    {
      level: 2,
      quiet: false,
      genderInclusive: true,
      busy: 0.15,
      note: 'Gender-inclusive floor. Any two students may share a double.',
      types: { '01': 'Triple', '05': 'Single', '06': 'Single', '10': 'Triple', '11': 'Triple', '17': 'Triple' },
      accessible: ['13'],
      extraSpaces: [{ kind: 'lounge', label: 'Study lounge', x: 530, y: 300, w: 172, h: 170 }],
    },
    {
      level: 3,
      quiet: true,
      genderInclusive: false,
      busy: 0.5,
      note: 'Quiet floor. Quiet hours start at 8 p.m. every night.',
      types: { '01': 'Triple', '04': 'Single', '05': 'Single', '06': 'Single', '10': 'Triple', '11': 'Triple', '17': 'Triple' },
      accessible: ['13'],
      extraSpaces: [{ kind: 'lounge', label: 'Study lounge', x: 530, y: 300, w: 172, h: 170 }],
    },
  ],
);

/* Isidis Hall: four-bedroom suites around common rooms, kitchen on each floor. */
const isNorth = 'Library green and the reading-room windows';
const isSouth = 'Eastern mesas at sunrise';
function suiteSlots(suite: number, x0: number, north: boolean): Slot[] {
  return ['A', 'B', 'C', 'D'].map((letter, index) => {
    const corner = (x0 === 40 && index === 0) || (x0 === 560 && index === 3);
    const view = north ? isNorth : isSouth;
    return {
      n: `${suite}${letter}`,
      x: x0 + index * 100,
      y: north ? 50 : 360,
      w: 100,
      h: 110,
      door: north ? 's' : 'n',
      view: corner ? `Corner: ${view.charAt(0).toLowerCase()}${view.slice(1)}` : view,
    };
  });
}
const isidisTypes: Record<string, RoomType> = {};
for (const suite of [1, 2, 3, 4]) {
  isidisTypes[`${suite}A`] = 'Suite double';
  isidisTypes[`${suite}B`] = 'Suite single';
  isidisTypes[`${suite}C`] = 'Suite single';
  isidisTypes[`${suite}D`] = 'Suite double';
}
const isidis = buildHall(
  {
    id: 'isidis',
    name: 'Isidis Hall',
    short: 'Isidis',
    years: 'First- and second-year',
    residentYears: ['First-year', 'Second-year'],
    blurb: 'Suites east of the library. Shared kitchen on each floor.',
    amenities: ['Shared kitchen on each floor', 'Four bedrooms per suite with a common room', 'Housing office in Room 10'],
    rates: { 'Suite single': 5860, 'Suite double': 5140 },
    sizes: { 'Suite single': 128, 'Suite double': 186 },
    features: [
      'Roll-in shower in the suite bathroom',
      'Wide suite doorways and lever handles',
      'Lowered counter in the floor kitchen',
      'Strobe and bed-shaker fire alarm',
    ],
    outline: RECT_OUTLINE,
    corridors: [{ x: 40, y: 230, w: 920, h: 60 }],
    slots: [...suiteSlots(1, 40, true), ...suiteSlots(2, 560, true), ...suiteSlots(3, 40, false), ...suiteSlots(4, 560, false)],
    spaces: [
      { kind: 'common', label: 'Suite 1 common room', x: 40, y: 160, w: 400, h: 70 },
      { kind: 'kitchen', label: 'Shared kitchen', x: 440, y: 50, w: 120, h: 180 },
      { kind: 'common', label: 'Suite 2 common room', x: 560, y: 160, w: 400, h: 70 },
      { kind: 'stairs', label: 'Stairs', x: 440, y: 290, w: 120, h: 90 },
      { kind: 'elevator', label: 'Lift', x: 440, y: 380, w: 120, h: 90 },
      { kind: 'common', label: 'Suite 4 common room', x: 560, y: 290, w: 400, h: 70 },
    ],
  },
  [
    {
      level: 1,
      quiet: false,
      genderInclusive: true,
      busy: 0.2,
      note: 'The housing office is in Room 10 on this floor. Gender-inclusive suites.',
      types: isidisTypes,
      accessible: ['4A'],
      skip: ['3A', '3B', '3C', '3D'],
      extraSpaces: [{ kind: 'office', label: 'Housing office · Room 10', x: 40, y: 290, w: 400, h: 180 }],
    },
    {
      level: 2,
      quiet: true,
      genderInclusive: false,
      busy: 0.3,
      note: 'Quiet floor. Quiet hours start at 8 p.m. every night.',
      types: isidisTypes,
      accessible: ['4A'],
      extraSpaces: [{ kind: 'common', label: 'Suite 3 common room', x: 40, y: 290, w: 400, h: 70 }],
    },
    {
      level: 3,
      quiet: true,
      genderInclusive: true,
      busy: 0.05,
      note: 'Quiet, gender-inclusive floor. Kitchen closes at 11 p.m.',
      types: isidisTypes,
      accessible: ['4A', '3D'],
      extraSpaces: [{ kind: 'common', label: 'Suite 3 common room', x: 40, y: 290, w: 400, h: 70 }],
    },
  ],
);

/* Syrtis Court: an L of apartments around a courtyard, open-air galleries. */
const syNorth = 'Open plain toward the northern ridge';
const syEast = 'Courtyard string lights and the greenhouse';
const syrtis = buildHall(
  {
    id: 'syrtis',
    name: 'Syrtis Court',
    short: 'Syrtis',
    years: 'Upper-division',
    residentYears: ['Third-year', 'Fourth-year'],
    blurb: 'Apartments on the north edge of campus. Nine- and twelve-month contracts.',
    amenities: ['Full kitchen in every apartment', 'Nine- and twelve-month contracts', 'Courtyard with string lights'],
    rates: { 'Studio apartment': 6620, 'Two-bedroom apartment': 5960 },
    sizes: { 'Studio apartment': 368, 'Two-bedroom apartment': 748 },
    features: [
      'Step-free entry from the gallery',
      'Roll-in shower and grab bars',
      'Lowered kitchen counter and cooktop',
      'Strobe and bed-shaker fire alarm',
    ],
    outline: 'M30 40 H970 V480 H740 V260 H30 Z',
    corridors: [
      { x: 40, y: 200, w: 760, h: 50 },
      { x: 750, y: 200, w: 50, h: 270 },
    ],
    slots: [
      { n: '01', x: 40, y: 50, w: 120, h: 150, door: 's', view: syNorth },
      { n: '02', x: 160, y: 50, w: 120, h: 150, door: 's', view: syNorth },
      { n: '03', x: 280, y: 50, w: 120, h: 150, door: 's', view: syNorth },
      { n: '04', x: 400, y: 50, w: 120, h: 150, door: 's', view: syNorth },
      { n: '05', x: 520, y: 50, w: 120, h: 150, door: 's', view: syNorth },
      { n: '06', x: 640, y: 50, w: 120, h: 150, door: 's', view: syNorth },
      { n: '07', x: 760, y: 50, w: 200, h: 150, door: 's', view: 'Corner: the northern ridge and the bike path' },
      { n: '08', x: 800, y: 250, w: 160, h: 73, door: 'w', view: syEast },
      { n: '09', x: 800, y: 323, w: 160, h: 74, door: 'w', view: syEast },
      { n: '10', x: 800, y: 397, w: 160, h: 73, door: 'w', view: syEast },
    ],
    spaces: [
      { kind: 'stairs', label: 'Stairs', x: 40, y: 200, w: 70, h: 50 },
      { kind: 'elevator', label: 'Lift', x: 750, y: 420, w: 50, h: 50 },
      { kind: 'courtyard', label: 'Courtyard', x: 60, y: 290, w: 650, h: 180 },
    ],
  },
  [
    {
      level: 1,
      quiet: false,
      genderInclusive: true,
      busy: 0.25,
      note: 'Every Syrtis Court apartment is gender-inclusive. Mail room by the stairs.',
      types: {
        '01': 'Studio apartment',
        '02': 'Two-bedroom apartment',
        '03': 'Two-bedroom apartment',
        '04': 'Studio apartment',
        '05': 'Two-bedroom apartment',
        '06': 'Two-bedroom apartment',
        '07': 'Two-bedroom apartment',
        '08': 'Studio apartment',
        '09': 'Two-bedroom apartment',
        '10': 'Studio apartment',
      },
      accessible: ['08', '10'],
    },
    {
      level: 2,
      quiet: false,
      genderInclusive: true,
      busy: 0.4,
      note: 'Every Syrtis Court apartment is gender-inclusive.',
      types: {
        '01': 'Studio apartment',
        '02': 'Two-bedroom apartment',
        '03': 'Two-bedroom apartment',
        '04': 'Two-bedroom apartment',
        '05': 'Studio apartment',
        '06': 'Two-bedroom apartment',
        '07': 'Two-bedroom apartment',
        '08': 'Studio apartment',
        '09': 'Two-bedroom apartment',
        '10': 'Studio apartment',
      },
      accessible: ['10'],
    },
    {
      level: 3,
      quiet: true,
      genderInclusive: true,
      busy: 0.1,
      note: 'Quiet floor by agreement. Every Syrtis Court apartment is gender-inclusive.',
      types: {
        '01': 'Studio apartment',
        '02': 'Two-bedroom apartment',
        '03': 'Studio apartment',
        '04': 'Two-bedroom apartment',
        '05': 'Two-bedroom apartment',
        '06': 'Studio apartment',
        '07': 'Two-bedroom apartment',
        '08': 'Studio apartment',
        '09': 'Two-bedroom apartment',
        '10': 'Studio apartment',
      },
      accessible: ['10'],
    },
  ],
);

/* Elysium Hall: rooms on the perimeter, a corridor ring, a reading atrium. */
const elNorth = 'West village green';
const elSouth = 'Red ridge at sunset';
const elysiumSlots: Slot[] = [
  ...Array.from({ length: 8 }, (_, index): Slot => ({
    n: String(index + 1).padStart(2, '0'),
    x: 40 + index * 115,
    y: 50,
    w: 115,
    h: 120,
    door: 's',
    view: index === 0 ? 'Corner: west village green and Olivine Path' : index === 7 ? 'Corner: green and the faculty gardens' : elNorth,
  })),
  { n: '09', x: 845, y: 170, w: 115, h: 90, door: 'w', view: 'Faculty gardens' },
  { n: '10', x: 845, y: 260, w: 115, h: 90, door: 'w', view: 'Faculty gardens' },
  { n: '11', x: 845, y: 350, w: 115, h: 120, door: 'n', view: 'Corner: red ridge and the faculty gardens' },
  { n: '12', x: 730, y: 350, w: 115, h: 120, door: 'n', view: elSouth },
  { n: '13', x: 615, y: 350, w: 115, h: 120, door: 'n', view: elSouth },
  { n: '14', x: 270, y: 350, w: 115, h: 120, door: 'n', view: elSouth },
  { n: '15', x: 155, y: 350, w: 115, h: 120, door: 'n', view: elSouth },
  { n: '16', x: 40, y: 350, w: 115, h: 120, door: 'n', view: 'Corner: red ridge and Olivine Path' },
  { n: '17', x: 40, y: 260, w: 115, h: 90, door: 'e', view: 'Olivine Path and the bike racks' },
  { n: '18', x: 40, y: 170, w: 115, h: 90, door: 'e', view: 'Olivine Path and the bike racks' },
];
const elysiumTypes: Record<string, RoomType> = {
  '01': 'Double',
  '02': 'Single',
  '03': 'Single',
  '04': 'Double',
  '05': 'Single',
  '06': 'Single',
  '07': 'Single',
  '08': 'Double',
  '09': 'Single',
  '10': 'Single',
  '11': 'Double',
  '12': 'Single',
  '13': 'Single',
  '14': 'Single',
  '15': 'Double',
  '16': 'Double',
  '17': 'Single',
  '18': 'Single',
};
const elysium = buildHall(
  {
    id: 'elysium',
    name: 'Elysium Hall',
    short: 'Elysium',
    years: 'Upper-division',
    residentYears: ['Third-year', 'Fourth-year'],
    blurb: 'Singles and doubles in the west village. Quiet house by agreement.',
    amenities: ['Quiet house by agreement', 'Reading atrium under a skylight', 'Bike racks on Olivine Path'],
    rates: { Single: 6040, Double: 5260 },
    sizes: { Single: 156, Double: 228 },
    features: [
      'Roll-in shower in the room',
      'Automatic door opener',
      'Lowered closet rod, desk, and peephole',
      'Strobe and bed-shaker fire alarm',
    ],
    outline: RECT_OUTLINE,
    corridors: [{ x: 155, y: 170, w: 690, h: 180 }],
    slots: elysiumSlots,
    spaces: [
      { kind: 'atrium', label: 'Reading atrium', x: 215, y: 215, w: 570, h: 90 },
      { kind: 'stairs', label: 'Stairs', x: 385, y: 350, w: 115, h: 60 },
      { kind: 'elevator', label: 'Lift', x: 385, y: 410, w: 115, h: 60 },
      { kind: 'lounge', label: 'Lounge', x: 500, y: 350, w: 115, h: 120 },
    ],
  },
  [
    {
      level: 1,
      quiet: true,
      genderInclusive: false,
      busy: 0.3,
      note: 'Elysium is a quiet house. Quiet hours start at 8 p.m. on every floor.',
      types: elysiumTypes,
      accessible: ['13', '14'],
    },
    {
      level: 2,
      quiet: true,
      genderInclusive: true,
      busy: 0.1,
      note: 'Quiet, gender-inclusive floor.',
      types: elysiumTypes,
      accessible: ['14'],
    },
    {
      level: 3,
      quiet: true,
      genderInclusive: false,
      busy: 0.45,
      note: 'Quiet floor. The atrium skylight is directly above.',
      types: elysiumTypes,
      accessible: ['14'],
    },
  ],
);

export const halls: Hall[] = [olympus, isidis, syrtis, elysium];

export const allRooms: Room[] = halls.flatMap((hall) => hall.floors.flatMap((floor) => floor.rooms));

export const rateFloor = Math.floor(Math.min(...allRooms.map((room) => room.rate)) / 100) * 100;
export const rateCeiling = Math.ceil(Math.max(...allRooms.map((room) => room.rate)) / 100) * 100;
