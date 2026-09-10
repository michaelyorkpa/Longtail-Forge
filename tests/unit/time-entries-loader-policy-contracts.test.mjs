import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const reader = createProjectTextReader();
const source = reader.readText("public/js/time-entries.js");

const LIFTED = [
  "requireTimeEntryValue", "isTimeEntryRecord", "isTimeEntryRow",
  "readTimeEntryCollection", "readTimeEntryRows", "normalizeEntryBillable",
  "loadTimeEntryData",
];

/** @param {string} source_ @param {string} name */
function constant(source_, name) {
  const match = source_.match(new RegExp(`const ${name} = [\\s\\S]*?;`));
  assert.ok(match, name);
  return match[0];
}

/** @param {Record<string, unknown>} [overrides] */
function wireRow(overrides = {}) {
  return {
    entry_id: "entry-1", user_id: "user-1", client_id: "client-1", client_name: "Client One",
    project_id: "project-1", project_name: "Project One", description: "Wrote things",
    start_time: "2026-03-02T09:00:00.000Z", end_time: "2026-03-02T10:00:00.000Z",
    invoice_status: "unbilled", duration_seconds: "3600", billable: "yes", tags: [],
    ...overrides,
  };
}

/** @param {{ entriesBody?: unknown, entriesOk?: boolean }} [options] */
function loaderCase(options = {}) {
  /** @type {unknown[]} */
  const events = [];
  /** @type {Record<string, unknown>} */
  const bodies = {
    "/api/settings": {},
    "/api/client-projects?view=options": { clients: [], view: "options" },
    "/api/time-entries": options.entriesBody === undefined ? { entries: [] } : options.entriesBody,
    "/api/users": { users: [] },
  };

  const context = vm.createContext({
    console: { error: (/** @type {unknown} */ error) => events.push(["console", String(error)]) },
    // The four responses the loader awaits together. Only the entry one varies here.
    fetch: async (/** @type {string} */ url) => {
      events.push(["fetch", url]);
      return {
        ok: url === "/api/time-entries" ? options.entriesOk !== false : true,
        status: 503,
        json: async () => bodies[url],
      };
    },
    timeEntries: /** @type {unknown[]} */ ([]),
    timeEntryClients: /** @type {unknown[]} */ ([]),
    timeEntryUsers: /** @type {unknown[]} */ ([]),
    timeEntryTagOptions: /** @type {unknown[]} */ ([]),
    timeEntrySettings: { billingPeriod: { type: "calendarMonth", startDay: 1 }, workspaceCapabilities: {} },
    filterClientSelect: { value: "" },
    normalizeSettings: () => ({ billingPeriod: { type: "calendarMonth", startDay: 1 }, workspaceCapabilities: {} }),
    normalizeClients: () => [],
    normalizeUsers: () => [],
    loadTagOptions: async () => [],
    populateClientOptions: () => events.push("client-options"),
    selectWorkspaceScopeClientIfNeeded: () => events.push("workspace-scope"),
    populateFilterProjects: () => events.push("filter-projects"),
    populateUserOptions: () => events.push("user-options"),
    populateTagFilter: () => events.push("tag-filter"),
    mountBulkTagPicker: async () => events.push("bulk-picker"),
    setDefaultCustomDates: () => events.push("default-dates"),
    updateFilterDateState: () => events.push("date-state"),
    renderEntries: () => events.push("rendered"),
    setTimeEntryStatus: (/** @type {string} */ message) => events.push(["status", message]),
  });

  vm.runInContext(constant(source, "TIME_ENTRY_TEXT_COLUMNS"), context);
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), context);

  const api = vm.runInContext(`({ ${LIFTED.join(", ")} })`, context);
  return { api, context, events };
}

/**
 * What reached the console. The status text is deliberately the same for every failure, so the
 * log is the only place the *reason* is distinguishable.
 * @param {unknown[]} events
 */
const logged = (events) => String(
  /** @type {unknown[]} */ (events.find((event) => Array.isArray(event) && event[0] === "console") || [])[1],
);

