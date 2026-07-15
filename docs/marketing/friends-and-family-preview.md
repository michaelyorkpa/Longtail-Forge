# Friends-and-Family Private Preview Plan

This plan prepares a small, private, invitation-only preview of Longtail Forge. It corresponds to ROADMAP **0.33.17 — Friends-and-Family Internet Preview**, which is gated on completed security hardening (0.33.16) and tested backup/restore + deployment readiness (0.33.17).

**Do not promise availability, security, uptime, backups, or a date beyond what is actually implemented.** The roadmap names a **target** of July 31, 2026 for this preview *if and only if* the prerequisite security and readiness work is complete. Treat that as a target, not a commitment, and never as permission to skip controls.

## Preview purpose

- Watch real people use Longtail Forge for real (but low-stakes) work.
- Learn where context recovery and the Workbench-first flow actually help or confuse.
- Find bugs, rough edges, and onboarding friction before any wider technical preview.
- Validate the private-preview deployment posture (single server behind a TLS reverse proxy) with a handful of trusted users.

This is **not** a launch, a security certification, or a promise of data durability. Participants should treat it as experimental.

## Participant profile

Small (single digits to low double digits — do not fabricate a number). Choose people who:

- fit the wedge audience: freelancers, consultants, small-agency or small-service operators;
- are personally trusted (friends, family, close professional contacts);
- can tolerate an experimental app and occasional bugs;
- will actually put light real work through it and give candid feedback;
- understand this is private and not to be shared publicly.

Avoid participants who would put sensitive client, financial, legal, or personal data into an experimental app.

## Invitation-copy draft

> **Subject: Want to try something I've been building?**
>
> Hi [name],
>
> I've been building **Longtail Forge** — a self-hosted work hub for people who juggle several clients and get interrupted constantly. The idea is simple: pick your work back up without rebuilding the context every time.
>
> I'd love your honest take in a small private preview. A few things to know up front:
>
> - It's an **early private preview**, not a finished product. Expect rough edges and occasional bugs.
> - Please use it for **light, low-stakes work only** — nothing sensitive, and keep your own copy of anything important. I can't promise your data won't be lost during the preview.
> - It's invitation-only and private; please don't share the link or screenshots publicly.
>
> If you're up for it, I'll send a short setup guide and a 5-minute starting path. Totally fine to say no.
>
> Thanks,
> [Your name]

Keep the invitation honest: no security guarantees, no uptime promises, no "production-ready" language.

## Onboarding sequence

1. **Confirm and set expectations** — send the known-limitations + privacy/data warning (below) before access.
2. **Create the account/workspace** — provide credentials or a first-login path per the deployment docs; require a real password change on first login.
3. **Orientation (2 min)** — one short message or screen recording: "Dashboard tells you what's happening; Workbench helps you begin."
4. **Five-minute first-use path** — the guided path below.
5. **Check in after first session** — light touch; ask the two or three feedback questions.
6. **Follow-up interview** — schedule a short interview after a week of use (guide below).

## Five-minute first-use path

Designed to reach the core "aha" (resuming connected work) fast.

1. Create a **client** and a **project** (or a workspace project in Personal). *(~1 min)*
2. Create a **task** with a due date, a **next action**, and a one-line **resume note**. Add a checklist item or two. *(~1 min)*
3. Add a short **note** and link it to the task; attach a small file if handy. *(~1 min)*
4. Start a **timer** on the task, then pause it — simulate getting interrupted. *(~30 sec)*
5. Go to **Workbench**, find the task in focus selection, open **Task Focus**, and resume — see the resume note, next action, and connected note/file waiting. *(~1 min)*
6. Glance at **Dashboard** to see the day reflected. *(~30 sec)*

The goal is that by step 5 the participant feels the "pick it back up without rebuilding context" moment.

## Known-limitations template

Share this verbatim before access:

> **Longtail Forge private preview — please read**
> - This is an early, experimental private preview. Things will break.
> - **Do not store sensitive or irreplaceable data.** Keep your own copy of anything important.
> - There is **no guarantee** of data durability, backups, uptime, or security during the preview.
> - Internet-exposure hardening and backup/restore are still being finalized; this preview is private and limited by design.
> - Some things you may expect are **planned, not built yet** — including Support Tickets, Knowledge Base, and Creator Studio.
> - Secure Notes are encrypted at rest but are **not** "zero-knowledge": the app server can decrypt them. Don't treat them as a vault for critical secrets.
> - Please keep the app, its link, and screenshots private.

## Privacy / data warning

- Explain what data the app stores (workspace records, tasks, notes, files, time entries, audit logs) and that it lives on the operator's server.
- State plainly that participants should not upload sensitive personal, client, financial, or legal data.
- Note that audit logs record actions for security/history.
- Do not claim compliance with any regulation or standard.

## Bug-report template

> - **What did you do?** (steps)
> - **What did you expect?**
> - **What happened instead?**
> - **Where?** (page/module, e.g., Workbench Task Focus)
> - **When?** (rough time, so logs can be matched)
> - **Screenshot** (optional; scrub anything private)
> - **How much did it block you?** (annoyance / worked around it / couldn't continue)

## Feedback questions (lightweight, after first sessions)

1. What were you trying to get done?
2. Was there a moment it clearly helped? A moment it got in your way?
3. Did resuming interrupted work feel easier or harder than your current setup?
4. What did you expect to find that wasn't there?
5. Would you keep using it for this kind of work? Why / why not?

## Interview guide (after ~1 week)

- **Context:** Walk me through how you actually used it this week.
- **Wedge validation:** Where does your work get interrupted most? Did Longtail Forge help you get back into it?
- **Dashboard vs Workbench:** Which did you open more, and for what? Did the distinction make sense?
- **Friction:** What was confusing or slow in the first 10 minutes? Later?
- **Gaps:** What was missing that stopped you from using it more?
- **Trust:** Anything about data, security, or reliability that worried you?
- **Fit:** Who else you know has this exact problem? (Signal for the wedge, not a request for referrals yet.)
- Keep it open-ended; avoid leading questions; capture verbatim phrases for later messaging (never as testimonials without explicit permission).

## Usage signals to track

Track only what the app already records or the operator can observe; do not build new tracking for this. Useful signals:

- Did the participant complete the five-minute path?
- Did they return for a second session?
- Did they create connected work (task + linked note/file + time), or just isolated records?
- Did they use Workbench Task Focus / resume, or stay on Dashboard/lists?
- Where did they drop off?
- Bug reports per participant and severity.

Do not publish these as metrics or convert them into public claims.

## How to close or pause the preview

- **Pause:** communicate a clear pause message, stop inviting new participants, and keep data intact until participants confirm they've exported anything they want.
- **Close:** give advance notice, provide a data-export path (per the 0.33.17 backup/restore/export readiness), then decommission per the deployment docs. Confirm participants have retrieved anything they care about before deleting data.
- Thank participants and summarize what their feedback changed.
- Never quietly abandon a preview with participant data on a live server.

## Cross-references

- [ROADMAP 0.33.16 / 0.33.17](../../ROADMAP.md) — the security and preview-readiness prerequisites.
- [launch-plan.md](launch-plan.md) — where this preview sits in the overall staging.
- [demo-stories.md](demo-stories.md) — Demo A mirrors the five-minute path.
- [faq-draft.md](faq-draft.md) — reuse the honest answers on security and data.
