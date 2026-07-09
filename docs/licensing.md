# Longtail Forge Licensing

Longtail Forge is owned and maintained by **Michael York d/b/a Raymond Tec** unless and until ownership is assigned in writing to a successor entity.

This page is the repo-level licensing hub. It summarizes the intended license stack and points to the controlling project policy documents in [`docs/licensing/`](licensing/).

## License Stack

| Area | License / Policy | Notes |
| --- | --- | --- |
| Longtail Forge core software | GNU Affero General Public License v3.0 only (`AGPL-3.0-only`) | Applies to the public core app unless a file or directory-specific notice says otherwise. See [`software-license.md`](licensing/software-license.md). |
| Documentation prose | Creative Commons Attribution 4.0 International (`CC BY 4.0`) | Applies to documentation prose unless a document says otherwise. See [`documentation-license.md`](licensing/documentation-license.md). |
| Plugin SDKs and integration examples | Apache License 2.0 (`Apache-2.0`) | Applies only to SDK/API/example directories or files expressly marked Apache-2.0. See [`plugin-sdk-license.md`](licensing/plugin-sdk-license.md). |
| Official hosted services, managed deployment tooling, cloud operations code, billing code, and first-party commercial plugins | Proprietary / all rights reserved unless separately licensed | These may be developed in private repositories or distributed under separate commercial terms. See [`commercial-licensing.md`](licensing/commercial-licensing.md). |
| Longtail Forge name, logos, marks, trade dress, icons, and official branding | Trademark rights reserved | No trademark license is granted by the software license. See [`trademark-policy.md`](licensing/trademark-policy.md). |
| Third-party contributions | Not accepted for non-trivial code until a CLA process is active | See [`contributor-policy.md`](licensing/contributor-policy.md) and [`contributor-license-agreement.md`](licensing/contributor-license-agreement.md). |

## Practical Summary

You may use, study, modify, and self-host Longtail Forge under the terms of the AGPL-3.0-only license.

If you modify Longtail Forge and make the modified app available to users over a network, you are responsible for complying with the AGPL's source-code availability requirements for that modified version.

Commercial use of the AGPL version is allowed, subject to the AGPL. Separate commercial licenses, hosted services, support plans, managed deployments, and proprietary first-party plugins may be offered by Michael York d/b/a Raymond Tec or a successor entity.

## Licensing Documents

- [`licensing/README.md`](licensing/README.md): index of the licensing directory
- [`licensing/software-license.md`](licensing/software-license.md): core software license policy
- [`licensing/commercial-licensing.md`](licensing/commercial-licensing.md): commercial licensing and paid-product policy
- [`licensing/commercial-viability-plan.md`](licensing/commercial-viability-plan.md): commercial moat, release lanes, and budget-aware viability plan
- [`licensing/contributor-policy.md`](licensing/contributor-policy.md): contribution intake rules
- [`licensing/contributor-license-agreement.md`](licensing/contributor-license-agreement.md): draft CLA terms for future contributors
- [`licensing/trademark-policy.md`](licensing/trademark-policy.md): Longtail Forge name and brand use rules
- [`licensing/documentation-license.md`](licensing/documentation-license.md): documentation licensing policy
- [`licensing/plugin-sdk-license.md`](licensing/plugin-sdk-license.md): plugin SDK and integration-example policy
- [`licensing/ownership-and-entity-plan.md`](licensing/ownership-and-entity-plan.md): current owner, DBA, and future LLC transfer plan
- [`licensing/third-party-dependencies.md`](licensing/third-party-dependencies.md): dependency and third-party asset intake rules
- [`licensing/source-file-notices.md`](licensing/source-file-notices.md): SPDX and file-header conventions
- [`licensing/repo-integration-checklist.md`](licensing/repo-integration-checklist.md): checklist for applying these docs cleanly across the repo
- `licensing/attorney-review-checklist.md`: legal review checklist before launch/contributors (kept locally; excluded from version control)

## Trademark

"Longtail Forge", "LTF" when used to identify the project, the Longtail Forge logo, and related branding are trademarks or service marks of Michael York d/b/a Raymond Tec.

You may use the name to accurately refer to the original project, but you may not use the name, logo, confusingly similar branding, or official trade dress for a competing hosted service, modified distribution, app listing, package, domain, or product without written permission.
