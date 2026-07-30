# Claims and Proof Register

This register is the **guardrail** for Longtail Forge marketing. For each meaningful claim it records the exact wording, its status classification, the evidence source, when it was last verified, where it may and may not be used, and the risky variations to avoid. The purpose is to make it hard for copy to drift ahead of the actual product.

**Rule:** if a public claim isn't backed by an entry here (or a row in the [feature-outcome map](feature-outcome-map.md)), don't publish it.

## Legend

- **Classification:** `current` (shipped in the 0.33.25.2 repository baseline) · `preview` (bounded private-preview posture with invitation decision still gated) · `planned` (committed roadmap, not shipped) · `commercial-hypothesis` (later commercial/hosted, no commitment).
- **Verified at:** the app version / date the claim was last checked. Current baseline: **v0.33.25.2 · 2026-07-30**.
- **Owner/reviewer:** the maintainer (Michael York d/b/a Raymond Tec) until a dedicated reviewer is assigned.
- **Refresh trigger:** the event that requires re-checking the claim.

---

### C-001 — Context recovery (core promise)
- **Wording:** "Pick up the work without rebuilding the context."
- **Classification:** current (positioning claim about design intent, backed by shipped Workbench/Tasks behavior).
- **Evidence:** [README](../../README.md) philosophy + Current State; Workbench/Task Focus in [architecture.md](../architecture.md); [product-notes](../product-notes.md).
- **Verified at:** v0.33.25.2 · 2026-07-30.
- **Permitted locations:** hero, all decks, homepage, social.
- **Prohibited / risky:** don't escalate to "eliminates context switching" or "never lose context." It reduces reconstruction effort; it doesn't erase it.
- **Owner:** maintainer. **Refresh trigger:** any change to Workbench resume/focus behavior.

### C-002 — Workbench
- **Wording:** "Dashboard tells you what's happening; Workbench helps you begin." / "Workbench helps you resume interrupted work and choose a useful next action."
- **Classification:** current.
- **Evidence:** [README](../../README.md) (framework-owned Workbench); Workbench/Task Focus notes in [architecture.md](../architecture.md).
- **Verified at:** v0.33.25.2 · 2026-07-30.
- **Permitted locations:** homepage, Workbench section, demos, screenshots.
- **Prohibited / risky:** don't call it "AI-powered," a "recommendation engine," or imply ML. Focus selection is rule/context-based. Don't call it "just a task list."
- **Owner:** maintainer. **Refresh trigger:** Workbench UI/behavior change.

### C-003 — Current modules available today
- **Wording:** "Tasks, Time Tracking, Notes, Lists, Files, Search, Notifications, Reporting, the in-app Tasks calendar, and private read-only Tasks calendar subscriptions are available today, alongside Clients/Projects, Dashboard, and Workbench."
- **Classification:** current.
- **Evidence:** [README](../../README.md) Current State; module docs (`docs/tasks-module.md`, `docs/notes-module.md`, `docs/lists-module.md`, `docs/time-tracking-module.md`); [feature-outcome-map](feature-outcome-map.md).
- **Verified at:** v0.33.25.2 · 2026-07-30.
- **Permitted locations:** anywhere, present tense.
- **Prohibited / risky:** don't add Tickets/KB/Creator Studio to this "available" list; don't confuse the current Tasks calendar/subscriptions with the planned first-party Calendar module, and don't claim invoicing, messaging, external notification delivery, or two-way calendar editing.
- **Owner:** maintainer. **Refresh trigger:** a module ships or changes materially.

### C-004 — Self-hosting
- **Wording:** "Open-source, self-hosted: run it on your own server and keep your data under your control."
- **Classification:** current.
- **Evidence:** [README](../../README.md) Getting Started; [licensing.md](../licensing.md).
- **Verified at:** v0.33.25.2 · 2026-07-30.
- **Permitted locations:** anywhere.
- **Prohibited / risky:** don't imply self-hosting is automatically secure; always pair with operator-responsibility wording. Don't imply a hosted option exists today.
- **Owner:** maintainer. **Refresh trigger:** deployment/hosting model change.

### C-005 — AGPL / open source
- **Wording:** "Longtail Forge Core is open source under AGPL-3.0-only."
- **Classification:** current.
- **Evidence:** root `LICENSE`; [licensing.md](../licensing.md); [software-license](../licensing/software-license.md).
- **Verified at:** v0.33.25.2 · 2026-07-30.
- **Permitted locations:** anywhere.
- **Prohibited / risky:** don't call the hosted/commercial layer "open source"; don't imply "no commercial use." Keep AGPL network-source obligation accurate.
- **Owner:** maintainer. **Refresh trigger:** license change.

