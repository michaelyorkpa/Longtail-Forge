export const regressionMeta = Object.freeze({
  id: "framework.identifier-authority",
  area: "framework",
  tier: "release-gate",
  tags: ["architecture", "database", "identifiers", "security", "static"],
  description: "Keeps production UUID generation behind the central authority and freezes the temporary direct-generator migration baseline.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const AUTHORITY_PATH = "src/core/identifiers.js";
const BASELINE_PATH = "scripts/identifier-authority-migration-baseline.json";
const PRODUCTION_ROOTS = ["src", "public/js", "scripts/lib", "scripts/release"];
const PACKAGE_SCAN_ROOTS = ["src", "public/js", "scripts", "tests"];
const FRAMEWORK_RECORD_CALLS = Object.freeze({
  "scripts/lib/backup-archive.mjs": 1,
  "src/core/jobs/job-queue.js": 1,
  "src/db/app-startup-maintenance.js": 5,
  "src/repositories/api-keys.repo.js": 1,
  "src/repositories/notifications.repo.js": 2,
  "src/repositories/permissions.repo.js": 2,
  "src/repositories/private-feed-tokens.repo.js": 1,
  "src/repositories/tags.repo.js": 3,
  "src/repositories/user-workspaces.repo.js": 1,
  "src/repositories/users.repo.js": 1,
  "src/repositories/workspaces.repo.js": 3,
  "src/services/audit.service.js": 1,
  "src/services/files.service.js": 3,
  "src/services/work-resume-state.service.js": 1,
  "src/services/workspace-purge.service.js": 1,
});
const FRAMEWORK_OPAQUE_CALLS = Object.freeze({
  "scripts/lib/backup-archive.mjs": 2,
  "scripts/lib/demo-data-operation.mjs": 1,
  "scripts/release/longtail-forge-deploy-host.example": 2,
  "src/core/files/local-storage-adapter.js": 1,
  "src/core/files/s3-storage-adapter.js": 1,
  "src/core/request-context.js": 1,
  "src/db/migration-lock.js": 1,
  "src/services/workspace-backup-package.js": 1,
  "src/services/workspace-backups.service.js": 1,
  "src/services/workspace-purge.service.js": 1,
});
const MODULE_RECORD_CALLS = Object.freeze({
  "src/modules/client-projects/clients.service.js": 2,
  "src/modules/lists/lists.repo.js": 4,
  "src/modules/notes/notes.repo.js": 7,
  "src/modules/tasks/task-checklists.repo.js": 2,
  "src/modules/tasks/task-recurrence.repo.js": 5,
  "src/modules/tasks/task-relationships.repo.js": 1,
  "src/modules/tasks/task-reminders.repo.js": 1,
  "src/modules/tasks/tasks.repo.js": 3,
  "src/modules/time-tracking/active-timers.service.js": 1,
  "src/modules/time-tracking/public-api.service.js": 1,
  "src/modules/time-tracking/time-entries.service.js": 1,
});
const DEDICATED_SECURITY_PATTERNS = Object.freeze({
  "src/core/csrf-protection.js": [/randomBytes\(32\)/, /randomBytes\(24\)/, /createHmac\("sha256"/],
  "src/modules/notes/secure-crypto.js": [/randomBytes\(32\)/, /randomBytes\(12\)/, /createCipheriv/],
  "src/security/passwords.js": [/randomBytes\(18\)/, /randomBytes\(policy\.saltLength\)/, /argon2id/],
  "src/security/sessions.js": [/randomBytes\(32\)/],
  "src/services/api-keys.service.js": [/randomBytes\(24\)/],
  "src/services/permissions.service.js": [/randomBytes\(32\)/, /createHmac\("sha256"/],
  "src/services/private-feeds.service.js": [/randomBytes\(12\)/, /randomBytes\(32\)/, /createHash\("sha256"/],
  "src/services/sessions.service.js": [/randomBytes\(32\)/, /createHmac\("sha256"/],
});

const baseline = JSON.parse(await fs.readFile(BASELINE_PATH, "utf8"));
assert.equal(baseline.schemaVersion, 1, "identifier migration baseline schema must remain recognized");

const productionFiles = (await Promise.all(PRODUCTION_ROOTS.map(listCodeFiles))).flat().sort();
const actualDirectCalls = {};
for (const filePath of productionFiles) {
  const source = await fs.readFile(filePath, "utf8");
  const calls = countMatches(source, /\brandomUUID\s*\(/g);
  if (calls > 0) actualDirectCalls[filePath] = calls;
}

const expectedDirectCalls = Object.fromEntries(
  Object.entries(baseline.productionDirectRandomUuid)
    .map(([filePath, entry]) => [filePath, entry.calls])
    .sort(([left], [right]) => left.localeCompare(right)),
);
assert.deepEqual(
  actualDirectCalls,
  expectedDirectCalls,
  "Production direct randomUUID calls must match the temporary exact baseline; migrate and shrink the baseline deliberately, never grow or relocate it.",
);

for (const [filePath, expectedCalls] of Object.entries(FRAMEWORK_RECORD_CALLS)) {
  const source = await fs.readFile(filePath, "utf8");
  assert.equal(
    countMatches(source, /\bcreateRecordId\s*\(/g),
    expectedCalls,
    `${filePath} must keep each audited framework persistent-record generator on createRecordId()`,
  );
}
for (const [filePath, expectedCalls] of Object.entries(FRAMEWORK_OPAQUE_CALLS)) {
  const source = await fs.readFile(filePath, "utf8");
  assert.equal(
    countMatches(source, /\bcreateOpaqueId\s*\(/g),
    expectedCalls,
    `${filePath} must keep each audited framework operational UUID on createOpaqueId()`,
  );
}
for (const [filePath, expectedCalls] of Object.entries(MODULE_RECORD_CALLS)) {
  const source = await fs.readFile(filePath, "utf8");
  assert.equal(
    countMatches(source, /\bcreateRecordId\s*\(/g),
    expectedCalls,
    `${filePath} must keep each audited first-party module record generator on createRecordId()`,
  );
}
assert.deepEqual(
  Object.entries(baseline.productionDirectRandomUuid)
    .filter(([filePath, entry]) => Object.hasOwn(FRAMEWORK_RECORD_CALLS, filePath) && String(entry.classification).includes("record"))
    .map(([filePath]) => filePath),
  [],
  "the exact migration baseline must not retain framework persistent-record entries after their rollout",
);
assert.deepEqual(
  Object.keys(baseline.productionDirectRandomUuid),
  [baseline.temporaryBrowserGenerator.path],
  "the exact migration baseline must contain only the temporary Clients/Projects browser generator after the server-side module rollout",
);

for (const [filePath, patterns] of Object.entries(DEDICATED_SECURITY_PATTERNS)) {
  const source = await fs.readFile(filePath, "utf8");
  for (const pattern of patterns) {
    assert.match(source, pattern, `${filePath} must retain its dedicated credential or cryptographic helper boundary`);
  }
}

const packageImportViolations = [];
const packageScanFiles = (await Promise.all(PACKAGE_SCAN_ROOTS.map(listCodeFiles))).flat().sort();
for (const filePath of packageScanFiles) {
  const source = await fs.readFile(filePath, "utf8");
  if (filePath !== AUTHORITY_PATH && hasUuidPackageImport(source)) {
    packageImportViolations.push(filePath);
  }
}
assert.deepEqual(
  packageImportViolations,
  [],
  "Only src/core/identifiers.js may import, require, or dynamically import the uuid package.",
);

const authoritySource = await fs.readFile(AUTHORITY_PATH, "utf8");
assert.match(authoritySource, /import\s*\{\s*v4\s+as\s+uuidv4\s*,\s*v7\s+as\s+uuidv7\s*\}\s*from\s*["']uuid["']/);
assert.match(authoritySource, /export function createRecordId\(/);
assert.match(authoritySource, /export function createOpaqueId\(/);
assert.doesNotMatch(
  authoritySource,
  /export function create(?:Token|Secret|Credential)/,
  "identifier authority must not grow a token, secret, or credential operation",
);

const browserBaseline = baseline.temporaryBrowserGenerator;
const browserSource = await fs.readFile(browserBaseline.path, "utf8");
assert.equal(
  countMatches(browserSource, /(?<!function\s)\bcreateUuid\s*\(/g),
  browserBaseline.createUuidCallSites,
  "The temporary browser createUuid call-site baseline must only shrink before removal.",
);
assert.equal(
  countMatches(browserSource, /10000000-1000-4000-8000-100000000000/g),
  browserBaseline.fallbackTemplates,
  "The temporary browser UUID fallback must not grow or move.",
);

const decisions = await fs.readFile("DECISIONS.md", "utf8");
const databaseDocs = await fs.readFile("docs/database.md", "utf8");
for (const requiredPhrase of [
  "Identifier Authority and Forward UUIDv7 Policy",
  "createRecordId()",
  "createOpaqueId()",
  "UUIDv4 and UUIDv7",
]) {
  assert.ok(decisions.includes(requiredPhrase), `DECISIONS.md must retain ${requiredPhrase}`);
  assert.ok(databaseDocs.includes(requiredPhrase), `docs/database.md must retain ${requiredPhrase}`);
}

console.log("Identifier authority regression checks passed.");

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function hasUuidPackageImport(source) {
  return /\bfrom\s*["']uuid["']|\bimport\s*\(\s*["']uuid["']\s*\)|\brequire\s*\(\s*["']uuid["']\s*\)/.test(source);
}

async function listCodeFiles(rootPath) {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.posix.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listCodeFiles(entryPath));
    } else if (/\.(?:js|mjs)$/.test(entry.name) || entry.name.endsWith(".example")) {
      files.push(entryPath);
    }
  }
  return files;
}
