import { createHmac, timingSafeEqual } from 'node:crypto';
import { loadSeed } from './storage.js';

const CATEGORIES = {
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

const PRIORITIES = ['Low', 'Normal', 'Urgent'];
const STATUSES = ['Received', 'In progress', 'Resolved'];

const HOW_RECEIVED = ['Online form', 'Email', 'In person', 'Phone', 'Third party'];
const REPORTER_ROLES = ['Complainant', 'Witness', 'Employee (mandatory reporter)', 'Anonymous'];
const AFFILIATIONS = ['Student', 'Employee', 'Third party', 'Unknown'];
const ALLEGATIONS = [
  'Sexual harassment',
  'Sexual assault',
  'Dating violence',
  'Domestic violence',
  'Stalking',
  'Retaliation',
  'Other sex discrimination',
];
const MEASURES = [
  'No-contact directive',
  'Class schedule change',
  'Housing change',
  'Counseling referral',
  'Academic extension',
  'None requested',
];
const NEXT_STEPS = [
  'Intake meeting scheduled',
  'Awaiting complainant response',
  'Formal complaint filed',
  'Informal resolution',
  'Closed: no further action',
];
const INVESTIGATORS = ['Coordinator (Title IX office)', 'Deputy coordinator A', 'Deputy coordinator B'];

const UPSTREAM_TIMEOUT_MS = 8000;

const OPTIONAL_TICKET_FIELDS = ['name', 'hall', 'room', 'availability', 'phone', 'language'];

export function createApp(options = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const storage = options.storage;
  const log = options.log ?? ((...args) => console.log(...args));
  if (!storage) throw new Error('storage is required');

  return {
    handle(request) {
      return handleRequest(request, { env, fetchImpl, storage, log });
    },
  };
}

async function handleRequest(request, ctx) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const cors = corsHeaders(origin, ctx.env);

  if (request.method === 'OPTIONS') {
    return json(204, {}, cors);
  }

  try {
    const response = await route(request, url, ctx);
    return withCors(response, cors);
  } catch (error) {
    ctx.log('request failed', error instanceof Error ? error.message : 'unknown error');
    return json(500, { error: 'Something went wrong.' }, cors);
  }
}

async function route(request, url, ctx) {
  const parts = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  // parts[0] is "api"
  if (parts[0] !== 'api') return json(404, { error: 'Not found.' });

  // Public: the browser mints a short-lived voice token; gated by allowedOrigin instead of a key.
  if (parts[1] === 'voice' && parts[2] === 'session' && parts.length === 3) {
    if (request.method !== 'POST') return methodNotAllowed(['POST']);
    return mintVoiceSession(request, ctx);
  }

  // Public: exchanges the staff passcode for a signed staff token, so it cannot require one.
  if (parts[1] === 'staff' && parts[2] === 'session' && parts.length === 3) {
    if (request.method !== 'POST') return methodNotAllowed(['POST']);
    return createStaffSession(request, ctx);
  }

  if (parts[1] === 'admin' && parts[2] === 'reset' && parts.length === 3) {
    if (request.method !== 'POST') return methodNotAllowed(['POST']);
    if (!requireDemoKey(request, ctx.env)) return unauthorized();
    return resetState(ctx);
  }

  // Public: students create tickets and look up their own by ?ids= without an account; listing needs the demo key.
  if (parts[1] === 'tickets' && parts.length === 2) {
    if (request.method === 'GET') return listTickets(request, url, ctx);
    if (request.method === 'POST') return createTicket(request, ctx);
    return methodNotAllowed(['GET', 'POST']);
  }

  if (parts[1] === 'tickets' && parts.length === 4 && parts[3] === 'comments') {
    if (request.method !== 'POST') return methodNotAllowed(['POST']);
    if (!requireDemoKey(request, ctx.env)) return unauthorized();
    return addComment(request, parts[2], ctx);
  }

  if (parts[1] === 'tickets' && parts.length === 4 && parts[3] === 'duplicates') {
    if (request.method !== 'POST') return methodNotAllowed(['POST']);
    if (!requireDemoKey(request, ctx.env)) return unauthorized();
    return linkDuplicates(request, parts[2], ctx);
  }

  if (parts[1] === 'tickets' && parts.length === 3) {
    if (request.method === 'GET') {
      if (!requireDemoKey(request, ctx.env)) return unauthorized();
      return getTicket(parts[2], ctx);
    }
    if (request.method === 'PATCH') {
      if (!requireDemoKey(request, ctx.env)) return unauthorized();
      return patchTicket(request, parts[2], ctx);
    }
    return methodNotAllowed(['GET', 'PATCH']);
  }

  // Public reads: the facilities page shows work orders without sign-in; creating needs the demo key.
  if (parts[1] === 'work-orders' && parts.length === 2) {
    if (request.method === 'GET') return listWorkOrders(url, ctx);
    if (request.method === 'POST') {
      if (!requireDemoKey(request, ctx.env)) return unauthorized();
      return createWorkOrder(request, ctx);
    }
    return methodNotAllowed(['GET', 'POST']);
  }

  // Public: confirmation lookup from the facilities page.
  if (parts[1] === 'work-orders' && parts.length === 3) {
    if (request.method !== 'GET') return methodNotAllowed(['GET']);
    return getWorkOrder(parts[2], ctx);
  }

  if (parts[1] === 'title-ix' && parts[2] === 'cases' && parts.length === 3) {
    if (!requireStaffOrDemo(request, ctx.env)) return unauthorized();
    if (request.method === 'GET') return listCases(url, ctx);
    if (request.method === 'POST') return createCase(request, ctx);
    return methodNotAllowed(['GET', 'POST']);
  }

  if (parts[1] === 'title-ix' && parts[2] === 'cases' && parts.length === 4) {
    if (!requireStaffOrDemo(request, ctx.env)) return unauthorized();
    if (request.method !== 'GET') return methodNotAllowed(['GET']);
    return getCase(decodeURIComponent(parts[3]), ctx);
  }

  if (parts[1] === 'aid-holds' && parts[2] === 'releases' && parts.length === 3) {
    if (request.method !== 'POST') return methodNotAllowed(['POST']);
    if (!requireDemoKey(request, ctx.env)) return unauthorized();
    return createRelease(request, ctx);
  }

  if (parts[1] === 'aid-holds' && parts[2] === 'releases' && parts.length === 4) {
    if (request.method !== 'PATCH') return methodNotAllowed(['PATCH']);
    if (!requireDemoKey(request, ctx.env)) return unauthorized();
    return patchRelease(request, parts[3], ctx);
  }

  if (parts[1] === 'aid-holds' && parts[2] === 'releases' && parts.length === 5 && parts[4] === 'approve') {
    if (request.method !== 'POST') return methodNotAllowed(['POST']);
    if (!requireDemoKey(request, ctx.env)) return unauthorized();
    return approveRelease(request, parts[3], ctx);
  }

  if (parts[1] === 'aid-holds' && parts[2] === 'releases' && parts.length === 5 && parts[4] === 'reject') {
    if (request.method !== 'POST') return methodNotAllowed(['POST']);
    if (!requireDemoKey(request, ctx.env)) return unauthorized();
    return rejectRelease(request, parts[3], ctx);
  }

  return json(404, { error: 'Not found.' });
}

