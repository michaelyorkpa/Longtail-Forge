import path from "node:path";

const CANONICAL_REGRESSION_AREAS = Object.freeze([
  "framework",
  "views",
  "dashboard",
  "workbench",
  "tasks",
  "notes",
  "lists",
  "files",
  "search",
  "notifications",
  "tags",
  "time-tracking",
  "database",
  "permissions",
  "jobs",
  "public-api",
  "release",
  "docs",
  "licensing",
]);

const CANONICAL_REGRESSION_TIERS = Object.freeze([
  "unit-like",
  "focused",
  "integration",
  "release-gate",
  "slow",
]);

const CANONICAL_REGRESSION_RUN_MODES = Object.freeze([
  "static",
  "serial-database",
  "serial-files",
  "isolated-database",
]);

const REQUIRED_METADATA_FIELDS = Object.freeze([
  "id",
  "area",
  "tier",
  "tags",
  "description",
  "runMode",
]);

const AREA_SET = new Set(CANONICAL_REGRESSION_AREAS);
const TIER_SET = new Set(CANONICAL_REGRESSION_TIERS);
const RUN_MODE_SET = new Set(CANONICAL_REGRESSION_RUN_MODES);

function extractRegressionMeta(source, scriptPath) {
  const declaration = /export\s+const\s+regressionMeta\s*=\s*(?:Object\.freeze\(\s*)?/m.exec(source);

  if (!declaration) {
    return null;
  }

  const objectStart = source.indexOf("{", declaration.index + declaration[0].length);

  if (objectStart < 0) {
    throw new Error(`${scriptPath} regressionMeta must be an object literal.`);
  }

  const objectEnd = findObjectLiteralEnd(source, objectStart, scriptPath);
  const literal = source.slice(objectStart, objectEnd + 1);
  let parsed;

  try {
    parsed = JSON.parse(toStrictJson(literal));
  } catch (error) {
    throw new Error(`${scriptPath} regressionMeta must use a JSON-compatible object literal: ${error.message}`);
  }

  return validateRegressionMeta(parsed, { scriptPath });
}

function validateRegressionMeta(metadata, { scriptPath = "regression" } = {}) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error(`${scriptPath} regressionMeta must be an object.`);
  }

  const keys = Object.keys(metadata).sort();
  const expectedKeys = [...REQUIRED_METADATA_FIELDS].sort();
  const unknown = keys.filter((key) => !expectedKeys.includes(key));
  const missing = expectedKeys.filter((key) => !keys.includes(key));

  if (missing.length > 0) {
    throw new Error(`${scriptPath} regressionMeta is missing required field(s): ${missing.join(", ")}.`);
  }

  if (unknown.length > 0) {
    throw new Error(`${scriptPath} regressionMeta has unknown field(s): ${unknown.join(", ")}.`);
  }

  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(metadata.id || "")) {
    throw new Error(`${scriptPath} regressionMeta.id must be a stable lowercase dot-delimited identifier.`);
  }

  if (!AREA_SET.has(metadata.area)) {
    throw new Error(`${scriptPath} regressionMeta.area must be one of: ${CANONICAL_REGRESSION_AREAS.join(", ")}.`);
  }

  if (!TIER_SET.has(metadata.tier)) {
    throw new Error(`${scriptPath} regressionMeta.tier must be one of: ${CANONICAL_REGRESSION_TIERS.join(", ")}.`);
  }

  if (!RUN_MODE_SET.has(metadata.runMode)) {
    throw new Error(`${scriptPath} regressionMeta.runMode must be one of: ${CANONICAL_REGRESSION_RUN_MODES.join(", ")}.`);
  }

  if (!Array.isArray(metadata.tags)) {
    throw new Error(`${scriptPath} regressionMeta.tags must be an array.`);
  }

  const normalizedTags = metadata.tags.map((tag) => String(tag || "").trim());
  const invalidTags = normalizedTags.filter((tag) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag));

  if (invalidTags.length > 0) {
    throw new Error(`${scriptPath} regressionMeta.tags must contain lowercase kebab-case values.`);
  }

  if (new Set(normalizedTags).size !== normalizedTags.length) {
    throw new Error(`${scriptPath} regressionMeta.tags must not contain duplicates.`);
  }

  if (normalizedTags.join("\n") !== [...normalizedTags].sort().join("\n")) {
    throw new Error(`${scriptPath} regressionMeta.tags must be sorted.`);
  }

  if (typeof metadata.description !== "string" || !metadata.description.trim()) {
    throw new Error(`${scriptPath} regressionMeta.description must be a non-empty sentence.`);
  }

  return Object.freeze({
    area: metadata.area,
    description: metadata.description.trim(),
    id: metadata.id,
    runMode: metadata.runMode,
    tags: Object.freeze(normalizedTags),
    tier: metadata.tier,
  });
}

