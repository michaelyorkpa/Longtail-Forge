# Screenshot and Demo Data Plan

This plan coordinates marketing screenshots and demo recordings with the **seeded development database** roadmap work (ROADMAP 0.33.17.4, "Seeded development database and sanitized demo workspace"). It defines the data scenarios, the screenshot inventory, safe fake content, naming, metadata, and the refresh process.

**Hard rules (from the roadmap seed contract and marketing factuality rules):**
- Use **deterministic fake data only**. Never real client, family, financial, or customer data.
- Never capture from a live/production database.
- Do not use meaningless lorem ipsum where realistic fake content would demonstrate the app better. Write plausible fake content instead.
- Automated test fixtures, the developer seed database, and the sanitized demo/preview workspace stay **three distinct contracts** — screenshots use the demo/preview workspace.

## Coordination with the seeded dev database (0.33.17.4)

The shipped `sanitized-demo` profile seeds Business/Personal/Family workspaces with roles, clients/projects, a full spread of task states (due, overdue, upcoming, blocked, recurring, completed, undated), checklists, next actions, resume context, work-resume state, active/paused/completed timers, manual time, Notes (collections/links/tags/revisions/safe Markdown), reusable/active/finalized/partial Lists, tiny harmless Files fixtures, notifications/reminders, Search, Dashboard, and Workbench Focus Selection / Task Focus inputs.

Set a unique local `SUPER_ADMIN_PASSWORD`, run `npm run demo:data:seed`, and point the development server at `data/sanitized-demo` as documented in [Development and Demo Data](../development-and-demo-data.md). Use `npm run demo:data:reset` before rebuilding the capture data. The generated database, Files objects, operator credential, and any capture-time session remain local runtime material and must not be committed or reused for invited users.

## Data scenarios

Use one coherent fictional world across all captures so screenshots feel like one product.

### Scenario 1 — Northwind Studio (Business workspace) — primary
A small fake web/IT agency. Drives the Workbench-first hero shots.
- Users: **Alex Rivera** (Owner), **Priya Shah** (Member).
- Clients: **Cedar & Bloom** (florist), **Maple Lane Cafe**, **Ridgeline IT** (MSP client).
- Projects: "Website Refresh" (Cedar & Bloom), "POS Setup" (Maple Lane Cafe), "Monthly Maintenance" (Ridgeline IT).
- Task spread: at least one In-Progress hero task with resume note + next action + checklist + linked note + attached file + paused timer; plus due-today, overdue, upcoming, blocked, recurring, completed, and undated tasks.
- Time: a believable week of billable/non-billable entries; one paused and one completed timer.
- Notes: findings notes linked to tasks; a decisions note; realistic Markdown.
- Lists: a reusable "New client onboarding" checklist; an active "Site launch checklist" partway done.
- Files: 2–3 tiny fake PNGs/PDFs (e.g., `checkout-overlap.png`).

### Scenario 2 — Personal workspace — secondary
Shows Longtail Forge outside billing: workspace projects (no clients), tasks, notes, lists. Used to show breadth without implying every workspace needs time tracking.

### Scenario 3 — Family workspace — optional
Only if a family-oriented shot is needed; shared tasks/notes/lists. Keep it wholesome and generic.

### Planned-module scenarios (do not capture until shipped)
Reserve scenario notes for Tickets (0.34), Knowledge Base (0.35), Creator Studio (0.39). The roadmap allows those seed builders to add scenarios later. **Do not** produce screenshots of these surfaces until the modules ship — a mockup passed off as current would violate the factuality rules.

## Safe fake names and content

- **People:** Alex Rivera, Priya Shah, Sam Okafor, Dana Lindqvist, Jordan Bell. Avoid real public figures.
- **Businesses/clients:** Cedar & Bloom, Maple Lane Cafe, Ridgeline IT, Northwind Studio, Harbor & Vale. Avoid real company names/logos.
- **Emails/domains:** use `@example.com` (reserved for documentation) only, e.g., `alex@example.com`.
- **Content:** write realistic, specific fake work ("header overlaps the cart button under 380px"), never lorem ipsum, and never anything sensitive, offensive, or resembling a real person's data.
- **No real data of any kind:** no real phone numbers, addresses, financials, or customer records.

## Screenshot inventory

Prioritized; the hero set is Workbench-first (current, recordable now). Planned-module shots are explicitly deferred.

### Hero set (Current — capture first)
1. `workbench-focus-selection` — Workbench with focus recommendations incl. a resume row.
2. `workbench-task-focus` — Task Focus: summary chips, resume note, next action.
3. `workbench-connected-context` — Task Focus related context/Inspector (linked note + file + related tasks).
4. `dashboard-overview` — Dashboard pulse + today/upcoming.
5. `task-detail` — a rich task with checklist, next action, linked note, attachment.

### Supporting set (Current)
6. `time-tracking-timer` — a running/paused task timer.
7. `notes-detail` — a note with Markdown, links, tags (non-secure).
8. `lists-detail` — an active list with progress + linked records.
9. `search-results` — cross-work search results.
10. `reporting-summary` — billable/non-billable summary.
11. `notifications-panel` — in-app notifications/reminders.

### Mobile set (Current)
12. `mobile-workbench` — Workbench on a phone viewport.
13. `mobile-task-detail` — task detail on a phone viewport.
14. `mobile-dashboard` — Dashboard on a phone viewport.

### Deferred (Planned modules — do NOT capture yet)
- `tickets-*` (0.34), `knowledge-base-*` (0.35), `creator-studio-*` (0.39). Add to inventory only when the module ships.

## Desktop and mobile captures

- **Desktop:** capture at a standard wide viewport (align with the e2e desktop viewport used in `npm run test:e2e`); export at 2× where practical for crisp docs/site use.
- **Mobile:** capture at the e2e mobile viewport so shots match the real responsive layout, not a hand-resized window.
- Prefer the same theme across a set for consistency; if showing dark mode, keep it to a labeled subset.

## Image naming convention

```
ltf__<surface>__<scenario>__<viewport>__v<appVersion>__<YYYY-MM-DD>.png
```
Examples:
- `ltf__workbench-task-focus__northwind__desktop__v0.33.13.5__2026-07-14.png`
- `ltf__mobile-dashboard__northwind__mobile__v0.33.13.5__2026-07-14.png`

Keep the surface slugs identical to the inventory IDs above.

## Version / date metadata

- Every image filename carries the app version and capture date (above).
- Maintain a small manifest (e.g., `docs/marketing/assets/screenshots.md` or a CSV) listing: file, surface, scenario, viewport, app version, capture date, and the claim set it supports. This makes stale shots easy to find after a UI change.
- Do not commit large binaries without confirming the repo's asset policy; if screenshots are stored elsewhere, record the location in the manifest.

## Refresh process after UI changes

1. When a captured surface changes materially (a view conversion, a modal/layout change, a version bump that alters the shot), flag the affected inventory IDs.
2. Run `npm run demo:data:reset`, then `npm run demo:data:seed` to restore the deterministic safe scenario.
3. Re-capture the flagged IDs at both desktop and mobile viewports.
4. Update filenames with the new version/date and update the manifest.
5. Update any marketing/site references to point at the new files.
6. Verify no Planned-module surface slipped into a "current" set, and no real data appears.

## Guardrails recap

- Fake, deterministic, realistic — never lorem ipsum, never real data.
- Workbench-first hero set; Planned-module shots deferred until shipped.
- Every asset stamped with version + date; stale shots refreshed on UI change.
- Screenshots never imply internet/production readiness the product hasn't reached.
