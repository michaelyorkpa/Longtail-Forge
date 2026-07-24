# Commercial Viability Plan

## Goal

Longtail Forge should remain transparent, self-hostable, and useful to solo/small-business users while preserving a realistic path to revenue, paid hosting, private instances, commercial licensing, and eventual entity transfer.

The intended model is:

```text
AGPL public core + protected official brand + private commercial/hosted layer + paid services
```

This structure lets the project build trust through an open self-hosted core while keeping the highest-leverage commercial infrastructure outside the public repo.

Non-binding pricing and packaging thinking that supports these lanes is kept separately in [`../marketing/pricing-and-packaging-hypotheses.md`](../marketing/pricing-and-packaging-hypotheses.md). Those hypotheses do not set prices or alter the commercial model here; the committed Support Tickets, Knowledge Base, and Creator Studio modules remain first-party public-core modules when completed and are not repackaged as paid add-ons.

## What Must Stay Public

The public core should include the usable self-hosted application:

- workspace/account basics for self-hosted users;
- core modules;
- committed first-party public-core modules, including Support Tickets, Knowledge Base, and Creator Studio when completed;
- database adapters needed for supported self-hosting;
- migrations and baseline schema;
- public API foundations included in the core;
- module framework surfaces needed for first-party public modules;
- self-hosting documentation;
- license/source notices.

Public core changes should remain AGPL-3.0-only unless a file or directory is intentionally licensed differently.

## What Should Stay Private

The following should remain outside the public AGPL core unless there is a deliberate business decision to open them:

- SaaS tenant provisioning;
- billing and subscription enforcement;
- account limits and commercial plan enforcement;
- hosted backup orchestration;
- production monitoring and alerting;
- support/admin console tooling;
- private deployment automation;
- managed private instance orchestration;
- SSO/SCIM/SAML/OIDC enterprise integration where developed as a paid layer;
- passkeys/2FA policy administration where developed as a paid layer;
- hosted-only analytics and usage metering;
- customer lifecycle automation;
- paid marketplace or first-party commercial plugin infrastructure;
- separately designated first-party commercial modules or plugins, excluding the committed Support Tickets, Knowledge Base, and Creator Studio public-core modules.

## Release Lanes

### Lane 1: Community Self-Hosted

Purpose: build credibility, adoption, trust, feedback, and proof that the app is real.

Must have before public release:

- tested Docker Compose install/deploy/upgrade/backup/restore and migration-aware restored rollback flow on every supported native container architecture; direct Node/systemd production support and an in-app updater are not required for the initial release lane;
- clear SQLite/Postgres support statement;
- backup/restore documentation;
- admin/bootstrap documentation;
- license/source notices;
- security disclosure path;
- basic migration testing;
- clear limitations.

Revenue options:

- sponsorships;
- paid setup help;
- paid migration help;
- paid support;
- donations;
- later commercial license exceptions.

### Lane 2: Official Shared Hosted SaaS

Purpose: turn people who like the product but do not want to self-host into recurring revenue.

Must have before charging:

- customer Terms of Service;
- Privacy Policy;
- billing provider setup;
- tenant isolation model;
- admin/support access policy;
- data export path;
- backup policy;
- account cancellation/deletion flow;
- production monitoring;
- incident response plan;
- tax/payment records;
- security baseline.

Recommended commercial posture:

- AGPL core remains public;
- SaaS infrastructure remains private;
- hosted-only operational features remain proprietary;
- trademark policy protects the official service.

### Lane 3: Managed Private Instances

Purpose: higher-ticket hosted deployments for customers who want isolation, control, or custom support.

Must have before charging:

- written service agreement;
- scope of support;
- backup/restore terms;
- uptime/support expectations;
- update policy;
- customer data handling terms;
- access control and admin policy;
- termination/export process;
- clear pricing and billing terms.

Recommended commercial posture:

- use the public AGPL core as the deployed app;
- keep provisioning, monitoring, backups, update orchestration, and customer-specific automation private;
- offer commercial license exceptions only when actually needed and priced accordingly.

### Lane 4: Commercial License Exceptions

Purpose: monetize organizations that cannot or will not comply with AGPL obligations.

Use cases:

- embedding Longtail Forge into a proprietary internal/customer product;
- operating a modified hosted version without offering source as AGPL would require;
- distributing modified versions under non-AGPL terms;
- enterprise customers requiring negotiated license terms.

Guardrails:

- do not grant commercial exceptions casually;
- do not grant commercial rights by email shorthand;
- use written agreements;
- only license code the Project Owner owns or has sufficient CLA/assignment rights for;
- price commercial exceptions substantially higher than normal hosting.

## Budget-Aware Operating Plan

While budget is constrained, prioritize documents and actions that preserve future value without requiring expensive entity work immediately:

1. Keep copyright notices consistent.
2. Keep the public core AGPL-3.0-only.
3. Keep private SaaS/commercial code in private repositories.
4. Do not accept non-trivial outside code until the CLA process is active.
5. Keep records of domains, repos, marks, release dates, screenshots, and public announcements.
6. Keep personal/DBA financial records clean enough to separate Longtail Forge revenue later.
7. Add customer terms before paid hosted launch.
8. Form an LLC when revenue, liability, or customer expectations justify it.
9. Assign project assets into the LLC with written records when the entity exists.

## Moat

The moat should not be secrecy around the entire app. The moat should be:

- the official brand and trust;
- clean self-hosting experience;
- practical small-business workflows;
- opinionated product design;
- hosted convenience;
- migration/support skill;
- private operations tooling;
- first-party commercial plugins;
- customer relationships;
- accumulated documentation and product authority.

## What Not To Do

Do not:

- relicense the public core to MIT/Apache unless the business goal changes;
- add "no commercial use" restrictions and still call the core open source;
- put proprietary SaaS code in the public AGPL repo by accident;
- accept outside PRs without contributor rights;
- use copied license templates without tracking provenance;
- use third-party assets without license review;
- promise support, uptime, security, backups, or legal compliance without written terms;
- mix customer data into development fixtures or public issue reports;
- transfer project ownership casually without written assignment records.

## Future Exit Readiness

To keep a future sale or investment possible, preserve:

- clean Git history;
- license files and policy history;
- CLA records;
- contractor IP assignments;
- trademark/domain/social account ownership records;
- dependency/license inventory;
- release artifacts;
- customer contracts;
- revenue records;
- data protection policies;
- records of any commercial license exceptions granted.

The target is not corporate theater. The target is clean enough chain-of-title and licensing history that a future buyer, attorney, accountant, or partner does not have to excavate the project with a toothbrush.

---

[← Back to the licensing index](README.md)
