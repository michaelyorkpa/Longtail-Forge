export const regressionMeta = Object.freeze({
  id: "framework.http-error-development-guardrails",
  area: "framework",
  tier: "release-gate",
  tags: ["browser", "docs", "errors", "modules", "routing", "security"],
  description: "Prevents new routes and browser entries from bypassing the shared AppError, registered-code, recovery-boundary, and safe-diagnostic contracts.",
  runMode: "static",
});

import { escapeRegExp } from "../../test-support/source-scan.mjs";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import { errorCodeForStatus } from "../../../src/core/http-error-contract.js";

const routeFiles = (await Promise.all([
  listFiles("src/routes"),
  listFiles("src/modules"),
]))
  .flat()
  .filter((filePath) => filePath.startsWith("src/routes/")
    || /(?:^|[.-])routes?\.js$/i.test(path.posix.basename(filePath)));

const rawFailureViolations = [];
for (const filePath of routeFiles) {
  const source = await fs.readFile(filePath, "utf8");
  for (const pattern of [
    { label: "raw Error throw", regex: /\bthrow\s+new\s+Error\s*\(/g },
    {
      label: "literal terminal error response",
      regex: /\.status\(\s*(?:4|5)\d\d\s*\)\s*\.\s*(?:json|send|end)\s*\(/g,
    },
    {
      label: "literal terminal writeHead response",
      regex: /\.writeHead\(\s*(?:4|5)\d\d\b/g,
    },
  ]) {
    for (const match of source.matchAll(pattern.regex)) {
      const finding = `${filePath}:${lineNumberAt(source, match.index)} ${match[0]}`;
      if (!isReviewedSessionlessResourceResponse(filePath, match[0])) {
        rawFailureViolations.push(`${pattern.label}: ${finding}`);
      }
    }
  }
}
assert.deepEqual(
  rawFailureViolations,
  [],
  `Route failures must use AppError/registered codes and the final framework handler:\n${rawFailureViolations.join("\n")}`,
);

const expectedCodes = new Map([
  [400, "bad_request"],
  [401, "authentication_required"],
  [403, "forbidden"],
  [404, "not_found"],
  [405, "method_not_allowed"],
  [409, "conflict"],
  [413, "payload_too_large"],
  [415, "unsupported_media_type"],
  [429, "rate_limited"],
  [500, "internal_server_error"],
  [502, "bad_gateway"],
  [503, "service_unavailable"],
]);
for (const [statusCode, code] of expectedCodes) {
  assert.equal(errorCodeForStatus(statusCode), code, `${statusCode} should retain its registered default code`);
}

const errorDocs = await fs.readFile("docs/http-errors.md", "utf8");
for (const [statusCode, code] of expectedCodes) {
  assert.match(errorDocs, new RegExp(`\\| ${statusCode} \\| \\\`${code}\\\` \\|`));
}
for (const requiredContract of [
  "Final Middleware Order",
  "Non-Enumeration",
  "Browser Recovery Boundary",
  "Request-ID Support Workflow",
  "In-Process 503 Versus Proxy Maintenance",
  "exactly one failure diagnostic",
  "lowercase `snake_case`",
]) {
  assert.match(errorDocs, new RegExp(escapeRegExp(requiredContract), "i"), `HTTP error docs should retain ${requiredContract}`);
}

const staticServiceSource = await fs.readFile("src/services/static.service.js", "utf8");
assertOrdered(staticServiceSource, [
  "/js/shared/error-contract.js",
  "/js/shared/browser-recovery.js",
]);

const browserEntries = (await listFiles("views")).filter((filePath) => filePath.endsWith(".html"));
assert.ok(browserEntries.length > 0, "the browser-entry guard should discover repository HTML");
const missingHead = [];
for (const filePath of browserEntries) {
  const source = await fs.readFile(filePath, "utf8");
  if (!/<head(?:\s|>)/i.test(source)) {
    missingHead.push(filePath);
  }
}
assert.deepEqual(
  missingHead,
  [],
  `Browser entries need a <head> injection point for the shared recovery boundary:\n${missingHead.join("\n")}`,
);

console.log("HTTP error development guardrails passed.");

async function listFiles(rootPath) {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.posix.join(rootPath.replaceAll("\\", "/"), entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(entryPath));
    } else {
      files.push(entryPath);
    }
  }
  return files;
}

function isReviewedSessionlessResourceResponse(filePath, sourceMatch) {
  if (filePath !== "src/routes/private-feeds.routes.js") {
    return false;
  }
  return sourceMatch.includes("status(404).send(")
    || sourceMatch.includes("status(429).send(");
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function assertOrdered(source, snippets) {
  let previousIndex = -1;
  for (const snippet of snippets) {
    const index = source.indexOf(snippet);
    assert.ok(index > previousIndex, `${snippet} should remain in recovery-boundary injection order`);
    previousIndex = index;
  }
}
