const RETIREMENT_TYPES = new Set(["assertions-moved", "dead-target"]);

function validateRegressionCoverageManifest({ manifest, scripts }) {
  const errors = collectRegressionCoverageErrors({ manifest, scripts });

  if (errors.length > 0) {
    throw new Error(`Regression coverage manifest failed:\n- ${errors.join("\n- ")}`);
  }
}

function collectRegressionCoverageErrors({ manifest, scripts }) {
  const errors = [];
  const currentScripts = Array.isArray(scripts) ? scripts : [];
  const currentScriptSet = new Set(currentScripts);
  const requiredScripts = Array.isArray(manifest?.requiredScripts) ? manifest.requiredScripts : [];
  const retiredScripts = Array.isArray(manifest?.retiredScripts) ? manifest.retiredScripts : [];
  const retiredScriptPaths = new Set(retiredScripts.map((entry) => entry?.script).filter(Boolean));
  const requiredScriptSet = new Set(requiredScripts);

  validateManifestShape({ errors, manifest, requiredScripts, retiredScripts });
  validateUniqueValues(errors, "requiredScripts", requiredScripts);
  validateUniqueValues(errors, "current regression suite", currentScripts);

  for (const retiredEntry of retiredScripts) {
    validateRetirementEntry({
      currentScriptSet,
      errors,
      requiredScriptSet,
      retiredEntry,
    });
  }

  for (const script of requiredScripts) {
    if (retiredScriptPaths.has(script)) {
      continue;
    }

    if (!currentScriptSet.has(script)) {
      errors.push(`${script} is required by the coverage manifest but is not registered in the suite`);
    }
  }

  for (const script of retiredScriptPaths) {
    if (currentScriptSet.has(script)) {
      errors.push(`${script} has a retirement entry but is still registered in the suite`);
    }
  }

  const expectedRegisteredFloor = Math.max(0, manifest.minimumRegisteredScripts - retiredScriptPaths.size);

  if (currentScripts.length < expectedRegisteredFloor) {
    errors.push(
      `registered script count ${currentScripts.length} is below manifest floor ${expectedRegisteredFloor}`,
    );
  }

  validateCoverageFamilies({
    currentScriptSet,
    currentScripts,
    errors,
    manifest,
    retiredScriptPaths,
  });

  return errors;
}

function validateManifestShape({ errors, manifest, requiredScripts, retiredScripts }) {
  if (!manifest || typeof manifest !== "object") {
    errors.push("manifest should be an object");
    return;
  }

  if (manifest.schemaVersion !== 1) {
    errors.push("manifest schemaVersion should be 1");
  }

  if (!isNonEmptyString(manifest.recordedAtVersion)) {
    errors.push("manifest recordedAtVersion should be a non-empty string");
  }

  if (!Number.isInteger(manifest.minimumRegisteredScripts) || manifest.minimumRegisteredScripts < 1) {
    errors.push("manifest minimumRegisteredScripts should be a positive integer");
  }

  if (!Number.isInteger(manifest.minimumCloseoutScripts) || manifest.minimumCloseoutScripts < 0) {
    errors.push("manifest minimumCloseoutScripts should be a non-negative integer");
  }

  if (requiredScripts.length === 0) {
    errors.push("manifest requiredScripts should list retained regression scripts");
  }

  if (!Array.isArray(retiredScripts)) {
    errors.push("manifest retiredScripts should be an array");
  }
}

