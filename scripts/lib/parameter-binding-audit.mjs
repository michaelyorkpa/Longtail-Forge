import crypto from "node:crypto";
import {
  extractCallExpression,
  lineNumber,
  readRuntimeSourceEntries,
  splitTopLevelArguments,
} from "../test-support/source-scan.mjs";

const HELPER_DEFINITION_FILE = "src/db/sql-literals.js";
const HELPER_CALL_PATTERN = /\bsql(?:Text|Integer|NullableText|NullableInteger)\s*\(/g;
const OPERATION_PATTERN = /\b(?:db|transaction)\.(?:query|get|run)\s*\(|\b(?:querySql|getSql|runSql)\s*\(/g;

/**
 * One scanned runtime source entry (project file or synthetic fixture).
 * @typedef {object} SourceScanEntry
 * @property {string} [absolutePath]
 * @property {string} [file]
 * @property {string} [filePath]
 * @property {string} [source]
 */

/**
 * One candidate parameter-binding finding before id assignment.
 * @typedef {object} ParameterBindingFinding
 * @property {string} file
 * @property {string} kind
 * @property {number} line
 * @property {string} operation
 * @property {string} signature
 */

/**
 * A finding carrying its stable baseline id.
 * @typedef {ParameterBindingFinding & { id: string }} IdentifiedParameterBindingFinding
 */

/**
 * Aggregate scan report over the runtime sources.
 * @typedef {object} ParameterBindingReport
 * @property {readonly IdentifiedParameterBindingFinding[]} candidateFindings
 * @property {number} safeBoundSites
 * @property {number} totalScannedSites
 */

/**
 * One reviewed baseline entry.
 * @typedef {object} ParameterBindingBaselineFinding
 * @property {string} id
 * @property {string} file
 * @property {string} kind
 * @property {string} operation
 * @property {string} signature
 */

/**
 * A reviewed-finding field name checked during baseline validation.
 * @typedef {keyof ParameterBindingBaselineFinding} ParameterBindingBaselineField
 */

/**
 * The reviewed parameter-binding baseline document.
 * @typedef {object} ParameterBindingBaseline
 * @property {number} schemaVersion
 * @property {string} scope
 * @property {string} reviewRule
 * @property {ParameterBindingBaselineFinding[]} findings
 */

/**
 * Baseline evaluation outcome consumed by the audit gate.
 * @typedef {object} ParameterBindingAuditResult
 * @property {readonly IdentifiedParameterBindingFinding[]} knownBaselineExceptions
 * @property {readonly IdentifiedParameterBindingFinding[]} newViolations
 * @property {readonly ParameterBindingBaselineFinding[]} resolvedLegacyFindings
 * @property {number} safeBoundSites
 * @property {number} totalScannedSites
 */

/**
 * A finding row the formatter can print (line is optional for baseline rows).
 * @typedef {object} ParameterBindingFindingSummary
 * @property {string} id
 * @property {string} file
 * @property {string} kind
 * @property {number} [line]
 */

/**
 * Scan runtime sources for dynamic SQL composition and legacy helper calls.
 * @param {{ entries?: readonly SourceScanEntry[] }} [options] source entries override for fixtures
 * @returns {ParameterBindingReport}
 */
function scanParameterBindings({ entries = readRuntimeSourceEntries() } = {}) {
  /** @type {ParameterBindingFinding[]} */
  const findings = [];
  let safeBoundSites = 0;
  let totalScannedSites = 0;

  for (const entry of [...entries].sort((left, right) => entryPath(left).localeCompare(entryPath(right)))) {
    const file = entryPath(entry);
    const source = String(entry.source || "");

    if (file !== HELPER_DEFINITION_FILE) {
      for (const match of source.matchAll(HELPER_CALL_PATTERN)) {
        const before = source.slice(Math.max(0, match.index - 16), match.index);
        if (/function\s+$/.test(before)) {
          continue;
        }
        findings.push(createFinding({
          file,
          kind: "legacy-helper-call",
          line: lineNumber(source, match.index),
          operation: match[0].replace(/\s*\($/, ""),
          sourceSignature: normalizeSignature(source.slice(match.index, match.index + 160)),
        }));
      }
    }

    for (const match of source.matchAll(OPERATION_PATTERN)) {
      const call = extractCallExpression(source, match.index);
      const args = splitTopLevelArguments(call.slice(call.indexOf("(") + 1, -1));
      const sqlArgument = args[0] || "";
      const operation = match[0].replace(/\s*\($/, "");
      totalScannedSites += 1;

      if (args.length > 1 && args[1] && args[1] !== "undefined") {
        safeBoundSites += 1;
      }

      if (sqlArgument.includes("${")) {
        findings.push(createFinding({
          file,
          kind: "dynamic-sql-template",
          line: lineNumber(source, match.index),
          operation,
          sourceSignature: normalizeSignature(sqlArgument),
        }));
      }
    }
  }

  return Object.freeze({
    candidateFindings: Object.freeze(assignStableFindingIds(findings)),
    safeBoundSites,
    totalScannedSites,
  });
}

/**
 * Build one finding with its content-derived signature.
 * @param {{ file: string, kind: string, line: number, operation: string, sourceSignature: string }} input
 * @returns {ParameterBindingFinding}
 */
function createFinding({ file, kind, line, operation, sourceSignature }) {
  const signature = hash(`${file}\n${kind}\n${operation}\n${sourceSignature}`);
  return { file, kind, line, operation, signature };
}

/**
 * Sort findings deterministically and assign stable occurrence-aware ids.
 * @param {ParameterBindingFinding[]} findings
 * @returns {IdentifiedParameterBindingFinding[]}
 */
function assignStableFindingIds(findings) {
  /** @type {Map<string, number>} */
  const occurrences = new Map();
  return findings
    .sort((left, right) => (
      left.file.localeCompare(right.file) ||
      left.kind.localeCompare(right.kind) ||
      left.signature.localeCompare(right.signature) ||
      left.line - right.line
    ))
    .map((finding) => {
      const baseId = `${finding.kind}.${finding.signature.slice(0, 16)}`;
      const occurrence = (occurrences.get(baseId) || 0) + 1;
      occurrences.set(baseId, occurrence);
      return Object.freeze({
        ...finding,
        id: occurrence === 1 ? baseId : `${baseId}.${occurrence}`,
      });
    });
}

/**
 * Build the serializable reviewed baseline from a scan report.
 * @param {ParameterBindingReport} report
 * @returns {ParameterBindingBaseline}
 */
function buildParameterBindingBaseline(report) {
  return {
    schemaVersion: 1,
    scope: "src/**/*.js and src/**/*.mjs",
    reviewRule: "Entries are reviewed pre-existing dynamic SQL composition or legacy helper findings. Update only during dedicated parameter-binding cleanup or an explicitly reviewed query change.",
    findings: report.candidateFindings.map(({ file, id, kind, operation, signature }) => ({
      id,
      file,
      kind,
      operation,
      signature,
    })),
  };
}

/**
 * Evaluate the current scan report against the reviewed baseline.
 * @param {{ baseline: ParameterBindingBaseline, report: ParameterBindingReport }} input
 * @returns {ParameterBindingAuditResult}
 */
function evaluateParameterBindingBaseline({ baseline, report }) {
  validateBaseline(baseline);
  const baselineById = new Map(baseline.findings.map((finding) => [finding.id, finding]));
  const currentById = new Map(report.candidateFindings.map((finding) => [finding.id, finding]));
  /** @type {IdentifiedParameterBindingFinding[]} */
  const knownBaselineExceptions = [];
  /** @type {IdentifiedParameterBindingFinding[]} */
  const newViolations = [];

  for (const finding of report.candidateFindings) {
    const approved = baselineById.get(finding.id);
    if (
      approved &&
      approved.file === finding.file &&
      approved.kind === finding.kind &&
      approved.operation === finding.operation &&
      approved.signature === finding.signature
    ) {
      knownBaselineExceptions.push(finding);
    } else {
      newViolations.push(finding);
    }
  }

  const resolvedLegacyFindings = baseline.findings.filter((finding) => !currentById.has(finding.id));
  return Object.freeze({
    knownBaselineExceptions: Object.freeze(knownBaselineExceptions),
    newViolations: Object.freeze(newViolations),
    resolvedLegacyFindings: Object.freeze(resolvedLegacyFindings),
    safeBoundSites: report.safeBoundSites,
    totalScannedSites: report.totalScannedSites,
  });
}

/**
 * Validate the reviewed baseline document shape.
 * @param {ParameterBindingBaseline} baseline
 */
function validateBaseline(baseline) {
  if (baseline?.schemaVersion !== 1 || !Array.isArray(baseline.findings)) {
    throw new Error("Parameter-binding baseline must use schemaVersion 1 and define findings.");
  }
  /** @type {Set<string>} */
  const ids = new Set();
  for (const finding of baseline.findings) {
    for (const field of /** @type {ParameterBindingBaselineField[]} */ (["id", "file", "kind", "operation", "signature"])) {
      if (!String(finding?.[field] || "").trim()) {
        throw new Error(`Parameter-binding baseline finding is missing ${field}.`);
      }
    }
    if (ids.has(finding.id)) {
      throw new Error(`Parameter-binding baseline contains duplicate id ${finding.id}.`);
    }
    ids.add(finding.id);
  }
}

/**
 * Serialize the baseline document with its canonical formatting.
 * @param {ParameterBindingBaseline} baseline
 * @returns {string}
 */
function serializeParameterBindingBaseline(baseline) {
  return `${JSON.stringify(baseline, null, 2)}\n`;
}

/**
 * Render the audit result in its exact gate-report format.
 * @param {ParameterBindingAuditResult} result
 * @returns {string}
 */
function formatParameterBindingAudit(result) {
  const lines = [
    "Parameter-binding audit",
    `Total scanned sites: ${result.totalScannedSites}`,
    `Safe bound sites: ${result.safeBoundSites}`,
    `Known baseline exceptions: ${result.knownBaselineExceptions.length}`,
    `New violations: ${result.newViolations.length}`,
    `Resolved legacy findings: ${result.resolvedLegacyFindings.length}`,
  ];

  appendFindingSection(lines, "New violations", result.newViolations);
  appendFindingSection(lines, "Resolved legacy findings", result.resolvedLegacyFindings);
  return lines.join("\n");
}

/**
 * Append one labeled finding section to the report lines.
 * @param {string[]} lines
 * @param {string} label
 * @param {readonly ParameterBindingFindingSummary[]} findings
 */
function appendFindingSection(lines, label, findings) {
  if (findings.length === 0) {
    return;
  }
  lines.push("", `${label}:`);
  for (const finding of findings) {
    lines.push(`- ${finding.id} ${finding.file}${finding.line ? `:${finding.line}` : ""} ${finding.kind}`);
  }
}

/**
 * Normalized project-relative path of one scan entry.
 * @param {SourceScanEntry} entry
 * @returns {string}
 */
function entryPath(entry) {
  return String(entry.filePath || entry.file || "").replaceAll("\\", "/");
}

/**
 * Collapse whitespace in a source excerpt to its signature form.
 * @param {string} value
 * @returns {string}
 */
function normalizeSignature(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

/**
 * Stable sha256 digest of a signature payload.
 * @param {string} value
 * @returns {string}
 */
function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export {
  buildParameterBindingBaseline,
  evaluateParameterBindingBaseline,
  formatParameterBindingAudit,
  scanParameterBindings,
  serializeParameterBindingBaseline,
};
