import { createHash, randomBytes } from "node:crypto";

/** @typedef {{ baselineDatabaseFile: string, baselineSha256: string, baselineSize: number, foreignKeyCheckPassed: true, integrityCheckPassed: true, migrationCount: number, migrationIdentitySha256: string, nonce: string, protocol: string, runnerPid: number }} VerifiedBaselineAttestation */
/** @typedef {VerifiedBaselineAttestation & { attestationSha256: string }} VerifiedBaselineHandshake */
/** @typedef {{ fastPathUsed: boolean, reason: string }} VerifiedBaselineDecision */
import fsConstants from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const VERIFIED_REGRESSION_BASELINE_PROTOCOL = "ltf-regression-baseline-v1";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

/** @type {VerifiedBaselineHandshake | null} */
let registeredHandshake = null;
/** @type {string | null} */
let materializedDatabaseFile = null;
/** @type {Readonly<VerifiedBaselineDecision>} */
let lastDecision = Object.freeze({ fastPathUsed: false, reason: "not-evaluated" });

/** @param {{ baselineDatabaseFile: string, migrationCount: number, migrationIdentitySha256: string }} options */
async function createVerifiedRegressionBaselineHandshake({
  baselineDatabaseFile,
  migrationCount,
  migrationIdentitySha256,
}) {
  const resolvedBaseline = path.resolve(baselineDatabaseFile);
  assertTemporaryPath(resolvedBaseline, "verified regression baseline");
  const stats = await fs.stat(resolvedBaseline);
  const baselineSha256 = await hashFile(resolvedBaseline);

  const attestation = {
    baselineDatabaseFile: resolvedBaseline,
    baselineSha256,
    baselineSize: stats.size,
    foreignKeyCheckPassed: true,
    integrityCheckPassed: true,
    migrationCount,
    migrationIdentitySha256,
    nonce: randomBytes(32).toString("hex"),
    protocol: VERIFIED_REGRESSION_BASELINE_PROTOCOL,
    runnerPid: process.pid,
  };
  return Object.freeze({
    ...attestation,
    attestationSha256: hashHandshakeAttestation(attestation),
  });
}

/** @param {unknown} handshake */
function registerVerifiedRegressionBaselineHandshake(handshake) {
  if (registeredHandshake) {
    throw new Error("Verified regression baseline handshake was registered more than once.");
  }

  validateHandshakeShape(handshake);
  if (handshake.runnerPid !== process.ppid) {
    throw new Error("Verified regression baseline handshake parent process does not match the current runner parent.");
  }

  registeredHandshake = Object.freeze({ ...handshake });
}

function hasRegisteredVerifiedRegressionBaselineHandshake() {
  return Boolean(registeredHandshake);
}

/** @param {{ databaseFile: string, databaseProvider: string }} options */
async function materializeVerifiedRegressionBaseline({ databaseFile, databaseProvider }) {
  const handshake = registeredHandshake;
  registeredHandshake = null;

  if (!handshake) {
    setDecision(false, "no-runner-handshake");
    return false;
  }

  const configuredBaseline = String(process.env.LTF_REGRESSION_BASELINE_DB || "").trim();
  delete process.env.LTF_REGRESSION_BASELINE_DB;

  try {
    validateHandshakeShape(handshake);
    if (databaseProvider !== "sqlite") {
      throw new Error("Verified regression baseline fast path supports only the SQLite regression provider.");
    }

    const baselineDatabaseFile = path.resolve(handshake.baselineDatabaseFile);
    const targetDatabaseFile = path.resolve(databaseFile);
    assertTemporaryPath(baselineDatabaseFile, "verified regression baseline");
    assertTemporaryPath(targetDatabaseFile, "verified regression target");

    if (!configuredBaseline || path.resolve(configuredBaseline) !== baselineDatabaseFile) {
      throw new Error("Verified regression baseline environment does not match the runner attestation.");
    }
    if (targetDatabaseFile === baselineDatabaseFile) {
      throw new Error("Verified regression target must differ from the runner baseline database.");
    }

    const baselineStats = await fs.stat(baselineDatabaseFile);
    if (baselineStats.size !== handshake.baselineSize) {
      throw new Error("Verified regression baseline size changed after runner validation.");
    }
    if ((await hashFile(baselineDatabaseFile)) !== handshake.baselineSha256) {
      throw new Error("Verified regression baseline checksum changed after runner validation.");
    }

    if (await pathExists(targetDatabaseFile)) {
      setDecision(false, "target-already-materialized");
      return false;
    }

    await fs.mkdir(path.dirname(targetDatabaseFile), { recursive: true });
    await fs.copyFile(baselineDatabaseFile, targetDatabaseFile, fsConstants.constants.COPYFILE_EXCL);

    if ((await hashFile(targetDatabaseFile)) !== handshake.baselineSha256) {
      await fs.rm(targetDatabaseFile, { force: true });
      throw new Error("Verified regression baseline copy checksum does not match the runner-validated template.");
    }

    materializedDatabaseFile = targetDatabaseFile;
    setDecision(true, "runner-verified-copy");
    return true;
  } catch (error) {
    setDecision(false, "handshake-rejected");
    throw new Error(`Verified regression baseline handshake rejected: ${errorMessage(error)}`);
  }
}

