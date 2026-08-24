import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { requirePackageManifest } from "../test-support/package-manifest-assertions.mjs";
import { DATA_FILES_SECURITY_STATIC_CONSOLIDATION } from "../data-files-security-static-consolidation.mjs";
import { FRAMEWORK_VIEW_STATIC_CONSOLIDATION } from "../framework-view-static-consolidation.mjs";
import { WORKFLOW_MODULE_STATIC_CONSOLIDATION } from "../workflow-module-static-consolidation.mjs";

const MANIFEST_SCHEMA_VERSION = 5;
const MANIFEST_GENERATOR = "node scripts/generate-regression-manifest.mjs";
const POLICY_SOURCE = "scripts/regression-coverage-exceptions.json";
const CONTRACT_MODULE_ROOT = "scripts/regression-contracts";
// Assertion retirements that delete deadweight from a still-active owner rather
// than moving it. Historical planning pins are the only recorded kind today.
const RETIRED_ASSERTION_TYPES = new Set(["historical-planning-pin"]);
/** @typedef {{ modulePath: string, retainedOwner: string }} ContractMovement */
/** @typedef {{ area: string, description: string, id: string, legacy?: boolean, path: string, runMode: string, tags: readonly string[], tier: string }} RegressionOwner */
/** @typedef {{ assertionCount: number, path: string }} ContractAssertionModule */
/** @typedef {(filePath: string, encoding: "utf8") => string} SourceReader */
/** @typedef {{ id: string, matchTags: readonly string[], minimumActiveScripts: number }} CoverageFamilyPolicy */
/** @typedef {{ creditedAssertionReduction: number, ownerPaths: readonly string[], sourceAssertionCount: number }} RetirementAssertionInventory */
/** @typedef {{ [key: string]: unknown, area: string, assertionInventory?: RetirementAssertionInventory, floorCredit: boolean, id: string, integrationCoverageOwners?: readonly string[], retainedCoverageOwners: readonly string[], retirementType: string, script: string, tags?: readonly string[], tier: string, vitestOwner: string }} RetiredScript */
/** @typedef {{ [key: string]: unknown, assertionCount: number, movedTo: string, movementType: string, retainedIntegrationOwner: string, sourceInventory?: string, sourceRegression: string, verificationPerformed?: readonly string[] }} AssertionMovement */
/** @typedef {{ [key: string]: unknown, assertionCount: number, assertionDisposition: string, rationale: string, retainedCoverageOwners: readonly string[], retiredEvidence: readonly string[], retiredInVersion: string, retirementType: string, sourcePaths: readonly string[], sourceRegression: string, verificationPerformed: readonly string[] }} RetiredAssertionRecord */
/** @typedef {{ maximumScripts: number, rationale: string, snapshotPath: string }} LegacyMetadataException */
/** @typedef {{ assertionMovements: readonly AssertionMovement[], coverageFamilies: readonly CoverageFamilyPolicy[], legacyMetadataException: LegacyMetadataException, maximumActiveScripts: number, minimumAreaScripts: Record<string, number>, minimumAssertionCount: number, minimumReleaseGateScripts: number, protectedAreas: readonly string[], requiredReleaseGateIds: readonly string[], retiredAssertions: readonly RetiredAssertionRecord[], retiredScripts: readonly RetiredScript[], schemaVersion: number }} CoveragePolicy */
/** @typedef {{ entries: readonly RegressionOwner[], policy: CoveragePolicy, readSource?: SourceReader }} CoverageComputationOptions */
/** @typedef {{ contractMovements?: readonly ContractMovement[], entries: readonly RegressionOwner[], policy: CoveragePolicy, readSource?: SourceReader }} AssertionInventoryOptions */
/** @typedef {{ id: string, minimumActiveScripts: number }} CoverageFamilyFloorTarget */
/** @typedef {ReturnType<typeof buildOwnedAssertionEntry>} OwnedRegressionEntry */
/** @typedef {ReturnType<typeof buildRegressionManifest>} RegressionManifest */
/** @type {SourceReader} */
const readUtf8Source = (filePath, _encoding) => readFileSync(filePath, "utf8");
/** @type {readonly ContractMovement[]} */
const DEFAULT_CONTRACT_MOVEMENTS = Object.freeze([
  ...FRAMEWORK_VIEW_STATIC_CONSOLIDATION.movements,
  ...WORKFLOW_MODULE_STATIC_CONSOLIDATION.movements,
  ...DATA_FILES_SECURITY_STATIC_CONSOLIDATION.movements,
].map((movement) => ({
  modulePath: String(movement.modulePath),
  retainedOwner: String(movement.retainedOwner),
})));

/**
 * @param {CoverageComputationOptions} options
 */
function buildRegressionManifest({ entries, policy, readSource = readUtf8Source }) {
  validateUniqueEntryIdentity(entries);
  const contractOwnership = buildContractOwnership({ entries, readSource, contractMovements: DEFAULT_CONTRACT_MOVEMENTS });
  const regressions = [...entries]
    .map((entry) => buildOwnedAssertionEntry(entry, contractOwnership, readSource))
    .sort((left, right) => left.path.localeCompare(right.path));
  const retiredRegressions = [...(policy.retiredScripts || [])]
    .map((entry) => cloneJson(entry))
    .sort((left, right) => left.script.localeCompare(right.script));
  const assertionMovements = [...(policy.assertionMovements || [])]
    .map((entry) => cloneJson(entry))
    .sort((left, right) => left.sourceRegression.localeCompare(right.sourceRegression));
  const retiredAssertions = [...(policy.retiredAssertions || [])]
    .map((entry) => cloneJson(entry))
    .sort((left, right) => left.sourceRegression.localeCompare(right.sourceRegression));

  const assertionInventory = buildAssertionInventory({ entries, policy, readSource });

  return Object.freeze({
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    generatedBy: MANIFEST_GENERATOR,
    policySource: POLICY_SOURCE,
    summary: buildSummary(regressions),
    coverageFamilies: buildCoverageFamilies(regressions, retiredRegressions, policy.coverageFamilies || []),
    assertionInventory,
    assertionMovements,
    legacyMetadataException: cloneJson(policy.legacyMetadataException),
    retiredAssertions,
    regressions,
    retiredRegressions,
  });
}

