# Documentation Ownership and Change Review

`docs/docs-ownership.json` maps source areas to the documentation most likely to own their current contract. It is a review aid, not permission to skip documentation judgment or to update every suggested file.

## Commands

```sh
npm run docs:suggest
npm run docs:check
```

`docs:suggest` inspects tracked and untracked working-tree changes, prints every matched ownership area, and lists the likely documents to review. `docs:check` runs the same inspection in warning-only closeout mode. Unmapped files remain quiet instead of falling back to a broad documentation list.

The warning-only gate reports a mapped source area when none of that area's likely documents changed. It does not fail the command. Review the suggested documents, then record one of these closeout notes in the changelog or delivery summary:

```text
Docs updated: <comma-separated paths>.
No docs change needed: <short reason>.
```

For example: `Docs updated: docs/tasks-module.md, help/framework/tasks-basics.md.`

An explicit no-doc-change note can also be supplied while running the gate:

```sh
npm run docs:check -- --note "No docs change needed: internal refactor preserved the documented contract."
```

## Maintenance Rules

- Update a document when it owns behavior or a contract that changed.
- Do not update several adjacent documents by reflex when their contracts did not change.
- Treat suggestions as likely review targets, not a guarantee that every listed file needs an edit.
- Keep README cursory, Help limited to current shipped behavior, DECISIONS limited to active governing rules, ROADMAP limited to active planning, and CHANGELOG focused on shipped changes.
- Add or refine a mapping when a source area repeatedly needs documentation that the index does not suggest.
- Keep patterns path-based and narrow. Unmapped paths should not create noisy false positives.
- Keep each area's documentation paths sorted and limited to files that already exist.

The ownership index covers Workbench, Dashboard, Tasks, Notes, Lists, Files, Search, Notifications, Tags, Time Tracking, Settings, runtime/trusted-edge security (including `SECURITY.md`, `docs/internet-deployment.md`, and `docs/operational-security.md`), Permissions, the security-event audit stream, Database and whole-instance recovery (including `docs/backup-restore.md`), deterministic development and sanitized demo data, module contracts, view-building/declarative surfaces, Public API, licensing, end-to-end smoke testing, accessibility testing, and the release process (including `docs/runtime-artifact.md` and `docs/preview-deployment.md`).
