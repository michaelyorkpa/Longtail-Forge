// @ts-check

// The full-strict typecheck gate. Since `0.33.33.48.2` there is no debt ledger: every program
// is permanently at zero, so the gate enforces zero directly instead of comparing against a
// recorded debt. One run proves, for the three programs together:
// - every first-party JavaScript file is owned by exactly one program (the program universe);
// - every owned file is one its compiler actually read (owned means checked);
// - no program reports a diagnostic, and no file carries an explicit `any`;
// - no file uses a forbidden suppression, and `@ts-expect-error` appears only in the negative
//   compile fixtures under `tests/typecheck/`;
// - every first-party declaration compiles clean on its own.
// Any failure names its exact location.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const EXPLICIT_ANY_PATTERN = /(?:[:<,{|&]\s*|\bas\s+)any\b|\bany\s*(?:\[\]|[>,}|&])/g;

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const declarationPrefix = "src/types/";

/** @typedef {{ id: string, config: string, environment: string, roots: readonly string[] }} ProgramDefinition */
/**
 * One compiler diagnostic, located so the gate can name exactly where zero was broken.
 * @typedef {{ filePath: string, code: number, line: number, column: number, message: string }} ParsedDiagnostic
 */
/** @type {readonly ProgramDefinition[]} */
const PROGRAMS = Object.freeze([
  Object.freeze({ id: "server-tests", config: "tsconfig.json", environment: "node", roots: ["server.js", "worker.js", "src/", "tests/"] }),
  // The browser boundary fixture sits under `tests/`, but only `tsconfig.public.json` compiles it:
  // it proves a browser import is refused, so it must be read in the browser environment.
  Object.freeze({ id: "browser", config: "tsconfig.public.json", environment: "dom", roots: ["public/js/", "tests/typecheck/browser-database-boundary.fixture.mjs"] }),
  Object.freeze({ id: "scripts", config: "tsconfig.scripts.json", environment: "node", roots: ["scripts/", "eslint.config.js", "playwright.config.js", "vitest.config.mjs"] }),
]);

/** @typedef {{ config: string, environment: string, files: string[], diagnostics: ParsedDiagnostic[] }} ProgramState */
/** @typedef {{ programs: Record<string, ProgramState>, totals: { files: number, errors: number, explicitAny: number }, explicitAnyByFile: Record<string, number>, expectedErrorDirectives: string[], declarationProbe: { config: string, firstPartyFiles: number, errors: number } }} GovernanceState */

/** @param {string} filePath */
function toRepoPath(filePath) {
  return path.relative(rootDir, path.resolve(filePath)).split(path.sep).join("/");
}

/**
 * A file a program names exactly belongs to that program, even inside another program's
 * directory root. Otherwise it belongs to the program whose directory root contains it.
 * @param {string} filePath @param {ProgramDefinition} definition
 */
function isOwnedRoot(filePath, definition) {
  if (definition.roots.includes(filePath)) return true;
  if (PROGRAMS.some((other) => other !== definition && other.roots.includes(filePath))) return false;
  return definition.roots.some((root) => root.endsWith("/") && filePath.startsWith(root));
}

/**
 * The program that owns one repository-relative file, read from the program definitions alone:
 * null for a path that is not a first-party JavaScript file, or that no single program owns.
 * Every owned file is compiled by its program on every `npm run typecheck`, which enforces zero
 * for it, so ownership is what a regression pins in place of a per-file debt count.
 * @param {string} filePath @param {readonly string[]} [files]
 * @returns {string | null}
 */
function owningProgramId(filePath, files = firstPartyJavaScriptFiles()) {
  if (!files.includes(filePath)) return null;
  const owners = PROGRAMS.filter((definition) => isOwnedRoot(filePath, definition));
  return owners.length === 1 ? owners[0].id : null;
}

/** @param {ProgramDefinition} definition @returns {ProgramState} */
function collectProgram(definition) {
  const files = firstPartyJavaScriptFiles().filter((filePath) => isOwnedRoot(filePath, definition));
  const { diagnostics, compiledFiles } = runCompiler(definition.config, { listFiles: true });
  // `0.33.33.44.47`: ownership is not checking. A file the program owns but its compiler never
  // reads - one excluded by the config, or one its include globs do not match - would carry no
  // diagnostics however wrong it was. Every owned file must be one the compiler checked.
  const unchecked = uncheckedOwnedFiles(files, compiledFiles);
  if (unchecked.length > 0) {
    throw new Error(`${definition.id} owns files its compiler does not check: ${unchecked.join(", ")}. An owned file must be compiled, or a defect in it could hide.`);
  }
  // Every diagnostic the run reports is kept, whichever file it names: a program at zero reports
  // none, so one in a file another program owns, or in a declaration it reads, is refused too.
  return { config: definition.config, environment: definition.environment, files, diagnostics };
}

