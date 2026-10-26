# University of Mars: site spec (short)

A fictional public university website for demos. Every name, phone number, address and person on it is invented.

**Goal.** A believable campus site where staff and students find answers and file Help Center requests. It must meet **WCAG 2.1 AA**. The workshop adds a browser voice call, a help-center queue the Intake bot can triage, a facilities work-order book, and a Title IX case log.

**Stack and deploy**
- Astro 5, static output, with `base: /university-of-mars`, `trailingSlash: 'always'` and `build.format: 'directory'`.
- Deployed to GitHub Pages by `.github/workflows/pages.yml` on every push to `main`.
- `ci.yml` runs lint, the services tests, and `astro build` on every PR. It does not check seeds. A pull request that fixes S1–S5 stays as the fix; putting the planted text back is not required for a green check. Before a session, run the **Check seeds** workflow (`.github/workflows/check-seeds.yml`, `workflow_dispatch`), which runs `npm run check-seeds`.
- Dependencies: astro, `@fontsource` Newsreader and Source Sans 3, sharp, and `@astrojs/check`.
- Live at https://santiagogarza.github.io/university-of-mars/.
- The queue, voice token, work orders, case log, and aid-hold releases live in `services/` and deploy as a separate project. See `services/README.md` and `services/API.md`.

**Identity**
- Motto "Lux ultra horizontem", founded 2004, 1 Olympus Way, Jezero. Phones are (628) 555-01xx.
- Colors: oxblood `#6b2430`, navy `#1b3048`, paper `#fffcf8`, sand, and brass.
- Type: Newsreader for headings, Source Sans 3 for body text. Content width 1120px.
- Shared data lives in `src/data/` (`site.ts`, `nav.ts`, `search-index.ts`).

**Pages**
- **About the university:** Home, About, Academics and Calendar, Admissions, Financial Aid, Housing, Research, Faculty, Students, Parents, Alumni, Give, and News (3 stories).
- **Policies:** Accessibility, Privacy, Title IX, Emergency.
- **Utility:** Search, MyUM login (mock), and 404.
- **Facilities:** `/housing/work-orders/` lists booked repairs. It is not in the public navigation.
- **Staff case log:** `/staff/title-ix/new/` and `/staff/title-ix/`. Noindex, not linked from the public navigation, behind a passcode gate. The passcode is a build variable, not a claim of real authentication. Writes use a short-lived token from the services project. The bot key never ships in the site.

**Help Center (`/support/`)**
- Six articles: password, registration, billing, financial-aid hold, housing repair, and accommodations.
- A request form with these fields: category, subcategory, student ID, email, subject, description, priority and attachment. Submitting creates a `UMS#######` ticket.
- `/support/requests/` lists the browser's requests. With `PUBLIC_SERVICES_URL` set, it polls live status. Without that variable, it keeps today's local list.
- A "Talk to Student Support" call on `/support/`, and a "Call Housing Support" call on `/housing/`. The transcript stays on screen. The form fills field by field. The person presses Submit.
- The typed form and the voice-filled form POST to the ticket API. Each new ticket is forwarded to the Intake bot when that webhook is configured.

**Queue**
- Seeded with the 16 reference tickets. The oldest financial-aid-hold duplicate, UMS0412207, is the parent a triage run should use. Reset leaves the links empty.
- Bots list, update, comment, and link duplicates with `x-demo-key`.
- Housing work orders return `HWO-2027-####`.
- Aid-hold releases return `REL-####` and stay pending until an allow-listed person approves.

**Rules**
- Use semantic HTML with one `<h1>` per page.
- Every image needs alt text, and every new input needs a visible label. The seeded Student ID field on the Help Center form stays unlabeled on purpose.
- Body text contrast must be at least 4.5:1, and the site must work with a keyboard only.
- Dates and contact details come from shared data, never hand-copied, except the five seeded copies of the add/drop date.
- No real student data and no tracking.
- The call panel shows which fields are still empty, highlights each field as it is filled, and keeps one primary action for the call state: Call, then Hang up, then Submit.

**Demo seeds**
- Five deliberate defects are kept for the demo:
  - S1: the wrong aid-year worksheet.
  - S2: the hero image has no alt text.
  - S3: low-contrast news meta text.
  - S4: the Student ID field has no label.
  - S5: the add/drop date is hand-copied into 5 pages.
- `npm run check-seeds` verifies them. It is a manual Actions workflow, not a pull-request check. `npm run reset-demo [-- --push]` restores the 6 files in `seeds/MANIFEST` and runs `check-seeds` at the end. When `SERVICES_URL` and `DEMO_BOT_KEY` are set, it also restores the services seed. `/support/?reset=1` clears this browser's ticket keys.
- Don't fix the seeds outside a demo run. A demo pull request that fixes a seed should keep that fix.

**Checks**
- Every PR: lint, services tests, and build (`ci.yml`), plus automated review. Seed presence is not a CI requirement.
- Nightly: an accessibility scan of the live site.
- Weekly: a dependency update check. Both run as automations.
- A copy-only PR, meaning visible text changes only, with CI and review green, may auto-merge. Anything else waits for a person to review. This phase waits for review before the services project and the site variables are in place.