/**
 * @param {unknown} manifest
 * @returns {string}
 */
function serializeRegressionManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * Compare generated text against its working-copy file while tolerating
 * Windows CRLF checkouts of byte-identical committed content; any other
 * difference is real drift and must still read as stale.
 * @param {string} actual
 * @param {string} expected
 * @returns {boolean}
 */
function generatedContentMatches(actual, expected) {
  return actual.replaceAll("\r\n", "\n") === expected.replaceAll("\r\n", "\n");
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function cloneJson(value) {
  // A round trip through the JSON serializer answers `any`, which satisfies
  // the declared `T` without ever proving it. structuredClone keeps the clone
  // and drops the widening.
  return structuredClone(value);
}

/**
 * @param {{ entries: readonly RegressionOwner[], manifest: unknown, packageScripts?: Record<string, string>, policy: CoveragePolicy, readSource?: SourceReader }} options
 * @returns {string[]}
 */
function collectRegressionCoverageErrors({ entries, manifest, packageScripts = readPackageScripts(), policy, readSource = readUtf8Source }) {
  /** @type {string[]} */
  const errors = [];
  const activeEntries = Array.isArray(entries) ? entries : [];
  const retiredEntries = Array.isArray(policy?.retiredScripts) ? policy.retiredScripts : [];
  const assertionMovements = Array.isArray(policy?.assertionMovements) ? policy.assertionMovements : [];
  const creditedRetirements = retiredEntries.filter((entry) => entry?.floorCredit === true);
  const activePaths = new Set(activeEntries.map((entry) => entry.path));
  const activeIds = new Set(activeEntries.map((entry) => entry.id));

  validatePolicyShape(errors, policy);
  validateUniqueValues(errors, "active regression paths", activeEntries.map((entry) => entry.path));
  validateUniqueValues(errors, "active regression IDs", activeEntries.map((entry) => entry.id));
  validateUniqueValues(errors, "retired regression paths", retiredEntries.map((entry) => entry?.script).filter(Boolean));
  validateUniqueValues(errors, "retired regression IDs", retiredEntries.map((entry) => entry?.id).filter(Boolean));
  validateUniqueValues(
    errors,
    "assertion movement sources and targets",
    assertionMovements.map((entry) => `${entry?.sourceRegression || ""}->${entry?.movedTo || ""}`),
  );
  errors.push(...collectContractOwnershipErrors({
    entries: activeEntries,
    contractMovements: DEFAULT_CONTRACT_MOVEMENTS,
    contractModulePaths: listContractModulePaths(),
  }));

  for (const retiredEntry of retiredEntries) {
    validateRetirementEntry({ activeIds, activePaths, errors, packageScripts, readSource, retiredEntry });
  }
  for (const movement of assertionMovements) {
    validateAssertionMovement({ activePaths, errors, movement });
  }
  for (const record of Array.isArray(policy?.retiredAssertions) ? policy.retiredAssertions : []) {
    validateRetiredAssertionRecord({ activeIds, activePaths, errors, readSource, record });
  }

  if (Number.isInteger(policy?.maximumActiveScripts) && activeEntries.length > policy.maximumActiveScripts) {
    errors.push(`active regression count ${activeEntries.length} exceeds shrink-only ceiling ${policy.maximumActiveScripts}`);
  }
  const assertionInventory = buildAssertionInventory({
    entries: activeEntries,
    policy,
    readSource,
    contractMovements: DEFAULT_CONTRACT_MOVEMENTS,
  });
  if (Number.isInteger(policy?.minimumAssertionCount)
    && assertionInventory.effectiveAssertionCount < policy.minimumAssertionCount) {
    errors.push(
      `effective assertion count ${assertionInventory.effectiveAssertionCount} is below policy floor ${policy.minimumAssertionCount}`,
    );
  }

  validateAreaFloors({ activeEntries, creditedRetirements, errors, policy });
  validateTierAndFamilyFloors({ activeEntries, creditedRetirements, errors, policy });
  validateRequiredReleaseGates({ activeIds, errors, policy });
  validateLegacyException({ activeEntries, errors, policy });
  errors.push(...collectCoverageFloorDriftErrors({ entries: activeEntries, policy, readSource }));

  try {
    const expectedManifest = buildRegressionManifest({ entries: activeEntries, policy, readSource });
    if (serializeRegressionManifest(manifest) !== serializeRegressionManifest(expectedManifest)) {
      errors.push(`generated manifest is stale; run ${MANIFEST_GENERATOR}`);
    }
  } catch (error) {
    errors.push(/** @type {Error} */ (error).message);
  }

  return errors;
}

/**
 * @param {CoverageComputationOptions} options
 * @returns {CoveragePolicy}
 */
function buildRatchetedCoveragePolicy({ entries, policy, readSource = readUtf8Source }) {
  const nextPolicy = cloneJson(policy);
  const targets = buildCoverageFloorTargets({ entries, policy, readSource });
  /** @type {string[]} */
  const loweringErrors = [];

  rejectCeilingIncrease(loweringErrors, "maximumActiveScripts", policy?.maximumActiveScripts, targets.maximumActiveScripts);
  rejectCeilingIncrease(
    loweringErrors,
    "legacyMetadataException.maximumScripts",
    policy?.legacyMetadataException?.maximumScripts,
    targets.maximumLegacyScripts,
  );
  rejectFloorLowering(
    loweringErrors,
    "minimumAssertionCount",
    policy?.minimumAssertionCount,
    targets.minimumAssertionCount,
  );
  rejectFloorLowering(
    loweringErrors,
    "minimumReleaseGateScripts",
    policy?.minimumReleaseGateScripts,
    targets.minimumReleaseGateScripts,
  );
  for (const [area, target] of Object.entries(targets.minimumAreaScripts)) {
    rejectFloorLowering(
      loweringErrors,
      `minimumAreaScripts.${area}`,
      policy?.minimumAreaScripts?.[area],
      target,
    );
  }
  for (const family of targets.coverageFamilies) {
    const current = policy?.coverageFamilies?.find((entry) => entry.id === family.id)?.minimumActiveScripts;
    rejectFloorLowering(
      loweringErrors,
      `coverageFamilies.${family.id}.minimumActiveScripts`,
      current,
      family.minimumActiveScripts,
    );
  }

  if (loweringErrors.length > 0) {
    throw new Error(`Refusing to weaken regression coverage guardrails:\n- ${loweringErrors.join("\n- ")}`);
  }

  nextPolicy.maximumActiveScripts = targets.maximumActiveScripts;
  nextPolicy.minimumAssertionCount = targets.minimumAssertionCount;
  nextPolicy.legacyMetadataException.maximumScripts = targets.maximumLegacyScripts;
  nextPolicy.minimumAreaScripts = targets.minimumAreaScripts;
  nextPolicy.minimumReleaseGateScripts = targets.minimumReleaseGateScripts;
  nextPolicy.coverageFamilies = nextPolicy.coverageFamilies.map((family) => ({
    ...family,
    minimumActiveScripts: /** @type {CoverageFamilyFloorTarget} */ (targets.coverageFamilies.find((target) => target.id === family.id)).minimumActiveScripts,
  }));
  return nextPolicy;
}

/**
 * @param {CoverageComputationOptions} options
 * @returns {string[]}
 */
function collectCoverageFloorDriftErrors({ entries, policy, readSource = readUtf8Source }) {
  if (!policy || typeof policy !== "object") {
    return [];
  }
  const targets = buildCoverageFloorTargets({ entries, policy, readSource });
  /** @type {string[]} */
  const errors = [];
  reportCeilingDrift(errors, "maximumActiveScripts", policy.maximumActiveScripts, targets.maximumActiveScripts);
  reportCeilingDrift(
    errors,
    "legacyMetadataException.maximumScripts",
    policy.legacyMetadataException?.maximumScripts,
    targets.maximumLegacyScripts,
  );
  reportLag(errors, "minimumAssertionCount", policy.minimumAssertionCount, targets.minimumAssertionCount);
  reportLag(
    errors,
    "minimumReleaseGateScripts",
    policy.minimumReleaseGateScripts,
    targets.minimumReleaseGateScripts,
  );
  for (const [area, target] of Object.entries(targets.minimumAreaScripts)) {
    reportLag(errors, `minimumAreaScripts.${area}`, policy.minimumAreaScripts?.[area], target);
  }
  for (const family of targets.coverageFamilies) {
    const current = policy.coverageFamilies?.find((entry) => entry.id === family.id)?.minimumActiveScripts;
    reportLag(errors, `coverageFamilies.${family.id}.minimumActiveScripts`, current, family.minimumActiveScripts);
  }
  return errors;
}

/**
 * @param {CoverageComputationOptions} options
 */
function buildCoverageFloorTargets({ entries, policy, readSource = readUtf8Source }) {
  const activeEntries = Array.isArray(entries) ? entries : [];
  const creditedRetirements = Array.isArray(policy?.retiredScripts)
    ? policy.retiredScripts.filter((entry) => entry?.floorCredit === true)
    : [];
  const activeAreaCounts = countBy(activeEntries, (entry) => entry.area);
  const creditedAreaCounts = countBy(
    creditedRetirements.filter((entry) => typeof entry.area === "string" && entry.area),
    (entry) => entry.area,
  );
  const areas = new Set([
    ...Object.keys(policy?.minimumAreaScripts || {}),
    ...(policy?.protectedAreas || []),
    ...Object.keys(activeAreaCounts),
    ...Object.keys(creditedAreaCounts),
  ]);
  const minimumAreaScripts = Object.fromEntries(
    [...areas]
      .sort((left, right) => left.localeCompare(right))
      .map((area) => [area, (activeAreaCounts[area] || 0) + (creditedAreaCounts[area] || 0)]),
  );
  const releaseGateCredits = creditedRetirements.filter((entry) => entry.tier === "release-gate").length;
  const coverageFamilies = (policy?.coverageFamilies || []).map((family) => {
    const matchTags = Array.isArray(family.matchTags) ? family.matchTags : [];
    return {
      id: family.id,
      minimumActiveScripts: activeEntries.filter((entry) => (
        matchTags.every((tag) => entry.tags.includes(tag))
      )).length + creditedRetirements.filter((entry) => (
        matchTags.every((tag) => retirementTags(entry).includes(tag))
      )).length,
    };
  });

  return {
    maximumActiveScripts: activeEntries.length,
    maximumLegacyScripts: activeEntries.filter((entry) => entry.legacy).length,
    minimumAssertionCount: buildAssertionInventory({ entries: activeEntries, policy, readSource }).effectiveAssertionCount,
    minimumAreaScripts,
    minimumReleaseGateScripts: activeEntries.filter((entry) => entry.tier === "release-gate").length
      + releaseGateCredits,
    coverageFamilies,
  };
}

/**
 * @param {string[]} errors
 * @param {string} label
 * @param {number | undefined} current
 * @param {number} target
 * @returns {void}
 */
function rejectCeilingIncrease(errors, label, current, target) {
  if (Number.isInteger(current) && target > /** @type {number} */ (current)) {
    errors.push(`${label} would increase from ${current} to ${target}`);
  }
}

/**
 * @param {string[]} errors
 * @param {string} label
 * @param {number | undefined} current
 * @param {number} target
 * @returns {void}
 */
function rejectFloorLowering(errors, label, current, target) {
  if (Number.isInteger(current) && target < /** @type {number} */ (current)) {
    errors.push(`${label} would decrease from ${current} to ${target}`);
  }
}

/**
 * @param {string[]} errors
 * @param {string} label
 * @param {number | undefined} current
 * @param {number} target
 * @returns {void}
 */
function reportLag(errors, label, current, target) {
  if (Number.isInteger(current) && /** @type {number} */ (current) < target) {
    errors.push(
      `${label} lags current discovered coverage (${current} < ${target}); run ${MANIFEST_GENERATOR} --ratchet-floors`,
    );
  } else if (Number.isInteger(current) && /** @type {number} */ (current) > target) {
    errors.push(`${label} exceeds current effective coverage (${current} > ${target}); coverage was lost or its retirement evidence is incomplete`);
  }
}

/**
 * @param {string[]} errors
 * @param {string} label
 * @param {number | undefined} current
 * @param {number} target
 * @returns {void}
 */
function reportCeilingDrift(errors, label, current, target) {
  if (Number.isInteger(current) && /** @type {number} */ (current) > target) {
    errors.push(
      `${label} is above current discovered coverage (${current} > ${target}); run ${MANIFEST_GENERATOR} --ratchet-floors`,
    );
  } else if (Number.isInteger(current) && /** @type {number} */ (current) < target) {
    errors.push(`${label} was exceeded by discovered coverage (${current} < ${target}); active entry points may not grow implicitly`);
  }
}

/**
 * @param {{ entries: readonly RegressionOwner[], manifest: unknown, policy: CoveragePolicy }} options
 * @returns {void}
 */
function validateRegressionCoverage({ entries, manifest, policy }) {
  const errors = collectRegressionCoverageErrors({ entries, manifest, policy });
  if (errors.length > 0) {
    throw new Error(`Regression coverage manifest failed:\n- ${errors.join("\n- ")}`);
  }
}

/**
 * @param {AssertionInventoryOptions} options
 */
function buildAssertionInventory({ entries, policy, readSource = readUtf8Source } = /** @type {AssertionInventoryOptions} */ ({})) {
  const activePaths = new Set(entries.map((entry) => entry.path));
  const contractOwnership = buildContractOwnership({ entries, readSource, contractMovements: DEFAULT_CONTRACT_MOVEMENTS });
  const contractModulePaths = new Set(DEFAULT_CONTRACT_MOVEMENTS.map((entry) => entry.modulePath));
  const active = entries
    .map((entry) => {
      const owned = buildOwnedAssertionEntry(entry, contractOwnership, readSource);
      return Object.freeze({
        id: owned.id,
        path: owned.path,
        assertionCount: owned.assertionCount,
        contractAssertionCount: owned.contractAssertionCount,
        contractModules: owned.contractModules,
        entryPointAssertionCount: owned.entryPointAssertionCount,
      });
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  /** @type {Set<string>} */
  const vitestPaths = new Set();
  /** @type {Set<string>} */
  const directOwnerPaths = new Set();
  for (const movement of policy?.assertionMovements || []) {
    if (movement?.movementType === "pure-contract-to-vitest" && typeof movement.movedTo === "string") {
      vitestPaths.add(movement.movedTo);
    }
  }
  for (const retirement of policy?.retiredScripts || []) {
    if (retirement?.floorCredit !== true) continue;
    if (typeof retirement.vitestOwner === "string") vitestPaths.add(retirement.vitestOwner);
    for (const ownerPath of retirement?.assertionInventory?.ownerPaths || []) {
      if (/^tests\/.+\.test\.mjs$/.test(ownerPath)) vitestPaths.add(ownerPath);
      else if (!activePaths.has(ownerPath) && !contractModulePaths.has(ownerPath)) directOwnerPaths.add(ownerPath);
    }
  }
  const vitest = buildExternalAssertionEntries(vitestPaths, readSource);
  const directOwners = buildExternalAssertionEntries(directOwnerPaths, readSource);
  const creditedAssertionReduction = (policy?.retiredScripts || [])
    .filter((entry) => entry?.floorCredit === true)
    .reduce((total, entry) => total + (entry?.assertionInventory?.creditedAssertionReduction || 0), 0);
  const retiredAssertionCredit = (policy?.retiredAssertions || [])
    .reduce((total, entry) => total + (Number.isInteger(entry?.assertionCount) ? entry.assertionCount : 0), 0);
  const activeAssertionCount = sumAssertions(active);
  const vitestAssertionCount = sumAssertions(vitest);
  const directOwnerAssertionCount = sumAssertions(directOwners);
  return Object.freeze({
    activeAssertionCount,
    creditedAssertionReduction,
    directOwnerAssertionCount,
    directOwners,
    effectiveAssertionCount: activeAssertionCount
      + vitestAssertionCount
      + directOwnerAssertionCount
      + creditedAssertionReduction
      + retiredAssertionCredit,
    retiredAssertionCredit,
    vitest,
    vitestAssertionCount,
  });
}

/**
 * @param {RegressionOwner} entry
 * @param {Map<string, readonly ContractAssertionModule[]>} contractOwnership
 * @param {SourceReader} readSource
 */
function buildOwnedAssertionEntry(entry, contractOwnership, readSource) {
  const entryPointAssertionCount = countAssertions(readSource(entry.path, "utf8"));
  const contractModules = contractOwnership.get(entry.id) || [];
  const contractAssertionCount = sumAssertions(contractModules);
  return Object.freeze({
    area: entry.area,
    assertionCount: entryPointAssertionCount + contractAssertionCount,
    contractAssertionCount,
    contractModules,
    description: entry.description,
    entryPointAssertionCount,
    id: entry.id,
    legacy: Boolean(entry.legacy),
    path: entry.path,
    releaseGate: entry.tier === "release-gate",
    runMode: entry.runMode,
    tags: [...entry.tags],
    tier: entry.tier,
  });
}

/**
 * @param {{ entries: readonly RegressionOwner[], readSource: SourceReader, contractMovements: readonly ContractMovement[] }} options
 */
function buildContractOwnership({ entries, readSource, contractMovements }) {
  const activeIds = new Set(entries.map((entry) => entry.id));
  /** @type {Map<string, ContractAssertionModule[]>} */
  const ownership = new Map();
  for (const movement of contractMovements) {
    if (!activeIds.has(movement.retainedOwner)) continue;
    const modules = ownership.get(movement.retainedOwner) || [];
    modules.push(Object.freeze({
      path: movement.modulePath,
      assertionCount: countAssertions(readSource(movement.modulePath, "utf8")),
    }));
    ownership.set(movement.retainedOwner, modules);
  }
  for (const [owner, modules] of ownership) {
    ownership.set(owner, modules.sort((left, right) => left.path.localeCompare(right.path)));
  }
  return ownership;
}

/**
 * @param {{ entries: readonly RegressionOwner[], contractMovements: readonly ContractMovement[], contractModulePaths: readonly string[] }} options
 */
function collectContractOwnershipErrors({ entries, contractMovements, contractModulePaths }) {
  /** @type {string[]} */
  const errors = [];
  const activeIds = new Set(entries.map((entry) => entry.id));
  /** @type {Map<string, string[]>} */
  const movementsByModule = new Map();
  for (const movement of contractMovements) {
    const owners = movementsByModule.get(movement.modulePath) || [];
    owners.push(movement.retainedOwner);
    movementsByModule.set(movement.modulePath, owners);
    if (!activeIds.has(movement.retainedOwner)) {
      errors.push(`${movement.modulePath} contract owner ${movement.retainedOwner} should remain discovered`);
    }
  }
  for (const modulePath of contractModulePaths) {
    const owners = movementsByModule.get(modulePath) || [];
    if (owners.length === 0) {
      errors.push(`${modulePath} contract module is imported by no discovered owner`);
    } else if (owners.length > 1) {
      errors.push(`${modulePath} contract module should have exactly one discovered owner, found ${owners.join(", ")}`);
    }
  }
  for (const modulePath of movementsByModule.keys()) {
    if (!contractModulePaths.includes(modulePath)) {
      errors.push(`${modulePath} owned contract module should exist under ${CONTRACT_MODULE_ROOT}`);
    }
  }
  return errors;
}

/** @param {string} root @returns {string[]} */
function listContractModulePaths(root = CONTRACT_MODULE_ROOT) {
  if (!existsSync(root)) return [];
  /** @type {string[]} */
  const paths = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const entryPath = join(root, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) paths.push(...listContractModulePaths(entryPath));
    else if (entryPath.endsWith(".contract.mjs")) paths.push(entryPath);
  }
  return paths.sort((left, right) => left.localeCompare(right));
}

/**
 * @param {ReadonlySet<string>} paths
 * @param {SourceReader} readSource
 * @returns {ContractAssertionModule[]}
 */
function buildExternalAssertionEntries(paths, readSource) {
  return [...paths]
    .filter((filePath) => existsSync(filePath))
    .map((filePath) => ({ path: filePath, assertionCount: countAssertions(readSource(filePath, "utf8")) }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

/**
 * @param {unknown} source
 * @returns {number}
 */
function countAssertions(source) {
  const matches = String(source || "").match(/\b(?:assert(?:\.[A-Za-z][A-Za-z0-9]*)?|expect)\s*\(/g);
  return matches?.length || 0;
}

/**
 * @param {readonly { assertionCount: number }[]} entries
 * @returns {number}
 */
function sumAssertions(entries) {
  return entries.reduce((total, entry) => total + entry.assertionCount, 0);
}

/**
 * @param {readonly OwnedRegressionEntry[]} regressions
 */
function buildSummary(regressions) {
  return {
    discoveredScripts: regressions.length,
    legacyScripts: regressions.filter((entry) => entry.legacy).length,
    releaseGateScripts: regressions.filter((entry) => entry.releaseGate).length,
    areaCounts: countBy(regressions, (entry) => entry.area),
    tierCounts: countBy(regressions, (entry) => entry.tier),
    runModeCounts: countBy(regressions, (entry) => entry.runMode),
  };
}

/**
 * @param {readonly OwnedRegressionEntry[]} regressions
 * @param {readonly RetiredScript[]} retiredRegressions
 * @param {readonly CoverageFamilyPolicy[]} families
 */
function buildCoverageFamilies(regressions, retiredRegressions, families) {
  return families.map((family) => ({
    id: family.id,
    matchTags: [...family.matchTags],
    minimumActiveScripts: family.minimumActiveScripts,
    activeRegressionIds: regressions
      .filter((entry) => family.matchTags.every((tag) => entry.tags.includes(tag)))
      .map((entry) => entry.id)
      .sort(),
    retiredScripts: retiredRegressions
      .filter((entry) => family.matchTags.every((tag) => retirementTags(entry).includes(tag)))
      .map((entry) => entry.script)
      .sort(),
  }));
}

/**
 * @param {string[]} errors
 * @param {CoveragePolicy} policy
 * @returns {void}
 */
function validatePolicyShape(errors, policy) {
  if (!policy || typeof policy !== "object") {
    errors.push("coverage exceptions policy should be an object");
    return;
  }
  if (policy.schemaVersion !== 2) {
    errors.push("coverage exceptions policy schemaVersion should be 2");
  }
  if (!Number.isInteger(policy.maximumActiveScripts) || policy.maximumActiveScripts < 1) {
    errors.push("maximumActiveScripts should be a positive integer");
  }
  if (!Number.isInteger(policy.minimumAssertionCount) || policy.minimumAssertionCount < 1) {
    errors.push("minimumAssertionCount should be a positive integer");
  }
  if (!policy.minimumAreaScripts || typeof policy.minimumAreaScripts !== "object") {
    errors.push("minimumAreaScripts should be an object");
  }
  if (!Number.isInteger(policy.minimumReleaseGateScripts) || policy.minimumReleaseGateScripts < 0) {
    errors.push("minimumReleaseGateScripts should be a non-negative integer");
  }
  if (!Array.isArray(policy.requiredReleaseGateIds)) {
    errors.push("requiredReleaseGateIds should be an array");
  }
  if (!Array.isArray(policy.protectedAreas)) {
    errors.push("protectedAreas should be an array");
  }
  if (!Array.isArray(policy.coverageFamilies)) {
    errors.push("coverageFamilies should be an array");
  }
  if (!Array.isArray(policy.retiredScripts)) {
    errors.push("retiredScripts should be an array");
  }
  if (!Array.isArray(policy.assertionMovements)) {
    errors.push("assertionMovements should be an array");
  }
  if (!Array.isArray(policy.retiredAssertions)) {
    errors.push("retiredAssertions should be an array");
  }
}

/**
 * @param {{ activePaths: ReadonlySet<string>, errors: string[], movement: AssertionMovement }} options
 * @returns {void}
 */
function validateAssertionMovement({ activePaths, errors, movement }) {
  if (!movement || typeof movement !== "object") {
    errors.push("assertion movement should be an object");
    return;
  }
  const label = movement.sourceRegression || "assertion movement";
  for (const field of [
    "sourceRegression",
    "movedInVersion",
    "movementType",
    "rationale",
    "assertionDisposition",
    "movedTo",
    "retainedIntegrationOwner",
  ]) {
    if (typeof movement[field] !== "string" || !movement[field].trim()) {
      errors.push(`${label} should include ${field}`);
    }
  }
  const supportedTypes = new Set(["pure-contract-to-vitest", "duplicate-contract-to-regression"]);
  if (!supportedTypes.has(movement.movementType)) {
    errors.push(`${label} movementType should be pure-contract-to-vitest or duplicate-contract-to-regression`);
  }
  if (!Number.isInteger(movement.assertionCount) || movement.assertionCount < 1) {
    errors.push(`${label} should include a positive assertionCount`);
  }
  if (!activePaths.has(movement.sourceRegression)) {
    errors.push(`${label} source regression should remain discovered`);
  }
  if (!activePaths.has(movement.retainedIntegrationOwner)) {
    errors.push(`${label} retained integration owner should remain discovered`);
  }
  if (movement.movementType === "pure-contract-to-vitest") {
    if (!/^tests\/.+\.test\.mjs$/.test(movement.movedTo || "") || !existsSync(movement.movedTo)) {
      errors.push(`${label} movedTo should identify an existing Vitest test`);
    }
  } else if (!existsSync(movement.movedTo || "")) {
    errors.push(`${label} movedTo should identify an existing authoritative regression or direct gate`);
  }
  if (movement.movementType === "duplicate-contract-to-regression") {
    if (typeof movement.sourceInventory !== "string" || !movement.sourceInventory.trim() || !existsSync(movement.sourceInventory)) {
      errors.push(`${label} should identify an existing sourceInventory`);
    }
  }
  if (!Array.isArray(movement.verificationPerformed) || movement.verificationPerformed.length === 0) {
    errors.push(`${label} should include verificationPerformed`);
  }
}

/**
 * @param {{ activeIds: ReadonlySet<string>, activePaths: ReadonlySet<string>, errors: string[], packageScripts: Record<string, string>, readSource: SourceReader, retiredEntry: RetiredScript }} options
 * @returns {void}
 */
function validateRetirementEntry({ activeIds, activePaths, errors, packageScripts, readSource, retiredEntry }) {
  if (!retiredEntry || typeof retiredEntry !== "object") {
    errors.push("retirement entry should be an object");
    return;
  }
  const label = retiredEntry.script || "retirement entry";
  for (const field of ["script", "retiredInVersion", "retirementType", "rationale", "assertionDisposition"]) {
    if (typeof retiredEntry[field] !== "string" || !retiredEntry[field].trim()) {
      errors.push(`${label} should include ${field}`);
    }
  }
  if (!new Set(["assertions-moved", "dead-target", "pure-contract-to-vitest"]).has(retiredEntry.retirementType)) {
    errors.push(`${label} retirementType should be assertions-moved, dead-target, or pure-contract-to-vitest`);
  }
  if (typeof retiredEntry.floorCredit !== "boolean") {
    errors.push(`${label} should include boolean floorCredit`);
  }
  if (!Array.isArray(retiredEntry.retainedCoverageOwners) || retiredEntry.retainedCoverageOwners.length === 0) {
    errors.push(`${label} should include retainedCoverageOwners`);
  } else {
    for (const owner of retiredEntry.retainedCoverageOwners) {
      if (!activePaths.has(owner) && !activeIds.has(owner)) {
        errors.push(`${label} retained coverage owner ${owner} should be active`);
      }
    }
  }
  if (!Array.isArray(retiredEntry.verificationPerformed) || retiredEntry.verificationPerformed.length === 0) {
    errors.push(`${label} should include verificationPerformed`);
  }
  if (activePaths.has(retiredEntry.script)) {
    errors.push(`${label} is retired but still discovered`);
  }
  if (retiredEntry.id && activeIds.has(retiredEntry.id)) {
    errors.push(`${label} retirement ID ${retiredEntry.id} is still active`);
  }
  if (retiredEntry.floorCredit === true) {
    for (const field of ["id", "area", "tier"]) {
      if (typeof retiredEntry[field] !== "string" || !retiredEntry[field].trim()) {
        errors.push(`${label} credited retirement should include ${field}`);
      }
    }
    if (!Array.isArray(retiredEntry.tags)) {
      errors.push(`${label} credited retirement should include tags`);
    }
    validateRetirementAssertionInventory({ activeIds, activePaths, errors, readSource, retiredEntry });
  }
  if (retiredEntry.retirementType === "pure-contract-to-vitest") {
    if (!/^tests\/.+\.test\.mjs$/.test(retiredEntry.vitestOwner || "") || !existsSync(retiredEntry.vitestOwner)) {
      errors.push(`${label} pure-contract retirement should identify an existing vitestOwner`);
    }
    if (!Array.isArray(retiredEntry.integrationCoverageOwners) || retiredEntry.integrationCoverageOwners.length === 0) {
      errors.push(`${label} pure-contract retirement should name integrationCoverageOwners`);
    } else {
      for (const owner of retiredEntry.integrationCoverageOwners) {
        if (!activeIds.has(owner) && !activePaths.has(owner)) {
          errors.push(`${label} integration coverage owner ${owner} should remain active`);
        }
      }
    }
    if (!vitestRunsInCheckFast(packageScripts)) {
      errors.push(`${label} pure-contract retirement requires check:fast to run test:unit before regressions`);
    }
  }
}

/**
 * Validate one retired-assertion record. Unlike a retired script, nothing
 * leaves discovery here: assertions were deleted from files that stay active,
 * so the record credits only the assertion floor and never an area, tier,
 * family, or bucket floor. The record is self-proving: every named source
 * file must still exist and must no longer contain the retired evidence, so a
 * reinstated pin fails this check instead of silently keeping its credit.
 * @param {{ activeIds: ReadonlySet<string>, activePaths: ReadonlySet<string>, errors: string[], readSource: SourceReader, record: RetiredAssertionRecord }} options
 */
function validateRetiredAssertionRecord({ activeIds, activePaths, errors, readSource, record }) {
  if (!record || typeof record !== "object") {
    errors.push("retired assertion record should be an object");
    return;
  }
  const label = record.sourceRegression || "retired assertion record";
  for (const field of ["sourceRegression", "retiredInVersion", "retirementType", "rationale", "assertionDisposition"]) {
    if (typeof record[field] !== "string" || !String(record[field]).trim()) {
      errors.push(`${label} retired assertions should include ${field}`);
    }
  }
  if (!RETIRED_ASSERTION_TYPES.has(record.retirementType)) {
    errors.push(`${label} retirementType should be one of ${[...RETIRED_ASSERTION_TYPES].join(", ")}`);
  }
  if (!Number.isInteger(record.assertionCount) || record.assertionCount < 1) {
    errors.push(`${label} retired assertions should include a positive assertionCount`);
  }
  if (!activeIds.has(record.sourceRegression) && !activePaths.has(record.sourceRegression)) {
    errors.push(`${label} retired assertions should name an active source regression`);
  }
  if (!Array.isArray(record.verificationPerformed) || record.verificationPerformed.length === 0) {
    errors.push(`${label} retired assertions should include verificationPerformed`);
  }
  if (!Array.isArray(record.retainedCoverageOwners) || record.retainedCoverageOwners.length === 0) {
    errors.push(`${label} retired assertions should include retainedCoverageOwners`);
  } else {
    for (const owner of record.retainedCoverageOwners) {
      if (!activePaths.has(owner) && !activeIds.has(owner)) {
        errors.push(`${label} retained coverage owner ${owner} should be active`);
      }
    }
  }
  if (!Array.isArray(record.retiredEvidence) || record.retiredEvidence.length === 0) {
    errors.push(`${label} retired assertions should name the retiredEvidence they removed`);
    return;
  }
  if (!Array.isArray(record.sourcePaths) || record.sourcePaths.length === 0) {
    errors.push(`${label} retired assertions should include sourcePaths`);
    return;
  }
  for (const sourcePath of record.sourcePaths) {
    if (!existsSync(sourcePath)) {
      errors.push(`${label} retired assertion source ${sourcePath} should exist`);
      continue;
    }
    const source = readSource(sourcePath, "utf8");
    for (const evidence of record.retiredEvidence) {
      if (source.includes(evidence)) {
        errors.push(`${label} retired assertion source ${sourcePath} still references retired evidence ${evidence}`);
      }
    }
  }
}

/**
 * @param {{ activeIds: ReadonlySet<string>, activePaths: ReadonlySet<string>, errors: string[], readSource: SourceReader, retiredEntry: RetiredScript }} options
 * @returns {void}
 */
function validateRetirementAssertionInventory({ activeIds, activePaths, errors, readSource, retiredEntry }) {
  const label = retiredEntry.script;
  const inventory = retiredEntry.assertionInventory;
  if (!inventory || typeof inventory !== "object") {
    errors.push(`${label} credited retirement should include assertionInventory`);
    return;
  }
  if (!Number.isInteger(inventory.sourceAssertionCount) || inventory.sourceAssertionCount < 0) {
    errors.push(`${label} assertionInventory should include non-negative sourceAssertionCount`);
  }
  if (!Number.isInteger(inventory.creditedAssertionReduction) || inventory.creditedAssertionReduction < 0) {
    errors.push(`${label} assertionInventory should include non-negative creditedAssertionReduction`);
  } else if (Number.isInteger(inventory.sourceAssertionCount)
    && inventory.creditedAssertionReduction > inventory.sourceAssertionCount) {
    errors.push(`${label} creditedAssertionReduction cannot exceed sourceAssertionCount`);
  }
  if (!Array.isArray(inventory.ownerPaths) || inventory.ownerPaths.length === 0) {
    errors.push(`${label} assertionInventory should include ownerPaths`);
    return;
  }
  for (const ownerPath of inventory.ownerPaths) {
    if (!existsSync(ownerPath)) {
      errors.push(`${label} assertion owner path ${ownerPath} should exist`);
      continue;
    }
    if (!activePaths.has(ownerPath)
      && !/^tests\/.+\.test\.mjs$/.test(ownerPath)
      && ownerPath !== retiredEntry.script) {
      const namedDirectOwner = retiredEntry.retainedCoverageOwners.some((owner) => activeIds.has(owner));
      if (!namedDirectOwner) errors.push(`${label} direct assertion owner ${ownerPath} should have a named behavior owner`);
    }
    readSource(ownerPath, "utf8");
  }
}

/**
 * @param {Record<string, string> | undefined} packageScripts
 * @returns {boolean}
 */
function vitestRunsInCheckFast(packageScripts) {
  const checkFast = String(packageScripts?.["check:fast"] || "");
  const unitIndex = checkFast.indexOf("npm run test:unit");
  const regressionIndex = checkFast.search(/npm run (?:test:regressions|check)(?:\s|$)/);
  return unitIndex >= 0 && (regressionIndex < 0 || unitIndex < regressionIndex);
}

/**
 * @returns {Record<string, string>}
 */
function readPackageScripts() {
  return requirePackageManifest(JSON.parse(readFileSync("package.json", "utf8"))).scripts || {};
}

/**
 * @param {{ activeEntries: readonly RegressionOwner[], creditedRetirements: readonly RetiredScript[], errors: string[], policy: CoveragePolicy }} options
 * @returns {void}
 */
function validateAreaFloors({ activeEntries, creditedRetirements, errors, policy }) {
  const areaCounts = countBy(activeEntries, (entry) => entry.area);
  for (const [area, minimum] of Object.entries(policy?.minimumAreaScripts || {})) {
    const credits = creditedRetirements.filter((entry) => entry.area === area).length;
    const expected = Math.max(0, minimum - credits);
    const current = areaCounts[area] || 0;
    if (current < expected) {
      errors.push(`area ${area} has ${current} regressions below policy floor ${expected}`);
    }
  }
  for (const area of policy?.protectedAreas || []) {
    const current = areaCounts[area] || 0;
    const retired = creditedRetirements.filter((entry) => entry.area === area).length;
    if (current === 0 && retired === 0) {
      errors.push(`protected area ${area} has no active regression or credited retirement`);
    }
  }
}

/**
 * @param {{ activeEntries: readonly RegressionOwner[], creditedRetirements: readonly RetiredScript[], errors: string[], policy: CoveragePolicy }} options
 * @returns {void}
 */
function validateTierAndFamilyFloors({ activeEntries, creditedRetirements, errors, policy }) {
  const releaseGateCount = activeEntries.filter((entry) => entry.tier === "release-gate").length;
  const releaseGateCredits = creditedRetirements.filter((entry) => entry.tier === "release-gate").length;
  const releaseGateFloor = Math.max(0, (policy?.minimumReleaseGateScripts || 0) - releaseGateCredits);
  if (releaseGateCount < releaseGateFloor) {
    errors.push(`release-gate count ${releaseGateCount} is below policy floor ${releaseGateFloor}`);
  }

  for (const family of policy?.coverageFamilies || []) {
    const activeCount = activeEntries.filter((entry) => (
      family.matchTags.every((tag) => entry.tags.includes(tag))
    )).length;
    const credits = creditedRetirements.filter((entry) => (
      family.matchTags.every((tag) => retirementTags(entry).includes(tag))
    )).length;
    const expected = Math.max(0, family.minimumActiveScripts - credits);
    if (activeCount < expected) {
      errors.push(`coverage family ${family.id} has ${activeCount} regressions below policy floor ${expected}`);
    }
  }
}

/**
 * @param {{ activeIds: ReadonlySet<string>, errors: string[], policy: CoveragePolicy }} options
 * @returns {void}
 */
function validateRequiredReleaseGates({ activeIds, errors, policy }) {
  for (const id of policy?.requiredReleaseGateIds || []) {
    if (!activeIds.has(id)) {
      errors.push(`required release-gate behavior owner ${id} is missing`);
    }
  }
}

/**
 * @param {{ activeEntries: readonly RegressionOwner[], errors: string[], policy: CoveragePolicy }} options
 * @returns {void}
 */
function validateLegacyException({ activeEntries, errors, policy }) {
  const exception = policy?.legacyMetadataException;
  if (!exception || typeof exception !== "object") {
    errors.push("legacyMetadataException should document snapshot-backed legacy metadata");
    return;
  }
  if (exception.snapshotPath !== "scripts/regression-legacy-snapshot.json") {
    errors.push("legacyMetadataException should point to scripts/regression-legacy-snapshot.json");
  }
  if (typeof exception.rationale !== "string" || !exception.rationale.trim()) {
    errors.push("legacyMetadataException should include rationale");
  }
  const legacyCount = activeEntries.filter((entry) => entry.legacy).length;
  if (!Number.isInteger(exception.maximumScripts) || exception.maximumScripts < 0) {
    errors.push("legacyMetadataException should include non-negative maximumScripts");
  } else if (legacyCount > exception.maximumScripts) {
    errors.push(`legacy metadata count ${legacyCount} exceeds shrink-only ceiling ${exception.maximumScripts}`);
  }
}

/**
 * @param {RetiredScript} entry
 * @returns {readonly string[]}
 */
function retirementTags(entry) {
  if (Array.isArray(entry.tags)) {
    return entry.tags;
  }
  return /-closeout-regression\.mjs$/.test(entry.script || "") ? ["closeout"] : [];
}

/**
 * @param {readonly RegressionOwner[]} entries
 * @returns {void}
 */
function validateUniqueEntryIdentity(entries) {
  const ids = entries.map((entry) => entry.id);
  const paths = entries.map((entry) => entry.path);
  if (new Set(ids).size !== ids.length) {
    throw new Error("cannot generate regression manifest with duplicate regression IDs");
  }
  if (new Set(paths).size !== paths.length) {
    throw new Error("cannot generate regression manifest with duplicate regression paths");
  }
}

/**
 * @param {string[]} errors
 * @param {string} label
 * @param {readonly unknown[]} values
 * @returns {void}
 */
function validateUniqueValues(errors, label, values) {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length > 0) {
    errors.push(`${label} contains duplicates: ${[...new Set(duplicates)].join(", ")}`);
  }
}

/**
 * @template T
 * @param {readonly T[]} values
 * @param {(value: T) => string} getKey
 * @returns {Record<string, number>}
 */
function countBy(values, getKey) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const value of values) {
    const key = getKey(value);
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

export {
  MANIFEST_GENERATOR,
  MANIFEST_SCHEMA_VERSION,
  POLICY_SOURCE,
  buildAssertionInventory,
  buildRegressionManifest,
  buildRatchetedCoveragePolicy,
  collectContractOwnershipErrors,
  collectCoverageFloorDriftErrors,
  collectRegressionCoverageErrors,
  countAssertions,
  generatedContentMatches,
  serializeRegressionManifest,
  validateRegressionCoverage,
};
