# University of Mars

Static website for the University of Mars, a fictional public research university on the Jezero campus. It is the target site for a live higher-ed workshop: it should look like a real campus site, and it includes five deliberate content and accessibility issues for the demo.

Today on the site is Monday, January 11, 2027, the second week of Spring Semester 2027. Instruction began Monday, January 4, and the add/drop deadline is Friday, January 15, 2027. The current aid year is 2026–27. Fall Semester 2026 has ended. The university was chartered in 2004.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:4321/university-of-mars/](http://localhost:4321/university-of-mars/).

Asset and page URLs include the `/university-of-mars/` base path so the same build works locally and on GitHub Pages.

```bash
npm run lint
npm run build
npm run preview
```

`npm run build` writes a static site to `dist/`.

## Photographs

The six campus photographs live in `public/images/` under these filenames:

- `hero-quad.jpg`
- `library.jpg`
- `residence-halls.jpg`
- `students.jpg`
- `lecture-hall.jpg`
- `research.jpg`

Replace a file, keep the filename, then run `npm run optimize-images`. The dev server and the production build write responsive WebP files beside the JPEGs, at 640, 960, and 1280 pixels wide, plus 1920 when the source is at least that wide. Those derivatives are gitignored.

`scripts/make-placeholders.py` overwrites the six JPEGs with flat stand-ins. Do not run it unless you mean to discard the photographs.

## Deploy

Pushing to `main` runs `.github/workflows/pages.yml`, which builds the site and deploys it to GitHub Pages.

Published URL: [https://santiagogarza.github.io/university-of-mars/](https://santiagogarza.github.io/university-of-mars/)

In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. Pull requests run `.github/workflows/ci.yml` (`npm run lint`, `npm test`, and `npm run build`). That job does not run `npm run check-seeds`. A missing URL is handled by `src/pages/404.astro`.

## Demo seeds

These five issues are intentional. Leave them on `main` until a workshop session. A session opens pull requests that fix them, and those fixes should stay in the pull request. Restoring the planted text to chase a green check undoes the demo.

`npm run check-seeds` confirms the five issues are still present. It is not a pull-request check. Before a session, run the **Check seeds** workflow from the Actions tab (`.github/workflows/check-seeds.yml`, manual `workflow_dispatch`). The `demo-baseline` tag and the `seeds/` snapshot match the seeded files.

### S1 — Wrong aid-year document

`src/pages/financial-aid.astro`

The verification section tells students to download and submit the **2025-26 Verification Worksheet**. The rest of the page correctly describes aid year **2026–27**. The form for this year is the **2026-27 Verification Worksheet**.

Fix: in that file, change `2025-26 Verification Worksheet` to `2026-27 Verification Worksheet`. Leave the separate “Upcoming: aid year 2027–28” section as next year’s cycle.

### S2 — Hero image missing alt

`src/pages/index.astro`

The home hero `<img class="hero-media">` has no `alt` attribute.

Fix: add a descriptive `alt`, for example `Main quad and clock tower, with mesas on the horizon`.

### S3 — Low-contrast news metadata

`src/styles/global.css`

`.news-card .news-meta` is `#A8A29E` on a white card, about 2.5:1.

Fix: change that color to one that meets 4.5:1 on white, such as `#44403c`.

### S4 — Student ID field has no label

`src/pages/support/index.astro`

The Student ID input (`#student-id`) shows the words “Student ID” above the field, but that text is not a label. It has no `<label>`, `aria-label`, `aria-labelledby`, `title`, or placeholder.

Fix: add `<label for="student-id">Student ID</label>` (and keep the validation message).

### S5 — Add/drop date copied by hand

The Spring Semester 2027 add/drop deadline is the literal string `Friday, January 15, 2027`, written separately in each of these files (not a shared constant):

- `src/pages/academics/calendar.astro`
- `src/pages/index.astro`
- `src/pages/financial-aid.astro`
- `src/pages/support/index.astro`
- `src/pages/support/articles/registration.astro`

Fix: change that date in every file so the pages agree. A search for `Friday, January 15, 2027` finds the copies.

## Reset after a dry run

`seeds/MANIFEST` lists the seeded files. `seeds/` holds a copy of each one. The `demo-baseline` tag points at the commit that introduced that snapshot.

From a clean working tree:

```bash
npm run reset-demo
```

The script checks out `main`, copies the seeded files back, and creates a normal commit. It does not rewrite history and it does not force-push. After the restore it runs `npm run check-seeds` and exits non-zero if a planted issue is missing.

```bash
npm run reset-demo -- --push
```

That publishes the commit with a fast-forward `git push origin main`. If `main` has moved and a fast-forward is not possible, pull first and run the script again. Nothing in the script passes `--force`.

When `SERVICES_URL` and `DEMO_BOT_KEY` are set, the same command also `POST`s `/api/admin/reset` on the services project and restores the 16 seeded tickets, the case log through `TIX-2026-0041`, and an empty work-order and release list.

Open [https://santiagogarza.github.io/university-of-mars/support/?reset=1](https://santiagogarza.github.io/university-of-mars/support/?reset=1) to clear the ticket keys in that browser: `um-support-requests` and `um-voice-draft`. The same query works on My requests. The parameter is removed after it runs, so a refresh does not clear a new ticket.

## Voice calls

Housing has a **Call Housing Support** button. The Help Center form has **Talk to Student Support**. Each opens an in-browser call. A server route mints a short-lived token; the API key stays on the server. The transcript shows both sides in body-sized type. The form fills one field at a time, highlights the field, and leaves unknown fields empty. The caller can switch to Spanish and back. Replies follow the caller’s language. Saved fields are English. If the caller speaks a language other than English at any point, the description gains one line, `Caller language: Spanish` (or that language), and that line is not repeated. The person presses Submit. Hang up is the only primary action while the call is live. If the microphone is blocked or the call drops, the typed form is still there.

`PUBLIC_SERVICES_URL` must be set at build time or the buttons explain that calls are not connected and the form still works offline, saved in this browser as before.

## Services

`services/` is a separate project. Deploy steps, environment variables, and the local listener are in [services/README.md](services/README.md). The HTTP contract, including the intake webhook body, the reset response, and the seeded ticket ids, is in [services/API.md](services/API.md).

Set these on the services project:

- `XAI_API_KEY` — voice token only
- `DEMO_BOT_KEY` — `x-demo-key` for bots and reset
- `BLOB_READ_WRITE_TOKEN` — durable storage; omit it for local memory
- `INTAKE_WEBHOOK_URL` and optional `INTAKE_WEBHOOK_HEADERS` — forward each new ticket
- `STAFF_PASSCODE` — case-log sign-in
- `RELEASE_APPROVERS` — comma-separated approver names or emails, for example `resolver-bot`
- `ALLOWED_ORIGINS` — optional comma-separated origins added to `https://santiagogarza.github.io` for the voice token and browser calls

On the site repository, set the Actions variables `PUBLIC_SERVICES_URL` (the services origin, no trailing slash) and `PUBLIC_STAFF_PASSCODE` (the same workshop passcode). `pages.yml` inlines both. The passcode is a gate for a public demo, not the bot key. The bot key is never in the site bundle.

`npm test` runs the services tests against the in-memory store.

Staff pages `/staff/title-ix/new/` and `/staff/title-ix/` are noindex and are not in the navigation. `/housing/work-orders/` is the facilities schedule.

## Backup recording

These scripts are for a rehearsal when `XAI_API_KEY` is available. They are not part of CI.

```bash
XAI_API_KEY=... npm run make-demo-audio
```

That writes `scripts/demo-caller.wav`: English, a short Spanish turn, then English again. `DEMO_LEAD_SECONDS` (default 9) is silence before the caller speaks, so the greeting can finish. `DEMO_GAP_SECONDS` (default 12) is the pause after each turn. The file is gitignored.

```bash
DEMO_URL=http://127.0.0.1:4321/university-of-mars/housing/ npm run record-demo
```

`DEMO_URL` must be set for a local run. The default is the published housing page. The script opens Chrome at 1440×900 with a fake microphone pointed at the wav and does not loop that file. Set `CHROME_PATH` to a Chrome binary, or leave it unset to use the `chrome` channel (`CHROME_CHANNEL` overrides the channel). It clicks **Call Housing Support**, scrolls the request card so the call panel and the form stay in frame, waits, hangs up, and writes a video under `scripts/demo-recordings/`. Also override `DEMO_AUDIO`, `DEMO_HOLD_MS`, and `DEMO_HEADLESS=0` when you need to.

Playwright’s video has no audio track. The script looks for `ffmpeg` on `PATH`, `FFMPEG_PATH`, or the copy from `npx playwright-core install ffmpeg`, then muxes the caller WAV onto a second file ending in `-audio.webm`. It measures the time from page load to call connect and delays the WAV by that amount, then pads the audio with silence to the full video length. The mux does not use `-shortest`, so the read-back and hang-up stay in the file. Agent speech is played inside the page and is not captured. If you already have that WAV, set `DEMO_AGENT_AUDIO` and the mux delays it by the same amount and mixes it with the caller. Chrome has to be installed. The voice key has to be configured on the services project, and the site build has to point at it, or the call will not go live.
