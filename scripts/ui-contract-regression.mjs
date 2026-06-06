import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = {
  appShell: readText("src/services/app-shell.service.js"),
  moduleSettings: readText("public/js/module-settings.js"),
  navigation: readText("public/js/navigation.js"),
  settingsControls: readText("public/js/shared/settings-controls.js"),
  timeTrackingSettingsView: readText("views/protected/time-tracking-settings.html"),
  userSettings: readText("public/js/user-settings.js"),
  userSettingsView: readText("views/protected/user-settings.html"),
  workspaceSettings: readText("public/js/workspace-settings.js"),
  workspaceSettingsView: readText("views/protected/workspace-settings.html"),
  tasksSettingsView: readText("views/protected/tasks-settings.html"),
};

const legacyModuleFlagPattern = /\b(?:timeTrackingEnabled|tasksEnabled|taskTimersEnabled)\b/;

assert.doesNotMatch(
  files.settingsControls,
  legacyModuleFlagPattern,
  "shared settings controls must not special-case first-party module setting IDs",
);

assert.doesNotMatch(
  readFunctionBody(files.workspaceSettings, "normalizeSettings"),
  legacyModuleFlagPattern,
  "Workspace Settings normalization must not carry top-level legacy module flags into save payloads",
);

assert.doesNotMatch(
  readFunctionBody(files.moduleSettings, "normalizeSettings"),
  legacyModuleFlagPattern,
  "Module Settings normalization must not carry top-level legacy module flags into save payloads",
);

assert.match(
  files.userSettings,
  /moduleSettings:\s*window\.LongtailForge\.settingsControls\.readModuleSettingsPayload\(workspaceCreateForm\)/,
  "Create Workspace must submit initial module state through moduleSettings",
);
assert.doesNotMatch(
  readFunctionBody(files.userSettings, "createWorkspace"),
  /\btimeTrackingEnabled\b/,
  "Create Workspace browser payload must not submit deprecated timeTrackingEnabled",
);

assert.match(
  files.appShell,
  /modulesService\.listModuleSettingsNavigation/,
  "app shell must read module settings navigation from module metadata",
);
assert.doesNotMatch(
  readFunctionBody(files.appShell, "buildNavigation"),
  /\b(?:tasks-settings|time-tracking-settings)\b/,
  "app shell buildNavigation must not hard-code first-party module settings links",
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
  assert.match(view, /js\/shared\/settings-normalizers\.js\?v=1/, `${label} must load settings-normalizers with a cache key`);
  assert.match(view, /js\/shared\/settings-controls\.js\?v=2/, `${label} must load settings-controls with the updated cache key`);
  assert.match(view, /js\/shared\/status\.js\?v=1/, `${label} must load status helper with a cache key`);
}

console.log("UI contract regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function readFunctionBody(source, functionName) {
  const marker = `function ${functionName}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${functionName} function was not found`);

  const bodyStart = source.indexOf("{", start);
  assert.notEqual(bodyStart, -1, `${functionName} function body was not found`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(bodyStart, index + 1);
      }
    }
  }

  throw new Error(`${functionName} function body did not close`);
}

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
