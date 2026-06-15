import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  resolveModuleDefinitionTerminology,
} from "../src/core/modules/terminology.js";

const moduleContract = readText("docs/module-contract.md");
const surfaceContract = readText("docs/ui-surface-contract.md");

const moduleDefinition = {
  id: "lists",
  name: "Lists",
  displayName: "Lists",
  description: "List work.",
  category: "core-workflow",
  version: "0.0.0",
  enabledByDefault: true,
  terminology: {
    default: {
      label: "Lists",
      singular: "List",
      plural: "Lists",
      createButton: "Create List",
      description: "Reusable list work.",
    },
    business: {
      label: "Procurement Lists",
      singular: "Procurement List",
      plural: "Procurement Lists",
      createButton: "Create Procurement List",
      description: "Procurement-ready list work.",
    },
    personal: {
      label: "Shopping Lists",
      singular: "Shopping List",
      plural: "Shopping Lists",
      createButton: "Create Shopping List",
    },
    family: {
      createButton: "Create Family Shopping List",
    },
  },
  viewSurfaces: [
    {
      id: "lists-workspace",
      moduleId: "lists",
      viewId: "lists",
      layout: "split-list-detail",
      pageHeader: {
        title: "Lists",
        titleKey: "plural",
        description: "Manage list work.",
        descriptionKey: "description",
        primaryAction: {
          id: "create-list",
          label: "Create List",
          labelKey: "createButtonLabel",
          role: "primary",
          behavior: "lists.create",
        },
      },
      table: {
        columns: [
          {
            field: "title",
            label: "List",
            labelKey: "singular",
          },
          {
            field: "status",
            label: "Status",
          },
        ],
      },
      dataSource: {
        route: "/api/lists",
        fieldBindings: {
          id: "list_id",
          title: "title",
        },
      },
      actions: [
        {
          id: "open-list",
          label: "Open",
          labelKey: "missingTerm",
          role: "secondary",
          behavior: "lists.open",
        },
      ],
    },
  ],
};

const business = resolveModuleDefinitionTerminology(moduleDefinition, "business");
assert.equal(business.viewSurfaces[0].pageHeader.title, "Procurement Lists", "Business descriptor titles should resolve through terminology keys");
assert.equal(business.viewSurfaces[0].pageHeader.description, "Procurement-ready list work.", "Business descriptor descriptions should resolve through terminology keys");
assert.equal(business.viewSurfaces[0].pageHeader.primaryAction.label, "Create Procurement List", "Nested descriptor action labels should resolve through terminology keys");
assert.equal(business.viewSurfaces[0].table.columns[0].label, "Procurement List", "Nested table column labels should resolve through terminology keys");
assert.equal(business.viewSurfaces[0].table.columns[1].label, "Status", "Literal labels should remain when no key is provided");
assert.equal(business.viewSurfaces[0].actions[0].label, "Open", "Literal labels should remain when a key is missing");

const family = resolveModuleDefinitionTerminology(moduleDefinition, "family");
assert.equal(family.viewSurfaces[0].pageHeader.title, "Shopping Lists", "Family descriptors should inherit personal terminology before family overrides");
assert.equal(family.viewSurfaces[0].pageHeader.primaryAction.label, "Create Family Shopping List", "Family descriptor labels should apply family overrides");

const unknownWorkspace = resolveModuleDefinitionTerminology(moduleDefinition, "unknown");
assert.equal(unknownWorkspace.viewSurfaces[0].pageHeader.title, "Lists", "Unknown workspace types should fall back to default descriptor terminology");

assert.match(moduleContract, /`viewSurfaces` is the declarative manifest field for framework-rendered protected views/, "Module contract should document the declarative descriptor field");
assert.match(moduleContract, /`labelKey`, `titleKey`, and `descriptionKey` reference the resolved module terminology/, "Module contract should document descriptor terminology keys");
assert.match(moduleContract, /If a key resolves, it replaces the matching literal field for display; if a key is missing, the literal field remains/, "Module contract should document literal fallback behavior");
assert.match(moduleContract, /Data fetching, behavior registration, and Lists conversion remain scheduled for later 0\.33\.5\.16 slices/, "Module contract should keep live behavior out of the terminology slice");
assert.match(surfaceContract, /Declarative `viewSurfaces` descriptors are the manifest form of the same ownership boundary/, "Surface contract should document declarative descriptor ownership");
assert.match(surfaceContract, /Terminology changes display text only; surface IDs, module IDs, view IDs, routes, permission IDs, data bindings, behavior IDs, and workflow rules remain stable/, "Surface contract should keep terminology display-only");

console.log("View descriptor terminology regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
