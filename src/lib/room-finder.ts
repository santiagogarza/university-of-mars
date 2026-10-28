export type RoomStatus = 'available' | 'limited' | 'full';

export type RoomType =
  | 'Single'
  | 'Double'
  | 'Triple'
  | 'Suite single'
  | 'Suite double'
  | 'Studio apartment'
  | 'Two-bedroom apartment';

export const ROOM_TYPES: RoomType[] = [
  'Single',
  'Double',
  'Triple',
  'Suite single',
  'Suite double',
  'Studio apartment',
  'Two-bedroom apartment',
];

export const STATUS_LABELS: Record<RoomStatus, string> = {
  available: 'Available',
  limited: 'Limited',
  full: 'Full',
};

export interface RoomFilters {
  type: RoomType | 'any';
  maxRate: number;
  accessibleOnly: boolean;
  quietFloor: boolean;
  genderInclusive: boolean;
}

/** The fields filtering needs. Rooms in src/data/rooms.ts carry more. */
export interface FilterableRoom {
  type: RoomType;
  rate: number;
  accessible: boolean;
  quiet: boolean;
  genderInclusive: boolean;
}

/**
 * Full when no bed is open. Limited when exactly one bed is left in a room
 * that holds more than one person. Everything else is available, including an
 * empty single.
 */
export function roomStatus(beds: number, taken: number): RoomStatus {
  const open = Math.max(0, beds - taken);
  if (open === 0) return 'full';
  if (open === 1 && beds > 1) return 'limited';
  return 'available';
}

export function defaultFilters(maxRate: number): RoomFilters {
  return { type: 'any', maxRate, accessibleOnly: false, quietFloor: false, genderInclusive: false };
}

export function matchesFilters(room: FilterableRoom, filters: RoomFilters): boolean {
  if (filters.type !== 'any' && room.type !== filters.type) return false;
  if (room.rate > filters.maxRate) return false;
  if (filters.accessibleOnly && !room.accessible) return false;
  if (filters.quietFloor && !room.quiet) return false;
  if (filters.genderInclusive && !room.genderInclusive) return false;
  return true;
}

export function isFiltering(filters: RoomFilters, ceiling: number): boolean {
  return (
    filters.type !== 'any' ||
    filters.maxRate < ceiling ||
    filters.accessibleOnly ||
    filters.quietFloor ||
    filters.genderInclusive
  );
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function formatRate(value: number): string {
  return money.format(value);
}

export function bedsLine(beds: number, taken: number): string {
  const open = Math.max(0, beds - taken);
  if (beds === 1) return open === 1 ? 'Open single' : 'Single, occupied';
  if (open === 0) return `All ${beds} beds taken`;
  return `${open} of ${beds} beds open`;
}

/** Add or remove a room id, keeping at most `limit` ids in the order chosen. */
export function toggleCompare(
  list: readonly string[],
  id: string,
  limit = 3,
): { list: string[]; added: boolean; full: boolean } {
  if (list.includes(id)) return { list: list.filter((item) => item !== id), added: false, full: false };
  if (list.length >= limit) return { list: [...list], added: false, full: true };
  return { list: [...list, id], added: true, full: false };
}
