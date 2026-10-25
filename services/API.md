# Help Center services API

Base URL after deploy: `https://<your-project>.vercel.app`

The browser site calls this API with `PUBLIC_SERVICES_URL` set to that origin (no trailing slash). Bots send the demo key in the `x-demo-key` header. That key is the `DEMO_BOT_KEY` environment variable. It is never part of the site build.

CORS allows `https://santiagogarza.github.io` and `http://localhost` or `http://127.0.0.1` on any port.

Ticket status values bots may set: `Received`, `In progress`, `Resolved`. Seeded tickets stay `Submitted` until a bot changes them.

## Environment

| Name | Required | Purpose |
| --- | --- | --- |
| `XAI_API_KEY` | For voice | Mints a short-lived call token. Never returned to the browser. |
| `DEMO_BOT_KEY` | Yes, in production | Value of `x-demo-key`. Also signs staff tokens. |
| `BLOB_READ_WRITE_TOKEN` | For durable storage | Private blob used as the database. Without it, state is in memory and disappears when the process stops. |
| `INTAKE_WEBHOOK_URL` | No | If set, each new ticket is forwarded here. |
| `INTAKE_WEBHOOK_HEADERS` | No | JSON object of extra headers, for example `{"x-intake-key":"..."}`. |
| `STAFF_PASSCODE` | For the case log screen | Exchanged for an 8-hour `x-staff-token`. Not the demo key. |
| `RELEASE_APPROVERS` | For aid-hold approval | Comma-separated emails. Comparison is case-insensitive. If empty, approval is refused. |

## Seeded tickets

`POST /api/admin/reset` restores these 16 ids, in this order. None of them are linked. The oldest financial-aid-hold duplicate, and the parent a triage run should use, is **UMS0412207**. The other ten holds are UMS0418861, UMS0420034, UMS0423519, UMS0425780, UMS0427113, UMS0429956, UMS0431402, UMS0433687, UMS0436025, and UMS0438270.

The five unrelated tickets are UMS0419348 (aid disbursement), UMS0424671 (billing), UMS0428833 (registration), UMS0432290 (password), and UMS0434518 (accessibility).

`liveTickets` from the workshop notes are not seeded. The typed form and the voice form create them.

The last seeded case is `TIX-2026-0041`. The next number assigned is `TIX-2026-0042`, then `TIX-2026-0043`.

## Tickets

### Create (public)

`POST /api/tickets`

The typed form and the voice form both send this body. The server assigns `id` (`UMS` plus 7 digits), `createdAt`, `updatedAt`, `status: "Received"`, `comments: []`, `parentId: null`, and `duplicates: []`. It ignores any id or status the client sends.

```bash
curl -s -X POST "$BASE/api/tickets" \
  -H 'content-type: application/json' \
  -d '{
    "category": "housing-repair",
    "subcategory": "Heat or cooling",
    "studentId": "700440782",
    "email": "lucia.mendoza@umars.edu",
    "subject": "No heat in Isidis Hall room 214",
    "description": "The heater in Isidis Hall room 214 stopped last night and the room is very cold.",
    "priority": "Urgent",
    "name": "Lucia Mendoza",
    "hall": "Isidis Hall",
    "room": "214",
    "availability": "Wednesday 2 to 4 p.m."
  }'
```

Required: `category`, `subcategory`, `studentId` (9 digits), `email` (`@umars.edu`), `subject`, `description`, `priority` (`Low`, `Normal`, or `Urgent`).

Optional, stored when present: `name`, `hall`, `room`, `availability`, `phone`, `language`, `attachmentName`.

`category` is one of `financial-aid`, `financial-aid-hold`, `housing`, `housing-repair`, `registration`, `it`, `billing`, `accessibility`, `other`.

### List every ticket (demo key)

`GET /api/tickets`

Newest `createdAt` first. Filters: `status`, `category`, `since` (inclusive ISO date or time), `limit` (1–500, default 100).

```bash
curl -s "$BASE/api/tickets?status=Submitted&category=financial-aid-hold&since=2026-10-20T00:00:00Z&limit=50" \
  -H "x-demo-key: $DEMO_BOT_KEY"
```

