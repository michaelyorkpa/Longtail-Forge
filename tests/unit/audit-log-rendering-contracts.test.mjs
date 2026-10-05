import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const reader = createProjectTextReader();
const source = reader.readText("public/js/audit-log.js");

const LIFTED = [
  "findAuditControl", "requireAuditValue", "renderAuditLogs", "createAuditRow", "updatePagination",
  "updateStatus", "getTotalPages", "getPageSize", "normalizeAuditLog", "readSnapshotText",
  "getAuditContext", "parseJson", "getClientLabel", "getClientId", "getProjectLabel",
  "getProjectId", "createFilterButton", "createCell", "createOption", "formatEnum",
  "formatDateTime", "setStatus", "getAuditEndpoint",
];

const CONTROLS = [
  ["auditViewSelect", "[data-audit-view-filter]", "select", "HTMLSelectElement"],
  ["userFilterSelect", "[data-audit-user-filter]", "select", "HTMLSelectElement"],
  ["clientFilterSelect", "[data-audit-client-filter]", "select", "HTMLSelectElement"],
  ["projectFilterSelect", "[data-audit-project-filter]", "select", "HTMLSelectElement"],
  ["recordTypeFilterSelect", "[data-audit-record-type-filter]", "select", "HTMLSelectElement"],
  ["pageSizeSelect", "[data-audit-page-size]", "select", "HTMLSelectElement"],
  ["previousPageButton", "[data-audit-previous-page]", "button", "HTMLButtonElement"],
  ["nextPageButton", "[data-audit-next-page]", "button", "HTMLButtonElement"],
  ["pageSummary", "[data-audit-page-summary]", "span", "HTMLElement"],
  ["auditStatus", "[data-audit-status]", "p", "HTMLElement"],
  ["auditLogBody", "[data-audit-log-body]", "tbody", "HTMLElement"],
  ["showUtcInput", "[data-audit-show-utc]", "input", "HTMLInputElement"],
];

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

/** @param {Record<string, unknown>} [overrides] */
const entry = (overrides = {}) => ({
  action: "time_entry.update",
  actor_user_id: "u1",
  actor_user_name: "Ada Lovelace",
  audit_id: "a1",
  change_type: "update",
  created_at: "2026-03-01T10:00:00Z",
  ip_address: "10.0.0.1",
  metadata_json: "",
  new_value_json: "",
  previous_value_json: "",
  record_id: "r1",
  record_label: "Record One",
  record_type: "time_entry",
  record_url: "",
  ...overrides,
});

/** @param {{ omit?: string[], rows?: Record<string, unknown>[], total?: number, page?: number }} [options] */
function renderCase(options = {}) {
  const omit = new Set(options.omit || []);
  const document = new FakeDocument();

  for (const [, selector, tag] of CONTROLS) {
    if (omit.has(selector)) continue;
    const element = document.createElement(tag);
    element.setAttribute(selector.slice(1, -1), "");
    document.body.appendChild(element);
  }

  const context = vm.createContext({
    document,
    ...fakeDomConstructors(),
    auditLogs: options.rows || [],
    totalAuditLogs: options.total ?? (options.rows || []).length,
    currentPage: options.page ?? 1,
    loadAuditLogs: () => {},
    openAuditDetailDialog: () => {},
    requireTimezones: () => ({
      /** @param {string} value @param {string | undefined} timezone */
      formatDateTime: (value, timezone) => (value ? `${value}|${timezone || "local"}` : ""),
    }),
  });

  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), context);
  for (const [name, selector, , constructor] of CONTROLS) {
    vm.runInContext(`var ${name} = findAuditControl(${JSON.stringify(selector)}, ${constructor});`, context);
  }

  const api = vm.runInContext(`({ ${LIFTED.join(", ")} })`, context);
  /** @param {string} selector */
  const control = (selector) => document.querySelector(selector);
  const rows = () => control("[data-audit-log-body]").children;
  /** @param {number} index */
  const cellsOf = (index) => rows()[index].children.map((cell) => cell.textContent);
  return { api, context, document, control, rows, cellsOf };
}