function corsHeaders(origin, env) {
  const headers = {
    'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
    'access-control-allow-headers': 'content-type, x-demo-key, x-staff-token',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
  const allowed = allowedOrigin(origin, env);
  if (allowed) headers['access-control-allow-origin'] = allowed;
  return headers;
}

function allowedOrigin(origin, env) {
  if (!origin) return null;
  if (origin === 'https://santiagogarza.github.io') return origin;
  const extras = String(env?.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (extras.includes(origin)) return origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}

function withCors(response, cors) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(cors)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

function json(status, body, headers = {}) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

function methodNotAllowed(allow) {
  return json(405, { error: 'Method not allowed.' }, { allow: allow.join(', ') });
}

function unauthorized() {
  return json(401, { error: 'Unauthorized.' });
}

function requireDemoKey(request, env) {
  const expected = env.DEMO_BOT_KEY;
  const got = request.headers.get('x-demo-key');
  if (!expected || !got) return false;
  return safeEqual(got, expected);
}

function requireStaffOrDemo(request, env) {
  if (requireDemoKey(request, env)) return true;
  const token = request.headers.get('x-staff-token');
  return verifyStaffToken(env.DEMO_BOT_KEY, token);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { error: 'Expected a JSON object.' };
    }
    return { value };
  } catch {
    return { error: 'Expected JSON.' };
  }
}

function normalizeState(current) {
  if (current && Array.isArray(current.tickets) && Array.isArray(current.cases)) {
    return {
      tickets: current.tickets,
      cases: current.cases,
      workOrders: current.workOrders ?? [],
      releases: current.releases ?? [],
      nextWorkOrderNumber: current.nextWorkOrderNumber ?? 1001,
      nextReleaseNumber: current.nextReleaseNumber ?? 1001,
    };
  }
  return structuredClone(loadSeed());
}

async function resetState(ctx) {
  const seed = loadSeed();
  await ctx.storage.update(async () => structuredClone(seed));
  ctx.log('demo state restored', seed.tickets.length, 'tickets');
  return json(200, {
    ok: true,
    tickets: seed.tickets.length,
    workOrders: seed.workOrders.length,
    cases: seed.cases.length,
    releases: seed.releases.length,
    ticketIds: seed.tickets.map((ticket) => ticket.id),
    oldestFinancialAidHoldId: 'UMS0412207',
    lastCaseNumber: 'TIX-2026-0041',
  });
}

