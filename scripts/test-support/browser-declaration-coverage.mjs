import fs from "node:fs";
import path from "node:path";

import { collectBrowserPublicationInventory } from "./browser-publication-inventory.mjs";
import { NAMESPACE } from "./browser-namespace-resolver.mjs";
import { declaredNamespaceMembers } from "./browser-diagnostic-classification.mjs";

/**
 * How runtime publication and the browser declaration relate, derived from the tree.
 *
 * **Nothing related them before `0.33.33.38.2.4.3`.** The publication inventory enforced that
 * the namespace root is never clobbered, that no rooted write is unnameable, that nothing
 * writes below a published surface, and that every multi-writer surface has a record - but it
 * never asked whether a published surface is *declared*. That is how 33 members came to be
 * published with no contract while every check stayed green, and why 49 members could drift
 * out of the declaration across four checkpoints without anything noticing.
 *
 * **The four invariants this supports are deliberately separate**, because they fail for
 * different reasons and a reviewer must be able to tell which one broke:
 *
 * - a published surface with no declaration and no recorded disposition;
 * - a declared member with no runtime writer that is not marked type-only;
 * - a surface with more than one writer that is not a recorded multi-writer surface;
 * - a rooted write that cannot be resolved to a name.
 *
 * **The counting vocabulary is part of the contract.** A unique publication surface is not a
 * publication occurrence, and neither is a known `LongtailForge` member: today the estate is
 * **65 unique surfaces across 68 publication occurrences**, of which **63 are namespace
 * members** and two are bare globals. Reporting any of those numbers as another is how the
 * earlier reconciliation went wrong, so every field here is named for exactly what it counts.
 *
 * **This is structural and does not depend on there being a diagnostic anywhere.** It reads
 * the AST inventory and the declaration text; if the browser program reached zero diagnostics
 * tomorrow, every invariant here would still hold and still be enforceable.
 *
 * **Additive publication and writer multiplicity are independent properties**, and
 * `0.33.33.38.2.4.4` keeps them apart on purpose. A surface may have one writer or several,
 * and may replace or preserve what it finds, in any combination. `MULTI_WRITER_RECORDS`
 * answers how many writers are permitted and why; it does not answer why a writer preserves
 * an existing surface, and extending it until it means both would lose the distinction.
 *
 * @typedef {object} AdditivePublication
 * @property {string} surface the surface published additively
 * @property {string} writer the file whose publication spreads the existing value
 *
 * @typedef {object} SurfaceWriters
 * @property {string} surface fully qualified, e.g. `window.LongtailForge.icons`
 * @property {string[]} writers repository-relative files that publish it
 *
 * @typedef {object} DeclarationCoverage
 * @property {number} uniqueSurfaces distinct published surfaces
 * @property {number} publicationOccurrences writer-surface pairs, always >= uniqueSurfaces
 * @property {string[]} knownMembers every `LongtailForge` member, declared or published
 * @property {string[]} declaredMembers members the live declaration names
 * @property {string[]} publishedMembers members with at least one runtime writer
 * @property {string[]} undeclaredPublishedMembers published, with no declaration
 * @property {string[]} declaredMembersWithoutWriter declared, with no runtime writer
 * @property {SurfaceWriters[]} multiWriterSurfaces surfaces with more than one writer
 * @property {SurfaceWriters[]} unwrittenSurfaces surfaces recorded with no writer at all
 * @property {AdditivePublication[]} additivePublications writers that preserve the existing surface
 * @property {string[]} assertedPublications publications whose value is a cast rather than a
 *   checked expression, so the writer is not checked against its declaration
 * @property {string[]} unresolvableRootedWrites rooted writes that cannot be named
 * @property {string[]} writesBelowSurfaces writes reaching into an already-published surface
 * @property {string[]} clobberingRootWrites root writes that do not derive from the namespace
 */

/**
 * Derive the publication/declaration relationship for one tree.
 *
 * @param {object} [options]
 * @param {string} [options.root]
 * @param {string} [options.configFile]
 * @param {string} [options.scanDirectory]
 * @param {string} [options.declarationFile]
 * @returns {DeclarationCoverage}
 */
export function collectDeclarationCoverage({
  root = process.cwd(),
  configFile = "tsconfig.public.json",
  scanDirectory = "public/js",
  declarationFile = "src/types/browser-contracts.d.ts",
} = {}) {
  const inventory = collectBrowserPublicationInventory({ root, configFile, scanDirectory });
  const declared = declaredNamespaceMembers(fs.readFileSync(path.join(root, declarationFile), "utf8"));

  const memberPrefix = `window.${NAMESPACE}.`;
  /** @type {Map<string, string[]>} */
  const publishedMembers = new Map();
  /** @type {SurfaceWriters[]} */
  const multiWriterSurfaces = [];
  /** @type {SurfaceWriters[]} */
  const unwrittenSurfaces = [];
  /** @type {AdditivePublication[]} */
  const additivePublications = [];
  /** @type {string[]} */
  const assertedPublications = [];
  let publicationOccurrences = 0;

  for (const [surface, entry] of [...inventory.surfaces].sort(([left], [right]) => left.localeCompare(right))) {
    const writers = entry.writers.map((writer) => writer.file).sort();
    publicationOccurrences += writers.length;
    if (writers.length === 0) unwrittenSurfaces.push({ surface, writers });
    if (writers.length > 1) multiWriterSurfaces.push({ surface, writers });
    for (const writer of [...entry.writers].sort((left, right) => left.file.localeCompare(right.file))) {
      if (writer.preservesExisting) additivePublications.push({ surface, writer: writer.file });
      if (writer.assertedValue) assertedPublications.push(`${writer.file}:${writer.line}: ${surface}`);
    }
    if (surface.startsWith(memberPrefix)) publishedMembers.set(surface.slice(memberPrefix.length), writers);
  }

  const known = new Set([...declared, ...publishedMembers.keys()]);

  return {
    uniqueSurfaces: inventory.surfaces.size,
    publicationOccurrences,
    knownMembers: [...known].sort(),
    declaredMembers: [...declared].sort(),
    publishedMembers: [...publishedMembers.keys()].sort(),
    undeclaredPublishedMembers: [...publishedMembers.keys()].filter((member) => !declared.has(member)).sort(),
    declaredMembersWithoutWriter: [...declared].filter((member) => !publishedMembers.has(member)).sort(),
    multiWriterSurfaces,
    unwrittenSurfaces,
    additivePublications,
    assertedPublications: assertedPublications.sort(),
    unresolvableRootedWrites: inventory.unsupportedTargets
      .map((entry) => `${entry.file}:${entry.line}: ${entry.target}`).sort(),
    writesBelowSurfaces: inventory.deepWrites
      .map((entry) => `${entry.file}:${entry.line}: ${entry.target}`).sort(),
    clobberingRootWrites: inventory.namespaceRootWrites
      .filter((entry) => !entry.derivesFromNamespace)
      .map((entry) => `${entry.file}:${entry.line}: ${entry.text}`).sort(),
  };
}
