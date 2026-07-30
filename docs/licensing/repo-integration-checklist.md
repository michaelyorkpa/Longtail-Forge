# Repository Integration Checklist

Use this checklist when applying the licensing docs to the repo.

Current process-gate status is maintained in the [repo-level licensing hub](../licensing.md#future-process-gates). The third-party-notices gate is active and satisfied; the public legal/about and outside-contribution gates remain inactive. Run `npm run licensing:gates` for the warning-only aggregate readout and `npm run third-party-notices:check` for the hard inventory drift check.

## Repository Layout

The licensing documents live at these paths:

```text
docs/licensing.md
docs/licensing/
```

`docs/licensing.md` is the repo-level hub; `docs/licensing/` holds the detailed policy documents indexed by [`README.md`](README.md).

## Align README

Update the README license section so it says:

```text
Longtail Forge is licensed under the GNU Affero General Public License v3.0 only.
```

Avoid "or later" unless the Project Owner intentionally chooses `AGPL-3.0-or-later`.

Suggested README text:

```md
## License

Longtail Forge Core is licensed under the GNU Affero General Public License v3.0 only (`AGPL-3.0-only`).

You may use, study, modify, and self-host Longtail Forge under the terms of the AGPL. If you modify Longtail Forge and make it available to users over a network, you are responsible for complying with the AGPL's source-code availability requirements for that modified version.

Commercial licensing, managed hosting, official SaaS, support plans, private deployment tooling, and first-party commercial plugins may be offered separately by Michael York d/b/a Raymond Tec or a successor entity.

See [docs/licensing.md](docs/licensing.md).
```

## Root LICENSE

The root `LICENSE` file may remain the standard AGPL v3 text.

The project-level notices and SPDX identifiers should make clear that the project chooses `AGPL-3.0-only`, not `AGPL-3.0-or-later`.

## Package Metadata

Consider adding or updating `package.json`:

```json
{
  "license": "AGPL-3.0-only"
}
```

If the package remains `"private": true`, this is still useful for scanners and future audits.

## Source Headers

Start using SPDX headers for new files:

```js
// SPDX-FileCopyrightText: 2026 Michael York d/b/a Raymond Tec
// SPDX-License-Identifier: AGPL-3.0-only
```

Do not mass-edit generated, vendored, lockfile, or third-party files without review.

## Contribution Gate

Before accepting outside code:

- add `CONTRIBUTING.md` language pointing to `docs/licensing/contributor-policy.md`;
- activate a CLA process or manually collect signed CLAs;
- store CLA records privately;
- add PR template language warning that non-trivial contributions require a CLA.

## Trademark Notices

Add a short trademark notice anywhere public users are likely to check:

- README;
- docs licensing hub;
- website footer;
- app "About" screen;
- self-hosted admin/about page.

Suggested short notice:

```text
Longtail Forge and related marks are trademarks or service marks of Michael York d/b/a Raymond Tec. Use of the name and marks is governed by docs/licensing/trademark-policy.md.
```

## App Legal Notices (Public-Release Gate)

Before public release, consider adding an in-app legal/about screen containing:

- project name and version;
- copyright notice;
- AGPL license notice;
- link to source repository;
- no warranty notice;
- third-party notices link;
- trademark notice.

## Third-Party Notices (Active Public-Release Gate)

Maintain the reviewed root inventory:

```text
THIRD_PARTY_NOTICES.md
```

It tracks the lockfile-derived production dependency closure and bundled
assets, explicitly including the Lucide-derived icon subset and recording that
the runtime has no bundled fonts or vendored browser libraries. Regenerate with
`npm run third-party-notices:write`, review the diff by hand, and prove it with
`npm run third-party-notices:check`. The runtime artifact must ship both this
root file and `public/icons/LUCIDE-LICENSE.md`.

## Private Repo Boundary

Keep these out of the public repo unless intentionally open-sourced:

- SaaS billing;
- tenant provisioning;
- hosted backups;
- production monitoring;
- customer admin tooling;
- managed-instance deployment automation;
- paid first-party plugins;
- commercial license templates with customer-specific terms.

---

[← Back to the licensing index](README.md)
