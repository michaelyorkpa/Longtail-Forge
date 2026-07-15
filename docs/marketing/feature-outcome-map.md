# Feature-to-Outcome Map

This map ties each capability to the user problem it solves and the outcome it produces — deliberately **not** a feature list. Every row states current-versus-planned status, a proof/documentation source, the marketing claim that is allowed, and the limits on that claim.

Status: **Current** = shipped through 0.33.13.5. **Planned** = committed roadmap module not yet shipped. **Private preview** = active preview-readiness work.

## Summary outcome map

| User problem | Feature / workflow | Outcome | Status |
| --- | --- | --- | --- |
| I can't tell what needs attention | Dashboard | Understand what is happening | Current |
| I can't decide what to start / resume | Workbench | Choose and resume useful work | Current |
| Commitments and next steps get lost | Tasks | Preserve commitments, next actions, blockers, checklists, progress | Current |
| Working memory and decisions evaporate | Notes | Preserve working memory, decisions, research | Current |
| Repeatable steps get redone from scratch | Lists | Execute repeatable operational workflows | Current |
| Supporting files drift away from the work | Files | Keep artifacts attached to the record | Current |
| Time tracking is disconnected from work | Time Tracking | Preserve time history where work happens | Current |
| I can't find things across my work | Search | Recover information across connected work | Current |
| I miss relevant changes | Notifications | Surface relevant changes without constant checking | Current |
| I can't see time/operational results | Reporting | Understand time and operational results | Current |
| Requests get lost between inbox and work | Tickets | Move requests through resolution with internal/client context | Planned (0.34) |
| Knowledge isn't preserved after the work | Knowledge Base | Turn reviewed knowledge into durable reference material | Planned (0.35) |
| Content ideas don't reach publication | Creator Studio | Move ideas through drafting, production, publishing, repurposing | Planned (0.39) |

## Detailed rows

Each row: **problem → feature → outcome**, then status, proof source, allowed claim, and claim limits.

### Dashboard — Current
- **Problem:** Sitting down without a clear picture of what needs attention.
- **Outcome:** Orientation — workspace pulse, today/upcoming and calendar context, useful summaries, and a clear entry into active work.
- **Proof:** [README](../../README.md) Current State; [product-notes](../product-notes.md); framework-owned Dashboard host in [architecture.md](../architecture.md).
- **Allowed claim:** "Dashboard tells you what is happening across your workspace and where to jump in."
- **Limits:** Do not call it an analytics cockpit or imply advanced BI/benchmarks. Orientation, not deep analytics.

### Workbench — Current
- **Problem:** Deciding what to do next and resuming interrupted work.
- **Outcome:** Momentum — focus selection, Task Focus with connected context, timers, next actions, resume notes, handoff to future self.
- **Proof:** [README](../../README.md) (framework-owned Workbench); Workbench/Task Focus notes in [architecture.md](../architecture.md); [product-notes](../product-notes.md).
- **Allowed claim:** "Workbench helps you pick a focus and pick work back up where you left off."
- **Limits:** Do not describe it as "just a task list." Do not imply AI recommendations; focus selection is rule/context-based, not machine-learning.

### Tasks — Current
- **Problem:** Commitments, next actions, and blockers get forgotten.
- **Outcome:** Preserve commitments with next actions, blocked reasons, resume notes, checklists, recurrence, reminders, task timers, and progress.
- **Proof:** [README](../../README.md); [docs/tasks-module.md](../tasks-module.md); Tasks section of [architecture.md](../architecture.md).
- **Allowed claim:** "Tasks keep the next action, status, due date, project context, reminders, files, notes, and time history together."
- **Limits:** No SLA/enterprise workflow-engine claims. Automation/rules are later roadmap (0.40.x).

### Notes — Current
- **Problem:** Decisions, research, and working memory are lost between sessions.
- **Outcome:** Preserve working memory, decisions, and research with Library buckets, collections, Markdown, links, revisions, tags, files, and search. Secure notes are encrypted at rest.
- **Proof:** [docs/notes-module.md](../notes-module.md); Secure Notes model in [architecture.md](../architecture.md).
- **Allowed claim:** "Notes collect the details, decisions, and research around your work, with optional encrypted-at-rest secure notes."
- **Limits:** **Do not** say Secure Notes is zero-knowledge — a configured app server can decrypt secure bodies; titles remain plaintext metadata. No absolute security claims.

