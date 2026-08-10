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

Support Tickets, Knowledge Base, and Creator Studio are committed first-party modules in the public Longtail Forge core when completed. The private commercial/hosted boundary does not reclassify those roadmap modules as proprietary plugins; it covers separately designated commercial additions and managed operations.
| Longtail Forge name, logos, marks, trade dress, icons, and official branding | Trademark rights reserved | No trademark license is granted by the software license. See [`trademark-policy.md`](licensing/trademark-policy.md). |
| Third-party contributions | Not accepted for non-trivial code until a CLA process is active | See [`contributor-policy.md`](licensing/contributor-policy.md) and [`contributor-license-agreement.md`](licensing/contributor-license-agreement.md). |

## Practical Summary

You may use, study, modify, and self-host Longtail Forge under the terms of the AGPL-3.0-only license.

If you modify Longtail Forge and make the modified app available to users over a network, you are responsible for complying with the AGPL's source-code availability requirements for that modified version.

Commercial use of the AGPL version is allowed, subject to the AGPL. Separate commercial licenses, hosted services, support plans, managed deployments, and proprietary first-party plugins may be offered by Michael York d/b/a Raymond Tec or a successor entity.

## Current Repository Status

The current licensing state is complete for ordinary private development:

- Longtail Forge Core and the root package metadata use `AGPL-3.0-only`; the full license text is in the root [`LICENSE`](../LICENSE) file.
- The commercial/hosted/private-tooling boundary remains separate from the public core license.
- The [trademark policy](licensing/trademark-policy.md) governs use of the Longtail Forge name and branding.
- The reviewed root [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) covers
  the production dependency closure and bundled Lucide-derived icon subset.
  `npm run third-party-notices:check` rejects lockfile, license-text, or
  bundled-asset inventory drift.
- Non-trivial outside code contributions are not currently being accepted. The existing contributor policy and agreement are planning documents, not an active public contribution process.

Missing future publication or contribution artifacts do not mean the current license is broken, and they do not block ordinary private feature slices.

## Future Process Gates

These gates activate only when their trigger is intentionally reached:

| Gate | Status | Trigger | Required before activation |
| --- | --- | --- | --- |
| Public contribution acceptance | Inactive | The project begins accepting non-trivial outside code contributions | Add `CONTRIBUTING.md`, add a pull-request template, activate the CLA workflow, and link those instructions to the contributor policy. Do not add public-contributor language before that decision. |
| Public app legal/about notice | Active and satisfied | Public-release preparation began in 0.33.25.2 | Maintain the framework Help legal/about surface with live runtime version identity, version-accurate Corresponding Source and tracked policy links, AGPL warranty language, and notices hydrated from the root `THIRD_PARTY_NOTICES.md`. |
| Public Terms and Privacy surfaces | Active with neutral operator templates | A hosted instance is exposed to users | Maintain session-less footer-linked pages and neutral downstream-safe defaults. Each hosted operator owns accurate installation-specific content. Before first-party public analytics, feedback, or interest capture is enabled, 0.33.33 must record the review path appropriate to the actual launch scope, including whether professional legal review is warranted. |
| Third-party notices | Active and satisfied | A public release is prepared or dependency/asset notice requirements change | Maintain the reviewed root `THIRD_PARTY_NOTICES.md`; regenerate and hand-review it whenever the production dependency or bundled-asset inventory changes. |

Run `npm run licensing:gates` to see the current gate readout. It confirms the
active in-app legal/about and third-party-notices surfaces and reports future
public-contribution artifacts as warnings. The command remains warning-only for
ordinary private development; `npm run third-party-notices:check` is the
standalone hard drift check.

The public footer states `AGPL-3.0-only` and links Corresponding Source for the
exact running commit or canonical release tag using the operator-configured
source template. Terms and Privacy are public without a session, but the
bundled documents are deliberately neutral templates. Do not relabel those
templates as Raymond Tec terms, commit customer- or host-specific legal text,
or treat the technical surface as evidence of legal approval. Longtail Forge
does not claim professional legal review occurred in 0.33.25; that review-path
decision is deferred to the 0.33.33 public-demo privacy gate.

### Private repository boundary

Keep SaaS billing, tenant provisioning, hosted backups, production monitoring, customer admin tooling, managed deployment automation, paid first-party plugins, and customer-specific commercial license templates out of the public core repository unless the project intentionally changes that boundary.

### Maintenance rule

Do not rewrite licensing policy during unrelated feature slices. Update these documents only for an intentional legal/policy change, a dependency or bundled-asset notice change, a public-release publication gate, or activation of the outside-contributor process. Private SaaS/commercial templates do not belong in this public repository.

## Licensing Documents

- [`licensing/README.md`](licensing/README.md): index of the licensing directory
- [`licensing/software-license.md`](licensing/software-license.md): core software license policy
- [`licensing/commercial-licensing.md`](licensing/commercial-licensing.md): commercial licensing and paid-product policy
- [`licensing/commercial-viability-plan.md`](licensing/commercial-viability-plan.md): commercial moat, release lanes, and budget-aware viability plan
- [`licensing/contributor-policy.md`](licensing/contributor-policy.md): contribution intake rules
- [`licensing/contributor-license-agreement.md`](licensing/contributor-license-agreement.md): CLA terms for future contributors
- [`licensing/trademark-policy.md`](licensing/trademark-policy.md): Longtail Forge name and brand use rules
- [`licensing/documentation-license.md`](licensing/documentation-license.md): documentation licensing policy
- [`licensing/plugin-sdk-license.md`](licensing/plugin-sdk-license.md): plugin SDK and integration-example policy
- [`licensing/ownership-and-entity-plan.md`](licensing/ownership-and-entity-plan.md): current owner, DBA, and future LLC transfer plan
- [`licensing/third-party-dependencies.md`](licensing/third-party-dependencies.md): dependency and third-party asset intake rules
- [`licensing/source-file-notices.md`](licensing/source-file-notices.md): SPDX and file-header conventions
- [`licensing/repo-integration-checklist.md`](licensing/repo-integration-checklist.md): checklist for applying these docs cleanly across the repo

## Trademark

"Longtail Forge", "LTF" when used to identify the project, the Longtail Forge logo, and related branding are trademarks or service marks of Michael York d/b/a Raymond Tec.

You may use the name to accurately refer to the original project, but you may not use the name, logo, confusingly similar branding, or official trade dress for a competing hosted service, modified distribution, app listing, package, domain, or product without written permission.
