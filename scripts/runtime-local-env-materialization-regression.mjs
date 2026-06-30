import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.19.6";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const envExample = readText(".env.example");
const gitignore = readText(".gitignore");
const runtimeDocs = readText("docs/runtime-configuration.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const configSource = readText("src/config.js");
const dbIndexSource = readText("src/db/index.js");
const settingsRepoSource = readText("src/repositories/settings.repo.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the local .env materialization slice version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the local .env materialization slice version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the local .env materialization slice version");

assert.match(gitignore, /^\.env$/m, "real .env files should remain ignored");
assert.match(envExample, /^LONGTAIL_INITIAL_WORKSPACE_NAME=Longtail Forge Workspace$/m, ".env.example should document the generic initial workspace name");
assert.match(envExample, /^SUPER_ADMIN_DISPLAY_NAME=Super Admin$/m, ".env.example should document the initial super-admin display name");
assert.match(runtimeDocs, /`LONGTAIL_INITIAL_WORKSPACE_NAME`[\s\S]*first fresh-start workspace/, "runtime docs should describe the initial workspace name");
assert.match(runtimeDocs, /`SUPER_ADMIN_DISPLAY_NAME`[\s\S]*initial protected super-admin account/, "runtime docs should describe the super-admin display name");
assert.match(roadmap, /### Version 0\.33\.5\.19\.1\.2 - Local `.env` materialization and remaining config hardcode audit/, "roadmap should include the local .env materialization slice");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the local .env materialization slice");

assert.match(configSource, /DEFAULT_INITIAL_WORKSPACE_NAME = "Longtail Forge Workspace"/, "config should keep only a generic fallback for first workspace name");
assert.match(configSource, /initialWorkspaceName: readText\(env, "LONGTAIL_INITIAL_WORKSPACE_NAME"/, "config should read the initial workspace name from runtime config");
assert.match(configSource, /superAdminDisplayName: readText\(env, "SUPER_ADMIN_DISPLAY_NAME"/, "config should read the super-admin display name from runtime config");
assert.match(dbIndexSource, /const DEFAULT_WORKSPACE_NAME = config\.bootstrap\.initialWorkspaceName;/, "database bootstrap should use the runtime-configured workspace name");
assert.match(dbIndexSource, /const DEFAULT_SUPER_ADMIN_DISPLAY_NAME = config\.bootstrap\.superAdminDisplayName;/, "database bootstrap should use the runtime-configured super-admin display name");
assert.doesNotMatch(dbIndexSource, /Raymond Tec/, "database bootstrap should not hardcode this checkout's workspace name");
assert.doesNotMatch(dbIndexSource, /const DEFAULT_SUPER_ADMIN_DISPLAY_NAME = "Super Admin"/, "database bootstrap should not hardcode the super-admin display name");
assert.match(settingsRepoSource, /const DEFAULT_WORKSPACE_NAME = config\.bootstrap\.initialWorkspaceName;/, "settings fallback should use the runtime-configured workspace name");
assert.doesNotMatch(settingsRepoSource, /Raymond Tec/, "settings fallback should not hardcode this checkout's workspace name");

const customConfig = readConfig({
  LONGTAIL_INITIAL_WORKSPACE_NAME: "Acme Local Workspace",
  SUPER_ADMIN_DISPLAY_NAME: "Primary Admin",
});
assert.equal(customConfig.initialWorkspaceName, "Acme Local Workspace");
assert.equal(customConfig.superAdminDisplayName, "Primary Admin");

assert.match(regressionSuite, /scripts\/runtime-local-env-materialization-regression\.mjs/, "regression suite should include the local .env materialization regression");

console.log("Runtime local .env materialization regression passed.");

function readConfig(overrides = {}) {
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import { config } from "./src/config.js";
    console.log(JSON.stringify({
      initialWorkspaceName: config.bootstrap.initialWorkspaceName,
      superAdminDisplayName: config.bootstrap.superAdminDisplayName
    }));
  `], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv(overrides),
  });

  assert.equal(child.status, 0, child.stderr || child.stdout);
  return JSON.parse(child.stdout.trim());
}

function cleanEnv(overrides = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      key.startsWith("LONGTAIL_") ||
      key.startsWith("SECURE_NOTES_") ||
      key === "DATABASE_URL" ||
      key === "HOST" ||
      key === "PORT" ||
      key === "SQLITE_COMMAND" ||
      key === "SUPER_ADMIN_DISPLAY_NAME" ||
      key === "SUPER_ADMIN_PASSWORD" ||
      key === "SUPER_ADMIN_USERNAME" ||
      key === "TRUST_PROXY" ||
      key === "WORKSPACE_INSTALL_MODE" ||
      key === "WORKSPACE_TYPE_LIMIT"
    ) {
      delete env[key];
    }
  }

  return { ...env, ...overrides };
}

function readText(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
