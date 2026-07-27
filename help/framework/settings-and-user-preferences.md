Settings groups account and workspace administration surfaces. User settings hold personal preferences such as appearance and profile details.

Workspace settings, module settings, user administration, audit logs, API keys, and tag management appear based on your current permissions and enabled modules.

Help is listed under Settings so framework and module documentation is available even when optional workflow modules are disabled.

## Calendar subscription

Workspace Administrators and Super Admins manage private, read-only Tasks calendar URLs at **Settings → Admin → Modules → Calendar**. Calendar subscriptions are workspace administration credentials, not User Settings preferences. This provider-neutral feature does not connect calendar accounts or support two-way calendar editing. Changes made in another calendar app do not update Longtail Forge.

Create as many named subscriptions as the workspace needs. Every subscription belongs to the administrator who creates it and starts at **Workspace** scope. Every workspace type may narrow it to one readable **Project**. Business workspaces may additionally narrow it to one readable **Client**; Personal and Family workspaces never show Client scope. A Client subscription includes direct Client Tasks and Tasks in that Client's current Projects. A Project subscription includes only that Project. Longtail Forge rechecks the owner's active workspace membership, Tasks availability, target lifecycle, and current `tasks.view` permission whenever a calendar client reads the URL. Permission reductions, deactivation, archived targets, or disabled Tasks make the affected URL inoperable; the administration page remains available for safe metadata review and revocation when Tasks is disabled.

After **Create Subscription** or owner-only **Rotate**, Longtail Forge shows the new URL only on the current page. **Longtail Forge will not show this link again. Please copy it and install it now or store it for safe keeping.** Use **Reveal URL** when you need to inspect it and **Copy URL** to put it on the clipboard. Navigating away clears the displayed value, and metadata reloads cannot recover it. Rotation invalidates the former address immediately. An administrator can see safe Name, Owner, Scope, Timezone, Status, Created, Rotated, and Revoked metadata but cannot reveal or rotate another owner's secret. **Revoke and Remove** makes an active URL inoperable and removes its row. Automatically revoked rows offer **Delete** so obsolete metadata does not remain in the list.

Longtail Forge publishes the subscription name and the owner's current **Profile** timezone in the calendar feed. Current testing confirms Google Calendar uses both values and Apple Calendar on iPhone uses the friendly name. Outlook asks for the local calendar name before it reads the URL. New and rotated links also end with a path-safe version of the subscription name so Thunderbird can show a friendly name during setup; current Thunderbird testing confirms that fallback works. If the owner timezone is wrong, update that owner's Profile timezone and subscribe again.

Treat the URL like a password. Anyone who has the complete address can read the permission-scoped Tasks calendar. Do not paste it into tickets, chat, screenshots, analytics, logs, or other shared records.

Calendar apps refresh URL subscriptions periodically rather than in real time, and each client controls its own schedule. Updates may take several hours or longer to appear. Subscribe to the URL instead of importing a one-time `.ics` file:

- [Google Calendar](https://support.google.com/calendar/answer/37100): on a computer, choose **Other calendars**, **Add other calendars**, then **From URL**.
- [Apple Calendar](https://support.apple.com/guide/calendar/subscribe-to-calendars-icl1022/mac): on Mac, choose **File**, then **New Calendar Subscription**.
- [Outlook](https://support.microsoft.com/en-US/Outlook/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web): choose **Add calendar**, then **Subscribe from web**.
- [Thunderbird](https://support.mozilla.org/en-US/kb/creating-new-calendars): choose **New Calendar**, **On the Network**, then paste the URL.