/**
 * Owned files the compiler did not read, in their owned order.
 * @param {readonly string[]} ownedFiles @param {ReadonlySet<string>} compiledFiles
 * @returns {string[]}
 */
function uncheckedOwnedFiles(ownedFiles, compiledFiles) {
  return ownedFiles.filter((filePath) => !compiledFiles.has(filePath));
}

/**
 * One compiler run. With `listFiles`, the compiler also names every file it read, which is the
 * evidence that an owned file was checked rather than merely listed.
 * @param {string} configPath @param {{ listFiles?: boolean }} [options]
 * @returns {{ diagnostics: ParsedDiagnostic[], compiledFiles: Set<string> }}
 */
function runCompiler(configPath, { listFiles = false } = {}) {
  const compilerPath = path.join(rootDir, "node_modules", "typescript", "bin", "tsc");
  const result = spawnSync(process.execPath, [compilerPath, "--pretty", "false", "-p", configPath, ...(listFiles ? ["--listFiles"] : [])], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  /** @type {ParsedDiagnostic[]} */
  const diagnostics = [];
  /** @type {Set<string>} */
  const compiledFiles = new Set();
  for (const line of `${result.stdout || ""}\n${result.stderr || ""}`.split(/\r?\n/)) {
    const located = line.match(/^(.*?)\((\d+),(\d+)\): error TS(\d+): (.*)$/);
    if (located) {
      diagnostics.push({
        filePath: located[1].replaceAll(String.fromCharCode(92), "/"),
        code: Number(located[4]),
        line: Number(located[2]),
        column: Number(located[3]),
        message: located[5],
      });
      continue;
    }
    const global = line.match(/^error TS(\d+): (.*)$/);
    if (global) {
      diagnostics.push({ filePath: "$global", code: Number(global[1]), line: 0, column: 0, message: global[2] });
      continue;
    }
    // A listed file is printed as an absolute path on its own line; diagnostic continuations
    // are indented, so they never match.
    const listed = line.trim();
    if (listFiles && listed === line && path.isAbsolute(listed)) compiledFiles.add(toRepoPath(listed));
  }
  if (result.status === 0 && diagnostics.length > 0) throw new Error(`${configPath} reported diagnostics with a successful exit`);
  if (result.status !== 0 && diagnostics.length === 0) throw new Error(`${configPath} failed without parseable diagnostics:\n${result.stderr || result.stdout}`);
  return { diagnostics, compiledFiles };
}

/** @returns {string[]} */
function firstPartyJavaScriptFiles() {
  const files = ["eslint.config.js", "playwright.config.js", "server.js", "vitest.config.mjs", "worker.js"];
  for (const directory of ["public", "scripts", "src", "tests"]) files.push(...walkJavaScriptFiles(directory));
  return files.sort();
}

/** @param {string} directory @returns {string[]} */
function walkJavaScriptFiles(directory) {
  /** @type {string[]} */
  const files = [];
  for (const entry of fs.readdirSync(path.join(rootDir, directory), { withFileTypes: true })) {
    const relativePath = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!isFirstPartyDirectoryName(entry.name)) continue;
      files.push(...walkJavaScriptFiles(relativePath));
    }
    else if (/\.(?:js|mjs)$/.test(entry.name)) files.push(relativePath);
  }
  return files;
}

/** @param {string} name */
function isFirstPartyDirectoryName(name) {
  return !name.startsWith(".");
}

/** @param {string[]} files @returns {{ explicitAnyByFile: Record<string, number>, expectedErrorDirectives: string[] }} */
function collectSourcePolicy(files) {
  /** @type {Record<string, number>} */
  const explicitAnyByFile = {};
  /** @type {string[]} */
  const expectedErrorDirectives = [];
  for (const filePath of files) {
    const source = fs.readFileSync(path.join(rootDir, filePath), "utf8");
    const forbiddenSuppression = source.split(String.fromCharCode(10)).some((line) => {
      const trimmed = line.trimStart();
      return trimmed.startsWith("// @ts-ignore") || trimmed.startsWith("// @ts-nocheck")
        || trimmed.startsWith("/* @ts-ignore") || trimmed.startsWith("/* @ts-nocheck");
    });
    if (forbiddenSuppression) throw new Error(`${filePath} uses a forbidden checker suppression`);
    for (const [index, line] of source.split(String.fromCharCode(10)).entries()) {
      if (!line.trimStart().startsWith("// @ts-expect-error")) continue;
      const lineNumber = index + 1;
      if (!filePath.startsWith("tests/typecheck/")) throw new Error(`${filePath}:${lineNumber} uses @ts-expect-error outside a negative compile fixture`);
      expectedErrorDirectives.push(`${filePath}:${lineNumber}`);
    }
    const explicitAny = countExplicitAnyAnnotations(source);
    if (explicitAny > 0) explicitAnyByFile[filePath] = explicitAny;
  }
  return { explicitAnyByFile, expectedErrorDirectives: expectedErrorDirectives.sort() };
}

