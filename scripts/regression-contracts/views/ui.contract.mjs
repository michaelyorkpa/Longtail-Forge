import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createProjectTextReader, extractFunctionBody } from "../../test-support/source-scan.mjs";
// Consolidated under views.current-static-contracts by 0.33.33.9.
const { readText } = createProjectTextReader();

const files = {
  appShell: readText("src/services/app-shell.service.js"),
  moduleSettings: readText("public/js/module-settings.js"),
  navigation: readText("public/js/navigation.js"),
  settingsRenderer: readText("public/js/shared/settings-renderer.js"),
  settingsHost: readText("public/js/shared/settings-host.js"),
  settingsCatalog: readText("src/services/settings-catalog.service.js"),
  settingsRoutes: readText("src/routes/settings.routes.js"),
  usersModule: readText("src/modules/users/module.js"),
  timeTrackingSettingsView: readText("views/protected/time-tracking-settings.html"),
  userSettings: readText("public/js/user-settings.js"),
  userSettingsView: readText("views/protected/user-settings.html"),
  userAdmin: readText("public/js/user-admin.js"),
  userAdminView: readText("views/protected/user-admin.html"),
  workspaceSettings: readText("public/js/workspace-settings.js"),
  workspaceSettingsView: readText("views/protected/workspace-settings.html"),
  tasksSettingsView: readText("views/protected/tasks-settings.html"),
  styles: readText("public/css/longtail-forge.css"),
};

const legacyModuleFlagPattern = /\b(?:timeTrackingEnabled|tasksEnabled|taskTimersEnabled)\b/;

assert.doesNotMatch(
  files.settingsRenderer,
  legacyModuleFlagPattern,
  "shared settings renderer must not special-case first-party module setting IDs",
);

assert.doesNotMatch(
  extractFunctionBody(files.workspaceSettings, "normalizeSettings"),
  legacyModuleFlagPattern,
  "Workspace Settings normalization must not carry top-level legacy module flags into save payloads",
);

assert.doesNotMatch(
  extractFunctionBody(files.moduleSettings, "normalizeSettings"),
  legacyModuleFlagPattern,
  "Module Settings normalization must not carry top-level legacy module flags into save payloads",
);

assert.match(
  files.userSettings,
  /moduleSettings:\s*window\.LongtailForge\.settingsRenderer\.collectPayload\(workspaceCreateForm\)/,
  "Create Workspace must submit initial module state through moduleSettings",
);
assert.match(
  extractFunctionBody(files.workspaceSettings, "saveSettings"),
  /settings\.moduleSettings\s*=\s*readModuleSettingsPayload\(\)/,
  "Workspace Settings save must preserve the keyed moduleSettings payload shape",
);
assert.doesNotMatch(
  extractFunctionBody(files.userSettings, "createWorkspace"),
  /\btimeTrackingEnabled\b/,
  "Create Workspace browser payload must not submit deprecated timeTrackingEnabled",
);

assert.match(
  files.appShell,
  /modulesService\.listModuleSettingsNavigation/,
  "app shell must read module settings navigation from module metadata",
);
assert.doesNotMatch(
  extractFunctionBody(files.appShell, "buildNavigation"),
  /\b(?:tasks-settings|time-tracking-settings)\b/,
  "app shell buildNavigation must not hard-code first-party module settings links",
);
assert.doesNotMatch(
  readObjectArray(files.usersModule, "navigation"),
  /user-settings\.html/,
  "User Settings is framework-owned and must not be contributed by the Users module navigation",
);
assert.match(
  extractFunctionBody(files.appShell, "addModuleNavItem"),
  /const href = String\(item\?\.href \|\| ""\)[\s\S]*targetItems\.some\(\(existingItem\) => existingItem\.href === href\)/,
  "app shell menu composition must de-duplicate module navigation by href",
);

assert.doesNotMatch(
  files.navigation,
  /\b(?:TIME_TRACKING_NAV_HREFS|TASKS_NAV_HREFS)\b/,
  "browser fallback navigation must not keep first-party module href sets",
);
assert.doesNotMatch(
  readConstArray(files.navigation, "NAV_ITEMS"),
  /\b(?:time-tracker\.html|manual-entry\.html|edit-entries\.html|tasks\.html|tasks-settings\.html|time-tracking-settings\.html)\b/,
  "browser fallback navigation should stay framework-owned until bootstrap navigation loads",
);

