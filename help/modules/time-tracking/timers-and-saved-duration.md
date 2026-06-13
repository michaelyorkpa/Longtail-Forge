Manual timers and sourced timers such as task timers share the same active timer storage. A timer can be running or paused, and starting or resuming one timer pauses other running timers for the same user and workspace.

When a timer is saved as a time entry, the entry preserves the first timer start and final save time as factual timestamps. Duration is stored from accumulated active seconds only, so paused time is visible in the start/end span but does not inflate saved duration, billing, or reporting totals.

Active and paused timer payloads include safe source context for recovery: source module, source type, source ID, safe source label and URL, client/project context, status, last active start time, and accumulated elapsed seconds. Linked source labels and URLs are hidden when the timer owner cannot read the linked record.