// Characters and keywords after which a `/` starts a regular expression
// rather than a division. Used only by the literal stripper below.
const REGEX_PRECEDERS = new Set([..."(,=:[!&|?{};+-*%~^<>"]);
const REGEX_PRECEDING_KEYWORDS = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "case", "do", "else", "yield", "await"]);

/**
 * Blank out string, template, and regular-expression literals so the explicit-
 * `any` detector reads annotations rather than text that merely contains the
 * word.
 *
 * Comments are deliberately preserved: JSDoc type annotations live in block
 * comments and are exactly what must still be found. `0.33.33.32.28` added
 * this after the detector counted an annotation-shaped token inside a regular
 * expression whose whole purpose was to forbid such annotations elsewhere.
 *
 * Comments therefore stay in scope by design, so prose that spells an
 * annotation still counts. That is the correct trade: a missed annotation is a
 * governance hole, a counted sentence is a rewrite.
 * @param {string} source
 * @returns {string}
 */
function stripLiteralsForAnnotationScan(source) {
  let out = "";
  let index = 0;

  /** @param {number} at @returns {boolean} */
  function regexAllowedAt(at) {
    let cursor = at - 1;
    while (cursor >= 0 && /\s/.test(source[cursor])) cursor -= 1;
    if (cursor < 0) return true;
    const character = source[cursor];
    if (REGEX_PRECEDERS.has(character)) return true;
    if (!/[A-Za-z0-9_$]/.test(character)) return false;
    const end = cursor + 1;
    while (cursor >= 0 && /[A-Za-z0-9_$]/.test(source[cursor])) cursor -= 1;
    return REGEX_PRECEDING_KEYWORDS.has(source.slice(cursor + 1, end));
  }

  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];

    if (character === "/" && next === "/") {
      const end = source.indexOf("\n", index);
      const stop = end === -1 ? source.length : end;
      out += source.slice(index, stop);
      index = stop;
      continue;
    }
    if (character === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(index, stop);
      index = stop;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      const quote = character;
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === "\\") { cursor += 2; continue; }
        if (source[cursor] === quote) break;
        cursor += 1;
      }
      out += `${quote}${quote}`;
      index = cursor + 1;
      continue;
    }
    if (character === "/" && regexAllowedAt(index)) {
      let cursor = index + 1;
      let inClass = false;
      let closed = false;
      while (cursor < source.length) {
        const current = source[cursor];
        if (current === "\\") { cursor += 2; continue; }
        if (current === "\n") break;
        if (current === "[") inClass = true;
        else if (current === "]") inClass = false;
        else if (current === "/" && !inClass) { closed = true; break; }
        cursor += 1;
      }
      if (closed) {
        let end = cursor + 1;
        while (end < source.length && /[a-z]/.test(source[end])) end += 1;
        out += "/./";
        index = end;
        continue;
      }
    }

    out += character;
    index += 1;
  }

  return out;
}

/**
 * Count explicit `any` annotations in one source file.
 * @param {string} source
 * @returns {number}
 */
function countExplicitAnyAnnotations(source) {
  return [...stripLiteralsForAnnotationScan(source).matchAll(EXPLICIT_ANY_PATTERN)].length;
}

/** @returns {{ config: string, firstPartyFiles: number, errors: number }} */
function collectDeclarationProbe() {
  const firstPartyFiles = fs.readdirSync(path.join(rootDir, "src", "types")).filter((name) => name.endsWith(".d.ts")).map((name) => `${declarationPrefix}${name}`).sort();
  const failures = runCompiler("tsconfig.declarations.json").diagnostics.filter((diagnostic) => diagnostic.filePath === "$global" || diagnostic.filePath.startsWith(declarationPrefix));
  if (failures.length > 0) throw new Error(`First-party declaration probe failed: ${JSON.stringify(failures)}`);
  return { config: "tsconfig.declarations.json", firstPartyFiles: firstPartyFiles.length, errors: 0 };
}

