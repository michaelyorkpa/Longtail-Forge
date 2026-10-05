import assert from "node:assert/strict";
import vm from "node:vm";
import { URLSearchParams } from "node:url";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/notes.js");
const names = ["normalizeText", "appendNotesQueryParam", "activeStatusFilter", "selectedOptionText", "optionListHasValue", "cacheNotesElements", "findNotesControl", "requireNamespace"];
function fixture() {
  const browser = createFakeBrowserContext(), state = { activeBucket: "all" };
  const context = vm.createContext({ ...browser, state, URLSearchParams });
  for (const name of names) vm.runInContext(extractFunctionBlock(source, name), context);
  const api = vm.runInContext(`({${names.join(",")}})`, context);
  return { api, context, state, document: browser.document };
}
/** @param {ReturnType<typeof fixture>} f @param {string} value @param {string} text */
function option(f, value, text) {
  const element = f.document.createElement("option"); element.value = value; element.textContent = text; return element;
}

describe("Notes query and select-value readers", () => {
  it("preserves falsy-to-empty, trimming, case and ordinary String coercion", () => {
    const { api } = fixture();
    for (const input of [null, undefined, false, 0, -0, NaN, "", " \t\n "]) assert.equal(api.normalizeText(input), "");
    for (const [input, text] of [[true, "true"], [42, "42"], ["  MiXeD & <b>literal</b>  ", "MiXeD & <b>literal</b>"], [["A", "B"], "A,B"], [{}, "[object Object]"], [Symbol("tag"), "Symbol(tag)"]]) {
      assert.equal(api.normalizeText(input), text);
    }
  });
  it("performs coercion once and preserves a thrown coercion value instead of swallowing it", () => {
    const { api } = fixture(); let calls = 0;
    assert.equal(api.normalizeText({ toString: () => { calls++; return "  Coerced  "; } }), "Coerced"); assert.equal(calls, 1);
    const failure = new Error("coercion refused");
    assert.throws(() => api.normalizeText({ toString: () => { throw failure; } }), (error) => error === failure);
  });
  it("sets a normalized outgoing value once, replacing duplicates while preserving unrelated query members", () => {
    const { api } = fixture(), params = new URLSearchParams("owner=old&owner=duplicate&keep=unchanged");
    api.appendNotesQueryParam(params, "owner", "  A & B / 日本語  ");
    assert.deepEqual([...params], [["owner", "A & B / 日本語"], ["keep", "unchanged"]]);
    assert.equal(new URLSearchParams(params.toString()).get("owner"), "A & B / 日本語");
    api.appendNotesQueryParam(params, "count", 42); assert.equal(params.get("count"), "42");
  });
  it("omits empty and ignored values without deleting an existing query member or treating other case as the sentinel", () => {
    const { api } = fixture();
    for (const input of [undefined, null, false, 0, "", " \n ", " all "]) {
      const params = new URLSearchParams("status=retained");
      api.appendNotesQueryParam(params, "status", input, "all"); assert.equal(params.toString(), "status=retained");
    }
    const params = new URLSearchParams(); api.appendNotesQueryParam(params, "status", " ALL ", "all"); assert.equal(params.get("status"), "ALL");
    api.appendNotesQueryParam(params, "blank", ""); assert.equal(params.has("blank"), false);
  });
  it("caches the actual select, defaults absent or wrong controls locally and honors archive before reading it", () => {
    const f = fixture(), select = f.document.createElement("select"); select.dataset.noteFilterStatus = ""; select.value = "all";
    f.document.body.append(select); f.api.cacheNotesElements(); assert.equal(f.context.statusFilter === select, true);
    assert.equal(f.api.activeStatusFilter(), "all"); select.value = "archived"; assert.equal(f.api.activeStatusFilter(), "archived");
    select.value = ""; assert.equal(f.api.activeStatusFilter(), "active");
    f.state.activeBucket = "archive";
    Object.defineProperty(select, "value", { get: () => { throw new Error("archive must not consult status control"); } });
    assert.doesNotThrow(() => f.api.activeStatusFilter());
    assert.equal(f.api.activeStatusFilter(), "archived");
    f.state.activeBucket = "reference"; select.remove();
    const wrong = f.document.createElement("input"); wrong.dataset.noteFilterStatus = ""; wrong.value = "deleted"; f.document.body.append(wrong);
    f.api.cacheNotesElements(); assert.equal(f.context.statusFilter, null); assert.doesNotThrow(() => f.api.activeStatusFilter()); assert.equal(f.api.activeStatusFilter(), "active");
    wrong.remove(); f.api.cacheNotesElements(); assert.doesNotThrow(() => f.api.activeStatusFilter()); assert.equal(f.context.statusFilter, null); assert.equal(f.api.activeStatusFilter(), "active");
    f.state.activeBucket = "archive"; assert.equal(f.api.activeStatusFilter(), "archived");
  });
  it("reads the first matching option value rather than selection flags and trims only its visible text", () => {
    const f = fixture(), select = f.document.createElement("select");
    const first = option(f, "project", "  First <b>literal</b>  "), second = option(f, "project", "Second"), other = option(f, "other", "Wrong");
    other.selected = true; select.append(other, first, second); select.value = "project";
    assert.equal(f.api.selectedOptionText(select, "Fallback"), "First <b>literal</b>");
    select.value = "other"; assert.equal(f.api.selectedOptionText(select, "Fallback"), "Wrong");
    assert.equal(first.textContent, "  First <b>literal</b>  "); assert.equal(select.value, "other");
  });
  it("retains the caller fallback unchanged for absent, unmatched and blank-label selections", () => {
    const f = fixture(), select = f.document.createElement("select"), fallback = "  Caller fallback  ";
    select.append(option(f, "known", " \n ")); select.value = "known";
    assert.equal(f.api.selectedOptionText(select, fallback), fallback);
    select.value = "unknown"; assert.equal(f.api.selectedOptionText(select, fallback), fallback);
    assert.doesNotThrow(() => f.api.selectedOptionText(null, fallback));
    assert.equal(f.api.selectedOptionText(null, fallback), fallback); assert.equal(f.api.selectedOptionText(undefined, fallback), fallback);
    assert.equal(f.api.selectedOptionText(null, ""), "");
  });
  it("checks exact native option values without trimming, inspecting labels or altering the option list", () => {
    const f = fixture(), blank = option(f, "", "No selection"), first = option(f, "project", "Different label"), last = option(f, "last", "project");
    const options = Object.freeze([blank, first, last]);
    assert.doesNotThrow(() => f.api.optionListHasValue());
    assert.equal(f.api.optionListHasValue(), false); assert.equal(f.api.optionListHasValue(options), true);
    assert.equal(f.api.optionListHasValue(options, "project"), true); assert.equal(f.api.optionListHasValue(options, "last"), true);
    assert.equal(f.api.optionListHasValue(options, " project "), false); assert.equal(f.api.optionListHasValue(options, "Different label"), false);
    assert.equal(f.api.optionListHasValue(options, "missing"), false); assert.equal(options[1] === first, true); assert.equal(options.length, 3);
  });
});