### Lists — Current
- **Problem:** Repeatable operational steps get re-created and forgotten.
- **Outcome:** Execute repeatable workflows — reusable lists, catalog suggestions, linked records, progress/resume context, tags, files, search.
- **Proof:** [docs/lists-module.md](../lists-module.md); Lists overhaul in [CHANGELOG](../../CHANGELOG.md) (0.33.13).
- **Allowed claim:** "Lists help you run known, repeatable steps without turning them into tasks, notes, or a spreadsheet."
- **Limits:** Lists are not inventory, purchasing, or ERP. Do not imply procurement/stock management.

### Files — Current
- **Problem:** Supporting artifacts live in a separate place you have to search first.
- **Outcome:** Keep files attached to the record where the work happens; framework-owned storage with scan/quarantine state and quotas.
- **Proof:** Files/attachments sections of [architecture.md](../architecture.md); [README](../../README.md).
- **Allowed claim:** "Attach supporting files directly to the tasks, notes, and records they belong to."
- **Limits:** Optional malware scanning depends on operator configuration (e.g., ClamAV adapters); do not claim scanning is always-on or guaranteed. No file-viewer/preview promises beyond what ships.

### Time Tracking — Current
- **Problem:** Time is logged somewhere disconnected from the work.
- **Outcome:** Preserve time history where the work occurs — manual entry, edit workflows, active timer persistence, task timers, UTC-backed storage, billable/non-billable.
- **Proof:** [README](../../README.md); [docs/time-tracking-module.md](../time-tracking-module.md).
- **Allowed claim:** "Track time on the task or record you're working on, ready for billing and reporting."
- **Limits:** No invoicing claim (invoicing is future). No guaranteed accuracy/compliance claim.

### Search — Current
- **Problem:** Information is hard to recover across connected work.
- **Outcome:** Recover information across indexed Tasks, Time Entries, Clients, Projects, Notes, Lists, and Help.
- **Proof:** Search framework in [architecture.md](../architecture.md); [README](../../README.md).
- **Allowed claim:** "Search across your connected work to recover what you need."
- **Limits:** Search is for discovery, not accounting/reporting truth. Public-API search and file-content indexing are future. No relevance/scale benchmarks.

### Notifications — Current
- **Problem:** You have to keep checking to notice relevant changes.
- **Outcome:** Surface relevant changes (reminders, follows) without constant checking; in-app, permission-aware, workspace-scoped.
- **Proof:** Notifications framework in [architecture.md](../architecture.md).
- **Allowed claim:** "In-app notifications surface relevant changes and reminders."
- **Limits:** In-app only today; email/push/Slack/etc. are future delivery adapters. Do not imply external delivery channels exist.

### Reporting — Current
- **Problem:** You can't see time and operational results clearly.
- **Outcome:** Understand time and operational results — billable/non-billable reporting, dashboard summaries.
- **Proof:** [README](../../README.md); Reporting framework work (roadmap 0.33.12).
- **Allowed claim:** "Report on billable and non-billable time and see workspace summaries."
- **Limits:** No advanced BI, forecasting, or benchmark claims.

### Tickets — Planned (0.34)
- **Problem:** Requests get lost between the inbox and the work they create.
- **Outcome (planned):** Move requests through resolution while preserving internal notes and client-visible replies, with time and task linkage.
- **Proof:** [ROADMAP](../../ROADMAP.md) Support Tickets (0.34); [architecture.md](../architecture.md) first-party modules.
- **Allowed claim:** "Support Tickets is a committed first-party module on the roadmap."
- **Limits:** **Not shipped.** Never describe ticket features in the present tense or imply availability. SLA, email intake, and portals are further-out roadmap.

### Knowledge Base — Planned (0.35)
- **Problem:** Reviewed knowledge isn't preserved as durable reference material.
- **Outcome (planned):** Turn reviewed working notes into curated, published reference material with immutable publication snapshots.
- **Proof:** [ROADMAP](../../ROADMAP.md) Knowledge Base (0.35).
- **Allowed claim:** "Knowledge Base is a committed first-party module on the roadmap; Notes can feed its future review workflow."
- **Limits:** **Not shipped.** Notes is available; Knowledge Base as a separate reviewed-publication layer is not.

### Creator Studio — Planned (0.39)
- **Problem:** Content ideas don't reliably reach publication and reuse.
- **Outcome (planned):** Move ideas through drafting, production, publishing, and repurposing for both creators and authors.
- **Proof:** [ROADMAP](../../ROADMAP.md) Creator Studio (0.39).
- **Allowed claim:** "Creator Studio is a committed first-party module on the roadmap."
- **Limits:** **Not shipped.** Today, content work is possible with Notes/Tasks/Files/Lists/Time; the dedicated pipeline is future.

## Using this map

- If a claim isn't backed by a row here (or a register entry), don't publish it.
- When a Planned row ships, move it to Current, update the proof source, and update the [claims register](claims-and-proof-register.md).
