import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

const PRIVATE_DIRECTORY_MASK = 0o077;

async function assertRuntimeDataPathsReady(options = {}) {
  const environment = options.environment || config.environment;
  const paths = options.paths || [
    { key: "LONGTAIL_DATA_DIR", value: config.dataDir },
    { key: "LONGTAIL_DATABASE_FILE", value: path.dirname(config.databaseFile) },
    { key: "LONGTAIL_LOCAL_STORAGE_ROOT", value: config.storage.localRoot },
  ];
  const checked = new Set();

  for (const entry of paths) {
    const directory = path.resolve(entry.value);
    const identity = process.platform === "win32" ? directory.toLowerCase() : directory;
    if (checked.has(identity)) {
      continue;
    }
    checked.add(identity);
    await assertRuntimeDirectoryReady(directory, entry.key, environment);
  }

  const contentPaths = options.contentPaths || [
    { key: "LONGTAIL_TERMS_CONTENT_PATH", value: config.legal.termsContentPath },
    { key: "LONGTAIL_PRIVACY_CONTENT_PATH", value: config.legal.privacyContentPath },
  ];
  for (const entry of contentPaths) {
    await assertRuntimeContentFileReady(path.resolve(entry.value), entry.key);
  }
}

async function assertRuntimeDirectoryReady(directory, key, environment) {
  try {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const stats = await fs.stat(directory);
    if (!stats.isDirectory()) {
      throw new Error("not_directory");
    }
    await fs.access(directory, fsConstants.R_OK | fsConstants.W_OK | fsConstants.X_OK);

    if (environment === "production" && process.platform !== "win32" && (stats.mode & PRIVATE_DIRECTORY_MASK) !== 0) {
      throw new Error("permissions_too_broad");
    }
  } catch {
    const suffix = environment === "production" && process.platform !== "win32"
      ? " It must be a private owner-only directory (mode 0700) readable and writable by the app service account."
      : " It must be a directory readable and writable by the app service account.";
    throw new Error(`${key} is not ready for startup.${suffix}`);
  }
}

async function assertRuntimeContentFileReady(filePath, key) {
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      throw new Error("not_file");
    }
    await fs.access(filePath, fsConstants.R_OK);
  } catch {
    throw new Error(`${key} is not ready for startup. It must be a readable Markdown file.`);
  }
}

export { assertRuntimeDataPathsReady };
