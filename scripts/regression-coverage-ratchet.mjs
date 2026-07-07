import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REGRESSION_SCRIPTS } from "./regression-suite.mjs";
import {
  collectRegressionCoverageErrors,
  validateRegressionCoverageManifest,
} from "./test-support/regression-coverage-ratchet.mjs";

const manifest = JSON.parse(readFileSync("scripts/regression-coverage-manifest.json", "utf8"));

validateRegressionCoverageManifest({
  manifest,
  scripts: REGRESSION_SCRIPTS,
});

const syntheticMissingScript = "scripts/synthetic-undocumented-drop-regression.mjs";
const undocumentedDropManifest = {
  ...manifest,
  minimumRegisteredScripts: manifest.minimumRegisteredScripts + 1,
  requiredScripts: [...manifest.requiredScripts, syntheticMissingScript],
};

assert.throws(
  () => validateRegressionCoverageManifest({
    manifest: undocumentedDropManifest,
    scripts: REGRESSION_SCRIPTS,
  }),
  new RegExp(escapeRegExp(syntheticMissingScript)),
  "an undocumented required-script drop should fail the coverage ratchet",
);

const documentedRetirementManifest = {
  ...undocumentedDropManifest,
  retiredScripts: [
    ...manifest.retiredScripts,
    {
      assertionDisposition: "Synthetic fixture assertions moved to the ratchet coverage proof.",
      rationale: "Synthetic fixture proves documented retirements lower the count floor explicitly.",
      retainedCoverageOwners: ["scripts/regression-coverage-ratchet.mjs"],
      retiredInVersion: "0.33.5.29.5-test-fixture",
      retirementType: "assertions-moved",
      script: syntheticMissingScript,
      verificationPerformed: ["node scripts/regression-coverage-ratchet.mjs"],
    },
  ],
};

validateRegressionCoverageManifest({
  manifest: documentedRetirementManifest,
  scripts: REGRESSION_SCRIPTS,
});

const malformedRetirementManifest = {
  ...documentedRetirementManifest,
  retiredScripts: [
    {
      rationale: "Missing the retained coverage owner, assertion disposition, and verification evidence.",
      retiredInVersion: "0.33.5.29.5-test-fixture",
      retirementType: "assertions-moved",
      script: syntheticMissingScript,
    },
  ],
};

const malformedRetirementErrors = collectRegressionCoverageErrors({
  manifest: malformedRetirementManifest,
  scripts: REGRESSION_SCRIPTS,
}).join("\n");
assert.match(
  malformedRetirementErrors,
  /retainedCoverageOwners/,
  "retirement entries should carry a retained coverage owner",
);
assert.match(
  malformedRetirementErrors,
  /assertionDisposition/,
  "retirement entries should carry assertion disposition evidence",
);
assert.match(
  malformedRetirementErrors,
  /verificationPerformed/,
  "retirement entries should carry verification evidence",
);

console.log("Regression coverage ratchet passed.");

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
