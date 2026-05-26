import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

function createGeneratedPassword() {
  return `Aa1!${randomBytes(18).toString("base64url")}`;
}

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

function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const iterations = 310000;
  const digest = "sha256";
  const keyLength = 32;
  const hash = pbkdf2Sync(password, salt, iterations, keyLength, digest).toString("base64url");

  return `pbkdf2_${digest}$${iterations}$${salt}$${hash}`;
}

function verifyPassword(password, storedPassword) {
  const [algorithm, iterationsText, salt, storedHash] = String(storedPassword || "").split("$");
  const digest = algorithm === "pbkdf2_sha256" ? "sha256" : "";
  const iterations = Number.parseInt(iterationsText, 10);

  if (!digest || !Number.isFinite(iterations) || !salt || !storedHash) {
    return false;
  }

  const keyLength = Math.max(32, Buffer.from(storedHash, "base64url").length);
  const hash = pbkdf2Sync(password, salt, iterations, keyLength, digest).toString("base64url");

  return timingSafeEqualText(hash, storedHash);
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export { createGeneratedPassword, hashPassword, validatePassword, verifyPassword };
