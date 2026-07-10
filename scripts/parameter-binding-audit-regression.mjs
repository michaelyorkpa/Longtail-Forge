import { appVersion } from "../src/core/version.js";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildParameterBindingBaseline,
  evaluateParameterBindingBaseline,
  formatParameterBindingAudit,
  scanParameterBindings,
  serializeParameterBindingBaseline,
} from "./lib/parameter-binding-audit.mjs";
import { lineNumber, readRuntimeSourceEntries } from "./test-support/source-scan.mjs";

const root = process.cwd();
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const baseline = JSON.parse(readText("scripts/baselines/parameter-binding-baseline.json"));
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");
const roadmap = readText("ROADMAP.md");
const regressionSuite = readText("scripts/regression-legacy-snapshot.json");
const runtimeSourceEntries = readRuntimeSourceEntries({ root });
const report = scanParameterBindings({ entries: runtimeSourceEntries });
const result = evaluateParameterBindingBaseline({ baseline, report });

assert.equal(packageJson.version, appVersion);
assert.equal(packageLock.version, appVersion);
assert.equal(packageLock.packages[""].version, appVersion);
assert.ok(report.totalScannedSites > 0, "audit should scan runtime database operation sites");
assert.ok(report.safeBoundSites > 0, "audit should report safe bound sites");
assert.ok(result.knownBaselineExceptions.length > 0, "current reviewed dynamic SQL composition should be baseline-managed");
assert.deepEqual(result.newViolations, [], "live runtime source should introduce no unreviewed parameter-binding findings");
assert.deepEqual(result.resolvedLegacyFindings, [], "checked-in baseline should be current at adoption");

assert.equal(packageJson.scripts["audit:params"], "node scripts/audit-parameter-bindings.mjs");
assert.equal(packageJson.scripts["audit:params:update-baseline"], "node scripts/audit-parameter-bindings.mjs --update-baseline");
assert.equal(packageJson.scripts["audit:params:check"], "node scripts/audit-parameter-bindings.mjs --check");

const unsafeReport = scanParameterBindings({ entries: [{
  filePath: "src/repositories/unsafe-example.repo.js",
  source: "async function read(db, userId) { return db.query(`SELECT * FROM users WHERE user_id = '${userId}'`); }",
}] });
const unsafeResult = evaluateParameterBindingBaseline({ baseline: emptyBaseline(), report: unsafeReport });
assert.equal(unsafeResult.newViolations.some((finding) => finding.kind === "dynamic-sql-template"), true);

const legacyHelperReport = scanParameterBindings({ entries: [{
  filePath: "src/repositories/legacy-example.repo.js",
  source: "async function read(db, userId) { return db.query(`SELECT * FROM users WHERE user_id = ${sqlText(userId)}`); }",
}] });
const legacyHelperResult = evaluateParameterBindingBaseline({ baseline: emptyBaseline(), report: legacyHelperReport });
assert.equal(legacyHelperResult.newViolations.some((finding) => finding.kind === "legacy-helper-call"), true);

const reviewedBaseline = buildParameterBindingBaseline(unsafeReport);
const reviewedResult = evaluateParameterBindingBaseline({ baseline: reviewedBaseline, report: unsafeReport });
assert.equal(reviewedResult.knownBaselineExceptions.length, unsafeReport.candidateFindings.length);
assert.deepEqual(reviewedResult.newViolations, [], "known reviewed findings should not fail the check");

const safeReport = scanParameterBindings({ entries: [{
  filePath: "src/repositories/safe-example.repo.js",
  source: "async function read(db, userId) { return db.query(\"SELECT * FROM users WHERE user_id = :userId\", { userId }); }",
}] });
assert.equal(safeReport.totalScannedSites, 1);
assert.equal(safeReport.safeBoundSites, 1);
assert.deepEqual(safeReport.candidateFindings, [], "a new named-bound query should not require a baseline entry");
assert.deepEqual(
  evaluateParameterBindingBaseline({ baseline: emptyBaseline(), report: safeReport }).newViolations,
  [],
  "count-only growth from safe bound queries should not fail",
);

const resolvedResult = evaluateParameterBindingBaseline({ baseline: reviewedBaseline, report: safeReport });
assert.ok(resolvedResult.resolvedLegacyFindings.length > 0, "resolved findings should be reported for optional baseline shrinkage");
assert.deepEqual(resolvedResult.newViolations, [], "resolved findings should not be treated as new violations");

assert.equal(
  serializeParameterBindingBaseline(buildParameterBindingBaseline(report)),
  serializeParameterBindingBaseline(buildParameterBindingBaseline(report)),
  "baseline generation should be deterministic",
);
assert.equal(
  serializeParameterBindingBaseline(baseline),
  serializeParameterBindingBaseline(buildParameterBindingBaseline(report)),
  "checked-in baseline should equal deterministic generation",
);

const checkResult = spawnSync(process.execPath, ["scripts/audit-parameter-bindings.mjs", "--check"], { encoding: "utf8" });
assert.equal(checkResult.status, 0, checkResult.stderr);
for (const label of [
  "Total scanned sites",
  "Safe bound sites",
  "Known baseline exceptions",
  "New violations: 0",
  "Resolved legacy findings",
]) {
  assert.match(checkResult.stdout, new RegExp(label));
}
assert.match(formatParameterBindingAudit(result), /New violations: 0/);

const returningMatches = listSourceMatches(/\bRETURNING\b/g);
assert.deepEqual(
  [...new Set(returningMatches.map((match) => match.file))],
  ["src/db/adapters/sqlite-dialect-seams.js"],
  "raw RETURNING should remain provider-owned",
);
assert.equal(listSourceMatches(/\bjson_(?:extract|set|each|object|array|remove|insert|replace|valid|type|quote|group)\b|->>|->/g).length, 0);
assert.equal(listSourceMatches(/\b(?:UPDATE|DELETE)\b(?:(?!;|\bSELECT\b)[\s\S]){0,240}\b(?:LIMIT|OFFSET)\b/gi).length, 0);
assert.deepEqual(listSourceMatches(/\bNOT\s+IN\s*\(\s*[:@$][A-Za-z_][A-Za-z0-9_]*\s*\)/gi), []);

assert.match(auditDocs, /Baseline-driven workflow/);
assert.match(auditDocs, /Do not update the baseline in unrelated feature work/);
assert.match(auditDocs, /Known baseline exceptions/);
assert.match(auditDocs, /New violations/);
assert.match(databaseDocs, /audit:params:check/);
assert.match(roadmap, /^Active cursor: `0\.33\.7`\./m);
assert.match(regressionSuite, /scripts\/parameter-binding-audit-regression\.mjs/);

console.log("Parameter-binding baseline audit regression passed.");

function emptyBaseline() {
  return {
    schemaVersion: 1,
    scope: "synthetic",
    reviewRule: "synthetic",
    findings: [],
  };
}

function listSourceMatches(pattern) {
  const matches = [];
  for (const entry of runtimeSourceEntries) {
    for (const match of entry.source.matchAll(pattern)) {
      matches.push({
        file: entry.file,
        line: lineNumber(entry.source, match.index),
        match: match[0],
      });
    }
  }
  return matches;
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}
