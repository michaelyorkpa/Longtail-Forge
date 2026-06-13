Secure notes encrypt the note body at rest with application-managed envelope encryption. This protects database exposure, but it is not zero-knowledge because a configured app server can decrypt secure bodies after session and permission checks.

Secure note titles are visible to users who can view note metadata. Do not put secrets in the title.

Only the owner and users with explicit secure-note permissions can access secure bodies. Normal note permissions, workspace membership, Library buckets, collections, linked records, tags, and file permissions do not grant secure body access. Secure notes are excluded from normal search, list previews, file attachments, client-visible controls, and ordinary note notification content.
