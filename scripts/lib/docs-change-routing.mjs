import { readFileSync } from "node:fs";
import path from "node:path";
import {
  collectChangedPaths,
  normalizeChangedPath,
} from "./regression-change-routing.mjs";

const DOCS_OWNERSHIP_INDEX = "docs/docs-ownership.json";
const DOCS_UPDATED_PREFIX = "Docs updated:";
const NO_DOCS_CHANGE_PREFIX = "No docs change needed:";

function loadDocsOwnershipIndex({ cwd = process.cwd(), indexPath = DOCS_OWNERSHIP_INDEX } = {}) {
  const index = JSON.parse(readFileSync(path.resolve(cwd, indexPath), "utf8"));
  return validateDocsOwnershipIndex(index);
}

function validateDocsOwnershipIndex(index) {
  if (index?.schemaVersion !== 1 || !Array.isArray(index.areas)) {
    throw new Error("Documentation ownership index must use schemaVersion 1 and define areas.");
  }
  if (
    index.noteConvention?.docsUpdated !== "Docs updated: <comma-separated paths>." ||
    index.noteConvention?.noDocsChangeNeeded !== "No docs change needed: <short reason>."
  ) {
    throw new Error("Documentation ownership index must publish both closeout note conventions.");
  }

  const ids = new Set();
  const areas = index.areas.map((area, areaIndex) => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(area?.id || "")) {
      throw new Error(`Documentation ownership area ${areaIndex + 1} needs a stable kebab-case id.`);
    }
    if (ids.has(area.id)) {
      throw new Error(`Documentation ownership index contains duplicate area ${area.id}.`);
    }
    ids.add(area.id);

    if (typeof area.label !== "string" || !area.label.trim()) {
      throw new Error(`Documentation ownership area ${area.id} needs a readable label.`);
    }
    if (!Array.isArray(area.sourcePatterns) || area.sourcePatterns.length === 0) {
      throw new Error(`Documentation ownership area ${area.id} needs source patterns.`);
    }
    if (!Array.isArray(area.docs) || area.docs.length === 0) {
      throw new Error(`Documentation ownership area ${area.id} needs likely documentation paths.`);
    }

    const sourcePatterns = area.sourcePatterns.map((pattern) => {
      if (typeof pattern !== "string" || !pattern.trim()) {
        throw new Error(`Documentation ownership area ${area.id} contains an empty source pattern.`);
      }
      try {
        return Object.freeze({ expression: pattern, matcher: new RegExp(pattern) });
      } catch (error) {
        throw new Error(`Documentation ownership area ${area.id} has invalid pattern ${pattern}: ${error.message}`);
      }
    });
    const docs = [...new Set(area.docs.map(normalizeChangedPath).filter(Boolean))];
    if (docs.length !== area.docs.length || docs.some((docPath) => !isDocumentationPath(docPath))) {
      throw new Error(`Documentation ownership area ${area.id} must list unique documentation paths.`);
    }
    if (docs.join("\n") !== [...docs].sort().join("\n")) {
      throw new Error(`Documentation ownership area ${area.id} documentation paths must be sorted.`);
    }

    return Object.freeze({
      docs: Object.freeze(docs),
      id: area.id,
      label: area.label.trim(),
      sourcePatterns: Object.freeze(sourcePatterns),
    });
  });

  return Object.freeze({
    areas: Object.freeze(areas),
    noteConvention: Object.freeze({ ...index.noteConvention }),
    schemaVersion: index.schemaVersion,
  });
}

