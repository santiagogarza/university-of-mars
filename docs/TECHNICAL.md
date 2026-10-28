# Technical notes

Plain-language overview: [SPEC.md](../SPEC.md). This page is the build, content, and check detail that used to live there.

## Stack and deploy

- Astro 5, static output, with `base: /university-of-mars`, `trailingSlash: 'always'`, and `build.format: 'directory'`.
- GitHub Pages deploys from `.github/workflows/pages.yml` on every push to `main`. The published URL is in the README.
- `.github/workflows/ci.yml` runs lint, the services tests, and `astro build` on every pull request. It does not check seeds. A pull request that fixes S1–S5 stays as the fix; putting the planted text back is not required for a green check.
- Before a session, run the **Check seeds** workflow (`.github/workflows/check-seeds.yml`, `workflow_dispatch`), which runs `npm run check-seeds`.
- Dependencies: astro, the Newsreader and Source Sans 3 font packages, sharp, and `@astrojs/check`.
- The queue, voice token, work orders, case log, and aid-hold releases live in `services/` and deploy as a separate project. See `services/README.md` and `services/API.md`. No keys are stored in this repository or in the site bundle.

## Identity

- Motto "Lux ultra horizontem", founded 2004, 1 Olympus Way, Jezero. Phones are (628) 555-01xx.
- Colors: oxblood `#6b2430`, navy `#1b3048`, paper `#fffcf8`, sand, and brass.
- Type: Newsreader for headings, Source Sans 3 for body text. Content width 1120px.
- Shared data lives in `src/data/` (`site.ts`, `nav.ts`, `search-index.ts`, `directory.ts`, `quick-actions.ts`).

## Pages

- **About the university:** Home, About, Academics and Calendar, Admissions, Financial Aid, Housing, Research, Faculty, Students, Parents, Alumni, Give, and News (3 stories).
- **Policies:** Accessibility, Privacy, Title IX, Emergency.
- **Utility:** Search, Campus directory, MyUM login (mock), and 404.

## Search

- `src/pages/search-index.json.ts` renders every public page with Astro's container API at build time and writes `/search-index.json`: titles, breadcrumbs, summaries, and body text split at each heading. Noindex pages, `/staff/`, `/search/`, and 404 are left out. People and departments come from `src/data/directory.ts`, quick actions from `src/data/quick-actions.ts`, and extra keywords from `src/data/search-index.ts`.
- `src/lib/search-engine.ts` does the matching (prefix, typo-tolerant, weighted by field) and has no imports, so `scripts/search-engine.test.ts` runs it under `node --test`.
- The command palette (`src/components/CommandPalette.astro`, `src/scripts/command-palette.ts`) is on every page. Ctrl K or ⌘K, `/`, or the header Search button opens it. It is a modal `<dialog>` with an ARIA combobox and grouped listbox: arrows move, Tab and Shift Tab jump between groups, Enter opens, Escape closes. Recent searches are kept in this browser under `um-recent-searches`.
- `/search/` uses the same index, with type and site-area filters kept in the URL (`?q=&type=&area=&sort=`).
- The index is a static file on the same site. Search makes no other requests.
- **Facilities:** `/housing/work-orders/` lists booked repairs. It is not in the public navigation.
- **Staff case log:** `/staff/title-ix/new/` and `/staff/title-ix/`. Noindex, not linked from the public navigation, behind a passcode gate. The passcode is a build variable, not real authentication. Writes use a short-lived token from the services project. The bot key never ships in the site.

## Help Center and voice

- Six articles: password, registration, billing, financial-aid hold, housing repair, and accommodations.
- The request form fields are category, subcategory, student ID, email, subject, description, priority, and attachment. Submitting creates a `UMS#######` ticket.
- `/support/requests/` lists the browser's requests. With `PUBLIC_SERVICES_URL` set, it polls live status. Without that variable, it keeps today's local list.
- **Call Housing Support** on `/housing/` and **Talk to Student Support** on `/support/`. The transcript stays on screen. The form fills field by field. The person presses Submit.
- The typed form and the voice-filled form POST to the ticket API. Each new ticket is forwarded to the Intake bot when that webhook is configured.
- Voice instructions are the `instructions` string in `sessionConfig` in `src/scripts/voice-call.ts`. The browser sends them in `session.update` when the call connects. Spoken replies follow the caller's current language, including a switch to Spanish and back. Saved fields are English. If the caller uses any language other than English, the model calls `set_field` on `description` so the value ends with exactly one line, `Caller language: Spanish` (English name of the language). Later description updates keep that line and do not add a second one. The services project only mints a short-lived call token. It does not store these instructions. A change to the instructions ships with the static site.

## Queue

- Seeded with 16 reference tickets. The oldest financial-aid-hold duplicate, UMS0412207, is the parent a triage run should use. Reset leaves the links empty.
- Bots list, update, comment, and link duplicates with `x-demo-key`.
- Housing work orders return `HWO-2027-####`.
- Aid-hold releases return `REL-####` and stay pending until an allow-listed person approves.

## Content rules

- Use semantic HTML with one `<h1>` per page.
- Every image needs alt text, and every new input needs a visible label. The seeded Student ID field on the Help Center form stays unlabeled on purpose.
- Body text contrast must be at least 4.5:1, and the site must work with a keyboard only. The target is WCAG 2.1 AA, aside from the planted issues below.
- Dates and contact details come from shared data, never hand-copied, except the five seeded copies of the add/drop date.
- No real student data and no tracking.
- The call panel shows which fields are still empty, highlights each field as it is filled, and keeps one primary action for the call state: Call, then Hang up, then Submit.

## Demo seeds

Five deliberate defects are kept for the demo:

- S1: the wrong aid-year worksheet.
- S2: the hero image has no alt text.
- S3: low-contrast news meta text.
- S4: the Student ID field has no label.
- S5: the add/drop date is hand-copied into 5 pages.

`npm run check-seeds` verifies them. It is a manual Actions workflow, not a pull-request check. `npm run reset-demo [-- --push]` restores the 6 files in `seeds/MANIFEST` and runs `check-seeds` at the end. When `SERVICES_URL` and `DEMO_BOT_KEY` are set, it also restores the services seed. `/support/?reset=1` clears this browser's ticket keys.

Don't fix the seeds outside a demo run. A demo pull request that fixes a seed should keep that fix.

## Checks

- Every pull request: lint, services tests, and build (`ci.yml`). Seed presence is not a CI requirement.
- Nightly: `.github/workflows/nightly-accessibility.yml` (`0 10 * * *`, about 3:00 AM Pacific during daylight time, and `workflow_dispatch`). It builds the site, serves the built output, runs an axe scan of the main pages, and writes the findings to the job summary. The Student ID field is reported because the visible “Student ID” text is not a programmatic label. Findings do not fail the job. The job fails only when the build fails.
- Weekly: `.github/workflows/weekly-dependencies.yml` (`0 16 * * 1`, Monday, and `workflow_dispatch`). It runs `npm outdated` and `npm audit` for the site and for `services/`, and writes both to the job summary. Outdated packages and advisories do not fail the job. Both workflows use `contents: read` and no secrets.
- A copy-only pull request, meaning visible text changes only, with CI and review green, may auto-merge. Anything else waits for a person to review. Until the services project and the site variables are in place, this phase waits for a person.
