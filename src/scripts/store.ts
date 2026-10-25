export const STORAGE_KEY = 'um-support-requests';

export type Ticket = {
  id: string;
  category: string;
  categoryLabel: string;
  subcategory: string;
  studentId: string;
  email: string;
  subject: string;
  description: string;
  priority: string;
  attachmentName: string | null;
  createdAt: string;
  status: 'Submitted';
};

export function loadTickets(): Ticket[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Ticket => {
      return Boolean(item && typeof item === 'object' && 'id' in item && 'subject' in item);
    });
  } catch {
    return [];
  }
}

export function saveTickets(tickets: Ticket[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
}

export function addTicket(ticket: Ticket) {
  const all = loadTickets();
  all.unshift(ticket);
  saveTickets(all);
}

export function removeTicket(id: string) {
  saveTickets(loadTickets().filter((ticket) => ticket.id !== id));
}

export function newTicketId(existing: string[]): string {
  let id = '';
  do {
    const n = Math.floor(Math.random() * 10000000);
    id = `UMS${String(n).padStart(7, '0')}`;
  } while (existing.includes(id));
  return id;
}
