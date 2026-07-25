Settings groups account and workspace administration surfaces. User settings hold personal preferences such as appearance and profile details.

Workspace settings, module settings, user administration, audit logs, API keys, and tag management appear based on your current permissions and enabled modules.

Help is listed under Settings so framework and module documentation is available even when optional workflow modules are disabled.

## Calendar subscription

User Settings includes a **Calendar Subscription** section for a private, read-only view of the Tasks you can access in the current workspace. This provider-neutral URL subscription does not connect calendar accounts or support two-way calendar editing. Changes made in another calendar app do not update Longtail Forge.

Choose **Enable Subscription** to issue the private URL. Longtail Forge shows that URL only in the current page session because it stores only a hash of the secret. Use **Reveal URL** when you need to inspect it and **Copy URL** to put it on the clipboard. If the subscription is already enabled but you no longer have its URL, choose **Rotate URL** to revoke the old address immediately and issue a replacement. **Disable Subscription** revokes the current address immediately.

Treat the URL like a password. Anyone who has the complete address can read the permission-scoped Tasks calendar. Do not paste it into tickets, chat, screenshots, analytics, logs, or other shared records.

Calendar apps refresh URL subscriptions periodically rather than in real time, and each client controls its own schedule. Updates may take several hours or longer to appear. Subscribe to the URL instead of importing a one-time `.ics` file:

- [Google Calendar](https://support.google.com/calendar/answer/37100): on a computer, choose **Other calendars**, **Add other calendars**, then **From URL**.
- [Apple Calendar](https://support.apple.com/guide/calendar/subscribe-to-calendars-icl1022/mac): on Mac, choose **File**, then **New Calendar Subscription**.
- [Outlook](https://support.microsoft.com/en-US/Outlook/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web): choose **Add calendar**, then **Subscribe from web**.
- [Thunderbird](https://support.mozilla.org/en-US/kb/creating-new-calendars): choose **New Calendar**, **On the Network**, then paste the URL.
