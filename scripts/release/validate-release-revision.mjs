#!/usr/bin/env node

import { spawnSync } from "node:child_process";

/**
 * Options parsed from the release revision command line. Every value arrives as
 * a `--flag value` string; the required-flag loop below still throws when one is
 * missing, so consumers may read them as present strings.
 * @typedef {object} ReleaseRevisionOptions
 * @property {string} mainRef
 * @property {string} revision
 * @property {string} operation
 * @property {string} confirmation
 * @property {string} requiredConfirmation
 */

/** @typedef {{ version: string }} PackageManifest */

const options = parseArgs(process.argv.slice(2));
if (options.confirmation !== options.requiredConfirmation) {
  throw new Error(`Confirmation must exactly match "${options.requiredConfirmation}".`);
}

const resolvedRevision = git(["rev-parse", `${options.revision}^{commit}`]).toLowerCase();
if (resolvedRevision !== options.revision.toLowerCase()) {
  throw new Error("Revision must be the exact full commit SHA, not a branch, tag, or abbreviated SHA.");
}
git(["rev-parse", `${options.mainRef}^{commit}`]);
const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", resolvedRevision, options.mainRef], { encoding: "utf8" });
if (ancestry.status !== 0) {
  throw new Error(`Revision ${resolvedRevision} is not reachable from ${options.mainRef}.`);
}

const packageSource = git(["show", `${resolvedRevision}:package.json`]);
const version = /** @type {PackageManifest} */ (JSON.parse(packageSource)).version;
console.log(JSON.stringify({ ok: true, operation: options.operation, revision: resolvedRevision, mainRef: options.mainRef, version }));

/**
 * @param {readonly string[]} args
 * @returns {ReleaseRevisionOptions}
 */
function parseArgs(args) {
  /** @type {Record<string, string>} */
  const options = { mainRef: "origin/main" };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (["--revision", "--main-ref", "--operation", "--confirmation", "--required-confirmation"].includes(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      options[arg.slice(2).replace(/-([a-z])/g, (/** @type {string} */ _, /** @type {string} */ letter) => letter.toUpperCase())] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown release revision argument: ${arg}`);
  }
  for (const key of ["revision", "operation", "confirmation", "requiredConfirmation"]) {
    if (!options[key]) throw new Error(`--${key} is required.`);
  }
  if (!/^[a-f0-9]{40}$/i.test(options.revision)) throw new Error("--revision must be a full 40-character commit SHA.");
  if (!/^(deploy|rollback)$/.test(options.operation)) throw new Error("--operation must be deploy or rollback.");
  return /** @type {ReleaseRevisionOptions} */ (options);
}

/**
 * @param {readonly string[]} args
 * @returns {string}
 */
function git(args) {
  /** @type {import("node:child_process").SpawnSyncReturns<string>} */
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(String(result.stderr || result.stdout || "git command failed").trim());
  return String(result.stdout).trim();
}
