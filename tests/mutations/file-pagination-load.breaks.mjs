import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Run explicitly, with no server or other verification reading this source concurrently - and that
// means *any* access, including a `git diff`, per the lesson `0.33.33.43.12` paid for.
//
// **Aimed at `file-pagination-load-contracts.test.mjs`.** `0.33.33.43.14` typed the load-and-
// pagination path. Most is annotation, but one part is a **correction**: three local members and
// one parameter declared `string` where the published contract declares `string | null`. So the
// table attacks the pagination normaliser's totality, the column list this page names itself, and
// the `null` behaviour the correction was made to describe.
//
// Anchors stay inside the function under attack, per the lesson `0.33.33.43.7` paid for.
//
// **Dispositioned, not listed.** Re-narrowing the corrected members back to `string` is not a case:
// it reintroduces the `TS2345` that surfaced the defect in the first place, so the compiler owns it
// and the ledger is where it lands. Listing it would credit the suite for a compiler catch.

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the pagination normaliser's totality ---------------------------------------------------------
  ["more is offered without anywhere to go",
    "      hasMore: pagination.hasMore === true && Boolean(nextCursor),",
    "      hasMore: pagination.hasMore === true,"],
  ["a merely truthy flag is taken as a promise of more",
    "      hasMore: pagination.hasMore === true && Boolean(nextCursor),",
    "      hasMore: Boolean(pagination.hasMore) && Boolean(nextCursor),"],
  ["the snake_case cursor spelling stops being accepted",
    '    const nextCursor = String(pagination.nextCursor || pagination.next_cursor || "").trim();',
    '    const nextCursor = String(pagination.nextCursor || "").trim();'],
  ["the camelCase spelling loses precedence",
    '    const nextCursor = String(pagination.nextCursor || pagination.next_cursor || "").trim();',
    '    const nextCursor = String(pagination.next_cursor || pagination.nextCursor || "").trim();'],
  ["the cursor stops being trimmed",
    '    const nextCursor = String(pagination.nextCursor || pagination.next_cursor || "").trim();',
    '    const nextCursor = String(pagination.nextCursor || pagination.next_cursor || "");'],
  // Reframed: dropping the default makes the reader *throw*, which the runner scores as an
  // incidental error rather than a catch. Defaulting to a populated bag keeps it answering, and
  // answering wrongly, which is what the totality case actually asserts.
  ["the normaliser's empty default becomes a populated one",
    "  function normalizeFilesPagination(pagination = {}) {",
    '  function normalizeFilesPagination(pagination = { hasMore: true, nextCursor: "assumed" }) {'],

  // --- the timestamp the correction was made for ----------------------------------------------------
  ["an unrecorded timestamp is rendered rather than left blank",
    '    if (!value) {\n      return "";\n    }\n\n    const date = new Date(value);',
    "    const date = new Date(value);"],
  ["an unparseable timestamp is swallowed instead of shown",
    '    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();',
    '    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();'],

  // --- the column list this page names itself -------------------------------------------------------
  ["the client column is offered outside a business workspace",
    '    if (usesBusinessScope()) {\n      columns.push({ key: "clientLabel", label: "Client"',
    '    if (true) {\n      columns.push({ key: "clientLabel", label: "Client"'],
  ["the client column is never offered",
    '    if (usesBusinessScope()) {\n      columns.push({ key: "clientLabel", label: "Client"',
    '    if (false) {\n      columns.push({ key: "clientLabel", label: "Client"'],
  ["the first column stops being the row header",
    '      { key: "fileName", label: "File", header: true, render: createFileCell },',
    '      { key: "fileName", label: "File", render: createFileCell },'],
  ["the actions column loses its alignment",
    '      { key: "actions", label: "Actions", align: "right", render: createFileActions },',
    '      { key: "actions", label: "Actions", render: createFileActions },'],
  ["the target column stops truncating",
    '      { key: "targetLabel", label: "Target", render: (row) => createTruncatedText(row.targetLabel, "files-target-label") },',
    '      { key: "targetLabel", label: "Target" },'],
  ["the target column truncates the wrong member",
    '      { key: "targetLabel", label: "Target", render: (row) => createTruncatedText(row.targetLabel, "files-target-label") },',
    '      { key: "targetLabel", label: "Target", render: (row) => createTruncatedText(row.clientLabel, "files-target-label") },'],

  // --- the declarations the checkpoint is otherwise made of ------------------------------------------
  ["the pagination input claims the published shape it cannot use",
    "   * @param {{ hasMore?: unknown, nextCursor?: unknown, next_cursor?: unknown }} [pagination]",
    '   * @param {import("../../src/types/browser-contracts.js").BrowserBoundedPagination} [pagination]'],
  ["the attachment list is redeclared locally instead of reused",
    '   * @param {import("../../src/types/browser-contracts.js").BrowserFileAttachment[]} attachments',
    "   * @param {{ fileId?: string }[]} attachments"],
  // Retargeted by `0.33.33.43.15`, which aliased this expression as `FileRowRecord` and used the
  // alias here. Same line, same break: the row type stops being the builder's own return.
  ["the row type is restated rather than taken from its builder",
    "   * @param {FileRowRecord[]} rows",
    "   * @param {{ fileName?: string }[]} rows"],
  ["the nullability correction loses its reason",
    "   * **The two timestamps admit `null`, corrected by `0.33.33.43.14`.** This shape originally",
    "   * The two timestamps admit null. This shape originally"],
];

runMutationCampaign({
  sourcePath: "public/js/files.js",
  suites: ["tests/unit/file-pagination-load-contracts.test.mjs"],
  cases: cases.map(([name, find, replace]) => ({ name, find, replace })),
  suiteTimeoutMs: 60000,
});
