import fs from "node:fs";
import { expect } from "@playwright/test";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
import { test } from "./support/isolated-workspace.mjs";

const source = fs.readFileSync(new URL("../../public/js/lists.js", import.meta.url), "utf8");
const baseline = JSON.parse(fs.readFileSync(new URL("../fixtures/lists-option-consumers/baseline.json", import.meta.url), "utf8"));
const current = extractFunctionBlock(source, "option");

test("option native setter comparison includes legacy document.all and partial progress", async ({ isolatedWorkspace, browser }, testInfo) => {
  const { page } = isolatedWorkspace;
  await page.goto("/lists.html");
  const rows = await page.evaluate(({ before, after }) => {
    const rows = [];
    for (const sink of ["value", "textContent"]) {
      for (const kind of ["text", "number", "null", "undefined", "false", "empty", "array", "node", "object", "symbol", "unconvertible", "throwing", "document.all"]) {
        const run = (/** @type {string} */ body) => {
          /** @type {string[]} */
          const calls = [];
          const sentinel = { marker: true };
          let input;
          switch (kind) {
            case "text": input = " label "; break;
            case "number": input = 7; break;
            case "null": input = null; break;
            case "undefined": input = undefined; break;
            case "false": input = false; break;
            case "empty": input = ""; break;
            case "array": input = ["x", "y"]; break;
            case "node": input = globalThis.document.createElement("span"); break;
            case "object": input = { toString() { calls.push("input"); return "object-label"; } }; break;
            case "symbol": input = Symbol("label"); break;
            case "unconvertible": input = Object.create(null); break;
            case "throwing": input = { toString() { calls.push("input"); throw sentinel; } }; break;
            case "document.all": input = globalThis.document.all; break;
          }
          const element = globalThis.document.createElement("option");
          const option = new Function("document", body + "; return option;")({ createElement: () => element });
          const other = { toString() { calls.push("other"); return "other"; } };
          let error = null;
          try { option(sink === "value" ? input : other, sink === "textContent" ? input : other); }
          catch (thrown) { error = { name: thrown instanceof Error ? thrown.name : "", message: thrown instanceof Error ? thrown.message : "", identity: thrown === sentinel }; }
          return { value: element.value, text: element.textContent, calls, error };
        };
        rows.push({ sink, kind, before: run(before), after: run(after) });
      }
    }
    return rows;
  }, { before: baseline.functions.option, after: current });
  expect(rows).toHaveLength(26);
  for (const row of rows) {
    expect(row.after.value, `${row.sink}/${row.kind}`).toBe(row.before.value);
    expect(row.after.text).toBe(row.before.text);
    expect(row.after.calls).toEqual(row.before.calls);
    if (["symbol", "unconvertible"].includes(row.kind)) {
      expect(row.before.error?.name).toBe("TypeError");
      expect(row.after.error?.name).toBe("TypeError");
    } else expect(row.after.error).toEqual(row.before.error);
    if (row.kind === "throwing") {
      expect(row.after.error?.identity).toBe(true);
      expect(row.after.calls).toEqual(row.sink === "value" ? ["input"] : ["other", "input"]);
      expect(row.after.value).toBe(row.sink === "value" ? "" : "other");
      expect(row.after.text).toBe("");
    }
    if (row.kind === "document.all" && row.sink === "textContent") expect(row.after.text).not.toBe("");
    if (row.kind === "null" || row.kind === "undefined") {
      if (row.sink === "textContent") expect(row.after.text).toBe("");
      else expect(row.after.value).toBe(row.kind);
    }
  }
  fs.mkdirSync(testInfo.outputDir, { recursive: true });
  const output = testInfo.outputPath("setter-comparison.json");
  fs.writeFileSync(output, JSON.stringify({ base: baseline.base, browser: browser.version(), rows }, null, 2));
  await testInfo.attach("setter-comparison", { path: output, contentType: "application/json" });
});