Response:

```json
{ "tickets": [ { "id": "UMS0438270", "parentId": null, "duplicates": [], "parent": null, "duplicateTickets": [] } ], "count": 1 }
```

Each ticket includes the form fields, `status`, `createdAt`, `updatedAt`, `comments`, `parentId`, `duplicates`, and, when set, `duplicateReason`, `assignee`, and `note`. `parent` and `duplicateTickets` are short summaries (`id`, `subject`, `status`, `email`, `createdAt`).

A request with no `ids` and no demo key is `401`.

### Public lookup by id

`GET /api/tickets?ids=UMS0412207,UMS0438270`

No demo key. Returns only those ids, still newest first, under `{ "tickets", "count" }`. Internal comments are removed. `parentId`, `duplicates`, `duplicateReason`, `parent`, and `duplicateTickets` are omitted so one student lookup does not reveal the cluster.

### Get one ticket (demo key)

```bash
curl -s "$BASE/api/tickets/UMS0412207" -H "x-demo-key: $DEMO_BOT_KEY"
```

Full ticket, including internal comments, `parent`, and `duplicateTickets`. `404` when the id is unknown.

### Update (demo key)

```bash
curl -s -X PATCH "$BASE/api/tickets/UMS0412207" \
  -H "x-demo-key: $DEMO_BOT_KEY" \
  -H 'content-type: application/json' \
  -d '{"status":"In progress","assignee":"Help Center","category":"financial-aid-hold","note":"Reading the packet."}'
```

Send at least one of `status`, `assignee`, `category`, `note`. `status` must be `Received`, `In progress`, or `Resolved`. `category` must be one of the slugs above. The label is updated to match.

### Comment (demo key)

```bash
curl -s -X POST "$BASE/api/tickets/UMS0412207/comments" \
  -H "x-demo-key: $DEMO_BOT_KEY" \
  -H 'content-type: application/json' \
  -d '{"author":"Help Center","body":"The hold is still open.","visibility":"public"}'
```

`visibility` is `public` or `internal`. The comment is appended to `comments` and returned with the ticket. The site shows public comments only.

### Link duplicates (demo key)

Idempotent. The parent must not already be someone else's duplicate. A ticket that already has children cannot be linked as a child. Linking the same id again does not duplicate it.

```bash
curl -s -X POST "$BASE/api/tickets/UMS0412207/duplicates" \
  -H "x-demo-key: $DEMO_BOT_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "duplicateIds": ["UMS0418861","UMS0420034","UMS0423519","UMS0425780","UMS0427113","UMS0429956","UMS0431402","UMS0433687","UMS0436025","UMS0438270"],
    "reason": "Same aid-year worksheet"
  }'
```

Sets `parentId` on each child and lists those ids on the parent's `duplicates`. `reason` is saved as `duplicateReason`. Reset clears every link.

## Intake webhook

When `INTAKE_WEBHOOK_URL` is set, the server POSTs the new ticket before it answers the browser. A failed forward is logged and the ticket is still created. If the variable is unset, nothing is sent.

Headers are `content-type: application/json` plus every string value in `INTAKE_WEBHOOK_HEADERS`.

Body, exactly:

```json
{
  "event": "ticket.created",
  "ticket": {
    "id": "UMS0123456",
    "category": "housing-repair",
    "categoryLabel": "Housing repair",
    "subcategory": "Heat or cooling",
    "studentId": "700440782",
    "email": "lucia.mendoza@umars.edu",
    "subject": "No heat in Isidis Hall room 214",
    "description": "The heater in Isidis Hall room 214 stopped last night and the room is very cold.",
    "priority": "Urgent",
    "attachmentName": null,
    "createdAt": "2027-01-11T18:04:00.000Z",
    "updatedAt": "2027-01-11T18:04:00.000Z",
    "status": "Received",
    "comments": [],
    "parentId": null,
    "duplicates": [],
    "name": "Lucia Mendoza",
    "hall": "Isidis Hall",
    "room": "214",
    "availability": "Wednesday 2 to 4 p.m."
  }
}
```

