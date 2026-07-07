import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.29.1";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-db-introspection-boundary-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-introspection-boundary.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Database-Introspection-Boundary-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const databaseDocs = readText("docs/database.md");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const regressionSuite = readText("scripts/regression-suite.mjs");
const sqliteDialectSource = readText("src/db/adapters/sqlite-dialect-seams.js");
const sqliteSearchAdapterSource = readText("src/core/search/adapters/sqlite-search-adapter.js");
const filesServiceSource = readText("src/services/files.service.js");
const usersRepoSource = readText("src/repositories/users.repo.js");
const workspacesRepoSource = readText("src/repositories/workspaces.repo.js");

const {
  closeDatabase,
  db,
  initializeDatabase,
} = await import("../src/db/index.js");

try {
  assertStaticBoundary();

  await initializeDatabase();
  await assertIntrospectionAndIdentityHelpers(db.dialect);
  await assertIntegrity();

  console.log("Database introspection boundary regression passed.");
} finally {
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticBoundary() {
  assert.equal(packageJson.version, appVersion, "package.json should report the introspection boundary version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the introspection boundary version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the introspection boundary version");

  assert.match(sqliteDialectSource, new RegExp(`contractVersion: "${escapeRegExp(appVersion)}"`), "SQLite dialect contract should report the current seam contract version");
  assert.match(sqliteDialectSource, /compileOptions/, "SQLite dialect introspection seams should expose compile-options lowering");
  assert.match(sqliteDialectSource, /tableAlias/, "SQLite identity seams should support qualified physical identity reads");
  assert.match(sqliteSearchAdapterSource, /db\.dialect\.introspection\.compileOptions\(\)/, "SQLite search adapter should read compile options through the introspection seam");
  assert.doesNotMatch(sqliteSearchAdapterSource, /PRAGMA compile_options/, "SQLite search adapter should not own raw compile-options PRAGMA SQL");

  const readTableColumnSet = functionBlock(filesServiceSource, "readTableColumnSet");
  assert.match(readTableColumnSet, /db\.dialect\.introspection\.tableInfo\(tableName\)/, "Files service should consume provider-owned table introspection");
  assert.doesNotMatch(readTableColumnSet, /\bPRAGMA\b/, "Files service should not own raw PRAGMA table introspection");

  assert.match(usersRepoSource, /db\.dialect\.identity\.rowId\(\{ tableAlias: "users" \}\)/, "users repository should consume provider-owned physical identity reads");
  assert.match(usersRepoSource, /db\.dialect\.identity\.rowId\(\{ tableAlias: "user_rows" \}\)/, "users repository should consume provider-owned qualified physical identity reads");
  assert.doesNotMatch(usersRepoSource, /\browid\b/, "users repository should not spell SQLite rowid directly");
  assert.match(workspacesRepoSource, /db\.dialect\.identity\.rowId\(\{ tableAlias: "users" \}\)/, "workspaces repository should consume provider-owned physical identity reads");
  assert.match(workspacesRepoSource, /db\.dialect\.identity\.rowId\(\{ tableAlias: "user_rows" \}\)/, "workspaces repository should consume provider-owned qualified physical identity reads");
  assert.doesNotMatch(workspacesRepoSource, /\browid\b/, "workspaces repository should not spell SQLite rowid directly");

  assert.deepEqual(
    uniqueFiles(listRuntimeSourceMatches(/\bPRAGMA\b/g)),
    [
      "src/db/adapters/sqlite-dialect-seams.js",
      "src/db/migrations.js",
      "src/db/sqlite.js",
    ],
    "raw runtime PRAGMA SQL should stay provider, migration, or SQLite-health owned after startup moves table checks to the seam",
  );
  assert.deepEqual(
    uniqueFiles(listRuntimeSourceMatches(/\browid\b/g)),
    [
      "src/db/adapters/sqlite-dialect-seams.js",
    ],
    "raw runtime rowid SQL should stay provider-owned after startup moves physical identity checks to the seam",
  );

  assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.27\.7 - PRAGMA, rowid, and introspection seam boundaries[\s\S]*- \[x\] Move or document provider-owned entry points[\s\S]*- \[x\] Confirm no module or application repository owns raw PRAGMA\/rowid calls[\s\S]*- \[x\] Add a focused regression/, "live roadmap should archive completed 0.33.5.27 slice bodies");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.7[\s\S]*`db\.dialect\.introspection\.compileOptions\(\.\.\.\)`[\s\S]*qualified `rowId\(\.\.\.\)`[\s\S]*provider\/startup\/migration\/repair\/adapter-owned/, "database docs should describe the introspection and physical identity boundary");
  assert.match(auditDocs, /0\.33\.5\.27\.7 PRAGMA, Rowid, and Introspection Boundary[\s\S]*1,441 runtime literal-helper invocations[\s\S]*228 direct interpolated SQL operation sites[\s\S]*109 existing bound operation sites/, "parameter-binding audit should record the unchanged boundary proof totals");
  assert.match(changelog, /## Version 0\.33\.5\.27\.7 - [\s\S]*PRAGMA, rowid, and introspection seam boundaries[\s\S]*provider-owned `compileOptions\(\.\.\.\)`[\s\S]*qualified `rowId\(\.\.\.\)`/, "changelog should record the introspection boundary slice");
  assert.match(regressionSuite, /scripts\/database-introspection-boundary-regression\.mjs/, "regression suite should include introspection boundary coverage");
}

