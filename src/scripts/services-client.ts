import { addTicket, loadTickets, newTicketId, saveTickets, type Ticket, type TicketComment } from './store';

export function servicesUrl(): string {
  const value = import.meta.env.PUBLIC_SERVICES_URL ?? '';
  return value.replace(/\/$/, '');
}

export type TicketInput = {
  category: string;
  subcategory: string;
  studentId: string;
  email: string;
  subject: string;
  description: string;
  priority: string;
  attachmentName?: string | null;
  name?: string;
  hall?: string;
  room?: string;
  availability?: string;
  phone?: string;
  language?: string;
};

export async function submitTicket(input: TicketInput): Promise<Ticket> {
  const base = servicesUrl();
  if (!base) {
    const ticket = localTicket(input);
    addTicket(ticket);
    return ticket;
  }
  const response = await fetch(`${base}/api/tickets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || 'The request could not be sent. Nothing was filed.');
  }
  const ticket = asTicket(payload);
  addTicket(ticket);
  return ticket;
}

export async function refreshTickets(): Promise<Ticket[]> {
  const local = loadTickets();
  const base = servicesUrl();
  if (!base || local.length === 0) return local;
  const ids = local.map((ticket) => ticket.id).join(',');
  const response = await fetch(`${base}/api/tickets?ids=${encodeURIComponent(ids)}`);
  if (!response.ok) return local;
  const payload = (await response.json().catch(() => ({}))) as { tickets?: unknown[] };
  const remote = new Map<string, Ticket>();
  for (const item of payload.tickets ?? []) {
    if (item && typeof item === 'object' && 'id' in item) remote.set(String((item as Ticket).id), asTicket(item));
  }
  const next = local.map((ticket) => {
    const server = remote.get(ticket.id);
    if (!server) return ticket;
    return {
      ...ticket,
      status: server.status || ticket.status,
      updatedAt: server.updatedAt ?? ticket.updatedAt,
      note: server.note ?? ticket.note ?? null,
      assignee: server.assignee ?? ticket.assignee ?? null,
      comments: publicOnly(server.comments),
    };
  });
  saveTickets(next);
  return next;
}

function localTicket(input: TicketInput): Ticket {
  const labels: Record<string, string> = {
    'financial-aid': 'Financial aid',
    'financial-aid-hold': 'Financial aid hold',
    housing: 'Housing & residential life',
    'housing-repair': 'Housing repair',
    registration: 'Registration & records',
    it: 'IT & accounts',
    billing: 'Billing',
    accessibility: 'Accessibility',
    other: 'Something else',
  };
  return {
    id: newTicketId(loadTickets().map((item) => item.id)),
    category: input.category,
    categoryLabel: labels[input.category] ?? input.category,
    subcategory: input.subcategory,
    studentId: input.studentId,
    email: input.email,
    subject: input.subject,
    description: input.description,
    priority: input.priority,
    attachmentName: input.attachmentName ?? null,
    createdAt: new Date().toISOString(),
    status: 'Submitted',
    ...(input.name ? { name: input.name } : {}),
    ...(input.hall ? { hall: input.hall } : {}),
    ...(input.room ? { room: input.room } : {}),
    ...(input.availability ? { availability: input.availability } : {}),
  };
}

function asTicket(value: unknown): Ticket {
  const ticket = value as Ticket;
  return { ...ticket, comments: publicOnly(ticket.comments) };
}

function publicOnly(comments: TicketComment[] | undefined): TicketComment[] {
  return (comments ?? []).filter((comment) => comment && comment.visibility === 'public');
}
