User access is based on role assignments in the active workspace. Some roles apply to the whole workspace, while client and project roles apply only to their assigned scope.

Protected local administrator accounts keep broad access for local administration. Other users see records and actions allowed by their assigned roles and operation overrides.

Shared pages hide actions when your active-workspace roles do not include the
declared permission. Client- and project-scoped administrators may still see
only the actions attached to records they administer. These visible controls
are guidance; Longtail Forge checks your current permission again when an
action is submitted.

User profile preferences such as theme and timezone live under User settings. User administration and role assignment controls appear only when your current role allows them.

If an action is refused because your current role does not allow it, Longtail Forge opens a Permission denied dialog without repeating the action. Close the dialog to return focus to the control you used. Protected pages that are forbidden or unavailable use the same generic unavailable message so the page does not reveal whether a hidden record exists.

Add User starts with the current workspace and lists only workspaces you are allowed to administer. Enter a complete email address and use Find Account: an exact existing account can be added without creating another identity, while an unmatched email creates a new account and shows its generated password once. The initial role determines whether a Client or Project selector appears. Personal workspaces cannot add users, Family workspaces do not offer client roles, and only a Super Admin can assign Super Admin.

Role Assignments is the focused delegation page for administrators whose authority is limited to particular Clients or Projects. Enter a complete email address to find an active member of the current workspace; the page does not offer a directory or reveal whether an unavailable account or hidden assignment exists. It shows only assignments you are allowed to manage and only the role and scope choices available to you. Adding or removing an assignment requires confirmation. If the assignment state changes while the page is open, use Find Account again before retrying. User Admin remains the separate full-administration surface for workspace-level user managers; Role Assignments does not edit profiles or memberships and does not provide password, session, override, or deletion controls.

Repeated unsuccessful sign-in or current-password checks are temporarily limited. If Longtail Forge says there have been too many attempts, wait for the lockout period before trying again; the response does not indicate whether a submitted account exists. Administrator password resets are also temporarily limited after repeated use.

Workspace owners and administrators can open Audit Log and switch View to Security events. This restricted workspace view records sign-in outcomes, temporary lockouts, session revocation, password changes and administrator resets, user deactivation, security-setting changes, and important permission denials. It shows safe actor or attempted-account, event outcome, time, and client-IP context without passwords, session credentials, tokens, or hashes. Security events remain enabled when ordinary app audit logging is turned off and follow the workspace Audit Retention Days setting.

Workspace owners and administrators with user-management permission can open Active Sessions from User Admin, review sessions connected to the current workspace, and revoke one or all of them. Session credentials are never displayed. Revocation takes effect on the next request. Changing your own password logs out your other sessions; an administrator password reset or account deactivation logs out every session for the affected user.

When an installation operator has explicitly enabled Support View, a Super Admin can open **Settings → Admin → Support View** to inspect an active user's perspective without changing the user's permissions. Starting requires the Super Admin's current password, a user and workspace, a reason/reference, and confirmation of the short read-only session. A persistent banner always names the viewed user/workspace and the Super Admin actor, shows the time remaining, and provides **End Support View**. Changes, protected secrets, and administrative Support View history remain unavailable. End returns to a safe prior page and moves keyboard focus to its heading. Settings **Log Out** ends Support View and signs out completely instead of returning to the administrator session.

The separate **Support View Audit** page is available only to an authorized Super Admin outside Support View. It filters safe session/action history by actor, target, workspace, event, outcome, and date, offers a bounded CSV export, and retains ended sessions for 365 days. It does not display passwords, cookies, session credentials, request bodies, secure content, or hidden record labels.

An administrator reset displays a temporary generated password once. After signing in with it, the user must choose a new password on the login screen before opening the rest of Longtail Forge. The temporary password is not available for later retrieval, so copy it only for immediate secure delivery to the affected user. Longtail Forge does not currently provide a forgot-password email or token flow; contact a workspace administrator who can manage your account.

When you configure a role assignment, the permission matrix shows resources contributed by modules that are enabled and available to you. Disabling a module removes its section from the matrix; re-enabling the module restores it without erasing previously saved overrides.

Only active workspace members appear in workspace people lists and assignment choices. Deactivating either a user's account or that user's membership in the current workspace removes them from those active-workspace surfaces.

Delete User in User Admin removes another user's access to the current workspace and is disabled for your own signed-in account. If that was the user's last active workspace, Longtail Forge retires the remaining credentials and sessions for Client/Project Administrators and users. A former Workspace Administrator, workspace owner, or installation Super Admin instead has every ordinary session ended and may sign in only to **Account data recovery** for a portable profile/preferences download or logout. That restricted export contains no workspace records, Files, backups, credentials, memberships, roles, audit history, or internal IDs. The identity and readable attribution remain in workspace history.

To retire your own account, open Settings -> User -> Delete Account. The confirmation explains that your password, sessions, API keys, roles, and access to every workspace are retired while your email address, display name, contributions, and attribution remain in history. After retirement, sign-in uses the same general access-denied message as an unknown or inactive account; it does not reveal which kind of account was submitted.
