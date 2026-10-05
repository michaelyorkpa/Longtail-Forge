import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/shared/client-project-options.js");

/**
 * How `clientProjectOptions.normalizeClients` reads a wire body, through the real module.
 *
 * `0.33.33.39.31` took `client-project-options.js` to zero. Every optional-chain read of a wire
 * record now goes through `recordMember`, one call per original read site; the record spread goes
 * through `recordFields`, which copies exactly what the bare spread copied; each list is read once
 * through `recordList`; `startDay` reaches `parseInt` through a template, which is the ToString
 * `parseInt` applied; and an increment is accepted by `find` with `===` rather than `includes`.
 * These cases hold each of those to what it did, and name the two reads that now happen once.
 *
 * `client-project-options.test.mjs` already proves the hierarchy order and labels.
 */

/** @typedef {Record<string, unknown>} Bag */

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

/** @param {unknown} value @returns {value is (...args: unknown[]) => unknown} */
const isCallable = (value) => typeof value === "function";

/** @param {unknown} value @returns {Bag[]} */
function bags(value) {
  assert.ok(Array.isArray(value), "a list of records");
  return value.map((entry) => {
    assert.ok(isBag(entry), "each entry is a record");
    return entry;
  });
}

/** A value from the module's realm, compared as data. @param {unknown} value @returns {unknown} */
const plain = (value) => JSON.parse(JSON.stringify(value));

function load() {
  /** @type {Bag} */
  const window = {};
  vm.runInNewContext(source, { window }, { filename: "client-project-options.js" });
  const namespace = window.LongtailForge;
  assert.ok(isBag(namespace));
  const api = namespace.clientProjectOptions;
  assert.ok(isBag(api));
  const { normalizeClients } = api;
  assert.ok(isCallable(normalizeClients));
  /** @param {unknown[]} args */
  return (...args) => bags(Reflect.apply(normalizeClients, api, args));
}

const normalize = load();

/** The one client a body of one client normalises to. @param {Bag} fields */
function onlyClient(fields) {
  const [client, ...rest] = normalize({ clients: [{ id: "c", name: "C", ...fields }] });
  assert.equal(rest.length, 0);
  assert.ok(client, "the client survives");
  return client;
}

/** @param {() => unknown} build */
function thrown(build) {
  try {
    build();
  } catch (error) {
    assert.ok(isBag(error));
    return String(error.name);
  }
  return null;
}

describe("normalizeClients reads the body as the optional chains did", () => {
  it("answers [] for any body it cannot use", () => {
    for (const data of [undefined, null, "clients", 7, {}, { clients: null }, { clients: {} }, { clients: "ab" },
      { workspaceProjects: {} }, { workspaceProjects: "ab" }]) {
      assert.equal(normalize(data).length, 0);
    }
  });

  it("keeps what the spread carried as the record's own data, and builds the rest", () => {
    const body = JSON.parse('{"clients":[{"id":" c1 ","name":" Client ","custom":"kept","__proto__":{"polluted":true},'
      + '"projects":[{"id":"p1","name":"Project","extra":3}]}]}');
    const [client] = normalize(body);
    assert.ok(client);
    assert.equal(client.custom, "kept");
    assert.equal(Object.hasOwn(client, "__proto__"), true, "a parsed __proto__ key stays an own member");
    assert.equal(client.polluted, undefined, "and never becomes the prototype");
    assert.equal(client.id, "c1");
    assert.equal(client.name, "Client");
    const [project] = bags(client.projects);
    assert.ok(project);
    assert.equal(project.extra, 3);
    assert.equal(project.client_id, "", "a project's client id is read from the project, not its client");
  });

  it("honours both spellings of each parent and client id, snake_case first", () => {
    const clients = normalize({
      clients: [
        { id: "a", name: "A", projects: [
          { id: "p", name: "P", clientId: "a" },
          { id: "q", name: "Q", parentProjectId: "p" },
          { id: "r", name: "R", parent_project_id: "p", parentProjectId: "q" },
        ] },
        { id: "b", name: "B", parentClientId: "a" },
        { id: "c", name: "C", parent_client_id: "a", parentClientId: "b" },
      ],
    });
    assert.deepEqual(plain(clients.map((client) => [client.id, client.parent_client_id])), [["a", ""], ["b", "a"], ["c", "a"]]);
    const projects = bags(clients[0]?.projects);
    assert.deepEqual(plain(projects.map((project) => [project.id, project.client_id, project.parent_project_id])),
      [["p", "a", ""], ["q", "", "p"], ["r", "", "p"]]);
  });

  it("drops inactive records in any case and spacing unless asked to keep them", () => {
    const body = {
      clients: [{ id: "gone", name: "Gone", status: " INACTIVE " }, { id: "kept", name: "Kept", status: "active" }],
      workspaceProjects: [{ id: "w", name: "W", status: "Inactive" }],
    };
    assert.deepEqual(plain(normalize(body).map((client) => client.id)), ["kept"]);
    const all = normalize(body, { includeInactive: true });
    assert.deepEqual(plain(all.map((client) => [client.id, client.status])),
      [["__workspace_projects__", "Active"], ["gone", "Inactive"], ["kept", "Active"]]);
  });

  it("reads each member with the record as receiver, where and as often as it did", () => {
    /** @type {Record<string, number>} */
    const reads = {};
    /** @type {unknown[]} */
    const receivers = [];
    /** @type {Bag} */
    const client = {};
    for (const [key, value] of [["id", "c"], ["name", "C"], ["status", "Active"], ["billing_rate", "5"]]) {
      Object.defineProperty(client, key, {
        enumerable: true,
        get() { reads[key] = (reads[key] || 0) + 1; receivers.push(this); return value; },
      });
    }
    const [normalized] = normalize({ clients: [client] });
    assert.equal(normalized?.billingRate, 5);
    // The spread reads each once; `id`, `name` and the rate are read once more by name, and
    // `status` by the inactive filter and again by the status it builds.
    assert.deepEqual(reads, { id: 2, name: 2, status: 3, billing_rate: 2 });
    assert.ok(receivers.every((receiver) => receiver === client));
  });

  it("reads a list, and an accepted increment, once where it read them twice", () => {
    // A parsed body has no accessors, so the second read always answered the first one's value.
    let listReads = 0;
    let incrementReads = 0;
    const clients = [{ id: "c", name: "C", billing_rounding: { get increment() { incrementReads += 1; return "nearestHour"; } } }];
    const [client] = normalize({ get clients() { listReads += 1; return clients; } });
    assert.deepEqual(plain(client?.billingRounding), { enabled: false, increment: "nearestHour" });
    assert.deepEqual({ listReads, incrementReads }, { listReads: 1, incrementReads: 1 });
  });
});