/** @param {string} databaseFile */
function consumeMaterializedVerifiedRegressionBaseline(databaseFile) {
  const resolvedDatabaseFile = path.resolve(databaseFile);
  if (!materializedDatabaseFile || materializedDatabaseFile !== resolvedDatabaseFile) {
    return false;
  }

  materializedDatabaseFile = null;
  return true;
}

function readVerifiedRegressionBaselineDecision() {
  return lastDecision;
}

/** @param {unknown} handshake @returns {asserts handshake is VerifiedBaselineHandshake} */
function validateHandshakeShape(handshake) {
  if (!handshake || typeof handshake !== "object") {
    throw new Error("Verified regression baseline handshake is incomplete or malformed.");
  }
  const candidate = /** @type {Record<string, unknown>} */ (handshake);
  if (
    !candidate
    || candidate.protocol !== VERIFIED_REGRESSION_BASELINE_PROTOCOL
    || typeof candidate.runnerPid !== "number"
    || !Number.isInteger(candidate.runnerPid)
    || candidate.runnerPid <= 0
    || typeof candidate.baselineDatabaseFile !== "string"
    || !SHA256_PATTERN.test(String(candidate.baselineSha256 || ""))
    || typeof candidate.baselineSize !== "number"
    || !Number.isSafeInteger(candidate.baselineSize)
    || candidate.baselineSize <= 0
    || typeof candidate.migrationCount !== "number"
    || !Number.isSafeInteger(candidate.migrationCount)
    || candidate.migrationCount <= 0
    || !SHA256_PATTERN.test(String(candidate.migrationIdentitySha256 || ""))
    || !/^[a-f0-9]{64}$/.test(String(candidate.nonce || ""))
    || candidate.integrityCheckPassed !== true
    || candidate.foreignKeyCheckPassed !== true
    || !SHA256_PATTERN.test(String(candidate.attestationSha256 || ""))
  ) {
    throw new Error("Verified regression baseline handshake is incomplete or malformed.");
  }

  const { attestationSha256, ...attestation } = candidate;
  if (hashHandshakeAttestation(attestation) !== attestationSha256) {
    throw new Error("Verified regression baseline handshake attestation does not match its contents.");
  }
}

/** @param {Record<string, unknown> | VerifiedBaselineAttestation} attestation */
function hashHandshakeAttestation(attestation) {
  return createHash("sha256").update(JSON.stringify(attestation)).digest("hex");
}

/** @param {string} filePath */
async function hashFile(filePath) {
  const hash = createHash("sha256");
  const handle = await fs.open(filePath, "r");
  try {
    for await (const chunk of handle.readableWebStream()) {
      hash.update(Buffer.from(chunk));
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

/** @param {string} filePath */
async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (errorCode(error) === "ENOENT") return false;
    throw error;
  }
}

/** @param {string} candidatePath @param {string} label */
function assertTemporaryPath(candidatePath, label) {
  const relativePath = path.relative(path.resolve(os.tmpdir()), candidatePath);
  if (
    relativePath === ""
    || relativePath === ".."
    || relativePath.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativePath)
  ) {
    throw new Error(`${label} must stay beneath the operating-system temp directory.`);
  }
}

/** @param {unknown} error @returns {string} */
function errorCode(error) {
  return error && typeof error === "object" && "code" in error ? String(error.code || "") : "";
}

/** @param {unknown} error @returns {string} */
function errorMessage(error) {
  return error && typeof error === "object" && "message" in error ? String(error.message || error) : String(error);
}

/** @param {boolean} fastPathUsed @param {string} reason */
function setDecision(fastPathUsed, reason) {
  lastDecision = Object.freeze({ fastPathUsed, reason });
}

export {
  VERIFIED_REGRESSION_BASELINE_PROTOCOL,
  consumeMaterializedVerifiedRegressionBaseline,
  createVerifiedRegressionBaselineHandshake,
  hasRegisteredVerifiedRegressionBaselineHandshake,
  materializeVerifiedRegressionBaseline,
  readVerifiedRegressionBaselineDecision,
  registerVerifiedRegressionBaselineHandshake,
};
