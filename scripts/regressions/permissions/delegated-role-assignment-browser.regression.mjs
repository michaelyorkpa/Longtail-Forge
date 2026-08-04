export const regressionMeta = Object.freeze({
  id: "permissions.delegated-role-assignment-browser",
  area: "permissions",
  tier: "focused",
  tags: ["accessibility", "app-shell", "browser", "modules", "permissions", "users"],
  description: "Pins the dedicated exact-account Role Assignments browser surface without reopening full User Administration.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const moduleSource = await read("src/modules/users/module.js");
const appShellSource = await read("src/services/app-shell.service.js");
const permissionsSource = await read("src/services/permissions.service.js");
const html = await read("views/protected/role-assignments.html");
const browser = await read("public/js/role-assignments.js");
const css = await read("public/css/longtail-forge.css");
const permissionHarness = await read("scripts/permission-regression.mjs");

assert.match(
  moduleSource,
  /label: "Role Assignments"[\s\S]*href: "role-assignments\.html"[\s\S]*requiredPermissions: \["roles\.assign"\]/,
);
assert.match(
  moduleSource,
  /id: "role-assignments"[\s\S]*path: "\/role-assignments\.html"[\s\S]*requiredPermissions: \["roles\.assign"\]/,
);
assert.match(
  moduleSource,
  /id: "role-assignments-script"[\s\S]*path: "\/js\/role-assignments\.js"[\s\S]*views: \["role-assignments"\][\s\S]*requiredPermissions: \["roles\.assign"\]/,
);
assert.match(
  moduleSource,
  /id: "user-admin"[\s\S]*path: "\/user-admin\.html"[\s\S]*requiredPermissions: \["users\.manage"\]/,
  "full User Admin must retain its users.manage gate",
);

assert.match(permissionsSource, /async function hasUsableDelegatedRoleScope\(session\)/);
assert.match(permissionsSource, /return options\.roles\.some\(\(role\) => Array\.isArray\(role\.scopes\) && role\.scopes\.length > 0\)/);
assert.match(appShellSource, /permissionsService\.hasUsableDelegatedRoleScope\(session\)/);
assert.match(appShellSource, /roleAssignmentsDelegate: canDelegateRoleAssignments/);
assert.match(
  appShellSource,
  /availableTools\.has\("team_members"\) && permissionHints\.roleAssignmentsDelegate[\s\S]*moduleNavByHref\.get\("role-assignments\.html"\)/,
);
assert.match(
  appShellSource,
  /!\["role-assignments\.html", "user-admin\.html"\]\.includes\(item\.href\)/,
  "Role Assignments should not be duplicated under module settings",
);

for (const marker of [
  "data-role-account-lookup",
  "data-role-account-email",
  "data-find-role-account",
  "data-role-assignment-status",
  "data-role-target",
  "data-delegated-role-list",
  "data-add-delegated-role",
  "data-delegated-role",
  "data-delegated-scope",
]) {
  assert.ok(html.includes(marker), `Role Assignments HTML should retain ${marker}`);
}
assert.match(html, /type="email"[\s\S]*autocomplete="off"[\s\S]*spellcheck="false"/);
assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
assert.match(html, /aria-labelledby="delegated-role-target-heading"/);
assert.match(html, /data-role-target-heading tabindex="-1"/);
assert.match(html, /<script src="js\/shared\/modal\.js"><\/script>[\s\S]*<script src="js\/role-assignments\.js"><\/script>/);
assert.doesNotMatch(html, /<table|data-user-list|Workspace Memberships|Active Sessions|Reset Password|Delete User|permission matrix/i);

assert.match(browser, /postJson\("\/api\/role-assignments\/lookup"/);
assert.match(browser, /putJson\(\s*`\/api\/users\/\$\{encodeURIComponent\(target\.userId\)\}\/role-assignments`/);
assert.match(browser, /assignmentRevision: target\.assignmentRevision/);
assert.match(browser, /roleOptions = Array\.isArray\(body\.roles\)/);
assert.match(browser, /scope\.label \|\| "Available scope"/);
assert.match(browser, /No active workspace member matched that email\./);
assert.match(browser, /No delegable assignments are currently shown\./);
assert.match(browser, /title: "Add role assignment\?"/);
assert.match(browser, /title: "Remove role assignment\?"/);
assert.match(browser, /danger: true/);
assert.match(browser, /Assignments changed\. Find the account again before making another change\./);
assert.match(browser, /targetHeading\.focus\(\)/);
assert.match(browser, /accountEmailInput\.focus\(\)/);
assert.match(browser, /window\.LongtailForge\.recovery\?\.permissionDenied\(\)/);
assert.doesNotMatch(browser, /\/api\/users(?:["?`]|\/sessions)|permission_overrides|displayNameInput|altEmail|password|membership/i);
assert.doesNotMatch(browser, /\.textContent\s*=\s*[^;\n]*(?:role_id|scope_id|userId)/);

assert.match(css, /\.delegated-role-assignments-page/);
assert.match(css, /\[data-role-assignment-status\]\.is-error/);

for (const proof of [
  "client administrator can load dedicated Role Assignments",
  "project administrator can load dedicated Role Assignments",
  "workspace administrator can load dedicated Role Assignments",
  "role without roles.assign cannot load dedicated Role Assignments",
  "client administrator still cannot load full User Admin",
  "workspace administrator retains full User Admin",
  "delegated account lookup returns a calm not-found result",
  "client admin role options disclose only delegable roles and authorized scopes",
  "stale delegated assignment revisions fail closed",
  "project admin lookup does not disclose hidden client assignment data",
]) {
  assert.ok(permissionHarness.includes(proof), `permission harness should retain proof: ${proof}`);
}

console.log("Delegated role-assignment browser regression passed.");

async function read(relativePath) {
  return fs.readFile(path.join(root, relativePath), "utf8");
}
