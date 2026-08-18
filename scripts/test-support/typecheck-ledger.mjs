// Shared strict-ledger ownership probe for regressions.
//
// Checkpoint 0.33.33.26.2 retired the decorative `// @ts-check` pragmas from
// the server/test program: `checkJs` has been program-wide since 0.33.33.12,
// so pragma markers proved nothing. Regressions that previously pinned a
// pragma assert this live contract instead: the owner file must belong to a
// checked program in the generated debt ledger and must carry zero strict
// diagnostics there.

import { readFileSync } from "node:fs";

/** @typedef {{ files: string[], diagnostics: Record<string, unknown> }} LedgerProgram */

/** @type {Record<string, LedgerProgram> | null} */
let cachedPrograms = null;

/** @returns {Record<string, LedgerProgram>} */
function ledgerPrograms() {
  if (!cachedPrograms) {
    cachedPrograms = JSON.parse(readFileSync("scripts/typecheck-debt-ledger.json", "utf8")).programs;
  }
  if (!cachedPrograms) {
    throw new Error("scripts/typecheck-debt-ledger.json must declare its checked programs");
  }
  return cachedPrograms;
}

/**
 * Report whether one repo-relative file is owned by a checked program and how
 * many strict diagnostic entries it still carries; regressions assert
 * `{ owned: true, diagnostics: 0 }` as the live replacement for the retired
 * `// @ts-check` pragma marker.
 * @param {string} filePath
 * @returns {{ owned: boolean, diagnostics: number }}
 */
function strictCleanOwnerState(filePath) {
  const owner = Object.values(ledgerPrograms()).find((program) => program.files.includes(filePath));
  if (!owner) {
    return { owned: false, diagnostics: 0 };
  }
  const entries = owner.diagnostics[filePath];
  return { owned: true, diagnostics: Array.isArray(entries) ? entries.length : 0 };
}

export { strictCleanOwnerState };
