import { readdirSync, readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/**
 * @typedef {object} RuntimeSourceEntry
 * @property {string} absolutePath
 * @property {string} file
 * @property {string} filePath
 * @property {string} source
 */

/**
 * @typedef {object} RuntimeSourceScanOptions
 * @property {string} [root]
 * @property {string} [sourceDir]
 */

/**
 * @param {RuntimeSourceScanOptions} [options]
 * @returns {RuntimeSourceEntry[]}
 */
export function readRuntimeSourceEntries({ root = process.cwd(), sourceDir = "src" } = {}) {
  return listRuntimeSourceFiles({ root, sourceDir }).map((absolutePath) => {
    const file = normalizeProjectPath(root, absolutePath);
    return {
      absolutePath,
      file,
      filePath: file,
      source: readFileSync(absolutePath, "utf8"),
    };
  });
}

/**
 * @param {RuntimeSourceScanOptions} [options]
 * @returns {string[]}
 */
export function listRuntimeSourceFiles({ root = process.cwd(), sourceDir = "src" } = {}) {
  /** @type {string[]} */
  const files = [];
  walk(path.join(root, sourceDir), files);
  return files;
}

/**
 * @param {string} root
 * @param {string} filePath
 * @returns {string}
 */
export function normalizeProjectPath(root, filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

/**
 * @param {string} source
 * @param {number} index
 * @returns {number}
 */
export function lineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

/** @param {{ root?: string }} [options] */
export function createProjectTextReader({ root = PROJECT_ROOT } = {}) {
  /** @type {Map<string, string>} */
  const cache = new Map();
  /** @type {Map<string, Promise<string>>} */
  const asyncCache = new Map();
  /** @param {string} relativePath */
  const readText = (relativePath) => {
    const normalizedPath = normalizeReaderPath(relativePath);
    if (!cache.has(normalizedPath)) {
      cache.set(normalizedPath, readFileSync(path.join(root, normalizedPath), "utf8"));
    }
    return /** @type {string} */ (cache.get(normalizedPath));
  };
  /** @param {string} relativePath */
  const readTextAsync = (relativePath) => {
    const normalizedPath = normalizeReaderPath(relativePath);
    if (!asyncCache.has(normalizedPath)) {
      asyncCache.set(normalizedPath, readFile(path.join(root, normalizedPath), "utf8"));
    }
    return /** @type {Promise<string>} */ (asyncCache.get(normalizedPath));
  };
  return Object.freeze({
    readJson: (/** @type {string} */ relativePath) => JSON.parse(readText(relativePath)),
    readMarkdown: (/** @type {string} */ relativePath) => {
      if (!/\.md$/i.test(relativePath || "")) {
        throw new Error(`Markdown source reads require a .md path: ${relativePath}`);
      }
      return readText(relativePath);
    },
    readText,
    readTextAsync,
  });
}

/**
 * @param {string} source
 * @param {string} functionName
 * @returns {string}
 */
export function extractFunctionBlock(source, functionName) {
  const declaration = new RegExp(`(?:async\\s+)?function\\s+${escapeRegExp(functionName)}\\s*\\(`).exec(source);
  if (!declaration) {
    throw new Error(`${functionName} should exist`);
  }
  const signature = extractCallExpression(source, declaration.index);
  const openBrace = source.indexOf("{", declaration.index + signature.length);
  return source.slice(declaration.index, findBalancedClose(source, openBrace) + 1);
}

/**
 * Extract one named function's body, from its opening brace through the
 * matching close, braces included.
 *
 * This is a different region from `extractFunctionBlock`, which spans the
 * declaration as well, and the difference is load-bearing: an owner asserting
 * about a body must not accidentally match the signature, and an owner
 * asserting about a declaration must not lose it. `0.33.33.32.28.4.1` measured
 * 144 extractions across sixteen contract modules and found 82 that want this
 * region and 56 that want the other, so both are published rather than one
 * being forced onto the other.
 *
 * The declaration is matched the same anchored way as `extractFunctionBlock`,
 * which is what stops a call site being mistaken for a definition, and the
 * parameter list is walked as a balanced group, because a default such as
 * `(candidate = {})` puts a brace inside the signature.
 * @param {string} source
 * @param {string} functionName
 * @returns {string}
 */
export function extractFunctionBody(source, functionName) {
  const declaration = new RegExp(`(?:async\\s+)?function\\s+${escapeRegExp(functionName)}\\s*\\(`).exec(source);
  if (!declaration) {
    throw new Error(`${functionName} should exist`);
  }
  let cursor = declaration.index + declaration[0].length - 1;
  let parens = 0;
  for (; cursor < source.length; cursor += 1) {
    if (source[cursor] === "(") parens += 1;
    else if (source[cursor] === ")") {
      parens -= 1;
      if (parens === 0) break;
    }
  }
  const openBrace = source.indexOf("{", cursor);
  if (openBrace === -1) {
    throw new Error(`${functionName} should have a body`);
  }
  return source.slice(openBrace, findBalancedClose(source, openBrace) + 1);
}

/**
 * @param {string} source
 * @param {readonly string[]} snippets
 * @returns {boolean}
 */
export function sourceContainsInOrder(source, snippets) {
  let cursor = 0;
  for (const snippet of snippets) {
    const index = source.indexOf(snippet, cursor);
    if (index === -1) {
      return false;
    }
    cursor = index + snippet.length;
  }
  return true;
}

/**
 * @param {string} source
 * @param {number} startIndex
 * @returns {string}
 */
export function extractCallExpression(source, startIndex) {
  const openIndex = source.indexOf("(", startIndex);
  let depth = 0;
  let escapeNext = false;
  let quote = "";
  let templateDepth = 0;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        escapeNext = true;
        continue;
      }

      if (quote === "`" && char === "$" && source[index + 1] === "{") {
        templateDepth += 1;
        index += 1;
        continue;
      }

      if (quote === "`" && char === "}" && templateDepth > 0) {
        templateDepth -= 1;
        continue;
      }

      if (char === quote && (quote !== "`" || templateDepth === 0)) {
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  return source.slice(startIndex);
}

/**
 * @param {string} source
 * @returns {string[]}
 */
export function splitTopLevelArguments(source) {
  /** @type {string[]} */
  const args = [];
  let depth = 0;
  let escapeNext = false;
  let quote = "";
  let start = 0;
  let templateDepth = 0;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        escapeNext = true;
        continue;
      }

      if (quote === "`" && char === "$" && source[index + 1] === "{") {
        templateDepth += 1;
        index += 1;
        continue;
      }

      if (quote === "`" && char === "}" && templateDepth > 0) {
        templateDepth -= 1;
        continue;
      }

      if (char === quote && (quote !== "`" || templateDepth === 0)) {
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "(" || char === "{" || char === "[") {
      depth += 1;
    } else if (char === ")" || char === "}" || char === "]") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      args.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }

  const lastArg = source.slice(start).trim();
  if (lastArg) {
    args.push(lastArg);
  }
  return args;
}

/**
 * @param {string} currentPath
 * @param {string[]} results
 */
function walk(currentPath, results) {
  const stat = statSync(currentPath);

  if (stat.isDirectory()) {
    for (const entry of readdirSync(currentPath)) {
      walk(path.join(currentPath, entry), results);
    }
    return;
  }

  if (/\.(?:js|mjs)$/.test(currentPath)) {
    results.push(currentPath);
  }
}

/**
 * @param {string} source
 * @param {number} openIndex
 * @returns {number}
 */
function findBalancedClose(source, openIndex) {
  if (openIndex === -1) {
    throw new Error("Balanced source block should include an opening brace.");
  }
  let depth = 0;
  let escapeNext = false;
  let quote = "";
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escapeNext) {
        escapeNext = false;
      } else if (char === "\\") {
        escapeNext = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  throw new Error("Balanced source block is missing its closing brace.");
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {string} relativePath
 * @returns {string}
 */
function normalizeReaderPath(relativePath) {
  const normalizedPath = String(relativePath || "").replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalizedPath || path.isAbsolute(normalizedPath) || normalizedPath.split("/").includes("..")) {
    throw new Error(`Project source reads require an explicit repository-relative path: ${relativePath}`);
  }
  return normalizedPath;
}
