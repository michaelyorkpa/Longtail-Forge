import fs from "node:fs/promises";
import path from "node:path";
import {
  MANIFEST_GENERATOR,
  POLICY_SOURCE,
  buildRegressionManifest,
  buildRatchetedCoveragePolicy,
  collectCoverageFloorDriftErrors,
  serializeRegressionManifest,
} from "./lib/regression-manifest.mjs";
import { REGRESSION_ENTRIES } from "./regression-suite.mjs";

const MANIFEST_PATH = "scripts/regression-coverage-manifest.json";
const args = process.argv.slice(2);
const checkOnly = args.length === 1 && args[0] === "--check";
const ratchetFloors = args.length === 1 && args[0] === "--ratchet-floors";

if (args.length > 1 || (args.length === 1 && !checkOnly && !ratchetFloors)) {
  throw new Error(`Usage: ${MANIFEST_GENERATOR} [--check|--ratchet-floors]`);
}

const currentPolicy = JSON.parse(await fs.readFile(path.resolve(POLICY_SOURCE), "utf8"));
const policy = ratchetFloors
  ? buildRatchetedCoveragePolicy({ entries: REGRESSION_ENTRIES, policy: currentPolicy })
  : currentPolicy;
const floorErrors = collectCoverageFloorDriftErrors({ entries: REGRESSION_ENTRIES, policy });
if (floorErrors.length > 0) {
  throw new Error(`Regression coverage floors are stale:\n- ${floorErrors.join("\n- ")}`);
}
const manifest = buildRegressionManifest({ entries: REGRESSION_ENTRIES, policy });
const expected = serializeRegressionManifest(manifest);

if (checkOnly) {
  const actual = await fs.readFile(path.resolve(MANIFEST_PATH), "utf8");
  if (actual !== expected) {
    throw new Error(`Regression coverage manifest is stale. Run ${MANIFEST_GENERATOR}.`);
  }
  console.log(`Regression coverage manifest is current (${REGRESSION_ENTRIES.length} scripts).`);
} else {
  if (ratchetFloors) {
    await fs.writeFile(path.resolve(POLICY_SOURCE), `${JSON.stringify(policy, null, 2)}\n`, "utf8");
    console.log(`Ratchet floors advanced in ${POLICY_SOURCE}; no floor was lowered.`);
  }
  await fs.writeFile(path.resolve(MANIFEST_PATH), expected, "utf8");
  console.log(`Generated ${MANIFEST_PATH} from ${REGRESSION_ENTRIES.length} discovered scripts.`);
}