describe("Audit Log snapshot reading", () => {
  it("coerces every nullable member of the wire entry to a string", () => {
    const testCase = renderCase();

    const normalized = testCase.api.normalizeAuditLog(entry({
      actor_user_id: null, actor_user_name: null, ip_address: null,
      record_id: null, record_label: null, record_url: null,
      metadata_json: null, new_value_json: null, previous_value_json: null,
    }));

    for (const [member, value] of Object.entries(normalized)) {
      assert.equal(typeof value, "string", `${member} must be a string`);
    }
    assert.equal(normalized.actor_user_id, "");
    assert.equal(normalized.record_url, "");
    assert.equal(normalized.audit_id, "a1");
  });

  it("does not carry a member this page never reads off a row", () => {
    const testCase = renderCase();

    const normalized = testCase.api.normalizeAuditLog(entry({ workspace_id: "w1" }));

    assert.equal(Object.hasOwn(normalized, "workspace_id"), false);
  });

  /**
   * The reader answers `""` for a falsy member on purpose. The context chain is a run of `||`,
   * so coercing a `0` into a truthy `"0"` would stop it falling through to the next source.
   */
  it("treats a falsy member as absent so the context chain still falls through", () => {
    const testCase = renderCase();

    assert.equal(testCase.api.readSnapshotText({ client_id: 0 }, "client_id"), "");
    assert.equal(testCase.api.readSnapshotText({ client_id: "" }, "client_id"), "");
    assert.equal(testCase.api.readSnapshotText({ client_id: false }, "client_id"), "");
    assert.equal(testCase.api.readSnapshotText({ client_id: "c1" }, "client_id"), "c1");
    assert.equal(testCase.api.readSnapshotText({ client_id: 7 }, "client_id"), "7");
  });

  it("refuses a snapshot that is not a record, including the raw text a parse failure returns", () => {
    const testCase = renderCase();

    assert.equal(testCase.api.readSnapshotText(null, "client_id"), "");
    assert.equal(testCase.api.readSnapshotText("not json at all", "client_id"), "");
    assert.equal(testCase.api.readSnapshotText([{ client_id: "c1" }], "client_id"), "");
    assert.equal(testCase.api.readSnapshotText(42, "client_id"), "");
    assert.equal(testCase.api.readSnapshotText({}, "client_id"), "");
    // Own members only: a name that lives on `Object.prototype` is not this snapshot's content.
    assert.equal(testCase.api.readSnapshotText({}, "constructor"), "");
    assert.equal(testCase.api.readSnapshotText({}, "toString"), "");
  });

  it("hands back the raw text when a snapshot will not parse, and null when there is none", () => {
    const testCase = renderCase();

    assert.equal(testCase.api.parseJson(""), null);
    assert.equal(testCase.api.parseJson("{oops"), "{oops");
    // The parsed object is built inside the vm realm, so it carries that realm's prototype and
    // only its content is comparable from here.
    assert.deepEqual(plain(testCase.api.parseJson('{"client_id":"c1"}')), { client_id: "c1" });
  });

  it("prefers metadata, then the after-snapshot, then the before-snapshot", () => {
    const testCase = renderCase();
    const log = testCase.api.normalizeAuditLog(entry({
      new_value_json: '{"client_id":"from-new","client_name":"New Client","project_name":"New Project"}',
      previous_value_json: '{"client_id":"from-previous","client_name":"Previous Client","project_id":"from-previous-project"}',
    }));

    const context = testCase.api.getAuditContext(log, { client_id: "from-metadata" });

    assert.equal(context.client_id, "from-metadata");
    // Present in both snapshots, so this is the assertion that tells them apart.
    assert.equal(context.client_name, "New Client");
    assert.equal(context.project_name, "New Project");
    assert.equal(context.project_id, "from-previous-project");
  });
});

