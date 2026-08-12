import { existsSync, readFileSync } from "node:fs";

const MANIFEST_SCHEMA_VERSION = 4;
const MANIFEST_GENERATOR = "node scripts/generate-regression-manifest.mjs";
const POLICY_SOURCE = "scripts/regression-coverage-exceptions.json";

function buildRegressionManifest({ entries, policy, readSource = readFileSync } = {}) {
  validateUniqueEntryIdentity(entries);
  const regressions = [...entries]
    .map((entry) => Object.freeze({
      area: entry.area,
      assertionCount: countAssertions(readSource(entry.path, "utf8")),
      description: entry.description,
      id: entry.id,
      legacy: Boolean(entry.legacy),
      path: entry.path,
      releaseGate: entry.tier === "release-gate",
      runMode: entry.runMode,
      tags: [...entry.tags],
      tier: entry.tier,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const retiredRegressions = [...(policy.retiredScripts || [])]
    .map((entry) => cloneJson(entry))
    .sort((left, right) => left.script.localeCompare(right.script));
  const assertionMovements = [...(policy.assertionMovements || [])]
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
    regressions,
    retiredRegressions,
  });
}

function serializeRegressionManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function collectRegressionCoverageErrors({ entries, manifest, packageScripts = readPackageScripts(), policy, readSource = readFileSync }) {
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

  for (const retiredEntry of retiredEntries) {
    validateRetirementEntry({ activeIds, activePaths, errors, packageScripts, readSource, retiredEntry });
  }
  for (const movement of assertionMovements) {
    validateAssertionMovement({ activePaths, errors, movement });
  }

  if (Number.isInteger(policy?.maximumActiveScripts) && activeEntries.length > policy.maximumActiveScripts) {
    errors.push(`active regression count ${activeEntries.length} exceeds shrink-only ceiling ${policy.maximumActiveScripts}`);
  }
  const assertionInventory = buildAssertionInventory({ entries: activeEntries, policy, readSource });
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
    errors.push(error.message);
  }

  return errors;
}

function buildRatchetedCoveragePolicy({ entries, policy, readSource = readFileSync }) {
  const nextPolicy = cloneJson(policy);
  const targets = buildCoverageFloorTargets({ entries, policy, readSource });
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
    minimumActiveScripts: targets.coverageFamilies.find((target) => target.id === family.id).minimumActiveScripts,
  }));
  return nextPolicy;
}

function collectCoverageFloorDriftErrors({ entries, policy, readSource = readFileSync }) {
  if (!policy || typeof policy !== "object") {
    return [];
  }
  const targets = buildCoverageFloorTargets({ entries, policy, readSource });
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

function buildCoverageFloorTargets({ entries, policy, readSource = readFileSync }) {
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

function rejectCeilingIncrease(errors, label, current, target) {
  if (Number.isInteger(current) && target > current) {
    errors.push(`${label} would increase from ${current} to ${target}`);
  }
}

function rejectFloorLowering(errors, label, current, target) {
  if (Number.isInteger(current) && target < current) {
    errors.push(`${label} would decrease from ${current} to ${target}`);
  }
}

function reportLag(errors, label, current, target) {
  if (Number.isInteger(current) && current < target) {
    errors.push(
      `${label} lags current discovered coverage (${current} < ${target}); run ${MANIFEST_GENERATOR} --ratchet-floors`,
    );
  } else if (Number.isInteger(current) && current > target) {
    errors.push(`${label} exceeds current effective coverage (${current} > ${target}); coverage was lost or its retirement evidence is incomplete`);
  }
}

function reportCeilingDrift(errors, label, current, target) {
  if (Number.isInteger(current) && current > target) {
    errors.push(
      `${label} is above current discovered coverage (${current} > ${target}); run ${MANIFEST_GENERATOR} --ratchet-floors`,
    );
  } else if (Number.isInteger(current) && current < target) {
    errors.push(`${label} was exceeded by discovered coverage (${current} < ${target}); active entry points may not grow implicitly`);
  }
}

function validateRegressionCoverage({ entries, manifest, policy }) {
  const errors = collectRegressionCoverageErrors({ entries, manifest, policy });
  if (errors.length > 0) {
    throw new Error(`Regression coverage manifest failed:\n- ${errors.join("\n- ")}`);
  }
}

function buildAssertionInventory({ entries, policy, readSource = readFileSync } = {}) {
  const activePaths = new Set(entries.map((entry) => entry.path));
  const active = entries
    .map((entry) => ({
      id: entry.id,
      path: entry.path,
      assertionCount: countAssertions(readSource(entry.path, "utf8")),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const vitestPaths = new Set();
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
      else if (!activePaths.has(ownerPath)) directOwnerPaths.add(ownerPath);
    }
  }
  const vitest = buildExternalAssertionEntries(vitestPaths, readSource);
  const directOwners = buildExternalAssertionEntries(directOwnerPaths, readSource);
  const creditedAssertionReduction = (policy?.retiredScripts || [])
    .filter((entry) => entry?.floorCredit === true)
    .reduce((total, entry) => total + (entry?.assertionInventory?.creditedAssertionReduction || 0), 0);
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
      + creditedAssertionReduction,
    vitest,
    vitestAssertionCount,
  });
}

function buildExternalAssertionEntries(paths, readSource) {
  return [...paths]
    .filter((filePath) => existsSync(filePath))
    .map((filePath) => ({ path: filePath, assertionCount: countAssertions(readSource(filePath, "utf8")) }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function countAssertions(source) {
  const matches = String(source || "").match(/\b(?:assert(?:\.[A-Za-z][A-Za-z0-9]*)?|expect)\s*\(/g);
  return matches?.length || 0;
}

function sumAssertions(entries) {
  return entries.reduce((total, entry) => total + entry.assertionCount, 0);
}

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
}

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

function vitestRunsInCheckFast(packageScripts) {
  const checkFast = String(packageScripts?.["check:fast"] || "");
  const unitIndex = checkFast.indexOf("npm run test:unit");
  const regressionIndex = checkFast.search(/npm run (?:test:regressions|check)(?:\s|$)/);
  return unitIndex >= 0 && (regressionIndex < 0 || unitIndex < regressionIndex);
}

function readPackageScripts() {
  return JSON.parse(readFileSync("package.json", "utf8")).scripts || {};
}

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

function validateRequiredReleaseGates({ activeIds, errors, policy }) {
  for (const id of policy?.requiredReleaseGateIds || []) {
    if (!activeIds.has(id)) {
      errors.push(`required release-gate behavior owner ${id} is missing`);
    }
  }
}

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

function retirementTags(entry) {
  if (Array.isArray(entry.tags)) {
    return entry.tags;
  }
  return /-closeout-regression\.mjs$/.test(entry.script || "") ? ["closeout"] : [];
}

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

function validateUniqueValues(errors, label, values) {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length > 0) {
    errors.push(`${label} contains duplicates: ${[...new Set(duplicates)].join(", ")}`);
  }
}

function countBy(values, getKey) {
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
  collectCoverageFloorDriftErrors,
  collectRegressionCoverageErrors,
  countAssertions,
  serializeRegressionManifest,
  validateRegressionCoverage,
};
