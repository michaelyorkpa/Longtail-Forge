// Runtime proof for the shared bulk-action failure contract.
//
// `0.33.33.38.4.11` was planned as one `{ affectedCount, changed, errors }` envelope shared by two
// routes. Four routes were found and none of them emits that shape: the note, tag, catalog and task
// bulk producers pair a *different* success payload with the same kind of failure list. What is
// genuinely shared is the failure record, and that is what `BrowserBulkActionFailure` describes.
//
// **The two authorities in this file are deliberately separate.** The producer side is read from the
// four server services; the contract side is read from the browser declaration. Breaking either one
// leaves the other intact, which is the property `0.33.33.38.4.10` lost when a producer-agreement
// test drew both its fixture and its expectation from the same file and stayed green while that
// file was broken.

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();

const contractSource = readText("public/js/shared/error-contract.js");
const declarationSource = readText("src/types/browser-contracts.d.ts");
const notesSource = readText("public/js/notes.js");
const notesSettingsSource = readText("public/js/notes-settings.js");

/** The four producers, each read from its own service. Never from the browser side. */
const PRODUCERS = Object.freeze([
  { route: "POST /api/notes/bulk", file: "src/modules/notes/notes.service.js", fn: "bulkUpdate", identity: "note_id" },
  { route: "POST /api/tags/bulk-assignments", file: "src/services/tags.service.js", fn: "bulkAssign", identity: "target_id" },
  { route: "POST /api/notes/settings/catalogs/bulk", file: "src/modules/notes/notes-collections.service.js", fn: "bulkManageCatalogs", identity: "catalogId" },
  { route: "POST /api/tasks/bulk", file: "src/modules/tasks/tasks.service.js", fn: "bulkUpdate", identity: "task_id" },
]);

const contract = sandbox(contractSource, ["asRecord", "readBulkFailures"], ["BULK_FAILURE_TEXT_KEYS"]);
const notesHelpers = sandbox(notesSource, ["isResponseRecord", "bulkChangedIds"], []);
const catalogHelpers = sandbox(notesSettingsSource, ["isResponseRecord", "bulkAffectedCount"], []);

describe("the shared bulk-action failure contract", () => {
  it("describes every member the four producers construct, and no more", () => {
    const declared = declaredFailureMembers();
    const produced = new Set();
    for (const producer of PRODUCERS) {
      const keys = producedFailureKeys(producer);
      assert.ok(keys.length > 0, `${producer.route} must still construct its failures inline`);
      assert.ok(keys.includes("message"), `${producer.route} must construct a message`);
      assert.ok(keys.includes(producer.identity), `${producer.route} must carry ${producer.identity}`);
      for (const key of keys) {
        assert.ok(declared.has(key), `${producer.route} sends ${key}, which the contract does not describe`);
        produced.add(key);
      }
    }
    assert.deepEqual(
      [...declared].sort(),
      [...produced].sort(),
      "the contract must not describe a member no producer sends",
    );
  });

  it("requires message, and makes status optional because one producer omits it", () => {
    const withStatus = PRODUCERS.filter((producer) => producedFailureKeys(producer).includes("status"));
    assert.equal(withStatus.length, 3, "three producers set status from the caught error");
    const without = PRODUCERS.find((producer) => !producedFailureKeys(producer).includes("status"));
    assert.equal(without?.identity, "catalogId", "the catalog producer is the one that omits status");
    const block = declarationBlock("BrowserBulkActionFailure");
    assert.match(block, /\n  message: string;/, "message is required because all four construct it");
    assert.match(block, /\n  status\?: number;/, "status is optional because one producer omits it");
  });

  it("gives each identity key to exactly one producer", () => {
    for (const producer of PRODUCERS) {
      const others = PRODUCERS.filter((entry) => entry !== producer);
      for (const other of others) {
        assert.ok(
          !producedFailureKeys(other).includes(producer.identity),
          `${producer.identity} must identify only ${producer.route}`,
        );
      }
      assert.match(
        declarationBlock("BrowserBulkActionFailure"),
        new RegExp(`\\n  ${producer.identity}\\?: string;`),
        `${producer.identity} is optional because only one producer sets it`,
      );
    }
  });

  it("narrows a body from each producer", () => {
    for (const producer of PRODUCERS) {
      const body = { errors: [failureFixture(producer)] };
      const [narrowed] = plain(contract.readBulkFailures(body));
      assert.equal(narrowed.message, "It failed.");
      assert.equal(narrowed[producer.identity], `${producer.identity}-value`);
      assert.equal("status" in narrowed, producedFailureKeys(producer).includes("status"));
    }
  });

  it("stays total for a body that reports nothing", () => {
    for (const empty of [null, undefined, 0, "body", true, [], {}, { errors: null }, { errors: "none" }, { errors: {} }]) {
      assert.deepEqual(
        plain(contract.readBulkFailures(empty)),
        [],
        "every call site wrote `result.errors || []`, so a body without failures still reports none",
      );
    }
  });

  it("checks elements rather than the container", () => {
    const valid = failureFixture(PRODUCERS[0]);
    const mixed = { errors: [valid, { note_id: "n-2" }, { message: "" }, { message: 7 }, null, "failed", [valid]] };
    const narrowed = plain(contract.readBulkFailures(mixed));
    assert.equal(narrowed.length, 1, "an entry with no text message is not a failure this contract describes");
    assert.deepEqual(narrowed[0], { message: "It failed.", status: 404, note_id: "note_id-value" });
  });

  it("copies only what it checked", () => {
    const narrowed = plain(contract.readBulkFailures({
      errors: [{ message: "It failed.", status: "404", note_id: 7, target_id: "t-1", stack: "secret", body: { token: "x" } }],
    }));
    assert.deepEqual(
      narrowed,
      [{ message: "It failed.", target_id: "t-1" }],
      "a non-numeric status, a non-string identity and every unchecked member are left on the wire",
    );
  });

  it("keeps the checked key table and the contract in step", () => {
    const declared = declaredFailureMembers();
    for (const key of plain(contract.BULK_FAILURE_TEXT_KEYS)) {
      assert.ok(declared.has(key), `${key} is copied but not declared`);
    }
    for (const key of declared) {
      if (key === "message" || key === "status") continue;
      assert.ok(
        plain(contract.BULK_FAILURE_TEXT_KEYS).includes(key),
        `${key} is declared but never copied, so it could never arrive`,
      );
    }
  });
});

