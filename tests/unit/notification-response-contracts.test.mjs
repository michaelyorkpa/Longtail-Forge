// Runtime proof for the notification subscription and preference response contracts.
//
// `0.33.33.38.4.10` narrowed three subscription members and the preference catalogue inside the
// two shared writers that publish them, so the wire boundary is crossed once rather than in every
// consumer. A type contract alone would prove nothing about a malformed body, and this boundary is
// latent: its diagnostics do not appear until `0.33.33.38.2.2.6.6.1` and `.6.6.2` declare their
// surfaces, so the compiler cannot be the only witness.
//
// These cases lift the narrowing functions out of the two writers and build their fixtures from the
// producers themselves - `subscriptionRowToAppValue` in the repository and the `events` projection
// in `notifications.service.js` - so the browser contract cannot drift from the server in either
// direction without failing here.
//
// The proof is a unit test rather than a discovered regression because the coverage policy holds
// `maximumActiveScripts` at 348 and refuses to raise it, as `0.33.33.38.4.2` recorded.

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();

const subscriptionsSource = readText("public/js/shared/notification-subscriptions.js");
const preferencesSource = readText("public/js/shared/notification-preferences.js");
const repositorySource = readText("src/repositories/notifications.repo.js");
const serviceSource = readText("src/services/notifications.service.js");

const subscriptions = sandbox(subscriptionsSource, {
  tables: ["SUBSCRIPTION_MEMBERS", "TARGET_MEMBERS"],
  functions: ["isResponseRecord", "text", "hasTextMembers", "readSubscription", "readTarget", "readSubscriptionResult"],
});
const preferences = sandbox(preferencesSource, {
  tables: ["EVENT_TEXT_MEMBERS", "EVENT_BOOLEAN_MEMBERS"],
  functions: ["isResponseRecord", "isEventPreference"],
});

/** The members the repository shaper constructs for every subscription row. */
const PRODUCER_SUBSCRIPTION_MEMBERS = constructedKeys(repositorySource, "subscriptionRowToAppValue");
/** The members the service constructs for the echoed target. */
const PRODUCER_TARGET_MEMBERS = constructedKeys(serviceSource, "normalizeSubscriptionTarget", { anchor: "const target = {" });

describe("notification subscription responses", () => {
  it("checks exactly the members the repository shaper constructs", () => {
    assert.deepEqual(
      plain(subscriptions.SUBSCRIPTION_MEMBERS).slice().sort(),
      PRODUCER_SUBSCRIPTION_MEMBERS.slice().sort(),
      "the browser must check the ten members subscriptionRowToAppValue builds, no more and no fewer",
    );
    assert.deepEqual(
      plain(subscriptions.TARGET_MEMBERS).slice().sort(),
      PRODUCER_TARGET_MEMBERS.slice().sort(),
      "the echoed target is what normalizeSubscriptionTarget builds, not what the browser sends",
    );
  });

  it("narrows a complete body from all three operations into one result", () => {
    const body = subscriptionBodyFixture();
    const result = plain(subscriptions.readSubscriptionResult(body));
    assert.deepEqual(result, body, "a body the producer could send survives narrowing unchanged");
    assert.equal(result.isFollowing, true);
    assert.equal(result.subscription.status, "active");
    assert.equal(result.target.module_id, "module_id-value");
  });

  it("reproduces the raw read exactly for isFollowing", () => {
    for (const [value, expected] of [[true, true], [false, false], [undefined, false], [null, false], ["true", false], [1, false]]) {
      assert.equal(
        subscriptions.readSubscriptionResult({ ...subscriptionBodyFixture(), isFollowing: value }).isFollowing,
        expected,
        "isFollowing must stay exactly `body.isFollowing === true`, which is what every consumer wrote",
      );
    }
  });

  it("stays total for a malformed body rather than rejecting it", () => {
    for (const malformed of [null, undefined, 0, "body", true, [], [subscriptionBodyFixture()]]) {
      const result = plain(subscriptions.readSubscriptionResult(malformed));
      assert.deepEqual(
        result,
        { isFollowing: false, subscription: null, target: null },
        "the raw read never threw for a malformed body and neither may the narrowing: the toggle depends on it",
      );
    }
  });

  it("returns null for a subscription record it cannot vouch for", () => {
    const body = subscriptionBodyFixture();
    assert.notEqual(subscriptions.readSubscription(body.subscription), null);
    for (const member of PRODUCER_SUBSCRIPTION_MEMBERS) {
      assert.equal(
        subscriptions.readSubscription(omit(body.subscription, member)),
        null,
        `a row missing ${member} is not the record subscriptionRowToAppValue builds`,
      );
      assert.equal(
        subscriptions.readSubscription({ ...body.subscription, [member]: null }),
        null,
        `${member} is defaulted by the shaper and never sent as null`,
      );
      assert.equal(subscriptions.readSubscription({ ...body.subscription, [member]: 7 }), null);
    }
    for (const malformed of [null, undefined, "row", 4, [], true]) {
      assert.equal(subscriptions.readSubscription(malformed), null);
    }
  });

  it("distinguishes the absent subscription from an empty one", () => {
    const body = { ...subscriptionBodyFixture(), isFollowing: false, subscription: null };
    const result = plain(subscriptions.readSubscriptionResult(body));
    assert.equal(result.subscription, null, "readSubscription genuinely returns null for a target never followed");
    assert.notEqual(result.target, null, "the target is still echoed, so absence and emptiness stay different answers");
  });

  it("returns null for an echoed target it cannot vouch for", () => {
    const { target } = subscriptionBodyFixture();
    for (const member of PRODUCER_TARGET_MEMBERS) {
      assert.equal(subscriptions.readTarget(omit(target, member)), null, `a target missing ${member} is malformed`);
      assert.equal(subscriptions.readTarget({ ...target, [member]: 3 }), null);
    }
    assert.notEqual(
      subscriptions.readTarget({ ...target, event_type: "" }),
      null,
      "an empty event_type is what the producer sends when the caller named no event",
    );
  });
});

