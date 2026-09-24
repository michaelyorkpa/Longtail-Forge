import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * What the Lists action dispatch takes, and the one root four of its readers share.
 *
 * `0.33.33.43.27` typed the action and event surface. Its diff changes no behaviour - the only
 * edited lines are the two registry openers, reflowed around inline annotations - so these cases
 * fix what the declarations describe, and pin the consolidated deferral.
 *
 * That consolidation is the point worth guarding. Four readers were each blocked by the same
 * thing: `BrowserNormalizedListRecord` declares its columns optional, because a draft the editor
 * has not created yet has none. Recording it once, with one discharge condition, is what stops it
 * being rediscovered a fifth time.
 */

const source = createProjectTextReader().readText("public/js/lists.js");
const contracts = createProjectTextReader().readText("src/types/browser-contracts.d.ts");

/** The selection, lifted with a window that records what it was asked to do. */
function selector() {
  const state = { selectedListId: "seeded" };
  /** @type {string[]} */
  const replaced = [];
  /** @type {unknown[]} */
  const rendered = [];
  const sandbox = vm.createContext({
    state,
    URLSearchParams,
    window: {
      location: { search: "?list=old&keep=yes", pathname: "/lists.html" },
      history: { replaceState: (/** @type {unknown} */ _s, /** @type {unknown} */ _t, /** @type {string} */ url) => replaced.push(url) },
    },
    renderDetail: (/** @type {unknown} */ list) => rendered.push(list),
    selectedList: () => ({ list_id: state.selectedListId }),
    // A free variable of the lifted function: stubbed rather than lifted, because what it does to
    // the index panel is a different surface's contract and not what these cases are about.
    collapseIndexAfterSelection: () => {},
    updateListSelectionState: () => {},
  });
  vm.runInContext(extractFunctionBlock(source, "selectList"), sandbox);
  return { selectList: vm.runInContext("selectList", sandbox), state, replaced, rendered };
}

describe("Selecting one list", () => {
  it("records the selection and renders it", () => {
    const { selectList, state, rendered } = selector();

    selectList("list-1");
    assert.equal(state.selectedListId, "list-1");
    assert.equal(rendered.length, 1, "the detail is rendered for the new selection");
  });

  it("clears the selection for an empty identifier rather than storing undefined", () => {
    const { selectList, state } = selector();

    selectList("");
    assert.equal(state.selectedListId, "");
    selectList(undefined);
    assert.equal(state.selectedListId, "");
  });

  it("writes the selection into the address bar, keeping the other parameters", () => {
    const { selectList, replaced } = selector();

    selectList("list-1");
    assert.equal(replaced.length, 1);
    assert.match(replaced[0], /^\/lists\.html\?/);
    assert.match(replaced[0], /list=list-1/);
    assert.match(replaced[0], /keep=yes/, "an unrelated parameter survives the rewrite");
  });

  it("removes the parameter when the selection is cleared", () => {
    const { selectList, replaced } = selector();

    selectList("");
    assert.doesNotMatch(replaced[0], /list=/);
    assert.match(replaced[0], /keep=yes/);
  });

  /**
   * The option is compared against `false`, not tested for truth. That distinction is the whole
   * contract: a caller that passes no options still updates the address bar.
   */
  it("updates the address bar unless the caller explicitly says false", () => {
    for (const options of [undefined, {}, { updateUrl: true }]) {
      const { selectList, replaced } = selector();
      selectList("list-1", options);
      assert.equal(replaced.length, 1, `${JSON.stringify(options)} still updates the url`);
    }

    const { selectList, replaced, state, rendered } = selector();
    selectList("list-1", { updateUrl: false });
    assert.equal(replaced.length, 0, "and only an explicit false suppresses it");
    assert.equal(state.selectedListId, "list-1", "while the selection itself is still recorded");
    assert.equal(rendered.length, 1, "and the detail is still rendered");
  });
});

