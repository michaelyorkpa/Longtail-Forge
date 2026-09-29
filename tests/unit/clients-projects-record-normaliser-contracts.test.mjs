import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * The Clients/Projects record normalisers and their sinks (`0.33.33.43.58`, operator-approved).
 *
 * `normalizeData`, `normalizeClientRecord`, `normalizeProjects` and their sub-normalisers now take
 * the wire's values as `unknown` and read them through `readWireMember`. Proved beside `1c78eaf0`
 * through the real normalisers:
 * - every body gives the same reads, in the same order and with the same receivers;
 * - every body gives the same records, with the same members, value types and identities;
 * - a failure is the same kind at the same read, after the same reads, and a getter's own error
 *   propagates as that very error.
 *
 * Two differences are expected, and each is named where it is asserted:
 * - a required read of a nullish value now throws this file's `TypeError`, as the checked reader
 *   was approved to at `0.33.33.43.57`;
 * - the approved refusal: when `clients` answers a list and then a non-list, the page now throws
 *   its own `TypeError` rather than using the second answer's `map`, even a callable one.
 *
 * The sinks' conversions are proved on native controls in
 * `clients-projects-record-sink-conversion.spec.mjs`. Here, the representative call sites show
 * that each sink receives the value it always did and applies exactly that conversion to it.
 */

