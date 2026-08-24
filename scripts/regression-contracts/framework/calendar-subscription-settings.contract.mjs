// Consolidated under framework.current-static-contracts by 0.33.33.9.
export const regressionMeta = Object.freeze({
  id: "framework.calendar-subscription-settings",
  area: "framework",
  tier: "release-gate",
  tags: ["calendar", "help", "security", "settings", "tasks", "views"],
  description: "Pins the administrator-only Calendar lifecycle manager, Business-only Client scope, all-workspace Project scope, one-time bearer URLs, User Settings removal, and framework/Tasks ownership boundary.",
  runMode: "static",
});

import { escapeRegExp } from "../../test-support/source-scan.mjs";
import assert from "node:assert/strict";
import { requirePackageLock, requirePackageManifest } from "../../test-support/package-manifest-assertions.mjs";

import { assertRoadmapCursorAtLeast } from "../../lib/roadmap-cursor.mjs";
import { createProjectTextReader } from "../../test-support/source-scan.mjs";
const { readTextAsync: readText } = createProjectTextReader();

const [
  settingsHost,
  calendarSettings,
  userSettings,
  frameworkCss,
  privateFeedRoutes,
  privateFeedService,
  privateFeedRepository,
  staticService,
  appShellService,
  settingsHelp,
  calendarSettingsView,
  userSettingsView,
  packageJson,
  packageLock,
] = await Promise.all([
  readText("public/js/shared/settings-host.js"),
  readText("public/js/calendar-settings.js"),
  readText("public/js/user-settings.js"),
  readText("public/css/longtail-forge.css"),
  readText("src/routes/private-feeds.routes.js"),
  readText("src/services/private-feeds.service.js"),
  readText("src/repositories/private-feed-tokens.repo.js"),
  readText("src/services/static.service.js"),
  readText("src/services/app-shell.service.js"),
  readText("help/framework/settings-and-user-preferences.md"),
  readText("views/protected/calendar-settings.html"),
  readText("views/protected/user-settings.html"),
  readText("package.json"),
  readText("package-lock.json"),
]);

assert.match(calendarSettingsView, /data-settings-host="calendar"/, "Calendar should use a dedicated shared Settings host");
assert.match(calendarSettingsView, /js\/shared\/modal\.js[^]*js\/shared\/settings-host\.js[^]*js\/calendar-settings\.js/, "Calendar should load shared confirmation and Settings anatomy before its adapter");
assert.doesNotMatch(userSettingsView, /calendar-settings|calendar-subscription/, "User Settings HTML should not own Calendar lifecycle assets");
assert.doesNotMatch(userSettings, /calendarSubscription|private-feeds\/calendar/i, "User Settings browser state and lifecycle calls should be removed");

