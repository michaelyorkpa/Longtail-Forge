import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const reader = createProjectTextReader();
const source = reader.readText("public/js/time-entries.js");

const LIFTED = [
  "findTimeEntryControl", "requireTimeEntryValue", "renderEntries", "createActionsCell",
  "createTimeEntryActionButton", "createProjectCell", "createTableCell", "createSelectionCell",
  "formatDate", "formatHours", "formatDuration", "formatInvoiceStatus", "formatEntryStatus",
  "normalizeEntryBillable",
];

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

/** @param {Partial<Record<string, unknown>>} [overrides] */
function entryRow(overrides = {}) {
  return {
    billable: "yes", clientId: "c1", clientName: "Client One", description: "",
    durationSeconds: 3600, endTime: new Date("2026-03-02T10:00:00.000Z"), entryId: "e1",
    invoiceStatus: "unbilled", projectId: "p1", projectName: "Project One",
    startTime: new Date("2026-03-02T09:00:00.000Z"), tags: [], userId: "u1",
    ...overrides,
  };
}

/** @param {{ icons?: boolean, tags?: boolean, omitTable?: boolean, entries?: unknown[] }} [options] */
function renderCase(options = {}) {
  const document = new FakeDocument();
  /** @type {unknown[]} */
  const events = [];

  if (!options.omitTable) {
    const table = document.createElement("tbody");
    table.setAttribute("data-time-entry-table", "");
    document.body.appendChild(table);
  }

  const iconSurface = options.icons === false ? undefined : {
    createIconButton: (/** @type {Record<string, unknown>} */ request) => {
      events.push(["icon-button", request]);
      const button = document.createElement("button");
      button.textContent = String(request.label);
      return button;
    },
  };

  const context = vm.createContext({
    document,
    window: { LongtailForge: { icons: iconSurface ? iconSurface : undefined } },
    ...fakeDomConstructors(),
    selectedEntryIds: new Set(),
    timeEntryClients: [],
    getFilteredEntries: () => options.entries || [],
    syncSelectionToEntries: () => events.push("sync-selection"),
    updateSelectionControls: () => events.push("sync-controls"),
    updateBulkControls: () => events.push("sync-bulk"),
    getEffectiveEntryBillable: (/** @type {{ billable: string }} */ entry) => entry.billable,
    requireNamespace: () => ({
      tags: options.tags === false ? undefined : {
        renderTagList: (/** @type {unknown} */ container, /** @type {unknown} */ tags) => {
          events.push(["render-tags", tags]);
        },
      },
    }),
    requireTimezones: () => ({ formatDate: (/** @type {Date} */ date) => `formatted:${date.toISOString()}` }),
    requireFormatters: () => ({ entryStatus: (/** @type {string} */ status) => `status:${status}` }),
    openEditDialog: () => events.push("open-edit"),
    deleteEntry: () => events.push("delete"),
  });

  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), context);
  vm.runInContext('var timeEntryTable = findTimeEntryControl("[data-time-entry-table]", HTMLElement);', context);

  const api = vm.runInContext(`({ ${LIFTED.join(", ")} })`, context);
  return { api, context, document, events, table: document.querySelector("[data-time-entry-table]") };
}

