# Workspace Deletion Grace Period and Final Purge

Longtail Forge separates workspace deletion from both **Leave Workspace** and account deletion. Leave Workspace removes one membership. **Delete Workspace** schedules the entire active workspace for a future purge and is available only to a Workspace Administrator of that workspace or an installation Super Admin.

The browser implements only the reversible request and 30-day grace period. It does not physically delete records, Files objects, search rows, memberships, sessions, or any other workspace data. Final purge is a separate protected-host job/operator-maintenance boundary; a normal page request never coordinates destructive cleanup.

## Request prerequisites

The administrator must type the active workspace name exactly. A successful [workspace backup package](workspace-backup.md) created within the previous 24 hours satisfies the recovery prerequisite and its safe receipt is linked to the lifecycle row. If no successful current package exists, the administrator must instead type the exact phrase `DELETE WITHOUT CURRENT BACKUP`. That acknowledgement is durable; it does not invent a receipt or claim that recovery is available.

The request records only the workspace, requesting user, request time, purge-eligible time, qualifying backup receipt when present, and the no-current-backup acknowledgement flag. Browser payloads replace user IDs with readable labels and never return the lifecycle workspace ID, requester ID, backup ID, archive path, storage key, or secret.

## Grace-period behavior

For exactly 30 days after the request, the workspace remains fully operational:

- existing sessions continue and workspace switching still resolves active memberships;
- memberships, roles, owner protections, and the installation Super Admin recovery path remain unchanged;
- app-shell navigation, module enablement, reads, writes, and jobs continue normally;
- Files, Search, notifications, and their normal permission checks continue normally;
- Workspace Settings and the global app-shell notice display the pending state, readable requester, request time, and grace deadline.

Pending deletion is stored in `workspace_deletion_lifecycle`; neither `workspaces.status` nor `user_workspaces.status` is overloaded. Requesting or canceling deletion does not deactivate anything. The existing owner-transfer and last-administrator rules continue to protect the workspace recovery path if an administrator separately changes membership or retires an account.

An authorized administrator may use **Cancel Workspace Deletion** any time before `purge_after`. Cancellation removes the pending lifecycle row and writes a forced restore audit event; the workspace never needs data restoration because the grace-period flow removed nothing. At the exact deadline and afterward, cancellation is refused. The lifecycle row and operational workspace remain intact until an operator deliberately queues final purge—expiry alone never deletes data.

## Final purge boundary

After the exact grace deadline, a protected-host operator may queue the irreversible job:

```sh
npm run workspace:purge -- --workspace-id <id>
```

The command refuses an early or missing lifecycle and queues only `workspace.purge`; it does not delete records in the command process. The configured inline or separate worker executes the registered handler. There is no browser purge endpoint, automatic deadline sweep, or startup cleanup.

The handler first commits a durable fence: lifecycle and workspace status become `purging`, target sessions are revoked, target API keys no longer authenticate, pending workspace jobs are removed, and new non-purge jobs are rejected. Already-running workspace jobs remain visible and must drain before artifact deletion starts. This prevents a stale claimed job from recreating workspace state after cleanup; the database foreign key remains the final guard after the workspace row is gone.

Under the final database write lock, artifact cleanup removes every internal Files object through its registered storage provider and removes that workspace's protected backup directory. This closes the gap in which an already-in-flight request could otherwise leave a new object between cleanup and database deletion. Missing objects/directories are treated as already cleaned so a process interruption can resume safely. The same deferred-foreign-key transaction removes dependent API-key scopes and sessions, every module/framework/Search/job/notification/Files table row carrying the target `workspace_id`, the lifecycle row, and the workspace itself. Install-level user identities and readable attribution survive; identities with another active membership use it, while a last-workspace identity retains `NULL` home/active workspace rather than receiving unrelated access.

Before role and membership rows disappear, finalization records a workspace-free recovery qualification only for a still-active owner, Workspace Administrator, or installation Super Admin who will have no other active workspace. It stores no former workspace ID/name and cannot reconstruct deleted content. After purge, that identity may sign in only to download its separate portable account profile/preferences export and log out; the mode cannot read the deleted workspace, create/download a workspace backup, switch workspaces, or use ordinary app routes. Other zero-workspace identities keep the normal generic sign-in denial.

The only durable evidence outside the deleted workspace is an aggregate tombstone keyed by a SHA-256 fingerprint of the former workspace ID. It records status, attempts, times, and aggregate row/object counts only—never the workspace ID or name, record content, filename, storage key, protected path, requester, or secret. A completed retry returns the existing result without repeating deletion. Finalization verifies `PRAGMA foreign_key_check` and `PRAGMA integrity_check`.

## API and audit contract

- `GET /api/settings/workspace-deletion` reads the active workspace's safe request/prerequisite state.
- `POST /api/settings/workspace-deletion/request` validates administrator authority, exact workspace name, and the recent-backup or typed-acknowledgement prerequisite.
- `POST /api/settings/workspace-deletion/cancel` cancels an existing request only before the grace deadline.

Request and cancellation write forced `workspace_deletion_requested` and `workspace_deletion_canceled` workspace audit events. Audit metadata records the safe prerequisite classification and lifecycle times, not protected archive locations, raw IDs in browser-facing state, or destructive-purge claims.

Those workspace-scoped request/cancellation audits are deleted with the workspace during final purge. The hash-only aggregate tombstone is the retained non-workspace evidence; it is not a record-level audit export and cannot reconstruct deleted content.
