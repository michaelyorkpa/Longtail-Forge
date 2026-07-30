# Tags and Search

Tags and Search help recover context, but they solve different parts of the problem. Tags add deliberate classification to supported records. Search finds indexed, readable records and Help from words and filters.

## Tags classify; they do not control behavior

A workspace tag can help group work by theme, customer concern, initiative, location, or another reusable label. Assigning a tag does not:

- Grant or remove permission.
- Change workspace, Client, or Project scope.
- Change status, priority, billing, security, visibility, or module behavior.
- Move a record or create a relationship.

Some records inherit or propagate tags through an explicitly registered module rule. The owning module decides that rule. Removing a direct tag does not silently rewrite unrelated records.

Archived tags remain readable on historical records but are not normal active-picker choices. Use Settings → Admin → Tags to manage the workspace catalog when permitted.

## Search recovers indexed context

Search accepts text plus available source, record type, Client, Project, tag, status, and page filters. The server owns canonical filtering, permission pruning, and result shaping. Browser filters request a view of the index; they are not a second visibility rule.

A result appears only when all current boundaries allow it:

- The active workspace matches.
- Its module and searchable type are active.
- Its lifecycle is eligible for that search source.
- Your current permission and record scope allow the read.

Search does not promise an immediate row for every write. Module events and search jobs keep the canonical index synchronized, and authorized administrators can use the supported rebuild path when operational recovery is needed.

Secure Note bodies and other protected secret material are excluded from normal indexing. Search results contain safe titles, summaries, snippets, and registered targets rather than raw index rows or hidden record data.

## Using them together

Add tags when a classification will help future filtering or grouping. Use Search when you remember language, context, or a tag but not the record’s location. Open the result through its registered action, then continue in the owning module.

Help articles are indexed as their own Help record type. Searching for a workflow or concept can therefore route directly back to the Help Center without exposing the stored article body in a browser search response.

