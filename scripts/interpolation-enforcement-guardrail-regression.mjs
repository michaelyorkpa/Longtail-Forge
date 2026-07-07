import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  extractCallExpression,
  lineNumber,
  readRuntimeSourceEntries,
} from "./test-support/source-scan.mjs";

const root = process.cwd();
const appVersion = "0.33.6.6f";
const helperDefinitionFile = "src/db/sql-literals.js";
const helperCallPattern = /\bsql(?:Text|Integer|NullableText|NullableInteger)\s*\(/g;
const helperCallTestPattern = /\bsql(?:Text|Integer|NullableText|NullableInteger)\s*\(/;
const operationPattern = /\b(?:db|transaction)\.(?:query|get|run)\s*\(|\b(?:querySql|getSql|runSql)\s*\(/g;

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the interpolation enforcement version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the interpolation enforcement version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the interpolation enforcement version");

const currentViolations = findInterpolationViolations(readRuntimeSourceEntries({ root }));
assert.equal(
  currentViolations.length,
  0,
  `runtime source should have zero legacy interpolation violations:\n${formatViolations(currentViolations)}`,
);

assertSyntheticRejectionProofs();
assertStaticDocumentation();

console.log("Interpolation enforcement guardrail regression passed.");

function findInterpolationViolations(entries) {
  const violations = [];

  for (const entry of entries) {
    if (entry.filePath === helperDefinitionFile) {
      continue;
    }

    for (const match of entry.source.matchAll(helperCallPattern)) {
      const before = entry.source.slice(Math.max(0, match.index - 16), match.index);
      if (/function\s+$/.test(before)) {
        continue;
      }

      violations.push({
        filePath: entry.filePath,
        helper: match[0].replace(/\s*\($/, ""),
        kind: "helper-call",
        line: lineNumber(entry.source, match.index),
      });
    }

    for (const match of entry.source.matchAll(operationPattern)) {
      const call = extractCallExpression(entry.source, match.index);
      if (!helperCallTestPattern.test(call)) {
        continue;
      }

      violations.push({
        filePath: entry.filePath,
        helper: call.match(helperCallTestPattern)?.[0]?.replace(/\s*\($/, "") || "literal helper",
        kind: "interpolated-operation",
        line: lineNumber(entry.source, match.index),
      });
    }
  }

  return violations;
}

function assertSyntheticRejectionProofs() {
  const repositoryViolations = findInterpolationViolations([
    {
      filePath: "src/repositories/example.repo.js",
      source: "async function read(db, userId) { return db.query(`SELECT * FROM users WHERE user_id = ${sqlText(userId)};`); }",
    },
  ]);
  assert.equal(repositoryViolations.some((violation) => violation.kind === "helper-call"), true, "guardrail should reject a helper call reintroduced in an application repository");
  assert.equal(repositoryViolations.some((violation) => violation.kind === "interpolated-operation"), true, "guardrail should reject a helper-interpolated database operation in an application repository");

  const serviceViolations = findInterpolationViolations([
    {
      filePath: "src/services/example.service.js",
      source: "async function save(limit) { return runSql(`UPDATE widgets SET limit_value = ${sqlInteger(limit)};`); }",
    },
  ]);
  assert.equal(serviceViolations.some((violation) => violation.kind === "interpolated-operation"), true, "guardrail should reject helper interpolation through querySql/getSql/runSql");

  const standaloneViolations = findInterpolationViolations([
    {
      filePath: "src/modules/example/example.repo.js",
      source: "function unsafeLimit(limit) { return sqlInteger(limit); }",
    },
  ]);
  assert.equal(standaloneViolations.some((violation) => violation.kind === "helper-call"), true, "guardrail should reject standalone legacy helper calls in runtime modules");

  assert.deepEqual(
    findInterpolationViolations([
      {
        filePath: "src/db/provider.js",
        source: 'import { sqlText } from "./sql-literals.js";\nexport { sqlText };',
      },
      {
        filePath: helperDefinitionFile,
        source: "function sqlText(value) { return String(value); }\nexport { sqlText };",
      },
    ]),
    [],
    "compatibility exports and helper definitions should not count as runtime interpolation use",
  );
}

function assertStaticDocumentation() {
  assert.match(auditDocs, /Current totals as of 0\.33\.6\.6f:[\s\S]*Remaining runtime literal-helper invocations: 0[\s\S]*Remaining direct interpolated SQL operation sites: 0[\s\S]*Existing direct bound-params operation sites: 388[\s\S]*Total runtime database operation calls seen by the audit scanner: 432/, "audit docs should record the current zero-interpolation ratchet");
  assert.match(auditDocs, /0\.33\.5\.27\.31 Interpolation Enforcement Guardrail[\s\S]*merge-blocking guardrail[\s\S]*`sqlText\(\)`, `sqlInteger\(\)`, `sqlNullableText\(\)`, or `sqlNullableInteger\(\)`[\s\S]*0 runtime literal-helper invocations[\s\S]*0 direct interpolated operation sites/, "audit docs should record the interpolation enforcement slice");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.31[\s\S]*interpolation enforcement guardrail[\s\S]*New runtime source must not call `sqlText\(\)`, `sqlInteger\(\)`, `sqlNullableText\(\)`, or `sqlNullableInteger\(\)`[\s\S]*0 remaining helper invocations[\s\S]*0 direct interpolated SQL operation sites/, "database docs should publish the interpolation enforcement guardrail");
  assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.27\.31 - Interpolation enforcement guardrail[\s\S]*- \[x\] Add a lint\/regression guardrail[\s\S]*- \[x\] Drive the audit ratchet target to zero[\s\S]*- \[x\] Add regressions proving the guardrail rejects/, "live roadmap should archive completed 0.33.5.27 slice bodies");
  assert.match(changelog, /## Version 0\.33\.5\.27\.31 - [\s\S]*Interpolation enforcement guardrail[\s\S]*0 helper invocations[\s\S]*0 direct interpolated operation sites[\s\S]*385 bound operation sites/, "changelog should record the interpolation enforcement guardrail");
  assert.match(regressionSuite, /scripts\/interpolation-enforcement-guardrail-regression\.mjs/, "regression suite should include the interpolation enforcement guardrail");
}

function formatViolations(violations) {
  if (violations.length === 0) {
    return "none";
  }

  return violations
    .map((violation) => `${violation.filePath}:${violation.line} ${violation.kind} ${violation.helper}`)
    .join("\n");
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}
