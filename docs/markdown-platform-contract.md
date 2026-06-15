# Markdown Platform Contract

This document describes the Markdown rendering contract selected in 0.33.5.17.1. It is a developer handoff for the framework-owned Markdown service planned for 0.33.5.17.2 and later slices. It does not change stored Markdown, database schema, module visibility, Help routing, or module permissions.

## Parser Selection

Longtail Forge will adopt `markdown-it` as the platform Markdown parser.

Selection rationale:

- It supports CommonMark mode and is configurable enough to keep Longtail Forge on a small approved syntax set.
- It can run on the server and in browser preview paths if a later slice chooses shared client-side preview code.
- Raw HTML is disabled by default and must remain disabled for Notes, Help-authored Markdown, future Knowledge Base Markdown, and other user-authored Markdown unless a later security-reviewed allowlist changes that policy.
- It is MIT licensed and maintained as an established JavaScript Markdown parser.

Reviewed but not selected:

- `marked`: fast and mature, but its own documentation requires an external sanitizer for output HTML. Longtail Forge still needs sanitization, but this makes it a less direct fit for a safety-first platform contract.
- `micromark`: CommonMark-focused and safe, but lower-level. It is a better fit for custom token/AST pipelines than for this first shared render/plain-text service.

The dependency should be added in 0.33.5.17.2, not in this contract slice.

## Approved Syntax

The baseline syntax is CommonMark:

- Paragraphs.
- Headings.
- Emphasis and strong text.
- Links.
- Images only where the consuming module or surface explicitly allows images.
- Blockquotes.
- Inline code.
- Fenced code blocks.
- Ordered lists.
- Unordered lists.
- Nested ordered and unordered lists.

Approved extensions:

- Tables.
- Task lists.

Do not enable broad extension bundles by default. Strikethrough, typographer replacements, automatic URL linking, footnotes, definition lists, emoji, math, custom containers, and similar extensions remain out of scope until a later version explicitly approves and tests them.

## Disallowed Behavior

The Markdown platform must reject, strip, or neutralize unsafe output while preserving the saved source text:

- Raw HTML in source Markdown.
- Scriptable links such as `javascript:` and `vbscript:`.
- Event-handler attributes and script-capable elements if unsafe input reaches the sanitizer.
- Unsafe image sources, including `data:` and scriptable sources.
- Renderer-specific rewrites of saved note bodies, Help files, revisions, or future Knowledge Base source snapshots.

Allowed link schemes are `http:`, `https:`, `mailto:`, and safe relative app paths. Hash-only links may be allowed for same-document navigation. Other schemes require explicit review before use.

## Framework APIs

The framework-owned Markdown service should expose these capabilities:

- Render Markdown to safe HTML.
- Convert Markdown to plain text for search, excerpts, previews, and fixture assertions.
- Validate or normalize safe links for output without changing saved source text.
- Expose deterministic fixture-based expectations for supported syntax and unsafe input.

The service should be module-agnostic. It must not know Notes visibility rules, Help article routing, Knowledge Base publication state, workspace module status, or record permissions.

## Module Responsibilities

Notes owns:

- Note body storage.
- Revisions.
- Library and collection visibility.
- Wiki-style links.
- Linked context.
- Note-specific permissions.
- Secure-note body access and safe placeholder behavior.

Help owns:

- Content discovery.
- Framework/module article ownership.
- Module scoping.
- Article metadata.
- Help routes and navigation.

Future Knowledge Base owns:

- Publication status.
- Review workflow.
- Source snapshots.
- Article visibility.
- Knowledge Base-specific routing and permissions.

Modules may request rendered HTML or plain text from the framework service, but they remain responsible for source fields, workflow meaning, access checks, and record lifecycle behavior.

## Current Replacement Targets

The first migration targets are the current hand-rolled Markdown paths:

- `src/modules/notes/markdown.js`: migrated in 0.33.5.17.3 to use the shared framework service for rendering, excerpts, normalization, and plain-text extraction while keeping Notes-specific safety checks and wiki-link behavior.
- `src/services/help.service.js`: migrated in 0.33.5.17.4 to use the shared framework service for rendered Help article HTML and search/plain-text extraction while preserving Help-owned discovery, scoping, article metadata, routes, and navigation.
- `public/js/shared/notes-editor.js`: browser authoring helpers and preview parity once preview rendering is implemented.

0.33.5.17.1 defines the contract only. 0.33.5.17.2 adds the dependency and service in `src/core/markdown/markdown.service.js`. 0.33.5.17.3 migrates Notes server-side rendering and text extraction without changing saved Markdown. 0.33.5.17.4 migrates Help rendered article HTML and Help search text extraction without changing Markdown source files. Later slices should migrate browser preview behavior without changing saved Markdown.
