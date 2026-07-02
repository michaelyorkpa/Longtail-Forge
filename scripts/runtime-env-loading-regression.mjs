import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadRuntimeEnvFile, parseRuntimeEnvText } from "../src/runtime-env.js";

const root = process.cwd();
const appVersion = "0.33.5.21.7.5";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const serverSource = readText("server.js");
const runtimeEnvSource = readText("src/runtime-env.js");
const runtimeDocs = readText("docs/runtime-configuration.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const gitignore = readText(".gitignore");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the local .env loading slice version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the local .env loading slice version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the local .env loading slice version");

assert.match(gitignore, /^\.env$/m, "real .env files should remain ignored");
assert.match(serverSource, /loadRuntimeEnvFile\(\);[\s\S]*await import\("\.\/src\/core\/app\.js"\)/, "server startup should load .env before importing app/config");
assert.doesNotMatch(runtimeEnvSource, /from "\.\/config\.js"|from "\.\.\/config\.js"/, "runtime env loader must not import config");
assert.match(runtimeDocs, /At app startup, `server\.js` loads a local root `.env` file when present/, "runtime docs should document startup .env loading");
assert.match(runtimeDocs, /Process environment values win over `.env` values/, "runtime docs should document precedence");
assert.match(roadmap, /Completed 0\.33\.5\.19 runtime configuration and SQLite small-office foundation work is archived/, "roadmap should archive the completed local .env loading branch");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the local .env loading slice");
assert.match(regressionSuite, /scripts\/runtime-env-loading-regression\.mjs/, "regression suite should include the runtime env loading regression");

const parsed = parseRuntimeEnvText(`
# Leading comments and blank lines are ignored.

PORT=8123
LONGTAIL_PUBLIC_URL="http://localhost:8123/path#with-hash"
SINGLE_QUOTED='quoted value # kept'
UNQUOTED=hello world # trailing comment
ESCAPED="line\\nnext\\tindent"
export LONGTAIL_ENV=development
EMPTY_VALUE=
`, "example.env");
assert.equal(parsed.PORT, "8123");
assert.equal(parsed.LONGTAIL_PUBLIC_URL, "http://localhost:8123/path#with-hash");
assert.equal(parsed.SINGLE_QUOTED, "quoted value # kept");
assert.equal(parsed.UNQUOTED, "hello world");
assert.equal(parsed.ESCAPED, "line\nnext\tindent");
assert.equal(parsed.LONGTAIL_ENV, "development");
assert.equal(parsed.EMPTY_VALUE, "");

assert.throws(
  () => parseRuntimeEnvText("not valid", "broken.env"),
  /broken\.env:1 must use KEY=VALUE syntax/,
  "malformed .env lines should fail clearly",
);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ltf-runtime-env-"));
try {
  const envFile = path.join(tempDir, ".env");
  fs.writeFileSync(envFile, `
PORT=8123
LONGTAIL_PUBLIC_URL="http://localhost:8123"
LONGTAIL_SESSION_COOKIE_SAMESITE=Strict
`, "utf8");

  const missingEnv = {};
  const missingResult = loadRuntimeEnvFile({
    env: missingEnv,
    envFile: path.join(tempDir, "missing.env"),
  });
  assert.deepEqual(missingResult, {
    loaded: false,
    path: path.join(tempDir, "missing.env"),
    parsed: 0,
    applied: 0,
    skipped: 0,
  });
  assert.deepEqual(missingEnv, {}, "missing .env should not mutate env");

  const env = { PORT: "9000" };
  const result = loadRuntimeEnvFile({ env, envFile });
  assert.equal(result.loaded, true);
  assert.equal(result.parsed, 3);
  assert.equal(result.applied, 2);
  assert.equal(result.skipped, 1);
  assert.equal(env.PORT, "9000", "existing process env should win over .env");
  assert.equal(env.LONGTAIL_PUBLIC_URL, "http://localhost:8123");
  assert.equal(env.LONGTAIL_SESSION_COOKIE_SAMESITE, "Strict");

  const configFromEnvFile = readConfigAfterEnvLoad(envFile);
  assert.equal(configFromEnvFile.port, 8123);
  assert.equal(configFromEnvFile.publicUrl, "http://localhost:8123");
  assert.equal(configFromEnvFile.cookieSameSite, "Strict");

  const configWithProcessOverride = readConfigAfterEnvLoad(envFile, { PORT: "9010" });
  assert.equal(configWithProcessOverride.port, 9010, "process env should override .env before config creation");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

for (const filePath of listFiles(path.join(root, "public")).concat(listFiles(path.join(root, "views")))) {
  if (!/\.(css|html|js)$/.test(filePath)) {
    continue;
  }

  const source = fs.readFileSync(filePath, "utf8");
  assert.doesNotMatch(source, /runtime-env|loadRuntimeEnvFile/, "browser/public files must not load server .env files");
}

console.log("Runtime .env loading regression passed.");

function readConfigAfterEnvLoad(envFile, overrides = {}) {
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import { loadRuntimeEnvFile } from "./src/runtime-env.js";
    loadRuntimeEnvFile({ envFile: process.env.LTF_TEST_ENV_FILE });
    const { config } = await import("./src/config.js");
    console.log(JSON.stringify({
      cookieSameSite: config.cookies.sameSite,
      port: config.port,
      publicUrl: config.publicUrl
    }));
  `], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv({
      LTF_TEST_ENV_FILE: envFile,
      ...overrides,
    }),
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

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

function readText(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