function inferLegacyRegressionMeta(scriptPath, runMode) {
  const slug = path.posix.basename(scriptPath, ".mjs")
    .replace(/(?:-regression|-check|-guardrails)$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const area = inferLegacyArea(slug);
  const tags = inferLegacyTags(slug, runMode);

  return validateRegressionMeta({
    area,
    description: `Protects the legacy ${slug.replace(/-/g, " ")} contract.`,
    id: `legacy.${slug.replace(/-/g, ".")}`,
    runMode,
    tags,
    tier: inferLegacyTier(slug, runMode),
  }, { scriptPath });
}

function inferLegacyArea(slug) {
  const rules = [
    ["public-api", /public-api|api-key|api-scope/],
    ["dashboard", /^dashboard/],
    ["workbench", /^workbench|^work-|^work-resume/],
    ["notes", /^notes|^linked-context/],
    ["lists", /^lists/],
    ["files", /^files?[-.]|workspace-storage|storage-accounting|scanner|clamd|clamscan|multipart/],
    ["tasks", /^tasks?[-.]|project-default-assignee/],
    ["search", /^search/],
    ["notifications", /^notifications?[-.]/],
    ["tags", /^tags?[-.]/],
    ["time-tracking", /^time-|^timer-|active-timers/],
    ["jobs", /^job-|worker|background-work|separate-worker/],
    ["permissions", /^permission|workspace-scope|accessibility/],
    ["database", /^database|^sqlite|migration|better-sqlite|parameter-binding|interpolation|dialect|fresh-database|baseline-adoption|startup-maintenance/],
    ["release", /^regression-|(?:^|-)version(?:-|$)|^bump-version|check-js|legacy-cleanup|static-contract-closeout/],
    ["views", /^view-|descriptor|renderer|declarative|surface-|modal-|overlay-|drawer-|ui-contract|icon-/],
    ["docs", /^help-|developer-docs/],
  ];

  return rules.find(([, pattern]) => pattern.test(slug))?.[0] || "framework";
}

function inferLegacyTags(slug, runMode) {
  const tags = [];
  const add = (tag, condition) => {
    if (condition) {
      tags.push(tag);
    }
  };

  add("baseline-bypass", slug === "fresh-database");
  add("closeout", slug.includes("closeout"));
  add("contract", /contract|guardrail|sanity/.test(slug));
  add("database", runMode !== "static");
  add("docs", /docs|help|markdown/.test(slug));
  add("files", /file|storage|scanner|clam/.test(slug));
  add("jobs", /job|worker|reminder|recurrence/.test(slug));
  add("permissions", /permission|access|scope|secure|visibility/.test(slug));
  add("release", /(?:^|-)version(?:-|$)|regression|check-js|clean-clone|legacy-cleanup/.test(slug));
  add("slow", /check-js|performance|separate-worker|scanner|clamd|clamscan/.test(slug));

  return [...new Set(tags)].sort();
}

function inferLegacyTier(slug, runMode) {
  if (/check-js|performance|separate-worker|scanner|clamd|clamscan/.test(slug)) {
    return "slow";
  }

  if (/(?:^|-)version(?:-|$)|regression-(?:runner|coverage|clean-clone|suite-inventory)|permission|legacy-cleanup/.test(slug)) {
    return "release-gate";
  }

  if (runMode !== "static" || /public-api|api-key/.test(slug)) {
    return "integration";
  }

  return "focused";
}

function findObjectLiteralEnd(source, start, scriptPath) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  throw new Error(`${scriptPath} regressionMeta object literal is not closed.`);
}

function toStrictJson(literal) {
  return literal
    .replace(/([{,]\s*)([a-zA-Z][a-zA-Z0-9]*)\s*:/g, '$1"$2":')
    .replace(/,\s*([}\]])/g, "$1");
}

export {
  CANONICAL_REGRESSION_AREAS,
  CANONICAL_REGRESSION_RUN_MODES,
  CANONICAL_REGRESSION_TIERS,
  extractRegressionMeta,
  inferLegacyRegressionMeta,
  validateRegressionMeta,
};
