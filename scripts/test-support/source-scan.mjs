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
 * Extract one named function's declaration through its matching closing brace.
 *
 * The declaration is located in the masked source, so declaration-shaped text
 * inside a comment or a string cannot be mistaken for the real one, and the
 * closing brace is found by walking masked braces, so a brace inside a comment,
 * a string, a template literal, or a regular expression cannot end the region
 * early. See `maskNonCode` for what the scanner does and does not support.
 * @param {string} source
 * @param {string} functionName
 * @returns {string}
 */
export function extractFunctionBlock(source, functionName) {
  const masked = scannableSource(source);
  const declaration = findDeclaration(masked, functionName);
  const openBrace = findBodyBrace(masked, declaration, functionName);
  return source.slice(declaration.index, findBalancedClose(masked, openBrace) + 1);
}

/**
 * Extract one named function's body, from its opening brace through the
 * matching close, braces included.
 *
 * This is a different region from `extractFunctionBlock`, which spans the
 * declaration as well, and the difference is load-bearing: an owner asserting
 * about a body must not accidentally match the signature, and an owner
 * asserting about a declaration must not lose it. `0.33.33.32.28.4.1` measured
 * 174 extractions across sixteen contract modules and found 112 that want this
 * region and 62 that want the other, so both are published rather than one
 * being forced onto the other.
 * @param {string} source
 * @param {string} functionName
 * @returns {string}
 */
export function extractFunctionBody(source, functionName) {
  const masked = scannableSource(source);
  const declaration = findDeclaration(masked, functionName);
  const openBrace = findBodyBrace(masked, declaration, functionName);
  return source.slice(openBrace, findBalancedClose(masked, openBrace) + 1);
}

/**
 * Extract one named function's declaration through everything that follows it,
 * up to the next top-level function declaration or the end of the source.
 *
 * This is a third region, wider than `extractFunctionBlock`: it deliberately
 * includes whatever sits between a function and the next one — the trailing
 * constants, lookup tables, and `class` declarations that several owners assert
 * about together with the function that consumes them. A top-level `const` or
 * `class` therefore does not end the span; only the next `function` does.
 *
 * `0.33.33.32.28.4.2` published this because thirteen Tasks contract modules
 * had written the same region by hand, and their hand-written version located
 * the declaration with a substring search — which answers a longer name that
 * merely starts with the one asked for, and answers a mention inside a comment.
 * This one anchors the declaration and searches masked source, so neither can
 * happen.
 * @param {string} source
 * @param {string} functionName
 * @returns {string}
 */
export function extractFunctionSpan(source, functionName) {
  const masked = scannableSource(source);
  const declaration = findDeclaration(masked, functionName);
  const next = /\n(?:async\s+)?function\s+/.exec(masked.slice(declaration.index + 1));
  const end = next ? declaration.index + 1 + next.index : source.length;
  return source.slice(declaration.index, end);
}

/**
 * @param {string} masked
 * @param {string} functionName
 * @returns {RegExpExecArray}
 */
function findDeclaration(masked, functionName) {
  const declaration = new RegExp(`(?:async\\s+)?function\\s+${escapeRegExp(functionName)}\\s*\\(`).exec(masked);
  if (!declaration) {
    throw new Error(`${functionName} should exist`);
  }
  return declaration;
}

/**
 * Walk the parameter list as a balanced group and answer the brace that opens
 * the body. The parameter list is walked rather than searched because a default
 * such as `(candidate = {})` puts a brace inside the signature.
 * @param {string} masked
 * @param {RegExpExecArray} declaration
 * @param {string} functionName
 * @returns {number}
 */
