// @ts-check

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { readActiveRoadmapCursor } from "./lib/roadmap-cursor.mjs";

const EXPLICIT_ANY_PATTERN = /(?:[:<,{|&]\s*|\bas\s+)any\b|\bany\s*(?:\[\]|[>,}|&])/g;

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ledgerPath = path.join(rootDir, "scripts", "typecheck-debt-ledger.json");
const declarationPrefix = "src/types/";

/** @typedef {{ id: string, config: string, environment: string, roots: readonly string[] }} ProgramDefinition */
/** @typedef {{ filePath: string, code: number }} ParsedDiagnostic */
/** @type {readonly ProgramDefinition[]} */
const PROGRAMS = Object.freeze([
  Object.freeze({ id: "server-tests", config: "tsconfig.json", environment: "node", roots: ["server.js", "worker.js", "src/", "tests/"] }),
  Object.freeze({ id: "browser", config: "tsconfig.public.json", environment: "dom", roots: ["public/js/"] }),
  Object.freeze({ id: "scripts", config: "tsconfig.scripts.json", environment: "node", roots: ["scripts/", "eslint.config.js", "playwright.config.js", "vitest.config.mjs"] }),
]);

/** @typedef {{ code: number, count: number }} DiagnosticCount */
/** @typedef {{ config: string, environment: string, files: string[], errorCount: number, diagnostics: Record<string, DiagnosticCount[]> }} ProgramState */
/** @typedef {{ schemaVersion: number, checkpoint: string, programs: Record<string, ProgramState>, totals: { files: number, errors: number, explicitAny: number }, explicitAnyByFile: Record<string, number>, expectedErrorDirectives: string[], declarationProbe: { config: string, firstPartyFiles: number, errors: number } }} GovernanceState */

/** @param {string} filePath */
function toRepoPath(filePath) {
  return path.relative(rootDir, path.resolve(filePath)).split(path.sep).join("/");
}

/**
 * The checkpoint stamp is write-derived: it records the first open numbered
 * checkpoint heading in the live roadmap at the moment the ledger is written,
 * falling back to the roadmap's active version cursor once every numbered
 * checkpoint has archived. Verification compares against the stored stamp, so
 * the recorded value always means "checkpoint active at the last reviewed
 * ledger write" and can never silently go stale.
 * @returns {string}
 */
function activeRoadmapCheckpoint() {
  const roadmapSource = fs.readFileSync(path.join(rootDir, "ROADMAP.md"), "utf8");
  const heading = roadmapSource.match(/^### ([0-9]+(?:\.[0-9]+)+)(?: -|$)/m);
  return heading ? heading[1] : readActiveRoadmapCursor({ roadmapSource });
}

/** @param {string} filePath @param {ProgramDefinition} definition */
function isOwnedRoot(filePath, definition) {
  return definition.roots.some((root) => root.endsWith("/") ? filePath.startsWith(root) : filePath === root);
}

/** @param {ProgramDefinition} definition @returns {ProgramState} */
function collectProgram(definition) {
  const files = firstPartyJavaScriptFiles().filter((filePath) => isOwnedRoot(filePath, definition));
  const owned = new Set(files);
  /** @type {Map<string, number>} */
  const grouped = new Map();
  for (const diagnostic of runCompiler(definition.config)) {
    if (diagnostic.filePath !== "$global" && !owned.has(diagnostic.filePath)) continue;
    const key = `${diagnostic.filePath}\u0000${diagnostic.code}`;
    grouped.set(key, (grouped.get(key) || 0) + 1);
  }
  /** @type {Record<string, DiagnosticCount[]>} */
  const diagnostics = {};
  for (const [key, count] of [...grouped].sort(([left], [right]) => left.localeCompare(right))) {
    const [filePath, codeText] = key.split("\u0000");
    (diagnostics[filePath] ||= []).push({ code: Number(codeText), count });
  }
  const errorCount = Object.values(diagnostics).flat().reduce((total, entry) => total + entry.count, 0);
  return { config: definition.config, environment: definition.environment, files, errorCount, diagnostics };
}

/** @param {string} configPath @returns {ParsedDiagnostic[]} */
function runCompiler(configPath) {
  const compilerPath = path.join(rootDir, "node_modules", "typescript", "bin", "tsc");
  const result = spawnSync(process.execPath, [compilerPath, "--pretty", "false", "-p", configPath], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  /** @type {ParsedDiagnostic[]} */
  const diagnostics = [];
  for (const line of `${result.stdout || ""}\n${result.stderr || ""}`.split(/\r?\n/)) {
    const located = line.match(/^(.*?)\(\d+,\d+\): error TS(\d+):/);
    if (located) {
      diagnostics.push({ filePath: located[1].replaceAll(String.fromCharCode(92), "/"), code: Number(located[2]) });
      continue;
    }
    const global = line.match(/^error TS(\d+):/);
    if (global) diagnostics.push({ filePath: "$global", code: Number(global[1]) });
  }
  if (result.status === 0 && diagnostics.length > 0) throw new Error(`${configPath} reported diagnostics with a successful exit`);
  if (result.status !== 0 && diagnostics.length === 0) throw new Error(`${configPath} failed without parseable diagnostics:\n${result.stderr || result.stdout}`);
  return diagnostics;
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
  const failures = runCompiler("tsconfig.declarations.json").filter((diagnostic) => diagnostic.filePath === "$global" || diagnostic.filePath.startsWith(declarationPrefix));
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
  const errors = Object.values(programs).reduce((total, state) => total + state.errorCount, 0);
  const explicitAny = Object.values(policy.explicitAnyByFile).reduce((total, count) => total + count, 0);
  return {
    schemaVersion: 1,
    checkpoint: activeRoadmapCheckpoint(),
    programs,
    totals: { files: trackedFiles.length, errors, explicitAny },
    explicitAnyByFile: policy.explicitAnyByFile,
    expectedErrorDirectives: policy.expectedErrorDirectives,
    declarationProbe: collectDeclarationProbe(),
  };
}

/** @param {GovernanceState} state @returns {Map<string, number>} */
function diagnosticCountMap(state) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const [programId, program] of Object.entries(state.programs)) {
    for (const [filePath, entries] of Object.entries(program.diagnostics)) {
      for (const entry of entries) counts.set(`${programId}\u0000${filePath}\u0000${entry.code}`, entry.count);
    }
  }
  return counts;
}

