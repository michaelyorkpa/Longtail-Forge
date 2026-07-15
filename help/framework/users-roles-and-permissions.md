User access is based on role assignments in the active workspace. Some roles apply to the whole workspace, while client and project roles apply only to their assigned scope.

Protected local administrator accounts keep broad access for local administration. Other users see records and actions allowed by their assigned roles and operation overrides.

User profile preferences such as theme and timezone live under User settings. User administration and role assignment controls appear only when your current role allows them.

Repeated unsuccessful sign-in or current-password checks are temporarily limited. If Longtail Forge says there have been too many attempts, wait for the lockout period before trying again; the response does not indicate whether a submitted account exists. Administrator password resets are also temporarily limited after repeated use.

Workspace owners and administrators can open Audit Log and switch View to Security events. This restricted workspace view records sign-in outcomes, temporary lockouts, session revocation, password changes and administrator resets, user deactivation, security-setting changes, and important permission denials. It shows safe actor or attempted-account, event outcome, time, and client-IP context without passwords, session credentials, tokens, or hashes. Security events remain enabled when ordinary app audit logging is turned off and follow the workspace Audit Retention Days setting.

Workspace owners and administrators with user-management permission can open Active Sessions from User Admin, review sessions connected to the current workspace, and revoke one or all of them. Session credentials are never displayed. Revocation takes effect on the next request. Changing your own password logs out your other sessions; an administrator password reset or account deactivation logs out every session for the affected user.

An administrator reset displays a temporary generated password once. After signing in with it, the user must choose a new password on the login screen before opening the rest of Longtail Forge. The temporary password is not available for later retrieval, so copy it only for immediate secure delivery to the affected user. Longtail Forge does not currently provide a forgot-password email or token flow; contact a workspace administrator who can manage your account.

When you configure a role assignment, the permission matrix shows resources contributed by modules that are enabled and available to you. Disabling a module removes its section from the matrix; re-enabling the module restores it without erasing previously saved overrides.

Only active workspace members appear in workspace people lists and assignment choices. Deactivating either a user's account or that user's membership in the current workspace removes them from those active-workspace surfaces.
