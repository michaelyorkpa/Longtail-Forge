# Launch Plan

Longtail Forge reaches users in **stages**, each with its own prerequisites, audience, and honest claim set. This plan separates those stages so no stage borrows credibility (or promises) from a later one.

It aligns with the release lanes in [../licensing/commercial-viability-plan.md](../licensing/commercial-viability-plan.md) and the readiness work in [ROADMAP.md](../../ROADMAP.md) (0.33.16 security, 0.33.17 preview/packaging/backup).

**No invented launch dates.** The only dated target in the roadmap is the friends-and-family preview target of **July 31, 2026**, and it is explicitly conditional on completing the security and readiness prerequisites. Use roadmap targets only when clearly labeled as targets.

## Stage overview

| Stage | Audience | Gated on | Claim posture |
| --- | --- | --- | --- |
| 1. Private friends-and-family preview | A few trusted users | 0.33.16 + 0.33.17 readiness | Experimental; no guarantees |
| 2. Public self-hosted technical preview | Self-hosters, tinkerers | Stage 1 learnings + docs + disclosure path | "Technical preview," self-host only |
| 3. Stable community self-hosted release | Self-hosters, small teams | Tested install/upgrade/backup, docs, limitations | Stable self-hosted; still no hosted guarantees |
| 4. Managed private-instance pilots | Higher-touch orgs | Written terms, ops tooling (private) | Contract-based; only promise what's in the contract |
| 5. Official shared hosted SaaS | Non-self-hosters | ToS/privacy/billing/ops/PostgreSQL | Only after commercial + ops prerequisites |

---

## Stage 1 — Private friends-and-family preview

- **Prerequisites:** 0.33.16 internet-exposure hardening complete; 0.33.17 tested backup/restore and deployment readiness; the protected `nightly` -> `main` promotion, isolated demo/preview environments, and manual immutable preview deployment path proven; the [friends-and-family plan](friends-and-family-preview.md) prepared. Roadmap **target** July 31, 2026, conditional on the above.
- **Audience:** a handful of trusted individuals in the wedge (freelancers/small service operators).
- **Message:** "Try an early, private preview of a work hub built for interrupted client work. Experimental — no guarantees."
- **Assets:** invitation copy, known-limitations + privacy warning, five-minute first-use path, bug-report template (all in the friends-and-family plan); Demo A (recordable now) for orientation.
- **Channels:** direct personal invitations only. No public posting.
- **Feedback goal:** does context recovery / Workbench-first flow help real people; what breaks; onboarding friction.
- **Success criteria:** participants complete the first-use path, return for a second session, and give candid feedback; no data-loss incident mishandled; key bugs identified.
- **Claims / limitations:** experimental; private; no uptime/security/backup/data-durability guarantees; planned modules labeled planned; Secure Notes not zero-knowledge.

## Stage 2 — Public self-hosted technical preview

- **Prerequisites:** Stage 1 learnings addressed; self-hosting install/upgrade/backup docs in place; a security-disclosure path published; a clear limitations statement; packaging (Docker + bare-metal) from 0.33.17.
- **Audience:** self-hosters, open-source-curious developers, privacy-conscious small operators willing to run early software.
- **Message:** "Longtail Forge is an open-source, self-hosted work hub in **technical preview**. Run it yourself, kick the tires, tell us what breaks."
- **Assets:** README + install/self-hosting docs, [website copy draft](website-copy-draft.md), Workbench-first screenshots ([screenshot plan](screenshot-and-demo-data-plan.md)), Demo A, FAQ, security-disclosure page, AGPL/source notices.
- **Channels:** project repo, a simple site/landing page, relevant self-hosting and open-source communities (respectfully, no spam), personal network. No competitor attacks.
- **Feedback goal:** real-world install/upgrade success; self-host UX; which modules matter; bug volume/severity at wider exposure.
- **Success criteria:** independent users successfully install, upgrade, and back up; issues flow through the disclosure/bug path; no over-claiming incidents.
- **Claims / limitations:** "technical preview," self-hosted only; operator owns security/backups/updates; hosted version and planned modules are future; no production-readiness or compliance claims.