function validateRetirementEntry({ currentScriptSet, errors, requiredScriptSet, retiredEntry }) {
  if (!retiredEntry || typeof retiredEntry !== "object") {
    errors.push("retirement entry should be an object");
    return;
  }

  if (!isNonEmptyString(retiredEntry.script)) {
    errors.push("retirement entry should name script");
    return;
  }

  if (!requiredScriptSet.has(retiredEntry.script)) {
    errors.push(`${retiredEntry.script} retirement entry should refer to a script in requiredScripts`);
  }

  if (!isNonEmptyString(retiredEntry.retiredInVersion)) {
    errors.push(`${retiredEntry.script} retirement entry should include retiredInVersion`);
  }

  if (!RETIREMENT_TYPES.has(retiredEntry.retirementType)) {
    errors.push(
      `${retiredEntry.script} retirement entry should use retirementType assertions-moved or dead-target`,
    );
  }

  if (!isNonEmptyString(retiredEntry.rationale)) {
    errors.push(`${retiredEntry.script} retirement entry should include rationale`);
  }

  if (!isNonEmptyString(retiredEntry.assertionDisposition)) {
    errors.push(`${retiredEntry.script} retirement entry should include assertionDisposition`);
  }

  if (!Array.isArray(retiredEntry.retainedCoverageOwners) || retiredEntry.retainedCoverageOwners.length === 0) {
    errors.push(`${retiredEntry.script} retirement entry should include retainedCoverageOwners`);
  } else {
    for (const owner of retiredEntry.retainedCoverageOwners) {
      if (!isNonEmptyString(owner)) {
        errors.push(`${retiredEntry.script} retainedCoverageOwners should contain non-empty strings`);
      } else if (owner.startsWith("scripts/") && !currentScriptSet.has(owner)) {
        errors.push(`${retiredEntry.script} retained coverage owner ${owner} should be registered`);
      }
    }
  }

  if (!Array.isArray(retiredEntry.verificationPerformed) || retiredEntry.verificationPerformed.length === 0) {
    errors.push(`${retiredEntry.script} retirement entry should include verificationPerformed`);
  } else if (!retiredEntry.verificationPerformed.every(isNonEmptyString)) {
    errors.push(`${retiredEntry.script} verificationPerformed should contain non-empty strings`);
  }
}

function validateCoverageFamilies({ currentScriptSet, currentScripts, errors, manifest, retiredScriptPaths }) {
  const currentCloseoutCount = currentScripts.filter(isCloseoutRegressionScript).length;
  const retiredCloseoutCount = [...retiredScriptPaths].filter(isCloseoutRegressionScript).length;
  const expectedCloseoutFloor = Math.max(0, manifest.minimumCloseoutScripts - retiredCloseoutCount);

  if (currentCloseoutCount < expectedCloseoutFloor) {
    errors.push(`closeout script count ${currentCloseoutCount} is below manifest floor ${expectedCloseoutFloor}`);
  }

  const families = Array.isArray(manifest.coverageFamilies) ? manifest.coverageFamilies : [];

  for (const family of families) {
    if (!family || typeof family !== "object") {
      errors.push("coverage family entry should be an object");
      continue;
    }

    if (!isNonEmptyString(family.id)) {
      errors.push("coverage family entry should include id");
    }

    if (!Number.isInteger(family.minimumScripts) || family.minimumScripts < 0) {
      errors.push(`${family.id || "coverage family"} should include a non-negative minimumScripts value`);
    }

    const requiredFamilyScripts = Array.isArray(family.requiredScripts) ? family.requiredScripts : [];
    const retiredFamilyCount = requiredFamilyScripts.filter((script) => retiredScriptPaths.has(script)).length;
    const activeFamilyScripts = requiredFamilyScripts.filter((script) => !retiredScriptPaths.has(script));

    for (const script of activeFamilyScripts) {
      if (!currentScriptSet.has(script)) {
        errors.push(`${script} is required by coverage family ${family.id || "unknown"} but is not registered`);
      }
    }

    const minimumFamilyScripts = Math.max(0, family.minimumScripts - retiredFamilyCount);
    const currentFamilyCount = requiredFamilyScripts.filter((script) => currentScriptSet.has(script)).length;

    if (currentFamilyCount < minimumFamilyScripts) {
      errors.push(
        `${family.id || "coverage family"} has ${currentFamilyCount} registered scripts below floor ${minimumFamilyScripts}`,
      );
    }
  }
}

function validateUniqueValues(errors, label, values) {
  const seen = new Set();
  const duplicates = new Set();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }

  if (duplicates.size > 0) {
    errors.push(`${label} contains duplicates: ${[...duplicates].join(", ")}`);
  }
}

function isCloseoutRegressionScript(script) {
  return /-closeout-regression\.mjs$/.test(script);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export {
  collectRegressionCoverageErrors,
  isCloseoutRegressionScript,
  validateRegressionCoverageManifest,
};
