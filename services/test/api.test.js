import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { loadSeed, memoryStorage } from '../src/storage.js';

const KEY = 'demo-key';
const PASSCODE = 'workshop-pass';
const APPROVER = 'aid.approver@umars.edu';

const SEED_IDS = [
  'UMS0412207',
  'UMS0418861',
  'UMS0419348',
  'UMS0420034',
  'UMS0423519',
  'UMS0424671',
  'UMS0425780',
  'UMS0427113',
  'UMS0428833',
  'UMS0429956',
  'UMS0431402',
  'UMS0432290',
  'UMS0433687',
  'UMS0434518',
  'UMS0436025',
  'UMS0438270',
];

const HOLD_IDS = [
  'UMS0412207',
  'UMS0418861',
  'UMS0420034',
  'UMS0423519',
  'UMS0425780',
  'UMS0427113',
  'UMS0429956',
  'UMS0431402',
  'UMS0433687',
  'UMS0436025',
  'UMS0438270',
];

function app(overrides = {}) {
  const calls = [];
  const fetchImpl = overrides.fetch
    ?? (async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ value: 'ephemeral-token', expires_at: 1 }), { status: 200 });
    });
  const env = {
    DEMO_BOT_KEY: KEY,
    STAFF_PASSCODE: PASSCODE,
    RELEASE_APPROVERS: APPROVER,
    XAI_API_KEY: 'secret-api-key',
    ...overrides.env,
  };
  const storage = overrides.storage ?? memoryStorage(loadSeed());
  return {
    calls,
    api: createApp({ env, fetch: fetchImpl, storage, log() {} }),
  };
}

