import {
  CANONICAL_REGRESSION_AREAS,
  CANONICAL_REGRESSION_TIERS,
} from "./regression-metadata.mjs";

function parseRegressionCliArgs(args = []) {
  const options = {
    area: null,
    dryRun: false,
    list: false,
    tag: null,
    tier: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--list") {
      options.list = true;
      continue;
    }
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    const field = new Map([
      ["--area", "area"],
      ["--tag", "tag"],
      ["--tier", "tier"],
    ]).get(argument);

    if (!field) {
      throw new Error(`Unknown regression runner option: ${argument}.`);
    }

    const value = String(args[index + 1] || "").trim();
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value.`);
    }
    if (options[field]) {
      throw new Error(`${argument} may be provided only once.`);
    }
    options[field] = value;
    index += 1;
  }

  if (options.area && !CANONICAL_REGRESSION_AREAS.includes(options.area)) {
    throw new Error(`--area must be one of: ${CANONICAL_REGRESSION_AREAS.join(", ")}.`);
  }
  if (options.tier && !CANONICAL_REGRESSION_TIERS.includes(options.tier)) {
    throw new Error(`--tier must be one of: ${CANONICAL_REGRESSION_TIERS.join(", ")}.`);
  }
  if (options.tag && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.tag)) {
    throw new Error("--tag must be lowercase kebab-case.");
  }

  return Object.freeze(options);
}

function filterRegressionBuckets(buckets, { area, tag, tier } = {}) {
  return Object.freeze(buckets.map((bucket) => {
    const entries = bucket.entries.filter((entry) => (
      (!area || entry.area === area) &&
      (!tag || entry.tags.includes(tag)) &&
      (!tier || entry.tier === tier)
    ));
    return Object.freeze({
      ...bucket,
      entries: Object.freeze(entries),
      scripts: Object.freeze(entries.map((entry) => entry.path)),
    });
  }).filter((bucket) => bucket.entries.length > 0));
}

export { filterRegressionBuckets, parseRegressionCliArgs };
