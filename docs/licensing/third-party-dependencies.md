# Third-Party Dependencies and Asset Intake Policy

## Purpose

This policy reduces licensing risk from dependencies, snippets, fonts, icons, images, generated assets, templates, and other third-party material.

## General Rule

Do not add third-party material unless the source, license, and compatibility are understood.

Track enough information that the project can later prove what was used, where it came from, and why it was allowed.

## Preferred Dependency Licenses

For runtime and development dependencies, prefer well-known licenses that are generally compatible with the public core's AGPL posture, such as:

- MIT;
- BSD-2-Clause;
- BSD-3-Clause;
- ISC;
- Apache-2.0;
- MPL-2.0, with review;
- LGPL, with review and clear separation.

This is a policy preference, not a legal compatibility guarantee.

## Licenses Requiring Extra Review

Do not add the following without deliberate review:

- GPL-only dependencies;
- AGPL dependencies from third parties;
- LGPL dependencies that may be statically linked, bundled unusually, or modified;
- MPL dependencies that require file-level source availability;
- copyleft fonts or icon packs;
- CC BY-SA assets;
- licenses with advertising clauses;
- custom "source available" licenses;
- Business Source License / BSL;
- Server Side Public License / SSPL;
- Elastic License;
- PolyForm licenses;
- Commons Clause;
- any license restricting commercial use, field of use, hosting, or competition.

## Prohibited or Strongly Discouraged Material

Do not add:

- CC BY-NC material;
- CC BY-ND material;
- "free for personal use" assets;
- assets copied from websites without a clear license;
- Stack Overflow / forum snippets without review;
- customer data;
- private data;
- scraped datasets without permission;
- commercial fonts without a license file and purchase record;
- icons or images from paid packs unless the license permits repository inclusion and redistribution;
- code copied from proprietary products;
- AI-generated material that may be substantially similar to an unlicensed source.

## Fonts

Fonts are legally messy. Before adding a font:

- confirm the font license;
- confirm whether the font may be embedded, redistributed, modified, and used commercially;
- keep the license text;
- keep the source URL or purchase record;
- do not commit paid font files unless the license expressly allows repository redistribution.

Prefer system fonts or clearly licensed open fonts.

## Icons and Images

Before adding icons, logos, screenshots, diagrams, or images:

- confirm license and attribution requirements;
- confirm commercial use rights;
- confirm modification rights;
- confirm redistribution rights;
- keep attribution records;
- avoid assets that conflict with Longtail Forge branding or third-party marks.

The Longtail Forge logo and official marks should be kept separate from general reusable assets.

## AI-Generated Material

AI-generated code, docs, icons, copy, images, and other materials must be reviewed before inclusion.

Review should consider:

- whether the output appears copied from known sources;
- whether it introduces license-incompatible code;
- whether it contains third-party trademarks or recognizable protected elements;
- whether it contains confidential or personal data;
- whether prompts or outputs should be retained for provenance.

## Dependency Records

Before public launch, maintain or generate a dependency/license inventory.

Recommended files or tooling:

- `package-lock.json` or equivalent lockfile;
- `THIRD_PARTY_NOTICES.md`;
- license scanner output;
- dependency review notes for unusual licenses;
- asset attribution records.

## Updating Dependencies

When adding or updating dependencies:

- review the license before merging;
- check whether the package changed license;
- check whether new transitive dependencies were introduced;
- check whether the dependency is maintained;
- check for security advisories when practical;
- avoid replacing simple internal code with risky dependencies.

## Removing Dependencies

When removing dependencies, also remove:

- license notices that no longer apply;
- bundled assets;
- attribution entries;
- unused code imported from the dependency;
- generated files if they include dependency code.

## Contributor Submissions

Contributors must disclose third-party material in their contributions.

The Project Owner may reject contributions that include unclear, incompatible, undocumented, or high-risk third-party material.

---

[← Back to the licensing index](README.md)