Optional keys (`name`, `hall`, `room`, `availability`, `phone`, `language`) appear only when the form sent them.

## Voice session (public, browser origin only)

`POST /api/voice/session`

The `Origin` header must be the university site or local development. The response is `{ "value", "expires_at" }`. The browser connects to `wss://api.x.ai/v1/realtime?model=grok-voice-latest` with the subprotocol `xai-client-secret.<value>`. The API key stays on the server.

```bash
curl -s -X POST "$BASE/api/voice/session" \
  -H 'origin: https://santiagogarza.github.io' \
  -H 'content-type: application/json' \
  -d '{}'
```

## Work orders

Writes need the demo key. Reads are open so the facilities page can list them.

```bash
curl -s -X POST "$BASE/api/work-orders" \
  -H "x-demo-key: $DEMO_BOT_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "ticketId": "UMS0440782",
    "hall": "Isidis Hall",
    "room": "214",
    "access": "student present",
    "category": "Heat or cooling",
    "description": "Heater stopped overnight. The room is very cold.",
    "safetyLevel": "Urgent",
    "shop": "HVAC",
    "window": "Wed Oct 28, 2–4 p.m. PT",
    "interimMeasure": "Space heater by 8 p.m.",
    "studentName": "Lucia Mendoza",
    "email": "lucia.mendoza@umars.edu",
    "phone": "(628) 555-0123",
    "language": "English"
  }'
```

`issue` is accepted as an alias of `category`. `slot` is accepted as an alias of `window`. `ticketId` must already exist.

The confirmation is `HWO-2027-` plus four digits, starting at `HWO-2027-1001` after a reset. `status` is `Scheduled`. `id` and `confirmation` are the same string.

```bash
curl -s "$BASE/api/work-orders"
curl -s "$BASE/api/work-orders/HWO-2027-1001"
```

Recommended `category` values: Plumbing, Electrical, Heat or cooling, Furniture or fixture, Pest, Other repair. Recommended `shop` values: HVAC, Plumbing, Electrical, Carpentry, Pest. Recommended `safetyLevel` values: Emergency, Urgent, Routine. Recommended `access` values: `student present`, `entry approved`. Recommended `language` values: English, Spanish, both.

## Title IX case log

Reads and writes accept either `x-demo-key` or `x-staff-token`.

Staff screens on the public site (`/staff/title-ix/new/` and `/staff/title-ix/`) exchange `STAFF_PASSCODE` for a token:

```bash
curl -s -X POST "$BASE/api/staff/session" \
  -H 'content-type: application/json' \
  -d '{"passcode":"'"$STAFF_PASSCODE"'"}'
```

Response: `{ "token", "expiresAt" }`. Send the token as `x-staff-token`. It can only call the case-log routes. It is not the demo key.

The same screens are also served by this project at `/staff/title-ix/new` and `/staff/title-ix`.

### Create

`caseNumber` is optional. Leave it out to assign the next `TIX-2026-####`.

```bash
curl -s -X POST "$BASE/api/title-ix/cases" \
  -H "x-demo-key: $DEMO_BOT_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "dateReceived": "2026-10-27",
    "howReceived": "Email",
    "reporterRole": "Employee (mandatory reporter)",
    "complainant": "M.K.",
    "respondent": "D.F.",
    "respondentAffiliation": "Employee",
    "incidentDate": "2026-10-21",
    "incidentLocation": "Hellas Science Building, room 120",
    "allegationType": "Sexual harassment",
    "summary": "M.K. reported repeated comments about her body during lab on October 14 and October 21. M.K. asked to switch lab sections.",
    "supportiveMeasures": ["Class schedule change", "Counseling referral"],
    "outreachDate": "2026-10-27",
    "nextStep": "Intake meeting scheduled",
    "assignedInvestigator": "Coordinator (Title IX office)"
  }'
```

`complainant` and `respondent` must be initials (letters, periods, and spaces, no word of four or more letters, no digits). `respondent` may be `Unknown`. A 9-digit student id is rejected.

Dropdown values:

