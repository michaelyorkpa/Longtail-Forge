export const regressionMeta = Object.freeze({
  id: "framework.bundled-module-registry",
  area: "framework",
  tier: "release-gate",
  tags: ["modules", "packaging", "registry", "startup"],
  description: "Proves deterministic bundled-module discovery, declaration-only imports, dependency-ordered activation, and exact inventory preservation.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(scriptPath), "..", "..", "..");
const EXPECTED_INVENTORY_SHA256 = "779361c01d3803f416ac9cecdf86c3ca50eb0f40a655e115d69879a34c6dbb55";
const fixture = await createDisposableDatabaseFixture("bundled-module-registry-regression");
const { listModuleEntries, listModules } = await import("../../../src/core/modules/registry.js");
const { createModuleEntry, validateAndOrderBundledModuleCatalog } = await import("../../../src/core/modules/module-entry.js");
let checks = 0;

check("registry engine contains no specifically named first-party imports", () => {
  const registrySource = read("src/core/modules/registry.js");
  assert.doesNotMatch(registrySource, /\.\.\/\.\.\/modules\//);
  assert.match(registrySource, /bundled-module-catalog\.generated\.js/);
});

check("generated catalog is complete and deterministically ordered", () => {
  const entries = listModuleEntries();
  const ids = entries.map((entry) => entry.moduleEntry.manifest.id);
  assert.deepEqual(ids, [
    "client-projects",
    "developer-example",
    "lists",
    "notes",
    "tags",
    "tasks",
    "time-tracking",
    "users",
  ]);
  assert.deepEqual(entries.map((entry) => entry.directoryName), ids);
});

check("every bundled manifest is a checked ModuleManifest declaration", () => {
  for (const { directoryName } of listModuleEntries()) {
    const modulePath = `src/modules/${directoryName}/module.js`;
    const source = read(modulePath);
    assert.match(source, /^\/\/ @ts-check\r?\n/, `${modulePath} must remain opted in to the fast typecheck gate`);
    assert.match(
      source,
      /\/\*\* @type \{import\("\.\.\/\.\.\/types\/framework-contracts\.js"\)\.ModuleManifest\} \*\//,
      `${modulePath} must check its declaration against ModuleManifest`,
    );
  }

  const packageJson = JSON.parse(read("package.json"));
  assert.match(
    packageJson.scripts["check:fast"],
    /^npm run typecheck\s*&&/,
    "the fast gate must typecheck bundled declarations before unit and lint work",
  );
});

check("module and contribution inventory matches the approved baseline", () => {
  const inventory = stableValue(listModules().map(({ version: _version, ...moduleDefinition }) => moduleDefinition));
  const hash = createHash("sha256").update(JSON.stringify(inventory)).digest("hex");
  if (process.env.LTF_PRINT_MODULE_INVENTORY_HASH === "1") {
    console.log(`Bundled module inventory SHA-256: ${hash}`);
  }
  assert.equal(hash, EXPECTED_INVENTORY_SHA256);
});

check("Tasks and Notes compose substantial concerns through one canonical entry each", () => {
  const pilots = {
    notes: {
      maxEntryLines: 450,
      concerns: {
        "module.events.js": ["notesEvents", 100],
        "module.help.js": ["notesHelp", 150],
        "module.integrations.js": ["notesIntegrations", 100],
        "module.permissions.js": ["notesPermissions", 125],
      },
    },
    tasks: {
      maxEntryLines: 450,
      concerns: {
        "module.events.js": ["tasksEvents", 400],
        "module.integrations.js": ["tasksIntegrations", 100],
        "module.permissions.js": ["tasksPermissions", 100],
        "module.settings.js": ["tasksSettings", 40],
      },
    },
  };

  for (const [moduleId, pilot] of Object.entries(pilots)) {
    const entryPath = `src/modules/${moduleId}/module.js`;
    const entrySource = read(entryPath);
    assert.ok(entrySource.split(/\r?\n/).length <= pilot.maxEntryLines, `${moduleId} entry should remain a digestible composition point`);
    assert.match(entrySource, /createModuleEntry\(\{\s*manifest:/, `${moduleId} should keep the canonical moduleEntry export`);

    for (const [fileName, [bindingName, minimumLines]] of Object.entries(pilot.concerns)) {
      const concernPath = `src/modules/${moduleId}/${fileName}`;
      const concernSource = read(concernPath);
      assert.match(entrySource, new RegExp(`import \\{ ${bindingName} \\} from "\\./${fileName.replaceAll(".", "\\.")}";`));
      assert.ok(concernSource.split(/\r?\n/).length >= minimumLines, `${concernPath} should own substantial content`);
      assert.match(concernSource, new RegExp(`export \\{ ${bindingName} \\};`));
      assert.doesNotMatch(concernSource, /createModuleEntry|moduleEntry/, `${concernPath} must not become another registry entry`);
    }
  }
});

check("canonical entry validation rejects shape, identity, graph, and order failures", () => {
  const alpha = fixtureEntry("alpha", ["beta"]);
  const beta = fixtureEntry("beta");
  const ordered = validateAndOrderBundledModuleCatalog([alpha, beta], { verifySourceDirectories: false });
  assert.deepEqual(ordered.map((entry) => entry.moduleEntry.manifest.id), ["beta", "alpha"]);

  assert.throws(
    () => validateAndOrderBundledModuleCatalog([{ directoryName: "alpha", moduleEntry: undefined }], { verifySourceDirectories: false }),
    /canonical moduleEntry/,
  );
  assert.throws(
    () => validateAndOrderBundledModuleCatalog(listModuleEntries().slice(1)),
    /catalog is stale/,
  );
  assert.throws(
    () => validateAndOrderBundledModuleCatalog([...listModuleEntries()].reverse()),
    /catalog is stale/,
  );
  assert.throws(
    () => validateAndOrderBundledModuleCatalog([{ directoryName: "wrong", moduleEntry: alpha.moduleEntry }], { verifySourceDirectories: false }),
    /must match manifest id/,
  );
  assert.throws(
    () => validateAndOrderBundledModuleCatalog([fixtureEntry("alpha"), fixtureEntry("alpha")], { verifySourceDirectories: false }),
    /id must be unique/,
  );
  assert.throws(
    () => validateAndOrderBundledModuleCatalog([fixtureEntry("alpha", ["missing"])], { verifySourceDirectories: false }),
    /unknown module/,
  );
  assert.throws(
    () => validateAndOrderBundledModuleCatalog([fixtureEntry("alpha", ["beta"]), fixtureEntry("beta", ["alpha"])], { verifySourceDirectories: false }),
    /dependency graph contains a cycle/,
  );
});

await checkAsync("catalog generation detects missing, extra, reordered, and stale entries", async () => {
  const fixtureRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "ltf-module-catalog-"));
  try {
    await fsPromises.mkdir(path.join(fixtureRoot, "src", "core", "modules"), { recursive: true });
    await writeFixtureModule(fixtureRoot, "alpha");
    await writeFixtureModule(fixtureRoot, "beta");
    assert.equal(runGenerator(fixtureRoot).status, 0);
    assert.equal(runGenerator(fixtureRoot, "--check").status, 0);

    const catalogPath = path.join(fixtureRoot, "src", "core", "modules", "bundled-module-catalog.generated.js");
    const current = await fsPromises.readFile(catalogPath, "utf8");
    const alphaLine = "  Object.freeze({ directoryName: \"alpha\", moduleEntry: moduleEntry0 }),";
    const betaLine = "  Object.freeze({ directoryName: \"beta\", moduleEntry: moduleEntry1 }),";
    await fsPromises.writeFile(catalogPath, current.replace(`${alphaLine}\n${betaLine}`, `${betaLine}\n${alphaLine}`), "utf8");
    assert.notEqual(runGenerator(fixtureRoot, "--check").status, 0, "reordered catalog should fail");
    await fsPromises.writeFile(catalogPath, current.replace("alpha", "stale-alpha"), "utf8");
    assert.notEqual(runGenerator(fixtureRoot, "--check").status, 0, "stale catalog should fail");
    await fsPromises.rm(path.join(fixtureRoot, "src", "modules", "alpha"), { recursive: true, force: true });
    assert.notEqual(runGenerator(fixtureRoot, "--check").status, 0, "extra catalog entry should fail");
    await writeFixtureModule(fixtureRoot, "gamma");
    assert.notEqual(runGenerator(fixtureRoot, "--check").status, 0, "missing catalog entry should fail");
  } finally {
    await fsPromises.rm(fixtureRoot, { recursive: true, force: true });
  }
});

check("module entry import is side-effect free and explicit app activation restores behavior", () => {
  const probe = runNode(`
    import { listSearchIndexerIds } from "./src/core/search/indexer-registry.js";
    import { listReportRunnerIds } from "./src/core/reporting/report-runner-registry.js";
    import { getJobHandler } from "./src/core/jobs/index.js";
    import { getPersistenceHandler, getOnChangeEffect } from "./src/core/settings/settings-behavior-registry.js";
    await import("./src/core/modules/registry.js");
    const before = {
      search: listSearchIndexerIds(),
      reports: listReportRunnerIds(),
      reminderJob: Boolean(getJobHandler("task.reminder")),
      taskSettings: Boolean(getPersistenceHandler("tasks.reminderDateTimeHours1")),
      timeSettings: Boolean(getOnChangeEffect("time-tracking.fiscalYearStartMonth")),
    };
    const { createApp } = await import("./src/core/app.js");
    createApp();
    const after = {
      search: listSearchIndexerIds(),
      reports: listReportRunnerIds(),
      reminderJob: Boolean(getJobHandler("task.reminder")),
      recurrenceJob: Boolean(getJobHandler("task.recurrence")),
      taskSettings: Boolean(getPersistenceHandler("tasks.reminderDateTimeHours1")),
      timeSettings: Boolean(getOnChangeEffect("time-tracking.fiscalYearStartMonth")),
    };
    console.log(JSON.stringify({ before, after }));
  `);
  assert.equal(probe.status, 0, probe.stderr || probe.stdout);
  const result = JSON.parse(probe.stdout.trim());
  assert.deepEqual(result.before, {
    search: [],
    reports: [],
    reminderJob: false,
    taskSettings: false,
    timeSettings: false,
  });
  assert.deepEqual(result.after.search, [
    "client-projects.clients",
    "client-projects.projects",
    "framework.help-articles",
    "lists.records",
    "notes.records",
    "tasks.records",
    "time-tracking.time-entries",
  ]);
  assert.deepEqual(result.after.reports, ["time-tracking.project-time-billing"]);
  assert.equal(result.after.reminderJob, true);
  assert.equal(result.after.recurrenceJob, true);
  assert.equal(result.after.taskSettings, true);
  assert.equal(result.after.timeSettings, true);
});

check("framework app and worker bootstraps contain no Tasks-specific activation imports", () => {
  for (const filePath of ["src/core/app.js", "src/core/jobs/worker-cli.js"]) {
    const source = read(filePath);
    assert.doesNotMatch(source, /modules\/tasks|queueTask|registerTaskJobHandlers/);
    assert.match(source, /activateModuleRuntime/);
    assert.match(source, /runModuleStartupTasks/);
  }
});

function check(name, assertion) {
  const result = assertion();
  checks += 1;
  return result;
}

async function checkAsync(name, assertion) {
  await assertion();
  checks += 1;
}

function fixtureEntry(id, dependencies = []) {
  return {
    directoryName: id,
    moduleEntry: createModuleEntry({
      manifest: {
        id,
        name: id,
        displayName: id,
        description: `${id} fixture`,
        category: "test",
        version: "1.0.0",
        enabledByDefault: true,
        moduleDependencies: dependencies,
      },
    }),
  };
}

function stableValue(value, seen = new WeakSet()) {
  if (value instanceof URL) {
    return normalizeInventoryUrl(value);
  }
  if (typeof value === "function") {
    if (Array.isArray(value.stack)) {
      return {
        router: value.stack.flatMap((layer) => layer.route?.path
          ? Object.keys(layer.route.methods || {}).sort().map((method) => `${method.toUpperCase()} ${layer.route.path}`)
          : []),
      };
    }
    return `[function:${value.name || "anonymous"}]`;
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[circular]";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => stableValue(item, seen));
  }
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key], seen)]));
}

