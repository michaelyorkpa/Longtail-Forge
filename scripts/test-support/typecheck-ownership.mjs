// Strict program ownership for regressions, without a debt ledger (`0.33.33.48.2`).
//
// Every first-party JavaScript file is owned by exactly one strict program, and every owned file
// is compiled by that program on every `npm run typecheck`, which enforces zero diagnostics and
// zero explicit `any`. A regression that once pinned a file's debt in the generated ledger pins
// its owning program instead. That fails if the file ever leaves its program, which the ledger
// read it replaces could not, and the gate holds the owned file at zero.

import { PROGRAMS, firstPartyJavaScriptFiles, owningProgramId } from "../typecheck-governance.mjs";

/** @type {readonly string[] | null} */
let universe = null;

/**
 * The strict program that owns one repository-relative file, or null when it is not a
 * first-party JavaScript file or no single program owns it.
 * @param {string} filePath
 * @returns {string | null}
 */
function owningProgram(filePath) {
  universe ??= firstPartyJavaScriptFiles();
  return owningProgramId(filePath, universe);
}

/**
 * The TypeScript config one strict program compiles with, or null for an unknown program.
 * @param {string} programId
 * @returns {string | null}
 */
function programConfig(programId) {
  return PROGRAMS.find((definition) => definition.id === programId)?.config ?? null;
}

export { owningProgram, programConfig };
