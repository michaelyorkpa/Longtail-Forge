export const regressionMeta = Object.freeze({
  id: "release.maintenance-host-assets",
  area: "release",
  tier: "release-gate",
  tags: ["deployment", "maintenance", "proxy", "security"],
  description: "Proves maintenance assets and independent operator/deployment markers install with a least-privilege, host-neutral boundary.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertRoadmapCursorAtLeast } from "../../lib/roadmap-cursor.mjs";

/**
 * One synchronous helper-shell invocation result, captured as UTF-8 text.
 * @typedef {import("node:child_process").SpawnSyncReturns<string>} BashSpawnResult
 */

const helperPath = "scripts/release/longtail-forge-maintenance-host.example";
const pagePath = "scripts/release/longtail-forge-maintenance.html";
const environmentPath = "docs/longtail-forge-maintenance-helper.env.example";
const [
  helper,
  page,
  environment,
  attributes,
  previewDeployment,
  runtimeConfiguration,
  internetDeployment,
  decisions,
] = await Promise.all([
  fs.readFile(helperPath, "utf8"),
  fs.readFile(pagePath, "utf8"),
  fs.readFile(environmentPath, "utf8"),
  fs.readFile(".gitattributes", "utf8"),
  fs.readFile("docs/preview-deployment.md", "utf8"),
  fs.readFile("docs/runtime-configuration.md", "utf8"),
  fs.readFile("docs/internet-deployment.md", "utf8"),
  fs.readFile("DECISIONS.md", "utf8"),
]);

assert.match(helper, /^#!\/usr\/bin\/env bash\n/);
assert.match(attributes, /^scripts\/release\/longtail-forge-maintenance-host\.example text eol=lf$/m);
assert.match(helper, /readonly HELPER_ENV="\/etc\/longtail-forge\/maintenance-helper\.env"/);
assert.match(helper, /unset LTF_MAINTENANCE_OPERATOR_GROUP/);
assert.match(helper, /unset LTF_MAINTENANCE_STATE_ROOT/);
assert.match(helper, /unset LTF_MAINTENANCE_ASSET_ROOT/);
assert.match(helper, /unset LTF_MAINTENANCE_HELPER_PATH/);
assert.match(helper, /LTF_MAINTENANCE_OPERATOR_GROUP\|LTF_MAINTENANCE_STATE_ROOT\|LTF_MAINTENANCE_ASSET_ROOT\|LTF_MAINTENANCE_HELPER_PATH/);
assert.match(helper, /helper environment contains unsupported key/);
assert.match(helper, /helper environment contains duplicate key/);
assert.match(helper, /helper environment must have owner \$ROOT_UID, group \$ROOT_GID, and mode 644/);
assert.match(helper, /operator state must be root-owned, operator-group controlled, and mode 2771/);
assert.match(helper, /operator group must not be the root group/);
assert.match(helper, /operator group must not use root group ID 0/);
assert.match(helper, /require_root_controlled_directory "\$DEPLOYMENT_STATE_DIR" "711"/);
assert.match(helper, /require_root_controlled_directory "\$ASSET_ROOT" "755"/);
assert.match(helper, /require_root_controlled_file "\$PAGE_TARGET" "644"/);
assert.match(helper, /require_root_controlled_file "\$HELPER_PATH" "755"/);
assert.match(helper, /deployment marker changes require root/);
assert.match(helper, /marker must not be a symbolic link/);
assert.match(helper, /marker must be a regular file/);
assert.match(helper, /set -o noclobber/);
assert.match(helper, /umask 0003/);
assert.match(helper, /umask 0022/);
assert.match(helper, /secure filesystem matcher must be able to read the zero-byte/);
assert.match(helper, /Root remains its only writer/);
assert.doesNotMatch(helper, /chmod 0664|chmod 0644/, "marker creation must not follow a raced symbolic link through chmod");
assert.match(helper, /rm -- "\$marker_path"/);
assert.match(helper, /maintenance overall=%s operator=%s deployment=%s/);
assert.match(helper, /request routing is unchanged until the reviewed proxy configuration is installed/);

for (const source of [helper, page, environment]) {
  assert.doesNotMatch(source, /\bmike\b|raymondtec|10\.57\.67\.|rt-ltf|maintenance-staging|archive\//i);
}

assert.match(page, /<meta http-equiv="refresh" content="60">/);
assert.match(page, /<meta name="color-scheme" content="light dark">/);
assert.match(page, /@media \(prefers-color-scheme: dark\)/);
assert.match(page, /Longtail Forge is not available right now\. Please try again shortly\./);
assert.match(page, /refreshes automatically once a minute/);
assert.doesNotMatch(page, /<script|<link|<img|https?:\/\//i, "the maintenance page must have no executable or external dependency");
assert.doesNotMatch(page, /scheduled|backup|data is safe|your data|healthy/i, "default copy must not make unsupported operational claims");

for (const requirement of [
  /LTF_MAINTENANCE_OPERATOR_GROUP=longtail-forge-maintenance/,
  /LTF_MAINTENANCE_STATE_ROOT=\/var\/lib\/longtail-forge-maintenance/,
  /LTF_MAINTENANCE_ASSET_ROOT=\/usr\/local\/share\/longtail-forge-maintenance/,
  /LTF_MAINTENANCE_HELPER_PATH=\/usr\/local\/bin\/longtail-forge-maintenance/,
  /root:root[\s\S]*mode 0644/,
  /contains no secrets/i,
]) assert.match(environment, requirement);

for (const requirement of [
  /Root-owned maintenance asset and marker helper/,
  /longtail-forge-maintenance-host\.example/,
  /longtail-forge-maintenance-helper\.env\.example/,
  /operator on/,
  /operator off/,
  /deployment marker/i,
  /does not stop[\s\S]{0,80}route/i,
]) assert.match(previewDeployment, requirement);

for (const requirement of [
  /maintenance-helper\.env/,
  /LTF_MAINTENANCE_OPERATOR_GROUP/,
  /LTF_MAINTENANCE_STATE_ROOT/,
  /LTF_MAINTENANCE_ASSET_ROOT/,
  /LTF_MAINTENANCE_HELPER_PATH/,
  /not application runtime configuration/i,
]) assert.match(runtimeConfiguration, requirement);

for (const document of [previewDeployment, internetDeployment, decisions]) {
  assert.match(document, /operator[\s\S]{0,160}`0?664`|`0?664`[\s\S]{0,160}operator/i);
  assert.match(document, /deployment[\s\S]{0,160}`0?644`|`0?644`[\s\S]{0,160}deployment/i);
}

assertRoadmapCursorAtLeast("0.33.24.9", "maintenance branch closeout");

if (process.platform !== "win32") {
  await runExecutableBoundary();
}

console.log("Maintenance host asset and marker boundary regression passed.");

async function runExecutableBoundary() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-maintenance-assets-"));
  try {
    const sourceDir = path.join(rootDir, "source");
    const configDir = path.join(rootDir, "etc");
    const stateParent = path.join(rootDir, "state-parent");
    const assetParent = path.join(rootDir, "asset-parent");
    const binDir = path.join(rootDir, "bin");
    await Promise.all([
      fs.mkdir(sourceDir),
      fs.mkdir(configDir),
      fs.mkdir(stateParent),
      fs.mkdir(assetParent),
      fs.mkdir(binDir),
    ]);

    const identity = runBash("printf '%s\\n%s\\n%s\\n' \"$(id -u)\" \"$(id -g)\" \"$(id -gn)\"");
    const [uid, gid, groupName] = identity.stdout.trim().split("\n");
    assert.match(uid, /^\d+$/);
    assert.match(gid, /^\d+$/);
    assert.match(groupName, /^[a-z_][a-z0-9_-]*$/, "Linux regression user needs a POSIX-safe primary group");

    const configPath = path.join(configDir, "maintenance-helper.env");
    const stateRoot = path.join(stateParent, "maintenance");
    const assetRoot = path.join(assetParent, "maintenance");
    const installedHelper = path.join(binDir, "longtail-forge-maintenance");
    const executableSource = helper
      .replace("readonly ROOT_UID=0", `readonly ROOT_UID=${uid}`)
      .replace("readonly ROOT_GID=0", `readonly ROOT_GID=${gid}`)
      .replace(
        'readonly HELPER_ENV="/etc/longtail-forge/maintenance-helper.env"',
        `readonly HELPER_ENV="${toBashPath(configPath)}"`,
      );
    assert.notEqual(executableSource, helper, "the disposable fixture should replace root/config constants");
    await Promise.all([
      fs.writeFile(path.join(sourceDir, path.basename(helperPath)), executableSource, { mode: 0o755 }),
      fs.writeFile(path.join(sourceDir, path.basename(pagePath)), page),
      fs.writeFile(
        configPath,
        [
          `LTF_MAINTENANCE_OPERATOR_GROUP=${groupName}`,
          `LTF_MAINTENANCE_STATE_ROOT=${toBashPath(stateRoot)}`,
          `LTF_MAINTENANCE_ASSET_ROOT=${toBashPath(assetRoot)}`,
          `LTF_MAINTENANCE_HELPER_PATH=${toBashPath(installedHelper)}`,
          "",
        ].join("\n"),
        { mode: 0o644 },
      ),
    ]);
    await Promise.all([
      fs.chmod(configDir, 0o700),
      fs.chmod(stateParent, 0o700),
      fs.chmod(assetParent, 0o700),
      fs.chmod(binDir, 0o700),
    ]);

    const sourceHelper = path.join(sourceDir, path.basename(helperPath));
    assertSuccess(runBash(`${quote(toBashPath(sourceHelper))} install`), "install");
    assertSuccess(runBash(`${quote(toBashPath(installedHelper))} status`), "initial status", /overall=off operator=off deployment=off/);
    assertSuccess(runBash(`${quote(toBashPath(installedHelper))} operator on`), "operator on", /operator marker: on/);
    assertSuccess(runBash(`${quote(toBashPath(installedHelper))} operator on`), "idempotent operator on", /already active/);
    assertSuccess(runBash(`${quote(toBashPath(installedHelper))} deployment on`), "deployment on", /deployment marker: on/);
    const operatorMarker = path.join(stateRoot, "operator", "maintenance.on");
    const deploymentMarker = path.join(stateRoot, "deployment", "maintenance.on");
    assert.equal((await fs.stat(operatorMarker)).mode & 0o777, 0o664, "operator marker must be Caddy-readable without granting other write access");
    assert.equal((await fs.stat(deploymentMarker)).mode & 0o777, 0o644, "deployment marker must be Caddy-readable while remaining root-write-only");
    assertSuccess(runBash(`${quote(toBashPath(installedHelper))} status`), "combined status", /overall=on operator=on deployment=on/);
    assertSuccess(runBash(`${quote(toBashPath(installedHelper))} operator off`), "operator off", /operator marker: off/);
    assertSuccess(runBash(`${quote(toBashPath(installedHelper))} status`), "deployment hold preserved", /overall=on operator=off deployment=on/);
    assertSuccess(runBash(`${quote(toBashPath(installedHelper))} deployment off`), "deployment off", /deployment marker: off/);
    assertSuccess(runBash(`${quote(toBashPath(installedHelper))} deployment off`), "idempotent deployment off", /already inactive/);

    const victim = path.join(rootDir, "victim");
    await fs.writeFile(victim, "unchanged\n");
    await fs.symlink(victim, operatorMarker);
    const symlinkResult = runBash(`${quote(toBashPath(installedHelper))} operator on`);
    assert.notEqual(symlinkResult.status, 0);
    assert.match(symlinkResult.stderr, /marker must not be a symbolic link/);
    assert.equal(await fs.readFile(victim, "utf8"), "unchanged\n");
    await fs.unlink(operatorMarker);

    await fs.mkdir(operatorMarker);
    const staleResult = runBash(`${quote(toBashPath(installedHelper))} status`);
    assert.notEqual(staleResult.status, 0);
    assert.match(staleResult.stderr, /marker must be a regular file/);
    await fs.rm(operatorMarker, { recursive: true });

    await fs.rm(path.join(stateRoot, "operator"), { recursive: true });
    const missingResult = runBash(`${quote(toBashPath(installedHelper))} status`);
    assert.notEqual(missingResult.status, 0);
    assert.match(missingResult.stderr, /operator state must be a real directory/);
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
}

/** @param {string} command */
function runBash(command) {
  return spawnSync("bash", ["-lc", command], { encoding: "utf8" });
}

/**
 * @param {BashSpawnResult} result
 * @param {string} label
 * @param {RegExp} [outputPattern]
 */
function assertSuccess(result, label, outputPattern) {
  assert.equal(result.status, 0, `${label} failed:\n${result.stderr || result.stdout}`);
  if (outputPattern) {
    assert.match(result.stdout, outputPattern);
  }
}

/** @param {unknown} value */
function quote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

/** @param {unknown} value */
function toBashPath(value) {
  return String(value).split(path.sep).join("/");
}
