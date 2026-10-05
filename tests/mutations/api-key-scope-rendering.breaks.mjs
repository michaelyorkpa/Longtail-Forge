import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Run explicitly, with no server or other verification reading this source concurrently.
//
// **Scoped to what changed, not to the diagnostics.** This checkpoint cleared twenty-six, and
// twenty-one were parameter annotations the compiler proves and a mutation cannot usefully
// attack. What is worth attacking is the scope vocabulary: the `access` member that was being
// dropped, the two literal tables that were read through the prototype, and the readers those
// two corrections feed. The table says so here rather than leaving the absence to be noticed.

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the dropped member, and the two surfaces that depend on it ---------------------------------
  ["the catalogue's access is dropped again",
    "      access: scope.access.trim(),\n",
    ""],
  ["every scope is normalized as read access",
    "      access: scope.access.trim(),",
    '      access: "read",'],
  ["the access label stops distinguishing write",
    '    const accessLabel = scope.access === "write" ? "Write" : "Read";',
    '    const accessLabel = "Read";'],
  ["the access label is inverted",
    '    const accessLabel = scope.access === "write" ? "Write" : "Read";',
    '    const accessLabel = scope.access === "read" ? "Write" : "Read";'],

  // --- the own-key reads, which `?? 10` and `||` did not make safe ---------------------------------
  ["the access table is indexed through the prototype again",
    "    const rank = (access) => (Object.hasOwn(accessOrder, access) ? accessOrder[access] : 10);",
    "    const rank = (access) => (accessOrder[access] ?? 10);"],
  ["every access ranks the same",
    "    const rank = (access) => (Object.hasOwn(accessOrder, access) ? accessOrder[access] : 10);",
    "    const rank = (access) => 10;"],
  ["an unrecognised access ranks first rather than last",
    "Object.hasOwn(accessOrder, access) ? accessOrder[access] : 10",
    "Object.hasOwn(accessOrder, access) ? accessOrder[access] : -1"],
  ["the access order is reversed",
    "    const accessOrder = { read: 0, write: 1, manage: 2, admin: 3 };",
    "    const accessOrder = { read: 3, write: 2, manage: 1, admin: 0 };"],
  ["the comparison is taken the wrong way round",
    "    return (rank(left.access) - rank(right.access))",
    "    return (rank(right.access) - rank(left.access))"],
  ["the owner label table is indexed through the prototype again",
    '    return (Object.hasOwn(ownerLabels, moduleId) ? ownerLabels[moduleId] : "") || moduleId',
    "    return ownerLabels[moduleId] || moduleId"],
  ["the spelled-out owner labels stop being used",
    '    return (Object.hasOwn(ownerLabels, moduleId) ? ownerLabels[moduleId] : "") || moduleId',
    '    return "" || moduleId'],

  // --- the normalizer's own reads -------------------------------------------------------------------
  ["the trimming stops",
    "      access: scope.access.trim(),\n      description: scope.description.trim(),",
    "      access: scope.access,\n      description: scope.description,"],
  ["the scope id loses its published duplicate as a fallback",
    "      id: (scope.id || scope.scope).trim(),",
    "      id: scope.id.trim(),"],
  ["a blank label stops falling back to the scope id",
    "      label: (scope.label || scope.id || scope.scope).trim(),",
    "      label: scope.label.trim(),"],
  ["the owner is lost during normalization",
    "      moduleId: scope.moduleId.trim(),",
    '      moduleId: "",'],
  ["a row naming no scope at all is rendered",
    "    })).filter((scope) => scope.id);",
    "    }));"],

  // --- grouping and the option it builds ---------------------------------------------------------------
  ["a scope naming no owner stops being filed under the framework",
    '      const moduleId = scope.moduleId || "framework";',
    "      const moduleId = scope.moduleId;"],
  ["the groups stop being ordered by label",
    "      .sort((left, right) => left.label.localeCompare(right.label));",
    "      .sort(() => 0);"],
  ["the scopes inside a group stop being ordered",
    "        scopes: group.scopes.sort(compareScopes),",
    "        scopes: group.scopes,"],
  ["the checkbox carries the label rather than the scope id",
    "    checkbox.value = scope.id;",
    "    checkbox.value = scope.label;"],
  ["a described scope stops offering its description",
    "    if (scope.description) {\n      label.title = scope.description;\n    }",
    "    if (false) {\n      label.title = scope.description;\n    }"],
  ["an undescribed scope is given an empty title anyway",
    "    if (scope.description) {",
    "    if (true) {"],

  // --- the row formatters -------------------------------------------------------------------------------
  ["a revoked key is named active",
    '    return status === "revoked" ? "Revoked" : "Active";',
    '    return "Active";'],
  ["an absent timestamp is rendered rather than dropped",
    '    if (!value) {\n      return "";\n    }',
    "    if (false) {\n      return \"\";\n    }"],
];

runMutationCampaign({
  sourcePath: "public/js/api-keys.js",
  suites: ["tests/unit/api-key-scope-rendering.test.mjs", "tests/unit/api-key-contracts.test.mjs"],
  cases: cases.map(([name, find, replace]) => ({ name, find, replace })),
  suiteTimeoutMs: 60000,
});
