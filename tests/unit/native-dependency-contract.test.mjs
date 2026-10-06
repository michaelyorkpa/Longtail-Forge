// Release-aware native-dependency contract for the Compose host helper.
//
// v0.33.33 published better-sqlite3 13.0.3 while its own host helper still accepted only 13.0.1, so
// the published release could not be deployed. One installed helper deploys a new release, rolls
// back to the previous one, and recovers either, so it accepts a reviewed set of native profiles
// instead of one version. These cases tie that set to every other declaration of the driver: the
// package pin, the installed driver and the SQLite it really bundles, the publisher's proof, and the
// retained metadata of each published release that rollback may still select. A driver change that
// skips the helper fails here instead of at a live deployment.

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import process from "node:process";
import {
  PUBLISHED_BETTER_SQLITE3_VERSION,
  validatePublishedReleaseMetadata,
} from "../../scripts/release/published-container-image.mjs";

/** @typedef {import("../../scripts/release/published-container-image.mjs").PublishedReleaseMetadata} PublishedReleaseMetadata */
/** @typedef {{ architecture: string, betterSqlite3Version: string, execution: string, platform: string, sqliteVersion: string }} NativeDependency */
/** @typedef {{ version: string, image: { nativeDependency: NativeDependency } }} RetainedMetadata */

const HELPER = "scripts/release/longtail-forge-compose-deploy-host.example";
// The exact bytes of each release's published `release-metadata.json` asset: the previous
// known-good release that rollback must still select, and the newest published release.
const PREVIOUS_RELEASE = {
  path: "tests/fixtures/release-metadata/v0.33.32.45-release-metadata.json",
  sha256: "d38061c028ed0c65077648f90e77a4a3f7ab6b8a37314d1bc57b1e4212c72388",
};
const NEWEST_RELEASE = {
  path: "tests/fixtures/release-metadata/v0.33.33-release-metadata.json",
  sha256: "a3ac81e3e40e27be2b4b1ee467ad8c29901a7a28fbd73f23255a29001931bfef",
};
const RETAINED_RELEASES = [PREVIOUS_RELEASE, NEWEST_RELEASE];
// The published v0.33.33 helper asset, retained so the executable proof runs the defect itself.
const ORIGINAL_HELPER = {
  path: "tests/fixtures/compose-helper/v0.33.33-longtail-forge-compose-deploy-host.example",
  sha256: "0075913bb6e8d56d1e2e983de7c6136978b01bddc1f041937461cdc2366f8ed7",
};

/** @param {string} filePath @returns {string} */
function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

/** @returns {string[]} */
function helperProfiles() {
  const match = readFileSync(HELPER, "utf8").match(/^readonly NATIVE_DEPENDENCY_PROFILES='([^']*)'$/m);
  expect(match, "the helper must declare its reviewed native profiles").not.toBeNull();
  return String(match?.[1] ?? "").split(/\s+/).filter(Boolean);
}

/** @returns {{ allowScripts?: Record<string, unknown>, dependencies?: Record<string, unknown> }} */
function packageManifest() {
  return /** @type {{ allowScripts?: Record<string, unknown>, dependencies?: Record<string, unknown> }} */ (
    JSON.parse(readFileSync("package.json", "utf8"))
  );
}

/** @returns {string} */
function pinnedDriver() {
  const version = packageManifest().dependencies?.["better-sqlite3"];
  expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  return String(version);
}

/** @param {string} filePath @returns {RetainedMetadata} */
function retainedMetadata(filePath) {
  return /** @type {RetainedMetadata} */ (JSON.parse(readFileSync(filePath, "utf8")));
}

/** @param {NativeDependency} nativeDependency @returns {string} */
function profileOf(nativeDependency) {
  return `${nativeDependency.betterSqlite3Version}:${nativeDependency.sqliteVersion}`;
}

/**
 * The installed driver's real profile, read in a child process so the native addon never loads into
 * a Vitest worker thread.
 * @returns {string}
 */
function currentProfile() {
  const probe = /** @type {{ packageVersion: string, sqliteVersion: string }} */ (JSON.parse(execFileSync(process.execPath, ["-e", [
    "const Database = require('better-sqlite3');",
    "const db = new Database(':memory:');",
    "const sqliteVersion = db.prepare('SELECT sqlite_version() AS version').get().version;",
    "db.close();",
    "process.stdout.write(JSON.stringify({ packageVersion: require('better-sqlite3/package.json').version, sqliteVersion }));",
  ].join("\n")], { encoding: "utf8" })));
  expect(probe.packageVersion).toBe(pinnedDriver());
  return `${probe.packageVersion}:${probe.sqliteVersion}`;
}

describe("release-aware native-dependency contract", () => {
  it("names one exact driver in the package pin, the installed driver, the lifecycle allowlist, and the publisher", () => {
    const pinned = pinnedDriver();
    const installed = /** @type {{ version: string }} */ (
      JSON.parse(readFileSync("node_modules/better-sqlite3/package.json", "utf8"))
    );
    expect(installed.version).toBe(pinned);
    expect(PUBLISHED_BETTER_SQLITE3_VERSION).toBe(pinned);
    expect(packageManifest().allowScripts?.[`better-sqlite3@${pinned}`]).toBe(true);
  });

  it("accepts the current pin with the SQLite version that driver really bundles", () => {
    expect(helperProfiles()).toContain(currentProfile());
  });

  it("keeps every retained published release selectable, and reviews no other profile", () => {
    const profiles = helperProfiles();
    expect(new Set(profiles).size, "the helper must not repeat a profile").toBe(profiles.length);
    // The reviewed set is exactly the current pin plus each release that rollback may still select.
    // Retiring a rollback target is a deliberate change: remove its retained metadata and its profile.
    /** @type {Set<string>} */
    const required = new Set([currentProfile()]);
    for (const release of RETAINED_RELEASES) {
      expect(sha256(release.path), `${release.path} must stay the exact published asset`).toBe(release.sha256);
      const { nativeDependency } = retainedMetadata(release.path).image;
      expect(nativeDependency).toMatchObject({ architecture: "x64", execution: "published-digest", platform: "linux" });
      required.add(profileOf(nativeDependency));
    }
    expect(new Set(profiles)).toEqual(required);
  });

  it("keeps the publisher strict for its own revision while the helper stays release-aware", () => {
    // Each revision's publisher verifies only its own pin; the preview workflow checks out the
    // selected revision before verifying, so a rollback target is verified by its own publisher.
    for (const release of RETAINED_RELEASES) {
      const metadata = /** @type {PublishedReleaseMetadata} */ (JSON.parse(readFileSync(release.path, "utf8")));
      const retained = retainedMetadata(release.path);
      if (retained.image.nativeDependency.betterSqlite3Version === pinnedDriver()) {
        expect(validatePublishedReleaseMetadata(metadata).version).toBe(retained.version);
      } else {
        expect(() => validatePublishedReleaseMetadata(metadata)).toThrow(/native better-sqlite3/);
      }
    }
  });

  it("retains the published v0.33.33 helper asset that rejected its own release", () => {
    expect(sha256(ORIGINAL_HELPER.path)).toBe(ORIGINAL_HELPER.sha256);
    expect(readFileSync(ORIGINAL_HELPER.path, "utf8")).toMatch(/betterSqlite3Version'\)" = "13\.0\.1" \|\| fail "native better-sqlite3 proof is missing"/);
  });
});