for (const [label, view] of Object.entries({
  workspaceSettingsView: files.workspaceSettingsView,
  tasksSettingsView: files.tasksSettingsView,
  timeTrackingSettingsView: files.timeTrackingSettingsView,
  userSettingsView: files.userSettingsView,
})) {
  assert.match(view, /js\/shared\/view-builder\.js[\s\S]*js\/shared\/settings-renderer\.js[\s\S]*js\/shared\/settings-host\.js/, `${label} must load the Settings primitive, renderer, and host assets in order`);
  assert.match(view, /js\/shared\/settings-renderer\.js/, `${label} must load settings-renderer with the updated cache key`);
  assert.doesNotMatch(view, /settings-(?:controls|normalizers)\.js/, `${label} must not load the retired parallel Settings path`);
  assert.match(view, /js\/shared\/status\.js/, `${label} must load status helper with a cache key`);
  assert.match(view, /<main[^>]+data-settings-host="(?:workspace|user|module)"[^>]*><\/main>/, `${label} must be a minimal Settings host`);
  assert.doesNotMatch(view, /<(?:form|fieldset|label|input|select|button|dialog)\b/, `${label} must not retain hand-built Settings anatomy`);
}
assert.equal(existsSync(new URL("../../../public/js/shared/settings-controls.js", import.meta.url)), false);
assert.equal(existsSync(new URL("../../../public/js/shared/settings-normalizers.js", import.meta.url)), false);
assert.match(files.settingsRenderer, /function applyDependentVisibility/);
assert.match(files.settingsRenderer, /function showValidationErrors/);
assert.match(files.settingsRenderer, /className: "view-settings-section"/);
assert.match(files.settingsRoutes, /settingsRoutes\.get\("\/settings\/catalog"/);
assert.match(files.settingsCatalog, /attachmentPoints:[\s\S]*\n    attachments,/);
assert.match(files.settingsCatalog, /modulesService\.listSettingsContributions\(workspaceId, session\)/);
assert.match(files.settingsHost, /attachment\("workspace"\)/);
assert.match(files.settingsHost, /attachment\("user"\)/);
assert.match(files.settingsHost, /attachment\("new-workspace"/);
assert.match(files.settingsHost, /attachment\("module"/);
assert.doesNotMatch(files.settingsHost, /document\.createElement\(/);
assert.match(files.workspaceSettings, /getJson\("\/api\/settings\/catalog"/);
assert.match(files.moduleSettings, /getJson\("\/api\/settings\/catalog"/);
assert.match(files.userSettings, /getJson\("\/api\/settings\/catalog"/);

assert.match(
  files.styles,
  /--page-standard-width:\s*1120px/,
  "workspace page width must be centralized at the dashboard/workspace standard width",
);
assert.match(
  files.styles,
  /\.wide-page\s*\{[\s\S]*width:\s*min\(94vw,\s*var\(--page-standard-width\)\)/,
  "wide protected pages must use the standard workspace width",
);
assert.match(
  files.styles,
  /\.workspace-settings-page\s*\{[\s\S]*width:\s*min\(94vw,\s*var\(--page-standard-width\)\)/,
  "Workspace Settings must use the standard workspace width",
);
assert.match(
  files.styles,
  /\.user-admin-page\s*\{[\s\S]*width:\s*min\(94vw,\s*var\(--page-standard-width\)\)/,
  "User Admin must use the standard workspace width",
);
assert.match(files.userAdminView, /data-new-user-workspace/, "Add User must expose the authorized workspace selector");
assert.match(files.userAdminView, /data-find-user-account/, "Add User must provide explicit exact-account lookup");
assert.match(files.userAdminView, /data-new-user-client-scope-field[^>]*hidden/, "client scope must start conditionally hidden");
assert.match(files.userAdminView, /data-new-user-project-scope-field[^>]*hidden/, "project scope must start conditionally hidden");
assert.match(files.userAdmin, /getJson\(`\/api\/users\/add-options\$\{query\}`/, "Add User must load server-shaped workspace, role, and scope options");
assert.match(files.userAdmin, /postJson\("\/api\/users\/lookup"/, "Add User must use exact-account lookup before submission");
assert.match(extractFunctionBody(files.userAdmin, "renderNewUserScopeOptions"), /scopeType !== "client"/);
assert.match(extractFunctionBody(files.userAdmin, "renderNewUserScopeOptions"), /scopeType !== "project"/);
assert.doesNotMatch(
  extractFunctionBody(files.userAdmin, "createUser"),
  /scope_type:\s*initialRoleId === "super_admin"/,
  "Add User must not reconstruct role scope policy in the browser",
);

console.log("UI contract regression passed.");

/** @param {string} source @param {string} constName @returns {string} */
function readConstArray(source, constName) {
  const marker = `const ${constName} = [`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${constName} array was not found`);

  let depth = 0;
  for (let index = start + marker.length - 1; index < source.length; index += 1) {
    const char = source[index];

    if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`${constName} array did not close`);
}

/** @param {string} source @param {string} propertyName @returns {string} */
function readObjectArray(source, propertyName) {
  const marker = `${propertyName}: [`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${propertyName} array was not found`);

  let depth = 0;
  for (let index = start + marker.length - 1; index < source.length; index += 1) {
    const char = source[index];

    if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`${propertyName} array did not close`);
}
