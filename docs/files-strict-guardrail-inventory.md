# Files Strict Guardrail Inventory

Current as of 0.33.5.18.12.7. Files strict enforcement is active and the Files conversion branch is closed.

`files.browse` is now a framework-owned strict descriptor surface. The guardrails fail when the protected Files page, `public/js/files.js`, or framework-owned view portions of `public/js/shared/file-attachments.js` reintroduce hand-built page/filter/table/panel/upload/action anatomy that the descriptor renderer or shared view helpers already own.

`public/js/files.js` now creates browse fragments through shared view helpers instead of direct DOM construction. The shared attachment helper keeps a single centralized native fallback in `createAttachmentElement()` for old/no-view-helper contexts while using shared list, empty-state, action, and button helpers when available. The route-sanitized Markdown preview body is the only allowed `innerHTML` use in Files browser code.

## Framework-Owned Anatomy Strictly Guarded

| Candidate anatomy | Current paths | Strict enforcement contract |
| --- | --- | --- |
| Page host and header | `views/protected/files.html`, `files.browse` descriptor, descriptor renderer | The protected page must stay a minimal descriptor host. Header, layout, sidebar trigger, main region, and drawer placement stay framework-owned. |
| Slide-out sidebar and filters | `files.browse.filters`, `createFilesFilterChrome()`, `createFilterLabel()`, Client/Project/advanced target controls | The descriptor and shared helpers own filter panel anatomy, labels, status placement, and disclosure shells. Files keeps filter values, query payloads, Business-only Client visibility, and readable option hydration. |
| Results list and table shell | `createFilesResultsChrome()`, `createFilesTable()`, `createFileCell()`, `createFileStatusCell()` | Shared list/table/chip/truncation anatomy owns the compact listing frame, status mount, empty state, table wrapper, and status/review chip placement. Files keeps `/api/files/attachments` reads, row shaping, safe labels, and availability values. |
| Dense row actions | `createFileActions()` and per-action builders | Shared dense action placement and action IDs own repeated-control layout. Files keeps action visibility, route calls, confirmations, download availability, refresh behavior, and focus return. |
| File Context modal placement | `openFileEditor()`, `buildFileEditorDialog()`, `createFileEditorControlsSection()` | Shared modal/form/footer/field-grid helpers own the dialog shell, footer actions, field grid, stacking, and focus behavior. Files keeps attachment-scoped context loading, target providers, selector rules, save payloads, and read-only metadata values. |
| Preview modal placement | `openFilePreview()`, `buildFilePreviewDialog()`, preview render helpers | Shared modal/action helpers own the preview dialog shell, footer placement, and status body. Files keeps preview availability/content route calls, safe rendering decisions, unsupported download-only behavior, and error states. |
| Attachment panel shell | `LongtailForge.fileAttachments.mount()`, `render()`, `createAttachmentPanelShell()`, `attachmentList()`, `attachmentItem()` | Shared panel/list/empty/status/chip helpers own reusable attachment panel anatomy near the owning record. Files keeps attachment reads, host callbacks, events, action visibility, and recovery-state meaning. |
| Upload and dropzone shell | `uploadControls()`, `createUploadShell()`, `uploadResultList()` | Shared upload/status/result placement owns the shell. Files keeps file reading, accepted categories, base64 payloads, target context, visibility, and `/api/files/batch` calls. |
| Empty and status states | Files browse status helpers and attachment helper status/empty helpers | Shared empty/status anatomy owns accessible live regions and placement. Files keeps state text, counts, error wording, and recovery-safe language. |
| Modal and overlay stacking | Files File Context, Files Preview, and host module Files utility dialogs | Shared modal stack helpers own overlay placement and focus return. Files and host modules keep utility mounting, save-first states, route behavior, and refresh callbacks. |

## Allowed Files-Owned Escape Hatches