async function call(api, method, path, { body, key, token, origin, headers } = {}) {
  const requestHeaders = { origin: origin ?? 'http://localhost:4321', ...(headers ?? {}) };
  if (key) requestHeaders['x-demo-key'] = key;
  if (token) requestHeaders['x-staff-token'] = token;
  let payload;
  if (body !== undefined) {
    requestHeaders['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await api.handle(
    new Request(`http://127.0.0.1${path}`, { method, headers: requestHeaders, body: payload }),
  );
  const text = await response.text();
  let json = null;
  if (text) json = JSON.parse(text);
  return { status: response.status, json, text, headers: response.headers };
}

const ticketBody = {
  category: 'housing-repair',
  subcategory: 'Heat or cooling',
  studentId: '700440782',
  email: 'lucia.mendoza@umars.edu',
  subject: 'No heat in Isidis Hall room 214',
  description: 'The heater in Isidis Hall room 214 stopped last night and the room is very cold.',
  priority: 'Urgent',
  name: 'Lucia Mendoza',
  hall: 'Isidis Hall',
  room: '214',
  availability: 'Wednesday 2 to 4 p.m.',
};

test('seed is exactly 16 tickets and reset restores them unlinked', async () => {
  const seed = loadSeed();
  assert.equal(seed.tickets.length, 16);
  assert.deepEqual(seed.tickets.map((ticket) => ticket.id), SEED_IDS);
  assert.equal(seed.tickets.filter((ticket) => ticket.category === 'financial-aid-hold').length, 11);
  assert.equal(seed.cases.at(-1).caseNumber, 'TIX-2026-0041');
  for (const ticket of seed.tickets) {
    assert.equal(ticket.parentId, null);
    assert.deepEqual(ticket.duplicates, []);
    assert.deepEqual(ticket.comments, []);
  }
  assert.equal(seed.tickets[0].subject, 'Aid hold still on after I sent my worksheet');

  const { api } = app();
  const linked = await call(api, 'POST', '/api/tickets/UMS0412207/duplicates', {
    key: KEY,
    body: { duplicateIds: ['UMS0418861'], reason: 'Same worksheet year' },
  });
  assert.equal(linked.status, 200);
  assert.deepEqual(linked.json.duplicates, ['UMS0418861']);

  const reset = await call(api, 'POST', '/api/admin/reset', { key: KEY });
  assert.equal(reset.status, 200);
  assert.equal(reset.json.ok, true);
  assert.equal(reset.json.tickets, 16);
  assert.equal(reset.json.workOrders, 0);
  assert.equal(reset.json.releases, 0);
  assert.deepEqual(reset.json.ticketIds, SEED_IDS);
  assert.equal(reset.json.oldestFinancialAidHoldId, 'UMS0412207');
  assert.equal(reset.json.lastCaseNumber, 'TIX-2026-0041');

  const parent = await call(api, 'GET', '/api/tickets/UMS0412207', { key: KEY });
  assert.equal(parent.json.parentId, null);
  assert.deepEqual(parent.json.duplicates, []);
  const child = await call(api, 'GET', '/api/tickets/UMS0418861', { key: KEY });
  assert.equal(child.json.parentId, null);
});

test('ticket list is protected, filterable, and newest first; ids lookup is public', async () => {
  const { api } = app();
  const denied = await call(api, 'GET', '/api/tickets');
  assert.equal(denied.status, 401);

  const all = await call(api, 'GET', '/api/tickets', { key: KEY });
  assert.equal(all.status, 200);
  assert.equal(all.json.count, 16);
  assert.equal(all.json.tickets[0].id, 'UMS0438270');
  assert.equal(all.json.tickets.at(-1).id, 'UMS0412207');

  const holds = await call(api, 'GET', '/api/tickets?category=financial-aid-hold&status=Submitted', { key: KEY });
  assert.equal(holds.json.count, 11);
  assert.deepEqual(
    holds.json.tickets.map((ticket) => ticket.id).sort(),
    HOLD_IDS.slice().sort(),
  );

  const recent = await call(api, 'GET', '/api/tickets?since=2026-10-25T00:00:00Z&limit=1', { key: KEY });
  assert.equal(recent.json.count, 1);
  assert.equal(recent.json.tickets[0].id, 'UMS0438270');

  const pub = await call(api, 'GET', '/api/tickets?ids=UMS0412207,missing');
  assert.equal(pub.status, 200);
  assert.equal(pub.json.tickets.length, 1);
  assert.equal(pub.json.tickets[0].id, 'UMS0412207');
  assert.equal(pub.json.tickets[0].parentId, undefined);
});

test('ticket create, patch auth, comments, and duplicate linking', async () => {
  const { api, calls } = app({
    env: {
      INTAKE_WEBHOOK_URL: 'https://intake.example.test/hook',
      INTAKE_WEBHOOK_HEADERS: JSON.stringify({ 'x-intake-key': 'hook-secret' }),
    },
  });

  const created = await call(api, 'POST', '/api/tickets', { body: ticketBody });
  assert.equal(created.status, 201);
  assert.match(created.json.id, /^UMS\d{7}$/);
  assert.equal(created.json.status, 'Received');
  assert.equal(created.json.hall, 'Isidis Hall');
  assert.equal(created.json.parentId, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://intake.example.test/hook');
  assert.equal(calls[0].init.headers['x-intake-key'], 'hook-secret');
  const forwarded = JSON.parse(calls[0].init.body);
  assert.equal(forwarded.event, 'ticket.created');
  assert.equal(forwarded.ticket.id, created.json.id);
  assert.equal(forwarded.ticket.email, 'lucia.mendoza@umars.edu');

  const denied = await call(api, 'PATCH', `/api/tickets/${created.json.id}`, {
    body: { status: 'In progress' },
  });
  assert.equal(denied.status, 401);

  const patched = await call(api, 'PATCH', `/api/tickets/${created.json.id}`, {
    key: KEY,
    body: { status: 'In progress', assignee: 'Help Center', category: 'housing', note: 'Desk is reading it.' },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.status, 'In progress');
  assert.equal(patched.json.assignee, 'Help Center');
  assert.equal(patched.json.category, 'housing');
  assert.equal(patched.json.categoryLabel, 'Housing & residential life');
  assert.equal(patched.json.note, 'Desk is reading it.');

  const bad = await call(api, 'PATCH', `/api/tickets/${created.json.id}`, {
    key: KEY,
    body: { status: 'Closed' },
  });
  assert.equal(bad.status, 400);

  const internal = await call(api, 'POST', `/api/tickets/${created.json.id}/comments`, {
    key: KEY,
    body: { author: 'Intake', body: 'Possible duplicate cluster.', visibility: 'internal' },
  });
  assert.equal(internal.status, 201);
  const pubComment = await call(api, 'POST', `/api/tickets/${created.json.id}/comments`, {
    key: KEY,
    body: { author: 'Help Center', body: 'We have the request.', visibility: 'public' },
  });
  assert.equal(pubComment.status, 201);

  const secret = await call(api, 'GET', `/api/tickets/${created.json.id}`, { key: KEY });
  assert.equal(secret.json.comments.length, 2);
  const masked = await call(api, 'GET', `/api/tickets?ids=${created.json.id}`);
  assert.equal(masked.json.tickets[0].comments.length, 1);
  assert.equal(masked.json.tickets[0].comments[0].visibility, 'public');
  assert.equal(masked.json.tickets[0].note, 'Desk is reading it.');

  const link = await call(api, 'POST', '/api/tickets/UMS0412207/duplicates', {
    key: KEY,
    body: { duplicateIds: HOLD_IDS.slice(1), reason: 'S1 worksheet year' },
  });
  assert.equal(link.status, 200);
  assert.equal(link.json.duplicateTickets.length, 10);
  assert.equal(link.json.duplicateReason, 'S1 worksheet year');
  const again = await call(api, 'POST', '/api/tickets/UMS0412207/duplicates', {
    key: KEY,
    body: { duplicateIds: ['UMS0418861'], reason: 'S1 worksheet year' },
  });
  assert.equal(again.status, 200);
  assert.equal(again.json.duplicates.length, 10);

  const child = await call(api, 'GET', '/api/tickets/UMS0438270', { key: KEY });
  assert.equal(child.json.parentId, 'UMS0412207');
  assert.equal(child.json.parent.id, 'UMS0412207');
});

test('webhook is skipped when the intake URL is unset', async () => {
  const { api, calls } = app();
  const created = await call(api, 'POST', '/api/tickets', { body: ticketBody });
  assert.equal(created.status, 201);
  assert.equal(calls.length, 0);
});

test('work orders book a confirmation and can be listed', async () => {
  const { api } = app();
  const denied = await call(api, 'POST', '/api/work-orders', {
    body: { ticketId: 'UMS0424671', hall: 'Isidis Hall', room: '214', issue: 'Heat or cooling', slot: 'Wed 2-4 p.m.', description: 'No heat.' },
  });
  assert.equal(denied.status, 401);

  const booked = await call(api, 'POST', '/api/work-orders', {
    key: KEY,
    body: {
      ticketId: 'UMS0424671',
      hall: 'Isidis Hall',
      room: '214',
      issue: 'Heat or cooling',
      slot: 'Wed Oct 28, 2–4 p.m. PT',
      description: 'Heater stopped overnight.',
      access: 'student present',
      safetyLevel: 'Urgent',
      shop: 'HVAC',
      interimMeasure: 'Space heater by 8 p.m.',
      studentName: 'Grace Kim',
      email: 'grace.kim@umars.edu',
      phone: '(628) 555-0144',
      language: 'English',
    },
  });
  assert.equal(booked.status, 201);
  assert.match(booked.json.confirmation, /^HWO-2027-\d{4}$/);
  assert.equal(booked.json.status, 'Scheduled');
  assert.equal(booked.json.category, 'Heat or cooling');
  assert.equal(booked.json.window, 'Wed Oct 28, 2–4 p.m. PT');

  const list = await call(api, 'GET', '/api/work-orders');
  assert.equal(list.json.count, 1);
  const one = await call(api, 'GET', `/api/work-orders/${booked.json.confirmation}`);
  assert.equal(one.status, 200);
  assert.equal(one.json.room, '214');
});

test('title IX validation, numbering, and staff token', async () => {
  const { api } = app();
  const denied = await call(api, 'GET', '/api/title-ix/cases');
  assert.equal(denied.status, 401);

  const list = await call(api, 'GET', '/api/title-ix/cases', { key: KEY });
  assert.equal(list.json.cases[0].caseNumber, 'TIX-2026-0041');

  const session = await call(api, 'POST', '/api/staff/session', { body: { passcode: PASSCODE } });
  assert.equal(session.status, 200);
  assert.equal(typeof session.json.token, 'string');
  assert.doesNotMatch(session.json.token, /demo-key/);

  const practice = caseBody({ caseNumber: 'TIX-2026-0042', complainant: 'A.R.', respondent: 'J.T.' });
  const filed = await call(api, 'POST', '/api/title-ix/cases', { token: session.json.token, body: practice });
  assert.equal(filed.status, 201);
  assert.equal(filed.json.caseNumber, 'TIX-2026-0042');

  const bot = await call(api, 'POST', '/api/title-ix/cases', { key: KEY, body: caseBody() });
  assert.equal(bot.status, 201);
  assert.equal(bot.json.caseNumber, 'TIX-2026-0043');

  const fullName = await call(api, 'POST', '/api/title-ix/cases', {
    key: KEY,
    body: caseBody({ complainant: 'Amara Okafor' }),
  });
  assert.equal(fullName.status, 400);

  const digits = await call(api, 'POST', '/api/title-ix/cases', {
    key: KEY,
    body: caseBody({ respondent: '700412207' }),
  });
  assert.equal(digits.status, 400);

  const unknown = await call(api, 'POST', '/api/title-ix/cases', {
    key: KEY,
    body: caseBody({ respondent: 'Unknown', caseNumber: 'TIX-2026-0044' }),
  });
  assert.equal(unknown.status, 201);
  assert.equal(unknown.json.respondent, 'Unknown');

  const one = await call(api, 'GET', '/api/title-ix/cases/TIX-2026-0042', { token: session.json.token });
  assert.equal(one.status, 200);
  assert.equal(one.json.complainant, 'A.R.');
});

test('aid-hold release approval, aliases, and reset', async () => {
  const { api } = app();
  const created = await call(api, 'POST', '/api/aid-holds/releases', {
    key: KEY,
    body: {
      parentTicketId: 'UMS0412207',
      ticketIds: ['UMS0412207', 'UMS0418861'],
      reason: 'Wrong worksheet year on the aid page.',
      studentMessage: 'The hold is cleared. You can register.',
    },
  });
  assert.equal(created.status, 201);
  assert.match(created.json.id, /^REL-\d+$/);
  assert.equal(created.json.status, 'pending_approval');

  const still = await call(api, 'GET', '/api/tickets/UMS0412207', { key: KEY });
  assert.equal(still.json.status, 'Submitted');

  const posted = await call(api, 'PATCH', `/api/aid-holds/releases/${created.json.id}`, {
    key: KEY,
    body: { slackChannel: 'aid-approvals', slackTs: '1710000000.0001' },
  });
  assert.equal(posted.status, 200);
  assert.equal(posted.json.approvalChannel, 'aid-approvals');
  assert.equal(posted.json.approvalRef, '1710000000.0001');

  const refused = await call(api, 'POST', `/api/aid-holds/releases/${created.json.id}/approve`, {
    key: KEY,
    body: { approvedBy: 'someone.else@umars.edu', approvalRef: '1710000000.0001' },
  });
  assert.equal(refused.status, 403);

  const approved = await call(api, 'POST', `/api/aid-holds/releases/${created.json.id}/approve`, {
    key: KEY,
    body: { approvedBy: 'Aid.Approver@umars.edu', slackTs: '1710000000.0002' },
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.json.status, 'approved');
  assert.deepEqual(approved.json.emails.sort(), ['amara.okafor@umars.edu', 'diego.ramirez@umars.edu']);

  const parent = await call(api, 'GET', '/api/tickets/UMS0412207', { key: KEY });
  assert.equal(parent.json.status, 'Resolved');
  assert.equal(parent.json.comments.at(-1).visibility, 'public');
  assert.equal(parent.json.comments.at(-1).body, 'The hold is cleared. You can register.');

  const second = await call(api, 'POST', '/api/aid-holds/releases', {
    key: KEY,
    body: {
      parentTicketId: 'UMS0420034',
      ticketIds: ['UMS0420034'],
      reason: 'Another packet.',
      studentMessage: 'Not yet.',
    },
  });
  const rejected = await call(api, 'POST', `/api/aid-holds/releases/${second.json.id}/reject`, {
    key: KEY,
    body: { rejectedBy: 'Aid office', reason: 'Need the signed page.' },
  });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.json.status, 'rejected');
  const untouched = await call(api, 'GET', '/api/tickets/UMS0420034', { key: KEY });
  assert.equal(untouched.json.status, 'Submitted');

  const reset = await call(api, 'POST', '/api/admin/reset', { key: KEY });
  assert.equal(reset.json.releases, 0);
  const restored = await call(api, 'GET', '/api/tickets/UMS0412207', { key: KEY });
  assert.equal(restored.json.status, 'Submitted');
  assert.equal(restored.json.comments.length, 0);
});

test('voice session returns an ephemeral token and never the API key', async () => {
  const { api, calls } = app();
  const ok = await call(api, 'POST', '/api/voice/session', { origin: 'https://santiagogarza.github.io' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.value, 'ephemeral-token');
  assert.equal(ok.text.includes('secret-api-key'), false);
  assert.equal(calls[0].url, 'https://api.x.ai/v1/realtime/client_secrets');
  assert.equal(calls[0].init.headers.authorization, 'Bearer secret-api-key');
  assert.deepEqual(JSON.parse(calls[0].init.body), { expires_after: { seconds: 300 } });

  const blocked = await call(api, 'POST', '/api/voice/session', { origin: 'https://example.test' });
  assert.equal(blocked.status, 403);

  const { api: bare } = app({ env: { XAI_API_KEY: '' } });
  const missing = await call(bare, 'POST', '/api/voice/session', { origin: 'http://127.0.0.1:4321' });
  assert.equal(missing.status, 503);
});

test('a list does not persist the seed into an empty store', async () => {
  const storage = memoryStorage(null);
  const { api } = app({ storage });
  const listed = await call(api, 'GET', '/api/tickets', { key: KEY });
  assert.equal(listed.status, 200);
  assert.equal(listed.json.count, 16);
  assert.equal(await storage.read(), null);
  const capped = await call(api, 'GET', '/api/title-ix/cases?limit=1', { key: KEY });
  assert.equal(capped.json.count, 1);
  assert.equal(capped.json.cases[0].caseNumber, 'TIX-2026-0041');
});

test('admin reset and writes reject a missing demo key', async () => {
  const { api } = app();
  assert.equal((await call(api, 'POST', '/api/admin/reset')).status, 401);
  assert.equal((await call(api, 'POST', '/api/tickets/UMS0412207/comments', { body: { author: 'A', body: 'B', visibility: 'public' } })).status, 401);
});

function caseBody(overrides = {}) {
  return {
    dateReceived: '2026-10-26',
    howReceived: 'Online form',
    reporterRole: 'Complainant',
    complainant: 'M.K.',
    respondent: 'D.F.',
    respondentAffiliation: 'Employee',
    incidentDate: '2026-10-21',
    incidentLocation: 'Hellas Science Building, room 120',
    allegationType: 'Sexual harassment',
    summary: 'M.K. reported repeated comments about her body during lab on October 14 and October 21. M.K. asked to switch lab sections.',
    supportiveMeasures: ['Class schedule change', 'Counseling referral'],
    outreachDate: '2026-10-27',
    nextStep: 'Intake meeting scheduled',
    assignedInvestigator: 'Coordinator (Title IX office)',
    ...overrides,
  };
}
