import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeReleaseBranch } from "../src/core/version.js";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(scriptPath), "..");
const DEFAULT_OUTPUT_DIR = "dist";
const RUNTIME_PATHS = Object.freeze([
  ".env.example",
  ".nvmrc",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "README.md",
  "SECURITY.md",
  "server.js",
  "worker.js",
  "scripts/backup.mjs",
  "scripts/demo-data-host.mjs",
  "scripts/development-data.mjs",
  "scripts/workspace-backup.mjs",
  "scripts/workspace-purge.mjs",
  "scripts/lib/backup-archive.mjs",
  "scripts/lib/demo-data-operation.mjs",
  "scripts/lib/development-data-safety.mjs",
  "src",
  "help",
  "views",
  "public/assets/logo.webp",
  "public/css",
  "public/favicon.ico",
  "public/icons/LUCIDE-LICENSE.md",
  "public/js",
  "docs/Caddyfile.private-preview.example",
  "docs/backup-restore.md",
  "docs/compose.env.example",
  "docs/demo-data-helper.env.example",
  "docs/demo-data-operations.md",
  "docs/internet-deployment.md",
  "docs/longtail-forge.service.example",
  "docs/operational-security.md",
  "docs/preview-deployment.md",
  "docs/runtime-artifact.md",
  "docs/runtime-configuration.md",
  "docs/sqlite-small-office-mode.md",
  "docs/workspace-backup.md",
]);
const EXCLUDED_CATEGORIES = Object.freeze([
  "development dependencies",
  "tests and end-to-end specifications",
  "regression and release tooling",
  "development fixtures and source artwork",
  "local environment files and secrets",
  "live databases, uploaded files, logs, caches, and process state",
  "roadmaps, TODOs, decisions, changelog history, and unrelated developer documentation",
]);

async function buildRuntimeArtifact(options = {}) {
  const rootDir = path.resolve(options.rootDir || defaultRoot);
  const outputDir = path.resolve(rootDir, options.outputDir || DEFAULT_OUTPUT_DIR);
  const packageJson = await readJson(path.join(rootDir, "package.json"));
  const packageLock = await readJson(path.join(rootDir, "package-lock.json"));
  assertPackageMetadata(packageJson, packageLock);
  const sourceBranch = normalizeReleaseBranch(options.sourceBranch || process.env.LONGTAIL_RELEASE_BRANCH);

  const stageParent = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-runtime-artifact-"));
  const stageDir = path.join(stageParent, "package-source");
  await fs.mkdir(stageDir, { recursive: true });

  try {
    for (const relativePath of RUNTIME_PATHS) {
      await copyRuntimePath(rootDir, stageDir, relativePath);
    }

    const runtimePackage = createRuntimePackage(packageJson);
    const runtimeLock = createRuntimeLock(packageLock);
    const artifactManifest = createArtifactManifest(runtimePackage, sourceBranch);
    await Promise.all([
      writeJson(path.join(stageDir, "package.json"), runtimePackage),
      writeJson(path.join(stageDir, "npm-shrinkwrap.json"), runtimeLock),
      writeJson(path.join(stageDir, "RUNTIME-ARTIFACT.json"), artifactManifest),
    ]);

    await fs.mkdir(outputDir, { recursive: true });
    const packResult = runNpmPack(stageDir, outputDir);
    const artifactPath = path.join(outputDir, packResult.filename);
    const checksum = createHash("sha256").update(await fs.readFile(artifactPath)).digest("hex");
    const checksumPath = `${artifactPath}.sha256`;
    await fs.writeFile(checksumPath, `${checksum}  ${path.basename(artifactPath)}\n`, "utf8");

    return Object.freeze({
      artifactPath,
      checksum,
      checksumPath,
      files: Object.freeze(packResult.files.map((entry) => entry.path).sort()),
      manifest: artifactManifest,
      version: packageJson.version,
    });
  } finally {
    await fs.rm(stageParent, { recursive: true, force: true });
  }
}

function createRuntimePackage(packageJson) {
  return {
    name: packageJson.name,
    version: packageJson.version,
    private: true,
    license: packageJson.license,
    type: packageJson.type,
    engines: packageJson.engines,
    scripts: {
      start: "node server.js",
      "start:worker": "node worker.js",
      "backup:create": "node scripts/backup.mjs create",
      "backup:export": "node scripts/backup.mjs export",
      "backup:inspect": "node scripts/backup.mjs inspect",
      "backup:restore": "node scripts/backup.mjs restore",
      "demo:data:host": "node scripts/demo-data-host.mjs",
      "workspace-backup:inspect": "node scripts/workspace-backup.mjs inspect",
      "workspace-backup:restore": "node scripts/workspace-backup.mjs restore",
      "workspace:purge": "node scripts/workspace-purge.mjs",
    },
    dependencies: packageJson.dependencies,
  };
}