function normalizeInventoryUrl(value) {
  if (value.protocol !== "file:") {
    return value.href;
  }

  const relativePath = path.relative(rootDir, fileURLToPath(value));
  const isRepositoryPath = relativePath === ""
    || (!path.isAbsolute(relativePath) && relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`));

  return isRepositoryPath
    ? `repository-file:${relativePath.replaceAll(path.sep, "/") || "."}`
    : "repository-file:[external]";
}

function runGenerator(fixtureRoot, argument = "") {
  return spawnSync(process.execPath, [path.join(rootDir, "scripts", "generate-bundled-module-catalog.mjs"), argument].filter(Boolean), {
    cwd: rootDir,
    encoding: "utf8",
    env: { ...process.env, LTF_MODULE_REGISTRY_ROOT: fixtureRoot },
  });
}

function runNode(source) {
  return spawnSync(process.execPath, ["--input-type=module", "-e", source], {
    cwd: rootDir,
    encoding: "utf8",
  });
}

async function writeFixtureModule(fixtureRoot, directoryName) {
  const moduleDir = path.join(fixtureRoot, "src", "modules", directoryName);
  await fsPromises.mkdir(moduleDir, { recursive: true });
  await fsPromises.writeFile(path.join(moduleDir, "module.js"), "export const moduleEntry = {};\n", "utf8");
}

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

console.log(`Bundled module registry regression passed ${checks} checks.`);
if (fixture.ownsFixture) {
  const { closeDatabase } = await import("../../../src/db/provider.js");
  await closeDatabase();
  await fixture.cleanup();
}
