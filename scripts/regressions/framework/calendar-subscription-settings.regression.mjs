export const regressionMeta = Object.freeze({
  id: "framework.calendar-subscription-settings",
  area: "framework",
  tier: "release-gate",
  tags: ["calendar", "help", "security", "settings", "tasks", "views"],
  description: "Pins the User Settings calendar-subscription lifecycle, transient bearer-URL handling, client guidance, and framework/Tasks ownership boundary.",
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
  userSettings,
  frameworkCss,
  privateFeedRoutes,
  privateFeedService,
  renderedSpec,
  settingsHelp,
  userSettingsView,
  packageJson,
  packageLock,
  roadmap,
  roadmapArchive,
  changelog,
] = await Promise.all([
  readText("public/js/shared/settings-host.js"),
  readText("public/js/user-settings.js"),
  readText("public/css/longtail-forge.css"),
  readText("src/routes/private-feeds.routes.js"),
  readText("src/services/private-feeds.service.js"),
  readText("tests/e2e/user-settings-appearance.spec.mjs"),
  readText("help/framework/settings-and-user-preferences.md"),
  readText("views/protected/user-settings.html"),
  readText("package.json"),
  readText("package-lock.json"),
  readText("ROADMAP.md"),
  readText("ROADMAP-ARCHIVE.md"),
  readText("CHANGELOG.md"),
]);

assert.match(userSettingsView, /js\/shared\/modal\.js[^]*js\/user-settings\.js/, "User Settings should load the shared confirmation helper before lifecycle controls");
assert.match(settingsHost, /settingsSection\("Calendar Subscription"/, "User Settings should use the shared settings anatomy");
assert.match(settingsHost, /id: "calendarSubscriptionUrl"[^]*inputType: "password"[^]*readonly: ""[^]*calendarSubscriptionUrlField/, "the private URL should start masked and read-only");
for (const [label, actionId] of [
  ["Enable Subscription", "enableCalendarSubscription"],
  ["Reveal URL", "revealCalendarSubscription"],
  ["Copy URL", "copyCalendarSubscription"],
  ["Rotate URL", "rotateCalendarSubscription"],
  ["Disable Subscription", "disableCalendarSubscription"],
]) {
  assert.match(settingsHost, new RegExp(`action\\("${label}", "${actionId}"`), `${label} should use shared action anatomy`);
}
for (const officialUrl of [
  "https://support.google.com/calendar/answer/37100",
  "https://support.apple.com/guide/calendar/subscribe-to-calendars-icl1022/mac",
  "https://support.microsoft.com/en-US/Outlook/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web",
  "https://support.mozilla.org/en-US/kb/creating-new-calendars",
]) {
  assert.match(settingsHost, new RegExp(escapeRegExp(officialUrl)), `User Settings should link to ${officialUrl}`);
}
assert.match(settingsHost, /periodically, not in real time/, "in-product guidance should set refresh expectations");
assert.match(settingsHost, /read-only bearer secret/, "in-product guidance should name the private URL's security boundary");

assert.match(userSettings, /let calendarSubscriptionUrl = "";/, "the raw bearer URL should live only in page memory");
assert.doesNotMatch(userSettings, /(?:localStorage|sessionStorage)[^\n]*calendarSubscription/i, "the raw bearer URL must not enter browser storage");
assert.match(userSettings, /applyCalendarSubscriptionStatus\(body\.status\);/, "status reads should hydrate lifecycle state without a URL");
assert.match(userSettings, /postJson\("\/api\/private-feeds\/calendar"\)[^]*applyCalendarSubscriptionStatus\(body\.status, body\.feedUrl\)/, "enable should consume the one-time URL response");
assert.match(userSettings, /postJson\("\/api\/private-feeds\/calendar\/rotate"\)[^]*applyCalendarSubscriptionStatus\(body\.status, body\.feedUrl\)/, "rotation should consume the replacement URL response");
assert.match(userSettings, /deleteJson\("\/api\/private-feeds\/calendar"\)[^]*applyCalendarSubscriptionStatus\(body\.status\)/, "disable should clear the URL through lifecycle state");
assert.match(userSettings, /stores only its hash and will not show it again/, "the UI should explain why an active URL cannot be recovered");
assert.match(userSettings, /navigator\.clipboard\.writeText\(calendarSubscriptionUrl\)[^]*document\.execCommand\("copy"\)/, "copy should use the clipboard with the existing fallback");
assert.match(userSettings, /title: "Rotate calendar subscription URL\?"[^]*stop working immediately/, "rotation should require an explicit revocation warning");
assert.match(userSettings, /title: "Disable calendar subscription\?"[^]*stop working immediately/, "disable should require an explicit revocation warning");

assert.match(frameworkCss, /\.calendar-subscription-client-list\s*\{/, "client guidance should have bounded shared-page styling");
assert.match(frameworkCss, /\[data-calendar-subscription-url\]\s*\{[^}]*min-width: 0;[^}]*width: 100%;/, "long subscription URLs should stay bounded inside the settings surface");
assert.match(frameworkCss, /\[data-calendar-subscription-url-field\]\[hidden\]\s*\{\s*display: none;/, "the masked URL field should fully leave layout when no current-page secret exists");

assert.match(privateFeedRoutes, /get\("\/private-feeds\/calendar"[^]*status: await privateFeedsService\.getCalendarStatus/, "status should remain session-owned and framework-served");
assert.match(privateFeedService, /function toPublicStatus\(token\)[^]*createdAt[^]*disabledAt[^]*enabled[^]*rotatedAt/, "status should remain lifecycle-only");
assert.doesNotMatch(privateFeedService.match(/function toPublicStatus\(token\)[^]*?\n\}/)?.[0] || "", /feedUrl|token_selector|token_hash/, "status must not expose or reconstruct the bearer secret");

assert.match(renderedSpec, /Calendar Subscription can be enabled, revealed, rotated, and disabled/, "Playwright should render the complete lifecycle");
assert.match(renderedSpec, /toHaveAttribute\("type", "password"\)[^]*toHaveAttribute\("type", "text"\)/, "rendered proof should cover reveal masking");
assert.match(renderedSpec, /toHaveValue\("https:\/\/example\.test\/feeds\/calendar\/ltf_feed_test_2\.ics"\)[^]*toHaveValue\(""\)/, "rendered proof should cover replacement and disable clearing");

assert.match(settingsHelp, /## Calendar subscription/i, "Help should document the shipped subscription workflow");
assert.match(settingsHelp, /read-only/i, "Help should preserve provider-neutral read-only framing");
assert.match(settingsHelp, /periodic/i, "Help should explain refresh timing");
assert.doesNotMatch(settingsHelp, /Google Calendar sync/i, "Help must not imply provider-specific synchronization");

const packageData = JSON.parse(packageJson);
const packageLockData = JSON.parse(packageLock);
assert.equal(packageLockData.version, packageData.version, "package and lockfile versions should match");
assert.equal(packageLockData.packages[""].version, packageData.version, "lockfile root package version should match");
assertRoadmapCursorAtLeast(packageData.version, "the completed User Settings slice should remain closed while the operator-requested calendar correction stack advances");
assert.doesNotMatch(roadmap, /^## Version 0\.33\.22 /m, "the completed 0.33.22 branch should leave the live roadmap");
assert.match(roadmapArchive, /^## Version 0\.33\.22\.8 - Subscription UI, documentation, and closeout/m, "the completed slice should be archived");
assert.match(changelog, /^## Version 0\.33\.22\.8 - 2026-07-24/m, "the shipped slice should be recorded in the changelog");

console.log("Calendar subscription settings regression passed.");

async function readText(relativePath) {
  return fs.readFile(path.join(root, ...relativePath.split("/")), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
