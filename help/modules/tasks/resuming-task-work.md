Tasks are commitments and outcomes. A task can carry a next action, blocked reason, resume note, due date and time, assignees, tags, files, checklist progress, parent/child relationships, recurrence, reminders, and timer state.

Use Next action for the immediate step, Blocked reason when work cannot continue, and Resume note for where the work paused. In the task dialog, Next Action and Resume Note appear together, while Blocked Reason appears only when the task is blocked. Checklists keep lightweight progress inside the task and start collapsed unless the task already has checklist items. Parent/child task links can show when incomplete child work is blocking a parent task. Completed and archived tasks remain readable history and are not treated as active resume candidates by default.

Completed tasks can show a compact `TTC:` duration chip after the completed task has saved completion metadata. Selecting a completed status before saving does not create the duration chip by itself.

Tasks expose this context through task reads, summaries, Workbench task items, search, audit, and internal task event metadata. Resume-state rows use the task's safe context fields and read checks so completed, archived, inaccessible, or hidden task records do not appear as active work to resume.
