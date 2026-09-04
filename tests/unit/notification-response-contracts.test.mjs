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
const declarationSource = readText("src/types/browser-contracts.d.ts");
const userSettingsSource = readText("public/js/user-settings.js");
const notificationsPageSource = readText("public/js/notifications.js");

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

describe("the published subscription surface", () => {
  it("declares exactly the five members the writer publishes", () => {
    const published = [...extractFunctionBlock(subscriptionsSource, "attachNotificationSubscriptions")
      .matchAll(/root\.notificationSubscriptions = \{([\s\S]*?)\};/g)]
      .flatMap((match) => [...match[1].matchAll(/^\s+(\w+),$/gm)].map((entry) => entry[1]));
    assert.equal(published.length, 5, "the writer must still publish one object literal of five members");

    const declared = [...declarationBlock("BrowserNotificationSubscriptions")
      .matchAll(/^  (\w+)\(/gm)].map((entry) => entry[1]);
    assert.deepEqual(
      declared.slice().sort(),
      published.slice().sort(),
      "a top-level declaration must cover the entire runtime surface, and may not exceed it",
    );
  });

  it("keeps the request target and the response target apart", () => {
    const request = declarationBlock("BrowserNotificationTargetRequest");
    const response = declarationBlock("BrowserNotificationTarget");
    for (const member of ["moduleId", "targetId", "targetType"]) {
      assert.match(request, new RegExp(`\n  ${member}: string;`), `the request target carries ${member}`);
      assert.doesNotMatch(response, new RegExp(`\n  ${member}: string;`), `the response target must not carry ${member}`);
    }
    for (const member of ["event_type", "module_id", "target_id", "target_type"]) {
      assert.match(response, new RegExp(`\n  ${member}: string;`), `the response target carries ${member}`);
      assert.doesNotMatch(request, new RegExp(`\n  ${member}: string;`), `the request target must not carry ${member}`);
    }
    for (const member of ["noteTarget", "taskTarget"]) {
      assert.match(
        declarationBlock("BrowserNotificationSubscriptions"),
        new RegExp(`^  ${member}\\([^)]*\\): BrowserNotificationTargetRequest;$`, "m"),
        `${member} builds a request target, not the one the server echoes`,
      );
    }
  });

  it("resolves all three network members to the one narrowed envelope", () => {
    const block = declarationBlock("BrowserNotificationSubscriptions");
    for (const member of ["follow", "readStatus", "unfollow"]) {
      assert.match(
        block,
        new RegExp(`^  ${member}\\([^)]*\\): Promise<BrowserNotificationSubscriptionResult>;$`, "m"),
        `${member} must resolve to the envelope 0.33.33.38.4.10 narrows, not to unknown and not to its own interface`,
      );
    }
  });
});

describe("the published preference surface", () => {
  // `GROUPING_MODES` joined this sandbox when `0.33.33.38.4.13.3` moved the vocabulary out of an
  // inline array literal and into the frozen table the declared type already describes. The
  // assertions below are unchanged: they still read the vocabulary from the declaration and
  // exercise the shipped normaliser against it.
  const payloadBuilders = sandbox(preferencesSource, {
    tables: ["GROUPING_MODES"],
    functions: ["normalizeGroupingMode", "normalizeGroupingPreferences", "readGroupingPreferencesPayload",
      "readUserPreferencesPayload", "readWorkspaceDefaultsPayload"],
  });

  it("declares exactly the eight members the writer publishes", () => {
    const published = [...extractFunctionBlock(preferencesSource, "attachNotificationPreferences")
      .matchAll(/root\.notificationPreferences = \{([\s\S]*?)\};/g)]
      .flatMap((match) => [...match[1].matchAll(/^\s+(\w+),$/gm)].map((entry) => entry[1]));
    assert.equal(published.length, 8, "the writer must still publish one object literal of eight members");
    const declared = [...declarationBlock("BrowserNotificationPreferences")
      .matchAll(/^  (\w+)[(<]/gm)].map((entry) => entry[1]);
    assert.deepEqual(
      declared.slice().sort(),
      published.slice().sort(),
      "a top-level declaration must cover the entire runtime surface, and may not exceed it",
    );
  });

  it("closes the grouping vocabulary because the normaliser closes it", () => {
    const declared = [...declarationBlock("BrowserNotificationGroupingMode", { alias: true })
      .matchAll(/"([a-z_]+)"/g)].map((entry) => entry[1]);
    assert.deepEqual(declared, ["client_project", "notification_type", "record_type"]);
    for (const mode of declared) {
      assert.equal(payloadBuilders.normalizeGroupingMode(mode), mode, `${mode} is a value the normaliser keeps`);
    }
    for (const rejected of ["", "client", null, undefined, 7, {}, ["record_type"], "CLIENT_PROJECT"]) {
      assert.equal(
        payloadBuilders.normalizeGroupingMode(rejected),
        "client_project",
        "anything else falls back, which is what makes the closed union true rather than hopeful",
      );
    }
  });

  it("builds the grouping payload from the form", () => {
    const container = { querySelector: () => ({ value: "record_type" }) };
    assert.deepEqual(plain(payloadBuilders.readGroupingPreferencesPayload(container)), { groupingMode: "record_type" });
    assert.deepEqual(plain(payloadBuilders.readGroupingPreferencesPayload({ querySelector: () => null })), { groupingMode: "client_project" });
    assert.deepEqual(plain(payloadBuilders.readGroupingPreferencesPayload(null)), { groupingMode: "client_project" });
    assert.deepEqual(plain(payloadBuilders.readGroupingPreferencesPayload({ querySelector: () => ({ value: "made-up" }) })), { groupingMode: "client_project" });
  });

  it("keeps the two array payloads asymmetric, because the builders are", () => {
    const userRows = {
      querySelectorAll: () => [
        { dataset: { notificationEventId: "tasks.updated" }, querySelector: () => ({ checked: true, disabled: false }) },
        { dataset: {}, querySelector: () => ({ checked: false, disabled: false }) },
      ],
    };
    const userPayload = plain(payloadBuilders.readUserPreferencesPayload(userRows));
    assert.equal(userPayload.length, 2, "the user-preference builder filters nothing");
    assert.deepEqual(userPayload[0], { id: "tasks.updated", enabled: true });
    assert.equal("id" in payloadBuilders.readUserPreferencesPayload(userRows)[1], true);
    assert.equal(
      payloadBuilders.readUserPreferencesPayload(userRows)[1].id,
      undefined,
      "a row with no marker attribute is sent with no id: the builder neither defaults nor drops it",
    );

    const defaultRows = {
      querySelectorAll: () => [
        { checked: true, closest: () => ({ dataset: { notificationEventId: "tasks.updated" }, querySelector: () => ({ value: "high" }) }) },
        { checked: false, closest: () => ({ dataset: {}, querySelector: () => null }) },
        { checked: true, closest: () => null },
      ],
    };
    const defaultPayload = plain(payloadBuilders.readWorkspaceDefaultsPayload(defaultRows));
    assert.deepEqual(defaultPayload, [{ id: "tasks.updated", enabled: true, priority: "high" }],
      "the workspace-default builder defaults the id to \"\" and then drops the rows that have none");
    assert.deepEqual(plain(payloadBuilders.readUserPreferencesPayload(null)), []);
    assert.deepEqual(plain(payloadBuilders.readWorkspaceDefaultsPayload(null)), []);
  });

  it("reads the disabled control's remembered value rather than its checkbox", () => {
    const rows = {
      querySelectorAll: () => [
        { dataset: { notificationEventId: "a" }, querySelector: () => ({ checked: false, disabled: true, dataset: { preferenceOriginalEnabled: "true" } }) },
        { dataset: { notificationEventId: "b" }, querySelector: () => ({ checked: true, disabled: true, dataset: { preferenceOriginalEnabled: "false" } }) },
      ],
    };
    assert.deepEqual(
      plain(payloadBuilders.readUserPreferencesPayload(rows)).map((/** @type {{enabled: boolean}} */ row) => row.enabled),
      [true, false],
      "a disabled control reports what it was, not what it shows",
    );
  });

  it("leaves the two mutation results opaque, because every caller discards them", () => {
    const block = declarationBlock("BrowserNotificationPreferences");
    for (const member of ["saveUserPreferences", "saveWorkspaceDefaults"]) {
      assert.match(block, new RegExp(`^  ${member}\\([^)]*\\): Promise<unknown>;$`, "m"),
        `${member} promises nothing about its body because nothing reads it`);
    }
    for (const [source, name] of [[userSettingsSource, "user-settings.js"], [notificationsPageSource, "notifications.js"]]) {
      for (const member of ["saveUserPreferences", "saveWorkspaceDefaults"]) {
        for (const match of source.matchAll(new RegExp(`\\.${member}\\(`, "g"))) {
          const line = source.slice(source.lastIndexOf("\n", match.index) + 1, source.indexOf("\n", match.index));
          assert.doesNotMatch(line, /(?:const|let|var|return)\s/,
            `${name} must keep discarding what ${member} resolves to; binding it would make Promise<unknown> the wrong contract`);
        }
      }
    }
  });

  it("renders through void members", () => {
    const block = declarationBlock("BrowserNotificationPreferences");
    for (const member of ["renderGroupingPreferences", "renderPreferenceGroups"]) {
      assert.match(block, new RegExp(`${member}\\(`), `${member} is declared`);
      assert.match(block, new RegExp(`${member}\\([\\s\\S]*?\\): void;`), `${member} returns nothing`);
      assert.doesNotMatch(
        extractFunctionBlock(preferencesSource, member),
        /return [^;]/,
        `${member} must have no value-returning statement for void to be truthful`,
      );
    }
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
    // Retargeted when `0.33.33.38.4.13.3` made the parsed body `unknown`: the elements are still
    // filtered by the same predicate, but they are read off the guarded `catalog` rather than
    // straight off `body`. What this owner asserts is the element check, not the spelling of the
    // value being checked.
    assert.match(
      block,
      /Array\.isArray\(catalog\.events\) \? catalog\.events\.filter\(isEventPreference\) : \[\]/,
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

/** @param {string} name @param {{alias?: boolean}} [options] @returns {string} */
function declarationBlock(name, options = {}) {
  const pattern = options.alias
    ? new RegExp(`export type ${name}\\b[^;]*;`)
    : new RegExp(`export interface ${name}\\b[^{]*\\{[\\s\\S]*?\\n\\}`);
  const match = declarationSource.match(pattern);
  assert.ok(match, `${name} must be declared`);
  return match[0];
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
