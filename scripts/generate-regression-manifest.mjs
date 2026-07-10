import fs from "node:fs/promises";
import path from "node:path";
import {
  MANIFEST_GENERATOR,
  POLICY_SOURCE,
  buildRegressionManifest,
  serializeRegressionManifest,
} from "./lib/regression-manifest.mjs";
import { REGRESSION_ENTRIES } from "./regression-suite.mjs";

const MANIFEST_PATH = "scripts/regression-coverage-manifest.json";
const args = process.argv.slice(2);
const checkOnly = args.length === 1 && args[0] === "--check";

if (args.length > (checkOnly ? 1 : 0)) {
  throw new Error(`Usage: ${MANIFEST_GENERATOR} [--check]`);
}

const policy = JSON.parse(await fs.readFile(path.resolve(POLICY_SOURCE), "utf8"));
const manifest = buildRegressionManifest({ entries: REGRESSION_ENTRIES, policy });
const expected = serializeRegressionManifest(manifest);

if (checkOnly) {
  const actual = await fs.readFile(path.resolve(MANIFEST_PATH), "utf8");
  if (actual !== expected) {
    throw new Error(`Regression coverage manifest is stale. Run ${MANIFEST_GENERATOR}.`);
  }
  console.log(`Regression coverage manifest is current (${REGRESSION_ENTRIES.length} scripts).`);
} else {
  await fs.writeFile(path.resolve(MANIFEST_PATH), expected, "utf8");
  console.log(`Generated ${MANIFEST_PATH} from ${REGRESSION_ENTRIES.length} discovered scripts.`);
}
