Settings groups account and workspace administration surfaces. User settings hold personal preferences such as appearance and profile details.

Workspace settings, module settings, user administration, audit logs, API keys, and tag management appear based on your current permissions and enabled modules.

Help is listed under Settings so framework and module documentation is available even when optional workflow modules are disabled.

## Calendar subscription

Workspace Administrators and Super Admins manage private, read-only Tasks calendar URLs at **Settings → Admin → Modules → Calendar**. Calendar subscriptions are workspace administration credentials, not User Settings preferences. This provider-neutral feature does not connect calendar accounts or support two-way calendar editing. Changes made in another calendar app do not update Longtail Forge.

Create as many named subscriptions as the workspace needs. Every subscription belongs to the administrator who creates it and starts at **Workspace** scope. You may narrow it to one readable **Client** or **Project**. A Client subscription includes direct Client Tasks and Tasks in that Client's current Projects. A Project subscription includes only that Project. Longtail Forge rechecks the owner's active workspace membership, Tasks availability, target lifecycle, and current `tasks.view` permission whenever a calendar client reads the URL. Permission reductions, deactivation, archived targets, or disabled Tasks make the affected URL inoperable; the administration page remains available for safe metadata review and revocation when Tasks is disabled.

After **Create Subscription** or owner-only **Rotate**, Longtail Forge shows the new URL only on the current page because it stores only a hash of the secret. Use **Reveal URL** when you need to inspect it and **Copy URL** to put it on the clipboard. Navigating away clears the displayed value, and metadata reloads cannot recover it. Rotation revokes the former address immediately. An administrator can see safe Name, Owner, Scope, Status, Created, Rotated, and Revoked metadata and can revoke any active row, but cannot reveal or rotate another owner's secret.

Treat the URL like a password. Anyone who has the complete address can read the permission-scoped Tasks calendar. Do not paste it into tickets, chat, screenshots, analytics, logs, or other shared records.

Calendar apps refresh URL subscriptions periodically rather than in real time, and each client controls its own schedule. Updates may take several hours or longer to appear. Subscribe to the URL instead of importing a one-time `.ics` file:

- [Google Calendar](https://support.google.com/calendar/answer/37100): on a computer, choose **Other calendars**, **Add other calendars**, then **From URL**.
- [Apple Calendar](https://support.apple.com/guide/calendar/subscribe-to-calendars-icl1022/mac): on Mac, choose **File**, then **New Calendar Subscription**.
- [Outlook](https://support.microsoft.com/en-US/Outlook/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web): choose **Add calendar**, then **Subscribe from web**.
- [Thunderbird](https://support.mozilla.org/en-US/kb/creating-new-calendars): choose **New Calendar**, **On the Network**, then paste the URL.
