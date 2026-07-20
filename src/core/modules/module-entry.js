// @ts-check
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateModuleManifests } from "./manifest-contract.js";

const ENTRY_FIELDS = new Set(["manifest", "activateApp", "activateWorker"]);
const modulesDirectory = fileURLToPath(new URL("../../modules/", import.meta.url));

/**
 * Define the one canonical export consumed by the generated bundled catalog.
 * Declaration is intentionally side-effect free; activation runs only after
 * the complete manifest graph has passed validation.
 *
 * @param {{
 *   manifest: import("../../types/framework-contracts.js").ModuleManifest,
 *   activateApp?: (context: import("../../types/framework-contracts.js").ModuleActivationContext) => unknown,
 *   activateWorker?: (context: import("../../types/framework-contracts.js").ModuleActivationContext) => unknown,
 * }} definition
 * @returns {Readonly<import("../../types/framework-contracts.js").ModuleEntry>}
 */
function createModuleEntry(definition) {
  return Object.freeze({ ...definition });
}

/**
 * @param {readonly { directoryName: string, moduleEntry: unknown }[]} catalog
 * @param {{ verifySourceDirectories?: boolean }} [options]
 * @returns {readonly Readonly<import("../../types/framework-contracts.js").BundledModuleCatalogEntry>[]}
 */
function validateAndOrderBundledModuleCatalog(catalog, options = {}) {
  if (options.verifySourceDirectories !== false) {
    assertCatalogMatchesSourceDirectories(catalog);
  }
  const entries = catalog.map(validateCatalogEntry);
  const manifests = entries.map((entry) => entry.moduleEntry.manifest);
  validateModuleManifests(manifests);

  return Object.freeze(orderByDependencies(entries).map((entry) => Object.freeze(entry)));
}

function validateCatalogEntry(catalogEntry) {
  const directoryName = String(catalogEntry?.directoryName || "").trim();
  const moduleEntry = catalogEntry?.moduleEntry;

  if (!directoryName) {
    throw new Error("Bundled module catalog entry is missing its directory name.");
  }
  if (!isPlainObject(moduleEntry)) {
    throw new Error(`Bundled module '${directoryName}' must export a canonical moduleEntry object.`);
  }
  const unknownFields = Object.keys(moduleEntry).filter((field) => !ENTRY_FIELDS.has(field));
  if (unknownFields.length > 0) {
    throw new Error(`Bundled module '${directoryName}' moduleEntry has unknown fields: ${unknownFields.sort().join(", ")}.`);
  }
  if (!isPlainObject(moduleEntry.manifest)) {
    throw new Error(`Bundled module '${directoryName}' moduleEntry.manifest must be a plain object.`);
  }
  for (const hookName of ["activateApp", "activateWorker"]) {
    if (moduleEntry[hookName] !== undefined && typeof moduleEntry[hookName] !== "function") {
      throw new Error(`Bundled module '${directoryName}' ${hookName} must be a function when provided.`);
    }
  }
  if (moduleEntry.manifest.id !== directoryName) {
    throw new Error(`Bundled module directory '${directoryName}' must match manifest id '${moduleEntry.manifest.id || "<missing>"}'.`);
  }

  return { directoryName, moduleEntry };
}

function assertCatalogMatchesSourceDirectories(catalog) {
  const catalogDirectories = catalog.map((entry) => String(entry?.directoryName || ""));
  const sourceDirectories = fs.readdirSync(modulesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(modulesDirectory, entry.name, "module.js")))
    .map((entry) => entry.name)
    .sort();

  if (JSON.stringify(catalogDirectories) !== JSON.stringify(sourceDirectories)) {
    throw new Error(
      `Bundled module catalog is stale. Expected [${sourceDirectories.join(", ")}], received [${catalogDirectories.join(", ")}]. Run npm run modules:registry:generate.`,
    );
  }
}

function orderByDependencies(entries) {
  const entryById = new Map(entries.map((entry) => [entry.moduleEntry.manifest.id, entry]));
  const remainingDependencies = new Map(entries.map((entry) => [
    entry.moduleEntry.manifest.id,
    new Set(entry.moduleEntry.manifest.moduleDependencies || []),
  ]));
  const ordered = [];

  while (ordered.length < entries.length) {
    const readyIds = [...remainingDependencies.entries()]
      .filter(([, dependencies]) => dependencies.size === 0)
      .map(([moduleId]) => moduleId)
      .sort((left, right) => left.localeCompare(right));

    if (readyIds.length === 0) {
      throw new Error(`Bundled module dependency graph contains a cycle: ${[...remainingDependencies.keys()].sort().join(", ")}.`);
    }

    for (const moduleId of readyIds) {
      ordered.push(entryById.get(moduleId));
      remainingDependencies.delete(moduleId);
      for (const dependencies of remainingDependencies.values()) {
        dependencies.delete(moduleId);
      }
    }
  }

  return ordered;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

export {
  createModuleEntry,
  validateAndOrderBundledModuleCatalog,
};