| Escape hatch | Owning paths | Reason |
| --- | --- | --- |
| File reading and upload payloads | `readFileBase64()`, `uploadFiles()`, `acceptedExtensions()`, `acceptedFileHint()` | Browser file reads, base64 payload construction, accepted category mapping, target IDs, visibility, and batch upload payloads are Files service behavior, not framework layout. |
| Attachment reads and host callbacks | `refresh()`, `emit()`, `LongtailForge.fileAttachments.mount()` options | Attachment panels need host refresh callbacks and custom events so owning records can stay in sync without querying Files tables directly. |
| Scan, review, download, and preview availability | `previewAvailabilityForRow()`, `statusLabel()`, `scanStatusLabel()`, download action builders | Files owns availability decisions and language tied to file status, scan/review state, permissions, and unsupported download-only behavior. |
| Files route calls | `/api/files/attachments`, `/api/files/batch`, `/api/files/:fileId/download`, `/api/files/:fileId/report`, `/api/files/:fileId/quarantine`, `/api/files/:fileId/delete`, `/api/files/:fileId/restore`, `/api/files/attachments/:fileAttachmentId/remove`, `/api/files/attachments/:fileAttachmentId/context`, `/api/files/attachments/:fileAttachmentId/preview`, `/api/files/attachments/:fileAttachmentId/preview/content` | Permissions, storage access, lifecycle events, audit behavior, preview content, and mutation rules must remain behind Files routes and services. |
| Confirmations and lifecycle meaning | `reportFile()`, `quarantineFile()`, `deleteFile()`, `restoreFile()` in browse and attachment helpers | Report, Review, Delete, Restore, and Remove Attachment need Files-owned confirmation copy, retention semantics, refresh, and route behavior. |
| Permission-aware visibility | `workspaceHasPermission()`, `canReportFileRow()`, `canQuarantineFileRow()`, attachment action visibility, Business-only Client controls | Files owns permission-shaped action visibility and workspace-specific Client behavior while services remain authoritative. |
| Target metadata and readable labels | `fileRow()`, `formatTargetDisplay()`, `hydrateFileEditorContextControls()`, File Context save payload builders | Files owns readable target/module/client/project labels, internal option values, fallback unavailable states, and attachment-context save payloads. |
| Deleted, unavailable, and in-review recovery states | `attachmentRecoveryMessage()`, browse status/review chips, restore/mark-reviewed availability | Recovery and review states are file lifecycle meaning and must stay close to Files behavior instead of becoming generic layout state. |
| File Context modal opener | `LongtailForge.filesDialog.openFileEditor()` | File Context is an already-shipped attachment-scoped Files workflow. It may use shared modal anatomy, but Files owns target loading, context save, route errors, and row-open behavior. |
| Preview modal opener | `LongtailForge.filesDialog.openFilePreview()` | Preview is an already-shipped attachment-scoped Files workflow. It may use shared modal anatomy, but Files owns descriptor/content route calls, preview kind handling, and download-only states. |

## Forbidden In Strict Enforcement

Files strict guardrails fail reintroduced browse behavior that turns Files into a document manager or detail dashboard:

- Persistent inline Browse Summary panels.
- Selected-file detail headers or selected-row page state.
- Inline Preview panes in the browse page.
- Inline Metadata panels in the browse page.
- Inspector-style browse behavior.
- Browser UI that exposes protected paths, storage keys, signed URLs, file hashes, scanner internals, raw filesystem data, secure-note internals, or unreadable target labels.
- Raw IDs as visible labels when safe readable labels or unavailable states can be shown.
- Filename rename, binary replacement, storage move, provider/key editing, hard purge, permanent delete, scan/quarantine metadata editing, or raw storage controls without explicit Files service routes, permissions, audit behavior, and regressions.
- Direct static downloads or route bypasses outside authenticated Files routes.

## Strict Enforcement Coverage In 0.33.5.18.12.6

`scripts/files-strict-guardrail-inventory-regression.mjs` proves this inventory exists, `files.browse` is strict, the current Files browse and attachment helper paths use the shared helpers adopted in 0.33.5.18.11 and 0.33.5.18.12, and the forbidden inline browse patterns remain absent.

Files strict enforcement now fails if `public/js/files.js` reintroduces direct DOM construction. The attachment helper is allowed one centralized native fallback in `createAttachmentElement()` so converted host modals can still render attachment panels in old/no-helper contexts, but framework-owned panel, upload, list, empty-state, and action anatomy must use shared helpers when they are available.

## Closeout Coverage In 0.33.5.18.12.7

The 0.33.5.18.12.7 closeout keeps this inventory as the Files-specific developer map for the completed conversion. The shipped boundary is compact listing-first browse, slide-out filters, shared upload and attachment panel shells, shared dense action placement, route-backed File Context editing, route-backed Preview, and strict `files.browse` guardrails.

Future Files work should update this inventory before changing the boundary. Inline browse detail, inline Preview, inline Metadata, selected-row state, Inspector behavior, rename/replacement, storage moves, hard purge, permanent delete, raw storage controls, or direct route bypasses remain forbidden unless a later roadmap slice adds explicit Files service routes, permissions, audit behavior, and regressions first.
