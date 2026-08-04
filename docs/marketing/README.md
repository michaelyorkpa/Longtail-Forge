# Longtail Forge Marketing Documentation Hub

This directory holds the **product-marketing foundation** for Longtail Forge: positioning, messaging, audience models, demo scripts, preview and launch plans, and draft public copy.

It is a working foundation, not published marketing. Everything here is written to be **truthful about what the product does today versus what is planned**, so that public copy can be assembled later without drifting ahead of the real product.

## How to use this directory

- Start with [positioning-and-messaging.md](positioning-and-messaging.md) for the canonical message hierarchy. All other documents defer to it.
- Before publishing any public claim, check it against [claims-and-proof-register.md](claims-and-proof-register.md). That register is the guardrail: it records each claim's status classification, evidence source, and safe/unsafe wording.
- Documents describe the product; they do not change it. This directory does not modify runtime behavior, schema, security controls, module manifests, APIs, packaging, or CI.

## Status vocabulary used throughout

Every capability claim in this directory is tagged as one of:

1. **Current** — shipped and available in the app today (repository baseline 0.33.25.6; product behavior through 0.33.24.9 plus the complete 0.33.25 legal, Help, and marketing branch).
2. **Private preview** — the current release posture: the bounded preview deployment and recovery path are technically proven, while the private signed readiness record and explicit invite/no-invite decision remain open.
3. **Planned** — committed roadmap functionality not yet shipped (Support Tickets 0.34, Knowledge Base 0.35, Creator Studio 0.39).
4. **Commercial hypothesis** — longer-term commercial/hosted plans and pricing ideas that are not commitments.
5. **Idea** — hypotheses and open questions.

Do not describe planned or hypothetical functionality as currently available.
Secure Notes are current only at note level. Secure Catalogs remain future `0.33.29` work and must not be described as inherited protection available today.

This baseline incorporates the shipped preview hardening and recovery work,
0.33.20 performance changes without turning internal measurements into public
benchmarks, 0.33.21 UX corrections, 0.33.22 Tasks calendar subscriptions,
0.33.23 error surfaces, and the 0.33.24 maintenance boundary.

## Documents

| Document | Purpose |
| --- | --- |
| [positioning-and-messaging.md](positioning-and-messaging.md) | Canonical headline, descriptions, differentiation, and language rules. |
| [audiences-and-use-cases.md](audiences-and-use-cases.md) | Audience model, personas, jobs-to-be-done, pains, outcomes, objections. |
| [feature-outcome-map.md](feature-outcome-map.md) | Problem → feature → outcome table with current/planned status and proof source. |
| [demo-stories.md](demo-stories.md) | Demo scripts; marks which can be recorded now versus which need roadmap features. |
| [screenshot-and-demo-data-plan.md](screenshot-and-demo-data-plan.md) | Screenshot inventory and safe fake demo data, coordinated with the seeded dev database (roadmap 0.33.17.4). |
| [friends-and-family-preview.md](friends-and-family-preview.md) | Private-preview participant, onboarding, feedback, and closeout plan. |
| [design-partner-plan.md](design-partner-plan.md) | Post-preview design-partner program for service businesses and creators. |
| [launch-plan.md](launch-plan.md) | Stage model from private preview through hosted SaaS, with prerequisites and success criteria. |
| [website-copy-draft.md](website-copy-draft.md) | Draft homepage and section copy, current/planned labeled. |
| [faq-draft.md](faq-draft.md) | Draft FAQ answers linking to authoritative technical/legal docs. |
| [pricing-and-packaging-hypotheses.md](pricing-and-packaging-hypotheses.md) | Internal, non-committal pricing/packaging hypotheses and open questions. |
| [claims-and-proof-register.md](claims-and-proof-register.md) | Per-claim register: wording, classification, evidence, safe/unsafe variations. |

## Related authoritative sources

Marketing copy defers to these; it does not restate or override them.

- [../../README.md](../../README.md) — product overview and current capabilities.
- [../../ROADMAP.md](../../ROADMAP.md) — detailed per-version forward plan and targets.
- [../../CHANGELOG.md](../../CHANGELOG.md) — completed release notes.
- [../product-notes.md](../product-notes.md) — product shape, Dashboard/Workbench, module commitments.
- [../architecture.md](../architecture.md) — framework/module architecture, including the Secure Notes encryption model.
- [../accessibility.md](../accessibility.md) — accessibility target and checks.
- [../licensing.md](../licensing.md) and [../licensing/](../licensing/) — license stack, trademark, and commercial model.

## Rules for editing this directory

- Keep status labels accurate. When a module ships or a roadmap target moves, update the affected documents and the claims register.
- Do not invent customers, testimonials, usage numbers, revenue, audits, certifications, uptime, response times, guarantees, launch dates, prices, or benchmarks.
- Do not make absolute security claims and do not describe Secure Notes as zero-knowledge.
- Do not turn legal/licensing policy documents into promotional copy; link to them instead.