describe("notification preference responses", () => {
  it("checks exactly the members the preferences projection constructs", () => {
    const producerMembers = constructedKeys(serviceSource, "preferences", { last: true });
    assert.deepEqual(
      [...plain(preferences.EVENT_TEXT_MEMBERS), ...plain(preferences.EVENT_BOOLEAN_MEMBERS)].sort(),
      producerMembers.slice().sort(),
      "the browser must check the ten members the events projection builds",
    );
  });

  it("accepts an event the producer could send", () => {
    assert.equal(preferences.isEventPreference(eventFixture()), true);
  });

  it("keeps the three enablement layers distinct", () => {
    const layered = { ...eventFixture(), defaultEnabled: true, workspaceEnabled: false, userEnabled: true };
    assert.equal(preferences.isEventPreference(layered), true, "the three booleans may legitimately disagree");
    for (const layer of ["defaultEnabled", "workspaceEnabled", "userEnabled", "moduleEnabled"]) {
      assert.equal(
        preferences.isEventPreference(omit(eventFixture(), layer)),
        false,
        `${layer} is its own merged answer and cannot be inferred from a sibling`,
      );
    }
    assert.notEqual(
      eventFixture().defaultPriority,
      undefined,
      "workspacePriority and defaultPriority are separate layers and both are sent",
    );
  });

  it("rejects the integer flags the tables store but the producer never sends", () => {
    for (const layer of plain(preferences.EVENT_BOOLEAN_MEMBERS)) {
      for (const stored of [1, 0, "1", "true", null]) {
        assert.equal(
          preferences.isEventPreference({ ...eventFixture(), [layer]: stored }),
          false,
          `enabled is an INTEGER column, and the server converts it before answering: ${layer} must be a boolean`,
        );
      }
    }
  });

  it("rejects an event missing or mistyping any text member", () => {
    for (const member of plain(preferences.EVENT_TEXT_MEMBERS)) {
      assert.equal(preferences.isEventPreference(omit(eventFixture(), member)), false, `${member} must be present`);
      assert.equal(preferences.isEventPreference({ ...eventFixture(), [member]: null }), false);
      assert.equal(preferences.isEventPreference({ ...eventFixture(), [member]: 5 }), false);
    }
    assert.equal(preferences.isEventPreference({ ...eventFixture(), id: "" }), false, "an event with no id is not an event");
    for (const malformed of [null, undefined, 0, "event", true, [], [eventFixture()]]) {
      assert.equal(preferences.isEventPreference(malformed), false);
    }
  });

  it("is wired into the member that crosses the boundary", () => {
    const block = extractFunctionBlock(preferencesSource, "loadPreferences");
    assert.match(
      block,
      /Array\.isArray\(body\?\.events\) \? body\.events\.filter\(isEventPreference\) : \[\]/,
      "loadPreferences must check the elements it returns, not only that the container is an array",
    );
    for (const member of ["readStatus", "follow", "unfollow"]) {
      assert.match(
        extractFunctionBlock(subscriptionsSource, member),
        /readSubscriptionResult\(\s*await requireApi\(\)/,
        `${member} must narrow the body before publishing it`,
      );
    }
  });

  it("validates elements rather than the container", () => {
    const valid = eventFixture();
    const mixed = [valid, { id: "partial" }, null, "event", [valid]].filter(preferences.isEventPreference);
    assert.deepEqual(plain(mixed), [valid], "a valid array must not make its elements trusted");
  });
});

/**
 * Load named tables and functions out of a writer's IIFE and hand back what they evaluate to.
 * @param {string} source
 * @param {{ functions: readonly string[], tables: readonly string[] }} parts
 */
function sandbox(source, parts) {
  const context = vm.createContext({});
  for (const table of parts.tables) {
    const match = source.match(new RegExp(`const ${table} = Object\\.freeze\\(\\[[\\s\\S]*?\\]\\);`));
    assert.ok(match, `${table} must remain a frozen table this owner can read`);
    vm.runInContext(match[0], context, { filename: table });
  }
  for (const name of parts.functions) {
    vm.runInContext(extractFunctionBlock(source, name), context, { filename: name });
  }
  return vm.runInContext(`({ ${[...parts.functions, ...parts.tables].join(", ")} })`, context);
}

/**
 * The keys one producer function constructs in an object literal.
 *
 * Shorthand properties count: the events projection writes `workspaceEnabled,` rather than
 * `workspaceEnabled: workspaceEnabled`, and a reader that only saw `name:` would quietly report a
 * producer with one member fewer than it has.
 * @param {string} source
 * @param {string} functionName
 * @param {{ anchor?: string, last?: boolean }} [options]
 * @returns {string[]}
 */
function constructedKeys(source, functionName, options = {}) {
  const block = extractFunctionBlock(source, functionName);
  const anchor = options.anchor || "return {";
  const start = options.last ? block.lastIndexOf(anchor) : block.indexOf(anchor);
  assert.ok(start >= 0, `${functionName} must still construct its result through ${anchor}`);
  const region = block.slice(start);
  const end = region.indexOf("};");
  const literal = end > 0 ? region.slice(0, end) : region;
  return [...new Set([...literal.matchAll(/^\s{4,}([a-zA-Z_]\w*)\s*[,:]/gm)].map((entry) => entry[1]))];
}

/** A subscription body exactly as the three routes answer. */
function subscriptionBodyFixture() {
  /** @type {Record<string, string>} */
  const subscription = {};
  for (const member of PRODUCER_SUBSCRIPTION_MEMBERS) {
    subscription[member] = member === "status" ? "active" : `${member}-value`;
  }
  /** @type {Record<string, string>} */
  const target = {};
  for (const member of PRODUCER_TARGET_MEMBERS) {
    target[member] = `${member}-value`;
  }
  return { isFollowing: true, subscription, target };
}

/** One merged event preference exactly as the preferences projection builds it. */
function eventFixture() {
  return {
    defaultEnabled: true,
    defaultPriority: "normal",
    description: "Fires when a task changes.",
    id: "tasks.updated",
    label: "Task updated",
    moduleEnabled: true,
    moduleId: "tasks",
    userEnabled: false,
    workspaceEnabled: true,
    workspacePriority: "high",
  };
}

/** @param {Record<string, unknown>} record @param {string} member */
function omit(record, member) {
  const { [member]: _removed, ...rest } = record;
  return rest;
}

/**
 * A host-realm copy of a value the sandbox produced, so deep equality is about shape.
 * @template T @param {T} value @returns {T}
 */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
