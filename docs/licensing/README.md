# Licensing Directory

This directory contains the operating license and commercialization policies for Longtail Forge.

The short version:

- **Core software:** AGPL-3.0-only.
- **Documentation prose:** CC BY 4.0 unless otherwise noted.
- **Plugin SDKs and integration examples:** Apache-2.0 only where expressly marked.
- **Official hosted-service code, managed deployment tooling, billing code, cloud operations code, and first-party commercial plugins:** proprietary / all rights reserved unless separately licensed.
- **Branding:** trademark rights reserved.
- **Non-trivial outside contributions:** not accepted until the CLA process is active.

These documents are written for the current project owner, **Michael York d/b/a Raymond Tec**, and for any successor entity that later receives the project assets by written assignment.

## Documents

- [`software-license.md`](software-license.md): core AGPL-3.0-only software policy
- [`commercial-licensing.md`](commercial-licensing.md): paid services, private plugins, SaaS, and commercial license exceptions
- [`commercial-viability-plan.md`](commercial-viability-plan.md): commercial moat, release lanes, and budget-aware viability plan
- [`contributor-policy.md`](contributor-policy.md): contribution intake rules and boundaries
- [`contributor-license-agreement.md`](contributor-license-agreement.md): contributor license agreement
- [`trademark-policy.md`](trademark-policy.md): permitted and prohibited use of the Longtail Forge name and marks
- [`documentation-license.md`](documentation-license.md): documentation licensing and attribution rules
- [`plugin-sdk-license.md`](plugin-sdk-license.md): plugin SDK and integration-example licensing
- [`ownership-and-entity-plan.md`](ownership-and-entity-plan.md): present ownership and future LLC transfer plan
- [`third-party-dependencies.md`](third-party-dependencies.md): dependency, asset, font, icon, and third-party code intake rules
- [`source-file-notices.md`](source-file-notices.md): SPDX identifiers and file-header conventions
- [`repo-integration-checklist.md`](repo-integration-checklist.md): repo-wide application checklist

## Scope

These documents are intended to guide repository operation, contributor intake, public licensing, and commercial planning. They do not replace the full text of the applicable licenses and do not provide legal advice to third parties.

If a file contains a specific SPDX identifier, license header, or directory-level license notice, that specific notice controls for that file to the extent it conflicts with the general summary here.

## Process Gates

The repo-level [licensing hub](../licensing.md#future-process-gates) owns the current contribution, public-release legal/about, third-party notice, and private-repository process boundaries. The third-party-notices gate is active and satisfied. `npm run licensing:gates` confirms that inventory and reports still-inactive public-app and outside-contribution artifacts as warnings; `npm run third-party-notices:check` is the hard drift check.

Do not revise this policy set during unrelated feature work. Licensing maintenance is reserved for intentional policy changes, dependency/asset notice changes, public-release preparation, or activation of outside contribution intake.

---

See also the repo-level licensing hub: [`../licensing.md`](../licensing.md).
