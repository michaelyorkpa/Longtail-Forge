Time Tracking is a first-party Longtail Forge module. Use Time Tracker for active timers and Manual Entry or Time Entries when entering or editing completed work. Active timers are stored for the current user and workspace so they can be restored after reloads.

Only one timer runs at a time for a user in a workspace. Starting or resuming a timer pauses other running timers for that same user and workspace.

After a manual timer is running, you can select an active task from the same Project and choose **Link Task**. The timer keeps running with its existing elapsed time and becomes that task's Task Timer. Paused timers cannot be linked; resume the timer first. After linking, continue managing it from Workbench, Tasks, or the Task editor.

When a timer is saved, the completed entry keeps the first timer start and final save time as factual timestamps. The saved duration uses accumulated active seconds, so paused time does not inflate billing or reporting totals. Workspace administrators with time-entry edit access can correct workspace entries in scope, and those corrections are audited.

Business workspaces can mark timers and time entries Billable. Personal and Family workspaces do not show that flag; their timers and entries are always treated as non-billable.

Reporting lists the reports available for the current workspace and your access. Choose **Project Time & Billing** when it is available, then filter by billing period, reporting scope, Projects, Tags, and whether descendant Projects are included. The Tags filter lets you type to search and select a tag, including the shared All tags and No Tags choices. Custom billing periods show Start Date and End Date controls. Billing dates and Dashboard effort days use the timezone selected in User Settings, including daylight-saving transitions. Parent Project rows can expand to show child Projects; the footer totals count each branch once even when child rows are visible.

The Reporting menu lists only reports currently available to you. If Time Tracking is disabled or your access does not allow its report, **Project Time & Billing** is not shown; unavailable report names and controls are not displayed.
