// @ts-check

import { argon2, pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/** @typedef {"argon2id" | "pbkdf2_sha256" | "unknown"} PasswordHashAlgorithm */
/** @typedef {"legacy_algorithm" | "parameters_outdated" | null} PasswordRehashReason */
/** @typedef {{ algorithm: "argon2id", hash: Buffer, memory: number, parallelism: number, passes: number, salt: Buffer, version: number }} ParsedArgon2Hash */
/** @typedef {{ algorithm: "pbkdf2_sha256", hash: Buffer, iterations: number, salt: string }} ParsedPbkdf2Hash */
/** @typedef {ParsedArgon2Hash | ParsedPbkdf2Hash} ParsedPasswordHash */
/** @typedef {{ algorithm: PasswordHashAlgorithm, matches: boolean, needsRehash: boolean, rehashReason: PasswordRehashReason }} PasswordVerificationResult */

const deriveArgon2 = promisify(argon2);
const derivePbkdf2 = promisify(pbkdf2);

const CURRENT_PASSWORD_HASH_POLICY = Object.freeze({
  algorithm: "argon2id",
  version: 19,
  memory: 65_536,
  passes: 3,
  parallelism: 1,
  saltLength: 16,
  tagLength: 32,
});
const DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=1$NBqTO46AQgNS53F_RFgmSA$Du7-QMwD76ISJkDuAIDpD4AGeFRtmqMWnbKv_NtJGco";
const ARGON2_LIMITS = Object.freeze({
  maximumMemory: 262_144,
  maximumParallelism: 8,
  maximumPasses: 10,
  minimumMemory: 7_168,
  minimumParallelism: 1,
  minimumPasses: 1,
});
const PBKDF2_LIMITS = Object.freeze({
  maximumIterations: 2_000_000,
  minimumIterations: 10_000,
});

/** @returns {string} */
function createGeneratedPassword() {
  return `Aa1!${randomBytes(18).toString("base64url")}`;
}

/** @param {unknown} password @param {unknown} username @returns {{ valid: boolean, errors: string[] }} */
function validatePassword(password, username) {
  const text = String(password || "");
  const lowerText = text.toLowerCase();
  const lowerUsername = String(username || "").toLowerCase();
  const commonPasswords = new Set([
    "password",
    "password1",
    "password123",
    "admin1234",
    "letmein123",
    "changeme",
    "qwerty123",
  ]);
  /** @type {string[]} */
  const errors = [];

  if (text.length < 8) errors.push("use at least 8 characters");
  if (!/[a-z]/.test(text)) errors.push("include a lowercase letter");
  if (!/[A-Z]/.test(text)) errors.push("include an uppercase letter");
  if (!/[0-9]/.test(text)) errors.push("include a number");
  if (!/[^A-Za-z0-9]/.test(text)) errors.push("include a symbol");
  if (/\s/.test(text)) errors.push("do not use spaces");
  if (lowerUsername && lowerText.includes(lowerUsername)) errors.push("do not include the username");
  if (commonPasswords.has(lowerText)) errors.push("avoid common passwords");

  return { valid: errors.length === 0, errors };
}

/** @param {unknown} password @returns {Promise<string>} */
async function hashPassword(password) {
  const policy = CURRENT_PASSWORD_HASH_POLICY;
  const salt = randomBytes(policy.saltLength);
  const hash = Buffer.from(await deriveArgon2(policy.algorithm, {
    memory: policy.memory,
    message: String(password),
    nonce: salt,
    parallelism: policy.parallelism,
    passes: policy.passes,
    tagLength: policy.tagLength,
  }));

  return `$${policy.algorithm}$v=${policy.version}$m=${policy.memory},t=${policy.passes},p=${policy.parallelism}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

/** @param {unknown} password @param {unknown} storedPassword @returns {Promise<PasswordVerificationResult>} */
async function verifyPassword(password, storedPassword) {
  const parsed = parsePasswordHash(storedPassword);

  if (!parsed) {
    return passwordVerificationResult(false, "unknown");
  }

  if (parsed.algorithm === "argon2id") {
    const hash = Buffer.from(await deriveArgon2(parsed.algorithm, {
      memory: parsed.memory,
      message: String(password),
      nonce: parsed.salt,
      parallelism: parsed.parallelism,
      passes: parsed.passes,
      tagLength: parsed.hash.length,
    }));
    const matches = timingSafeEqualBuffers(hash, parsed.hash);
    const needsRehash = matches && !usesCurrentPolicy(parsed);

    return passwordVerificationResult(
      matches,
      parsed.algorithm,
      needsRehash,
      needsRehash ? "parameters_outdated" : null,
    );
  }

  const hash = await derivePbkdf2(
    String(password),
    parsed.salt,
    parsed.iterations,
    parsed.hash.length,
    "sha256",
  );
  const matches = timingSafeEqualBuffers(hash, parsed.hash);

  return passwordVerificationResult(
    matches,
    parsed.algorithm,
    matches,
    matches ? "legacy_algorithm" : null,
  );
}

/** @param {unknown} storedPassword @returns {ParsedPasswordHash | null} */
function parsePasswordHash(storedPassword) {
  const stored = String(storedPassword || "");

  if (stored.startsWith("$argon2id$")) {
    return parseArgon2Hash(stored);
  }

  if (stored.startsWith("pbkdf2_sha256$")) {
    return parsePbkdf2Hash(stored);
  }

  return null;
}

/** @param {string} stored @returns {ParsedArgon2Hash | null} */
function parseArgon2Hash(stored) {
  const [empty, algorithm, versionText, parametersText, saltText, hashText, ...extra] = stored.split("$");
  const parameterMatch = /^m=(\d+),t=(\d+),p=(\d+)$/.exec(parametersText || "");
  const version = Number.parseInt(String(versionText || "").replace(/^v=/, ""), 10);
  const memory = Number.parseInt(parameterMatch?.[1] || "", 10);
  const passes = Number.parseInt(parameterMatch?.[2] || "", 10);
  const parallelism = Number.parseInt(parameterMatch?.[3] || "", 10);
  const salt = decodeBase64Url(saltText);
  const hash = decodeBase64Url(hashText);

  if (
    empty !== "" ||
    algorithm !== "argon2id" ||
    versionText !== `v=${version}` ||
    version !== 19 ||
    extra.length > 0 ||
    !parameterMatch ||
    !integerInRange(memory, ARGON2_LIMITS.minimumMemory, ARGON2_LIMITS.maximumMemory) ||
    !integerInRange(passes, ARGON2_LIMITS.minimumPasses, ARGON2_LIMITS.maximumPasses) ||
    !integerInRange(parallelism, ARGON2_LIMITS.minimumParallelism, ARGON2_LIMITS.maximumParallelism) ||
    !salt ||
    !hash ||
    !bufferLengthInRange(salt, 8, 64) ||
    !bufferLengthInRange(hash, 16, 64)
  ) {
    return null;
  }

  return { algorithm, hash, memory, parallelism, passes, salt, version };
}

/** @param {string} stored @returns {ParsedPbkdf2Hash | null} */
function parsePbkdf2Hash(stored) {
  const [algorithm, iterationsText, saltText, hashText, ...extra] = stored.split("$");
  const iterations = Number.parseInt(iterationsText, 10);
  const salt = decodeBase64Url(saltText);
  const hash = decodeBase64Url(hashText);

  if (
    algorithm !== "pbkdf2_sha256" ||
    iterationsText !== String(iterations) ||
    extra.length > 0 ||
    !integerInRange(iterations, PBKDF2_LIMITS.minimumIterations, PBKDF2_LIMITS.maximumIterations) ||
    !salt ||
    !hash ||
    !bufferLengthInRange(salt, 8, 128) ||
    !bufferLengthInRange(hash, 16, 64)
  ) {
    return null;
  }

  return { algorithm, hash, iterations, salt: saltText };
}

/** @param {ParsedArgon2Hash} parsed @returns {boolean} */
function usesCurrentPolicy(parsed) {
  const policy = CURRENT_PASSWORD_HASH_POLICY;
  return parsed.algorithm === policy.algorithm &&
    parsed.version === policy.version &&
    parsed.memory === policy.memory &&
    parsed.passes === policy.passes &&
    parsed.parallelism === policy.parallelism &&
    parsed.salt.length === policy.saltLength &&
    parsed.hash.length === policy.tagLength;
}

/**
 * @param {boolean} matches
 * @param {PasswordHashAlgorithm} algorithm
 * @param {boolean} [needsRehash]
 * @param {PasswordRehashReason} [rehashReason]
 * @returns {Readonly<PasswordVerificationResult>}
 */
function passwordVerificationResult(matches, algorithm, needsRehash = false, rehashReason = null) {
  return Object.freeze({ algorithm, matches, needsRehash, rehashReason });
}

/** @param {unknown} value @returns {Buffer | null} */
function decodeBase64Url(value) {
  const text = String(value || "");

  if (!/^[A-Za-z0-9_-]+$/.test(text)) {
    return null;
  }

  const buffer = Buffer.from(text, "base64url");
  return buffer.toString("base64url") === text ? buffer : null;
}

/** @param {number} value @param {number} minimum @param {number} maximum @returns {boolean} */
function integerInRange(value, minimum, maximum) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

/** @param {Buffer} buffer @param {number} minimum @param {number} maximum @returns {boolean} */
function bufferLengthInRange(buffer, minimum, maximum) {
  return buffer.length >= minimum && buffer.length <= maximum;
}

/** @param {Buffer} left @param {Buffer} right @returns {boolean} */
function timingSafeEqualBuffers(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export {
  CURRENT_PASSWORD_HASH_POLICY,
  DUMMY_PASSWORD_HASH,
  createGeneratedPassword,
  hashPassword,
  validatePassword,
  verifyPassword,
};
