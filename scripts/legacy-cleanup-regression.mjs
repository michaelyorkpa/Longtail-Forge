import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fixtureString, workspaceSessionFixture } from "./test-support/session-fixtures.mjs";
import { requireFirstRow } from "./test-support/database-row-assertions.mjs";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-legacy-cleanup-regression-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-legacy-cleanup-test.db");
process.env.SUPER_ADMIN_PASSWORD = "Legacy-Cleanup-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, sqlText } = await import("../src/db/index.js");
const { settingsService } = await import("../src/services/settings.service.js");
const { staticService } = await import("../src/services/static.service.js");

let checks = 0;

try {
  await initializeDatabase();
  await assertLegacyTablesRemoved();
  await assertLegacyStaticPagesRemoved();
  await assertSettingsRejectLegacyAliases();
  await assertActiveSourceHasNoLegacyOrganizationSurface();
  console.log(`Legacy cleanup regression passed ${checks} checks.`);
} finally {
  await closeSqlite();
  await removeTempDir(tempDir);
}

async function assertLegacyTablesRemoved() {
  const rows = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name IN (
    'organizations',
    'organization_settings',
    'organization_modules',
    'active_timers',
    'active_task_timers'
  );
`);
  assert.deepEqual(rows, [], "legacy organization and active timer tables should not exist");
  checks += 1;
}

async function assertLegacyStaticPagesRemoved() {
  const workspaceId = await readDefaultWorkspaceId();
  const userId = await readDefaultUserId(workspaceId);
  const session = workspaceSessionFixture({ workspace_id: workspaceId, user_id: userId, username: "legacy-cleanup" });
  const organizationSettings = await staticService.read("/organization-settings.html", session);
  const clientsProjects = await staticService.read("/clients-projects.html", session);

  assert.equal(organizationSettings.statusCode, 404, "organization-settings.html should not be served");
  assert.equal(clientsProjects.statusCode, 404, "clients-projects.html should not be served");
  checks += 1;
}

async function assertSettingsRejectLegacyAliases() {
  const workspaceId = await readDefaultWorkspaceId();
  const user = await readDefaultUser(workspaceId);
  const session = workspaceSessionFixture({ ...user, workspace_id: workspaceId });
  const settings = await settingsService.read(session);

  await assert.rejects(
    () => settingsService.save({
      workspaceName: settings.workspaceName,
      workspaceType: settings.workspaceType,
      timeTrackingEnabled: false,
    }, session),
    /Use moduleSettings for module setting 'timeTrackingEnabled'\./,
  );

  await settingsService.save({
    workspaceName: settings.workspaceName,
    workspaceType: settings.workspaceType,
    audit: settings.audit,
    moduleSettings: moduleSettingsPayload(settings),
  }, session);
  checks += 1;
}

/**
 * Rebuild the writable module-setting payload from a settings read.
 *
 * The parameter is the producer's own output rather than a restated shape, so
 * the helper cannot drift from what settingsService.read publishes and cannot
 * erase what its caller already knows.
 * @param {Awaited<ReturnType<typeof settingsService.read>>} settings
 */
function moduleSettingsPayload(settings) {
  /** @type {Record<string, Record<string, unknown>>} */
  const payload = {};

  for (const moduleDefinition of settings.moduleSettings || []) {
    const moduleId = moduleDefinition.moduleId;

    if (!moduleId) {
      continue;
    }

    payload[moduleId] = {};
    for (const setting of moduleDefinition.settings || []) {
      if (setting.readOnly === true) {
        continue;
      }
      payload[moduleId][setting.id] = setting.value;
    }
  }

  return payload;
}

async function assertActiveSourceHasNoLegacyOrganizationSurface() {
  const files = await listFiles(process.cwd(), {
    includeExtensions: new Set([".js", ".mjs", ".html", ".md"]),
    skipDirs: new Set([".git", "data", "logs", "node_modules"]),
  });
  const allowedPatterns = [
    /(^|[\\/])CHANGELOG\.md$/,
    /(^|[\\/])DECISIONS\.md$/,
    /(^|[\\/])ROADMAP\.md$/,
    /(^|[\\/])ROADMAP-ARCHIVE\.md$/,
    /(^|[\\/])TODO\.md$/,
    /(^|[\\/])LICENSE$/,
    /(^|[\\/])THIRD_PARTY_NOTICES\.md$/,
    /(^|[\\/])legal[\\/]default-(?:privacy|terms)\.md$/,
    /(^|[\\/])archive[\\/]/,
    /(^|[\\/])docs[\\/]licensing(?:\.md|[\\/])/,
    /(^|[\\/])docs[\\/]architecture\.md$/,
    /(^|[\\/])docs[\\/]marketing[\\/]/,
    /(^|[\\/])docs[\\/]module-contract\.md$/,
    /(^|[\\/])docs[\\/]module-development\.md$/,
    /(^|[\\/])docs[\\/]storage-rename-plan\.md$/,
    /(^|[\\/])src[\\/]db[\\/]migrations\.js$/,
    /(^|[\\/])scripts[\\/]legacy-cleanup-regression\.mjs$/,
    /(^|[\\/])scripts[\\/]sqlite-connection-hardening-regression\.mjs$/,
    /(^|[\\/])scripts[\\/]workspace-storage-regression\.mjs$/,
  ];
  const forbidden = [];
  const legacyPattern = /\borganizations?\b|organization_id|organization_settings|organization_modules|organization-settings\.html/i;

  for (const filePath of files) {
    const normalizedPath = filePath.replaceAll(path.sep, "/");

    if (allowedPatterns.some((pattern) => pattern.test(normalizedPath))) {
      continue;
    }

    const contents = await fs.readFile(filePath, "utf8");
    if (legacyPattern.test(contents)) {
      forbidden.push(path.relative(process.cwd(), filePath));
    }
  }

  assert.deepEqual(forbidden.sort(), [], `active source should not contain legacy organization surfaces: ${forbidden.join(", ")}`);
  checks += 1;
}

async function readDefaultWorkspaceId() {
  const rows = await querySql("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;");
  assert.ok(rows[0]?.workspace_id, "expected initialized default workspace");
  return fixtureString(rows[0].workspace_id, "default workspace ID");
}

/** @param {string} workspaceId */
async function readDefaultUserId(workspaceId) {
  const user = await readDefaultUser(workspaceId);
  return fixtureString(user.user_id, "default user ID");
}

/** @param {string} workspaceId */
async function readDefaultUser(workspaceId) {
  const rows = await querySql(`
SELECT user_id, username, timezone
FROM users
WHERE home_workspace_id = ${sqlText(workspaceId)}
ORDER BY protected_user DESC, username
LIMIT 1;
`);
  assert.ok(rows[0]?.user_id, "expected initialized default user");
  return requireFirstRow(rows, "default user lookup");
}

/**
 * Every file under one root whose extension the caller asked for.
 * @param {string} root
 * @param {{ includeExtensions: Set<string>, skipDirs: Set<string> }} options
 * @returns {Promise<string[]>}
 */
async function listFiles(root, options) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      if (!options.skipDirs.has(entry.name)) {
        files.push(...await listFiles(entryPath, options));
      }
      continue;
    }

    if (entry.isFile() && options.includeExtensions.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

/** @param {string} dir */
async function removeTempDir(dir) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== "EBUSY" || attempt === 4) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
}
