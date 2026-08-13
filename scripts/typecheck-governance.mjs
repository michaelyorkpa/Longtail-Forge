// @ts-check

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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
    const explicitAny = [...source.matchAll(/(?:[:<,{|&]\s*|\bas\s+)any\b|\bany\s*(?:\[\]|[>,}|&])/g)].length;
    if (explicitAny > 0) explicitAnyByFile[filePath] = explicitAny;
  }
  return { explicitAnyByFile, expectedErrorDirectives: expectedErrorDirectives.sort() };
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
    checkpoint: "0.33.33.16.1",
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
  if (JSON.stringify(state) !== JSON.stringify(expected)) {
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

export { PROGRAMS, collectGovernanceState, collectSourcePolicy, firstPartyJavaScriptFiles, isFirstPartyDirectoryName, validateShrinkOnly };