async function mintVoiceSession(request, ctx) {
  const origin = request.headers.get('origin');
  if (!allowedOrigin(origin, ctx.env)) {
    return json(403, { error: 'This voice session is only started from the university site.' });
  }
  if (!ctx.env.XAI_API_KEY) {
    ctx.log('voice session skipped: API key is not configured');
    return json(503, { error: 'Voice calls are not configured.' });
  }
  let upstream;
  try {
    upstream = await ctx.fetchImpl('https://api.x.ai/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${ctx.env.XAI_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ expires_after: { seconds: 300 } }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    ctx.log('voice session request failed', error instanceof Error ? error.message : 'network');
    return json(502, { error: 'Voice session could not be started.' });
  }
  if (!upstream.ok) {
    ctx.log('voice session rejected', upstream.status);
    return json(502, { error: 'Voice session could not be started.' });
  }
  const payload = await upstream.json();
  const value = payload?.value;
  if (!value || typeof value !== 'string') {
    ctx.log('voice session response had no token');
    return json(502, { error: 'Voice session could not be started.' });
  }
  ctx.log('voice session minted');
  return json(200, { value, expires_at: payload.expires_at ?? null });
}

function createStaffSession(request, ctx) {
  return readJson(request).then(({ value, error }) => {
    if (error) return json(400, { error });
    const expected = ctx.env.STAFF_PASSCODE;
    if (!expected || !ctx.env.DEMO_BOT_KEY) {
      return json(503, { error: 'Staff sign-in is not configured.' });
    }
    const passcode = typeof value.passcode === 'string' ? value.passcode : '';
    if (!safeEqual(passcode, expected)) return unauthorized();
    const issued = signStaffToken(ctx.env.DEMO_BOT_KEY);
    ctx.log('staff session issued');
    return json(200, issued);
  });
}

function signStaffToken(secret) {
  const exp = Math.floor(Date.now() / 1000) + 8 * 60 * 60;
  const payload = Buffer.from(JSON.stringify({ scope: 'title-ix', exp })).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return { token: `${payload}.${sig}`, expiresAt: new Date(exp * 1000).toISOString() };
}

function verifyStaffToken(secret, token) {
  if (!secret || !token || typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  if (!safeEqual(sig, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.scope !== 'title-ix') return false;
    if (typeof data.exp !== 'number' || data.exp < Date.now() / 1000) return false;
    return true;
  } catch {
    return false;
  }
}

async function listTickets(request, url, ctx) {
  const idsParam = url.searchParams.get('ids');
  const hasIds = idsParam !== null && idsParam.trim() !== '';
  if (!hasIds && !requireDemoKey(request, ctx.env)) return unauthorized();

  const status = url.searchParams.get('status');
  const category = url.searchParams.get('category');
  const since = url.searchParams.get('since');
  if (status && !STATUSES.includes(status) && status !== 'Submitted') {
    return json(400, { error: 'Unknown status.' });
  }
  if (category && !CATEGORIES[category]) return json(400, { error: 'Unknown category.' });
  let sinceMs = null;
  if (since) {
    sinceMs = Date.parse(since);
    if (Number.isNaN(sinceMs)) return json(400, { error: 'since must be a date or time.' });
  }
  const limit = parseLimit(url);
  if (limit === null) return json(400, { error: 'limit must be an integer from 1 to 500.' });

  const all = normalizeState(await ctx.storage.read()).tickets;
  let tickets = all.slice();

  if (hasIds) {
    const wanted = idsParam.split(',').map((id) => id.trim()).filter(Boolean);
    const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]));
    tickets = wanted.map((id) => byId.get(id)).filter(Boolean);
  }
  if (status) tickets = tickets.filter((ticket) => ticket.status === status);
  if (category) tickets = tickets.filter((ticket) => ticket.category === category);
  if (sinceMs !== null) {
    tickets = tickets.filter((ticket) => Date.parse(ticket.createdAt) >= sinceMs);
  }
  tickets.sort(newestFirst);
  tickets = tickets.slice(0, limit);

  if (hasIds) {
    return json(200, { tickets: tickets.map(toPublicTicket), count: tickets.length });
  }
  const full = new Map(all.map((ticket) => [ticket.id, ticket]));
  return json(200, {
    tickets: tickets.map((ticket) => withRelations(ticket, full)),
    count: tickets.length,
  });
}

function parseLimit(url) {
  const raw = url.searchParams.get('limit');
  if (raw === null || raw === '') return 100;
  const limit = Number(raw);
  return Number.isInteger(limit) && limit >= 1 && limit <= 500 ? limit : null;
}

function newestFirst(a, b) {
  const delta = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (delta !== 0) return delta;
  return String(b.id).localeCompare(String(a.id));
}

async function getTicket(id, ctx) {
  const all = normalizeState(await ctx.storage.read()).tickets;
  const found = all.find((ticket) => ticket.id === id) ?? null;
  if (!found) return json(404, { error: 'Ticket not found.' });
  const full = new Map(all.map((ticket) => [ticket.id, ticket]));
  return json(200, withRelations(found, full));
}