describe("Time Entries table rendering and row actions", () => {
  it("draws one row per entry, in the column order the header promises", () => {
    const entries = [entryRow({ entryId: "a" }), entryRow({ entryId: "b", clientName: "Client Two" })];
    const { api, table } = renderCase({ entries });

    api.renderEntries();

    assert.equal(table.children.length, 2);
    // Selection, date, client, project, hours, status, actions - seven cells, in that order.
    assert.equal(table.children[0].children.length, 7);
    assert.equal(table.children[0].children[1].textContent, "formatted:2026-03-02T10:00:00.000Z");
    assert.equal(table.children[0].children[2].textContent, "Client One");
    assert.equal(table.children[1].children[2].textContent, "Client Two");
    // The hours column reports this row's own duration, not a constant.
    assert.equal(table.children[0].children[4].textContent, "01:00:00");
    assert.equal(table.children[0].children[5].textContent, "status:unbilled");
  });

  it("rebuilds the table rather than appending to it", () => {
    const { api, table } = renderCase({ entries: [entryRow()] });

    api.renderEntries();
    api.renderEntries();

    // Rendering twice must not double the rows; the table is cleared first.
    assert.equal(table.children.length, 1);
  });

  it("draws one spanning row when nothing matches, and syncs the controls either way", () => {
    const { api, table, events } = renderCase({ entries: [] });

    api.renderEntries();

    assert.equal(table.children.length, 1);
    assert.equal(table.children[0].children.length, 1);
    assert.equal(table.children[0].children[0].colSpan, 7, "the empty row spans every column");
    assert.equal(table.children[0].children[0].textContent, "No entries match these filters.");
    // The selection and bulk controls are synced before the early return, not after it.
    assert.deepEqual(events.filter((event) => typeof event === "string"), ["sync-selection", "sync-controls", "sync-bulk"]);
  });

  it("fails at the render that already dereferenced a missing table, by name", () => {
    const { api } = renderCase({ omitTable: true, entries: [] });

    assert.throws(() => api.renderEntries(), (error) => {
      assert.ok(typeof error === "object" && error !== null && "name" in error && "message" in error);
      assert.equal(error.name, "TypeError");
      assert.match(String(error.message), /Time Entries requires its entry table\./);
      return true;
    });
  });

  it("builds row actions through the shared icon surface when it is published", () => {
    const { api, events } = renderCase();
    const cell = api.createActionsCell(entryRow());

    assert.equal(cell.children[0].children.length, 2);
    const requests = events
      .filter((event) => Array.isArray(event) && event[0] === "icon-button")
      .map((event) => plain(/** @type {unknown[]} */ (event)[1]));
    assert.deepEqual(requests, [
      { icon: "edit", label: "Edit", title: "Edit", variant: "" },
      { icon: "delete", label: "Delete", title: "Delete", variant: "danger" },
    ]);
  });

  it("falls back to a plain button that still carries the danger affordance", () => {
    const { api } = renderCase({ icons: false });

    const plainButton = api.createTimeEntryActionButton("Edit", "edit");
    assert.equal(plainButton.tagName, "BUTTON");
    assert.equal(plainButton.type, "button");
    assert.equal(plainButton.textContent, "Edit");
    assert.equal(plainButton.classList.contains("danger-button"), false);

    const dangerous = api.createTimeEntryActionButton("Delete", "delete", { danger: true });
    assert.equal(dangerous.classList.contains("danger-button"), true);
  });

  it("renders a tag list only when there are tags and a surface to render them", () => {
    const withTags = renderCase();
    withTags.api.createProjectCell(entryRow({ tags: [{ tag_id: "t1" }] }));
    const rendered = /** @type {unknown[]} */ (
      withTags.events.filter((event) => Array.isArray(event) && event[0] === "render-tags")[0]
    );
    assert.deepEqual(plain(rendered[1]), [{ tag_id: "t1" }]);

    const noTags = renderCase();
    noTags.api.createProjectCell(entryRow({ tags: [] }));
    assert.equal(noTags.events.some((event) => Array.isArray(event) && event[0] === "render-tags"), false);

    const noSurface = renderCase({ tags: false });
    assert.doesNotThrow(() => noSurface.api.createProjectCell(entryRow({ tags: [{ tag_id: "t1" }] })));

    // `tags` is `unknown[]` by contract and the normalizer guarantees an array, but the guard is
    // what makes that a check rather than a hope - a body that reached here unchecked must not be
    // handed to the renderer.
    const notAnArray = renderCase();
    assert.doesNotThrow(() => notAnArray.api.createProjectCell(entryRow({ tags: "nope" })));
    assert.equal(notAnArray.events.some((event) => Array.isArray(event) && event[0] === "render-tags"), false);
  });

  it("answers N/A for an entry that is not billable and the invoice status when it is", () => {
    const { api } = renderCase();

    assert.equal(api.formatEntryStatus(entryRow({ billable: "no" })), "N/A");
    assert.equal(api.formatEntryStatus(entryRow({ billable: "" })), "N/A");
    assert.equal(api.formatEntryStatus(entryRow({ billable: "yes", invoiceStatus: "invoiced" })), "status:invoiced");
  });

  it("answers an empty string for a date it cannot read", () => {
    const { api } = renderCase();

    assert.equal(api.formatDate(new Date("2026-03-02T10:00:00.000Z")), "formatted:2026-03-02T10:00:00.000Z");
    assert.equal(api.formatDate(new Date("not-a-date")), "", "an unreadable date renders as nothing, not as Invalid Date");
  });

  it("formats durations from either a number or a wire string, and never below zero", () => {
    const { api } = renderCase();

    assert.equal(api.formatHours(3661), "01:01:01");
    assert.equal(api.formatDuration("3661"), "01:01:01");
    assert.equal(api.formatDuration(-5), "00:00:00", "a negative duration clamps rather than rendering a minus");
    assert.equal(api.formatDuration("nonsense"), "00:00:00");
  });

  it("performs exactly one document query, inside the checked lookup", () => {
    // The sharpest form of the completion claim: a rival helper adds a second query and is caught
    // by this even though it would pass any name-based rule.
    assert.equal(source.split("document.querySelector").length - 1, 1);
    assert.match(source, /function findTimeEntryControl\(selector, constructor\) \{\s*\n\s*const element = document\.querySelector\(selector\);/);
  });

  it("acquires every control through the checked lookup at the markup's own subtype", () => {
    // The lifted cases build their own controls, so they cannot see the declarations. This is that
    // half of the claim.
    for (const [name, selector, constructor] of [
      ["timeEntryTable", "[data-time-entry-table]", "HTMLElement"],
      ["timeEntryStatus", "[data-time-entry-status]", "HTMLElement"],
      ["addTimeEntryButton", "[data-add-time-entry]", "HTMLButtonElement"],
    ]) {
      const expected = `const ${name} = findTimeEntryControl("${selector}", ${constructor});`;
      assert.equal(source.includes(expected), true, `${name} must be acquired as ${expected}`);
    }
  });

  it("reaches zero with no cast and no suppression", () => {
    assert.equal(/\/\*\* @type \{[^}]*\} \*\/ \(/.test(source), false, "no cast may stand in for a check");
    for (const suppression of ["@ts-expect-error", "@ts-ignore", "eslint-disable"]) {
      assert.equal(source.includes(suppression), false, `${suppression} must not appear`);
    }
  });
});
