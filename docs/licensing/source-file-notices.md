# Source File Notices and SPDX Conventions

## Purpose

Clear file notices reduce ambiguity and make future audits, commercial licensing, contributor review, and entity transfer easier.

## Core Software Files

Use AGPL-3.0-only for public core software files unless a file or directory says otherwise.

Recommended header for JavaScript and TypeScript files:

```js
// SPDX-FileCopyrightText: 2026 Michael York d/b/a Raymond Tec
// SPDX-License-Identifier: AGPL-3.0-only
```

Recommended header for CSS files:

```css
/* SPDX-FileCopyrightText: 2026 Michael York d/b/a Raymond Tec */
/* SPDX-License-Identifier: AGPL-3.0-only */
```

Recommended header for shell scripts:

```sh
# SPDX-FileCopyrightText: 2026 Michael York d/b/a Raymond Tec
# SPDX-License-Identifier: AGPL-3.0-only
```

Do not add headers mechanically to generated files, vendored files, lockfiles, or third-party files unless appropriate.

## Documentation Files

Documentation prose is generally CC BY 4.0 unless a document says otherwise.

Optional Markdown notice:

```md
<!-- SPDX-FileCopyrightText: 2026 Michael York d/b/a Raymond Tec -->
<!-- SPDX-License-Identifier: CC-BY-4.0 -->
```

## Plugin SDK and Integration Example Files

Files intentionally licensed under Apache-2.0 should be clearly marked:

```js
// SPDX-FileCopyrightText: 2026 Michael York d/b/a Raymond Tec
// SPDX-License-Identifier: Apache-2.0
```

A directory-level README should also state that files in that directory are Apache-2.0 unless a specific file says otherwise.

## Proprietary Files

Proprietary files should not normally be committed to the public repository.

If a private repository contains proprietary Longtail Forge hosted-service or commercial plugin code, use notices such as:

```text
SPDX-FileCopyrightText: 2026 Michael York d/b/a Raymond Tec
SPDX-License-Identifier: LicenseRef-Longtail-Forge-Proprietary
```

and include a private license notice defining `LicenseRef-Longtail-Forge-Proprietary`.

## Third-Party Files

Do not change third-party license notices.

Vendored third-party code or assets should retain original copyright and license notices and should be tracked in a third-party notices file.

## Package Metadata

When the public package is not intended for npm publication, `package.json` may remain private. Still, a license field can be useful for tooling:

```json
{
  "license": "AGPL-3.0-only"
}
```

If package-level metadata would conflict with mixed-license SDK directories, use directory-level package metadata or explicit SPDX headers.

## No "Or Later" Unless Intentional

Use:

```text
AGPL-3.0-only
```

Do not use:

```text
AGPL-3.0-or-later
```

unless the Project Owner intentionally decides to permit future AGPL versions for that file.

## Header Rollout Strategy

Do not interrupt feature work to header every file manually.

Recommended rollout:

1. Update README and licensing docs first.
2. Add package metadata where useful.
3. Add SPDX headers to new files.
4. Add headers opportunistically when editing existing files.
5. Use a script later if the repo needs a full SPDX pass.

---

[← Back to the licensing index](README.md)