assert.match(settingsHost, /placement === "calendar"[^]*mountCalendarHost\(hostElement\)/, "the shared Settings host should mount the Calendar destination");
assert.match(settingsHost, /function mountCalendarHost\(hostElement\)[^]*title: "Calendar"/, "the Calendar destination should use framework-owned page anatomy");
assert.match(settingsHost, /settingsSection\("Create Calendar Subscription"/, "creation should use shared Settings section anatomy");
assert.match(settingsHost, /id: "calendarSubscriptionName"[^]*calendar metadata[^]*maxlength: "120"/, "creation should require a bounded published name");
assert.match(settingsHost, /id: "calendarSubscriptionScope"[^]*Workspace[^]*Client[^]*Project/, "scope selection should begin at Workspace and allow Client or Project");
assert.match(settingsHost, /calendarSubscriptionClientField[^]*calendarSubscriptionProjectField/, "hierarchical Client and Project fields should be explicit");
assert.match(settingsHost, /inputType: "password"[^]*readonly: ""[^]*calendarSubscriptionUrlField/, "the one-time URL should start masked and read-only");
assert.match(settingsHost, /calendar-subscription-secret-warning"[^]*Longtail Forge will not show this link again\. Please copy it and install it now or store it for safe keeping\.[^]*subscriptionUrlField/, "the one-time warning should use the requested plain-language copy on its own line before the URL field");
assert.match(settingsHost, /children: \["Name", "Owner", "Scope", "Timezone", "Status", "Created", "Rotated", "Revoked", "Actions"\]/, "the workspace list should expose the complete safe metadata shape");
assert.match(settingsHost, /readoutSection\("Workspace Calendar Subscriptions"/, "the safe metadata table should have a workspace-rooted heading");
assert.doesNotMatch(settingsHost, /grid\.append\([^]*calendarSubscriptionForm\(\)/, "User Settings anatomy should no longer include Calendar Subscription");

for (const officialUrl of [
  "https://support.google.com/calendar/answer/37100",
  "https://support.apple.com/guide/calendar/subscribe-to-calendars-icl1022/mac",
  "https://support.microsoft.com/en-US/Outlook/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web",
  "https://support.mozilla.org/en-US/kb/creating-new-calendars",
]) {
  assert.match(settingsHost, new RegExp(escapeRegExp(officialUrl)), `Calendar Settings should link to ${officialUrl}`);
}
assert.match(settingsHost, /refresh subscriptions periodically, not in real time/, "in-product guidance should set periodic refresh expectations");
assert.match(settingsHost, /owner's current profile timezone[^]*Google Calendar uses both values[^]*Apple Calendar on iPhone[^]*Thunderbird testing confirms the friendly-name fallback works/, "in-product guidance should report confirmed Google, Apple, and Thunderbird behavior");

assert.match(calendarSettings, /let currentSecret = "";/, "the raw bearer URL should live only in page memory");
assert.match(calendarSettings, /window\.addEventListener\("pagehide", clearSecret\)/, "leaving the page should clear the one-time URL");
assert.doesNotMatch(calendarSettings, /(?:localStorage|sessionStorage)[^\n]*calendar/i, "the raw bearer URL must not enter browser storage");
assert.match(calendarSettings, /getJson\("\/api\/private-feeds\/calendar-subscriptions"/, "ordinary loads should use the safe collection endpoint");
assert.match(calendarSettings, /postJson\("\/api\/private-feeds\/calendar-subscriptions", payload\)[^]*showSecret\(body\.feedUrl/, "creation should consume the one-time URL response");
assert.match(calendarSettings, /calendar-subscriptions\/\$\{encodeURIComponent\(subscription\.subscriptionId\)\}\/rotate[^]*showSecret\(body\.feedUrl/, "owner rotation should consume the replacement URL");
assert.match(calendarSettings, /deleteJson\([^]*calendar-subscriptions\/\$\{encodeURIComponent\(subscription\.subscriptionId\)\}[^]*reloadSubscriptionsAfterRemoval/, "row revocation and deletion should remove the unique collection item and refresh the list");
assert.match(calendarSettings, /subscription\.status === "active" && subscription\.ownedByCurrentUser/, "only an active owner row should render Rotate");
assert.match(calendarSettings, /subscription\.status === "active"[^]*rowAction\("Revoke"/, "administrators should be able to revoke any active row");
assert.match(calendarSettings, /else \{[^]*rowAction\("Delete", "delete"/, "already-revoked rows should remain explicitly deletable");
assert.match(calendarSettings, /state\.tasksEnabled[^]*creation and rotation are unavailable/, "disabled Tasks should preserve listing/revocation while explaining lifecycle closure");
assert.match(calendarSettings, /getJson\("\/api\/client-projects\?view=options"/, "all workspace types should request permission-pruned Project scope options");
assert.match(calendarSettings, /state\.clients = usesBusinessScopes\(\) \? normalizeClients\(optionsBody\.clients\) : \[\]/, "Personal and Family workspaces should discard Client options");
assert.match(calendarSettings, /renderScopeOptions\(\)[^]*usesBusinessScopes\(\)[^]*\["workspace", "Workspace"\][^]*\["project", "Project"\]/, "Personal and Family scope selection should contain Workspace and Project");
assert.match(calendarSettings, /workspaces can use Workspace or Project scope\. Client scope is available only in Business workspaces/, "non-Business scope guidance should explain Project availability and the Business-only Client rule");
assert.match(calendarSettings, /value === "family" \? "Family" : "Personal"/, "non-Business scope guidance should name both supported workspace types");
assert.match(calendarSettings, /selectedClientId[^]*state\.clients\.find[^]*projects/, "selecting a Client should constrain Project options");
assert.match(calendarSettings, /navigator\.clipboard\.writeText\(currentSecret\)[^]*document\.execCommand\("copy"\)/, "copy should use the clipboard with the existing fallback");
assert.match(calendarSettings, /title: "Rotate calendar subscription URL\?"[^]*stop working immediately/, "rotation should require an explicit revocation warning");
assert.match(calendarSettings, /"Revoke calendar subscription\?"[^]*stop working immediately and the subscription will be removed from this list/, "revocation should require explicit removal confirmation");
assert.match(calendarSettings, /"Delete calendar subscription\?"[^]*private URL is already inoperable/, "revoked-row deletion should require explicit confirmation");
assert.doesNotMatch(calendarSettings, /stores only its hash/, "browser copy should not expose implementation jargon");
assert.doesNotMatch(calendarSettings, /token_selector|token_hash|tokenPrefix|scopeClientId|scopeProjectId/, "the browser must not consume secret storage fields or raw scope IDs");

assert.match(appShellService, /id: "calendar-settings"[^]*label: "Calendar"[^]*href: "calendar-settings\.html"/, "Admin Modules navigation should include Calendar");
assert.match(appShellService, /if \(permissionHints\.workspaceSettingsManage\)[^]*id: "calendar-settings"/, "Calendar navigation should require workspace settings authority");
assert.match(staticService, /calendar-settings\.html"[^]*requiredPermission: "workspace_settings\.manage"/, "the protected page should enforce workspace settings authority");
assert.match(staticService, /view\.requiredPermission[^]*permissionsService\.can\(session, view\.requiredPermission/, "framework protected-view permission metadata should be enforced server-side");

assert.match(privateFeedRoutes, /get\("\/private-feeds\/calendar-subscriptions"/, "safe metadata listing should remain collection-owned");
assert.match(privateFeedRoutes, /post\("\/private-feeds\/calendar-subscriptions"/, "creation should remain collection-owned");
assert.match(privateFeedRoutes, /calendar-subscriptions\/:subscriptionId\/rotate/, "rotation should remain uniquely addressed");
assert.match(privateFeedRoutes, /delete\("\/private-feeds\/calendar-subscriptions\/:subscriptionId"/, "revocation should remain uniquely addressed");
assert.doesNotMatch(privateFeedRoutes, /["']\/private-feeds\/calendar["']/, "the singular management endpoint should be retired");
assert.doesNotMatch(privateFeedService, /\b(?:getCalendarStatus|generateCalendar|rotateCalendar|disableCalendar)\b/, "singular lifecycle service methods should be retired");
assert.match(privateFeedService, /function removeCalendarSubscription\(subscriptionId, session\)[^]*privateFeedTokensRepository\.remove[^]*security\.private_feed\.revoked[^]*security\.private_feed\.deleted[^]*removed: true/, "manual revoke should remove active rows while revoked-row cleanup remains audited");
assert.match(privateFeedService, /scopeType === "client"[^]*workspacesRepository\.readById\(session\.workspace_id\)[^]*workspace_type !== "business"[^]*Client calendar scope is available only in Business workspaces/, "the service should reject forged non-Business Client scope creation");
assert.match(privateFeedService, /workspace_type !== "business" && row\.scope_type === "client"[^]*workspace_scope_not_supported/, "existing non-Business Client links should fail eligibility and reconcile closed");
assert.match(privateFeedService, /function toPublicSubscription\(token, session\)[^]*ownedByCurrentUser[^]*owner[^]*scope[^]*status[^]*subscriptionId[^]*timezone/, "metadata reads should include the safe effective timezone");
assert.doesNotMatch(privateFeedService.match(/function toPublicSubscription\(token, session\)[^]*?\n\}/)?.[0] || "", /feedUrl|token_selector|token_hash/, "metadata must never expose or reconstruct a bearer secret");
assert.match(privateFeedRepository, /function remove\(workspaceId, subscriptionId, providerId[^]*DELETE FROM private_feed_tokens[^]*token: current/, "manual removal should delete exactly the selected workspace/provider credential");

assert.match(frameworkCss, /\.calendar-settings-page\s*\{[^}]*width: min\(94vw/, "Calendar Settings should remain bounded");
assert.match(frameworkCss, /\.calendar-subscription-table-wrap\s*\{[^}]*max-width: 100%/, "the workspace list should contain horizontal overflow");
assert.match(frameworkCss, /\.calendar-subscription-row-actions\s*\{[^}]*flex-wrap: wrap/, "row actions should wrap on narrow screens");
assert.match(frameworkCss, /\[data-calendar-subscription-url\]\s*\{[^}]*min-width: 0;[^}]*width: 100%;/, "long subscription URLs should stay bounded");
assert.match(frameworkCss, /\.calendar-subscription-secret-warning\s*\{[^}]*color: var\(--color-danger\);[^}]*font-weight: 700;/, "the one-time-link warning should be prominent and theme-safe");

assert.match(settingsHelp, /## Calendar subscription/i, "Help should document the shipped subscription workflow");
assert.match(settingsHelp, /Settings[^]*Admin[^]*Modules[^]*Calendar/i, "Help should direct administrators to the dedicated destination");
assert.match(settingsHelp, /read-only/i, "Help should preserve provider-neutral read-only framing");
assert.match(settingsHelp, /periodic/i, "Help should explain refresh timing");
assert.doesNotMatch(settingsHelp, /Google Calendar sync/i, "Help must not imply provider-specific synchronization");

const packageData = requirePackageManifest(JSON.parse(packageJson));
const packageLockData = requirePackageLock(JSON.parse(packageLock));
assert.equal(packageLockData.version, packageData.version, "package and lockfile versions should match");
// The lockfile's root entry and the manifest version are proven present
// rather than assumed: a lockfile or manifest that stopped carrying one
// would otherwise compare undefined against undefined and pass.
const rootLockEntry = packageLockData.packages?.[""];
assert.ok(rootLockEntry, "package-lock.json should carry a root package entry");
const declaredVersion = packageData.version;
assert.ok(declaredVersion, "package.json should declare a version");
assert.equal(rootLockEntry.version, declaredVersion, "lockfile root package version should match");
assertRoadmapCursorAtLeast(declaredVersion, "the Calendar administration correction should not move the roadmap backward");

console.log("Calendar subscription settings regression passed.");
