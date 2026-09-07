import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { URLSearchParams } from "node:url";
import { describe, it } from "vitest";

/**
 * The `GET /api/tasks/calendar` response boundary, closed by `0.33.33.38.4.3.10`.
 *
 * `taskCalendar.fetchCalendarWindow` reaches this endpoint through two transports - the
 * dashboard loader when one is published, a native `fetch` otherwise - and neither validated the
 * body. The loader answers `Promise<unknown>` and `response.json()` answers an implicit `any`, so
 * the Calendar page's `data` slot held an untyped value and every read through it was unchecked.
 *
 * Both branches now pass through the same private reader before the method resolves. These tests
 * drive the **shipped** helper rather than a copy: the file is evaluated as it ships, against a
 * fake `window`, and the published `taskCalendar` surface is what gets called.
 */

const source = readFileSync(new URL("../../public/js/shared/task-calendar.js", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");

/**
 * Evaluate the shipped helper against a controlled global and hand back its publication.
 * @param {{ loadRoute?: (route: unknown) => Promise<unknown>, fetch?: (...args: unknown[]) => unknown }} [wiring]
 */
function loadTaskCalendar(wiring = {}) {
  /** @type {{ route: string, calls: number }} */
  const seen = { route: "", calls: 0 };
  /** @type {Record<string, unknown>} */
  const namespace = {};
  if (wiring.loadRoute) {
    namespace.dashboardBootstrap = {
      loadRoute: (/** @type {unknown} */ route) => {
        seen.calls += 1;
        seen.route = String(route);
        return wiring.loadRoute?.(route);
      },
    };
  }
  const global = { LongtailForge: namespace, matchMedia: () => ({ matches: false }) };
  // The helper calls the bare global `fetch`, so it is injected as a parameter rather than hung
  // off the fake window - otherwise the native branch would reach Node's real one.
  const fetchStub = (/** @type {unknown} */ route, /** @type {unknown} */ init) => {
    seen.calls += 1;
    seen.route = String(route);
    return wiring.fetch?.(route, init);
  };
  new Function("window", "fetch", source)(global, fetchStub);
  const published = /** @type {Record<string, Function>} */ (
    /** @type {Record<string, unknown>} */ (global.LongtailForge).taskCalendar);
  return { published, seen, namespace: global.LongtailForge };
}

/** A row exactly as `tasksService.taskCalendarRow` writes it. */
function persistedRow(overrides = {}) {
  return {
    allDay: false,
    client_name: "Acme",
    due_date: "2026-09-10",
    due_time: "09:00",
    endDate: "2026-09-10",
    id: "task-1",
    priority: "normal",
    project_name: "Rollout",
    startDate: "2026-09-10",
    status: "open",
    task_id: "task-1",
    title: "Ship it",
    ...overrides,
  };
}

/** A row exactly as `tasksService.virtualTaskCalendarRow` writes it, empty `task_id` included. */
function virtualRow(overrides = {}) {
  return {
    allDay: true,
    client_name: "",
    due_date: "2026-09-12",
    due_time: "",
    endDate: "2026-09-12",
    id: "recurrence:template-9:2026-09-12",
    instanceDate: "2026-09-12",
    priority: "normal",
    project_name: "",
    startDate: "2026-09-12",
    status: "open",
    task_id: "",
    templateId: "template-9",
    title: "Weekly review",
    virtual: true,
    ...overrides,
  };
}

/** A marker exactly as `tasksService.calendarReminderMarkers` writes it. */
function reminderMarker(overrides = {}) {
  return {
    date: "2026-09-10",
    due_at_utc: "2026-09-18T13:00:00.000Z",
    due_kind: "date_time",
    offset_minutes: 60,
    reminder_at_utc: "2026-09-10T12:00:00.000Z",
    source: "workspace",
    task_id: "task-later",
    title: "Renewal",
    url: "tasks.html?task=task-later",
    ...overrides,
  };
}

/** The whole envelope as `tasksService.calendarWindow` returns it. */
function windowBody(overrides = {}) {
  return {
    range: { endDate: "2026-09-30", startDate: "2026-09-01" },
    reminders: [],
    source_enabled: true,
    tasks: [],
    ...overrides,
  };
}

const RANGE = { fetchEnd: "2026-09-30", fetchStart: "2026-09-01" };

/** @param {unknown} body */
const okResponse = (body) => ({ ok: true, status: 200, json: async () => body });

describe("the calendar window reaches both transports through one reader", () => {
  it("validates the dashboard loader's body", async () => {
    const body = windowBody({ tasks: [persistedRow()] });
    const { published, seen } = loadTaskCalendar({ loadRoute: async () => body });
    const result = await published.fetchCalendarWindow(RANGE, {});

    assert.equal(seen.calls, 1, "one request per load operation");
    assert.match(seen.route, /^\/api\/tasks\/calendar\?/);
    assert.equal(result.tasks[0].task_id, "task-1");
    assert.equal(result.source_enabled, true);
  });

  it("validates the native fetch body when no loader is published", async () => {
    const body = windowBody({ tasks: [persistedRow()] });
    /** @type {unknown} */
    let init = null;
    const { published, seen } = loadTaskCalendar({
      fetch: (_route, requestInit) => {
        init = requestInit;
        return okResponse(body);
      },
    });
    const result = await published.fetchCalendarWindow(RANGE, {});

    assert.equal(seen.calls, 1);
    assert.deepEqual(init, { cache: "no-store" }, "the native path keeps no-store");
    assert.equal(result.tasks[0].title, "Ship it");
  });

  it("prefers the dashboard loader and never touches fetch when one exists", async () => {
    let fetched = 0;
    const { published } = loadTaskCalendar({
      loadRoute: async () => windowBody(),
      fetch: () => {
        fetched += 1;
        return okResponse(windowBody());
      },
    });
    await published.fetchCalendarWindow(RANGE, {});
    assert.equal(fetched, 0, "the loader owns request deduplication and caching");
  });

  it("carries the filters into the route and de-duplicates statuses", async () => {
    const { published, seen } = loadTaskCalendar({ loadRoute: async () => windowBody() });
    await published.fetchCalendarWindow(RANGE, {
      clientId: "client-3",
      projectId: "project-4",
      statuses: ["open,in_progress", "open", " blocked "],
    });
    const params = new URLSearchParams(seen.route.split("?")[1]);

    assert.equal(params.get("start"), "2026-09-01");
    assert.equal(params.get("end"), "2026-09-30");
    assert.equal(params.get("clientId"), "client-3");
    assert.equal(params.get("projectId"), "project-4");
    assert.equal(params.get("statuses"), "open,in_progress,blocked");
  });
});

describe("what a valid window may legitimately contain", () => {
  const cases = /** @type {const} */ ([
    ["an empty window", windowBody()],
    ["a persisted task", windowBody({ tasks: [persistedRow()] })],
    ["a virtual occurrence whose task_id is empty", windowBody({ tasks: [virtualRow()] })],
    ["both row kinds together", windowBody({ tasks: [persistedRow(), virtualRow()] })],
    ["a reminder for a task outside the window's rows", windowBody({ reminders: [reminderMarker()] })],
    ["a disabled task source", windowBody({ source_enabled: false, tasks: [persistedRow()] })],
  ]);

  for (const [name, body] of cases) {
    it(`accepts ${name}`, async () => {
      const { published } = loadTaskCalendar({ loadRoute: async () => body });
      const result = await published.fetchCalendarWindow(RANGE, {});
      assert.equal(result.tasks.length, body.tasks.length);
      assert.equal(result.reminders.length, body.reminders.length);
      assert.equal(result.source_enabled, body.source_enabled);
    });
  }

  it("keeps a reminder whose task is absent from the rows, because the lookahead intends that", async () => {
    // `calendarWindow` reads tasks through a lookahead horizon past `endDate`, computes reminders
    // across all of them, then filters the rows down to `due_date <= endDate`. A marker firing
    // today for a task due next week is the designed case, not an inconsistency.
    const body = windowBody({ reminders: [reminderMarker()], tasks: [persistedRow()] });
    const { published } = loadTaskCalendar({ loadRoute: async () => body });
    const result = await published.fetchCalendarWindow(RANGE, {});

    assert.equal(result.reminders[0].task_id, "task-later");
    assert.ok(!result.tasks.some((/** @type {{ task_id: string }} */ row) => row.task_id === "task-later"));
  });

  it("forwards the rows and markers by identity, richer producer members included", async () => {
    const row = persistedRow({ someLaterProducerField: 7 });
    const marker = reminderMarker();
    const body = windowBody({ reminders: [marker], tasks: [row] });
    const { published } = loadTaskCalendar({ loadRoute: async () => body });
    const result = await published.fetchCalendarWindow(RANGE, {});

    assert.equal(result.tasks[0], row, "the row object itself reaches the renderer");
    assert.equal(result.reminders[0], marker);
    assert.equal(/** @type {Record<string, unknown>} */ (result.tasks[0]).someLaterProducerField, 7,
      "nothing is stripped to fit the type");
  });
});

describe("what a malformed body must not become", () => {
  const rejected = /** @type {const} */ ([
    ["a non-object body", "not-a-body"],
    ["a null body", null],
    ["a missing range", { reminders: [], source_enabled: true, tasks: [] }],
    ["a range with no startDate", windowBody({ range: { endDate: "2026-09-30" } })],
    ["a non-boolean source_enabled", windowBody({ source_enabled: "yes" })],
    ["a missing tasks container", { range: { endDate: "b", startDate: "a" }, reminders: [], source_enabled: true }],
    ["a tasks container that is not an array", windowBody({ tasks: {} })],
    ["a reminders container that is not an array", windowBody({ reminders: {} })],
    ["a row missing its title", windowBody({ tasks: [persistedRow({ title: undefined })] })],
    ["a row whose allDay is not boolean", windowBody({ tasks: [persistedRow({ allDay: "no" })] })],
    ["a row that is not an object", windowBody({ tasks: ["task-1"] })],
    ["a virtual row with no templateId", windowBody({ tasks: [virtualRow({ templateId: undefined })] })],
    ["a virtual row with no instanceDate", windowBody({ tasks: [virtualRow({ instanceDate: undefined })] })],
    ["a row carrying recurrence identity without claiming to be virtual",
      windowBody({ tasks: [persistedRow({ instanceDate: "2026-09-10", templateId: "template-9" })] })],
    ["a marker with no date", windowBody({ reminders: [reminderMarker({ date: undefined })] })],
    ["a marker whose due_kind is not one the producer writes",
      windowBody({ reminders: [reminderMarker({ due_kind: "date" })] })],
    ["a marker whose offset_minutes is text", windowBody({ reminders: [reminderMarker({ offset_minutes: "60" })] })],
    ["a marker that is not an object", windowBody({ reminders: [null] })],
  ]);

  for (const [name, body] of rejected) {
    it(`refuses ${name} on the loader transport`, async () => {
      const { published } = loadTaskCalendar({ loadRoute: async () => body });
      await assert.rejects(() => published.fetchCalendarWindow(RANGE, {}),
        /The calendar response could not be read\./);
    });

    it(`refuses ${name} on the native transport`, async () => {
      const { published } = loadTaskCalendar({ fetch: () => okResponse(body) });
      await assert.rejects(() => published.fetchCalendarWindow(RANGE, {}),
        /The calendar response could not be read\./);
    });
  }

  it("refuses the shape the older end-to-end stubs sent, because the producer cannot emit it", async () => {
    // Two Playwright stubs described a calendar row with six members. `taskCalendarRow` writes
    // twelve on every row it builds and `virtualTaskCalendarRow` writes fifteen, so that shape was
    // never a response this endpoint could return. Both fixtures were corrected against the
    // producer rather than the reader being loosened to accept them.
    const olderStubRow = {
      due_date: "2026-09-10",
      due_time: "09:00",
      priority: "normal",
      status: "open",
      task_id: "dashboard-lazy-dialog-proof",
      title: "Lazy editor proof",
    };
    const { published } = loadTaskCalendar({ loadRoute: async () => windowBody({ tasks: [olderStubRow] }) });
    await assert.rejects(() => published.fetchCalendarWindow(RANGE, {}),
      /The calendar response could not be read\./);
  });

  it("makes no second request and no fallback retry when a body is refused", async () => {
    let fetched = 0;
    const { published, seen } = loadTaskCalendar({
      loadRoute: async () => ({ broken: true }),
      fetch: () => {
        fetched += 1;
        return okResponse(windowBody());
      },
    });
    await assert.rejects(() => published.fetchCalendarWindow(RANGE, {}));
    assert.equal(seen.calls, 1, "one request, and it is not retried");
    assert.equal(fetched, 0, "a bad body is not a reason to try the other transport");
  });
});

describe("the transport error paths this checkpoint must not disturb", () => {
  it("keeps the native 403 message", async () => {
    const { published } = loadTaskCalendar({
      fetch: () => ({ json: async () => ({}), ok: false, status: 403 }),
    });
    await assert.rejects(() => published.fetchCalendarWindow(RANGE, {}),
      /^Error: You do not have permission to view tasks\.$/);
  });

  it("keeps the status in every other non-OK message", async () => {
    const { published } = loadTaskCalendar({
      fetch: () => ({ json: async () => ({}), ok: false, status: 503 }),
    });
    await assert.rejects(() => published.fetchCalendarWindow(RANGE, {}),
      /^Error: Could not load calendar data: 503$/);
  });

  it("lets a dashboard loader rejection through unchanged", async () => {
    const failure = new Error("dashboard bootstrap is offline");
    const { published } = loadTaskCalendar({ loadRoute: async () => { throw failure; } });
    await assert.rejects(() => published.fetchCalendarWindow(RANGE, {}),
      (/** @type {unknown} */ error) => {
        assert.equal(error, failure, "the loader's own error reaches the caller");
        return true;
      });
  });

  it("never materializes a recurrence occurrence while reading the window", async () => {
    /** @type {string[]} */
    const routes = [];
    const { published } = loadTaskCalendar({
      loadRoute: async (route) => {
        routes.push(String(route));
        return windowBody({ tasks: [virtualRow()] });
      },
    });
    await published.fetchCalendarWindow(RANGE, {});

    assert.deepEqual(routes.filter((route) => route.includes("materialize")), [],
      "a calendar GET projects occurrences and never creates them");
    assert.equal(routes.length, 1);
  });
});

describe("the source this checkpoint leaves in place", () => {
  it("keeps the reader private to the helper", () => {
    assert.ok(!/readCalendarWindow[,\s]*$/m.test(source.slice(source.lastIndexOf("root.taskCalendar"))),
      "the reader must not join the published surface");
    assert.ok(source.includes("root.taskCalendar = Object.freeze({"), "the publication stays frozen");
  });

  it("publishes exactly the nine members it published before", () => {
    const block = source.slice(source.lastIndexOf("root.taskCalendar = Object.freeze({"));
    const members = block.slice(block.indexOf("{") + 1, block.indexOf("})")).split(",")
      .map((entry) => entry.trim()).filter(Boolean);
    assert.deepEqual(members, [
      "addDays", "calendarRange", "dateKeyOf", "fetchCalendarWindow", "normalizeCalendarView",
      "parseDateKey", "readPreferredCalendarView", "renderCalendarBody", "resolveDefaultView",
    ], "this response checkpoint adds no member and removes none");
  });

  it("routes both branches through the reader exactly once", () => {
    const block = source.slice(source.indexOf("async function fetchCalendarWindow"));
    const body = block.slice(0, block.indexOf("\n  }\n"));
    assert.equal((body.match(/readCalendarWindow\(/g) || []).length, 1,
      "one validation point, shared by both transports");
    assert.ok(body.includes("await dashboardLoadRoute(route)"));
    assert.ok(body.includes("await readNativeCalendarResponse(route)"));
  });
});