### C-006 — Secure Notes (encryption at rest)
- **Wording:** "Secure notes are encrypted at rest with a server-managed key."
- **Classification:** current.
- **Evidence:** Secure Notes model in [architecture.md](../architecture.md).
- **Verified at:** v0.33.25.2 · 2026-07-30.
- **Permitted locations:** trust/security sections, FAQ — always with the not-zero-knowledge caveat.
- **Prohibited / risky:** **Never** say "zero-knowledge," "end-to-end encrypted," "we can't read your data," or "unhackable." A configured server can decrypt; titles are plaintext metadata; losing the server key can make content unrecoverable. Secure Catalogs remain planned for 0.33.29; current Catalog and Collection membership does not inherit secure-note protection.
- **Owner:** maintainer. **Refresh trigger:** any change to the encryption model or key handling.

### C-007 — Backup / restore
- **Wording:** "The bounded private-preview topology has a tested database-and-Files backup and restore path."
- **Classification:** current for the documented private-preview topology.
- **Evidence:** [backup-restore](../backup-restore.md); [private-preview-readiness](../private-preview-readiness.md); [CHANGELOG](../../CHANGELOG.md) 0.33.17.3 and 0.33.24.9.
- **Verified at:** v0.33.25.2 · 2026-07-30.
- **Permitted locations:** roadmap, status, preview, and operator-facing sections with the bounded-topology qualifier.
- **Prohibited / risky:** **Never** claim "automatic backup protection," "guaranteed backups," "your data is safe," or that a tested operator procedure guarantees participant data durability.
- **Owner:** maintainer. **Refresh trigger:** backup format, restore procedure, supported deployment topology, or live recovery evidence changes.

### C-008 — Internet exposure / production readiness
- **Wording:** "The bounded private-preview deployment, recovery, and maintenance path is technically proven; it remains a private/technical preview, and invitations require a separate signed readiness decision."
- **Classification:** preview posture backed by current technical controls.
- **Evidence:** [private-preview-readiness](../private-preview-readiness.md); [internet-deployment](../internet-deployment.md); [operational-security](../operational-security.md); [CHANGELOG](../../CHANGELOG.md) 0.33.16, 0.33.17.9, and 0.33.24.9.
- **Verified at:** v0.33.25.2 · 2026-07-30.
- **Permitted locations:** status/trust/FAQ sections.
- **Prohibited / risky:** **Never** generalize the bounded-host proof into "production-ready," "enterprise-grade," "unhackable," or "safe for the public internet." No pen-test/audit/compliance claims, and no implication that technical deployment authorizes invitations.
- **Owner:** maintainer. **Refresh trigger:** deployment topology, security posture, readiness record, or invitation decision changes.

### C-009 — Support Tickets
- **Wording:** "Support Tickets is a committed first-party module on the roadmap." (Planned)
- **Classification:** planned (roadmap 0.34).
- **Evidence:** [ROADMAP](../../ROADMAP.md) Support Tickets 0.34; [architecture.md](../architecture.md).
- **Verified at:** v0.33.25.2 · 2026-07-30.
- **Permitted locations:** roadmap sections, "planned" labeled site sections.
- **Prohibited / risky:** **Never** present in the present tense or as available. No SLA/first-response-time claims. Don't describe it as demand-gated or optional-experiment.
- **Owner:** maintainer. **Refresh trigger:** Tickets ships (→ reclassify current).

### C-010 — Knowledge Base
- **Wording:** "Knowledge Base is a committed first-party module on the roadmap; Notes can feed its future review workflow." (Planned)
- **Classification:** planned (roadmap 0.35).
- **Evidence:** [ROADMAP](../../ROADMAP.md) Knowledge Base 0.35.
- **Verified at:** v0.33.25.2 · 2026-07-30.
- **Permitted locations:** roadmap / planned-labeled sections.
- **Prohibited / risky:** don't imply KB exists today; Notes exists, the reviewed-publication KB layer does not.
- **Owner:** maintainer. **Refresh trigger:** KB ships.

### C-011 — Creator Studio
- **Wording:** "Creator Studio is a committed first-party module on the roadmap, for creators and authors." (Planned)
- **Classification:** planned (roadmap 0.39).
- **Evidence:** [ROADMAP](../../ROADMAP.md) Creator Studio 0.39.
- **Verified at:** v0.33.25.2 · 2026-07-30.
- **Permitted locations:** roadmap / planned-labeled sections.
- **Prohibited / risky:** never present-tense/available; keep creator vs author terminology distinct; don't force authors into social-video language.
- **Owner:** maintainer. **Refresh trigger:** Creator Studio ships.

### C-012 — Hosted service / managed instances
- **Wording:** "An official hosted version and managed private instances are planned for later." (No date, no price.)
- **Classification:** commercial-hypothesis.
- **Evidence:** [commercial-viability-plan](../licensing/commercial-viability-plan.md) Lanes 2–3; [launch-plan](launch-plan.md); [pricing hypotheses](pricing-and-packaging-hypotheses.md).
- **Verified at:** v0.33.25.2 · 2026-07-30.
- **Permitted locations:** roadmap/future sections.
- **Prohibited / risky:** no dates, no prices, no uptime/SLA claims. Don't imply it's imminent.
- **Owner:** maintainer. **Refresh trigger:** hosted-service decision or Lane 2/3 readiness.

