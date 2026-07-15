# Design Partner Plan

A structured plan for working with a small set of **design partners** after the friends-and-family preview ([friends-and-family-preview.md](friends-and-family-preview.md)) and once the product is stable enough for real (still-cautious) use. Design partners are engaged users who give structured feedback in exchange for early influence — not paying customers with SLAs, and not sources for custom forks.

This plan is a **commercial hypothesis / planning document**. It commits to no dates, prices, or guarantees.

## When this starts

After: the friends-and-family preview has run, the 0.33.16 security hardening and 0.33.17 preview readiness work is complete, and the app is on a public self-hosted or managed-preview footing. Creator/author partners specifically wait until **Creator Studio (0.39)** exists; support-heavy partners are most valuable once **Support Tickets (0.34)** exists.

## Partner segments

### 1. Service-business partners
Freelancers and small service teams (the wedge). Highest priority — they can use the current product meaningfully today.
- Value: validate context recovery, Workbench flow, time/billing usefulness, and multi-client reality.

### 2. Support-heavy organizations
Teams whose core pain is inbound requests. Most useful **after Support Tickets (0.34)**.
- Value: validate the ticket → task → time → resolution → KB workflow with real (sanitized) support load.
- Until Tickets ships, engage them on the current product's task/time/notes handling and set expectations that the ticket workflow is planned.

### 3. Creators and authors — after Creator Studio exists
Engage only once **Creator Studio (0.39)** is real enough to exercise.
- Value: validate the idea→draft→production→publish→repurpose pipeline and keep creator vs author terminology honest.

## Participation expectations

Set these in writing before onboarding a partner:

- Use Longtail Forge for real but non-critical work; keep independent backups of anything important.
- Join a regular, lightweight feedback cadence (below).
- Provide candid feedback, including negative.
- Accept that the product roadmap is shared across all partners — their requests inform priorities but are not guaranteed features or custom builds.
- Understand the current status: private/technical preview posture, planned modules are planned, no uptime/security/backup guarantees beyond what's documented.

In exchange, partners get early access, direct influence on priorities, and a responsive line to the maintainer.

## Onboarding

1. Fit call — confirm the partner matches a segment and has the target pain.
2. Written expectations — share and confirm the participation expectations and current limitations.
3. Environment — self-hosted with guided setup, or a managed preview instance if/when offered (Commercial hypothesis).
4. Guided first workflow — a segment-specific version of the five-minute path (service-business: multi-client resume; support: request-to-work once Tickets ships; creator/author: pipeline once Creator Studio ships).
5. Baseline interview — capture their current tools, workflow, and biggest reconstruction pain.

## Structured interviews

Run a consistent interview so feedback is comparable across partners:

- **Current workflow:** How do you run this work today? What tools, what breaks?
- **Context recovery:** Where do you lose the thread? Did Longtail Forge reduce that?
- **Module fit:** Which modules earned a place in your day? Which didn't?
- **Blocking gaps:** What's the one missing thing that limits your usage?
- **Trust/operational:** What worries you about relying on it (data, security, reliability)?
- **Willingness signals:** Would you pay to have this hosted for you, or to get setup/migration/support help? (Signal only — see [pricing hypotheses](pricing-and-packaging-hypotheses.md); do not quote prices.)

Record verbatim phrases for internal use; do not turn them into public testimonials without explicit, specific permission.

## Feedback cadence

- **Lightweight weekly** async check-in (short prompt: wins, blockers, bugs).
- **Structured interview** every 3–4 weeks.
- **Shared changelog note** to partners when their feedback changes something — closes the loop and sustains engagement.
- A simple running feedback log per partner (themes, requests, bugs, status).

## Avoiding custom forks and one-customer customization

This is the core discipline of the program:

- **Do not fork per partner.** Every partner runs the same public core.
- **Separate product needs from customization.** Before building anything a partner asks for, classify it:
  - *Shared product need* — several partners (or the wedge broadly) have it → candidate for the roadmap under normal prioritization and the [Two-Module Rule](../../ROADMAP.md) where a framework primitive is involved.
  - *One-customer customization* — specific to one partner's process → do **not** build it into the core; note it, and if it's genuinely valuable to that partner, it belongs in paid services / their own configuration, not a core fork.
- Prefer configuration and existing extension points over new bespoke code.
- Resist "we'll just add this one flag for them" — that is how a clean product becomes an unmaintainable pile of special cases. The framework/module architecture and Two-Module Rule exist precisely to keep this boundary.

## Possible paid or commitment-based participation (no pricing selected)

A design-partner relationship can be free, or can involve a modest commitment, **without choosing final pricing yet**. Options to consider (all Commercial hypothesis):

- Free participation in exchange for structured feedback (default for early partners).
- Discounted or credited future hosting for partners who stay engaged (if/when hosting exists).
- Paid setup/migration/support as a separate service for partners who want hands-on help.
- A small commitment (deposit or reduced-rate agreement) to filter for serious partners — only if it doesn't deter good early feedback.

Decide the actual model later, informed by willingness-to-pay signals and the [pricing hypotheses](pricing-and-packaging-hypotheses.md). Do not publish or promise any of these as prices.

## Success criteria

- 2–3 engaged service-business partners using the product for real work and returning weekly.
- Clear, repeated themes about what does and doesn't reduce reconstruction tax.
- A prioritized, de-duplicated list of shared product needs (distinct from one-off customizations).
- No core forks created; no unmaintainable per-partner special cases introduced.
- Honest willingness-to-pay signals to inform later pricing decisions.

## Cross-references

- [friends-and-family-preview.md](friends-and-family-preview.md) — the stage before this.
- [launch-plan.md](launch-plan.md) — where design partners sit in the overall staging.
- [pricing-and-packaging-hypotheses.md](pricing-and-packaging-hypotheses.md) — for any paid-participation thinking.
- [../licensing/commercial-viability-plan.md](../licensing/commercial-viability-plan.md) — release lanes and commercial model.