async function createTicket(request, ctx) {
  const { value, error } = await readJson(request);
  if (error) return json(400, { error });
  const ticket = buildTicket(value);
  if (ticket.error) return json(400, { error: ticket.error });

  let created = null;
  await ctx.storage.update(async (current) => {
    const state = normalizeState(current);
    created = { ...ticket.ticket, id: nextTicketId(state.tickets) };
    state.tickets.push(created);
    return state;
  });

  await forwardTicket(created, ctx);
  return json(201, created);
}

function buildTicket(input) {
  const category = stringField(input.category);
  if (!CATEGORIES[category]) return { error: 'Choose a category.' };
  const subcategory = stringField(input.subcategory);
  if (!subcategory) return { error: 'Choose a subcategory.' };
  const studentId = stringField(input.studentId);
  if (!/^\d{9}$/.test(studentId)) return { error: 'Enter a 9-digit student ID.' };
  const email = stringField(input.email);
  if (!/^[^\s@]+@umars\.edu$/i.test(email)) return { error: 'Enter a UM email ending in @umars.edu.' };
  const subject = stringField(input.subject);
  if (subject.length < 4) return { error: 'Enter a subject of at least a few words.' };
  const description = stringField(input.description);
  if (description.length < 20) return { error: 'Describe the request in at least a sentence.' };
  const priority = stringField(input.priority);
  if (!PRIORITIES.includes(priority)) return { error: 'Choose a priority.' };

  const now = new Date().toISOString();
  const ticket = {
    id: '',
    category,
    categoryLabel: CATEGORIES[category],
    subcategory,
    studentId,
    email,
    subject,
    description,
    priority,
    attachmentName: attachmentName(input.attachmentName),
    createdAt: now,
    updatedAt: now,
    status: 'Received',
    comments: [],
    parentId: null,
    duplicates: [],
  };
  for (const key of OPTIONAL_TICKET_FIELDS) {
    if (typeof input[key] === 'string' && input[key].trim()) ticket[key] = input[key].trim();
  }
  return { ticket };
}

function attachmentName(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 180) : null;
}