async function assertIntrospectionAndIdentityHelpers(dialect) {
  assert.equal(dialect.introspection.compileOptions(), "PRAGMA compile_options;");
  assert.equal(
    dialect.identity.rowId({ tableAlias: "introspection_boundary_records", alias: "physical_id" }),
    "introspection_boundary_records.rowid AS physical_id",
  );

  await db.run(`
CREATE TABLE introspection_boundary_records (
  record_id TEXT PRIMARY KEY,
  label TEXT NOT NULL
);
INSERT INTO introspection_boundary_records (record_id, label)
VALUES ('record-1', 'Boundary proof');
`);

  const compileOptions = await db.query(dialect.introspection.compileOptions());
  assert.ok(
    compileOptions.some((row) => Object.hasOwn(row, "compile_options") || Object.hasOwn(row, "compile_option")),
    "compile-options introspection should return SQLite compile option rows",
  );

  const columns = await db.query(dialect.introspection.tableInfo("introspection_boundary_records"));
  assert.deepEqual(columns.map((column) => column.name), ["record_id", "label"]);

  const row = await db.get(`
SELECT
  ${dialect.identity.rowId({ tableAlias: "introspection_boundary_records", alias: "physical_id" })},
  record_id,
  label
FROM introspection_boundary_records
WHERE record_id = :recordId;
`, { recordId: "record-1" });
  assert.deepEqual(row, {
    label: "Boundary proof",
    physical_id: 1,
    record_id: "record-1",
  });
}

async function assertIntegrity() {
  const row = await db.get("PRAGMA integrity_check;");
  assert.equal(row.integrity_check, "ok");
}

function uniqueFiles(matches) {
  return Array.from(new Set(matches.map((match) => match.file))).sort();
}

function listRuntimeSourceMatches(pattern) {
  const matches = [];

  for (const relativePath of listRuntimeSourceFiles()) {
    const source = readText(relativePath);
    const lineOffsets = source.split(/\r?\n/);

    for (let index = 0; index < lineOffsets.length; index += 1) {
      pattern.lastIndex = 0;
      if (pattern.test(lineOffsets[index])) {
        matches.push({
          file: relativePath,
          line: index + 1,
          text: lineOffsets[index].trim(),
        });
      }
    }
  }

  return matches;
}

function listRuntimeSourceFiles() {
  const files = [];
  const sourceRoot = path.join(root, "src");

  function walk(directory) {
    for (const entry of readdirSync(directory)) {
      const absolutePath = path.join(directory, entry);
      const stat = statSync(absolutePath);

      if (stat.isDirectory()) {
        walk(absolutePath);
      } else if (/\.(?:js|mjs)$/.test(entry)) {
        files.push(normalizePath(absolutePath));
      }
    }
  }

  walk(sourceRoot);
  return files.sort();
}

function functionBlock(source, name) {
  const startPattern = new RegExp(`(?:async\\s+)?function ${escapeRegExp(name)}\\s*\\(`);
  const startMatch = source.match(startPattern);
  assert.ok(startMatch, `Expected to find function ${name}`);

  const start = startMatch.index;
  const openBrace = source.indexOf("{", start);
  assert.notEqual(openBrace, -1, `Expected function ${name} to have a body`);

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Could not find end of function ${name}`);
}

function readText(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function normalizePath(absolutePath) {
  return path.relative(root, absolutePath).replace(/\\/g, "/");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
