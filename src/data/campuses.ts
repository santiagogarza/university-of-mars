import { site } from './site.ts';
import type { WeatherBaseline } from '../lib/mars-time.ts';

export interface Campus {
  id: string;
  name: string;
  short: string;
  kind: 'Main campus' | 'Field station';
  /** Planetocentric latitude, degrees north. */
  lat: number;
  /** Planetocentric longitude, degrees east (−180 to 180). */
  lon: number;
  founded: string;
  elevation: string;
  summary: string;
  programs: string[];
  weather: WeatherBaseline;
}

/** Sample data for the About page globe. Locations are real Martian landmarks; the stations are fictional. */
export const campuses: Campus[] = [
  {
    id: 'jezero',
    name: 'Jezero campus',
    short: 'Jezero',
    kind: 'Main campus',
    lat: 18.38,
    lon: 77.58,
    founded: site.founded,
    elevation: '−2.6 km',
    summary:
      'The academic home of all eight colleges, on the western rim of Isidis Planitia beside the old Jezero river delta.',
    programs: [
      'Undergraduate and graduate degrees in all eight colleges',
      'University Library and archives',
      'Jezero Observatory, College of Science',
      'Center for Water and Climate',
    ],
    weather: { highC: -14, lowC: -79, pressurePa: 742, windKph: 18, dustTau: 0.42 },
  },
  {
    id: 'olympus',
    name: 'Olympus Mons Observatory',
    short: 'Olympus Mons',
    kind: 'Field station',
    lat: 18.65,
    lon: -133.8,
    founded: '2011',
    elevation: '+21.9 km',
    summary:
      'A summit observatory above most of the planet’s dust. The College of Science runs it with the Graduate Division.',
    programs: [
      'Graduate study in planetary astronomy',
      'Optics and instrument practicum, Summer Session',
      'Upper-atmosphere soundings for the Center for Water and Climate',
    ],
    weather: { highC: -62, lowC: -118, pressurePa: 84, windKph: 46, dustTau: 0.12 },
  },
  {
    id: 'valles',
    name: 'Valles Marineris Geology Station',
    short: 'Valles Marineris',
    kind: 'Field station',
    lat: -10.4,
    lon: -71.5,
    founded: '2016',
    elevation: '−5.1 km',
    summary:
      'A field station on the floor of Melas Chasma, where layered rock is exposed for kilometers up the canyon walls.',
    programs: [
      'Field geology and stratigraphy, College of Science',
      'Slope stability and anchoring, College of Engineering',
      'Two-week spring field camp for geology majors',
    ],
    weather: { highC: -4, lowC: -68, pressurePa: 1060, windKph: 24, dustTau: 0.58 },
  },
  {
    id: 'gale',
    name: 'Gale Crater Research Annex',
    short: 'Gale Crater',
    kind: 'Field station',
    lat: -5.4,
    lon: 137.8,
    founded: '2019',
    elevation: '−4.5 km',
    summary:
      'A research annex at the foot of Aeolis Mons, the mound in the middle of Gale crater, focused on ancient lakes.',
    programs: [
      'Sedimentology and ancient lake chemistry',
      'Habitability and life-support research, College of Health',
      'Drill-core library, shared with the University archives',
    ],
    weather: { highC: -9, lowC: -77, pressurePa: 852, windKph: 15, dustTau: 0.48 },
  },
];