describe("the producer-specific bulk reads", () => {
  it("merges the two changed-list producers into identifiers, not records", () => {
    assert.deepEqual(
      plain(notesHelpers.bulkChangedIds({ notes: [{ note_id: "n-1" }, { note_id: "" }, null], changed: [{ target_id: "t-1" }] })),
      ["n-1", "t-1"],
      "the bulk editor wants identifiers; the record shapes stay with their own owners",
    );
    for (const empty of [null, undefined, "body", 4, [], {}, { notes: "all" }, { changed: 7 }]) {
      assert.deepEqual(plain(notesHelpers.bulkChangedIds(empty)), []);
    }
    assert.deepEqual(
      plain(notesHelpers.bulkChangedIds({ notes: [{ note_id: 7 }, { target_id: "wrong-key" }] })),
      [],
      "each producer's identifier is read under its own member name",
    );
  });

  it("reads the one count only the catalog producer sends", () => {
    assert.equal(catalogHelpers.bulkAffectedCount({ affectedCount: 3 }), 3);
    assert.equal(catalogHelpers.bulkAffectedCount({ affectedCount: 0 }), 0);
    for (const malformed of [{}, { affectedCount: "3" }, { affectedCount: null }, { affectedCount: Number.NaN },
      { affectedCount: Number.POSITIVE_INFINITY }, null, undefined, "body", []]) {
      assert.equal(
        catalogHelpers.bulkAffectedCount(malformed),
        0,
        "anything the producer could not have accumulated falls back to 0, as `|| 0` did",
      );
    }
  });
});

/**
 * Evaluate named functions and frozen tables out of one browser writer.
 * @param {string} source @param {readonly string[]} functions @param {readonly string[]} tables
 */
function sandbox(source, functions, tables) {
  const context = vm.createContext({});
  for (const table of tables) {
    const match = source.match(new RegExp(`const ${table} = Object\\.freeze\\(\\[[\\s\\S]*?\\]\\);`));
    assert.ok(match, `${table} must remain a frozen table this owner can read`);
    vm.runInContext(match[0], context, { filename: table });
  }
  for (const name of functions) {
    vm.runInContext(extractFunctionBlock(source, name), context, { filename: name });
  }
  return vm.runInContext(`({ ${[...functions, ...tables].join(", ")} })`, context);
}

/**
 * The keys one producer pushes into its `errors` array, read from that producer's own service.
 * @param {{file: string, fn: string}} producer @returns {string[]}
 */
function producedFailureKeys(producer) {
  const block = extractFunctionBlock(readText(producer.file), producer.fn);
  const push = block.slice(block.indexOf("errors.push({"));
  const literal = push.slice(0, push.indexOf("});"));
  return [...new Set([...literal.matchAll(/^\s{6,}([a-zA-Z_]\w*):/gm)].map((entry) => entry[1]))];
}

/** The members the browser contract declares. @returns {Set<string>} */
function declaredFailureMembers() {
  return new Set([...declarationBlock("BrowserBulkActionFailure").matchAll(/^  (\w+)\??:/gm)].map((entry) => entry[1]));
}

/** @param {string} name @returns {string} */
function declarationBlock(name) {
  const match = declarationSource.match(new RegExp(`export interface ${name}\\b[^{]*\\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `${name} must be declared`);
  return match[0];
}

/** A failure exactly as one producer constructs it. @param {{identity: string, file: string, fn: string}} producer */
function failureFixture(producer) {
  /** @type {Record<string, unknown>} */
  const failure = { message: "It failed." };
  for (const key of producedFailureKeys(producer)) {
    if (key === "message") continue;
    failure[key] = key === "status" ? 404 : `${key}-value`;
  }
  return failure;
}

/** @template T @param {T} value @returns {T} */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