describe("billable, money and the two override records", () => {
  it("keeps the two billable words and each fallback", () => {
    const [client] = normalize({ clients: [{ id: "c", name: "C", billable: false, projects: [
      { id: "p", name: "P" }, { id: "q", name: "Q", billable: "yes" }, { id: "r", name: "R", billable: "maybe" },
    ] }] });
    assert.equal(client?.billable, "no");
    assert.deepEqual(plain(bags(client?.projects).map((project) => project.billable)), ["no", "yes", "no"]);
    assert.equal(onlyClient({ billable: "maybe" }).billable, "yes");
    const [scope] = normalize({ workspaceProjects: [{ id: "w", name: "W" }] });
    assert.deepEqual(plain(bags(scope?.projects).map((project) => project.billable)), ["yes"]);
  });

  it("parses the rate to a finite number or null", () => {
    assert.equal(onlyClient({ billing_rate: "$1,250.50" }).billingRate, 1250.5);
    assert.equal(onlyClient({ billing_rate: "" }).billingRate, null);
    assert.equal(onlyClient({ billing_rate: null }).billingRate, null);
    assert.equal(onlyClient({ billing_rate: 0 }).billingRate, 0);
  });

  it("rebuilds a billing period, reading startDay through the same ToString", () => {
    /** @param {unknown} period */
    const periodOf = (period) => plain(onlyClient({ billing_period: period }).billingPeriod);
    assert.equal(periodOf(null), null);
    assert.equal(periodOf({ type: "inherit", startDay: 9 }), null);
    assert.deepEqual(periodOf({ type: "custom", startDay: "15" }), { type: "custom", startDay: 15 });
    assert.deepEqual(periodOf({ type: "custom", startDay: 40 }), { type: "custom", startDay: 28 });
    assert.deepEqual(periodOf({ type: "custom", startDay: "soon" }), { type: "custom", startDay: 1 });
    assert.deepEqual(periodOf({ type: "custom", startDay: { toString: () => "12" } }), { type: "custom", startDay: 12 });
    assert.deepEqual(periodOf({ type: "weekly", startDay: 9 }), { type: "calendarMonth", startDay: 1 });
    assert.deepEqual(periodOf("monthly"), { type: "calendarMonth", startDay: 1 }, "a truthy primitive has no type");
    assert.equal(thrown(() => onlyClient({ billing_period: { type: "custom", startDay: Symbol("day") } })), "TypeError",
      "a symbol still cannot be converted");
  });

  it("rebuilds a rounding rule, accepting only the three increments by identity", () => {
    /** @param {unknown} rounding */
    const roundingOf = (rounding) => plain(onlyClient({ billing_rounding: rounding }).billingRounding);
    assert.equal(roundingOf(null), null);
    assert.equal(roundingOf({ type: "inherit", increment: "nearestHour" }), null);
    assert.deepEqual(roundingOf({ increment: "nearestHalfHour", enabled: 1 }), { enabled: true, increment: "nearestHalfHour" });
    assert.deepEqual(roundingOf({ increment: "nearestMinute" }), { enabled: false, increment: "nearestQuarterHour" });
    // `includes` compared by SameValueZero, so a String object never matched; `===` agrees.
    assert.deepEqual(roundingOf({ increment: Object("nearestHour") }), { enabled: false, increment: "nearestQuarterHour" });
  });
});
