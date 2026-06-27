# Files Strict Guardrail Inventory

Current as of 0.33.5.18.12.5. This is a reporting-only inventory before strict enforcement.

`files.browse` remains a framework-owned reported descriptor surface in this slice. The inventory maps the anatomy that should become fail-on-violation in 0.33.5.18.12.6, but 0.33.5.18.12.5 does not add Files to the strict declarative surface set and does not fail on the remaining direct DOM construction in `public/js/files.js` or `public/js/shared/file-attachments.js`.

## Framework-Owned Candidates To Guard Later

| Candidate anatomy | Current paths | Strict enforcement direction |
| --- | --- | --- |
| Page host and header | `views/protected/files.html`, `files.browse` descriptor, descriptor renderer | The protected page stays a minimal descriptor host. Header, layout, sidebar trigger, main region, and drawer placement should remain framework-owned. |
| Slide-out sidebar and filters | `files.browse.filters`, `createFileFilters()`, `createFilterLabel()`, Client/Project/advanced target controls | The descriptor and shared filter/sidebar helpers should own filter panel anatomy, labels, status placement, and disclosure shells. Files should keep filter values, query payloads, Business-only Client visibility, and readable option hydration. |
| Results list and table shell | `createFilesResultsChrome()`, `createFilesTable()`, `createFileCell()`, `createFileStatusCell()` | Shared list/table/chip/truncation anatomy should own the compact listing frame, status mount, empty state, table wrapper, and status/review chip placement. Files should keep `/api/files/attachments` reads, row shaping, safe labels, and availability values. |
| Dense row actions | `createFileActions()` and per-action builders | Shared dense action placement and action IDs should own repeated-control layout. Files should keep action visibility, route calls, confirmations, download availability, refresh behavior, and focus return. |
| File Context modal placement | `openFileEditor()`, `buildFileEditorDialog()`, `createFileEditorControlsSection()` | Shared modal/form/footer/field-grid helpers should own the dialog shell, footer actions, field grid, stacking, and focus behavior. Files should keep attachment-scoped context loading, target providers, selector rules, save payloads, and read-only metadata values. |
| Preview modal placement | `openFilePreview()`, `buildFilePreviewDialog()`, preview render helpers | Shared modal/action helpers should own the preview dialog shell, footer placement, and status body. Files should keep preview availability/content route calls, safe rendering decisions, unsupported download-only behavior, and error states. |
| Attachment panel shell | `LongtailForge.fileAttachments.mount()`, `render()`, `createAttachmentPanelShell()`, `attachmentList()`, `attachmentItem()` | Shared panel/list/empty/status/chip helpers should own reusable attachment panel anatomy near the owning record. Files should keep attachment reads, host callbacks, events, action visibility, and recovery-state meaning. |
| Upload and dropzone shell | `uploadControls()`, `createUploadShell()`, `uploadResultList()` | Shared upload/status/result placement should own the shell. Files should keep file reading, accepted categories, base64 payloads, target context, visibility, and `/api/files/batch` calls. |
| Empty and status states | Files browse status helpers and attachment helper status/empty helpers | Shared empty/status anatomy should own accessible live regions and placement. Files should keep state text, counts, error wording, and recovery-safe language. |
| Modal and overlay stacking | Files File Context, Files Preview, and host module Files utility dialogs | Shared modal stack helpers should own overlay placement and focus return. Files and host modules should keep utility mounting, save-first states, route behavior, and refresh callbacks. |

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
| Deleted, unavailable, and in-review recovery states | `attachmentRecoveryMessage()`, browse status/review chips, restore availability | Recovery and review states are file lifecycle meaning and must stay close to Files behavior instead of becoming generic layout state. |
| File Context modal opener | `LongtailForge.filesDialog.openFileEditor()` | File Context is an already-shipped attachment-scoped Files workflow. It may use shared modal anatomy, but Files owns target loading, context save, route errors, and row-open behavior. |
| Preview modal opener | `LongtailForge.filesDialog.openFilePreview()` | Preview is an already-shipped attachment-scoped Files workflow. It may use shared modal anatomy, but Files owns descriptor/content route calls, preview kind handling, and download-only states. |

## Forbidden In Future Strict Enforcement

Future Files strict guardrails should fail reintroduced browse behavior that turns Files into a document manager or detail dashboard:

- Persistent inline Browse Summary panels.
- Selected-file detail headers or selected-row page state.
- Inline Preview panes in the browse page.
- Inline Metadata panels in the browse page.
- Inspector-style browse behavior.
- Browser UI that exposes protected paths, storage keys, signed URLs, file hashes, scanner internals, raw filesystem data, secure-note internals, or unreadable target labels.
- Raw IDs as visible labels when safe readable labels or unavailable states can be shown.
- Filename rename, binary replacement, storage move, provider/key editing, hard purge, permanent delete, scan/quarantine metadata editing, or raw storage controls without explicit Files service routes, permissions, audit behavior, and regressions.
- Direct static downloads or route bypasses outside authenticated Files routes.

## Reporting Coverage In 0.33.5.18.12.5

`scripts/files-strict-guardrail-inventory-regression.mjs` proves this inventory exists, `files.browse` remains reported rather than strict, the current Files browse and attachment helper paths still use the shared helpers already adopted in 0.33.5.18.11 and 0.33.5.18.12, and the forbidden inline browse patterns remain absent.

The regression intentionally reports the remaining direct DOM construction count instead of failing it. The 0.33.5.18.12.6 enforcement slice may turn the mapped framework-owned candidates into fail-on-violation checks once the remaining helper-backed reductions have shipped.
