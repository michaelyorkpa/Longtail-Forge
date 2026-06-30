import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config, readRuntimeSecret } from "../../config.js";
import { AppError } from "../../core/errors.js";

const BODY_ALGORITHM = "aes-256-gcm";
const KEY_WRAPPING_ALGORITHM = "aes-256-gcm";
const PAYLOAD_VERSION = "1";
const DEFAULT_KEY_VERSION = "v1";

function encryptSecureNoteBody(bodyMarkdown = "") {
  const masterKey = readMasterKey();
  const dataKey = randomBytes(32);
  const bodyNonce = randomBytes(12);
  const bodyCipher = createCipheriv(BODY_ALGORITHM, dataKey, bodyNonce);
  const securePayload = Buffer.concat([
    bodyCipher.update(String(bodyMarkdown), "utf8"),
    bodyCipher.final(),
  ]);
  const bodyTag = bodyCipher.getAuthTag();
  const wrapNonce = randomBytes(12);
  const wrapCipher = createCipheriv(KEY_WRAPPING_ALGORITHM, masterKey, wrapNonce);
  const wrappedDataKey = Buffer.concat([
    wrapCipher.update(dataKey),
    wrapCipher.final(),
  ]);
  const wrapTag = wrapCipher.getAuthTag();

  return {
    secure_payload: securePayload.toString("base64"),
    secure_payload_version: PAYLOAD_VERSION,
    encrypted_data_key: wrappedDataKey.toString("base64"),
    encryption_key_version: currentSecureNotesKeyVersion(),
    encryption_algorithm: BODY_ALGORITHM,
    key_wrapping_algorithm: KEY_WRAPPING_ALGORITHM,
    encryption_nonce: bodyNonce.toString("base64"),
    encryption_auth_tag: bodyTag.toString("base64"),
    key_wrapping_nonce: wrapNonce.toString("base64"),
    key_wrapping_auth_tag: wrapTag.toString("base64"),
    encrypted_at: new Date().toISOString(),
  };
}

function decryptSecureNoteBody(note = {}) {
  assertEncryptedPayloadPresent(note);
  const masterKey = readMasterKey();

  try {
    const dataKey = unwrapDataKey(note, masterKey);
    const decipher = createDecipheriv(
      note.encryption_algorithm || BODY_ALGORITHM,
      dataKey,
      Buffer.from(note.encryption_nonce, "base64"),
    );
    decipher.setAuthTag(Buffer.from(note.encryption_auth_tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(note.secure_payload, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    throw new AppError("Secure note could not be decrypted.", 423, {
      code: "SECURE_NOTE_DECRYPT_FAILED",
      cause: error,
    });
  }
}

function assertSecureNotesConfigured() {
  readMasterKey();
}

function describeSecureNotesConfiguration() {
  try {
    readMasterKey();
    return {
      configured: true,
      bodyAlgorithm: BODY_ALGORITHM,
      keyVersion: currentSecureNotesKeyVersion(),
      keyWrappingAlgorithm: KEY_WRAPPING_ALGORITHM,
      payloadVersion: PAYLOAD_VERSION,
    };
  } catch (error) {
    return {
      configured: false,
      bodyAlgorithm: BODY_ALGORITHM,
      keyVersion: currentSecureNotesKeyVersion(),
      keyWrappingAlgorithm: KEY_WRAPPING_ALGORITHM,
      payloadVersion: PAYLOAD_VERSION,
      reason: error?.code || "SECURE_NOTES_NOT_CONFIGURED",
    };
  }
}

function hasEncryptedSecurePayload(note = {}) {
  return Boolean(
    note.secure_payload &&
    note.encrypted_data_key &&
    note.encryption_nonce &&
    note.encryption_auth_tag &&
    note.key_wrapping_nonce &&
    note.key_wrapping_auth_tag,
  );
}

function safeSecurePlaceholders() {
  return {
    body_markdown: "",
    body_excerpt: null,
    body_plaintext_index: null,
  };
}

function assertEncryptedPayloadPresent(note = {}) {
  if (!hasEncryptedSecurePayload(note)) {
    throw new AppError("Secure note content is locked until it is recreated through the secure-note flow.", 423, {
      code: "SECURE_NOTE_PLACEHOLDER_LOCKED",
    });
  }
}

function unwrapDataKey(note, masterKey) {
  const decipher = createDecipheriv(
    note.key_wrapping_algorithm || KEY_WRAPPING_ALGORITHM,
    masterKey,
    Buffer.from(note.key_wrapping_nonce, "base64"),
  );
  decipher.setAuthTag(Buffer.from(note.key_wrapping_auth_tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(note.encrypted_data_key, "base64")),
    decipher.final(),
  ]);
}

function readMasterKey() {
  const raw = readRuntimeSecret("LONGTAIL_SECURE_NOTES_MASTER_KEY") || readRuntimeSecret("SECURE_NOTES_MASTER_KEY");
  const value = raw.trim();

  if (!value) {
    throw new AppError("Secure notes encryption is not configured.", 503, {
      code: "SECURE_NOTES_NOT_CONFIGURED",
    });
  }

  if (/^[a-f0-9]{64}$/i.test(value)) {
    return Buffer.from(value, "hex");
  }

  try {
    const decoded = Buffer.from(value, "base64");
    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    // Fall back to hashing below.
  }

  return createHash("sha256").update(value, "utf8").digest();
}

function currentSecureNotesKeyVersion() {
  return config.secureNotes.keyVersion || DEFAULT_KEY_VERSION;
}

export {
  BODY_ALGORITHM,
  KEY_WRAPPING_ALGORITHM,
  PAYLOAD_VERSION,
  assertEncryptedPayloadPresent,
  assertSecureNotesConfigured,
  decryptSecureNoteBody,
  describeSecureNotesConfiguration,
  encryptSecureNoteBody,
  hasEncryptedSecurePayload,
  safeSecurePlaceholders,
};
