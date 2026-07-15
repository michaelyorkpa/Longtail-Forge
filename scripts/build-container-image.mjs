import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRuntimeArtifact } from "./build-runtime-artifact.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(scriptPath), "..");

async function buildContainerImage(options = {}) {
  const rootDir = path.resolve(options.rootDir || defaultRoot);
  const artifact = options.artifactPath
    ? await inspectRuntimeArtifact(path.resolve(rootDir, options.artifactPath))
    : await buildCurrentArtifact(rootDir);
  const relativeArtifactPath = normalizeBuildContextPath(rootDir, artifact.path);
  const tag = String(options.tag || `longtail-forge:${artifact.version}`).trim();
  if (!tag) {
    throw new Error("A non-empty container image tag is required.");
  }

  const args = [
    "build",
    "--file", "Dockerfile",
    "--build-arg", `LTF_RUNTIME_ARTIFACT=${relativeArtifactPath}`,
    "--build-arg", `LTF_APP_VERSION=${artifact.version}`,
    "--label", `org.opencontainers.image.version=${artifact.version}`,
    "--tag", tag,
  ];
  if (options.pull) {
    args.push("--pull");
  }
  if (options.noCache) {
    args.push("--no-cache");
  }
  args.push(".");
  runDocker(args, { cwd: rootDir, stdio: options.stdio || "inherit" });

  return Object.freeze({
    artifactPath: artifact.path,
    checksum: artifact.checksum,
    image: tag,
    version: artifact.version,
  });
}

async function buildCurrentArtifact(rootDir) {
  const result = await buildRuntimeArtifact({ rootDir, outputDir: "dist" });
  return {
    checksum: result.checksum,
    path: result.artifactPath,
    version: result.version,
  };
}

async function inspectRuntimeArtifact(artifactPath) {
  const match = path.basename(artifactPath).match(/^longtail-forge-(.+)\.tgz$/);
  if (!match) {
    throw new Error("Runtime artifact filename must be longtail-forge-<version>.tgz.");
  }
  const checksumPath = `${artifactPath}.sha256`;
  const [artifactBytes, checksumSource] = await Promise.all([
    fs.readFile(artifactPath),
    fs.readFile(checksumPath, "utf8"),
  ]);
  const checksum = createHash("sha256").update(artifactBytes).digest("hex");
  const checksumParts = checksumSource.trim().split(/\s+/);
  if (checksumParts[0] !== checksum || checksumParts.at(-1) !== path.basename(artifactPath)) {
    throw new Error(`Runtime artifact checksum verification failed for ${artifactPath}.`);
  }
  return { checksum, path: artifactPath, version: match[1] };
}

function normalizeBuildContextPath(rootDir, artifactPath) {
  const relativePath = path.relative(rootDir, artifactPath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("The runtime artifact must be inside the repository Docker build context.");
  }
  return relativePath.replaceAll("\\", "/");
}

function runDocker(args, options = {}) {
  const result = spawnSync("docker", args, {
    cwd: options.cwd || defaultRoot,
    encoding: options.stdio === "inherit" ? undefined : "utf8",
    stdio: options.stdio || "pipe",
  });
  if (result.error?.code === "ENOENT") {
    throw new Error("Docker is required for this command, but the docker executable was not found.");
  }
  if (result.status !== 0) {
    throw new Error(`docker ${args[0]} failed: ${String(result.stderr || result.stdout || result.error).trim()}`);
  }
  return String(result.stdout || "").trim();
}

function parseCliArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--tag") {
      options.tag = args[++index];
    } else if (argument === "--artifact") {
      options.artifactPath = args[++index];
    } else if (argument === "--no-cache") {
      options.noCache = true;
    } else if (argument === "--pull") {
      options.pull = true;
    } else {
      throw new Error(`Unknown container build option: ${argument}`);
    }
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    const result = await buildContainerImage(parseCliArgs(process.argv.slice(2)));
    console.log(`Container image: ${result.image}`);
    console.log(`Application version: ${result.version}`);
    console.log(`Runtime artifact SHA-256: ${result.checksum}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

export {
  buildContainerImage,
  inspectRuntimeArtifact,
  normalizeBuildContextPath,
  parseCliArgs,
  runDocker,
};
