Clients and projects organize work, billing context, reporting, tasks, and time entries. Business workspaces can use both clients and projects, while some workspace types may use project-only workflows.

The client list includes hierarchy filters for all clients, top-level clients, child clients, and clients with children. Client hierarchy behavior stays owned by the Clients and Projects module, so the list uses module-provided options instead of hard-coded workspace labels.

Add Client creates a top-level Client and appears only when you can manage
Clients across the workspace. If you are a Client Administrator, use Add Child
Client on a Client you administer. The child form identifies and locks that
Client as the parent; you cannot use it to create a top-level Client or choose a
different parent.

Client and project lists show child records with a preceding hyphen and place tag chips directly beneath the record name. In Projects, choose the workspace-named option in the Client filter to see only projects that are not assigned to a client.

Client Administrators can open Clients and Projects from **Settings → Admin**,
but each list contains only records inside their administered Client scope.
Project Administrators can open Projects and see only assigned Project scope;
they do not receive the Clients link. Add, Edit, related-record, Client
assignment, and Project move choices appear only when that action and target
are available in the current scope.

The Project list's Client column and Client filter are available only in Business workspaces. Personal and Family workspaces show project-only list context without Client fields.

Client edit actions live in the edit modal footer. Save Client saves the active client editor, Edit Projects opens project management for that client, and Close leaves the editor without changing saved values.

When adding a Project in a Business workspace, the Client choice contains only
authorized creation targets. Workspace Administrators may choose the readable
workspace name for a workspace-level Project; scoped Client Administrators
start from an administered Client and do not receive workspace or other-Client
targets. Workspace-level Projects start non-billable. When top-level Client
creation is available, Add Client opens the Client form over the still-open
Project form; after saving, the new Client is selected in the Project form so
work can continue without rebuilding context.

Edit Project uses a wide form with Status and Parent Project in separate rows, plus Client in Business workspaces. Add Project likewise offers Client only in Business workspaces. Project Tags and Project Defaults remain in that same editor; Project Defaults contains the Task module settings followed by Task Reminder Defaults and Rounding. Business workspaces keep Project Billing Settings for billable fields; Personal and Family workspaces do not show an empty billing disclosure.

Client and project records are archived by setting them inactive instead of deleting them. Historical time entries and related records keep their stable IDs.

Business project settings can include billing defaults and task defaults. Personal and Family projects omit the Billable flag and use project-only work context. New Client-backed records may inherit available defaults when created, while workspace-level Projects start non-billable and saved records keep their own stored values.
