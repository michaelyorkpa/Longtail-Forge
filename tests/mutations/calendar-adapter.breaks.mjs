import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Run explicitly, with no server or other verification reading this source concurrently.
//
// **Scoped to what this checkpoint changed at runtime**, which is a short list: the cached-element
// refusal, the five points that now read through it, and the two shapes this file names for itself.
// Twenty-eight of the thirty-three diagnostics were cleared by annotations, and an annotation is
// proved by the compiler - mutating one either fails the typecheck or changes nothing a suite can
// see, so this table does not pad itself with cases that could only be inert.

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the refusal itself ------------------------------------------------------------------------
  ["the cached-element refusal stops refusing",
    "    if (value === null) {\n      throw new TypeError(`The calendar requires its ${name}, which the host has not built.`);\n    }",
    "    if (false) {\n      throw new TypeError(\"unreachable\");\n    }"],
  ["the refusal widens from null to any falsy value",
    "    if (value === null) {",
    "    if (!value) {"],
  ["the refusal stops naming which element is missing",
    "throw new TypeError(`The calendar requires its ${name}, which the host has not built.`);",
    'throw new TypeError("The calendar requires an element.");'],
  ["the refusal answers something other than what it was given",
    "    return value;\n  }\n\n  /** @type {ReadonlyArray<",
    "    return null;\n  }\n\n  /** @type {ReadonlyArray<"],

  // --- the flattened project row, which this file now names ---------------------------------------
  ["a project with no id is kept",
    "        if (!project?.id) {\n          continue;\n        }",
    "        if (false) {\n          continue;\n        }"],
  ["a workspace-scope client stamps its own id onto its projects",
    "          clientId: client.isWorkspaceScope ? \"\" : client.id,",
    "          clientId: client.id,"],
  ["a project loses its fallback name",
    '        const projectLabel = project.optionLabel || project.name || "Untitled Project";',
    "        const projectLabel = project.optionLabel || project.name;"],
  ["the published option label stops being preferred",
    "      const clientLabel = window.LongtailForge?.clientProjectOptions?.optionLabel?.(client)\n        || client.displayName",
    "      const clientLabel = client.displayName"],
  ["the composed label drops its client",
    "          label: clientLabel ? `${clientLabel} / ${projectLabel}` : projectLabel,",
    "          label: projectLabel,"],
  ["a client whose projects are not a list is read through anyway",
    "      for (const project of Array.isArray(client.projects) ? client.projects : []) {",
    "      for (const project of client.projects) {"],

  // --- the filter that consumes it -----------------------------------------------------------------
  ["the filter draws itself before it has been built",
    "    if (!calendarProjectFilter) {\n      return;\n    }",
    "    if (false) {\n      return;\n    }"],
  ["the filter stops narrowing to the selected client",
    "    const projects = selectedClientId\n      ? calendarState.projects.filter((project) => project.clientId === selectedClientId)\n      : calendarState.projects;",
    "    const projects = calendarState.projects;"],
  ["client scope leaks into a personal workspace",
    '    const selectedClientId = calendarState.workspaceType === "business" ? calendarClientFilter?.value || "" : "";',
    '    const selectedClientId = calendarClientFilter?.value || "";'],
  ["the narrowed list shows the full label instead of the project label",
    "selectedClientId ? project.projectLabel : project.label",
    "project.label"],
  ["the unnarrowed list shows the project label instead of the full label",
    "selectedClientId ? project.projectLabel : project.label",
    "project.projectLabel"],
  ["the filter loses its all-projects entry",
    '      createCalendarOption("", "All projects"),',
    ""],
  ["a surviving selection is discarded",
    "    calendarProjectFilter.value = projects.some((project) => project.id === previousValue) ? previousValue : \"\";",
    '    calendarProjectFilter.value = "";'],
  ["a selection that no longer exists is kept",
    "projects.some((project) => project.id === previousValue) ? previousValue : \"\"",
    "previousValue"],

  // --- the status message -------------------------------------------------------------------------
  ["the status message draws before it has been built",
    "    if (!calendarStatus) {\n      return;\n    }",
    "    if (false) {\n      return;\n    }"],
  ["the status message stops hiding itself when empty",
    "    calendarStatus.hidden = !message;",
    "    calendarStatus.hidden = false;"],
  ["an error is announced as an ordinary message",
    '    calendarStatus.setAttribute("role", options.isError ? "alert" : "status");',
    '    calendarStatus.setAttribute("role", "status");'],
  ["an error stops being announced assertively",
    '    calendarStatus.setAttribute("aria-live", options.isError ? "assertive" : "polite");',
    '    calendarStatus.setAttribute("aria-live", "polite");'],
  ["an error loses its tone",
    '    calendarStatus.dataset.viewTone = options.isError ? "danger" : "info";',
    '    calendarStatus.dataset.viewTone = "info";'],

  // --- the handler reads, which are the reason the refusal exists ------------------------------------
  ["a filter handler captures its control instead of reading it at event time",
    '      calendarState.projectId = requireCalendarElement(calendarProjectFilter, "project filter").value;\n      loadCalendarWindow();\n    });\n    calendarStatusFilter',
    '      calendarState.projectId = calendarProjectFilter?.value;\n      loadCalendarWindow();\n    });\n    calendarStatusFilter'],
];

runMutationCampaign({
  sourcePath: "public/js/calendar.js",
  suites: ["tests/unit/calendar-adapter-contracts.test.mjs"],
  cases: cases.map(([name, find, replace]) => ({ name, find, replace })),
  suiteTimeoutMs: 60000,
});