- howReceived: Online form, Email, In person, Phone, Third party
- reporterRole: Complainant, Witness, Employee (mandatory reporter), Anonymous
- respondentAffiliation: Student, Employee, Third party, Unknown
- allegationType: Sexual harassment, Sexual assault, Dating violence, Domestic violence, Stalking, Retaliation, Other sex discrimination
- supportiveMeasures: No-contact directive, Class schedule change, Housing change, Counseling referral, Academic extension, None requested
- nextStep: Intake meeting scheduled, Awaiting complainant response, Formal complaint filed, Informal resolution, Closed: no further action
- assignedInvestigator: Coordinator (Title IX office), Deputy coordinator A, Deputy coordinator B

Dates are `YYYY-MM-DD`.

### List and get

```bash
curl -s "$BASE/api/title-ix/cases" -H "x-demo-key: $DEMO_BOT_KEY"
curl -s "$BASE/api/title-ix/cases/TIX-2026-0041" -H "x-demo-key: $DEMO_BOT_KEY"
```

List response: `{ "cases", "count" }`, highest case number first.

## Aid-hold releases

All of these need the demo key. Creating a release does not change tickets.

```bash
curl -s -X POST "$BASE/api/aid-holds/releases" \
  -H "x-demo-key: $DEMO_BOT_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "parentTicketId": "UMS0412207",
    "ticketIds": ["UMS0412207","UMS0418861"],
    "reason": "Wrong worksheet year on the aid page.",
    "studentMessage": "The hold is cleared. You can register."
  }'
```

Response: `{ "id": "REL-1001", "status": "pending_approval" }`.

Record where the approval request was posted. `slackChannel` is stored as `approvalChannel`. `slackTs` is stored as `approvalRef`.

```bash
curl -s -X PATCH "$BASE/api/aid-holds/releases/REL-1001" \
  -H "x-demo-key: $DEMO_BOT_KEY" \
  -H 'content-type: application/json' \
  -d '{"approvalChannel":"aid-approvals","approvalRef":"1710000000.0001"}'
```

Approve. `approvedBy` must be on `RELEASE_APPROVERS`. `slackTs` is accepted as `approvalRef`.

```bash
curl -s -X POST "$BASE/api/aid-holds/releases/REL-1001/approve" \
  -H "x-demo-key: $DEMO_BOT_KEY" \
  -H 'content-type: application/json' \
  -d '{"approvedBy":"aid.approver@umars.edu","approvalRef":"1710000000.0001"}'
```

On success every linked ticket (`parentTicketId` and each `ticketIds` entry) becomes `Resolved`, and each gains a public comment whose body is `studentMessage` and whose author is `Financial aid office`. The response includes `emails`, the distinct UM addresses on those tickets.

```bash
curl -s -X POST "$BASE/api/aid-holds/releases/REL-1001/reject" \
  -H "x-demo-key: $DEMO_BOT_KEY" \
  -H 'content-type: application/json' \
  -d '{"rejectedBy":"Aid office","reason":"Need the signed page."}'
```

Reject leaves the tickets unchanged. Reset deletes every release.

## Reset

```bash
curl -s -X POST "$BASE/api/admin/reset" \
  -H "x-demo-key: $DEMO_BOT_KEY" \
  -H 'content-type: application/json' \
  -d '{}'
```

Response:

```json
{
  "ok": true,
  "tickets": 16,
  "workOrders": 0,
  "cases": 3,
  "releases": 0,
  "ticketIds": ["UMS0412207", "UMS0418861", "UMS0419348", "UMS0420034", "UMS0423519", "UMS0424671", "UMS0425780", "UMS0427113", "UMS0428833", "UMS0429956", "UMS0431402", "UMS0432290", "UMS0433687", "UMS0434518", "UMS0436025", "UMS0438270"],
  "oldestFinancialAidHoldId": "UMS0412207",
  "lastCaseNumber": "TIX-2026-0041"
}
```

Duplicate links are gone. Work orders and releases are gone. Cases end at `TIX-2026-0041` again. The next work order is `HWO-2027-1001`. The next release is `REL-1001`.

`npm run reset-demo` calls this route when `SERVICES_URL` and `DEMO_BOT_KEY` are set in the environment.
