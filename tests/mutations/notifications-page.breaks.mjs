import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Run explicitly, with no server or other verification reading this source concurrently.
//
// **Deliberately small.** This checkpoint cleared thirty diagnostics and twenty-eight of them were
// annotations, which the compiler proves and a mutation cannot usefully attack. What is worth
// attacking is the two expressions that actually changed - the pagination coercion and the optional
// target context - plus the readers whose behaviour those annotations now describe. The point of
// this table is to show the new cases bite, not to mirror the annotation count.

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the two expressions this checkpoint changed --------------------------------------------------
  ["the pagination total stops falling back to zero",
    "    total: Number.parseInt(String(pagination.total), 10) || 0,",
    "    total: Number.parseInt(String(pagination.total), 10),"],
  ["the pagination total stops being read as a number at all",
    "Number.parseInt(String(pagination.total), 10) || 0",
    "pagination.total || 0"],
  ["a further page is assumed from any truthy value",
    "    hasMore: pagination.hasMore === true,",
    "    hasMore: Boolean(pagination.hasMore),"],
  ["the optional target context is read through an empty literal again",
    "  const context = notification.target?.context;",
    "  const context = notification.target?.context || {};"],
  ["the context reads stop tolerating an absent bag",
    '  const projectName = String(context?.projectName || "").trim();\n  const clientName = String(context?.clientName || "").trim();',
    '  const projectName = String(context?.projectName).trim();\n  const clientName = String(context?.clientName).trim();'],
  ["the context title stops trimming",
    '  const projectName = String(context?.projectName || "").trim();',
    '  const projectName = String(context?.projectName || "");'],

  // --- the task-only guard the context title depends on ----------------------------------------------
  ["a context title is offered for records that are not tasks",
    '  if (notification.target?.recordType !== "task") {\n    return "";\n  }',
    "  if (false) {\n    return \"\";\n  }"],
  ["the client and project halves are joined in the wrong order",
    "    return [clientName, projectName].filter(Boolean).join(\" / \");",
    "    return [projectName, clientName].filter(Boolean).join(\" / \");"],
  ["an empty half is joined rather than dropped",
    "    return [clientName, projectName].filter(Boolean).join(\" / \");",
    "    return [clientName, projectName].join(\" / \");"],

  // --- grouping and ordering, which the annotations now describe -------------------------------------
  ["an unsupported grouping mode is accepted",
    '  return ["client_project", "notification_type", "record_type"].includes(value) ? value : "client_project";',
    "  return value;"],
  ["the default grouping mode changes",
    '? value : "client_project";',
    '? value : "record_type";'],
  ["ordering mutates the caller's list",
    "  return [...notifications].sort((left, right) => (",
    "  return notifications.sort((left, right) => ("],
  ["a notification can land in more than one group",
    "    group.notifications.push(notification);\n    groups.set(key.id, group);",
    "    group.notifications.push(notification);\n    groups.set(key.id + Math.random(), group);"],
  ["the record-type group loses its fallback",
    '    const label = formatRecordType(notification.target?.recordType || notification.record_type || "notification");',
    "    const label = formatRecordType(notification.target?.recordType);"],

  // --- the small formatters ----------------------------------------------------------------------------
  ["a record type loses its fallback name",
    '  return String(recordType || "notification")',
    "  return String(recordType)"],
  ["an unreadable date is rendered rather than dropped",
    '  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();',
    "  return date.toLocaleString();"],
];

runMutationCampaign({
  sourcePath: "public/js/notifications.js",
  suites: ["tests/unit/notifications-page-contracts.test.mjs"],
  cases: cases.map(([name, find, replace]) => ({ name, find, replace })),
  suiteTimeoutMs: 60000,
});
