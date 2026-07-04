import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.24.4";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

const audit = buildParameterBindingAudit();
const returningMatches = listSourceMatches(/\bRETURNING\b/g);
const sqliteJsonMatches = listSourceMatches(/\bjson_(?:extract|set|each|object|array|remove|insert|replace|valid|type|quote|group)\b|->>|->/g);
const updateDeleteLimitMatches = listSourceMatches(/\b(?:UPDATE|DELETE)\b(?:(?!;|\bSELECT\b)[\s\S]){0,240}\b(?:LIMIT|OFFSET)\b/gi);

assert.equal(packageJson.version, appVersion, "package.json should report the parameter-binding audit version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the parameter-binding audit version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the parameter-binding audit version");

assert.deepEqual(audit.totals, {
  boundOperationSites: 91,
  dbOperationSites: 407,
  helperCalls: 1499,
  interpolatedOperationSites: 233,
}, "parameter-binding audit totals should match the current post-wave runtime inventory");

const expectedTopGroups = [
  ["notes/notes.repo", 212, 14],
  ["lists/lists.repo", 178, 17],
  ["services/files.service", 148, 27],
  ["notifications.repo", 99, 20],
  ["db/index", 99, 19],
  ["tags.repo", 84, 17],
  ["tasks/tasks.repo", 71, 7],
  ["time-tracking/active-timers.repo", 62, 12],
  ["client-projects/clients.repo", 60, 5],
  ["services/work-resume-state.service", 53, 7],
];

for (const [group, helperCalls, interpolatedOperationSites] of expectedTopGroups) {
  const row = audit.groups.find((candidate) => candidate.group === group);
  assert.ok(row, `${group} should be present in the parameter-binding audit`);
  assert.equal(row.helperCalls, helperCalls, `${group} helper-call count should match the audit`);
  assert.equal(row.interpolatedOperationSites, interpolatedOperationSites, `${group} interpolated operation-site count should match the audit`);
  assert.match(
    auditDocs,
    new RegExp(`\\| ${escapeRegExp(group)} \\| ${helperCalls} \\| ${interpolatedOperationSites} \\|`),
    `${group} should be documented in the audit table`,
  );
}

const sessionsRow = audit.groups.find((candidate) => candidate.group === "sessions.repo");
assert.equal(sessionsRow.helperCalls, 0, "sessions repository should remain a converted bound-params pilot");
assert.equal(sessionsRow.boundOperationSites, 8, "sessions repository should keep bound operation sites visible");
assert.match(auditDocs, /\| sessions\.repo \| 0 \| 0 \| 8 \| 8 \|/, "audit should record sessions as already converted");

const tagTextRow = audit.groups.find((candidate) => candidate.group === "core/search/tag-text");
assert.equal(tagTextRow.helperCalls, 0, "search tag-text proof conversion should remove literal helpers from the current audit");
assert.equal(tagTextRow.interpolatedOperationSites, 0, "search tag-text proof conversion should remove interpolated operation sites");
assert.equal(tagTextRow.boundOperationSites, 1, "search tag-text proof conversion should add one bound operation site");

const convertedWaveRows = [
  ["app-settings.repo", 2],
  ["permissions.repo", 8],
  ["settings.repo", 4],
  ["user-workspaces.repo", 6],
  ["users.repo", 17],
  ["workspaces.repo", 10],
];

for (const [group, boundOperationSites] of convertedWaveRows) {
  const row = audit.groups.find((candidate) => candidate.group === group);
  assert.ok(row, `${group} should remain visible as a converted wave row`);
  assert.equal(row.helperCalls, 0, `${group} should have no remaining literal-helper calls`);
  assert.equal(row.interpolatedOperationSites, 0, `${group} should have no remaining interpolated operation sites`);
  assert.equal(row.boundOperationSites, boundOperationSites, `${group} bound operation-site count should match the converted wave audit`);
  assert.match(
    auditDocs,
    new RegExp(`\\| ${escapeRegExp(group)} \\| 0 \\| 0 \\| ${boundOperationSites} \\|`),
    `${group} should be documented as converted in the audit table`,
  );
}

assert.deepEqual(
  returningMatches.map((match) => `${match.file}:${match.line}`),
  [
    "src/core/jobs/job-queue.js:36",
    "src/core/jobs/job-queue.js:148",
    "src/core/jobs/job-runner.js:267",
    "src/services/jobs.service.js:100",
  ],
  "RETURNING inventory should stay explicit until the 0.40 dialect audit",
);
assert.equal(sqliteJsonMatches.length, 0, "runtime SQL should not use SQLite JSON SQL functions in this audit");
assert.equal(updateDeleteLimitMatches.length, 0, "runtime SQL should not use top-level UPDATE/DELETE LIMIT/OFFSET in this audit");

