import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(scriptPath), "..");
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:\.\d+)*(?:(?:[-+][0-9A-Za-z.-]+)|(?:[A-Za-z][0-9A-Za-z]*))?$/;

async function bumpVersion(targetVersion, options = {}) {
  const version = normalizeVersion(targetVersion);
  const rootDir = path.resolve(options.rootDir || defaultRoot);
  const packagePath = path.join(rootDir, "package.json");
  const packageLockPath = path.join(rootDir, "package-lock.json");
  const [packageJson, packageLock] = await Promise.all([
    readJson(packagePath, "package.json"),
    readJson(packageLockPath, "package-lock.json"),
  ]);

  assertAlignedCurrentVersions(packageJson, packageLock);

  const previousVersion = packageJson.version;
  if (previousVersion === version) {
    throw new Error(`Version is already ${version}.`);
  }

  packageJson.version = version;
  packageLock.version = version;
  packageLock.packages[""].version = version;

  await Promise.all([
    fs.writeFile(packagePath, serializeJson(packageJson), "utf8"),
    fs.writeFile(packageLockPath, serializeJson(packageLock), "utf8"),
  ]);

  return {
    changedFiles: ["package.json", "package-lock.json"],
    checklist: formatFollowUpChecklist(version),
    previousVersion,
    version,
  };
}

function normalizeVersion(value) {
  const version = String(value || "").trim();
  if (!version) {
    throw new Error("Usage: npm run version:bump -- <version>");
  }
  if (version.length > 64 || !VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid project version: ${version}`);
  }
  return version;
}

function assertAlignedCurrentVersions(packageJson, packageLock) {
  const packageVersion = String(packageJson.version || "").trim();
  const lockVersion = String(packageLock.version || "").trim();
  const lockPackageVersion = String(packageLock.packages?.[""]?.version || "").trim();

  if (!packageVersion || !lockVersion || !lockPackageVersion) {
    throw new Error("package.json and package-lock.json must all define root version metadata.");
  }
  if (packageVersion !== lockVersion || packageVersion !== lockPackageVersion) {
    throw new Error(
      `Version metadata is not aligned: package=${packageVersion}, lock=${lockVersion}, lockRoot=${lockPackageVersion}.`,
    );
  }
}

function formatFollowUpChecklist(version) {
  return [
    "Follow-up release checklist:",
    `- Add the ${version} entry to CHANGELOG.md.`,
    "- Update only active ROADMAP.md checklist/bookkeeping text; preserve roadmap, changelog, archive, and docs history.",
    "- Run npm run version:guard.",
    "- Run npm run check.",
    `- Restart the app and verify /api/app-info reports ${version}.`,
  ].join("\n");
}

async function readJson(filePath, label) {
  let source;
  try {
    source = await fs.readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${label}: ${error.message}`);
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`Unable to parse ${label}: ${error.message}`);
  }
}

function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    const result = await bumpVersion(process.argv[2]);
    console.log(`Version updated: ${result.previousVersion} -> ${result.version}`);
    console.log(`Changed: ${result.changedFiles.join(", ")}`);
    console.log("");
    console.log(result.checklist);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

export { bumpVersion, formatFollowUpChecklist, normalizeVersion };
