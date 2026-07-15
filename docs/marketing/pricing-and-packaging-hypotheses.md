# Pricing and Packaging Hypotheses

**Internal hypothesis document — not a published price sheet.** Nothing here is a commitment, and no number below should be presented to anyone as a final or offered price. This document records the packaging *thinking* so pricing decisions later are grounded, not improvised.

It builds on the release lanes in [../licensing/commercial-viability-plan.md](../licensing/commercial-viability-plan.md). Classification for everything here: **Commercial hypothesis**.

## Guiding principles

- The **public AGPL core stays free to self-host.** Monetization comes from convenience, operations, support, and commercial-license exceptions — not from crippling the core.
- **Tickets, Knowledge Base, and Creator Studio remain first-party public-core modules.** They are not paywalled add-ons. Pricing must not remove them from the core product direction.
- Charge for things that genuinely cost money or carry risk to deliver: hosting, operations, support, migrations, and legal/commercial exceptions.
- Keep it simple at first. Avoid complex per-module or per-seat matrices before there's evidence they're needed.

## Packaging hypotheses

### 1. Free AGPL community self-hosting
- The full public core, free, self-hosted, under AGPL-3.0-only.
- This is the foundation and the trust-builder; it stays free.

### 2. Official shared hosted service (later)
- Hosted convenience for people who don't want to run a server.
- Likely a recurring subscription; structure (per-workspace, per-user, or flat small-team tiers) **undecided**.
- Requires the Lane 2 prerequisites (ToS, privacy, billing, tenant isolation, ops, PostgreSQL) before charging anything.

### 3. Managed private instances (later)
- Higher-touch, isolated deployments with a written agreement.
- Likely a higher recurring price plus setup, reflecting real operational cost.
- Requires the Lane 3 written-terms prerequisites before charging.

### 4. Paid setup / migration / support (services)
- One-off or retainer services: install help, data migration, upgrade help, support.
- Can begin earliest of the commercial options because it needs no hosted infrastructure — just the maintainer's time.

### 5. Commercial-license exceptions
- For organizations that can't or won't meet AGPL obligations (embedding, closed modifications, non-AGPL distribution).
- Priced substantially higher than normal hosting; always via written agreement; only for code the owner has rights to. See Lane 4.

## Clients / guests: free or low cost?

Open question. Hypotheses to test:

- **External client/guest users** (e.g., someone who only views their own tickets or replies) probably should be **free or very low cost**, so pricing doesn't punish having clients — the paying entity is the service business, not its clients.
- Internal team members are the more natural basis for any per-seat component, if seats are used at all.
- Risk to avoid: a model where inviting clients gets expensive fast, which would work against the core use case.
- **Decision deferred** until Support Tickets exists and real client/guest usage patterns are visible.

## Why module-only pricing is not required at initial launch

- The wedge value (context recovery across the current modules) is delivered by the core, self-hosted, free. There's no need to gate individual modules to have a business.
- Early monetization is hosting + services + commercial exceptions — none of which require charging per module.
- Per-module pricing would complicate the story, risk paywalling first-party modules that are meant to be core, and add billing complexity before there's evidence anyone wants to buy that way.
- So: **no module-only pricing at initial launch.** Revisit only if clear demand and a clean boundary emerge.

## Future edition / add-on possibilities (without gutting the core)

If editions or add-ons are ever introduced, they must **not** remove Tickets or Creator Studio (or other committed core modules) from the core. Legitimate future paid layers could include:

- hosted-only operational features (managed backups, monitoring dashboards);
- enterprise integrations developed as a paid layer (SSO/SCIM/SAML/OIDC, advanced 2FA/passkey policy administration) — already earmarked private in the commercial plan;
- first-party commercial plugins that are genuinely separate from the core product;
- priority support tiers.

These are hypotheses, not a plan. The default remains: core stays whole and free to self-host.

## Questions that must be answered before publishing any prices

- What is the real monthly cost to host one small-team workspace (compute, storage, backups, monitoring, support time)?
- What's the support load per hosted customer, in hours?
- Is billing per-workspace, per-internal-user, or flat small-team tiers?
- Are external clients/guests free, and where's the line?
- What's the free-vs-paid boundary for the hosted service (trial? free tier? none?)?
- What do design partners actually say they'd pay (see willingness-to-pay research below)?
- What legal/tax structure is needed before taking recurring payments (see the entity plan in licensing)?

## Hosting / support cost inputs to gather

- Per-instance infrastructure cost at expected small-office load (recall the roadmap's ~50-user / ~5–15-concurrent SQLite envelope; PostgreSQL before larger scale).
- Storage and backup costs (and the future SaaS file-storage direction — DigitalOcean Spaces is noted in TODO as an idea, not a commitment).
- Time cost of onboarding, migration, and support per customer.
- Payment-processing and tax-compliance overhead.

## Willingness-to-pay research (how to learn, not assume)

- Use design-partner interviews ([design-partner-plan.md](design-partner-plan.md)) to capture honest signals: "Would you pay to have this hosted? To get migration/support help? Roughly what range feels fair?"
- Watch behavior, not just stated intent — who asks for hosting, who asks for setup help.
- Avoid anchoring on competitor prices in public copy; do not publish competitor pricing in the repo.
- Treat all early numbers as directional until there's real transaction evidence.

## Do-not-do

- Do not present any hypothetical price as final or offered.
- Do not paywall committed first-party core modules.
- Do not add "no commercial use" terms and still call the core open source.
- Do not promise hosting, uptime, backups, or support without written terms.
- Do not publish prices before the "questions that must be answered" above are answered.
