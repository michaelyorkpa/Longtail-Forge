import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { bumpVersion, formatFollowUpChecklist, normalizeVersion } from "./bump-version.mjs";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-version-bump-"));

try {
  await writeFixture(tempDir);
  const before = await readFixtureSnapshot(tempDir);
  const result = await bumpVersion("9.8.7.6", { rootDir: tempDir });
  const after = await readFixtureSnapshot(tempDir);

  assert.equal(result.previousVersion, "1.2.3.4");
  assert.equal(result.version, "9.8.7.6");
  assert.deepEqual(result.changedFiles, ["package.json", "package-lock.json"]);
    assert.equal(after.packageLock.version, "9.8.7.6");
  assert.equal(after.packageLock.packages[""].version, "9.8.7.6");
  assert.deepEqual(after.fileNames, before.fileNames, "the helper should not create unapproved files");

  for (const fileName of [
    "CHANGELOG.md",
    "docs/archived-plan.md",
    "ROADMAP.md",
    "docs/release-history.md",
    "src/current-version-consumer.js",
  ]) {
    assert.equal(after.sources[fileName], before.sources[fileName], `${fileName} should remain untouched`);
  }

  assert.match(result.checklist, /Add the 9\.8\.7\.6 entry to CHANGELOG\.md/);
  assert.match(result.checklist, /archive the finished slice, and advance the Active cursor/);
  assert.match(result.checklist, /Run npm run docs:suggest/);
  assert.match(result.checklist, /npm run regressions:manifest/);
  assert.match(result.checklist, /-- --ratchet-floors only after reviewing floor increases/);
  assert.match(result.checklist, /npm run regressions:inventory:write/);
  assert.match(result.checklist, /Run npm run verify:slice exactly once/);
  assert.doesNotMatch(result.checklist, /npm run version:guard/);
  assert.doesNotMatch(result.checklist, /npm run check/);
  assert.match(result.checklist, /\/api\/app-info reports 9\.8\.7\.6/);
  assert.equal(result.checklist, formatFollowUpChecklist("9.8.7.6"));

  assert.equal(normalizeVersion(" 9.8.7.6 "), "9.8.7.6");
  assert.equal(normalizeVersion("0.33.6.13z"), "0.33.6.13z");
  assert.throws(() => normalizeVersion("../9.8.7"), /Invalid project version/);
  await assert.rejects(() => bumpVersion("9.8.7.6", { rootDir: tempDir }), /already 9\.8\.7\.6/);
  await assertRejectsMisalignedFixture(tempDir);
  const bumpSource = await fs.readFile(path.join(process.cwd(), "scripts/bump-version.mjs"), "utf8");
    assert.match(bumpSource, /console\.log\(result\.checklist\)/, "the CLI should print its follow-up checklist");

  console.log("Version bump helper regression passed.");
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function writeFixture(rootDir) {
  await fs.mkdir(path.join(rootDir, "docs"), { recursive: true });
  await fs.mkdir(path.join(rootDir, "src"), { recursive: true });
  await Promise.all([
    writeJson(path.join(rootDir, "package.json"), {
      name: "version-bump-fixture",
      version: "1.2.3.4",
    }),
    writeJson(path.join(rootDir, "package-lock.json"), {
      name: "version-bump-fixture",
      version: "1.2.3.4",
      lockfileVersion: 3,
      packages: {
        "": {
          name: "version-bump-fixture",
          version: "1.2.3.4",
        },
      },
    }),
    fs.writeFile(path.join(rootDir, "CHANGELOG.md"), "## Version 1.2.3.4 - historical\n", "utf8"),
    fs.writeFile(path.join(rootDir, "docs/archived-plan.md"), "Archived 1.2.3.4 plan\n", "utf8"),
    fs.writeFile(path.join(rootDir, "ROADMAP.md"), "Active cursor: 1.2.3.4\n", "utf8"),
    fs.writeFile(path.join(rootDir, "docs/release-history.md"), "As of 1.2.3.4\n", "utf8"),
    fs.writeFile(path.join(rootDir, "src/current-version-consumer.js"), "const historical = '1.2.3.4';\n", "utf8"),
  ]);
}

async function readFixtureSnapshot(rootDir) {
  const fileNames = await listFiles(rootDir);
  const entries = await Promise.all(fileNames.map(async (fileName) => [
    fileName,
    await fs.readFile(path.join(rootDir, fileName), "utf8"),
  ]));
  const sources = Object.fromEntries(entries);
  return {
    fileNames,
    packageJson: JSON.parse(sources["package.json"]),
    packageLock: JSON.parse(sources["package-lock.json"]),
    sources,
  };
}

async function listFiles(rootDir, relativeDir = "") {
  const directoryPath = path.join(rootDir, relativeDir);
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const fileNames = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      fileNames.push(...await listFiles(rootDir, relativePath));
    } else if (entry.isFile()) {
      fileNames.push(relativePath.replaceAll("\\", "/"));
    }
  }

  return fileNames.sort();
}

async function assertRejectsMisalignedFixture(rootDir) {
  const packageLockPath = path.join(rootDir, "package-lock.json");
  const packageLock = JSON.parse(await fs.readFile(packageLockPath, "utf8"));
  packageLock.packages[""].version = "9.8.7.5";
  await writeJson(packageLockPath, packageLock);
  await assert.rejects(() => bumpVersion("9.8.7.7", { rootDir }), /Version metadata is not aligned/);
}

function writeJson(filePath, value) {
  return fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