const BASE = "1c78eaf0";
const current = createProjectTextReader().readText("public/js/clients-projects.js");
const baseline = execFileSync("git", ["show", `${BASE}:public/js/clients-projects.js`], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

/** @type {ReadonlyArray<readonly [string, string]>} */
const VERSIONS = [["current", current], [BASE, baseline]];

const NORMALISERS = [
  "normalizeData", "normalizeProjects", "normalizeClientRecord", "buildWorkspaceProjectsGrouping",
  "workspaceProjectsLabel", "usesProjectRoundingOnly", "clientsEnabledForWorkspace",
  "normalizeBillableFlag", "normalizeBillingRate", "normalizeOptionalBillingPeriod", "normalizeBillingPeriod",
  "normalizeOptionalBillingRounding", "normalizeBillingRounding", "normalizeProjectTaskDefaults",
  "normalizeProjectTaskSortOrder", "parseJsonArray", "normalizeTaskReminderPolicy", "normalizeReminderOffsetList",
  "normalizeTags", "normalizeBillingContact", "vocabularyHas",
];
const CONSTANTS = [
  "clientStatuses", "projectStatuses", "taskDefaultStatuses", "taskDefaultPriorities", "taskDefaultAssigneeModes",
  "defaultProjectTaskSortOrder", "billingContactFields",
];

/** @param {string} text @param {string} opener @param {string} closer */
function declaration(text, opener, closer) {
  const at = text.indexOf(opener);
  expect(at, opener).toBeGreaterThan(-1);
  return text.slice(at, text.indexOf(closer, at) + closer.length);
}

/**
 * One version's page functions, lifted into a fresh sandbox with the wire reader when the version
 * has it.
 * @param {string} text @param {string[]} names @param {{ projectsPage?: boolean, workspaceType?: string, globals?: Record<string, unknown> }} [options]
 */
function pageFrom(text, names, { projectsPage = true, workspaceType = "business", globals = {} } = {}) {
  const context = vm.createContext({
    window: { LongtailForge: { getWorkspaceProjectsLabel: () => "Workspace Work" } },
    isProjectsPage: projectsPage,
    ...globals,
  });
  for (const name of CONSTANTS) vm.runInContext(declaration(text, `  const ${name} = [`, "];"), context);
  vm.runInContext(declaration(text, "  let workspaceSettings = {", "\n  };"), context);
  vm.runInContext(`workspaceSettings.workspaceType = ${JSON.stringify(workspaceType)};`, context);
  if (text.includes("  function readWireMember(")) {
    vm.runInContext(extractFunctionBlock(text, "readWireMember"), context);
  }
  for (const name of names) vm.runInContext(extractFunctionBlock(text, name), context);
  return context;
}

/** @param {string} text @param {{ projectsPage?: boolean, workspaceType?: string }} [options] */
function normalizeDataFrom(text, options) {
  /** @type {(data: unknown) => unknown} */
  const normalizeData = vm.runInContext("normalizeData", pageFrom(text, NORMALISERS, options));
  return normalizeData;
}

/**
 * A value as plain data that keeps what JSON would lose: `undefined` members, holes, value types,
 * negative zero, and which objects are the same object.
 * @param {unknown} value @param {Map<object, number>} [seen]
 * @returns {unknown}
 */
function shape(value, seen = new Map()) {
  if (value === undefined) return { undefined: true };
  if (typeof value === "number") return { number: Object.is(value, -0) ? "-0" : String(value) };
  if (typeof value === "symbol") return { symbol: value.description };
  if (typeof value === "bigint") return { bigint: String(value) };
  if (typeof value === "function") return { function: true };
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return { sameAs: seen.get(value) };
  seen.set(value, seen.size);
  if (Array.isArray(value)) {
    return { array: Array.from({ length: value.length }, (_, index) => (index in value ? shape(value[index], seen) : { hole: true })) };
  }
  return { object: Object.fromEntries(Object.keys(value).map((key) => [key, shape(Reflect.get(value, key), seen)])) };
}

/**
 * What one call answered or threw, as comparable data.
 * @param {() => unknown} call
 */
function outcome(call) {
  try {
    return { value: shape(call()) };
  } catch (error) {
    const thrown = /** @type {{ name?: unknown, message?: unknown }} */ (Object(error));
    return { threw: String(thrown.name), message: String(thrown.message) };
  }
}

/**
 * A value wrapped so every member read, own-property check and `in` test is logged, with its path
 * and whether the read used the value itself as the receiver.
 * @param {unknown} value @param {string[]} log @param {string} [path]
 * @returns {unknown}
 */
function logged(value, log, path = "body") {
  if (value === null || typeof value !== "object") {
    return value;
  }
  /** @type {ProxyHandler<object>} */
  const handler = {
    get(target, key, receiver) {
      const name = String(key);
      log.push(`get ${path}.${name}${receiver === proxy ? "" : " (other receiver)"}`);
      const member = Reflect.get(target, key, receiver);
      return typeof member === "function" ? member : logged(member, log, `${path}.${name}`);
    },
    getOwnPropertyDescriptor(target, key) {
      log.push(`own ${path}.${String(key)}`);
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
    has(target, key) {
      log.push(`has ${path}.${String(key)}`);
      return Reflect.has(target, key);
    },
  };
  const proxy = new Proxy(value, handler);
  return proxy;
}

/** A client project row as `clients.service` shapes it. @param {Record<string, unknown>} [overrides] */
function wireProject(overrides = {}) {
  return {
    id: "p-1", workspace_id: "ws-1", client_id: "c-1", parent_project_id: null, name: "Website", status: "Active",
    billable: "yes", billing_rate: "140.00", billing_period: null, billing_rounding: { type: "inherit" },
    task_default_priority: "high", task_default_status: "open", task_default_assignee_mode: "project_admin",
    task_default_sort_order_json: '["priority","due_date"]', depth: 0, can_manage: true,
    taskReminderPolicy: { inherited: true, offsets: { dateTime: [120, 1440], dateOnly: [4320, 1440] } },
    tags: [{ tag_id: "t-1", name: "VIP", slug: "vip", color: "#aa0000", description: "Key account" }],
    created_at: "2026-09-01T12:00:00Z",
    ...overrides,
  };
}

/** A client row as `clients.service` shapes it. @param {Record<string, unknown>} [overrides] */
function wireClient(overrides = {}) {
  return {
    id: "c-1", workspace_id: "ws-1", name: "Acme Co", parent_client_id: null, status: "Active", billable: "yes",
    billing_rate: "125.00", billing_period: { type: "custom", startDay: 15 },
    billing_rounding: { type: "custom", enabled: true, increment: "nearestHalfHour" },
    billing_contact: { name: "Ada", email: "ada@example.com", phone_number: "555", extra: "kept out" },
    depth: 0, can_create_child: true, can_create_project: true, can_manage: true, can_manage_projects: true,
    taskReminderPolicy: { inherited: false, offsets: { dateTime: [60], dateOnly: [1440] } },
    tags: [{ tag_id: "t-2", name: " Priority ", slug: "priority", color: "" }],
    projects: [wireProject(), wireProject({ id: "p-2", name: "Retainer", parent_project_id: "p-1", status: "Completed", tags: [] })],
    ...overrides,
  };
}

/** A whole `/api/client-projects?include=reminderPolicy` body. @param {Record<string, unknown>} [overrides] */
function wireBody(overrides = {}) {
  return {
    capabilities: { can_create_top_level_client: true, can_create_workspace_project: true, can_manage_workspace_projects: false },
    workspaceProjects: [wireProject({ id: "w-1", client_id: undefined, name: "Internal", billing_rate: null })],
    clients: [
      wireClient(),
      wireClient({ id: "c-2", name: "Child Co", parent_client_id: "c-1", status: "Inactive", billable: "no", projects: [] }),
    ],
    ...overrides,
  };
}

/**
 * Every body the comparison runs, each built fresh. `wording` names the one message change a case
 * is expected to show; `same` means none.
 * @returns {Array<{ name: string, wording: "same" | "nullish-read", body: () => unknown }>}
 */
function bodyCases() {
  /** @type {Array<{ name: string, wording: "same" | "nullish-read", body: () => unknown }>} */
  const cases = [
    { name: "a real body", wording: "same", body: () => wireBody() },
    { name: "an empty body", wording: "same", body: () => ({}) },
    { name: "a null body", wording: "nullish-read", body: () => null },
    { name: "an absent body", wording: "nullish-read", body: () => undefined },
    ...[0, "", "text", 5, true, []].map((body) => ({ name: `the body ${JSON.stringify(body)}`, wording: /** @type {const} */ ("same"), body: () => body })),
    ...[{}, "text", null, 5].map((clients) => ({
      name: `clients ${JSON.stringify(clients)}, which is not a list`, wording: /** @type {const} */ ("same"), body: () => wireBody({ clients }),
    })),
    { name: "a null client", wording: "nullish-read", body: () => wireBody({ clients: [null] }) },
    { name: "an absent client after a real one", wording: "nullish-read", body: () => wireBody({ clients: [wireClient(), undefined] }) },
    { name: "primitive clients", wording: "same", body: () => wireBody({ clients: [5, "text", true] }) },
    { name: "an empty client", wording: "same", body: () => wireBody({ clients: [{}] }) },
    { name: "a sparse client list", wording: "same", body: () => wireBody({ clients: Object.assign([], { 1: wireClient() }) }) },
    { name: "a null project", wording: "nullish-read", body: () => wireBody({ clients: [wireClient({ projects: [null] })] }) },
    { name: "projects that are not a list", wording: "same", body: () => wireBody({ clients: [wireClient({ projects: "text" })] }) },
    { name: "an empty project", wording: "same", body: () => wireBody({ clients: [wireClient({ projects: [{}] })] }) },
    { name: "a null tag", wording: "nullish-read", body: () => wireBody({ clients: [wireClient({ tags: [null] })] }) },
    { name: "primitive tags", wording: "same", body: () => wireBody({ clients: [wireClient({ tags: [5, "t"] })] }) },
    {
      name: "every reminder-policy shape",
      wording: "same",
      body: () => wireBody({
        clients: [null, { offsets: null }, { offsets: { dateTime: [30, "45", "bad", 1, 2] } }, "text", { date_time: [15], dateOnly: [99] }]
          .map((taskReminderPolicy, index) => wireClient({ id: `c-${index}`, taskReminderPolicy, projects: [] })),
      }),
    },
    {
      name: "every task-defaults shape",
      wording: "same",
      body: () => wireBody({
        clients: [wireClient({
          projects: [
            wireProject({ taskDefaults: { priority: "urgent", sortOrder: ["status"] } }),
            wireProject({ taskDefaults: null, task_defaults: { defaultAssigneeMode: "unassigned" } }),
            wireProject({ task_default_sort_order_json: '["status","bogus"]' }),
            wireProject({ task_default_sort_order_json: "not json", task_default_priority: 7 }),
          ],
        })],
      }),
    },
    {
      name: "every billing shape",
      wording: "same",
      body: () => wireBody({
        clients: [
          wireClient({ billing_period: { type: "inherit" }, billing_rounding: { type: "inherit" } }),
          wireClient({ billing_period: { type: "custom", startDay: "31" }, billing_rounding: { enabled: 1, increment: "nearestHour" } }),
          wireClient({ billing_period: "text", billing_rounding: "text", billing_contact: "text", billing_rate: 0 }),
          wireClient({ billing_contact: null }),
          wireClient({ billing_contact: { name: 0, email: false } }),
        ],
      }),
    },
    {
      name: "identifiers and names of other kinds",
      wording: "same",
      body: () => wireBody({
        clients: [
          wireClient({ id: 7, name: 0, parent_client_id: 0, projects: [wireProject({ id: 8, client_id: 0, name: null, parent_project_id: 9 })] }),
          wireClient({ id: "", name: null, status: "active" }),
          wireClient({ id: { key: "c-object" }, name: { toString: () => "Named" }, status: 1 }),
        ],
      }),
    },
    { name: "extra members everywhere", wording: "same", body: () => wireBody({ extra: true, clients: [{ ...wireClient(), extra: 1 }] }) },
    { name: "an inherited client", wording: "same", body: () => wireBody({ clients: [Object.create(wireClient())] }) },
    {
      name: "getter-backed members",
      wording: "same",
      body: () => wireBody({
        clients: [{ ...wireClient(), get status() { return "Inactive"; }, get projects() { return [wireProject()]; } }],
      }),
    },
    ...[null, {}, { can_create_top_level_client: "true", can_manage_workspace_projects: true }, "text"].map((capabilities) => ({
      name: `capabilities ${JSON.stringify(capabilities)}`, wording: /** @type {const} */ ("same"), body: () => wireBody({ capabilities }),
    })),
    { name: "no workspace projects", wording: "same", body: () => wireBody({ workspaceProjects: undefined }) },
  ];
  return cases;
}

describe(`The record normalisers answer what ${BASE} answered`, () => {
  for (const projectsPage of [true, false]) {
    for (const workspaceType of ["business", "personal"]) {
      const label = `${projectsPage ? "projects" : "clients"} page, ${workspaceType} workspace`;
      it(`with the same reads and the same records or failures for every body (${label})`, () => {
        const [now, before] = VERSIONS.map(([, text]) => normalizeDataFrom(text, { projectsPage, workspaceType }));
        for (const { name, wording, body } of bodyCases()) {
          /** @type {string[]} */
          const nowLog = [];
          /** @type {string[]} */
          const beforeLog = [];
          const nowOutcome = outcome(() => now(logged(body(), nowLog)));
          const beforeOutcome = outcome(() => before(logged(body(), beforeLog)));
          expect(nowLog, `${name}: the reads`).toEqual(beforeLog);

          const plainNow = outcome(() => now(body()));
          const plainBefore = outcome(() => before(body()));
          if (wording === "same") {
            expect(plainNow, name).toEqual(plainBefore);
            expect(nowOutcome.threw, name).toBe(beforeOutcome.threw);
            continue;
          }
          // The approved nullish-read wording: the same TypeError at the same read, after the same
          // reads. The engine named the member and the nullish value it failed on; so does the page.
          expect(plainBefore.threw, `${name}: it failed before`).toBe("TypeError");
          const [, nullish, member] = /^Cannot read properties of (null|undefined) \(reading '([^']+)'\)$/.exec(String(plainBefore.message)) || [];
          expect(member, `${name}: the old failure named its read`).toBeTruthy();
          expect(plainNow, name).toEqual({ threw: "TypeError", message: `Clients/Projects cannot read "${member}" from ${nullish} loaded data.` });
        }
      });
    }
  }

  it("anchors the read log the comparison relies on", () => {
    /** @type {string[]} */
    const log = [];
    normalizeDataFrom(current, { projectsPage: true })(logged(wireBody(), log));
    expect(log.filter((entry) => entry === "get body.clients"), "clients is read to test and then to map").toHaveLength(2);
    expect(log.filter((entry) => entry === "get body.clients.0.status"), "a kept status is read to test and then to keep").toHaveLength(2);
    expect(log).toContain("get body.clients.0.projects.1.task_default_sort_order_json");
    expect(log.some((entry) => entry.endsWith("(other receiver)")), "every read uses the value itself as receiver").toBe(false);
  });

  it("keeps each identifier the very value the wire held", () => {
    for (const [version, text] of VERSIONS) {
      const id = { key: "c-object" };
      const projectId = { key: "p-object" };
      const result = /** @type {{ clients: Array<{ id: unknown, projects: Array<{ id: unknown, client_id: unknown }> }> }} */ (
        normalizeDataFrom(text, { projectsPage: false })(wireBody({ clients: [wireClient({ id, projects: [wireProject({ id: projectId, client_id: undefined })] })] }))
      );
      expect(result.clients[0].id, version).toBe(id);
      expect(result.clients[0].projects[0].id, version).toBe(projectId);
      expect(result.clients[0].projects[0].client_id, `${version}: the owner's id fills an absent one`).toBe(id);
    }
  });

  it("lets a getter's own error through as that very error, after the same reads", () => {
    for (const [version, text] of VERSIONS) {
      const failure = new RangeError("the wire refused");
      const body = wireBody({ clients: [{ ...wireClient(), get name() { throw failure; } }] });
      let caught = null;
      try {
        normalizeDataFrom(text)(body);
      } catch (error) {
        caught = error;
      }
      expect(caught, version).toBe(failure);
    }
  });
});

describe("The second clients read, re-tested as approved", () => {
  /**
   * A body whose `clients` answers each read in turn, and counts them.
   * @param {unknown[]} answers
   */
  const shifting = (answers) => {
    const reads = { count: 0 };
    const body = {
      get clients() {
        const answer = answers[Math.min(reads.count, answers.length - 1)];
        reads.count += 1;
        return answer;
      },
    };
    return { body, reads };
  };

  it("reads a non-list once and answers the empty branch, as before", () => {
    for (const [version, text] of VERSIONS) {
      const { body, reads } = shifting([{ map: () => ["foreign"] }]);
      const result = /** @type {{ clients: unknown[] }} */ (normalizeDataFrom(text, { projectsPage: false })(body));
      expect(result.clients, version).toEqual([]);
      expect(reads.count, version).toBe(1);
    }
  });

  it("maps a second list, not the first, with its own map and receiver, as before", () => {
    for (const [version, text] of VERSIONS) {
      const second = [wireClient({ id: "second" })];
      /** @type {unknown[]} */
      const receivers = [];
      const withOwnMap = Object.assign([wireClient({ id: "own" })], {
        /** @param {(value: unknown, index: number, array: unknown[]) => unknown} callback */
        map(callback) {
          receivers.push(this);
          return Array.prototype.map.call(this, callback);
        },
      });
      const plain = shifting([[wireClient({ id: "first" })], second]);
      const ids = (/** @type {unknown} */ result) => /** @type {{ clients: Array<{ id: unknown }> }} */ (result).clients.map((client) => client.id);
      expect(ids(normalizeDataFrom(text, { projectsPage: false })(plain.body)), version).toEqual(["second"]);
      expect(plain.reads.count, version).toBe(2);
      const own = shifting([[], withOwnMap]);
      expect(ids(normalizeDataFrom(text, { projectsPage: false })(own.body)), version).toEqual(["own"]);
      expect(receivers, `${version}: the collection's own map, with the collection as receiver`).toEqual([withOwnMap]);
    }
  });

  it("refuses a second answer that is not a list, where the old read used it: the approved new refusal", () => {
    const [now, before] = VERSIONS.map(([, text]) => normalizeDataFrom(text, { projectsPage: false }));
    const refusal = { threw: "TypeError", message: "Clients/Projects clients collection changed while being read." };
    for (const second of [null, {}, "text", { map: () => [] }]) {
      const current = shifting([[], second]);
      expect(outcome(() => now(current.body)), JSON.stringify(second)).toEqual(refusal);
      expect(current.reads.count, "and it does not read clients a third time").toBe(2);
    }
    // The behaviour this replaces: the old read failed on these, with the engine's words...
    for (const second of [null, {}, "text"]) {
      expect(outcome(() => before(shifting([[], second]).body)).threw, JSON.stringify(second)).toBe("TypeError");
    }
    // ...and used a second answer's own callable map, which is no longer done.
    expect(outcome(() => before(shifting([[], { map: () => [] }]).body))).toEqual({ value: shape({
      capabilities: { canCreateTopLevelClient: false, canCreateWorkspaceProject: false, canManageWorkspaceProjects: false },
      clients: [],
    }) });
  });
});

/**
 * One version's representative sinks, lifted with the fake DOM and the page's helpers.
 * @param {string} text
 */
function sinksFrom(text) {
  const document = new FakeDocument();
  /** @type {unknown[]} */
  const requests = [];
  const context = pageFrom(text, [
    ...NORMALISERS, "createAddProjectSubmitButton", "createStatusSelect", "createClientStatusSelect", "createOption",
    "requirePageController", "getRealClients", "isRealClient", "getClientDescendantIds", "getProjectDescendantIds",
    "getProjectClientName", "getProjectTargetClient", "getWorkspaceProjectClient", "isWorkspaceGrouping", "archiveProjectRecord",
  ], {
    globals: {
      document,
      ...fakeDomConstructors(),
      requireApi: () => ({ deleteJson: async (/** @type {unknown} */ url) => { requests.push(url); } }),
      persistClientProjectChange: async (/** @type {unknown} */ _action, /** @type {unknown} */ _state, /** @type {() => Promise<void>} */ write) => write(),
    },
  });
  Reflect.set(Reflect.get(context, "window"), "LongtailForge", {
    getWorkspaceProjectsLabel: () => "Workspace Work",
    pageController: {
      /** @param {unknown} value @param {unknown} label */
      createOption(value, label) {
        const option = document.createElement("option");
        option.value = String(value);
        option.textContent = label === undefined ? "" : String(label);
        return option;
      },
    },
  });
  vm.runInContext("let clientProjectData = { capabilities: {}, clients: [] };", context);
  /** @type {Record<string, (...args: unknown[]) => unknown>} */
  const page = vm.runInContext(`({
    load: (wire) => { clientProjectData = normalizeData(wire); return clientProjectData; },
    createAddProjectSubmitButton, createStatusSelect, createClientStatusSelect, getClientDescendantIds,
    getProjectDescendantIds, getProjectClientName, getProjectTargetClient, archiveProjectRecord,
  })`, context);
  return { page, requests };
}

/** The platform's own conversion at a `dataset` write, proved in Chromium by the sink spec. @param {unknown} value */
const datasetConversion = (value) => `${value}`;

describe("The representative sinks receive the value they always did", () => {
  const values = ["c-1", "", " spaced ", 7, 0, null, undefined, true, { toString: () => "custom" }];

  it("writes the add-project marker as the dataset write always converted it", () => {
    const [now, before] = VERSIONS.map(([, text]) => sinksFrom(text).page);
    for (const value of values) {
      const nowButton = /** @type {{ dataset: Record<string, unknown> }} */ (now.createAddProjectSubmitButton(value));
      const beforeButton = /** @type {{ dataset: Record<string, unknown> }} */ (before.createAddProjectSubmitButton(value));
      // The fake stores what it is handed: the old write handed over the raw value for the platform
      // to convert, and the new write hands over that same value, converted as the platform did.
      expect(beforeButton.dataset.addProjectButton, String(value)).toBe(value);
      expect(nowButton.dataset.addProjectButton, String(value)).toBe(datasetConversion(value));
    }
  });

  it("selects the same status option by strict equality, for any kept value", () => {
    const [now, before] = VERSIONS.map(([, text]) => sinksFrom(text).page);
    for (const name of ["createStatusSelect", "createClientStatusSelect"]) {
      for (const value of ["Active", "Inactive", "Completed", "active", 1, null, undefined]) {
        const selected = (/** @type {Record<string, (...args: unknown[]) => unknown>} */ page) => {
          const select = /** @type {{ children: Array<{ value: string, selected: boolean }> }} */ (page[name](value));
          return select.children.map((option) => [option.value, option.selected]);
        };
        expect(selected(now), `${name} ${String(value)}`).toEqual(selected(before));
      }
    }
  });

  it("finds, collects and names records by their own identifiers, of any kind", () => {
    const wire = wireBody({
      clients: [
        wireClient({ id: 7, name: "Seven", projects: [wireProject({ id: 70, client_id: 7 }), wireProject({ id: 71, client_id: 7, parent_project_id: 70 })] }),
        wireClient({ id: 8, name: "Eight", parent_client_id: 7, projects: [] }),
        wireClient({ id: "7", name: "Text seven", projects: [] }),
      ],
    });
    const answers = VERSIONS.map(([, text]) => {
      const { page } = sinksFrom(text);
      const data = /** @type {{ clients: unknown[] }} */ (page.load(wire));
      const seven = data.clients.find((entry) => Reflect.get(Object(entry), "id") === 7);
      return shape({
        descendants: [page.getClientDescendantIds(7), page.getClientDescendantIds("7"), page.getClientDescendantIds(0)],
        projectDescendants: [page.getProjectDescendantIds(70, seven), page.getProjectDescendantIds("70", seven)],
        names: [page.getProjectClientName(7), page.getProjectClientName("7"), page.getProjectClientName(""), page.getProjectClientName(null)],
        targets: [7, "7", 8, 9, "", null].map((id) => Reflect.get(Object(page.getProjectTargetClient(id)), "name")),
      });
    });
    expect(answers[0]).toEqual(answers[1]);
    expect(answers[0]).toMatchObject({ object: { descendants: { array: [{ array: [{ number: "8" }] }, { array: [] }, { array: [] }] } } });
  });

  it("routes an archive through the URL encoding's own conversion", async () => {
    for (const id of ["p/1 & 2", 7, null, { toString: () => "custom" }]) {
      const [now, before] = await Promise.all(VERSIONS.map(async ([, text]) => {
        const { page, requests } = sinksFrom(text);
        await page.archiveProjectRecord({ id }, { action: "project_archived" });
        return requests;
      }));
      expect(now, String(id)).toEqual(before);
    }
  });
});

describe("Only the record path changed", () => {
  it("types every normaliser the wire reaches, and nothing is held any more", () => {
    for (const [name, parameter] of [["normalizeData", "data"], ["normalizeClientRecord", "client"], ["normalizeProjects", "projects"]]) {
      const at = current.indexOf(`  function ${name}(`);
      const doc = current.slice(current.lastIndexOf("/**", at), at);
      expect(doc, name).toMatch(new RegExp(`@param \\{unknown\\} ${parameter}\\b`));
      expect(doc, name).not.toMatch(/pending/);
    }
  });
});
