import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

/**
 * Module-action keys are opaque (`0.33.33.38.2.10`).
 *
 * The registry never required its identifiers to be text: `register` stores any truthy
 * `actionId || id` as a `Map` key, `open` finds it by that exact value, and the dependency table
 * converts it to a property key. The contract said `string`, which described the first-party IDs
 * rather than the registry, so a caller holding a non-string key could not pass it through. The
 * contract now says `unknown`, and these cases pin that the runtime did not move with it.
 *
 * Every case boots the whole shipped file in a fake browser context - the real registry, with its
 * first-party registrations - and, where the claim is "unchanged", boots the `c44e9f7d` version
 * beside it and compares the two.
 */

const reader = createProjectTextReader();
const current = reader.readText("public/js/shared/module-actions.js");
const declarationSource = reader.readText("src/types/browser-contracts.d.ts");
const baseline = execFileSync("git", ["show", "c44e9f7d:public/js/shared/module-actions.js"], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

/** @type {ReadonlyArray<readonly [string, string]>} */
const VERSIONS = [["current", current], ["c44e9f7d", baseline]];

/**
 * @typedef {object} BootedRegistry
 * @property {(descriptor: unknown) => unknown} register
 * @property {(options?: { includeUnavailable?: boolean }) => unknown[]} list
 * @property {(actionId: unknown, params?: unknown, options?: unknown) => Promise<unknown>} open
 * @property {(actionId: unknown) => unknown[]} dependenciesFor
 * @property {(actionId: unknown) => Promise<void>} ensureDependencies
 */

/**
 * @param {string} text
 * @param {{ workspaceContext?: Record<string, unknown> }} [options]
 */
function boot(text, options = {}) {
  const context = createFakeBrowserContext({ workspaceContext: options.workspaceContext });
  vm.runInNewContext(text, context, { filename: "module-actions.js" });
  /** @type {object} */
  const namespace = context.window.LongtailForge;
  /** @type {BootedRegistry} */
  const actions = Reflect.get(namespace, "moduleActions");
  return { actions, namespace };
}

const TABLE_OPENER = "const MODULE_ACTION_DEPENDENCIES = Object.freeze({\n";

/**
 * The same text with two entries added to the dependency table, identically for either version:
 * `"7"`, so a numeric key has something to find, and `"Symbol(seven)"`, which only a key that was
 * stringified rather than used as a symbol could find.
 * @param {string} text
 */
function withSevenEntry(text) {
  assert.equal(text.split(TABLE_OPENER).length, 2, "the table opens exactly once");
  return text.replace(TABLE_OPENER, `${TABLE_OPENER}`
    + `    "7": [{ src: "js/seven.js", surface: "sevenSurface" }],\n`
    + `    "Symbol(seven)": [{ src: "js/symbol-text.js", surface: "symbolTextSurface" }],\n`);
}

/** @param {unknown} value @param {string} key */
const field = (value, key) => Reflect.get(Object(value), key);

/** An opener that completes at once, reporting which registration ran. @param {string} tag */
const completesAs = (tag) => (/** @type {unknown} */ _params, /** @type {unknown} */ host) => {
  Reflect.apply(field(host, "complete"), host, [{ tag, hostKey: field(field(host, "action"), "actionId") }]);
};

/** What a rejected `open` refused with, as plain host-realm text. @param {Promise<unknown>} pending */
const refusal = (pending) => pending.then(
  () => "resolved",
  (/** @type {unknown} */ error) => `${field(error, "name")}: ${field(error, "message")}`,
);

describe("An opaque key registers and is handed back as it was", () => {
  it("registers numeric 7 and text \"7\" as two actions", () => {
    for (const [version, text] of VERSIONS) {
      const { actions } = boot(text);
      const numeric = actions.register({ actionId: 7, open: completesAs("number") });
      const textual = actions.register({ actionId: "7", open: completesAs("text") });

      assert.ok(numeric && textual && numeric !== textual, `${version}: two registrations`);
      const sevens = actions.list({ includeUnavailable: true })
        .filter((action) => field(action, "actionId") === 7 || field(action, "actionId") === "7");
      assert.deepEqual(
        Array.from(sevens, (action) => ["actionId", "id", "label", "title"].map((key) => field(action, key))),
        [[7, 7, 7, 7], ["7", "7", "7", "7"]],
        `${version}: each summary carries its own key, and the label defaults to it unconverted`,
      );
    }
  });

  it("opens each by exact value, and the host context and outcome carry the key unchanged", async () => {
    for (const [version, text] of VERSIONS) {
      const { actions } = boot(text);
      actions.register({ actionId: 7, open: completesAs("number") });
      actions.register({ actionId: "7", open: completesAs("text") });

      const outcomes = [await actions.open(7), await actions.open("7")];
      assert.deepEqual(
        outcomes.map((outcome) => [
          field(outcome, "actionId"), field(outcome, "completed"),
          field(field(outcome, "detail"), "tag"), field(field(outcome, "detail"), "hostKey"),
        ]),
        [[7, true, "number", 7], ["7", true, "text", "7"]],
        `${version}: 7 opens the numeric action and "7" the text one; neither key is converted`,
      );
    }
  });

  it("finds an object or symbol key by identity, never by its text", async () => {
    const { actions } = boot(current);
    const objectKey = { toString: () => "tasks.add" };
    const symbolKey = Symbol("tasks.add");
    actions.register({ actionId: objectKey, open: completesAs("object") });
    actions.register({ actionId: symbolKey, open: completesAs("symbol") });

    assert.equal(field(await actions.open(objectKey), "actionId"), objectKey);
    assert.equal(field(await actions.open(symbolKey), "actionId"), symbolKey);
    const listed = actions.list({ includeUnavailable: true }).map((action) => field(action, "actionId"));
    assert.ok(listed.includes(objectKey) && listed.includes(symbolKey), "list() hands back both keys");
    assert.ok(listed.includes("tasks.add"), "beside the first-party action whose text the object key shares");

    for (const [version, text] of VERSIONS) {
      const registry = boot(text).actions;
      registry.register({ actionId: objectKey, open: completesAs("object") });
      assert.equal(await refusal(registry.open({ toString: () => "tasks.add" })),
        "Error: Module action 'tasks.add' is not registered.",
        `${version}: a different object with the same text is a different key`);
    }
  });
});

describe("What the registry refused, it still refuses", () => {
  it("refuses every falsy key and keeps `actionId || id` choosing the key", () => {
    for (const [version, text] of VERSIONS) {
      const { actions } = boot(text);
      for (const falsy of [0, "", Number.NaN, false, null, undefined, 0n]) {
        assert.equal(actions.register({ actionId: falsy, open: completesAs("falsy") }), null,
          `${version}: ${String(falsy)} is refused`);
      }
      actions.register({ actionId: 0, id: 7, open: completesAs("fallback") });
      const keys = Array.from(actions.list({ includeUnavailable: true }), (action) => field(action, "actionId"));
      assert.deepEqual(keys.filter((key) => typeof key !== "string"), [7], `${version}: 0 falls through to id 7`);
    }
  });

  it("refuses to open exactly as it did: unregistered, unavailable and canOpen-false keys", async () => {
    /** @type {Record<string, string[]>} */
    const byVersion = {};
    for (const [version, text] of VERSIONS) {
      const { actions } = boot(text, { workspaceContext: { enabledModules: ["notes"] } });
      actions.register({ actionId: 7, moduleId: "tasks", open: completesAs("unavailable") });
      actions.register({ actionId: 8, canOpen: () => false, open: completesAs("refused") });
      byVersion[version] = [
        await refusal(actions.open(9)),
        await refusal(actions.open("7")),
        await refusal(actions.open(7)),
        await refusal(actions.open(8)),
        await refusal(actions.open(Symbol("unregistered"))),
      ];
    }
    assert.deepEqual(byVersion.current, byVersion.c44e9f7d);
    assert.deepEqual(byVersion.current, [
      "Error: Module action '9' is not registered.",
      "Error: Module action '7' is not registered.",
      "Error: Module action '7' is not available in this workspace.",
      "Error: Module action '8' cannot be opened in the current context.",
      "TypeError: Cannot convert a Symbol value to a string",
    ]);
  });

  it("still lists every first-party string action as before", () => {
    const summaries = VERSIONS.map(([, text]) => JSON.stringify(boot(text).actions.list({ includeUnavailable: true })));
    assert.equal(summaries[0], summaries[1]);
    assert.ok(summaries[0].includes("\"actionId\":\"tasks.add\""));
  });
});

describe("The dependency table converts a key exactly as the member access did", () => {
  /**
   * Probes built fresh for each version, so each version's conversion calls are counted alone.
   * @param {string[]} calls
   * @returns {Array<[string, unknown]>}
   */
  const probes = (calls) => [
    ["text", "tasks.add"],
    ["numeric 7", 7],
    ["text 7", "7"],
    ["numeric 8", 8],
    ["bigint 7", 7n],
    ["symbol", Symbol("tasks.add")],
    ["symbol seven", Symbol("seven")],
    ["undefined", undefined],
    ["null", null],
    ["true", true],
    ["array", ["tasks.add"]],
    ["toString object", { toString() { calls.push("toString"); return "tasks.add"; } }],
    ["valueOf fallback", {
      toString() { calls.push("toString"); return {}; },
      valueOf() { calls.push("valueOf"); return "notes.view"; },
    }],
    ["toPrimitive object", { [Symbol.toPrimitive](/** @type {string} */ hint) { calls.push(`toPrimitive:${hint}`); return 7; } }],
    ["throwing toString", { toString() { calls.push("throws"); throw new Error("conversion failed"); } }],
    ["inherited constructor", "constructor"],
    ["inherited toString", "toString"],
    ["inherited __proto__", "__proto__"],
    ["object naming constructor", { toString() { calls.push("toString"); return "constructor"; } }],
  ];

  /** @param {BootedRegistry} actions @param {unknown} key @returns {unknown} */
  const lookup = (actions, key) => {
    try {
      return Array.from(actions.dependenciesFor(key), (dependency) => field(dependency, "src"));
    } catch (error) {
      return `${field(error, "name")}: ${field(error, "message")}`;
    }
  };

  it("answers every key, and makes every conversion call, exactly as before", () => {
    const results = VERSIONS.map(([, text]) => {
      const { actions } = boot(withSevenEntry(text));
      /** @type {string[]} */
      const calls = [];
      return { answers: probes(calls).map(([name, key]) => [name, lookup(actions, key)]), calls };
    });
    assert.deepEqual(results[0], results[1]);

    const answers = Object.fromEntries(results[0].answers);
    assert.deepEqual(answers["numeric 7"], ["js/seven.js"], "a numeric key reads the entry named for its text");
    assert.deepEqual(answers["toPrimitive object"], ["js/seven.js"]);
    assert.deepEqual(answers["numeric 8"], []);
    assert.deepEqual(answers["symbol seven"], [], "a symbol is used as itself, never as its description");
    assert.deepEqual(answers.array, answers.text, "an array converts through its join");
    assert.equal(answers["inherited constructor"], "TypeError: (MODULE_ACTION_DEPENDENCIES[actionId] || []) is not iterable",
      "an inherited name still throws, with V8's message naming the unchanged lookup");
    assert.deepEqual(results[0].calls, ["toString", "toString", "valueOf", "toPrimitive:string", "throws", "toString"],
      "one string-hinted conversion per object, in the member access's order");
  });

  it("loads a numeric key's dependencies through the entry named for its text", async () => {
    for (const [version, text] of VERSIONS) {
      const { actions, namespace } = boot(withSevenEntry(text));
      let reads = 0;
      Object.defineProperty(namespace, "sevenSurface", { get() { reads += 1; return {}; } });
      await actions.ensureDependencies(8);
      assert.equal(reads, 0, `${version}: 8 has no entry`);
      await actions.ensureDependencies(7);
      assert.equal(reads, 1, `${version}: 7 checks the "7" entry's surface`);
    }
  });

  it("names its one difference: an object whose string conversion answers a symbol", () => {
    // Used as that symbol before and found nothing; the text conversion now throws. No
    // first-party action registers such a key and none can arrive as JSON. Recorded rather
    // than hidden, because matching it would take a cast, an `any` or a hand-rolled ToPrimitive.
    for (const key of [Object(Symbol("wrapped")), { [Symbol.toPrimitive]: () => Symbol("made") }]) {
      assert.deepEqual(lookup(boot(baseline).actions, key), []);
      assert.equal(lookup(boot(current).actions, key), "TypeError: Cannot convert a Symbol value to a string");
    }
  });
});

describe("The contract states the key the registry actually keeps", () => {
  it("declares every connected key unknown, with no string restriction left behind", () => {
    for (const pattern of [
      /dependenciesFor\(actionId: unknown\): ModuleActionDependency\[\];/,
      /ensureDependencies\(actionId: unknown\): Promise<void>;/,
      /open\(actionId: unknown, params\?: unknown, options\?: unknown\): Promise<ModuleActionOutcome>;/,
      /export interface ModuleActionSummary \{[\s\S]*?\n {2}actionId: unknown;[\s\S]*?\n {2}id: unknown;/,
      /export interface ModuleActionOutcome \{\n {2}actionId: unknown;/,
    ]) {
      assert.match(declarationSource, pattern);
    }
    assert.match(current, /@type \{Map<unknown, RegisteredModuleAction>\}/);
    assert.match(current, /@type \{Readonly<Record<PropertyKey, readonly ModuleActionDependency\[\]>>\}/);
    for (const typedef of ["ModuleActionDescriptorMembers", "RegisteredModuleActionMembers"]) {
      const block = current.slice(current.indexOf(`@typedef {object} ${typedef}`));
      assert.match(block.slice(0, block.indexOf("*/")), /@property \{unknown\} \[?actionId\]?\n[^\n]*@property \{unknown\} \[?id\]?\n/);
    }
  });
});
