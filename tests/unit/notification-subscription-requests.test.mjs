import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/shared/notification-subscriptions.js");

/**
 * The request each subscription call builds, through the shipped module.
 *
 * `0.33.33.39.48` typed this file. `BrowserNotificationSubscriptions` declares `target` as
 * `unknown` because the writer genuinely accepts either spelling, so every member is read the
 * way the property access read it. `notification-response-contracts` holds the *response*
 * narrowing; nothing exercised the request builders, which is what these cases do.
 */

/** @typedef {Record<string, unknown>} Bag */

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

/** @param {unknown} error */
const nameOf = (error) => (isBag(error) ? String(error.name) : String(error));

function subscriptions() {
  /** @type {{ method: string, url: string, body?: unknown }[]} */
  const sent = [];
  /** @type {Bag} */
  const window = {
    LongtailForge: {
      api: {
        /** @param {string} url */
        getJson: async (url) => { sent.push({ method: "GET", url }); return {}; },
        /** @param {string} url @param {unknown} body */
        postJson: async (url, body) => { sent.push({ method: "POST", url, body }); return {}; },
        /** @param {string} url */
        deleteJson: async (url) => { sent.push({ method: "DELETE", url }); return {}; },
      },
    },
  };
  vm.runInNewContext(source, { window, URLSearchParams }, { filename: "notification-subscriptions.js" });
  const namespace = window.LongtailForge;
  assert.ok(isBag(namespace));
  const api = namespace.notificationSubscriptions;
  assert.ok(isBag(api));
  /** @param {string} name */
  const member = (name) => {
    const fn = api[name];
    assert.equal(typeof fn, "function", `${name} is published`);
    /** @param {unknown[]} args */
    return (...args) => Reflect.apply(/** @type {Function} */ (fn), api, args);
  };
  /** The query of the most recent request, as a plain record. */
  const lastQuery = () => {
    const last = sent.at(-1);
    assert.ok(last, "a request was sent");
    const query = last.url.slice(last.url.indexOf("?") + 1);
    return Object.fromEntries(new URLSearchParams(query));
  };
  return { member, sent, lastQuery };
}

describe("the target a request is built from", () => {
  it("accepts the camelCase spelling the local builders produce", async () => {
    const context = subscriptions();
    await context.member("readStatus")({ moduleId: "tasks", targetType: "task", targetId: "t-1" });
    assert.deepEqual(context.lastQuery(), { moduleId: "tasks", targetType: "task", targetId: "t-1" });
  });

  it("accepts the snake_case spelling the server echoes back", async () => {
    const context = subscriptions();
    await context.member("readStatus")({ module_id: "notes", target_type: "note", target_id: "n-1" });
    assert.deepEqual(context.lastQuery(), { moduleId: "notes", targetType: "note", targetId: "n-1" });
  });

  it("prefers camelCase when a target carries both", async () => {
    const context = subscriptions();
    await context.member("readStatus")({
      moduleId: "tasks", module_id: "notes",
      targetType: "task", target_type: "note",
      targetId: "t-1", target_id: "n-1",
    });
    assert.deepEqual(context.lastQuery(), { moduleId: "tasks", targetType: "task", targetId: "t-1" });
  });

  it("reads the second spelling only when the first answered nothing", async () => {
    // The `||` chain short-circuits, so a target that carries a usable camelCase member must
    // never have its snake_case one read at all.
    /** @type {string[]} */
    const reads = [];
    const context = subscriptions();
    await context.member("readStatus")({
      moduleId: "tasks",
      get module_id() { reads.push("module_id"); return "notes"; },
      targetType: "",
      get target_type() { reads.push("target_type"); return "note"; },
      targetId: "t-1",
    });
    assert.deepEqual(reads, ["target_type"], "only the member whose camelCase partner was empty");
    assert.equal(context.lastQuery().targetType, "note");
  });

  it("reads each member with the target as its own receiver", async () => {
    const context = subscriptions();
    const target = {
      id: "t-9",
      moduleId: "tasks",
      targetType: "task",
      get targetId() { return String(this.id); },
    };
    await context.member("readStatus")(target);
    assert.equal(context.lastQuery().targetId, "t-9", "the getter saw the target it was called on");
  });

  it("falls back to the empty string for a member the target does not carry", async () => {
    const context = subscriptions();
    await context.member("readStatus")({ moduleId: "tasks" });
    assert.deepEqual(context.lastQuery(), { moduleId: "tasks", targetType: "", targetId: "" });
  });

  it("fails on an absent target, before any request is built", async () => {
    // `target.moduleId` on nothing has always failed here; it still does, named rather than
    // reported as an anonymous property access, and no request leaves.
    const context = subscriptions();
    for (const absent of [null, undefined]) {
      let caught = null;
      try {
        await context.member("readStatus")(absent);
      } catch (error) {
        caught = error;
      }
      assert.equal(nameOf(caught), "TypeError", `target: ${String(absent)}`);
    }
    assert.deepEqual(context.sent, [], "nothing reached the network");
  });
});

