// Shared strict-ledger ownership probe for regressions.
//
// Checkpoint 0.33.33.26.2 retired the decorative `// @ts-check` pragmas from
// the server/test program: `checkJs` has been program-wide since 0.33.33.12,
// so pragma markers proved nothing. Regressions that previously pinned a
// pragma assert this live contract instead: the owner file must belong to a
// checked program in the generated debt ledger and must carry zero strict
// diagnostics there.

import { readFileSync } from "node:fs";
import { requireJsonRecord } from "./json-record-assertions.mjs";

/** @typedef {{ files: string[], diagnostics: Record<string, unknown> }} LedgerProgram */
/** @typedef {{ programs: Record<string, LedgerProgram> }} GeneratedLedger */

/** @type {Record<string, LedgerProgram> | null} */
let cachedPrograms = null;

/** @returns {Record<string, LedgerProgram>} */
function ledgerPrograms() {
  if (!cachedPrograms) {
    // The generated ledger is parsed JSON, so it crosses the boundary through
    // the shared record narrowing before its one read.
    /** @type {GeneratedLedger} */
    const ledger = requireJsonRecord(JSON.parse(readFileSync("scripts/typecheck-debt-ledger.json", "utf8")), "scripts/typecheck-debt-ledger.json");
    cachedPrograms = ledger.programs;
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

/**
 * Name the checked program that owns one repo-relative file, or null when no
 * program does. Regressions that care which program owns a file - server
 * source against script tooling, say - assert this rather than reaching past
 * the probe into the generated ledger.
 * @param {string} filePath
 * @returns {string | null}
 */
function strictCleanOwnerProgram(filePath) {
  const match = Object.entries(ledgerPrograms()).find(([, program]) => program.files.includes(filePath));
  return match ? match[0] : null;
}

export { strictCleanOwnerProgram, strictCleanOwnerState };
