# Editable Content Safety

This document inventories the ordinary application contracts that keep visitor-authored content inert when another role reads it. The exact public demo uses these same contracts; it does not have a demo-only renderer or sanitizer.

## Reviewed content surfaces

| Content class | Representative editable fields | Cross-role read path | Required rendering contract |
| --- | --- | --- | --- |
| Plain text | Task title and description; List title, description, and item name; Note title; Client and Project names and descriptions | Owning service permission checks, JSON transport, then module browser views | Insert as text with DOM `textContent`, form values, or equivalent escaped template output. Source-looking HTML stays visible text and never becomes markup. |
| Markdown | Note `body_markdown` / `bodyMarkdown`; Markdown attachment preview content | Notes detail and draft-preview services; Files attachment preview service | Store Markdown source, validate module rules, and render on the server through `src/core/markdown/markdown.service.js`. Raw HTML stays disabled. Browser HTML sinks may consume only the resulting explicitly named safe-HTML fields. |
| Rich-content budget class | Markdown plus body-, content-, description-, HTML-, and text-named JSON fields | Public-demo request admission before module service work | The class is a size-policy category, not permission to accept raw HTML. Notes snake-case and camel-case body fields receive the 32 KiB rich-content ceiling; ordinary fields retain the 8 KiB ceiling. |

Longtail Forge does not currently expose an independent arbitrary-HTML or WYSIWYG record field. Adding one would require a separately reviewed storage, sanitization, permission, and rendering contract.

## Safety layers

- Module services and repositories remain authoritative for workspace, Client, Project, record, and role access. A renderer never broadens visibility.
- Plain-text surfaces keep submitted strings as data. Markup-looking Task, List, item, and title values are returned literally and inserted with text-only DOM APIs.
- Notes rejects script-capable elements, event-handler attributes, and scriptable URL schemes before persistence or preview. Validation failures use a fixed safe 400 response and do not reflect submitted content.
- The framework Markdown service runs Markdown-it with raw HTML and automatic linkification disabled. It permits `http:`, `https:`, `mailto:`, normal root-relative paths, `./`, `../`, and same-document hashes. Protocol-relative (`//host`) and slash-backslash network paths are unsafe and render without an active destination.
- Notes saved reads and preview responses, plus Files Markdown previews, are the reviewed user-content HTML consumers. Their browser `innerHTML` assignments accept only server-rendered safe HTML. Other current `innerHTML` uses either clear a control or install repository-owned static dialog markup.
- The transport policy keeps `script-src 'self'`, `script-src-attr 'none'`, `object-src 'none'`, and `frame-src 'none'` as defense in depth. CSP does not replace output safety.
- Public-demo input admission limits ordinary strings to 8 KiB, rich-content fields to 32 KiB, arrays to 50 items, objects to 100 fields, nesting to eight levels, and payloads to 2,000 nodes. Oversize errors use fixed messages and never echo visitor content.

`framework.public-demo-cross-role-content-safety` freezes the intentional browser HTML-sink inventory and proves a Workspace Administrator writer to Project Administrator reader journey across Tasks, Lists, and Notes. It covers stored markup-shaped plain text, safe and dangerous links, malformed raw HTML, exact and oversized rich-content boundaries, safe error output, CSP directives, and SQLite integrity. `scripts/markdown-renderer-service-regression.mjs` separately pins the shared URL policy.

## Contribution guardrail

Before adding an editable field or renderer:

1. Declare the stored source format, owning validator, maximum input size, permission-scoped writer and reader roles, and browser output sink.
2. Default to plain text and `textContent`. Never place an API string directly into `innerHTML`, `outerHTML`, `insertAdjacentHTML`, or `document.write`.
3. For Markdown, use the framework Markdown service. Keep raw HTML disabled and add new URL schemes only after an explicit security review and focused regression.
4. Add a browser HTML sink only for an explicitly named server-rendered safe-HTML field. Update the frozen sink inventory and prove stored and reflected hostile inputs through ordinary routes or services.
5. Keep validation errors fixed and non-reflective. A rejected visitor payload must not appear in the response body, logs, audit metadata, or operational evidence.
6. Re-run the cross-role safety regression after changing editable fields, Markdown handling, preview output, CSP directives, browser HTML sinks, or public-demo content limits.

This inventory is a development guardrail, not a claim that hourly reset makes unsafe content acceptable. Content must remain inert before, during, and after every reset.