describe("Audit Log row context", () => {
  it("prefers the context name over the record, and falls back to the record only for its own type", () => {
    const testCase = renderCase();
    const log = testCase.api.normalizeAuditLog(entry({ record_type: "client", record_label: "Acme" }));

    assert.equal(testCase.api.getClientLabel(log, { client_name: "Context Client" }), "Context Client");
    assert.equal(testCase.api.getClientLabel(log, {}), "Acme");
    const unlabelled = testCase.api.normalizeAuditLog(entry({ record_type: "client", record_label: null }));
    assert.equal(testCase.api.getClientLabel(unlabelled, {}), "r1");

    // A record of some other type is not its own client, so it names nothing rather than itself.
    const unrelated = testCase.api.normalizeAuditLog(entry({ record_type: "time_entry" }));
    assert.equal(testCase.api.getClientLabel(unrelated, {}), "None");
    assert.equal(testCase.api.getClientId(unrelated, {}), "");
    assert.equal(testCase.api.getClientId(log, {}), "r1");
    assert.equal(testCase.api.getProjectLabel(log, {}), "None");
    assert.equal(testCase.api.getProjectId(log, {}), "");
  });

  it("falls back to the record id when the record carries no label", () => {
    const testCase = renderCase();
    const log = testCase.api.normalizeAuditLog(entry({ record_type: "project", record_label: null }));

    assert.equal(testCase.api.getProjectLabel(log, {}), "r1");
  });
});

describe("Audit Log table rendering", () => {
  it("renders an empty state that spans the table and names the view", () => {
    const testCase = renderCase();
    testCase.control("[data-audit-view-filter]").value = "security";
    testCase.control("[data-audit-status]").textContent = "Showing 1-1 of 1 audit log entries.";

    testCase.api.renderAuditLogs();

    assert.equal(testCase.rows().length, 1);
    assert.equal(testCase.rows()[0].children[0].colSpan, 7);
    assert.equal(testCase.rows()[0].textContent, "No security events match these filters.");
    assert.equal(testCase.control("[data-audit-status]").textContent, "");
  });

  it("names the audit view in its own empty state", () => {
    const testCase = renderCase();

    testCase.api.renderAuditLogs();

    assert.equal(testCase.rows()[0].textContent, "No audit log entries match these filters.");
  });

  it("rebuilds the table rather than appending to it", () => {
    const testCase = renderCase();
    testCase.context.auditLogs = [testCase.api.normalizeAuditLog(entry())];

    testCase.api.renderAuditLogs();
    testCase.api.renderAuditLogs();

    assert.equal(testCase.rows().length, 1);
  });

  it("lays out seven columns in their published order", () => {
    const testCase = renderCase();
    // Client and project must differ, or the two columns swapping would be invisible here.
    testCase.context.auditLogs = [testCase.api.normalizeAuditLog(entry({
      metadata_json: '{"client_name":"Acme Supply","project_name":"Atlas Rollout"}',
    }))];

    testCase.api.renderAuditLogs();

    assert.equal(testCase.rows().length, 1);
    assert.deepEqual(testCase.cellsOf(0), [
      "2026-03-01T10:00:00Z|local", "Ada Lovelace", "Acme Supply", "Atlas Rollout", "Time Entry",
      "Update", "View",
    ]);
  });

  it("renders the date through the shared formatter, honouring the UTC toggle", () => {
    const testCase = renderCase();
    testCase.control("[data-audit-show-utc]").checked = true;
    testCase.context.auditLogs = [testCase.api.normalizeAuditLog(entry())];

    testCase.api.renderAuditLogs();

    assert.equal(testCase.cellsOf(0)[0], "2026-03-01T10:00:00Z|UTC");
  });

  it("shows the actor name, falling back to the id, and names an unattributed entry", () => {
    const testCase = renderCase();
    testCase.context.auditLogs = [
      testCase.api.normalizeAuditLog(entry()),
      testCase.api.normalizeAuditLog(entry({ audit_id: "a2", actor_user_name: null })),
      testCase.api.normalizeAuditLog(entry({ audit_id: "a3", actor_user_id: null, actor_user_name: null })),
    ];

    testCase.api.renderAuditLogs();

    assert.equal(testCase.cellsOf(0)[1], "Ada Lovelace");
    assert.equal(testCase.cellsOf(1)[1], "u1");
    assert.equal(testCase.cellsOf(2)[1], "None");
  });

  it("reports the page window against the total", () => {
    const testCase = renderCase({ total: 130, page: 2 });
    testCase.control("[data-audit-page-size]").value = "50";
    testCase.context.auditLogs = [testCase.api.normalizeAuditLog(entry())];

    testCase.api.renderAuditLogs();

    assert.equal(testCase.control("[data-audit-status]").textContent, "Showing 51-51 of 130 audit log entries.");
  });

  it("closes the window on the total even when more rows are held than it counts", () => {
    const testCase = renderCase({ total: 3, page: 1 });
    testCase.context.auditLogs = [1, 2, 3, 4, 5].map((n) => testCase.api.normalizeAuditLog(entry({ audit_id: `a${n}` })));

    testCase.api.renderAuditLogs();

    assert.equal(testCase.control("[data-audit-status]").textContent, "Showing 1-3 of 3 audit log entries.");
  });

  it("names security events in its own status line", () => {
    const testCase = renderCase({ total: 3, page: 1 });
    testCase.control("[data-audit-view-filter]").value = "security";
    testCase.context.auditLogs = [testCase.api.normalizeAuditLog(entry())];

    testCase.api.renderAuditLogs();

    assert.equal(testCase.control("[data-audit-status]").textContent, "Showing 1-1 of 3 security events.");
  });
});