function stringField(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function nextTicketId(tickets) {
  const taken = new Set(tickets.map((ticket) => ticket.id));
  let id = '';
  do {
    const n = Math.floor(Math.random() * 10000000);
    id = `UMS${String(n).padStart(7, '0')}`;
  } while (taken.has(id));
  return id;
}

async function forwardTicket(ticket, ctx) {
  const url = ctx.env.INTAKE_WEBHOOK_URL;
  if (!url) return;
  const headers = { 'content-type': 'application/json' };
  if (ctx.env.INTAKE_WEBHOOK_HEADERS) {
    try {
      const extra = JSON.parse(ctx.env.INTAKE_WEBHOOK_HEADERS);
      if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
        for (const [key, value] of Object.entries(extra)) {
          if (typeof value === 'string') headers[key] = value;
        }
      }
    } catch {
      ctx.log('intake webhook headers were not valid JSON; forwarding without them');
    }
  }
  const body = JSON.stringify({ event: 'ticket.created', ticket });
  try {
    const response = await ctx.fetchImpl(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    ctx.log('intake webhook', response.ok ? 'delivered' : `status ${response.status}`, ticket.id);
  } catch (error) {
    ctx.log('intake webhook failed', ticket.id, error instanceof Error ? error.message : 'network');
  }
}

async function patchTicket(request, id, ctx) {
  const { value, error } = await readJson(request);
  if (error) return json(400, { error });
  const hasStatus = Object.prototype.hasOwnProperty.call(value, 'status');
  const hasAssignee = Object.prototype.hasOwnProperty.call(value, 'assignee');
  const hasCategory = Object.prototype.hasOwnProperty.call(value, 'category');
  const hasNote = Object.prototype.hasOwnProperty.call(value, 'note');
  if (!hasStatus && !hasAssignee && !hasCategory && !hasNote) {
    return json(400, { error: 'Send a status, assignee, category, or note.' });
  }
  if (hasStatus && !STATUSES.includes(value.status)) {
    return json(400, { error: 'Status must be Received, In progress, or Resolved.' });
  }
  if (hasAssignee && typeof value.assignee !== 'string') return json(400, { error: 'Assignee must be text.' });
  if (hasCategory && !CATEGORIES[value.category]) return json(400, { error: 'Unknown category.' });
  if (hasNote && typeof value.note !== 'string') return json(400, { error: 'Note must be text.' });

  let updated = null;
  let all = [];
  await ctx.storage.update(async (current) => {
    const state = normalizeState(current);
    const ticket = state.tickets.find((item) => item.id === id);
    if (!ticket) return state;
    if (hasStatus) ticket.status = value.status;
    if (hasAssignee) ticket.assignee = value.assignee.trim();
    if (hasCategory) {
      ticket.category = value.category;
      ticket.categoryLabel = CATEGORIES[value.category];
    }
    if (hasNote) ticket.note = value.note.trim();
    ticket.updatedAt = new Date().toISOString();
    updated = ticket;
    all = state.tickets;
    return state;
  });
  if (!updated) return json(404, { error: 'Ticket not found.' });
  const full = new Map(all.map((ticket) => [ticket.id, ticket]));
  return json(200, withRelations(updated, full));
}

async function addComment(request, id, ctx) {
  const { value, error } = await readJson(request);
  if (error) return json(400, { error });
  const author = stringField(value.author);
  const body = stringField(value.body);
  const visibility = value.visibility;
  if (!author) return json(400, { error: 'Comment author is required.' });
  if (!body) return json(400, { error: 'Comment body is required.' });
  if (visibility !== 'public' && visibility !== 'internal') {
    return json(400, { error: 'Visibility must be public or internal.' });
  }
  const comment = {
    id: `cmt-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
    author,
    body,
    visibility,
    createdAt: new Date().toISOString(),
  };
  let ticket = null;
  let all = [];
  await ctx.storage.update(async (current) => {
    const state = normalizeState(current);
    const found = state.tickets.find((item) => item.id === id);
    if (!found) return state;
    found.comments = Array.isArray(found.comments) ? found.comments : [];
    found.comments.push(comment);
    found.updatedAt = comment.createdAt;
    ticket = found;
    all = state.tickets;
    return state;
  });
  if (!ticket) return json(404, { error: 'Ticket not found.' });
  const full = new Map(all.map((item) => [item.id, item]));
  return json(201, withRelations(ticket, full));
}

async function linkDuplicates(request, parentId, ctx) {
  const { value, error } = await readJson(request);
  if (error) return json(400, { error });
  if (!Array.isArray(value.duplicateIds) || value.duplicateIds.length === 0) {
    return json(400, { error: 'duplicateIds must list at least one ticket.' });
  }
  const ids = [...new Set(value.duplicateIds.map((id) => stringField(id)).filter(Boolean))];
  if (ids.length === 0) return json(400, { error: 'duplicateIds must list at least one ticket.' });
  if (ids.includes(parentId)) return json(400, { error: 'A ticket cannot be a duplicate of itself.' });
  const reason = typeof value.reason === 'string' ? value.reason.trim() : '';

  let result = null;
  let message = null;
  await ctx.storage.update(async (current) => {
    const state = normalizeState(current);
    const byId = new Map(state.tickets.map((ticket) => [ticket.id, ticket]));
    const parent = byId.get(parentId);
    if (!parent) {
      message = 'Parent ticket not found.';
      return state;
    }
    if (parent.parentId) {
      message = 'This ticket is already grouped under another request. Use the oldest request as the parent.';
      return state;
    }
    for (const id of ids) {
      const child = byId.get(id);
      if (!child) {
        message = `Ticket ${id} was not found.`;
        return state;
      }
      if (Array.isArray(child.duplicates) && child.duplicates.length > 0) {
        message = `${id} is already a parent and cannot be linked as a duplicate.`;
        return state;
      }
      if (child.parentId && child.parentId !== parentId) {
        message = `${id} is already grouped under ${child.parentId}.`;
        return state;
      }
    }
    parent.duplicates = Array.isArray(parent.duplicates) ? parent.duplicates : [];
    for (const id of ids) {
      const child = byId.get(id);
      child.parentId = parentId;
      if (!parent.duplicates.includes(id)) parent.duplicates.push(id);
    }
    if (reason) parent.duplicateReason = reason;
    parent.updatedAt = new Date().toISOString();
    result = { parent, tickets: state.tickets };
    return state;
  });
  if (!result) return json(message === 'Parent ticket not found.' ? 404 : 400, { error: message });
  const full = new Map(result.tickets.map((ticket) => [ticket.id, ticket]));
  return json(200, withRelations(result.parent, full));
}

function toPublicTicket(ticket) {
  const comments = (ticket.comments ?? []).filter((comment) => comment.visibility === 'public');
  const view = { ...ticket, comments };
  delete view.parentId;
  delete view.duplicates;
  delete view.duplicateReason;
  return view;
}

function withRelations(ticket, byId) {
  const parent = ticket.parentId ? byId.get(ticket.parentId) : null;
  const duplicateTickets = (ticket.duplicates ?? [])
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map(brief);
  return {
    ...ticket,
    comments: ticket.comments ?? [],
    parentId: ticket.parentId ?? null,
    duplicates: ticket.duplicates ?? [],
    parent: parent ? brief(parent) : null,
    duplicateTickets,
  };
}

function brief(ticket) {
  return {
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    email: ticket.email,
    createdAt: ticket.createdAt,
  };
}

async function listWorkOrders(url, ctx) {
  const limit = parseLimit(url);
  if (limit === null) return json(400, { error: 'limit must be an integer from 1 to 500.' });
  const workOrders = normalizeState(await ctx.storage.read()).workOrders.slice().sort(newestFirst).slice(0, limit);
  return json(200, { workOrders, count: workOrders.length });
}

async function getWorkOrder(id, ctx) {
  const found = normalizeState(await ctx.storage.read()).workOrders.find((order) => order.confirmation === id || order.id === id) ?? null;
  if (!found) return json(404, { error: 'Work order not found.' });
  return json(200, found);
}

async function createWorkOrder(request, ctx) {
  const { value, error } = await readJson(request);
  if (error) return json(400, { error });
  const ticketId = stringField(value.ticketId);
  const hall = stringField(value.hall);
  const room = stringField(value.room);
  const category = stringField(value.category || value.issue);
  const description = stringField(value.description);
  const windowText = stringField(value.window || value.slot);
  if (!ticketId) return json(400, { error: 'ticketId is required.' });
  if (!hall) return json(400, { error: 'hall is required.' });
  if (!room) return json(400, { error: 'room is required.' });
  if (!category) return json(400, { error: 'category is required.' });
  if (!description) return json(400, { error: 'description is required.' });
  if (!windowText) return json(400, { error: 'window is required.' });

  let created = null;
  let missing = false;
  await ctx.storage.update(async (current) => {
    const state = normalizeState(current);
    if (!state.tickets.some((ticket) => ticket.id === ticketId)) {
      missing = true;
      return state;
    }
    const number = state.nextWorkOrderNumber ?? 1001;
    state.nextWorkOrderNumber = number + 1;
    const now = new Date().toISOString();
    created = {
      id: `HWO-2027-${String(number).padStart(4, '0')}`,
      confirmation: `HWO-2027-${String(number).padStart(4, '0')}`,
      ticketId,
      hall,
      room,
      access: stringField(value.access) || null,
      category,
      description,
      safetyLevel: stringField(value.safetyLevel) || null,
      shop: stringField(value.shop) || null,
      window: windowText,
      interimMeasure: stringField(value.interimMeasure) || null,
      studentName: stringField(value.studentName || value.name) || null,
      email: stringField(value.email) || null,
      phone: stringField(value.phone) || null,
      language: stringField(value.language) || null,
      status: 'Scheduled',
      createdBy: 'Resolver bot (Student Services)',
      createdAt: now,
    };
    state.workOrders.push(created);
    return state;
  });
  if (missing) return json(400, { error: 'ticketId does not match a help-center ticket.' });
  return json(201, created);
}

async function listCases(url, ctx) {
  const limit = parseLimit(url);
  if (limit === null) return json(400, { error: 'limit must be an integer from 1 to 500.' });
  const cases = normalizeState(await ctx.storage.read())
    .cases.slice()
    .sort((a, b) => b.caseNumber.localeCompare(a.caseNumber))
    .slice(0, limit);
  return json(200, { cases, count: cases.length });
}

async function getCase(caseNumber, ctx) {
  const found = normalizeState(await ctx.storage.read()).cases.find((item) => item.caseNumber === caseNumber) ?? null;
  if (!found) return json(404, { error: 'Case not found.' });
  return json(200, found);
}

async function createCase(request, ctx) {
  const { value, error } = await readJson(request);
  if (error) return json(400, { error });
  const built = buildCase(value);
  if (built.error) return json(400, { error: built.error });

  let created = null;
  let conflict = null;
  await ctx.storage.update(async (current) => {
    const state = normalizeState(current);
    const numbers = state.cases.map((item) => caseSequence(item.caseNumber)).filter((n) => n > 0);
    const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
    const caseNumber = built.case.caseNumber || `TIX-2026-${String(next).padStart(4, '0')}`;
    if (state.cases.some((item) => item.caseNumber === caseNumber)) {
      conflict = caseNumber;
      return state;
    }
    created = { ...built.case, caseNumber, createdAt: new Date().toISOString() };
    state.cases.push(created);
    return state;
  });
  if (conflict) return json(409, { error: `${conflict} is already on the log.` });
  return json(201, created);
}

function caseSequence(caseNumber) {
  const match = /^TIX-2026-(\d{4})$/.exec(caseNumber ?? '');
  return match ? Number(match[1]) : 0;
}

function buildCase(input) {
  const caseNumber = stringField(input.caseNumber);
  if (caseNumber && !/^TIX-2026-\d{4}$/.test(caseNumber)) {
    return { error: 'Case number must look like TIX-2026-0042.' };
  }
  const dateReceived = requireDate(input.dateReceived, 'Date report received');
  if (dateReceived.error) return dateReceived;
  const howReceived = oneOf(input.howReceived, HOW_RECEIVED, 'How received');
  if (howReceived.error) return howReceived;
  const reporterRole = oneOf(input.reporterRole, REPORTER_ROLES, 'Reporter role');
  if (reporterRole.error) return reporterRole;
  const complainant = initialsField(input.complainant, 'Complainant', false);
  if (complainant.error) return complainant;
  const respondent = initialsField(input.respondent, 'Respondent', true);
  if (respondent.error) return respondent;
  const respondentAffiliation = oneOf(input.respondentAffiliation, AFFILIATIONS, 'Respondent affiliation');
  if (respondentAffiliation.error) return respondentAffiliation;
  const incidentDate = requireDate(input.incidentDate, 'Incident date');
  if (incidentDate.error) return incidentDate;
  const incidentLocation = stringField(input.incidentLocation);
  if (!incidentLocation) return { error: 'Incident location is required.' };
  const allegationType = oneOf(input.allegationType, ALLEGATIONS, 'Allegation type');
  if (allegationType.error) return allegationType;
  const summary = stringField(input.summary);
  if (summary.length < 20) return { error: 'Summary should be a short statement of the facts.' };
  const measures = input.supportiveMeasures;
  if (!Array.isArray(measures) || measures.length === 0) {
    return { error: 'Choose at least one supportive measure.' };
  }
  if (measures.some((item) => !MEASURES.includes(item))) {
    return { error: 'A supportive measure is not one of the listed choices.' };
  }
  const outreachDate = requireDate(input.outreachDate, 'Outreach date');
  if (outreachDate.error) return outreachDate;
  const nextStep = oneOf(input.nextStep, NEXT_STEPS, 'Next step');
  if (nextStep.error) return nextStep;
  const assignedInvestigator = oneOf(input.assignedInvestigator, INVESTIGATORS, 'Assigned investigator');
  if (assignedInvestigator.error) return assignedInvestigator;

  return {
    case: {
      caseNumber,
      dateReceived: dateReceived.value,
      howReceived: howReceived.value,
      reporterRole: reporterRole.value,
      complainant: complainant.value,
      respondent: respondent.value,
      respondentAffiliation: respondentAffiliation.value,
      incidentDate: incidentDate.value,
      incidentLocation,
      allegationType: allegationType.value,
      summary,
      supportiveMeasures: [...new Set(measures)],
      outreachDate: outreachDate.value,
      nextStep: nextStep.value,
      assignedInvestigator: assignedInvestigator.value,
    },
  };
}

function requireDate(value, label) {
  const text = stringField(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    return { error: `${label} must be a YYYY-MM-DD date.` };
  }
  return { value: text };
}

function oneOf(value, allowed, label) {
  const text = stringField(value);
  if (!allowed.includes(text)) return { error: `${label} must be one of the listed choices.` };
  return { value: text };
}

function initialsField(value, label, allowUnknown) {
  const text = stringField(value);
  if (!text) return { error: `${label} is required. Use initials only.` };
  if (allowUnknown && /^unknown$/i.test(text)) return { value: 'Unknown' };
  if (/\d/.test(text)) return { error: `${label} must be initials only. Do not enter an ID number.` };
  if (/[A-Za-z]{4,}/.test(text) || !/^[A-Za-z.\s]+$/.test(text)) {
    return { error: `${label} must be initials only, not a full name.` };
  }
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length < 1 || letters.length > 6) {
    return { error: `${label} must be initials only, not a full name.` };
  }
  return { value: text };
}

async function createRelease(request, ctx) {
  const { value, error } = await readJson(request);
  if (error) return json(400, { error });
  const parentTicketId = stringField(value.parentTicketId);
  const reason = stringField(value.reason);
  const studentMessage = stringField(value.studentMessage);
  if (!parentTicketId) return json(400, { error: 'parentTicketId is required.' });
  if (!Array.isArray(value.ticketIds) || value.ticketIds.length === 0) {
    return json(400, { error: 'ticketIds must list the requests to release.' });
  }
  const ticketIds = [...new Set(value.ticketIds.map((id) => stringField(id)).filter(Boolean))];
  if (!reason) return json(400, { error: 'reason is required.' });
  if (!studentMessage) return json(400, { error: 'studentMessage is required.' });

  let created = null;
  let message = null;
  await ctx.storage.update(async (current) => {
    const state = normalizeState(current);
    const known = new Set(state.tickets.map((ticket) => ticket.id));
    if (!known.has(parentTicketId)) {
      message = 'parentTicketId was not found.';
      return state;
    }
    for (const id of ticketIds) {
      if (!known.has(id)) {
        message = `Ticket ${id} was not found.`;
        return state;
      }
    }
    const number = state.nextReleaseNumber ?? 1001;
    state.nextReleaseNumber = number + 1;
    const now = new Date().toISOString();
    created = {
      id: `REL-${number}`,
      status: 'pending_approval',
      parentTicketId,
      ticketIds,
      reason,
      studentMessage,
      approvalChannel: null,
      approvalRef: null,
      approvedBy: null,
      approvalAt: null,
      rejectedBy: null,
      rejectionReason: null,
      createdAt: now,
      updatedAt: now,
    };
    state.releases.push(created);
    return state;
  });
  if (!created) return json(400, { error: message });
  return json(201, { id: created.id, status: created.status });
}

async function patchRelease(request, id, ctx) {
  const { value, error } = await readJson(request);
  if (error) return json(400, { error });
  const approvalChannel = stringField(value.approvalChannel ?? value.slackChannel);
  const approvalRef = stringField(value.approvalRef ?? value.slackTs);
  if (!approvalChannel && !approvalRef) {
    return json(400, { error: 'Send approvalChannel and approvalRef.' });
  }
  let updated = null;
  let message = null;
  await ctx.storage.update(async (current) => {
    const state = normalizeState(current);
    const release = state.releases.find((item) => item.id === id);
    if (!release) {
      message = 'missing';
      return state;
    }
    if (release.status !== 'pending_approval') {
      message = 'closed';
      return state;
    }
    if (approvalChannel) release.approvalChannel = approvalChannel;
    if (approvalRef) release.approvalRef = approvalRef;
    release.updatedAt = new Date().toISOString();
    updated = release;
    return state;
  });
  if (message === 'missing') return json(404, { error: 'Release not found.' });
  if (message === 'closed') return json(409, { error: 'This release is no longer pending approval.' });
  return json(200, updated);
}

async function approveRelease(request, id, ctx) {
  const { value, error } = await readJson(request);
  if (error) return json(400, { error });
  const approvedBy = stringField(value.approvedBy).toLowerCase();
  const approvalRef = stringField(value.approvalRef ?? value.slackTs);
  if (!approvedBy) return json(400, { error: 'approvedBy is required.' });
  const allow = String(ctx.env.RELEASE_APPROVERS ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length === 0) return json(403, { error: 'Approval list is not configured.' });
  if (!allow.includes(approvedBy)) return json(403, { error: 'This person cannot approve a release.' });

  let updated = null;
  let emails = [];
  let message = null;
  await ctx.storage.update(async (current) => {
    const state = normalizeState(current);
    const release = state.releases.find((item) => item.id === id);
    if (!release) {
      message = 'missing';
      return state;
    }
    if (release.status !== 'pending_approval') {
      message = 'closed';
      return state;
    }
    const now = new Date().toISOString();
    const linked = new Set([release.parentTicketId, ...release.ticketIds]);
    const seen = new Set();
    for (const ticket of state.tickets) {
      if (!linked.has(ticket.id)) continue;
      ticket.status = 'Resolved';
      ticket.updatedAt = now;
      ticket.comments = Array.isArray(ticket.comments) ? ticket.comments : [];
      ticket.comments.push({
        id: `cmt-rel-${release.id}-${ticket.id}`,
        author: 'Financial aid office',
        body: release.studentMessage,
        visibility: 'public',
        createdAt: now,
      });
      if (ticket.email && !seen.has(ticket.email.toLowerCase())) {
        seen.add(ticket.email.toLowerCase());
        emails.push(ticket.email);
      }
    }
    release.status = 'approved';
    release.approvedBy = approvedBy;
    if (approvalRef) release.approvalRef = approvalRef;
    release.approvalAt = now;
    release.updatedAt = now;
    updated = release;
    return state;
  });
  if (message === 'missing') return json(404, { error: 'Release not found.' });
  if (message === 'closed') return json(409, { error: 'This release is no longer pending approval.' });
  return json(200, {
    id: updated.id,
    status: updated.status,
    approvedBy: updated.approvedBy,
    approvalRef: updated.approvalRef,
    tickets: [updated.parentTicketId, ...updated.ticketIds.filter((ticketId) => ticketId !== updated.parentTicketId)],
    emails,
  });
}

async function rejectRelease(request, id, ctx) {
  const { value, error } = await readJson(request);
  if (error) return json(400, { error });
  const rejectedBy = stringField(value.rejectedBy);
  const reason = stringField(value.reason);
  if (!rejectedBy) return json(400, { error: 'rejectedBy is required.' });
  if (!reason) return json(400, { error: 'reason is required.' });
  let updated = null;
  let message = null;
  await ctx.storage.update(async (current) => {
    const state = normalizeState(current);
    const release = state.releases.find((item) => item.id === id);
    if (!release) {
      message = 'missing';
      return state;
    }
    if (release.status !== 'pending_approval') {
      message = 'closed';
      return state;
    }
    release.status = 'rejected';
    release.rejectedBy = rejectedBy;
    release.rejectionReason = reason;
    release.updatedAt = new Date().toISOString();
    updated = release;
    return state;
  });
  if (message === 'missing') return json(404, { error: 'Release not found.' });
  if (message === 'closed') return json(409, { error: 'This release is no longer pending approval.' });
  return json(200, {
    id: updated.id,
    status: updated.status,
    rejectedBy: updated.rejectedBy,
    reason: updated.rejectionReason,
  });
}