function createRuntimeLock(packageLock) {
  const runtimeLock = JSON.parse(JSON.stringify(packageLock));
  const rootPackage = runtimeLock.packages?.[""];
  if (!rootPackage) {
    throw new Error("package-lock.json is missing its root package metadata.");
  }

  delete rootPackage.devDependencies;
  for (const [packagePath, metadata] of Object.entries(runtimeLock.packages)) {
    if (packagePath && metadata?.dev === true) {
      delete runtimeLock.packages[packagePath];
    }
  }
  return runtimeLock;
}

function createArtifactManifest(runtimePackage, sourceBranch = "") {
  return {
    schemaVersion: 1,
    appVersion: runtimePackage.version,
    sourceBranch: normalizeReleaseBranch(sourceBranch) || null,
    artifactType: "runtime-only-npm-tarball",
    installCommand: "npm ci --omit=dev",
    startCommand: "npm start",
    workerCommand: "npm run start:worker",
    runtimePaths: RUNTIME_PATHS,
    runtimeDependencies: Object.keys(runtimePackage.dependencies || {}).sort(),
    excludedCategories: EXCLUDED_CATEGORIES,
  };
}

async function copyRuntimePath(rootDir, stageDir, relativePath) {
  const source = path.join(rootDir, relativePath);
  const destination = path.join(stageDir, relativePath);
  try {
    await fs.cp(source, destination, { recursive: true, force: true });
  } catch (error) {
    throw new Error(`Unable to stage required runtime path ${relativePath}: ${error.message}`);
  }
}

function runNpmPack(stageDir, outputDir) {
  const args = ["pack", ".", "--json", "--ignore-scripts", "--pack-destination", outputDir];
  const environment = {
    ...process.env,
    npm_config_cache: process.env.LTF_NPM_CACHE_DIR || path.join(os.tmpdir(), "ltf-npm-cache"),
    npm_config_update_notifier: "false",
  };
  const result = process.platform === "win32"
    ? spawnSync(process.execPath, [resolveWindowsNpmCli(), ...args], {
        cwd: stageDir,
        encoding: "utf8",
        env: environment,
      })
    : spawnSync("npm", args, { cwd: stageDir, encoding: "utf8", env: environment });

  if (result.status !== 0) {
    throw new Error(`npm pack failed: ${String(result.stderr || result.stdout || result.error).trim()}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`npm pack returned invalid JSON: ${error.message}`);
  }
  if (!Array.isArray(parsed) || parsed.length !== 1 || !parsed[0]?.filename) {
    throw new Error("npm pack did not report exactly one runtime artifact.");
  }
  return parsed[0];
}

function resolveWindowsNpmCli() {
  return process.env.npm_execpath
    || path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
}

function assertPackageMetadata(packageJson, packageLock) {
  const versions = [packageJson.version, packageLock.version, packageLock.packages?.[""]?.version];
  if (!versions[0] || versions.some((version) => version !== versions[0])) {
    throw new Error("Package and lock versions must be aligned before building a runtime artifact.");
  }
  if (packageJson.scripts?.start !== "node server.js") {
    throw new Error("The runtime artifact contract requires npm start to remain node server.js.");
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    const outputArgIndex = process.argv.indexOf("--output-dir");
    const outputDir = outputArgIndex >= 0 ? process.argv[outputArgIndex + 1] : undefined;
    const branchArgIndex = process.argv.indexOf("--source-branch");
    const sourceBranch = branchArgIndex >= 0 ? process.argv[branchArgIndex + 1] : undefined;
    const result = await buildRuntimeArtifact({ outputDir, sourceBranch });
    console.log(`Runtime artifact: ${result.artifactPath}`);
    console.log(`SHA-256: ${result.checksum}`);
    console.log(`Checksum file: ${result.checksumPath}`);
    console.log(`Packaged files: ${result.files.length}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

export {
  EXCLUDED_CATEGORIES,
  RUNTIME_PATHS,
  buildRuntimeArtifact,
  createArtifactManifest,
  createRuntimeLock,
  createRuntimePackage,
};
