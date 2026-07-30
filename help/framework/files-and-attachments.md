Files attach to supported records such as tasks, notes, lists, clients, projects, and time entries through their owning screens. The owning workflow chooses the placement and meaning, while the shared Files helper handles storage, upload, attachment lists, status, permission-checked download, and lifecycle controls.

The Files page under **Actions → Files** is a compact recovery and audit listing for visible workspace attachments. The listing remains the main panel. Use the slide-out filters for module, target, Client, Project, filename, status, and date when you need to find source material without opening every owning record.

Click a file row to open the attachment-scoped **File Context** editor. It can change only the offered Target, Project, and Business Client context; it cannot rename or replace the file, move storage, edit scanner state, or expose storage keys and paths. Use the separate **Preview**, **Download**, **Delete**, **Restore**, **Report**, and permitted quarantine-review controls for their named operations.

Preview opens a modal for supported image, text, Markdown, and PDF content. Unsupported formats remain download-only. The listing does not keep a selected-file dashboard, inline Preview, inline Metadata, or persistent detail panel.

Protected internal files are the default. Downloads go through permission-checked app routes, and public or client-visible file behavior depends on explicit file visibility and permission checks rather than tags.

Uploads use server-side file type checks. In multi-file uploads, accepted files stay attached even when another file in the same selection is rejected. Deleting a file uses an in-app warning and staged deletion: the file becomes unavailable from attachments but remains restorable during the retention window.

Workspace file settings are separate from the listing. Administrators reach the current Files controls through **Settings → Admin → Modules → Files**, where the active file type policy, reserved storage limits, and aggregate storage accounting appear when available.