/** @param {unknown[]} events */
const statuses = (events) => events
  .filter((event) => Array.isArray(event) && event[0] === "status")
  .map((event) => /** @type {unknown[]} */ (event)[1]);

describe("Time Entries loader failure policy", () => {
  it("loads a wholly readable collection and clears the status", async () => {
    const { api, context, events } = loaderCase({
      entriesBody: { entries: [wireRow({ entry_id: "a" }), wireRow({ entry_id: "b" })] },
    });

    await api.loadTimeEntryData();

    assert.equal(context.timeEntries.length, 2);
    assert.deepEqual(context.timeEntries.map((/** @type {{ entryId: string }} */ e) => e.entryId), ["a", "b"]);
    assert.ok(events.includes("rendered"));
    assert.deepEqual(statuses(events), ["Loading entries...", ""]);
  });

  it("refuses a mixed response rather than presenting the readable half as the whole day", async () => {
    const { api, context, events } = loaderCase({
      entriesBody: {
        entries: [
          // One good hour, and one entry this page cannot vouch for.
          wireRow({ entry_id: "a", duration_seconds: "3600" }),
          wireRow({ entry_id: "b", duration_seconds: "7200", client_id: 42 }),
        ],
      },
    });

    await api.loadTimeEntryData();

    // The short read never reaches the state, and the page is never repainted from it.
    assert.equal(context.timeEntries.length, 0);
    assert.equal(events.includes("rendered"), false);
    // The failure is reported rather than the status being cleared.
    assert.deepEqual(statuses(events), ["Loading entries...", "Entries could not be loaded."]);
    // The refusal says how much was refused, which is what makes the log actionable.
    const logged = events.find((event) => Array.isArray(event) && event[0] === "console");
    assert.match(String(/** @type {unknown[]} */ (logged)[1]), /1 of 2 entries were refused/);
  });

  it("preserves the last collection that could be read whole", async () => {
    const { api, context, events } = loaderCase({
      entriesBody: { entries: [wireRow({ entry_id: "a" })] },
    });

    await api.loadTimeEntryData();
    assert.equal(context.timeEntries.length, 1);
    const beforeRefusal = context.timeEntries;

    context.fetch = async (/** @type {string} */ url) => ({
      ok: true,
      json: async () => (url === "/api/time-entries"
        ? { entries: [wireRow({ entry_id: "a" }), wireRow({ entry_id: "bad", end_time: null })] }
        : { clients: [], view: "options", users: [] }),
    });
    events.length = 0;

    await api.loadTimeEntryData();

    // Identity, not just length: the rows on screen are the ones that were already there.
    assert.equal(context.timeEntries, beforeRefusal);
    assert.equal(context.timeEntries.length, 1);
    assert.equal(events.includes("rendered"), false);
    assert.deepEqual(statuses(events), ["Loading entries...", "Entries could not be loaded."]);
  });

  it("refuses however many rows are unreadable, including all of them", async () => {
    const { api, context, events } = loaderCase({
      entriesBody: { entries: [wireRow({ entry_id: 1 }), wireRow({ description: [] })] },
    });

    await api.loadTimeEntryData();

    assert.equal(context.timeEntries.length, 0);
    assert.equal(events.includes("rendered"), false);
    const logged = events.find((event) => Array.isArray(event) && event[0] === "console");
    assert.match(String(/** @type {unknown[]} */ (logged)[1]), /2 of 2 entries were refused/);
  });

  it("leaves the refused-response path alone when the body is simply empty", async () => {
    const { api, context, events } = loaderCase({ entriesBody: { entries: [] } });

    await api.loadTimeEntryData();

    // Nothing offered is not a short read: an empty day is a real answer and still renders.
    assert.equal(context.timeEntries.length, 0);
    assert.ok(events.includes("rendered"));
    assert.deepEqual(statuses(events), ["Loading entries...", ""]);
  });

  it("refuses a failed request rather than calling it an empty day", async () => {
    // `0.33.33.44.14` left this path answering `[]`, which says the workspace has no entries -
    // a claim a 500 never made. `0.33.33.44.15` refuses it under the authorized policy change.
    const { api, context, events } = loaderCase({ entriesOk: false, entriesBody: { entries: [wireRow()] } });

    await api.loadTimeEntryData();

    assert.equal(context.timeEntries.length, 0);
    assert.equal(events.includes("rendered"), false);
    assert.deepEqual(statuses(events), ["Loading entries...", "Entries could not be loaded."]);
    // The log names the status it refused on, which is what separates this from the other two.
    assert.match(logged(events), /Could not load time entries: 503/);
  });

  it("refuses an envelope it cannot read, which is not the same as an empty collection", async () => {
    for (const body of [null, 42, "entries", [], {}, { entries: null }, { entries: "no" }, { rows: [] }]) {
      const { api, context, events } = loaderCase({ entriesBody: body });

      await api.loadTimeEntryData();

      assert.equal(context.timeEntries.length, 0, `body ${JSON.stringify(body ?? null)}`);
      assert.equal(events.includes("rendered"), false, `body ${JSON.stringify(body ?? null)}`);
      assert.deepEqual(statuses(events), ["Loading entries...", "Entries could not be loaded."]);
      // Refused as an envelope, and said so - not as a row refusal and not as a dereference.
      assert.match(logged(events), /carried no readable entry collection/, `body ${JSON.stringify(body ?? null)}`);
    }
  });

  it("preserves the last whole collection through a failed request and an unreadable envelope", async () => {
    const { api, context, events } = loaderCase({ entriesBody: { entries: [wireRow({ entry_id: "a" })] } });

    await api.loadTimeEntryData();
    const whole = context.timeEntries;
    assert.equal(whole.length, 1);

    // A failed request, then an unreadable envelope. Both keep what was already on screen.
    for (const failure of [{ ok: false, body: { entries: [] } }, { ok: true, body: { rows: [] } }]) {
      events.length = 0;
      context.fetch = async (/** @type {string} */ url) => ({
        ok: url === "/api/time-entries" ? failure.ok : true,
        status: 503,
        json: async () => (url === "/api/time-entries" ? failure.body : { clients: [], view: "options", users: [] }),
      });

      await api.loadTimeEntryData();

      assert.equal(context.timeEntries, whole);
      assert.equal(context.timeEntries.length, 1);
      assert.equal(events.includes("rendered"), false);
      assert.deepEqual(statuses(events), ["Loading entries...", "Entries could not be loaded."]);
    }
  });

  it("lets a valid empty collection replace what was there, because that is a real answer", async () => {
    const { api, context, events } = loaderCase({ entriesBody: { entries: [wireRow({ entry_id: "a" })] } });

    await api.loadTimeEntryData();
    assert.equal(context.timeEntries.length, 1);

    events.length = 0;
    context.fetch = async (/** @type {string} */ url) => ({
      ok: true,
      json: async () => (url === "/api/time-entries" ? { entries: [] } : { clients: [], view: "options", users: [] }),
    });

    await api.loadTimeEntryData();

    // An emptied day is a fact the server stated, so it replaces and repaints normally.
    assert.equal(context.timeEntries.length, 0);
    assert.ok(events.includes("rendered"));
    assert.deepEqual(statuses(events), ["Loading entries...", ""]);
  });

  it("still refuses the whole load when the client response fails", async () => {
    const { api, context, events } = loaderCase({ entriesBody: { entries: [wireRow()] } });
    context.fetch = async (/** @type {string} */ url) => ({
      ok: url !== "/api/client-projects?view=options",
      status: 500,
      json: async () => ({ entries: [wireRow()] }),
    });

    await api.loadTimeEntryData();

    // The clients guard predates this checkpoint and keeps its own failure path: entries are
    // never assigned from a load that already failed upstream.
    assert.equal(context.timeEntries.length, 0);
    assert.equal(events.includes("rendered"), false);
    assert.deepEqual(statuses(events), ["Loading entries...", "Entries could not be loaded."]);
  });
});
