# Workbench Focus and Recovery

Workbench focus choices do not create a new status or change a record just because it is recommended. They apply server-owned filters and ordering to work you can already read, then present a small candidate set.

## Focus choices

| Choice | What it surfaces | Choose it when… |
| --- | --- | --- |
| Pick up where I left off | Saved resume state first, with live timers retained and ranked recent work as fallback. | You were interrupted or remember the thread but not the next screen. |
| Start with what’s due | Overdue work and work due through the current week, ordered by due context. | You want the most time-sensitive commitment first. |
| Work this week | Overdue work and work due through the current week. | You are planning within this week’s boundary rather than recovering a particular thread. |
| Review blocked work | Blocked work only. | You want to remove blockers, update a blocked reason, or resume something that can move again. |
| Focus on a project | Work narrowed to one selected Project. | You want to stay inside one project context. |

Business workspaces can also narrow choices by Client. A Project selection narrows any focus result further; **Focus on a project** requires one. Personal and Family workspaces remain Client-free.

Workspace administrators can open **Settings → Admin → Modules → Workbench** to choose the bounded candidate groups used by configurable ranking and select **Balanced**, **Recently touched first**, or **Stale recovery first** priority. Running timers remain first, followed by paused timers. These settings change ordering and eligibility groups, not permissions or record state.

## Recommendations and Inspector context

Workbench displays at most a small recommendation set rather than every possible record. **Previous** and **Next** cycle through it. The recommendation explains its source and opens through the owning module’s registered action.

The Inspector shows a bounded set of related readable context. Hidden, inactive, disabled-module, or inaccessible records are excluded or shown only through a safe unavailable state. Inspector content never grants access to its source record.

## Resume state and task handoffs

Resume state is a pointer to readable work context, not a duplicate record. The owning Task, Note, List, timer, or other source remains canonical. Completed, archived, deleted, inaccessible, or disabled-module sources are removed from active recovery results.

Tasks add an explicit handoff:

- **Next action** states the immediate step.
- **Resume note** records where the focus session paused.
- **Blocked reason** explains why work cannot proceed.

Entering a readable active Task Focus consumes its saved Resume note so a later focus session can record a fresh handoff; this does not change the Task status. Leaving eligible Open or In Progress Task Focus can offer **Add resume note?**. Choosing Yes saves one line and marks eligible Open work In Progress. Choosing No continues without a write. Blocked work does not ask for a Resume note because its Blocked reason already carries the recovery context.

If a refresh or hard exit prevents the prompt, Workbench can offer the pending handoff once on return after rechecking that the Task is still readable, active, and unblocked. Pausing or saving a Task timer can offer the same handoff after the timer action finishes.

See [Resuming Task Work](/help.html?article=tasks-resume-context) for Task lifecycle details and [Dashboard and Workbench](/help.html?article=dashboard-and-workbench) for surface ownership.

