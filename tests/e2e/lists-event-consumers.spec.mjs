import fs from "node:fs";
import { expect } from "@playwright/test";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
import { test } from "./support/isolated-workspace.mjs";

const source = fs.readFileSync(new URL("../../public/js/lists.js", import.meta.url), "utf8");
const baseline = JSON.parse(fs.readFileSync(new URL("../fixtures/lists-event-consumers/baseline.json", import.meta.url), "utf8"));
const helpers = ["isListEventForm", "requireListEventForm", "listEventField", "callListEventMember"].map(name => extractFunctionBlock(source, name)).join("\n");
const getter = source.match(/const listFormElementsGetter = [^;]+;/)?.[0];
if (!getter) throw new Error("Missing captured native form getter");
const current = Object.fromEntries(Object.keys(baseline.functions).map(name => [name, extractFunctionBlock(source, name)]));

test("real event consumers preserve paths, receiver order and native form acceptance", async ({ isolatedWorkspace, browser }, testInfo) => {
  const { page } = isolatedWorkspace;
  await page.goto("/lists.html");
  const rows = await page.evaluate(async ({ baseline, current, helpers, getter }) => {
    const rows = [];
    const kinds = ["add", "edit", "foreign", "detached", "no-window", "link", "unmatched", "svg", "action", "null-save", "null-click", "null-submit", "text", "noncallable-matches", "nonform", "matching-nonform", "target-hook", "method-hook", "method-throws", "dataset-hook", "formdata-throws", "repeated-target", "save-list-hook"];
    for (const kind of kinds) {
      const run = async (/** @type {boolean} */ before) => {
        /** @type {unknown[]} */ const log = [];
        const sentinel = { marker: true };
        const iframe = globalThis.document.createElement("iframe");
        globalThis.document.body.append(iframe);
        const doc = kind === "foreign" ? iframe.contentDocument : kind === "no-window" ? globalThis.document.implementation.createHTMLDocument() : globalThis.document;
        if (!doc) throw new Error("Missing test document");
        const form = doc.createElement("form");
        form.dataset.listId = "list-1";
        if (kind === "edit") form.dataset.editingItemId = "item-1";
        form.innerHTML = '<input name="item_name" value="Kept"><input name="target_type" value="project"><input name="target_id" value="project-1">';
        form.setAttribute("data-list-link-form", "");
        form.addEventListener("formdata", () => log.push("formdata"));
        form.addEventListener("reset", () => log.push("reset"));
        // The probe must not read these target-owned properties, including on genuine forms.
        for (const key of ["elements", "ownerDocument", "constructor", "tagName"]) {
          Object.defineProperty(form, key, { get() { throw sentinel; } });
        }
        /** @type {unknown} */ let target;
        let name = "saveItem";
        if (["link", "unmatched", "matching-nonform", "null-submit", "noncallable-matches", "repeated-target"].includes(kind)) name = "handleDetailSubmit";
        if (["svg", "action", "null-click", "text", "method-hook", "method-throws"].includes(kind)) name = "handleDetailClick";
        if (kind === "save-list-hook") name = "saveList";
        if (kind.startsWith("null-")) target = null;
        else if (kind === "text") target = globalThis.document.createTextNode("text");
        else if (kind === "svg") target = globalThis.document.createElementNS("http://www.w3.org/2000/svg", "svg");
        else if (["unmatched", "matching-nonform", "nonform"].includes(kind)) {
          const div = globalThis.document.createElement("div");
          if (kind === "matching-nonform") div.setAttribute("data-list-link-form", "");
          target = div;
        } else if (kind === "noncallable-matches") target = { matches: 7 };
        else if (kind === "dataset-hook") target = { get dataset() { log.push("dataset"); throw sentinel; } };
        else if (["action", "method-hook", "method-throws"].includes(kind)) {
          target = { get closest() {
            log.push("closest-get");
            if (kind === "method-hook") throw sentinel;
            const method = /** @this {unknown} */ function () {
              log.push(["closest-this", this === target]);
              if (kind === "method-throws") throw sentinel;
              return { dataset: { listId: "list-1", listAction: "complete-list" } };
            };
            Object.defineProperty(method, "call", { get() { throw sentinel; } });
            Object.defineProperty(method, "apply", { get() { throw sentinel; } });
            return method;
          } };
        } else target = form;
        let reads = 0;
        const event = {
          get target() {
            log.push("target"); reads++;
            if (kind === "target-hook") throw sentinel;
            if (kind === "repeated-target" && reads === 1) return { matches() { log.push("matches"); return true; } };
            return target;
          },
          preventDefault() { log.push("prevent"); if (kind === "save-list-hook") throw sentinel; },
        };
        const record = { list_id: "list-1", items: [] };
        const state = { lists: [record], selectedListId: "list-1" };
        const api = {
          postJson: async (/** @type {unknown[]} */ ...args) => { log.push(["post", ...args]); return {}; },
          putJson: async (/** @type {unknown[]} */ ...args) => { log.push(["put", ...args]); return {}; },
        };
        const nativeFormData = globalThis.FormData;
        const globals = {
          Object: new Proxy(Object, {
            get(object, key, receiver) {
              if (key !== "getOwnPropertyDescriptor") return Reflect.get(object, key, receiver);
              return (/** @type {object} */ prototype, /** @type {PropertyKey} */ property) => {
                const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
                if (prototype !== globalThis.HTMLFormElement.prototype || property !== "elements" || !descriptor?.get) return descriptor;
                const nativeGetter = descriptor.get;
                return { ...descriptor, get() { log.push("native-probe"); return Reflect.apply(nativeGetter, this, []); } };
              };
            },
          }),
          state,
          requireApi: () => { log.push("api"); return api; },
          requireListsHandle: (/** @type {unknown} */ value) => value,
          itemDialogSave: { disabled: false }, itemDialogFormStatus: { textContent: "" },
          closeItemDialog: () => log.push("close"),
          refreshLists: async (/** @type {unknown} */ id) => log.push(["refresh", id]),
          setStatus: (/** @type {unknown[]} */ ...args) => log.push(["status", ...args]),
          requireErrors: () => ({ caughtMessage: (/** @type {Error} */ error) => { log.push("caught"); return error.message; } }),
          get FormData() {
            log.push("FormData-lookup");
            return function (/** @type {HTMLFormElement} */ candidate) {
              log.push("FormData-construct");
              if (kind === "formdata-throws") throw sentinel;
              return new nativeFormData(candidate);
            };
          },
        };
        // A with scope preserves the constructor lookup's position before argument evaluation.
        const bodies = before ? baseline : current;
        const body = `${before ? "" : getter + helpers}\n${bodies.runAction}\n${bodies[name]}\nreturn ${name};`;
        const handler = new Function("globals", `with (globals) { ${body} }`)(globals);
        let error = null;
        try { await handler(event); }
        catch (e) { error = { name: e instanceof Error ? e.name : "", message: e instanceof Error ? e.message : "", identity: e === sentinel }; }
        iframe.remove();
        return { log, error };
      };
      rows.push({ kind, before: await run(true), after: await run(false) });
    }
    return rows;
  }, { baseline: baseline.functions, current, helpers, getter });
  const changed = new Map([
    ["null-save", "The list event target cannot be read."], ["null-click", "The list event target cannot be read."], ["null-submit", "The list event target cannot be read."],
    ["text", "The list event target has no callable closest."], ["noncallable-matches", "The list event target has no callable matches."],
    ["nonform", "The list submission requires a form."], ["matching-nonform", "The list submission requires a form."],
  ]);
  for (const row of rows) {
    // Wrong forms are refused by the probe, before the one real constructor would run.
    const beforeLog = ["nonform", "matching-nonform"].includes(row.kind) ? row.before.log.filter(entry => entry !== "FormData-construct") : row.before.log;
    expect(row.after.log.filter(entry => entry !== "native-probe"), row.kind).toEqual(beforeLog);
    const reached = row.before.log.includes("FormData-lookup");
    expect(row.after.log.filter(entry => entry === "native-probe")).toHaveLength(reached ? 1 : 0);
    if (reached) expect(row.after.log.indexOf("native-probe")).toBe(row.after.log.indexOf("FormData-lookup") + 1);
    if (changed.has(row.kind)) {
      expect(row.before.error?.name, row.kind).toBe("TypeError");
      expect(row.after.error).toEqual({ name: "TypeError", message: changed.get(row.kind), identity: false });
      expect(row.after.log).not.toContain("caught");
    } else expect(row.after.error, row.kind).toEqual(row.before.error);
    if (["add", "edit", "foreign", "detached", "no-window", "link", "repeated-target"].includes(row.kind)) {
      expect(row.after.error, row.kind).toBeNull();
      expect(row.after.log.filter(entry => entry === "FormData-construct")).toHaveLength(1);
      expect(row.after.log.filter(entry => entry === "formdata")).toHaveLength(1);
    }
    if (row.kind.endsWith("hook") || ["method-throws", "formdata-throws"].includes(row.kind)) expect(row.after.error?.identity, row.kind).toBe(true);
  }
  await testInfo.attach("event-comparison", { body: JSON.stringify({ version: browser.version(), rows }, null, 2), contentType: "application/json" });
});
