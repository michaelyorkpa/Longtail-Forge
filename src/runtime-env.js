import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_ENV_FILE = path.join(root, ".env");

/** @typedef {Record<string, string | undefined>} RuntimeEnvironment */
/** @typedef {{ envFile?: string, env?: RuntimeEnvironment, override?: boolean }} RuntimeEnvFileOptions */
/** @typedef {{ loaded: boolean, path: string, parsed: number, applied: number, skipped: number }} RuntimeEnvFileResult */
/** @typedef {{ key: string, value: string }} ParsedRuntimeEnvLine */

/** @param {RuntimeEnvFileOptions} [options] @returns {RuntimeEnvFileResult} */
function loadRuntimeEnvFile(options = {}) {
  const envFile = options.envFile || DEFAULT_ENV_FILE;
  const env = options.env || process.env;
  const override = options.override === true;

  if (!fs.existsSync(envFile)) {
    return { loaded: false, path: envFile, parsed: 0, applied: 0, skipped: 0 };
  }

  const parsed = parseRuntimeEnvText(fs.readFileSync(envFile, "utf8"), envFile);
  let applied = 0;
  let skipped = 0;

  for (const [key, value] of Object.entries(parsed)) {
    if (!override && env[key] !== undefined) {
      skipped += 1;
      continue;
    }

    env[key] = value;
    applied += 1;
  }

  return {
    loaded: true,
    path: envFile,
    parsed: Object.keys(parsed).length,
    applied,
    skipped,
  };
}

/** @param {unknown} text @param {string} [sourceName] @returns {Record<string, string>} */
function parseRuntimeEnvText(text, sourceName = ".env") {
  /** @type {Record<string, string>} */
  const values = {};
  const normalizedText = String(text || "").replace(/^\uFEFF/, "");
  const lines = normalizedText.split(/\r?\n/);

  lines.forEach((line, index) => {
    const parsed = parseRuntimeEnvLine(line, index + 1, sourceName);

    if (parsed) {
      values[parsed.key] = parsed.value;
    }
  });

  return values;
}

/** @param {string} line @param {number} lineNumber @param {string} sourceName @returns {ParsedRuntimeEnvLine | null} */
function parseRuntimeEnvLine(line, lineNumber, sourceName) {
  const trimmed = String(line || "").trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const body = trimmed.startsWith("export ") ? trimmed.slice(7).trimStart() : trimmed;
  const separatorIndex = body.indexOf("=");

  if (separatorIndex <= 0) {
    throw new Error(`${sourceName}:${lineNumber} must use KEY=VALUE syntax.`);
  }

  const key = body.slice(0, separatorIndex).trim();
  const rawValue = body.slice(separatorIndex + 1).trimStart();

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new Error(`${sourceName}:${lineNumber} has an invalid environment variable name.`);
  }

  return {
    key,
    value: parseRuntimeEnvValue(rawValue, lineNumber, sourceName),
  };
}

/** @param {string} rawValue @param {number} lineNumber @param {string} sourceName @returns {string} */
function parseRuntimeEnvValue(rawValue, lineNumber, sourceName) {
  const trimmed = String(rawValue || "").trim();

  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("\"") || trimmed.startsWith("'")) {
    return parseQuotedRuntimeEnvValue(trimmed, lineNumber, sourceName);
  }

  return parseUnquotedRuntimeEnvValue(rawValue);
}

/** @param {string} value @param {number} lineNumber @param {string} sourceName @returns {string} */
function parseQuotedRuntimeEnvValue(value, lineNumber, sourceName) {
  const quote = value.charAt(0);
  let escaped = false;

  for (let index = 1; index < value.length; index += 1) {
    const character = value.charAt(index);

    if (quote === "\"" && character === "\\" && !escaped) {
      escaped = true;
      continue;
    }

    if (character === quote && !escaped) {
      const trailing = value.slice(index + 1).trim();

      if (trailing && !trailing.startsWith("#")) {
        throw new Error(`${sourceName}:${lineNumber} has unexpected text after a quoted value.`);
      }

      const inner = value.slice(1, index);
      return quote === "\"" ? unescapeDoubleQuotedValue(inner) : inner;
    }

    escaped = false;
  }

  throw new Error(`${sourceName}:${lineNumber} has an unterminated quoted value.`);
}

/** @param {string} value @returns {string} */
function parseUnquotedRuntimeEnvValue(value) {
  let parsed = "";

  for (let index = 0; index < value.length; index += 1) {
    const character = value.charAt(index);

    if (character === "#" && (index === 0 || /\s/.test(value.charAt(index - 1)))) {
      break;
    }

    parsed += character;
  }

  return parsed.trim();
}

/** @param {string} value @returns {string} */
function unescapeDoubleQuotedValue(value) {
  return value.replace(/\\([nrt"\\])/g, (_match, escaped) => {
    switch (escaped) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      default:
        return escaped;
    }
  });
}

export { loadRuntimeEnvFile, parseRuntimeEnvText };