## Stage 3 — Stable community self-hosted release

- **Prerequisites (from Lane 1 of the commercial plan):** tested manual Docker and bare-metal install/upgrade/rollback; clear SQLite/Postgres support statement; backup/restore docs; admin/bootstrap docs; license/source notices; security-disclosure path; basic migration testing; clear limitations.
- **Audience:** self-hosters and small teams wanting a dependable self-hosted tool.
- **Message:** "Longtail Forge — a stable, open-source, self-hosted work hub for freelancers and small service teams."
- **Assets:** polished README, full self-hosting/operations docs, refreshed screenshots and demo, FAQ, versioned release artifacts + changelog.
- **Channels:** repo releases, project site, open-source/self-hosting communities, maintainer's network.
- **Feedback goal:** sustained real-world usage; upgrade reliability; feature priorities for planned modules.
- **Success criteria:** users run it in production-for-themselves without hand-holding; upgrade/backup paths proven; healthy issue flow.
- **Claims / limitations:** "stable self-hosted release"; still no hosted-service guarantees; supported scale is small-office (SQLite ~50 users, ~5–15 concurrent — see roadmap 0.33.17); planned modules labeled per their status.

## Stage 4 — Managed private-instance pilots

- **Prerequisites (from Lane 3):** written service agreement; scope of support; backup/restore terms; update policy; data-handling terms; access/admin policy; termination/export process; clear pricing/billing terms; private provisioning/monitoring/backup tooling (kept out of the public core).
- **Audience:** organizations wanting isolation, control, or hands-on support without self-hosting.
- **Message:** "We'll run and support a private Longtail Forge instance for your team" — scoped by contract.
- **Assets:** service agreement template, onboarding/migration runbook, support scope doc, admin/access policy.
- **Channels:** direct sales/relationships from design partners and inbound interest. No public SLA/uptime marketing.
- **Feedback goal:** validate the managed model, real operational cost, and support load.
- **Success criteria:** pilots run within agreed terms; operational load understood; a repeatable (non-forked) provisioning approach.
- **Claims / limitations:** promise only what the written agreement covers; no uptime/security/backup claims outside the contract; the deployed app remains the public AGPL core.

## Stage 5 — Official shared hosted SaaS

- **Prerequisites (from Lane 2):** customer Terms of Service; Privacy Policy; billing provider; tenant isolation model; admin/support access policy; data-export path; backup policy; account cancellation/deletion flow; production monitoring; incident-response plan; tax/payment records; security baseline; and PostgreSQL (required before shared hosted SaaS per the roadmap).
- **Audience:** people who like the product but don't want to self-host.
- **Message:** "The easiest way to use Longtail Forge — hosted by us." Only after the prerequisites exist.
- **Assets:** hosted site, pricing (decided via [pricing hypotheses](pricing-and-packaging-hypotheses.md), not before), ToS/Privacy, onboarding, support docs.
- **Channels:** hosted site, content, community, referrals.
- **Feedback goal:** conversion, retention, support load, hosting economics.
- **Success criteria:** sustainable hosting economics; reliable operations within stated (documented, not exaggerated) terms.
- **Claims / limitations:** state only backup/uptime/security terms that are actually implemented and contractually backed; AGPL core stays public while SaaS infrastructure stays private.

## Cross-stage rules

- Never let an earlier stage borrow a later stage's promises (e.g., don't imply hosted reliability during the self-hosted preview).
- Keep the AGPL core public and the commercial/hosted layer private across all stages ([commercial-viability-plan.md](../licensing/commercial-viability-plan.md)).
- Update the [claims register](claims-and-proof-register.md) whenever a stage changes what's true.
- No invented dates; label roadmap targets as targets.
