# Action Catalog

Use this catalog when you know the action you need but not where Longtail Forge puts it. Actions appear only when the active workspace, enabled modules, and your permissions allow them.

## App shell and Quick Actions

Open **Actions** in the app shell to reach Time Keeping, Tasks, Calendar, Notes, Lists, Files, and Reporting when those areas are available. Open **Settings** for User settings, Help, workspace administration, module administration, API keys, and Audit Log.

The **Quick Actions** launcher shows the currently available subset of these registered actions:

| Action | Intent | Location |
| --- | --- | --- |
| Timer | Start a manual timer without leaving the current work context. | Quick Actions; also Time Keeping and Workbench. |
| Task | Capture a task. | Quick Actions; also Tasks **Add Task** and Workbench **Add Task**. |
| Note | Capture a working note. | Quick Actions; also Notes **Create Note**. |
| List | Create an operational list. | Quick Actions; also Lists **Create List**. |
| File | Open the workspace file listing. | Quick Actions. This is currently a link to Files, where uploads stay attached to their owning record. |
| Reporting | Open available reports. | Quick Actions when at least one report is available. |
| Search | Find visible records and Help articles. | Quick Actions when searchable sources are available; also the app-shell Search control. |

**Add Time Entry**, **Add Client**, and **Add Project** are registered workflow actions, but they are not Quick Actions. Use **Time Keeping → Time Entries**, **Projects**, or a client/project context card.

## Dashboard and Workbench

| Action | Intent | Location |
| --- | --- | --- |
| Open Workbench | Move from overview to startable or resumable work. | Dashboard header, setup, and attention cards. |
| Manage Modules | Enable or configure workflow areas. | Dashboard setup card; Settings → Admin → Modules. |
| Open Notifications | Review attention and follow-up events. | Dashboard attention area; notification bell. |
| Open Settings | Resolve workspace setup warnings. | Dashboard workspace-pulse warning. |
| Change Focus | Choose recovery, due work, this week, blocked work, or a project focus. | Workbench header. |
| Open Inspector / Close Inspector | Review the selected work item’s supporting context. | Workbench. |
| Previous / Next | Move among recommended next actions. | Workbench recommendation card. |
| Resume task / Edit task / Complete task / Block task | Act on the focused task without rebuilding its context. | Workbench Task Focus. |
| Start / Pause / Save Time / Reset | Control the focused task timer. | Workbench Task Focus. |
| Choose a project / Add Task / Adjust focus | Recover when the current focus has no useful recommendation. | Workbench recovery state. |

Module-owned Workbench actions are documented in the active module’s action reference.

## Clients and Projects

| Action | Intent | Location |
| --- | --- | --- |
| Add Client | Create business client context. | Projects page and eligible client context cards. |
| Edit Client | Change the selected client, its hierarchy, or permitted context. | Client row or client context card. |
| Add Project | Create a workspace or client project. | Projects page and eligible client context cards. |
| Edit Project | Change project details, billing context, task defaults, or permitted links. | Project row or project context card. |
| Bulk Changes | Apply the offered status, assignment, context, or tag change to selected clients or projects. | Projects selection controls. |
| Edit Permissions | Review a workspace member’s client/project operation overrides. | Workspace Settings people list. |

Client and project visibility remains permission-scoped. See **Clients and Projects** and **Users, Roles, and Permissions** for the underlying rules.

## Files and attachments

| Action | Intent | Location |
| --- | --- | --- |
| Upload / Attach Files | Add source material to the record that owns it. | A supported task, note, list, client, project, or other owning-record dialog. |
| Edit File Context | Update allowed Target, Project, or Business Client context. | Click a Files row or use its context action. |
| Preview | View a supported image, text, Markdown, or PDF without exposing storage details. | Files row or File Context dialog. |
| Download | Retrieve the file through its permission-checked route. | Files row or attachment panel. |
| Report | Flag an available file for review. | Files row. |
| Review | Mark an eligible quarantined file reviewed. | Files row or File Context dialog. |
| Delete / Restore | Move an attachment through its supported lifecycle. | Files row or owning attachment panel. |
| Save File Context / Close File Context | Save permitted context changes or leave without changing them. | File Context dialog. |
| Filter / page | Narrow by status, module, context, client, project, or date and move through results. | Files slide-out sidebar and listing controls. |

## Search, notifications, tags, and reporting

| Action | Intent | Location |
| --- | --- | --- |
| Search / filter sources | Find permission-visible records or Help and narrow the result set. | Search. |
| Open result | Route to the registered view/edit action for a task, time entry, client, project, note, list, file, or Help article. | Search result. |
| Mark read / unread, Dismiss | Manage one notification’s attention state. | Notifications row. |
| Mark all read | Clear unread attention for the current workspace. | Notifications. |
| Previous / Next | Page through notifications or search results. | The relevant result list. |
| Create / Edit / Archive tag | Manage workspace classifications. | Settings → Admin → Tags. |
| Assign / remove tags | Classify a supported record without changing access. | The record’s Tags control or eligible bulk action. |
| Run report | Apply the report’s date, scope, project, and tag inputs. | Reporting. |
| Export | Download the report output in an offered format. | A completed report result. |

## Settings actions

Use **Administration and Settings** for the complete settings route map. Destructive actions such as deleting an account, removing workspace access, scheduling workspace deletion, revoking a session or calendar subscription, and disabling a module appear only with their confirmation and permission checks.