assert.match(auditDocs, /Runtime source scan/, "audit docs should describe the scan scope");
assert.match(auditDocs, /Total runtime literal-helper invocations: 1,680/, "audit docs should record helper-call totals");
assert.match(auditDocs, /Total direct interpolated SQL operation sites: 262/, "audit docs should record operation-site totals");
assert.match(auditDocs, /Existing direct bound-params operation sites: 49/, "audit docs should record existing bound sites");
assert.match(auditDocs, /Remaining runtime literal-helper invocations after the proof conversion: 1,677/, "audit docs should record current helper-call burndown");
assert.match(auditDocs, /Remaining direct interpolated SQL operation sites after the proof conversion: 261/, "audit docs should record current interpolated-site burndown");
assert.match(auditDocs, /Existing direct bound-params operation sites after the proof conversion: 50/, "audit docs should record current bound-site burndown");
assert.match(auditDocs, /Remaining runtime literal-helper invocations after the conversion wave: 1,499/, "audit docs should record current helper-call wave burndown");
assert.match(auditDocs, /Remaining direct interpolated SQL operation sites after the conversion wave: 233/, "audit docs should record current interpolated-site wave burndown");
assert.match(auditDocs, /Existing direct bound-params operation sites after the conversion wave: 91/, "audit docs should record current bound-site wave burndown");
assert.match(auditDocs, /No SQLite JSON SQL functions were found/, "audit docs should record the JSON-function non-issue");
assert.match(auditDocs, /No top-level `UPDATE` or `DELETE` statements with `LIMIT` or `OFFSET` were found/, "audit docs should record the UPDATE/DELETE LIMIT non-issue");
assert.match(auditDocs, /`RETURNING` is present in four durable-job statements/, "audit docs should correct the RETURNING assumption");
assert.match(auditDocs, /0\.33\.5\.23\.2[\s\S]*named-to-positional binding layer/, "audit docs should hand off binding-layer work");
assert.match(auditDocs, /0\.33\.5\.23\.3 Conversion Wave[\s\S]*auth\/workspace\/permission core/, "audit docs should record the first conversion wave");
assert.match(auditDocs, /0\.33\.5\.23\.4 Closeout[\s\S]*final 0\.33\.5\.23 branch burndown remains 1,499/, "audit docs should record the closeout burndown");
assert.match(databaseDocs, /As of version 0\.33\.5\.23\.4[\s\S]*SQL parameter-binding branch is closed/, "database docs should record the closeout boundary");
assert.match(changelog, /## Version 0\.33\.5\.23\.4 - [\s\S]*final branch burndown: 1,499 helper invocations, 233 direct interpolated operation sites, 91 bound operation sites, and 407 runtime DB operation calls/, "changelog should record the parameter-binding closeout");

assert.match(roadmap, /^## Version 0\.33\.5\.25 - Storage branch cleanup/m, "live roadmap should continue past the closed parameter-binding and Node 24 branches");
assert.doesNotMatch(roadmap, /^## Version 0\.33\.5\.23 - SQL Parameter-Binding Migration/m, "live roadmap should not keep the completed parameter-binding branch open");
assert.match(regressionSuite, /scripts\/parameter-binding-audit-regression\.mjs/, "regression suite should include the parameter-binding audit regression");
assert.match(regressionSuite, /scripts\/parameter-binding-layer-regression\.mjs/, "regression suite should include the parameter-binding layer regression");
assert.match(regressionSuite, /scripts\/parameter-binding-conversion-wave-regression\.mjs/, "regression suite should include the parameter-binding conversion-wave regression");

console.log("Parameter-binding audit regression passed.");

function buildParameterBindingAudit() {
  const groups = new Map();
  const totals = {
    boundOperationSites: 0,
    dbOperationSites: 0,
    helperCalls: 0,
    interpolatedOperationSites: 0,
  };

  for (const filePath of listRuntimeSourceFiles()) {
    const relativePath = normalizePath(filePath);

    if (relativePath === "src/db/sql-literals.js") {
      continue;
    }

    const source = readText(relativePath);
    const row = scanSourceFile(relativePath, source);

    totals.boundOperationSites += row.boundOperationSites;
    totals.dbOperationSites += row.dbOperationSites;
    totals.helperCalls += row.helperCalls;
    totals.interpolatedOperationSites += row.interpolatedOperationSites;

    if (
      row.boundOperationSites === 0 &&
      row.helperCalls === 0 &&
      row.interpolatedOperationSites === 0
    ) {
      continue;
    }

    const group = sourceGroup(relativePath);
    const aggregate = groups.get(group) || {
      boundOperationSites: 0,
      dbOperationSites: 0,
      files: [],
      group,
      helperCalls: 0,
      interpolatedOperationSites: 0,
    };
    aggregate.files.push(relativePath);
    aggregate.boundOperationSites += row.boundOperationSites;
    aggregate.dbOperationSites += row.dbOperationSites;
    aggregate.helperCalls += row.helperCalls;
    aggregate.interpolatedOperationSites += row.interpolatedOperationSites;
    groups.set(group, aggregate);
  }

  return {
    groups: [...groups.values()].sort((left, right) => (
      right.helperCalls - left.helperCalls ||
      right.interpolatedOperationSites - left.interpolatedOperationSites ||
      left.group.localeCompare(right.group)
    )),
    totals,
  };
}

function scanSourceFile(filePath, source) {
  const helperPattern = /\bsql(?:Text|Integer|NullableText|NullableInteger)\s*\(/g;
  const operationPattern = /\b(?:db|transaction)\.(?:query|get|run)\s*\(|\b(?:querySql|getSql|runSql)\s*\(/g;
  let helperCalls = 0;
  let boundOperationSites = 0;
  let dbOperationSites = 0;
  let interpolatedOperationSites = 0;

  for (const match of source.matchAll(helperPattern)) {
    const before = source.slice(Math.max(0, match.index - 16), match.index);
    if (!/function\s+$/.test(before)) {
      helperCalls += 1;
    }
  }

  for (const match of source.matchAll(operationPattern)) {
    const call = extractCallExpression(source, match.index);
    const args = splitTopLevelArguments(call.slice(call.indexOf("(") + 1, -1));
    dbOperationSites += 1;

    if (helperPattern.test(call)) {
      interpolatedOperationSites += 1;
    }
    helperPattern.lastIndex = 0;

    if (args.length > 1 && args[1] && args[1] !== "undefined") {
      boundOperationSites += 1;
    }
  }

  return {
    boundOperationSites,
    dbOperationSites,
    filePath,
    helperCalls,
    interpolatedOperationSites,
  };
}

function extractCallExpression(source, startIndex) {
  const openIndex = source.indexOf("(", startIndex);
  let depth = 0;
  let escapeNext = false;
  let quote = "";
  let templateDepth = 0;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        escapeNext = true;
        continue;
      }

      if (quote === "`" && char === "$" && source[index + 1] === "{") {
        templateDepth += 1;
        index += 1;
        continue;
      }

      if (quote === "`" && char === "}" && templateDepth > 0) {
        templateDepth -= 1;
        continue;
      }

      if (char === quote && (quote !== "`" || templateDepth === 0)) {
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  return source.slice(startIndex);
}

function splitTopLevelArguments(source) {
  const args = [];
  let depth = 0;
  let escapeNext = false;
  let quote = "";
  let start = 0;
  let templateDepth = 0;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        escapeNext = true;
        continue;
      }

      if (quote === "`" && char === "$" && source[index + 1] === "{") {
        templateDepth += 1;
        index += 1;
        continue;
      }

      if (quote === "`" && char === "}" && templateDepth > 0) {
        templateDepth -= 1;
        continue;
      }

      if (char === quote && (quote !== "`" || templateDepth === 0)) {
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "(" || char === "{" || char === "[") {
      depth += 1;
    } else if (char === ")" || char === "}" || char === "]") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      args.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }

  const lastArg = source.slice(start).trim();
  if (lastArg) {
    args.push(lastArg);
  }
  return args;
}

function listSourceMatches(pattern) {
  const matches = [];

  for (const filePath of listRuntimeSourceFiles()) {
    const relativePath = normalizePath(filePath);
    const source = readText(relativePath);

    for (const match of source.matchAll(pattern)) {
      matches.push({
        file: relativePath,
        line: lineNumber(source, match.index),
        match: match[0],
      });
    }
  }

  return matches;
}

function listRuntimeSourceFiles() {
  const files = [];
  walk(path.join(root, "src"), files);
  return files;
}

function walk(currentPath, results) {
  const stat = statSync(currentPath);

  if (stat.isDirectory()) {
    for (const entry of readdirSync(currentPath)) {
      walk(path.join(currentPath, entry), results);
    }
    return;
  }

  if (/\.(?:js|mjs)$/.test(currentPath)) {
    results.push(currentPath);
  }
}

function sourceGroup(filePath) {
  if (filePath.startsWith("src/repositories/")) {
    return path.basename(filePath, ".js");
  }

  const moduleMatch = filePath.match(/^src\/modules\/([^/]+)\/([^/]+)$/);
  if (moduleMatch) {
    return `${moduleMatch[1]}/${path.basename(moduleMatch[2], ".js")}`;
  }

  if (filePath.startsWith("src/services/")) {
    return `services/${path.basename(filePath, ".js")}`;
  }

  if (filePath.startsWith("src/core/")) {
    return `core/${filePath.split("/").slice(2).join("/").replace(/\.js$/, "")}`;
  }

  if (filePath.startsWith("src/db/")) {
    return `db/${path.basename(filePath, ".js")}`;
  }

  return filePath.replace(/^src\//, "").replace(/\.js$/, "");
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function normalizePath(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function lineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
