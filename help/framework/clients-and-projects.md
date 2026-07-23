Clients and projects organize work, billing context, reporting, tasks, and time entries. Business workspaces can use both clients and projects, while some workspace types may use project-only workflows.

The client list includes hierarchy filters for all clients, top-level clients, child clients, and clients with children. Client hierarchy behavior stays owned by the Clients and Projects module, so the list uses module-provided options instead of hard-coded workspace labels.

Client and project lists show child records with a preceding hyphen and place tag chips directly beneath the record name. In Projects, choose the workspace-named option in the Client filter to see only projects that are not assigned to a client.

The Project list's Client column and Client filter are available only in Business workspaces. Personal and Family workspaces show project-only list context without Client fields.

Client edit actions live in the edit modal footer. Save Client saves the active client editor, Edit Projects opens project management for that client, and Close leaves the editor without changing saved values.

When adding a Project in a Business workspace, the Client choice starts with the readable workspace name for a workspace-level Project. Workspace-level Projects start non-billable. Add Client opens the Client form over the still-open Project form; after saving, the new Client is selected in the Project form so work can continue without rebuilding context.

Edit Project uses a wide form with Status and Parent Project in separate rows, plus Client in Business workspaces. Add Project likewise offers Client only in Business workspaces. Project Tags and Project Defaults remain in that same editor; Project Defaults contains the Task module settings followed by Task Reminder Defaults and Rounding. Business workspaces keep Project Billing Settings for billable fields; Personal and Family workspaces do not show an empty billing disclosure.

Client and project records are archived by setting them inactive instead of deleting them. Historical time entries and related records keep their stable IDs.

Business project settings can include billing defaults and task defaults. Personal and Family projects omit the Billable flag and use project-only work context. New Client-backed records may inherit available defaults when created, while workspace-level Projects start non-billable and saved records keep their own stored values.
