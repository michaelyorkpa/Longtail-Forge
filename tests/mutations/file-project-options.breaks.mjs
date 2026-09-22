import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Run explicitly, with no server or other verification reading this source concurrently.
//
// **Aimed at `file-project-option-contracts.test.mjs`.** `0.33.33.43.10` closed 16 diagnostics and
// changed **no executable line at all** - the whole checkpoint is annotation plus two local `@type`
// declarations. So the table attacks two things: the flattener's behaviour, which the annotations
// describe, and the decisions the checkpoint is really made of - reusing a published vocabulary
// instead of redeclaring it, and recording the two consumers it left alone.
//
// Anchors stay inside the function under attack, per the lesson `0.33.33.43.7` paid for.

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the flattener's behaviour ----------------------------------------------------------------------
  ["a workspace-scope option keeps a client id",
    '          clientId: client.isWorkspaceScope ? "" : client.id,',
    "          clientId: client.id,"],
  ["every option loses its client id",
    '          clientId: client.isWorkspaceScope ? "" : client.id,',
    '          clientId: "",'],
  ["a project with no id is offered anyway",
    "        if (!project?.id) {\n          return;\n        }",
    "        if (false) {\n          return;\n        }"],
  // Answers a wrong *value* rather than throwing: spreading a non-iterable crashes the suite, which
  // the runner reports as INCIDENTAL-ERROR and does not count as caught.
  ["a client with no project list yields a phantom project",
    "      (Array.isArray(client.projects) ? client.projects : []).forEach((project) => {",
    '      (Array.isArray(client.projects) ? client.projects : [{ id: "phantom" }]).forEach((project) => {'],
  ["the composed label drops its client prefix",
    '          label: clientLabel ? `${clientLabel} / ${project.optionLabel || project.name || "Untitled Project"}` : project.optionLabel || project.name || "Untitled Project",',
    '          label: project.optionLabel || project.name || "Untitled Project",'],
  ["a nameless project is labelled empty rather than named",
    '          projectLabel: project.optionLabel || project.name || "Untitled Project",',
    "          projectLabel: project.optionLabel || project.name || \"\","],
  ["the project label stops preferring the shared option label",
    '          projectLabel: project.optionLabel || project.name || "Untitled Project",',
    '          projectLabel: project.name || project.optionLabel || "Untitled Project",'],
  ["the shared label helper stops being consulted for a client",
    "      const clientLabel = requireNamespace().clientProjectOptions?.optionLabel?.(client)\n        || client.displayName",
    "      const clientLabel = client.displayName"],

  // --- the decisions the checkpoint is made of ----------------------------------------------------------
  ["the published normaliser output is replaced by a local shape",
    '   * @param {import("../../src/types/browser-contracts.js").NormalizedClientOption[]} clients',
    "   * @param {{ id?: string, displayName?: string, projects?: unknown }[]} clients"],
  ["the page names an option record the shared surface reserves",
    "   * @typedef {{ id: string, clientId: string, label: string, projectLabel: string }} FileProjectOption",
    "   * @typedef {{ id: string, clientId: string, label: string, projectLabel: string }} FileProjectOption\n"
      + "   * @typedef {{ id: string, projects: unknown[] }} NormalizedClientOption"],
  ["the flattened option stops claiming its members are built",
    "   * **Every member is proved**, because this page constructs all four: the id comes from a project",
    "   * The members are whatever arrived: the id comes from a project"],
  ["the page state stops carrying the flattened option",
    "    /** @type {FileProjectOption[]} */\n    projects: [],",
    "    projects: [],"],
  ["the reason the two consumers are untyped disappears",
    "  // Deliberately left untyped by `0.33.33.43.10`. Both this and `hydrateContextSelect` read a",
    "  // Both this and `hydrateContextSelect` read a"],
];

runMutationCampaign({
  sourcePath: "public/js/files.js",
  suites: ["tests/unit/file-project-option-contracts.test.mjs"],
  cases: cases.map(([name, find, replace]) => ({ name, find, replace })),
  suiteTimeoutMs: 60000,
});