/** @param {GovernanceState} previous @param {GovernanceState} current */
function validateShrinkOnly(previous, current) {
  const previousFiles = new Set(Object.values(previous.programs).flatMap((program) => program.files));
  const currentCounts = diagnosticCountMap(current);
  const previousCounts = diagnosticCountMap(previous);
  /** @type {string[]} */
  const errors = [];
  for (const [key, count] of currentCounts) {
    const prior = previousCounts.get(key) || 0;
    if (count > prior) errors.push(`${key.replaceAll("\u0000", ": ")} increased ${prior} -> ${count}`);
  }
  for (const [filePath, count] of Object.entries(current.explicitAnyByFile)) {
    const prior = previous.explicitAnyByFile[filePath] || 0;
    if (count > prior) errors.push(`${filePath}: explicit any increased ${prior} -> ${count}`);
  }
  for (const program of Object.values(current.programs)) {
    for (const filePath of program.files) {
      if (previousFiles.has(filePath)) continue;
      const errorCount = Object.values(program.diagnostics[filePath] || []).reduce((total, entry) => total + entry.count, 0);
      if (errorCount > 0) errors.push(`${filePath}: new file has ${errorCount} strict diagnostic(s)`);
      if ((current.explicitAnyByFile[filePath] || 0) > 0) errors.push(`${filePath}: new file introduces explicit any`);
    }
  }
  if (errors.length > 0) throw new Error(`Full-strict debt may only shrink:\n${errors.join("\n")}`);
}

/** @param {GovernanceState} state */
function printSummary(state) {
  for (const [id, program] of Object.entries(state.programs)) {
    const errorFiles = Object.keys(program.diagnostics).filter((filePath) => filePath !== "$global").length;
    console.log(`${id}: ${program.files.length} owned files, ${program.errorCount} strict diagnostics across ${errorFiles} files (${program.config})`);
  }
  console.log(`Combined universe: ${state.totals.files} files, ${state.totals.errors} diagnostics, ${state.totals.explicitAny} explicit-any nodes.`);
  console.log(`Declaration probe: ${state.declarationProbe.firstPartyFiles} first-party declarations, 0 errors.`);
}

/** @param {GovernanceState} state */
function writeLedger(state) {
  if (fs.existsSync(ledgerPath)) validateShrinkOnly(/** @type {GovernanceState} */ (JSON.parse(fs.readFileSync(ledgerPath, "utf8"))), state);
  fs.writeFileSync(ledgerPath, `${JSON.stringify(state, null, 2)}\n`);
  console.log(`Updated ${toRepoPath(ledgerPath)} with shrink-only full-strict debt.`);
}

/** @param {GovernanceState} state */
function verifyLedger(state) {
  if (!fs.existsSync(ledgerPath)) throw new Error("Missing scripts/typecheck-debt-ledger.json; run npm run typecheck:ledger:write for the reviewed bootstrap.");
  const expected = /** @type {GovernanceState} */ (JSON.parse(fs.readFileSync(ledgerPath, "utf8")));
  const comparable = { ...state, checkpoint: expected.checkpoint };
  if (JSON.stringify(comparable) !== JSON.stringify(expected)) {
    validateShrinkOnly(expected, state);
    throw new Error("Full-strict diagnostics changed. Run npm run typecheck:ledger:write to record a reviewed shrink-only update.");
  }
  console.log("Full-strict diagnostics exactly match the checked debt ledger.");
}

async function main() {
  const state = collectGovernanceState();
  printSummary(state);
  if (process.argv.includes("--write")) writeLedger(state);
  else verifyLedger(state);
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { PROGRAMS, collectGovernanceState, collectSourcePolicy, countExplicitAnyAnnotations, firstPartyJavaScriptFiles, isFirstPartyDirectoryName, validateShrinkOnly };
