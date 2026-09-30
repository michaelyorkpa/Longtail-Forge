import fs from "node:fs";
import { expect } from "@playwright/test";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
import { test } from "./support/isolated-workspace.mjs";
const source = fs.readFileSync("public/js/lists.js", "utf8");
const baseline = JSON.parse(fs.readFileSync("tests/fixtures/lists-zero/baseline.json", "utf8"));
const names = Object.keys(baseline.functions);
const helpers = ["isListsDatasetBag", "setListsSurfaceHook", "isListSortObject", "listSortNumeric", "compareListSortOrders"];
const current = [...names, ...helpers].map(name => extractFunctionBlock(source, name)).join("\n");
const before = Object.values(baseline.functions).join("\n");
test("surface decoration and native progress conversions match the committed baseline", async ({ isolatedWorkspace, browser }, testInfo) => {
  const { page } = isolatedWorkspace;
  await page.goto("/lists.html");
  const report = await page.evaluate(({ before, current }) => {
    const namespace = Reflect.get(globalThis.window, "LongtailForge");
    if (!namespace) throw new Error("The shipped namespace is missing.");
    const runs = [];
    for (const kind of ["normal", "fallback", "missing", "svg", "foreign", "null-dataset"]) {
      const results = [];
      for (const body of [before, current]) {
        const doc = kind === "foreign" ? globalThis.document.implementation.createHTMLDocument() : globalThis.document;
        const surface = doc.createElement("main");
        surface.innerHTML = kind === "missing" ? "" : `<header class="view-page-header"><h1 class="view-page-title">Lists</h1><button data-surface-action="lists.create">Create</button></header><section ${kind === "fallback" ? 'class="view-filter-panel"' : 'data-view-sidebar-panel="lists-filters"'}><form data-view-filter-form></form></section><section ${kind === "fallback" ? 'class="view-stacked"' : 'class="view-slideout-sidebar"'}><section ${kind === "fallback" ? 'class="view-collapsible-index"' : 'data-view-sidebar-panel="lists-index"'}><h2 class="view-collapsible-index-title">Old</h2><div class="view-collapsible-index-body">Old</div></section><div class="view-stacked-detail view-slideout-sidebar-main">Old</div></section>`;
        if (kind === "svg") {
          const heading = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
          heading.classList.add("view-page-title");
          surface.querySelector("h1")?.replaceWith(heading);
        }
        if (kind === "null-dataset") Object.defineProperty(surface.querySelector("[data-surface-action]"), "dataset", { value: null });
        const decorate = new Function("requireView", "activeListsViewDescriptor", body + ";return decorateListsDeclarativeSurface;")(() => namespace.view, { indexPanel: { title: "Selector" } });
        let error = "";
        try { decorate(surface); } catch (e) { error = e instanceof Error ? e.name : "other"; }
        results.push({ html: surface.innerHTML, error });
      }
      runs.push({ kind, before: results[0], after: results[1] });
    }
    const arithmetic = [];
    for (const kind of ["number", "text", "bad", "bigint", "mixed", "symbol", "hook", "throwing", "document.all-number", "document.all-bigint", "legacy-callable", "all-valueOf", "all-toString", "all-operand", "all-proxy", "revoked-exotic", "revoked-ordinary"]) {
      const results = [];
      for (const body of [before, current]) {
        /** @type {unknown[]} */
        const calls = [];
        const sentinel = {};
        let value;
        switch (kind) {
          case "all-valueOf": value = { valueOf: globalThis.document.all, toString() { calls.push("unexpected toString"); return "9"; } }; break;
          case "all-toString": value = { valueOf: 7, toString: globalThis.document.all }; break;
          case "all-operand": value = globalThis.document.all; break;
          case "all-proxy": value = { valueOf: new Proxy(globalThis.document.all, {}) }; break;
          case "revoked-exotic": case "revoked-ordinary": {
            const revocable = Proxy.revocable(function () { return 9; }, {});
            revocable.revoke();
            value = kind === "revoked-exotic" ? { [Symbol.toPrimitive]: revocable.proxy } : { valueOf: revocable.proxy };
            break;
          }
          case "legacy-callable": value = { [Symbol.toPrimitive]: globalThis.document.all, get valueOf() { calls.push("unexpected fallback"); throw sentinel; } }; break;
          case "number": value = 9; break;
          case "text": value = "9"; break;
          case "bad": value = "bad"; break;
          case "bigint": case "mixed": value = 9n; break;
          case "symbol": value = Symbol("sort"); break;
          case "hook": value = { [Symbol.toPrimitive](/** @type {unknown} */ hint) { calls.push(hint); return 9; } }; break;
          case "throwing": value = { valueOf() { calls.push("throw"); throw sentinel; } }; break;
          default:
            value = globalThis.document.all;
            Object.defineProperty(value, Symbol.toPrimitive, { configurable: true, value(/** @type {unknown} */ hint) { calls.push(hint); return kind.endsWith("bigint") ? 9n : 9; } });
        }
        const normalize = new Function(body + ";return normalizeListProgress;")();
        const items = [
          { get sort_order() { calls.push("read:first"); return value; }, item_name: "first" },
          { get sort_order() { calls.push("read:second"); return kind === "bigint" ? 2n : 2; }, item_name: "second" },
          { get sort_order() { calls.push("read:third"); return 1; }, item_name: "third" },
        ];
        // Instrument comparator entry and successful order only; native sort still invokes it.
        const restoreSort = new Function("log", `
          const native = Array.prototype.sort;
          Array.prototype.sort = function(compare) {
            const result = Reflect.apply(native, this, [function(left, right) {
              log("compare");
              return compare(left, right);
            }]);
            log("order:" + result.map(row => row.item_name).join(","));
            return result;
          };
          return () => { Array.prototype.sort = native; };
        `)((/** @type {string} */ entry) => calls.push(entry));
        let result = null;
        let error = null;
        let failureMessage = "";
        try { result = normalize({}, items); }
        catch (e) {
          error = { name: e instanceof Error ? e.name : "", same: e === sentinel };
          failureMessage = e instanceof Error ? e.message : "";
        }
        finally {
          restoreSort();
          if (kind.startsWith("document.all")) Reflect.deleteProperty(globalThis.document.all, Symbol.toPrimitive);
        }
        results.push({ result, error, calls, failureMessage });
      }
      arithmetic.push({ kind, before: results[0], after: results[1] });
    }
    return { runs, arithmetic };
  }, { before, current });
  fs.mkdirSync(testInfo.outputDir, { recursive: true });
  const path = testInfo.outputPath("comparison.json");
  fs.writeFileSync(path, JSON.stringify({ base: baseline.base, browser: browser.version(), ...report }, null, 2));
  await testInfo.attach("comparison", { path, contentType: "application/json" });
  for (const row of report.runs) expect(row.after, row.kind).toEqual(row.before);
  for (const row of report.arithmetic) {
    expect(row.after.result, row.kind).toEqual(row.before.result);
    expect(row.after.error, row.kind).toEqual(row.before.error);
    expect(row.after.calls, row.kind).toEqual(row.before.calls);
    if (row.kind === "bigint" || row.kind === "mixed") {
      expect(row.after.calls).toEqual(["compare", "read:second", "read:first"]);
      expect(row.before.error?.name).toBe("TypeError");
      expect(row.after.failureMessage).toBe(row.kind === "bigint"
        ? "The list item sort order difference is not a number."
        : "Lists cannot mix BigInt and number sort orders.");
    }
    if (row.kind === "throwing") expect(row.after.error?.same).toBe(true);
  }
  expect(report.runs).toHaveLength(6);
  expect(report.arithmetic).toHaveLength(17);
});