function suggestDocsForPaths(filePaths = [], { index, note = "" } = {}) {
  const ownership = index ? validateDocsOwnershipIndex(index) : loadDocsOwnershipIndex();
  const paths = [...new Set(filePaths.map(normalizeChangedPath).filter(Boolean))].sort();
  const changedPathSet = new Set(paths);
  const matchedAreas = [];
  const suggestedDocs = new Set();

  for (const area of ownership.areas) {
    const matchingPaths = paths.filter((filePath) => (
      area.sourcePatterns.some(({ matcher }) => matcher.test(filePath))
    ));
    if (matchingPaths.length === 0) {
      continue;
    }
    matchedAreas.push(Object.freeze({
      docs: area.docs,
      id: area.id,
      label: area.label,
      matchingPaths: Object.freeze(matchingPaths),
    }));
    area.docs.forEach((docPath) => suggestedDocs.add(docPath));
  }

  const docs = [...suggestedDocs].sort();
  const changedOwningDocs = docs.filter((docPath) => changedPathSet.has(docPath));
  const parsedNote = parseDocsChangeNote(note);
  const missingDocsAreas = matchedAreas.filter((area) => (
    area.matchingPaths.some((filePath) => !isDocumentationPath(filePath)) &&
    !area.docs.some((docPath) => changedPathSet.has(docPath))
  ));
  const warningAreas = parsedNote?.kind === "no-doc-change" ? [] : missingDocsAreas;
  const warnings = warningAreas.map((area) => (
    `${area.label} source changed without a likely owning doc change or an explicit "${NO_DOCS_CHANGE_PREFIX}" note.`
  ));

  if (note.trim() && !parsedNote) {
    warnings.unshift(`Documentation note must start with "${DOCS_UPDATED_PREFIX}" or "${NO_DOCS_CHANGE_PREFIX}" and include details.`);
  }

  return Object.freeze({
    changedOwningDocs: Object.freeze(changedOwningDocs),
    docs: Object.freeze(docs),
    matchedAreas: Object.freeze(matchedAreas),
    missingDocsAreas: Object.freeze(missingDocsAreas),
    note: parsedNote,
    paths: Object.freeze(paths),
    warningOnly: true,
    warnings: Object.freeze(warnings),
  });
}

function parseDocsChangeNote(note) {
  const value = String(note || "").trim();
  for (const [prefix, kind] of [
    [DOCS_UPDATED_PREFIX, "docs-updated"],
    [NO_DOCS_CHANGE_PREFIX, "no-doc-change"],
  ]) {
    if (value.startsWith(prefix) && value.slice(prefix.length).trim()) {
      return Object.freeze({ kind, value });
    }
  }
  return null;
}

function formatDocsSuggestion(result, { check = false } = {}) {
  const lines = [
    "Documentation ownership review",
    `Changed files inspected: ${result.paths.length}`,
  ];

  if (result.matchedAreas.length === 0) {
    lines.push("Matched areas: none", "Likely docs to review: none", "Status: no mapped source areas; no documentation warning.");
  } else {
    lines.push("Matched areas:");
    result.matchedAreas.forEach((area) => lines.push(`- ${area.label} (${area.id})`));
    lines.push("Likely docs to review:");
    result.docs.forEach((docPath) => lines.push(`- ${docPath}`));
    lines.push("Owning docs already changed:");
    if (result.changedOwningDocs.length === 0) {
      lines.push("- none");
    } else {
      result.changedOwningDocs.forEach((docPath) => lines.push(`- ${docPath}`));
    }
  }

  if (result.warnings.length > 0) {
    lines.push("Warnings (warning-only):");
    result.warnings.forEach((warning) => lines.push(`- ${warning}`));
  } else if (result.note) {
    lines.push(`Closeout note: ${result.note.value}`);
  } else if (result.matchedAreas.length > 0) {
    lines.push("Status: likely owning documentation changed; review the suggestions before closeout.");
  }

  if (result.matchedAreas.length > 0 && !result.note) {
    lines.push(
      "Closeout note convention:",
      `- ${DOCS_UPDATED_PREFIX} <comma-separated paths>.`,
      `- ${NO_DOCS_CHANGE_PREFIX} <short reason>.`,
    );
  }
  if (check) {
    lines.push("Documentation gate mode: warning-only.");
  }
  return lines.join("\n");
}

function isDocumentationPath(filePath) {
  const normalized = normalizeChangedPath(filePath);
  return /(?:^|\/)README\.md$/i.test(normalized) ||
    /\.md$/i.test(normalized) ||
    normalized === DOCS_OWNERSHIP_INDEX;
}

export {
  DOCS_OWNERSHIP_INDEX,
  DOCS_UPDATED_PREFIX,
  NO_DOCS_CHANGE_PREFIX,
  collectChangedPaths,
  formatDocsSuggestion,
  isDocumentationPath,
  loadDocsOwnershipIndex,
  parseDocsChangeNote,
  suggestDocsForPaths,
  validateDocsOwnershipIndex,
};
