export const regressionMeta = Object.freeze({
  id: "framework.calendar-subscription-settings",
  area: "framework",
  tier: "release-gate",
  tags: ["calendar", "help", "security", "settings", "tasks", "views"],
  description: "Pins the administrator-only Calendar lifecycle manager, hierarchy-safe scopes, one-time bearer URLs, User Settings removal, and framework/Tasks ownership boundary.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertRoadmapCursorAtLeast } from "../../lib/roadmap-cursor.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const [
  settingsHost,
  calendarSettings,
  userSettings,
  frameworkCss,
  privateFeedRoutes,
  privateFeedService,
  staticService,
  appShellService,
  renderedSpec,
  settingsHelp,
  calendarSettingsView,
  userSettingsView,
  packageJson,
  packageLock,
  roadmap,
  roadmapArchive,
  changelog,
] = await Promise.all([
  readText("public/js/shared/settings-host.js"),
  readText("public/js/calendar-settings.js"),
  readText("public/js/user-settings.js"),
  readText("public/css/longtail-forge.css"),
  readText("src/routes/private-feeds.routes.js"),
  readText("src/services/private-feeds.service.js"),
  readText("src/services/static.service.js"),
  readText("src/services/app-shell.service.js"),
  readText("tests/e2e/calendar-subscription-settings.spec.mjs"),
  readText("help/framework/settings-and-user-preferences.md"),
  readText("views/protected/calendar-settings.html"),
  readText("views/protected/user-settings.html"),
  readText("package.json"),
  readText("package-lock.json"),
  readText("ROADMAP.md"),
  readText("ROADMAP-ARCHIVE.md"),
  readText("CHANGELOG.md"),
]);

assert.match(calendarSettingsView, /data-settings-host="calendar"/, "Calendar should use a dedicated shared Settings host");
assert.match(calendarSettingsView, /js\/shared\/modal\.js[^]*js\/shared\/settings-host\.js[^]*js\/calendar-settings\.js/, "Calendar should load shared confirmation and Settings anatomy before its adapter");
assert.doesNotMatch(userSettingsView, /calendar-settings|calendar-subscription/, "User Settings HTML should not own Calendar lifecycle assets");
assert.doesNotMatch(userSettings, /calendarSubscription|private-feeds\/calendar/i, "User Settings browser state and lifecycle calls should be removed");

assert.match(settingsHost, /placement === "calendar"[^]*mountCalendarHost\(hostElement\)/, "the shared Settings host should mount the Calendar destination");
assert.match(settingsHost, /function mountCalendarHost\(hostElement\)[^]*title: "Calendar"/, "the Calendar destination should use framework-owned page anatomy");
assert.match(settingsHost, /settingsSection\("Create Calendar Subscription"/, "creation should use shared Settings section anatomy");
assert.match(settingsHost, /id: "calendarSubscriptionName"[^]*maxlength: "120"/, "creation should require a bounded name");
assert.match(settingsHost, /id: "calendarSubscriptionScope"[^]*Workspace[^]*Client[^]*Project/, "scope selection should begin at Workspace and allow Client or Project");
assert.match(settingsHost, /calendarSubscriptionClientField[^]*calendarSubscriptionProjectField/, "hierarchical Client and Project fields should be explicit");
assert.match(settingsHost, /inputType: "password"[^]*readonly: ""[^]*calendarSubscriptionUrlField/, "the one-time URL should start masked and read-only");
assert.match(settingsHost, /children: \["Name", "Owner", "Scope", "Status", "Created", "Rotated", "Revoked", "Actions"\]/, "the workspace list should expose the complete safe metadata shape");
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

assert.match(calendarSettings, /let currentSecret = "";/, "the raw bearer URL should live only in page memory");
assert.match(calendarSettings, /window\.addEventListener\("pagehide", clearSecret\)/, "leaving the page should clear the one-time URL");
assert.doesNotMatch(calendarSettings, /(?:localStorage|sessionStorage)[^\n]*calendar/i, "the raw bearer URL must not enter browser storage");
assert.match(calendarSettings, /getJson\("\/api\/private-feeds\/calendar-subscriptions"/, "ordinary loads should use the safe collection endpoint");
assert.match(calendarSettings, /postJson\("\/api\/private-feeds\/calendar-subscriptions", payload\)[^]*showSecret\(body\.feedUrl/, "creation should consume the one-time URL response");
assert.match(calendarSettings, /calendar-subscriptions\/\$\{encodeURIComponent\(subscription\.subscriptionId\)\}\/rotate[^]*showSecret\(body\.feedUrl/, "owner rotation should consume the replacement URL");
assert.match(calendarSettings, /deleteJson\([^]*calendar-subscriptions\/\$\{encodeURIComponent\(subscription\.subscriptionId\)\}/, "row revocation should use the unique collection item");
assert.match(calendarSettings, /subscription\.status === "active" && subscription\.ownedByCurrentUser/, "only an active owner row should render Rotate");
assert.match(calendarSettings, /subscription\.status === "active"[^]*rowAction\("Revoke"/, "administrators should be able to revoke any active row");
assert.match(calendarSettings, /state\.tasksEnabled[^]*creation and rotation are unavailable/, "disabled Tasks should preserve listing/revocation while explaining lifecycle closure");
assert.match(calendarSettings, /selectedClientId[^]*state\.clients\.find[^]*projects/, "selecting a Client should constrain Project options");
assert.match(calendarSettings, /navigator\.clipboard\.writeText\(currentSecret\)[^]*document\.execCommand\("copy"\)/, "copy should use the clipboard with the existing fallback");
assert.match(calendarSettings, /title: "Rotate calendar subscription URL\?"[^]*stop working immediately/, "rotation should require an explicit revocation warning");
assert.match(calendarSettings, /title: "Revoke calendar subscription\?"[^]*stop working immediately/, "revocation should require explicit confirmation");
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
assert.match(privateFeedService, /function toPublicSubscription\(token, session\)[^]*ownedByCurrentUser[^]*owner[^]*scope[^]*status[^]*subscriptionId/, "metadata reads should remain safe and action-shaping");
assert.doesNotMatch(privateFeedService.match(/function toPublicSubscription\(token, session\)[^]*?\n\}/)?.[0] || "", /feedUrl|token_selector|token_hash/, "metadata must never expose or reconstruct a bearer secret");

assert.match(frameworkCss, /\.calendar-settings-page\s*\{[^}]*width: min\(94vw/, "Calendar Settings should remain bounded");
assert.match(frameworkCss, /\.calendar-subscription-table-wrap\s*\{[^}]*max-width: 100%/, "the workspace list should contain horizontal overflow");
assert.match(frameworkCss, /\.calendar-subscription-row-actions\s*\{[^}]*flex-wrap: wrap/, "row actions should wrap on narrow screens");
assert.match(frameworkCss, /\[data-calendar-subscription-url\]\s*\{[^}]*min-width: 0;[^}]*width: 100%;/, "long subscription URLs should stay bounded");

assert.match(renderedSpec, /Calendar subscriptions support Workspace, Client, and Project lifecycle/, "Playwright should render the complete administrator lifecycle");
assert.match(renderedSpec, /toHaveAttribute\("type", "password"\)[^]*toHaveAttribute\("type", "text"\)/, "rendered proof should cover reveal masking");
assert.match(renderedSpec, /another owner[^]*Rotate[^]*toHaveCount\(0\)/i, "rendered proof should preserve another owner's secret boundary");
assert.match(renderedSpec, /scrollWidth[^]*innerWidth/, "rendered proof should check page overflow");

assert.match(settingsHelp, /## Calendar subscription/i, "Help should document the shipped subscription workflow");
assert.match(settingsHelp, /Settings[^]*Admin[^]*Modules[^]*Calendar/i, "Help should direct administrators to the dedicated destination");
assert.match(settingsHelp, /read-only/i, "Help should preserve provider-neutral read-only framing");
assert.match(settingsHelp, /periodic/i, "Help should explain refresh timing");
assert.doesNotMatch(settingsHelp, /Google Calendar sync/i, "Help must not imply provider-specific synchronization");

const packageData = JSON.parse(packageJson);
const packageLockData = JSON.parse(packageLock);
assert.equal(packageLockData.version, packageData.version, "package and lockfile versions should match");
assert.equal(packageLockData.packages[""].version, packageData.version, "lockfile root package version should match");
assertRoadmapCursorAtLeast(packageData.version, "the Calendar administration correction should not move the roadmap backward");
assert.doesNotMatch(roadmap, /^## Version 0\.33\.22\.9(?:\s|-)/m, "the completed Calendar correction stack should leave the live roadmap");
assert.match(roadmapArchive, /^## Version 0\.33\.22\.9\.2 - Admin Calendar module surface, User Settings removal, and closeout/m, "the completed slice should be archived");
assert.match(changelog, /^## Version 0\.33\.22\.9\.2 - 2026-07-25/m, "the completed slice should be recorded in the changelog");

console.log("Calendar subscription settings regression passed.");

async function readText(relativePath) {
  return fs.readFile(path.join(root, ...relativePath.split("/")), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