function findBodyBrace(masked, declaration, functionName) {
  let cursor = declaration.index + declaration[0].length - 1;
  let parens = 0;
  for (; cursor < masked.length; cursor += 1) {
    if (masked[cursor] === "(") parens += 1;
    else if (masked[cursor] === ")") {
      parens -= 1;
      if (parens === 0) break;
    }
  }
  const openBrace = masked.indexOf("{", cursor);
  if (openBrace === -1) {
    throw new Error(`${functionName} should have a body`);
  }
  return openBrace;
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
 * Answer the brace matching the one at `openIndex`.
 *
 * This walks masked source, where every comment, string, template-literal
 * text, and regular-expression literal has already been blanked, so it counts
 * braces and nothing else.
 * @param {string} masked
 * @param {number} openIndex
 * @returns {number}
 */
function findBalancedClose(masked, openIndex) {
  if (openIndex === -1) {
    throw new Error("Balanced source block should include an opening brace.");
  }
  let depth = 0;
  for (let index = openIndex; index < masked.length; index += 1) {
    const char = masked[index];
    if (char === "{") {
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

/**
 * Characters after which a `/` opens a regular-expression literal rather than
 * dividing. The list is the operator and punctuator set that cannot end an
 * expression, so nothing can be divided by what follows them.
 */
const REGEX_MAY_FOLLOW = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "+", "-", "*", "%", "^", "~", ";", "{", "}", "<", ">", "\n"]);

/** Keywords after which a `/` opens a regular-expression literal. */
const REGEX_MAY_FOLLOW_WORD = /(?:^|[^A-Za-z0-9_$])(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;

/** Masking is O(source) and the same file is extracted from dozens of times. */
const MASK_CACHE_LIMIT = 16;
/** @type {Map<string, string>} */
const maskCache = new Map();

/**
 * Blank every character that is not executable code, preserving length and
 * every line break so an index into the result is an index into the original.
 *
 * Comments, string bodies, template-literal text, and regular-expression
 * literals are replaced with spaces. Template *substitutions* stay code,
 * because they are, and their brace depth is tracked so an object literal
 * inside `${...}` does not close the substitution early.
 *
 * **What this is not.** It is a lexical scanner, not a JavaScript parser, and
 * it commits to one measured reading of the language's genuine ambiguity: a
 * `/` immediately after `)` is division. That is correct for all 49 occurrences
 * in this repository, every one of them arithmetic such as
 * `Math.floor((a - b) / 1000)`. The form it therefore cannot read is a regular
 * expression in that position, as in `if (ok) /x/.test(value)`; no first-party
 * source contains one. A `/` that is classified as a regular expression but
 * does not terminate on its own line is reclassified as division, because a
 * regular-expression literal cannot span a line break.
 *
 * Rather than let a misreading pass silently, `scannableSource` checks that the
 * masked braces balance and refuses the source if they do not.
 * @param {string} source
 * @returns {string}
 */
function maskNonCode(source) {
  const masked = [...source];
  /** @type {Array<{ kind: string, depth: number }>} */
  const stack = [{ kind: "code", depth: 0 }];
  let index = 0;
  let previousCode = "";

  /** @param {number} from @param {number} to */
  const blank = (from, to) => {
    for (let at = from; at < to && at < masked.length; at += 1) {
      if (masked[at] !== "\n" && masked[at] !== "\r") masked[at] = " ";
    }
  };

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    const frame = stack[stack.length - 1];

    if (frame.kind === "line-comment") {
      if (char === "\n") {
        stack.pop();
        index += 1;
        continue;
      }
      blank(index, index + 1);
      index += 1;
      continue;
    }
    if (frame.kind === "block-comment") {
      if (char === "*" && next === "/") {
        blank(index, index + 2);
        stack.pop();
        index += 2;
        continue;
      }
      blank(index, index + 1);
      index += 1;
      continue;
    }
    if (frame.kind === "single" || frame.kind === "double") {
      if (char === "\\") {
        blank(index, index + 2);
        index += 2;
        continue;
      }
      if (char === (frame.kind === "single" ? "'" : "\"")) {
        stack.pop();
        previousCode = "\"";
        index += 1;
        continue;
      }
      blank(index, index + 1);
      index += 1;
      continue;
    }
    if (frame.kind === "template") {
      if (char === "\\") {
        blank(index, index + 2);
        index += 2;
        continue;
      }
      if (char === "$" && next === "{") {
        stack.push({ kind: "substitution", depth: 0 });
        previousCode = "{";
        index += 2;
        continue;
      }
      if (char === "`") {
        stack.pop();
        previousCode = "`";
        index += 1;
        continue;
      }
      blank(index, index + 1);
      index += 1;
      continue;
    }

    if (char === "/" && next === "/") {
      stack.push({ kind: "line-comment", depth: 0 });
      blank(index, index + 2);
      index += 2;
      continue;
    }
    if (char === "/" && next === "*") {
      stack.push({ kind: "block-comment", depth: 0 });
      blank(index, index + 2);
      index += 2;
      continue;
    }
    if (char === "'" || char === "\"") {
      stack.push({ kind: char === "'" ? "single" : "double", depth: 0 });
      index += 1;
      continue;
    }
    if (char === "`") {
      stack.push({ kind: "template", depth: 0 });
      index += 1;
      continue;
    }
    if (char === "{") {
      frame.depth += 1;
      previousCode = "{";
      index += 1;
      continue;
    }
    if (char === "}") {
      if (frame.kind === "substitution" && frame.depth === 0) {
        stack.pop();
      } else {
        frame.depth -= 1;
      }
      previousCode = "}";
      index += 1;
      continue;
    }
    if (char === "/") {
      if (opensRegularExpression(previousCode)) {
        const end = scanRegularExpression(source, index);
        if (end !== -1) {
          blank(index, end);
          previousCode = "/";
          index = end;
          continue;
        }
      }
      previousCode = "/";
      index += 1;
      continue;
    }
    if (char === "\n") previousCode = "\n";
    else if (!/\s/.test(char)) previousCode = (previousCode + char).slice(-16);
    index += 1;
  }

  return masked.join("");
}

/**
 * Mask one source and refuse it if the masking cannot be trusted.
 *
 * A source whose masked braces do not balance has been misread — an
 * unsupported lexical form, an unterminated literal, or a fragment rather than
 * a file. Returning a region cut from a misread source is the failure mode
 * these helpers exist to prevent, because a truncated region makes
 * `assert.doesNotMatch` pass for the wrong reason.
 * @param {string} source
 * @returns {string}
 */
function scannableSource(source) {
  const cached = maskCache.get(source);
  if (cached !== undefined) {
    return cached;
  }
  const masked = maskNonCode(source);
  let depth = 0;
  for (const char of masked) {
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth < 0) {
        throw new Error("Source could not be scanned: a closing brace appears before its opening brace once comments, strings, template literals, and regular expressions are masked. source-scan reads a `/` after `)` as division, so it cannot read a regular-expression literal in that position.");
      }
    }
  }
  if (depth !== 0) {
    throw new Error(`Source could not be scanned: ${depth} unclosed brace(s) once comments, strings, template literals, and regular expressions are masked. source-scan reads a \`/\` after \`)\` as division, so it cannot read a regular-expression literal in that position.`);
  }
  if (maskCache.size >= MASK_CACHE_LIMIT) {
    maskCache.delete(/** @type {string} */ (maskCache.keys().next().value));
  }
  maskCache.set(source, masked);
  return masked;
}

/**
 * @param {string} previousCode the last few code characters before the slash
 * @returns {boolean}
 */
function opensRegularExpression(previousCode) {
  const last = previousCode.slice(-1);
  if (last === "" || REGEX_MAY_FOLLOW.has(last)) {
    return true;
  }
  return REGEX_MAY_FOLLOW_WORD.test(previousCode);
}

/**
 * @param {string} source
 * @param {number} openIndex
 * @returns {number} the index just past the literal and its flags, or -1 when
 * it does not terminate on its own line, which means it was division after all
 */
function scanRegularExpression(source, openIndex) {
  let inCharacterClass = false;
  for (let index = openIndex + 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\n") {
      return -1;
    }
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (inCharacterClass) {
      if (char === "]") inCharacterClass = false;
      continue;
    }
    if (char === "[") {
      inCharacterClass = true;
      continue;
    }
    if (char === "/") {
      let end = index + 1;
      while (end < source.length && /[dgimsuvy]/.test(source[end])) end += 1;
      return end;
    }
  }
  return -1;
}
