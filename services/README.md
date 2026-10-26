# University of Mars services

Small HTTP API for the workshop: help-center tickets, a voice-call token, housing work orders, the Title IX case log, and aid-hold releases. The contract is [API.md](./API.md).

This folder is its own project. Create a Vercel project, set the root directory to `services`, and deploy. `vercel.json` is already here. The site on GitHub Pages stays static and talks to this API through `PUBLIC_SERVICES_URL`.

## Environment variables

Set these on the project, not in the repository:

| Name | Required | Purpose |
| --- | --- | --- |
| `XAI_API_KEY` | For live calls | Server-side key used only by `POST /api/voice/session`. |
| `DEMO_BOT_KEY` | Yes | Shared secret for `x-demo-key`. Bots and `npm run reset-demo` use it. |
| `BLOB_READ_WRITE_TOKEN` | Yes, for a real deploy | Private blob store. Without it, data lives in the instance memory and a new instance starts from the seed again. |
| `INTAKE_WEBHOOK_URL` | No | Where each new ticket is forwarded. |
| `INTAKE_WEBHOOK_HEADERS` | No | JSON object of headers to add to that forward. |
| `STAFF_PASSCODE` | For the case-log screens | What a person types on `/staff/title-ix`. The server returns a short-lived `x-staff-token`. |
| `RELEASE_APPROVERS` | For aid-hold approval | Comma-separated approver names or emails, for example `resolver-bot`. Comparison is case-insensitive. If empty, approval is refused. |
| `ALLOWED_ORIGINS` | No | Extra browser origins, comma-separated, added to `https://santiagogarza.github.io`. Localhost is always allowed. |

Do not put `DEMO_BOT_KEY` or `XAI_API_KEY` in the site build. The site variable `PUBLIC_STAFF_PASSCODE` is only a matching copy of `STAFF_PASSCODE` so the public pages can show the gate. It is a workshop passcode, not the bot key.

After deploy, set the repository variable `PUBLIC_SERVICES_URL` to this project's origin, with no path and no trailing slash, and re-run the Pages workflow.

## Local run

From the repository root, with no blob token, state stays in memory and starts from `seed-data.json`:

```bash
npm run services
```

The process listens on `http://127.0.0.1:8787`. Point the site at it with `PUBLIC_SERVICES_URL=http://127.0.0.1:8787` before `npm run dev`.

```bash
npm test
```

The tests use the in-memory store. They cover tickets, auth, comments, duplicate links, work orders, the case log, releases, reset, and the intake forward.

## Staff screens on this host

- `/staff/title-ix/new`
- `/staff/title-ix`

They ask for the staff passcode and then call the API with `x-staff-token`. The same pages exist on the public site and are not linked from the navigation.
