import fs from "node:fs/promises";
import path from "node:path";
import {
  INVENTORY_GENERATOR,
  buildRegressionDocInventory,
  replaceRegressionDocInventory,
} from "./lib/regression-doc-inventory.mjs";
import { POLICY_SOURCE, generatedContentMatches } from "./lib/regression-manifest.mjs";

const DOC_PATH = "docs/regression-suite.md";
const MANIFEST_PATH = "scripts/regression-coverage-manifest.json";
const args = process.argv.slice(2);
const mode = args.length === 1 ? args[0] : "";

if (!new Set(["--write", "--check"]).has(mode)) {
  throw new Error(`Usage: ${INVENTORY_GENERATOR} --write|--check`);
}

const [source, manifestSource, policySource] = await Promise.all([
  fs.readFile(path.resolve(DOC_PATH), "utf8"),
  fs.readFile(path.resolve(MANIFEST_PATH), "utf8"),
  fs.readFile(path.resolve(POLICY_SOURCE), "utf8"),
]);
const block = buildRegressionDocInventory({
  manifest: JSON.parse(manifestSource),
  policy: JSON.parse(policySource),
});
const expected = replaceRegressionDocInventory(source, block);

if (mode === "--check") {
  if (!generatedContentMatches(source, expected)) {
    throw new Error(`Generated regression inventory is stale. Run ${INVENTORY_GENERATOR} --write.`);
  }
  console.log("Generated regression documentation inventory is current.");
} else {
  await fs.writeFile(path.resolve(DOC_PATH), expected, "utf8");
  console.log(`Updated the delimited inventory block in ${DOC_PATH}.`);
}
