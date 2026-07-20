import fs from "node:fs/promises";
import path from "node:path";

export const DEVELOPMENT_PROFILE = "development";
export const DEMO_PROFILE = "sanitized-demo";
export const PROFILE_MARKERS = Object.freeze({
  [DEVELOPMENT_PROFILE]: "development-seed",
  [DEMO_PROFILE]: "sanitized-demo",
});

const LIVE_PATH_PATTERN = /(?:^|[\\/\s._-])(prod|production|live|customer|customers)(?:[\\/\s._-]|$)/i;

export function resolveSeedTarget({ profile, environment, dataDir, database, filesRoot, cwd = process.cwd() }) {
  const marker = PROFILE_MARKERS[profile];
  if (!marker) {
    throw new Error(`Unknown data profile "${profile}". Use development or sanitized-demo.`);
  }
  if (environment !== "development") {
    throw new Error("Seed and reset commands require --environment development.");
  }
  if (String(process.env.LONGTAIL_ENV || "development").toLowerCase() === "production") {
    throw new Error("Refusing to run while LONGTAIL_ENV=production.");
  }
  if (!dataDir) {
    throw new Error("Seed and reset commands require an explicit --data-dir.");
  }

  const resolvedDataDir = path.resolve(cwd, dataDir);
  const segments = resolvedDataDir.toLowerCase().split(/[\\/]+/);
  if (!segments.includes(marker)) {
    throw new Error(`Data directory must contain the exact development marker segment "${marker}".`);
  }
  if (LIVE_PATH_PATTERN.test(resolvedDataDir)) {
    throw new Error(`Refusing apparent production/live data directory: ${resolvedDataDir}`);
  }

  const resolvedDatabase = path.resolve(cwd, database || path.join(resolvedDataDir, "longtail-forge.db"));
  const resolvedFilesRoot = path.resolve(cwd, filesRoot || path.join(resolvedDataDir, "files"));
  assertInside(resolvedDataDir, resolvedDatabase, "database");
  assertInside(resolvedDataDir, resolvedFilesRoot, "files root");

  return {
    profile,
    marker,
    dataDir: resolvedDataDir,
    database: resolvedDatabase,
    filesRoot: resolvedFilesRoot,
  };
}

export function assertInside(parent, child, label) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} must be a child of the marked data directory.`);
  }
}

export function assertOperatorPassword(env = process.env, options = {}) {
  const context = String(options.context || "local").trim();
  const password = String(env.SUPER_ADMIN_PASSWORD || "");
  if (password.length < 16) {
    throw new Error(`Set SUPER_ADMIN_PASSWORD to a unique ${context} value of at least 16 characters before seeding.`);
  }
  const normalized = password.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["password", "changeme", "longtailforge", "superadmin"].some((word) => normalized.includes(word))) {
    throw new Error(`SUPER_ADMIN_PASSWORD must be a unique ${context} value, not a documented or shared seed password.`);
  }
}

export async function assertSeedDirectoryEmpty(target) {
  try {
    const entries = await fs.readdir(target.dataDir);
    if (entries.length > 0) {
      throw new Error(`Refusing to seed non-empty marked data directory: ${target.dataDir}. Run the matching reset command first.`);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

export async function readSeedMarker(target) {
  const markerFile = path.join(target.dataDir, ".longtail-development-data.json");
  const parsed = JSON.parse(await fs.readFile(markerFile, "utf8"));
  if (parsed.profile !== target.profile || parsed.marker !== target.marker) {
    throw new Error("Seed marker does not match the requested profile; refusing reset.");
  }
  if (path.resolve(parsed.database) !== target.database || path.resolve(parsed.filesRoot) !== target.filesRoot) {
    throw new Error("Seed marker paths do not match the requested target; refusing reset.");
  }
  return { markerFile, parsed };
}

export async function writeSeedMarker(target, metadata) {
  const markerFile = path.join(target.dataDir, ".longtail-development-data.json");
  await fs.writeFile(markerFile, `${JSON.stringify({
    contract: "longtail-forge-development-data-v1",
    profile: target.profile,
    marker: target.marker,
    database: target.database,
    filesRoot: target.filesRoot,
    ...metadata,
  }, null, 2)}\n`, "utf8");
}

export async function resetSeedTarget(target, confirmation) {
  if (confirmation !== target.marker) {
    throw new Error(`Reset requires --confirm ${target.marker}.`);
  }
  await readSeedMarker(target);
  await fs.rm(target.dataDir, { recursive: true, force: false });
  return { ok: true, profile: target.profile, removed: target.dataDir };
}
