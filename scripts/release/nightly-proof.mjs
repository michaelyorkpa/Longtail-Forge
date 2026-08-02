#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const POLICY_VERSION = "nightly-proof-v1";
const MAX_PROOF_AGE_HOURS = 168;
const REQUIRED_JOBS = Object.freeze([
  "Nightly full gate",
  "Nightly browser gate",
]);
const WORKFLOW_PATH = ".github/workflows/nightly.yml";
const scriptPath = fileURLToPath(import.meta.url);

async function createNightlyProof(options) {
  const bundle = await inspectBundle(options.directory);
  assertEqual(bundle.metadata.commitSha, options.commit, "release metadata commit");
  assertEqual(bundle.metadata.channel, "nightly", "release metadata channel");
  assertEqual(bundle.metadata.sourceBranch, "nightly", "release metadata source branch");
  const workflowSha256 = await sha256File(WORKFLOW_PATH);
  const createdAt = options.createdAt || new Date().toISOString();
  assertFreshTimestamp(createdAt, Number.POSITIVE_INFINITY);
  const proof = {
    schemaVersion: 1,
    policyVersion: POLICY_VERSION,
    repository: options.repository,
    workflowRef: options.workflowRef,
    workflowPath: WORKFLOW_PATH,
    workflowSha256,
    runId: Number(options.runId),
    commitSha: options.commit.toLowerCase(),
    createdAt,
    requiredJobs: Object.fromEntries(REQUIRED_JOBS.map((name) => [name, "success"])),
    artifact: {
      filename: bundle.metadata.artifact.filename,
      sha256: bundle.artifactSha256,
      checksumFilename: `${bundle.metadata.artifact.filename}.sha256`,
      metadataFilename: "release-metadata.json",
      metadataSha256: await sha256File(path.join(options.directory, "release-metadata.json")),
    },
  };
  if (!Number.isSafeInteger(proof.runId) || proof.runId <= 0) throw new Error("run ID must be a positive integer.");
  await fs.writeFile(options.output, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  return proof;
}

async function verifyNightlyProof(options) {
  const proof = JSON.parse(await fs.readFile(options.proof, "utf8"));
  const bundle = await inspectBundle(options.directory);
  assertEqual(proof.schemaVersion, 1, "proof schema version");
  assertEqual(proof.policyVersion, POLICY_VERSION, "proof policy version");
  assertEqual(proof.repository, options.repository, "proof repository");
  assertEqual(proof.workflowRef, options.workflowRef, "proof workflow ref");
  assertEqual(proof.workflowPath, WORKFLOW_PATH, "proof workflow path");
  assertEqual(proof.workflowSha256, await sha256File(WORKFLOW_PATH), "proof workflow checksum");
  assertEqual(String(proof.runId), String(options.runId), "proof run ID");
  assertEqual(proof.commitSha, options.commit.toLowerCase(), "proof commit");
  assertFreshTimestamp(proof.createdAt, options.maxAgeHours);
  assertEqual(JSON.stringify(proof.requiredJobs), JSON.stringify(Object.fromEntries(REQUIRED_JOBS.map((name) => [name, "success"]))), "proof required job set");
  assertEqual(bundle.metadata.commitSha, proof.commitSha, "release metadata commit");
  assertEqual(bundle.metadata.channel, "nightly", "release metadata channel");
  assertEqual(bundle.metadata.sourceBranch, "nightly", "release metadata source branch");
  assertEqual(proof.artifact.filename, bundle.metadata.artifact.filename, "proof artifact filename");
  assertEqual(proof.artifact.sha256, bundle.artifactSha256, "proof artifact checksum");
  assertEqual(proof.artifact.checksumFilename, `${proof.artifact.filename}.sha256`, "proof checksum filename");
  assertEqual(proof.artifact.metadataFilename, "release-metadata.json", "proof metadata filename");
  assertEqual(proof.artifact.metadataSha256, await sha256File(path.join(options.directory, "release-metadata.json")), "proof metadata checksum");
  return { bundle, proof };
}

async function selectNightlyProof(options) {
  const apiRoot = `https://api.github.com/repos/${options.repository}`;
  const query = new URL(`${apiRoot}/actions/workflows/nightly.yml/runs`);
  query.searchParams.set("branch", "nightly");
  query.searchParams.set("event", "push");
  query.searchParams.set("status", "completed");
  query.searchParams.set("head_sha", options.commit);
  query.searchParams.set("per_page", "20");
  const runs = (await githubJson(query, options.token)).workflow_runs || [];
  const eligible = runs.filter((run) => (
    run.conclusion === "success"
    && run.event === "push"
    && run.head_branch === "nightly"
    && run.head_sha === options.commit
    && run.path === WORKFLOW_PATH
    && run.head_repository?.full_name === options.repository
    && isFresh(run.created_at, options.maxAgeHours)
  ));
  if (eligible.length !== 1) {
    throw new Error(`Expected exactly one unexpired successful exact-SHA nightly run; found ${eligible.length}.`);
  }
  const run = eligible[0];
  const jobs = (await githubJson(`${apiRoot}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`, options.token)).jobs || [];
  for (const requiredName of REQUIRED_JOBS) {
    const matches = jobs.filter(({ name, conclusion }) => name === requiredName && conclusion === "success");
    if (matches.length !== 1) throw new Error(`Nightly run ${run.id} does not have one successful ${requiredName} job.`);
  }
  const artifacts = (await githubJson(`${apiRoot}/actions/runs/${run.id}/artifacts?per_page=100`, options.token)).artifacts || [];
  const runtimeArtifactName = `nightly-${options.commit}`;
  const proofArtifactName = `nightly-proof-${options.commit}`;
  for (const name of [runtimeArtifactName, proofArtifactName]) {
    const matches = artifacts.filter((artifact) => artifact.name === name && artifact.expired === false);
    if (matches.length !== 1) throw new Error(`Nightly run ${run.id} does not have one unexpired ${name} artifact.`);
  }
  const selection = { proofArtifactName, runId: run.id, runtimeArtifactName };
  await fs.writeFile(options.output, `${JSON.stringify(selection, null, 2)}\n`, "utf8");
  return selection;
}

async function inspectBundle(directory) {
  const metadataPath = path.join(directory, "release-metadata.json");
  const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
  const artifactPath = path.join(directory, metadata.artifact?.filename || "");
  const artifactSha256 = await sha256File(artifactPath);
  const checksum = String(await fs.readFile(`${artifactPath}.sha256`, "utf8")).trim();
  const match = checksum.match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
  if (!match || match[1].toLowerCase() !== artifactSha256 || path.basename(match[2]) !== path.basename(artifactPath)) {
    throw new Error("Runtime artifact checksum sidecar does not match the selected bundle.");
  }
  assertEqual(metadata.schemaVersion, 1, "release metadata schema version");
  assertEqual(metadata.application, "longtail-forge", "release metadata application");
  assertEqual(metadata.artifact.sha256, artifactSha256, "release metadata artifact checksum");
  if (!/^[a-f0-9]{40}$/.test(metadata.commitSha || "")) throw new Error("Release metadata commit must be a full lowercase SHA.");
  if (metadata.version !== path.basename(artifactPath).slice("longtail-forge-".length, -".tgz".length)) {
    throw new Error("Release metadata version does not match the runtime artifact filename.");
  }
  return { artifactPath, artifactSha256, metadata };
}

async function githubJson(url, token) {
  const response = await globalThis.fetch(url, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "longtail-forge-nightly-proof",
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  return response.json();
}

function assertFreshTimestamp(value, maxAgeHours) {
  if (!isFresh(value, maxAgeHours)) throw new Error(`Proof timestamp is invalid, future-dated, or older than ${maxAgeHours} hours.`);
}

function isFresh(value, maxAgeHours) {
  const timestamp = Date.parse(value);
  const age = Date.now() - timestamp;
  return Number.isFinite(timestamp) && age >= 0 && age <= maxAgeHours * 60 * 60 * 1000;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, received ${actual}.`);
}

async function sha256File(filePath) {
  return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

function parseArgs(args) {
  const command = args.shift();
  const options = { maxAgeHours: MAX_PROOF_AGE_HOURS };
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key.startsWith("--")) throw new Error(`Unknown nightly proof argument: ${key}`);
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(`${key} requires a value.`);
    options[key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }
  options.maxAgeHours = Number(options.maxAgeHours);
  if (!/^[a-f0-9]{40}$/i.test(options.commit || "")) throw new Error("--commit must be a full 40-character SHA.");
  options.commit = options.commit.toLowerCase();
  if (["create", "select", "verify"].includes(command) && (!options.repository || !options.workflowRef)) {
    throw new Error("--repository and --workflow-ref are required.");
  }
  if (["create", "select"].includes(command) && !options.output) throw new Error("--output is required.");
  return { command, options };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    const { command, options } = parseArgs(process.argv.slice(2));
    let result;
    if (command === "bundle") {
      result = await inspectBundle(options.directory);
      assertEqual(result.metadata.commitSha, options.commit, "release metadata commit");
    } else if (command === "create") result = await createNightlyProof(options);
    else if (command === "verify") result = await verifyNightlyProof(options);
    else if (command === "select") result = await selectNightlyProof(options);
    else throw new Error("Expected create, verify, or select.");
    console.log(JSON.stringify({ ok: true, command, ...("runId" in result ? { runId: result.runId } : {}) }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

export {
  MAX_PROOF_AGE_HOURS,
  POLICY_VERSION,
  REQUIRED_JOBS,
  WORKFLOW_PATH,
  createNightlyProof,
  inspectBundle,
  selectNightlyProof,
  verifyNightlyProof,
};
