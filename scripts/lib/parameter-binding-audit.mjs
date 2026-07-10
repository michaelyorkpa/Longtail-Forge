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

function scanParameterBindings({ entries = readRuntimeSourceEntries() } = {}) {
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

function createFinding({ file, kind, line, operation, sourceSignature }) {
  const signature = hash(`${file}\n${kind}\n${operation}\n${sourceSignature}`);
  return { file, kind, line, operation, signature };
}

function assignStableFindingIds(findings) {
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

function evaluateParameterBindingBaseline({ baseline, report }) {
  validateBaseline(baseline);
  const baselineById = new Map(baseline.findings.map((finding) => [finding.id, finding]));
  const currentById = new Map(report.candidateFindings.map((finding) => [finding.id, finding]));
  const knownBaselineExceptions = [];
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

function validateBaseline(baseline) {
  if (baseline?.schemaVersion !== 1 || !Array.isArray(baseline.findings)) {
    throw new Error("Parameter-binding baseline must use schemaVersion 1 and define findings.");
  }
  const ids = new Set();
  for (const finding of baseline.findings) {
    for (const field of ["id", "file", "kind", "operation", "signature"]) {
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

function serializeParameterBindingBaseline(baseline) {
  return `${JSON.stringify(baseline, null, 2)}\n`;
}

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

function appendFindingSection(lines, label, findings) {
  if (findings.length === 0) {
    return;
  }
  lines.push("", `${label}:`);
  for (const finding of findings) {
    lines.push(`- ${finding.id} ${finding.file}${finding.line ? `:${finding.line}` : ""} ${finding.kind}`);
  }
}

function entryPath(entry) {
  return String(entry.filePath || entry.file || "").replaceAll("\\", "/");
}

function normalizeSignature(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

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