### C-013 — Supported scale
- **Wording:** "Supported scale is small-office: SQLite for roughly 50 total users and about 5–15 concurrent on one server; PostgreSQL is required before larger or shared-hosted use."
- **Classification:** current documented private-preview envelope.
- **Evidence:** [private-preview-readiness](../private-preview-readiness.md); [ROADMAP](../../ROADMAP.md) 0.33.17 (SQLite ~50 users / ~5–15 concurrent; PostgreSQL before SaaS).
- **Verified at:** v0.33.25.2 · 2026-07-30.
- **Permitted locations:** status/FAQ/technical sections.
- **Prohibited / risky:** **Never** claim "scalable," "unlimited scale," or "enterprise scale." State the small-office envelope honestly.
- **Owner:** maintainer. **Refresh trigger:** PostgreSQL / scale work ships.

### C-014 — Audiences (freelancers / small service teams; creators/authors)
- **Wording:** "Designed for freelancers and small service teams; useful for creators and authors."
- **Classification:** current for freelancers/small teams; the creator/author *pipeline* is planned (Creator Studio).
- **Evidence:** [audiences-and-use-cases](audiences-and-use-cases.md); [README](../../README.md).
- **Verified at:** v0.33.25.2 · 2026-07-30.
- **Permitted locations:** anywhere, with the creator/author caveat that Creator Studio is planned.
- **Prohibited / risky:** don't claim "built for everyone" or "for enterprises." Don't market as an ADHD/medical product or make clinical claims — "supportive of," never "treats/cures."
- **Owner:** maintainer. **Refresh trigger:** audience strategy or Creator Studio status change.

### C-015 — Testimonials / customers / usage
- **Wording:** *(none — there are no customers, testimonials, or usage numbers to cite.)*
- **Classification:** n/a (prohibition entry).
- **Evidence:** none exists.
- **Permitted locations:** none.
- **Prohibited / risky:** **Never** fabricate customers, testimonials, usage/adoption numbers, revenue, ratings, or logos. Verbatim preview/partner quotes may be used only with explicit, specific permission and only when genuinely given.
- **Owner:** maintainer. **Refresh trigger:** a real, permissioned testimonial exists.

### C-016 — Tasks calendar subscriptions
- **Wording:** "Follow a private, permission-scoped, read-only Tasks calendar in Google Calendar, Apple Calendar, Outlook, or Thunderbird."
- **Classification:** current.
- **Evidence:** [tasks-module](../tasks-module.md) private calendar feed and administrator lifecycle; [Help](../../help/modules/tasks/reminders-calendar-and-subscriptions.md); [CHANGELOG](../../CHANGELOG.md) 0.33.22.9.1-.3.
- **Verified at:** v0.33.25.2 · 2026-07-30.
- **Permitted locations:** current-feature lists, FAQ, demos, and self-hosted preview copy with the read-only/private qualifier.
- **Prohibited / risky:** Do not call this the planned Calendar module, an account connection, OAuth integration, instant synchronization, or two-way editing. Do not expose a real subscription URL.
- **Owner:** maintainer. **Refresh trigger:** calendar-feed scope, lifecycle, client compatibility, or planned Calendar-module status changes.

### C-017 — Legal, licensing, and third-party notices
- **Wording:** "The distribution includes reviewed third-party notices, and authenticated Help provides Legal and Licensing plus Third-Party Notices articles tied to the running release identity."
- **Classification:** current for the repository/distribution and authenticated Help surfaces.
- **Evidence:** root [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES.md); [licensing](../licensing.md); [CHANGELOG](../../CHANGELOG.md) 0.33.25.1-.2.
- **Verified at:** v0.33.25.2 · 2026-07-30.
- **Permitted locations:** licensing FAQ, distribution notes, and About/Help descriptions.
- **Prohibited / risky:** Do not imply these notices are legal advice, a compliance certification, final hosted-instance Terms or Privacy content, or an activated outside-contributor process. Public Terms/Privacy routes on the stacked 0.33.25.3 branch remain unversioned until Raymond Tec's hosted documents pass attorney review.
- **Owner:** maintainer. **Refresh trigger:** dependency inventory, bundled assets, license stack, public legal-surface status, or hosted legal approval changes.

---

## Maintenance

- Re-verify entries at each release and whenever a refresh trigger fires; update **Verified at**.
- When a `planned`/`preview` claim ships, reclassify to `current`, update evidence, and update the [feature-outcome map](feature-outcome-map.md).
- New public claims get a new `C-###` entry before they're published.
- If a claim can't cite a real source, it doesn't ship.