/** @returns {GovernanceState} */
function collectGovernanceState() {
  /** @type {Record<string, ProgramState>} */
  const programs = {};
  for (const definition of PROGRAMS) programs[definition.id] = collectProgram(definition);
  const ownedFiles = Object.values(programs).flatMap((state) => state.files);
  const trackedFiles = firstPartyJavaScriptFiles();
  if (new Set(ownedFiles).size !== ownedFiles.length) throw new Error("A first-party JavaScript file belongs to more than one owning program");
  if (JSON.stringify([...ownedFiles].sort()) !== JSON.stringify(trackedFiles)) {
    const owned = new Set(ownedFiles);
    const tracked = new Set(trackedFiles);
    const missing = trackedFiles.filter((filePath) => !owned.has(filePath));
    const extra = ownedFiles.filter((filePath) => !tracked.has(filePath));
    throw new Error(`Program universe mismatch. Missing: ${missing.join(", ") || "none"}. Extra: ${extra.join(", ") || "none"}.`);
  }
  const declarations = fs.readdirSync(path.join(rootDir, "src", "types"))
    .filter((name) => name.endsWith(".d.ts"))
    .map((name) => `${declarationPrefix}${name}`);
  const policy = collectSourcePolicy([...trackedFiles, ...declarations].sort());
  const errors = Object.values(programs).reduce((total, state) => total + state.diagnostics.length, 0);
  const explicitAny = Object.values(policy.explicitAnyByFile).reduce((total, count) => total + count, 0);
  return {
    programs,
    totals: { files: trackedFiles.length, errors, explicitAny },
    explicitAnyByFile: policy.explicitAnyByFile,
    expectedErrorDirectives: policy.expectedErrorDirectives,
    declarationProbe: collectDeclarationProbe(),
  };
}

/**
 * Every reason the state is not at full-strict zero, each naming its exact location: a
 * diagnostic any program reported, and an explicit `any` in any file. Empty means zero holds.
 * @param {GovernanceState} state
 * @returns {string[]}
 */
function zeroGateErrors(state) {
  /** @type {string[]} */
  const errors = [];
  for (const [programId, program] of Object.entries(state.programs)) {
    for (const diagnostic of program.diagnostics) {
      const location = diagnostic.filePath === "$global" ? "(global)" : `${diagnostic.filePath}(${diagnostic.line},${diagnostic.column})`;
      errors.push(`${programId}: ${location}: TS${diagnostic.code}: ${diagnostic.message}`);
    }
  }
  for (const [filePath, count] of Object.entries(state.explicitAnyByFile)) {
    errors.push(`${filePath}: ${count} explicit any annotation(s)`);
  }
  return errors;
}

/**
 * Refuse any state that is not at zero. Every program has been at zero since `0.33.33.44`, so
 * there is no recorded debt to compare against and no write mode: zero is the contract.
 * @param {GovernanceState} state
 */
function enforceZero(state) {
  const errors = zeroGateErrors(state);
  if (errors.length > 0) throw new Error(`Full-strict zero is permanent; this tree breaks it:\n${errors.join("\n")}`);
}

/** @param {GovernanceState} state */
function printSummary(state) {
  for (const [id, program] of Object.entries(state.programs)) {
    console.log(`${id}: ${program.files.length} owned files, ${program.diagnostics.length} strict diagnostics (${program.config})`);
  }
  console.log(`Combined universe: ${state.totals.files} files, ${state.totals.errors} diagnostics, ${state.totals.explicitAny} explicit-any nodes.`);
  console.log(`Declaration probe: ${state.declarationProbe.firstPartyFiles} first-party declarations, 0 errors.`);
}

async function main() {
  const unknown = process.argv.slice(2);
  if (unknown.length > 0) {
    throw new Error(`Unknown typecheck option(s): ${unknown.join(" ")}. The gate takes none; the debt ledger and its write mode were retired at 0.33.33.48.2.`);
  }
  const state = collectGovernanceState();
  printSummary(state);
  enforceZero(state);
  console.log("Full-strict zero holds in every program: no diagnostic, no explicit any, every first-party file owned and checked.");
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { PROGRAMS, collectGovernanceState, collectSourcePolicy, countExplicitAnyAnnotations, enforceZero, firstPartyJavaScriptFiles, isFirstPartyDirectoryName, owningProgramId, uncheckedOwnedFiles, zeroGateErrors };