describe("The one root four readers share", () => {
  it("is the published record declaring its columns optional", () => {
    // A draft the editor has not created yet has no identifier and no columns, which is why the
    // record says so. Every reader that turns one of those into something the platform requires
    // as text is blocked by this and by nothing else.
    assert.match(contracts, /export interface BrowserNormalizedListRecord extends Partial<Omit<BrowserListSummary,/,
      "the record is still a partial of the wire summary");
    assert.match(contracts, /\n {2}list_id: string \| undefined;/,
      "and its identifier is still declared optional outright");
  });

  it("is recorded once, on the reader that names all four", () => {
    const at = source.indexOf("async function runAction(");
    const block = source.slice(source.lastIndexOf("/**", at), at);

    assert.match(block, /seven readers now share this one root/,
      "the deferral is consolidated rather than repeated at each site");
    for (const reader of ["runAction", "moveItem", "listIndexItem", "detailActionButtons", "detailMetaItems", "listState", "readOnlyStateMessage"]) {
      assert.ok(block.includes(reader), `${reader} is named in the shared note`);
    }
    assert.match(block, /discharged by\*\* a caller or reader that vouches for a record as saved/i,
      "with one discharge condition, not four");
    assert.equal(block.match(/discharged by/gi)?.length, 1,
      "and exactly one, so the four sites cannot drift into four separate conditions");
  });

  it("leaves all four readers' record parameter undeclared", () => {
    for (const name of ["runAction", "moveItem", "listIndexItem", "detailActionButtons", "detailMetaItems", "listState", "readOnlyStateMessage"]) {
      const at = source.indexOf(`function ${name}(`);
      assert.notEqual(at, -1, `${name} still exists`);
      const block = source.slice(source.lastIndexOf("/**", at), at);
      assert.doesNotMatch(block, /@param \{[^}]*\} \[?list\]?[\s@]/,
        `${name}'s record is annotated; the shared deferral is discharged and this pin should go with it`);
    }
  });

  it("keeps the reads that make it a real block, rather than a theoretical one", () => {
    // If any of these stops being how the reader uses the record, the deferral needs re-deciding
    // rather than re-pinning.
    assert.match(source, /const listId = encodeURIComponent\(list\.list_id\);/, "runAction builds a route");
    assert.match(source, /encodeURIComponent\(list\.list_id\)\}\/items\/reorder/, "moveItem builds a route");
    assert.match(source, /LIST_TYPE_LABELS\[list\.list_type\]/, "listIndexItem indexes by column");
    assert.match(source, /\["active", "completed"\]\.includes\(list\.status\)/, "detailActionButtons tests a fixed set");
    assert.match(source, /STATUS_LABELS\[list\.status\] \|\| list\.status/, "detailMetaItems indexes by column");
  });
});

describe("What the dispatch surface declares", () => {
  it("takes the registry's parameter bag as a record it only spreads", () => {
    assert.match(source, /open: \(\/\*\* @type \{Record<string, unknown>\} \*\/ params,/,
      "the opener spreads the bag and reads nothing out of it");
    assert.match(source, /@type \{ListEditorHostContext \| null\} \*\/ hostContext\) =>/,
      "and the host context is the shape the editor already declares");
  });

  it("takes the behaviour's record as unknown, because the resolver is what vouches for it", () => {
    const at = source.indexOf("async function runRegisteredListBehavior(");
    const block = source.slice(source.lastIndexOf("/**", at), at);

    // `0.33.33.43.29` gave the reference a name. The claim is unchanged: every member optional and
    // `unknown`, which is the same as vouching for nothing.
    assert.match(block, /@param \{string\} action @param \{ListRecordReference\} record/);
    assert.match(source, /\}\s*\| null\} ListRecordReference/, "and that shape admits an absent record");
    assert.match(source, /const list = resolveListRecord\(record\);/,
      "the resolver is still what turns it into a list or refuses it");
  });

  it("forwards an absent item identifier rather than requiring one", () => {
    // `runRegisteredListBehavior` calls `runAction` with two arguments, so the third really is
    // absent on a live path; `moveItem` then matches no item and refuses at the lookup.
    const runActionBlock = source.slice(source.lastIndexOf("/**", source.indexOf("async function runAction(")), source.indexOf("async function runAction("));
    assert.match(runActionBlock, /@param \{string\} \[itemId\]/);

    const moveItemBlock = source.slice(source.lastIndexOf("/**", source.indexOf("async function moveItem(")), source.indexOf("async function moveItem("));
    assert.match(moveItemBlock, /@param \{string \| undefined\} itemId/);
    assert.match(source, /const selectedId = await runAction\(action, list\);/,
      "and the two-argument call that makes it absent is still there");
  });
});