describe("Audit Log pagination", () => {
  it("closes both ends on a single page", () => {
    const testCase = renderCase({ total: 3, page: 1 });

    testCase.api.updatePagination();

    assert.equal(testCase.control("[data-audit-previous-page]").disabled, true);
    assert.equal(testCase.control("[data-audit-next-page]").disabled, true);
    assert.equal(testCase.control("[data-audit-page-summary]").textContent, "Page 1 of 1");
  });

  it("opens forward on the first of several pages and back on the last", () => {
    const first = renderCase({ total: 130, page: 1 });
    first.control("[data-audit-page-size]").value = "50";
    first.api.updatePagination();

    assert.equal(first.control("[data-audit-previous-page]").disabled, true);
    assert.equal(first.control("[data-audit-next-page]").disabled, false);
    assert.equal(first.control("[data-audit-page-summary]").textContent, "Page 1 of 3");

    const last = renderCase({ total: 130, page: 3 });
    last.control("[data-audit-page-size]").value = "50";
    last.api.updatePagination();

    assert.equal(last.control("[data-audit-previous-page]").disabled, false);
    assert.equal(last.control("[data-audit-next-page]").disabled, true);
  });

  it("clamps the reported page to the range the totals allow", () => {
    const testCase = renderCase({ total: 10, page: 9 });
    testCase.control("[data-audit-page-size]").value = "50";

    testCase.api.updatePagination();

    assert.equal(testCase.control("[data-audit-page-summary]").textContent, "Page 1 of 1");
  });

  it("falls back to fifty rows when the size control offers no readable number", () => {
    const testCase = renderCase();
    testCase.control("[data-audit-page-size]").value = "not a number";

    assert.equal(testCase.api.getPageSize(), 50);
  });
});

describe("Audit Log filter buttons", () => {
  it("offers a filter button only for a value the target catalogue actually carries", () => {
    const testCase = renderCase();
    const select = testCase.control("[data-audit-client-filter]");
    select.appendChild(testCase.api.createOption("", "All clients"));
    select.appendChild(testCase.api.createOption("c1", "Client One"));

    const offered = testCase.api.createFilterButton("Client One", "c1", select);
    const unoffered = testCase.api.createFilterButton("Client Two", "c2", select);

    assert.equal(offered.tagName, "BUTTON");
    assert.equal(offered.textContent, "Client One");
    assert.equal(unoffered.tagName, "#TEXT");
    assert.equal(unoffered.textContent, "Client Two");
  });

  it("never offers a button for an absent value, an absent select, or the None label", () => {
    const testCase = renderCase();
    const select = testCase.control("[data-audit-client-filter]");
    select.appendChild(testCase.api.createOption("", "All clients"));
    select.appendChild(testCase.api.createOption("c1", "Client One"));

    // The placeholder carries an empty value, so only the guard keeps a blank from filtering.
    assert.equal(testCase.api.createFilterButton("Client One", "", select).tagName, "#TEXT");
    assert.equal(testCase.api.createFilterButton("None", "c1", select).tagName, "#TEXT");
    assert.equal(testCase.api.createFilterButton("Client One", "c1", null).tagName, "#TEXT");
    assert.equal(testCase.api.createFilterButton("", "c1", select).textContent, "None");
  });

  it("applies the value to its own catalogue and returns to the first page when clicked", () => {
    const testCase = renderCase({ page: 4 });
    const select = testCase.control("[data-audit-client-filter]");
    select.appendChild(testCase.api.createOption("", "All clients"));
    select.appendChild(testCase.api.createOption("c1", "Client One"));

    testCase.api.createFilterButton("Client One", "c1", select).dispatchEvent({ type: "click" });

    assert.equal(select.value, "c1");
    assert.equal(testCase.context.currentPage, 1);
  });
});

