export const regressionMeta = Object.freeze({
  id: "framework.settings-page-actions",
  area: "framework",
  tier: "release-gate",
  tags: ["dirty-state", "navigation-guard", "settings", "ui"],
  description: "Proves every Settings host uses dual universal Save and Revert actions while lifecycle forms stay outside dirty-state transactions.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";

const read = (filePath) => fs.readFile(filePath, "utf8");
const [host, renderer, controller, status, css, workspace, user, modulePage, files, developerView, settingsService, settingsRepository, permissionsService, icons, userAdmin, ...views] = await Promise.all([
  read("public/js/shared/settings-host.js"),
  read("public/js/shared/settings-renderer.js"),
  read("public/js/shared/settings-page-controller.js"),
  read("public/js/shared/status.js"),
  read("public/css/longtail-forge.css"),
  read("public/js/workspace-settings.js"),
  read("public/js/user-settings.js"),
  read("public/js/module-settings.js"),
  read("public/js/files-settings.js"),
  read("views/protected/developer-example.html"),
  read("src/services/settings.service.js"),
  read("src/repositories/settings.repo.js"),
  read("src/services/permissions.service.js"),
  read("public/js/shared/icons.js"),
  read("public/js/user-admin.js"),
  ...["workspace", "user", "tasks", "time-tracking", "files"].map((name) => read(`views/protected/${name}-settings.html`)),
]);
const [timezones, notificationPreferences, navigation, deletionService] = await Promise.all([
  read("public/js/shared/timezones.js"),
  read("public/js/shared/notification-preferences.js"),
  read("public/js/navigation.js"),
  read("src/services/workspace-deletion.service.js"),
]);

assert.match(host, /settingsPageActions\("top"\)/);
assert.match(host, /settingsPageFooter\(\)/);
assert.match(host, /action\("Users", "openWorkspaceUsers", \{ icon: "user" \}\)/);
assert.match(host, /workspaceTypeInput", \{ disabled: true \}\)/);
assert.doesNotMatch(host, /action\("Workspace Users", "openWorkspaceUsers"\)/);
assert.match(icons, /user: Object\.freeze/);
assert.match(host, /action\("Revert", "settingsPageRevert"[\s\S]*icon: "restore"/);
assert.match(host, /action\("Save", "settingsPageSave"[\s\S]*icon: "save"/);
assert.match(host, /data.*settingsActionForm|settingsActionForm/);
assert.match(host, /Unsaved changes/);
assert.doesNotMatch(renderer, /data\.settingsSave|save-settings-section|Save Settings/);
assert.match(controller, /data-settings-page-save/);
assert.match(controller, /data-settings-page-revert/);
assert.match(controller, /data-settings-scope/);
assert.match(controller, /data-settings-action-form/);
assert.match(controller, /beforeunload/);
assert.match(controller, /stopImmediatePropagation/);
assert.match(controller, /is-unsaved-flash/);
assert.match(status, /element\.hidden = !message/);
assert.match(css, /@keyframes settings-unsaved-flash/);
assert.match(css, /\.settings-page-footer-actions \{[\s\S]*display: flex;[\s\S]*justify-content: flex-end;/);
assert.match(css, /\.view-settings-field\[hidden\][\s\S]*display: none/);
assert.match(host, /workspaceCoreSettings/);
assert.match(host, /workspaceModuleSettings/);
assert.match(host, /primary\.append\([\s\S]*settingsForm\("userThemeForm", "Appearance"[\s\S]*profileForm\(\)/);
assert.match(host, /settingsForm\("userAppPreferencesForm", "User App Preferences"/);
assert.match(host, /"Actions: Tasks"[\s\S]*"Actions: Notes"[\s\S]*"Actions: Lists"/);
assert.match(host, /notificationPreferences\.classList\.add\("user-settings-wide"\)/);
assert.match(host, /className: \["view-settings-section", "user-settings-wide", "user-settings-disclosure"\]/);
assert.match(host, /element\("summary", \{ className: "user-settings-disclosure-summary", text: "Workspace Creation" \}\)/);
assert.match(host, /function leaveWorkspaceForm\(\)[\s\S]*settingsSection\("Leave Workspace"[\s\S]*openWorkspaceRemoval/);
assert.match(host, /function deleteAccountForm\(\)[\s\S]*settingsSection\("Delete Account"[\s\S]*contributions, and attribution are retained/);
assert.match(host, /action\("Delete Account", "deleteAccount", \{ className: "danger-button" \}\)/);
const workspaceCreateSource = host.match(/function workspaceCreateForm\(\)[\s\S]*?(?=\n  function leaveWorkspaceForm\()/)?.[0] || "";
assert.doesNotMatch(workspaceCreateSource, /Leave Workspace|openWorkspaceRemoval/);
assert.match(host, /LEAVE_WORKSPACE_WARNING = "Leaving a workspace removes only your membership\.[\s\S]*not deleted\.[\s\S]*must restore your access/);
assert.equal(host.match(/text: LEAVE_WORKSPACE_WARNING/g)?.length, 2, "the section and dialog must repeat the same warning");
assert.match(host, /readoutSection\("Delete Workspace"[\s\S]*separate from Leave Workspace[\s\S]*30-day grace period/);
assert.match(host, /action\("Delete Workspace", "openWorkspaceDeletion", \{[\s\S]*className: "danger-button",[\s\S]*hidden: true/);
assert.match(workspace, /catch \(error\) \{[\s\S]*openWorkspaceDeletionButton\.hidden = true;[\s\S]*Workspace deletion requires a Workspace Administrator/);
assert.match(workspace, /DELETE WITHOUT CURRENT BACKUP|acknowledgementPhrase/);
assert.match(workspace, /workspace-deletion\/request/);
assert.match(workspace, /workspace-deletion\/cancel/);
assert.match(navigation, /applyWorkspaceDeletionNotice[\s\S]*This workspace is pending deletion[\s\S]*Review or cancel/);
assert.match(deletionService, /DELETION_GRACE_DAYS = 30[\s\S]*RECENT_BACKUP_WINDOW_HOURS = 24/);
assert.match(deletionService, /now\.getTime\(\) >= new Date\(lifecycle\.purgeAfter\)\.getTime\(\)/);
assert.match(timezones, /Intl\.supportedValuesOf\("timeZone"\)/);
assert.match(timezones, /label: `\$\{timezone\} \(\$\{formatUtcOffset\(date, timezone\)\}\)`/);
assert.match(timezones, /return `UTC \$\{sign\}\$\{hours\}:\$\{minutes\}`/);
assert.match(host, /root\.timezones\?\.listSupportedTimezones\?\.\(\)/);
assert.match(notificationPreferences, /legend\.textContent = "Notification Grouping"/);
assert.match(css, /\.user-settings-wide \{[\s\S]*grid-column: 1 \/ -1/);
assert.match(css, /@media \(max-width: 640px\) \{[\s\S]*\.notification-preference-matrix \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) 58px minmax\(88px, 100px\)/);
assert.match(css, /\.notification-preference-matrix select \{[\s\S]*width: 100%;[\s\S]*min-width: 0/);
assert.match(css, /\.user-settings-disclosure-summary::before/);
assert.match(css, /\.workspace-membership-warning/);
assert.match(renderer, /renderGroupedSections/);
assert.match(workspace, /compareOptionalModules/);
assert.match(workspace, /moduleId === "developer-example"/);
assert.match(settingsService, /assertWorkspaceTypeImmutable\(payload, previousSettings\.workspaceType\)/);
assert.match(settingsService, /permissionsService\.isWorkspaceAdministrator\(session\)/);
assert.match(permissionsService, /async function isWorkspaceAdministrator\(session\)/);
assert.match(settingsRepository, /savedSettings\.workspaceType !== workspace\.workspace_type/);
assert.doesNotMatch(settingsRepository, /SET name = :workspaceName,\s*workspace_type = :workspaceType/);
for (const source of [workspace, user, modulePage, files]) {
  assert.match(source, /settingsPageController\.create/);
}
assert.match(user, /async function saveAllSettings/);
assert.match(user, /putJson\("\/api\/user\/settings"/);
assert.match(user, /modal\.confirm\([\s\S]*contributions, and attribution are retained[\s\S]*deleteJson\("\/api\/user\/account"\)/);
assert.match(user, /saveUserPreferences/);
assert.doesNotMatch(user, /themeForm\.addEventListener\("change", async/);
assert.match(userAdmin, /currentUserId = String\(usersBody\.currentUserId \|\| ""\)/);
assert.match(userAdmin, /isProtected \|\| isCurrentUser/);
assert.match(userAdmin, /removes the user's current-workspace access[\s\S]*contributions, and attribution remain in workspace history/);
for (const view of views) {
  assert.match(view, /js\/shared\/settings-page-controller\.js/);
}
assert.match(views.at(-1), /js\/shared\/status\.js[\s\S]*js\/files-settings\.js/, "Files Settings should load the shared status helper before its adapter");
assert.match(developerView, /data-settings-host="module"/);
assert.match(developerView, /data-settings-module-id="developer-example"/);
assert.match(developerView, /js\/shared\/settings-page-controller\.js/);
assert.match(developerView, /js\/module-settings\.js/);
assert.doesNotMatch(developerView, /css\/styles\.css|developer-example-output|JSON\.stringify/);

console.log("Universal Settings page actions regression passed.");
