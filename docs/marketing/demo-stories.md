# Demo Stories

Detailed demo scripts for Longtail Forge. Each is marked **Recordable now** (uses only current, shipped functionality) or **Depends on roadmap** (needs a Planned module and cannot be recorded until it ships).

All names, clients, and content in these scripts are **safe fake data** (see [screenshot-and-demo-data-plan.md](screenshot-and-demo-data-plan.md)). No real customer data.

Overview:

| Demo | Theme | Status |
| --- | --- | --- |
| A. Recover interrupted client work | Context recovery / Workbench | **Recordable now** |
| B. Ticket → task → time → resolution → KB | Support workflow | **Depends on roadmap** (Tickets 0.34, KB 0.35) |
| C. Creator video workflow | Content pipeline | **Depends on roadmap** (Creator Studio 0.39) |
| D. Author / book workflow | Manuscript pipeline | **Depends on roadmap** (Creator Studio 0.39) |

Lead the public demo with **A** — it is Workbench-first and recordable today.

---

## Demo A — Recover interrupted client work (Recordable now)

**One-line:** A consultant returns to a client task they dropped this morning and resumes it in seconds using Workbench — without re-reading everything.

**Safe claims for this demo:**
- "Pick up the work without rebuilding the context."
- "Workbench helps you resume interrupted work and pick a useful next action."
- "Your task keeps its next action, resume note, files, notes, and time together."
- "A private read-only Tasks calendar can be followed from compatible calendar clients." (Only if the administrator setup is shown without exposing a real subscription URL.)
- Avoid: any security/"production-ready" claim, any Planned-module reference, any unsupported performance/benchmark claim.

### Starting data (seed before recording)

- Business workspace: **Northwind Studio** (fake agency).
- User: **Alex Rivera** (Owner/admin), timezone set, theme set.
- Client: **Cedar & Bloom** (fake florist). Project: **Website Refresh**.
- Task 1 (the hero): **"Fix mobile checkout layout"** — status In Progress, due today, project Website Refresh.
  - Next action: "Re-test the cart on iPhone SE width after padding change."
  - Resume note: "Was mid-way through the responsive padding fix; the header overlaps the cart button under 380px."
  - Checklist: 4 items, 2 checked.
  - One linked Note: "Cedar & Bloom — checkout bug findings" (with 3-4 realistic bullet points).
  - One attached File: a small fake screenshot named `checkout-overlap.png`.
  - A **paused** task timer with ~25 minutes already logged this morning.
- Task 2: **"Send updated quote to Maple Lane Cafe"** — due tomorrow, so Workbench has a believable second option.
- A couple of completed tasks and a small amount of prior time this week, so Dashboard and Reporting look alive.

### Exact screen sequence

1. **Dashboard (5s)** — open on Dashboard. Show the workspace pulse and today/upcoming. Narrator: "Dashboard tells me what's happening."
2. **Navigate to Workbench (3s)** — click Workbench. Narrator: "Workbench helps me begin."
3. **Focus Selection (8s)** — show the focus recommendations, including the paused-timer resume row for "Fix mobile checkout layout." Narrator: "It's pointing me back to the thing I dropped this morning."
4. **Open Task Focus (10s)** — select the hero task. Show the summary chip row (status, priority, due, tags), the resume note, and the next action prominently.
5. **Show connected context (12s)** — use the current Task Focus context surfaces to show the linked note and attached screenshot. Narrator: "Everything I need is already here — the note with my findings, the screenshot, the next step."
6. **Resume the timer (6s)** — resume the paused task timer. Narrator: "And I can pick the timer right back up where I left it."
7. **Do one small real action (8s)** — check off one checklist item, or open the linked note read view. Narrator: "One next action, not twenty lists."
8. **Return to Dashboard (5s)** — show the updated pulse/time. Narrator: "Put it down, pick it back up — without rebuilding the context."

### Desired visible end state

