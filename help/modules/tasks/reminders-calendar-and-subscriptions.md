# Reminders, Calendar, and Subscriptions

Tasks uses reminders and calendars to recover attention without turning a calendar into a second task editor. The in-app calendar and private calendar subscriptions are read-only views of permission-visible Task timing.

## Reminders

A timed Task can use reminder offsets in hours before its due time. A date-only Task uses offsets in days before its due date. Workspace Tasks settings provide defaults. Business workspaces can refine reminder policy through Client and Project context, and an individual Task can enable **Override reminder defaults** for its own offsets.

When a reminder fires, assigned users receive a high-priority notification. If the Task has no assignee, its creator receives it. Followers are additive. Completed, archived, stale, inaccessible, or no-longer-eligible Tasks do not produce an active reminder.

Reminders are not exact alarm guarantees. They are scheduled through durable background work within a bounded horizon and topped up by a recurring sweep. Notification delivery still respects the active module, current user preferences, membership, and permission checks.

## In-app Calendar

Open **Actions → Calendar** for the full Tasks calendar. It shows due Tasks and reminder markers in Day, Week, or Month presentation. Automatic view uses Day on phone widths and Month on wider screens; a saved Day, Week, or Month preference wins. An explicit Calendar view link takes precedence.

The full Calendar initially includes active Tasks plus completed accomplishment history for the visible date range. Use its status selector to remove Completed or add Archived. Dashboard’s embedded Calendar remains active-only. Month cells show the first three ordered entries and use **View all tasks** to open that date in the full Day view.

Calendar entries open the canonical Task editor. Changing a Task in the editor changes the Task; the calendar itself does not own a second copy.

## Recurring Tasks

The in-app calendar projects recurrence dates without eagerly creating every future Task row. A date with no row appears as **Planned occurrence**. Opening it materializes only that occurrence, replaces the projected entry with the normal Task, and lets that occurrence change independently.

The private calendar feed uses the same recurrence meaning differently: it publishes a native recurring series plus exceptions and cancellations so the calendar client can project dates. Neither representation changes the normal completion-driven recurrence generator.

## Private calendar subscriptions

Workspace Administrators and Super Admins manage named subscriptions at **Settings → Admin → Modules → Calendar**. A subscription is a private bearer credential, not a connected calendar account:

- It is read-only and provider-neutral.
- It supports Workspace scope, readable Project scope, and Business-only readable Client scope.
- It rechecks the owner’s current membership, Tasks availability, target lifecycle, and `tasks.view` scope on every read.
- It does not support OAuth, write-back, two-way editing, or instant refresh.

Create or rotate shows the complete URL only on the current page. Copy it immediately and treat it like a password. Rotation invalidates the former URL. **Revoke and Remove** makes an active URL unusable and removes its row; automatically revoked metadata can be deleted.

Calendar clients choose their own refresh schedule, so changes can take hours or longer to appear. The feed supplies the subscription’s friendly name and the owner’s current Profile timezone. Update the Profile timezone before subscribing again when that context is wrong.

See [Settings and User Preferences](/help.html?article=settings-and-user-preferences) for client-specific subscription steps and secret-handling details.