describe("the event type, which is sent only when there is one", () => {
  it("is included when the target names one, in either spelling", async () => {
    const camel = subscriptions();
    await camel.member("readStatus")({ moduleId: "tasks", targetId: "t-1", eventType: "mention" });
    assert.equal(camel.lastQuery().eventType, "mention");

    const snake = subscriptions();
    await snake.member("readStatus")({ moduleId: "tasks", targetId: "t-1", event_type: "assigned" });
    assert.equal(snake.lastQuery().eventType, "assigned");
  });

  it("is omitted when the target names none", async () => {
    const context = subscriptions();
    await context.member("readStatus")({ moduleId: "tasks", targetId: "t-1", eventType: "" });
    assert.ok(!Object.hasOwn(context.lastQuery(), "eventType"), "an empty event type is not sent");
  });

  it("is decided by the value, not by the text it becomes", async () => {
    // A value that is truthy but reads as the empty string was written before, so it still is.
    // The conversion happens at the write rather than before the test.
    const context = subscriptions();
    await context.member("readStatus")({
      moduleId: "tasks", targetId: "t-1",
      eventType: { toString: () => "" },
    });
    assert.equal(context.lastQuery().eventType, "", "present and empty, rather than absent");
  });
});

describe("what each published call sends", () => {
  it("follows with the normalized payload, carrying all four members", async () => {
    const context = subscriptions();
    await context.member("follow")({ module_id: "notes", target_type: "note", target_id: "n-1" });
    const last = context.sent.at(-1);
    assert.ok(last);
    assert.equal(last.method, "POST");
    assert.equal(last.url, "/api/notifications/subscriptions");
    assert.deepEqual(JSON.parse(JSON.stringify(last.body)),
      { eventType: "", moduleId: "notes", targetId: "n-1", targetType: "note" });
  });

  it("carries the event type into the followed payload when the target names one", async () => {
    const context = subscriptions();
    await context.member("follow")({ moduleId: "tasks", targetType: "task", targetId: "t-1", eventType: "mention" });
    const last = context.sent.at(-1);
    assert.ok(last);
    assert.deepEqual(JSON.parse(JSON.stringify(last.body)),
      { eventType: "mention", moduleId: "tasks", targetId: "t-1", targetType: "task" });

    await context.member("follow")({ module_id: "notes", target_type: "note", target_id: "n-1", event_type: "assigned" });
    const snake = context.sent.at(-1);
    assert.ok(snake);
    assert.equal(JSON.parse(JSON.stringify(snake.body)).eventType, "assigned",
      "the echoed spelling reaches the payload too");
  });

  it("unfollows through the query rather than a body", async () => {
    const context = subscriptions();
    await context.member("unfollow")({ moduleId: "tasks", targetType: "task", targetId: "t-1" });
    const last = context.sent.at(-1);
    assert.ok(last);
    assert.equal(last.method, "DELETE");
    assert.equal(last.body, undefined);
    assert.deepEqual(context.lastQuery(), { moduleId: "tasks", targetType: "task", targetId: "t-1" });
  });

  it("builds each local target in the camelCase spelling the request uses", () => {
    const context = subscriptions();
    assert.deepEqual(JSON.parse(JSON.stringify(context.member("taskTarget")("t-1"))),
      { moduleId: "tasks", targetType: "task", targetId: "t-1" });
    assert.deepEqual(JSON.parse(JSON.stringify(context.member("noteTarget")("n-1"))),
      { moduleId: "notes", targetType: "note", targetId: "n-1" });
  });
});