describe("Audit Log cells", () => {
  it("appends a node and writes text for everything else, naming an empty value", () => {
    const testCase = renderCase();
    const button = testCase.document.createElement("button");
    button.textContent = "View";

    assert.equal(testCase.api.createCell(button).children[0], button);
    assert.equal(testCase.api.createCell("Some text").textContent, "Some text");
    assert.equal(testCase.api.createCell("").textContent, "None");
  });

  it("titles and truncates a text cell but leaves a node cell alone", () => {
    const testCase = renderCase();
    const text = testCase.api.createCell("Some text");
    const node = testCase.api.createCell(testCase.document.createElement("button"));

    assert.equal(text.title, "Some text");
    assert.equal(text.classList.contains("audit-truncate"), true);
    assert.equal(node.classList.contains("audit-truncate"), false);
  });
});

describe("Audit Log acquisition", () => {
  it("acquires every control through the checked lookup at the markup's own subtype", () => {
    const DECLARED = [
      ["auditFilterForm", "[data-audit-filters]", "HTMLFormElement"],
      ["auditViewSelect", "[data-audit-view-filter]", "HTMLSelectElement"],
      ["resetButton", "[data-audit-reset]", "HTMLButtonElement"],
      ["exportFilteredButton", "[data-audit-export-filtered]", "HTMLButtonElement"],
      ["exportAllButton", "[data-audit-export-all]", "HTMLButtonElement"],
      ["pageSizeSelect", "[data-audit-page-size]", "HTMLSelectElement"],
      ["previousPageButton", "[data-audit-previous-page]", "HTMLButtonElement"],
      ["nextPageButton", "[data-audit-next-page]", "HTMLButtonElement"],
      ["pageSummary", "[data-audit-page-summary]", "HTMLElement"],
      ["auditStatus", "[data-audit-status]", "HTMLElement"],
      ["auditLogBody", "[data-audit-log-body]", "HTMLElement"],
    ];

    for (const [name, selector, constructor] of DECLARED) {
      const expected = `const ${name} = findAuditControl("${selector}", ${constructor});`;
      assert.equal(source.includes(expected), true, `${name} must be acquired as ${expected}`);
    }
  });

  it("fails at the access that already dereferenced a missing control, by name", () => {
    const testCase = renderCase({ omit: ["[data-audit-log-body]"] });

    assert.throws(() => testCase.api.renderAuditLogs(), {
      name: "TypeError",
      message: "Audit Log requires its log table body.",
    });
  });

  it("performs exactly one document query, inside the checked lookup", () => {
    assert.equal(source.split("document.querySelector").length - 1, 1);
    assert.equal(
      source.includes("const element = document.querySelector(selector);"),
      true,
      "the only query must be the checked lookup's own",
    );
  });

  it("carries no cast and no suppression", () => {
    assert.equal(source.includes("@ts-expect-error"), false);
    assert.equal(source.includes("@ts-ignore"), false);
    assert.equal(source.includes("eslint-disable"), false);
    // One cast remains, inside the snapshot reader, and it is guarded by the check above it.
    assert.equal(source.split("/** @type {Record<string, unknown>} */").length - 1, 1);
  });
});