Hero task In Progress with the timer running, one more checklist item checked, the linked note and file clearly visible as connected context, and a Dashboard that reflects a little more logged time.

### Narrator points (tight)

- "The expensive part of interrupted work isn't the task — it's remembering where you were."
- "Dashboard tells me what's happening. Workbench helps me begin."
- "The next action and my resume note were waiting for me."
- "Notes, files, and time stay attached to the work."

### ~60–90 second edit

- 0:00–0:10 Problem framing over Dashboard.
- 0:10–0:20 Move to Workbench, Focus Selection finds the dropped task.
- 0:20–0:45 Task Focus: resume note, next action, connected context.
- 0:45–1:05 Resume timer, complete one next action.
- 1:05–1:20 Back to Dashboard; restate the headline.

### Screenshot moments

- Workbench Focus Selection with the resume recommendation.
- Task Focus summary + resume note + next action.
- Task Focus connected context (note + file + related tasks).
- Timer running on the task.

---

## Demo B — Ticket → task → time → resolution → Knowledge Base (Depends on roadmap)

**Status:** Depends on **Support Tickets (0.34)** and **Knowledge Base (0.35)**. **Cannot be recorded until those modules ship.** Script it now so it's ready.

**One-line (planned):** A client request comes in as a ticket, becomes tracked work with time, gets resolved with internal and client-visible context intact, and its resolution is preserved as a KB article.

**Planned flow:**
1. A ticket arrives (fake client "Cedar & Bloom": "Contact form stopped sending emails").
2. Triage: set priority, add an internal note (diagnosis) separate from a client-visible reply.
3. Turn the ticket into a task (or link one); track time against the work.
4. Resolve: post a client-visible reply; mark resolved.
5. Preserve: create a Knowledge Base draft from the resolution; publish a durable article.

**Claim discipline:** Until shipped, present this only as "here's the workflow Support Tickets and Knowledge Base will enable," never as current behavior. No SLA/response-time claims.

---

## Demo C — Creator video workflow (Depends on roadmap)

**Status:** Depends on **Creator Studio (0.39)**. Not recordable until it ships.

**One-line (planned):** A YouTube creator moves an idea from research to script to production tasks to a scheduled publish, then repurposes it into Shorts.

**Planned flow:**
1. Capture an idea record ("10-minute home-network cleanup").
2. Attach research notes and reference files.
3. Draft the script; create production/revision tasks (film, edit, thumbnail).
4. Place it on the publishing calendar.
5. After publishing, spin up derivative/repurpose items (Shorts/Reels).

**Note:** Use creator/video language here (script, thumbnail, publish, Shorts). Do not mix in manuscript terms. Until Creator Studio ships, a lighter "today you can do this with Notes + Tasks + Files + Lists" version could be recorded, but label it clearly as the interim approach, not Creator Studio.

---

## Demo D — Author / book workflow (Depends on roadmap)

**Status:** Depends on **Creator Studio (0.39)**. Not recordable until it ships.

**One-line (planned):** An author moves a book from outline to chapters to revision to publication history.

**Planned flow:**
1. Create the book/project with an outline.
2. Break the outline into chapter records/drafts.
3. Track research and decisions in linked notes.
4. Manage revision tasks per chapter.
5. Record publication history and repurpose material (e.g., newsletter excerpts).

**Note:** Use author language (outline, chapter, draft, manuscript, revision). Do not force social-video terminology on authors.

---

## Recording checklist (applies to any demo)

- Use only the seeded safe fake data; verify no real names/emails/domains appear.
- Confirm the app version shown matches the claim set for that version.
- For Demo A, do not show any settings screen or banner implying internet/production readiness.
- Keep on-screen tooltips/labels legible at the target export resolution (see [screenshot plan](screenshot-and-demo-data-plan.md)).
- If a Planned-module surface accidentally appears in a "now" demo, re-shoot.
