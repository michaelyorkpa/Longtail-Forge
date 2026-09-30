import fs from "node:fs";
import { expect } from "@playwright/test";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
import { test } from "./support/isolated-workspace.mjs";

const source = fs.readFileSync(new URL("../../public/js/lists.js", import.meta.url), "utf8");
const names = ["isResponseRecord", "isListsText", "readListsFields", "readListsItemForm", "listsDetailSection", "listsWorkspaceViewSurfaces", "isListsSurfaceDescriptor", "listsViewSurfaceDescriptor", "listsItemFormSurfaceDescriptor", "itemFormField", "createItemFieldFromDescriptor", "buildItemFieldNode", "createItemNameField", "requireNamespace", "hasDescriptorRenderers", "requireView", "checkboxField", "inputField", "textareaField", "selectField", "optionsFromDescriptor", "applySelectDefault", "option"];
const helpers = ["listItemOptionEntryField", "itemFieldOptionControls", "readListItemOptionValues", "listItemOptionChildren"];
const functions = [...names, ...helpers].map(name => extractFunctionBlock(source, name)).join("\n");
/** @param {import("@playwright/test").TestInfo} testInfo @param {string} name @param {unknown} value */
async function retainTable(testInfo, name, value) {
  fs.mkdirSync(testInfo.outputDir, { recursive: true });
  const output = testInfo.outputPath(name + ".json");
  fs.writeFileSync(output, JSON.stringify(value, null, 2));
  await testInfo.attach(name, { path: output, contentType: "application/json" });
}
const listsAsset = /\/js\/lists\.js(?:\?[^#]*)?$/;
const baseline = JSON.parse(fs.readFileSync(new URL("../fixtures/lists-field-descriptors/baseline.json", import.meta.url), "utf8"));
let baselinePage = source;
for (const name of names) baselinePage = baselinePage.replace(extractFunctionBlock(source, name), baseline.functions[name]);

test("baseline and current add/edit item sites build the same ordinary controls", async ({ isolatedWorkspace }, testInfo) => {
  const { page } = isolatedWorkspace;
  const snapshots = [];
  for (const variant of ["baseline", "current"]) {
    /** @type {string[]} */
    const served = [];
    await page.route(listsAsset, route => { served.push(route.request().url()); return route.fulfill({ status: 200, contentType: "application/javascript", body: variant === "baseline" ? baselinePage : source }); });
    await page.goto("/lists.html");
    await page.locator("[data-list-create]").click();
    await page.locator("[data-list-title]").fill(`Fields ${variant} ${testInfo.project.name} ${Date.now()}`);
    await page.locator("[data-list-save]").click();
    await expect(page.locator("[data-list-dialog]")).toBeHidden();
    const detail = page.locator("[data-list-detail]");
    await detail.locator('[data-list-action="add-item"]').click();
    const dialog = page.locator("[data-list-item-dialog]");
    await expect(dialog).toBeVisible();
    const capture = () => dialog.locator("label").evaluateAll(labels => labels.map(label => ({
      text: label.textContent, width: label.dataset.viewFieldWidth,
      controls: [...label.querySelectorAll("input,select,textarea")].map(control => ({
        name: control.getAttribute("name"), type: control.getAttribute("type"),
        value: "value" in control ? control.value : undefined,
        checked: "checked" in control ? control.checked : undefined,
        defaultChecked: "defaultChecked" in control ? control.defaultChecked : undefined,
        options: [...control.querySelectorAll("option")].map(option => [option.value, option.textContent, option.defaultSelected]),
      })),
    })));
    expect(served).toHaveLength(1);
    expect(new URL(served[0]).pathname).toBe("/js/lists.js");
    expect(new URL(served[0]).search).not.toBe("");
    const add = await capture();
    await dialog.locator('[name="item_name"]').fill("Field item");
    await dialog.locator('[name="quantity"]').fill("3");
    await dialog.locator('[name="save_to_catalog"]').uncheck();
    await page.locator("[data-list-item-save]").focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(detail).toContainText("Field item");
    await detail.locator(".lists-item-actions summary").first().focus();
    await page.keyboard.press("Enter");
    await detail.locator('[data-item-action="edit-item"]').first().click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[name="item_name"]')).toHaveValue("Field item");
    const edit = await capture();
    await dialog.locator('[name="item_name"]').fill("Field item edited");
    await dialog.locator('[name="save_to_catalog"]').uncheck();
    await page.locator("[data-list-item-save]").focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(detail).toContainText("Field item edited");
    snapshots.push({ add, edit });
    await page.unroute(listsAsset);
  }
  expect(snapshots[1]).toEqual(snapshots[0]);
});

test("options use their own maps and retain unvalidated return and failure behavior", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/lists.html");
  /** @type {{ kind: string, calls: unknown[], html?: string, error?: { name: string, message: string } }[][]} */
  const outcomes = await page.evaluate(`(() => {
    const factories = [
      () => { ${Object.values(baseline.functions).join("\n")} return {itemFormField,createItemFieldFromDescriptor}; },
      () => { ${functions} return {itemFormField,createItemFieldFromDescriptor}; }
    ];
    const prior=window.LongtailForge.workspaceContext;
    try {
      return factories.map(make=>{
        const api=make(), results=[];
        for(const kind of ["absent","false","records","custom","not-callable","null-entry","map-throws","mapped-not-callable","mapped-null","noniterable-result"]) {
          const calls=[]; let options, error, html;
          if(kind==="false") options=false;
          if(kind==="records") options=[["a","A"],{id:"b",text:"B"}];
          if(kind==="not-callable") options={map:7};
          if(kind==="null-entry") options=[null];
          if(kind==="mapped-not-callable") options={map(){return {map:7};}};
          if(kind==="mapped-null") options={map(){return null;}};
          if(kind==="noniterable-result") options={map(){return {map(){return 7;}};}};
          if(kind==="map-throws") options={get map(){calls.push("get-map");throw new Error("map hook");}};
          if(kind==="custom") {
            const collection={ get map(){calls.push("get-map"); return function(callback){
              calls.push(["map-receiver",this===collection]);
              const pair=callback({value:"x",label:"X"});
              const mapped={map(render){calls.push(["second-map-receiver",this===mapped]);return new Set([render(pair)]);}};
              return mapped;
            };}};
            options=collection;
          }
          const field={field:"purchase_status",type:"select",label:"Status",options,default:"b"};
          window.LongtailForge.workspaceContext={viewSurfaces:[{id:"lists.workspace",moduleId:"lists",detail:{itemForm:{fields:[field]}}}]};
          try { html=api.createItemFieldFromDescriptor(api.itemFormField("purchase_status")).outerHTML; }
          catch(caught){error={name:caught.name,message:caught.message};}
          results.push({kind,calls,html,error});
        }
        return results;
      });
    } finally {window.LongtailForge.workspaceContext=prior;}
  })()`);
  const messages = new Map([
    ["not-callable", "The list item options collection has no callable map."],
    ["null-entry", "A list item option entry cannot be read."],
    ["mapped-not-callable", "The mapped list item options have no callable map."],
    ["mapped-null", "The mapped list item options have no callable map."],
    ["noniterable-result", "The list item option controls are not iterable."],
  ]);
  expect(outcomes[1]).toEqual(outcomes[0].map(entry => messages.has(entry.kind) ? {...entry, error:{name:"TypeError", message:messages.get(entry.kind)}} : entry));
  console.log(JSON.stringify({mapFailureTable:outcomes[0].filter(entry=>messages.has(entry.kind)).map(entry=>({input:entry.kind,before:entry.error,after:messages.get(entry.kind),calls:entry.calls}))}));
  console.log(JSON.stringify({ optionsFailures: outcomes[1].filter(entry => entry.error) }));
  const custom = outcomes[1].find(entry => entry.kind === "custom");
  if (!custom) throw new Error("Missing custom-map probe result.");
  expect(custom.calls).toEqual(["get-map", ["map-receiver", true], ["second-map-receiver", true]]);
  expect(custom.html).toContain('<option value="x">X</option>');
  expect(outcomes[1].find(entry => entry.kind === "not-callable")?.error).toEqual({ name: "TypeError", message: "The list item options collection has no callable map." });
  expect(outcomes[1].find(entry => entry.kind === "null-entry")?.error).toEqual({ name: "TypeError", message: "A list item option entry cannot be read." });
  expect(outcomes[1].find(entry => entry.kind === "map-throws")?.error).toEqual({ name: "Error", message: "map hook" });
});

test("approved native sinks preserve ordinary results and expose their named limitations", async ({ isolatedWorkspace }, testInfo) => {
  const { page } = isolatedWorkspace;
  await page.goto("/lists.html");
  /** @typedef {{ html?: string, error?: { name: string, message: string }, hooks: string[], reads: number, identity: boolean, type?: string, attribute?: string | null, controlParent: string | null }} NativeSnapshot */
  /** @type {{ version: string, comparisons: { which: string, kind: string, before: NativeSnapshot, after: NativeSnapshot }[] }} */
  const results = await page.evaluate(`(() => {
    const before = (() => { ${Object.values(baseline.functions).join("\n")} return {inputField,textareaField,checkboxField,selectField,createItemNameField}; })();
    const after = (() => { ${functions} return {inputField,textareaField,checkboxField,selectField,createItemNameField}; })();
    const frame = document.createElement("iframe"); document.body.append(frame);
    const cases = ["text","zero","false","null","undefined","empty","space","array","node","object","throw","effect-throw","symbol","unconvertible","fake-node","foreign-node","proxy"];
    function observe(api, which, kind) {
      const made = [], hooks = []; let reads = 0;
      const create = document.createElement;
      document.createElement = function(...args) { const node = Reflect.apply(create,this,args); made.push(node); return node; };
      let value, error, result;
      try {
        switch(kind) {
          case "text": value="Label"; break;
          case "zero": value=0; break;
          case "false": value=false; break;
          case "null": value=null; break;
          case "undefined": value=undefined; break;
          case "empty": value=""; break;
          case "space": value="  "; break;
          case "array": value=["A","B"]; break;
          case "node": value=create.call(document,"b"); value.textContent="Node text"; break;
          case "foreign-node": value=frame.contentDocument.createElement("b"); value.textContent="Foreign text"; break;
          case "fake-node": value=Object.create(Node.prototype); break;
          case "object": value={ [Symbol.toPrimitive](hint) { hooks.push(hint); return "number"; } }; break;
          case "throw": value={toString(){hooks.push("throw");throw new Error("hook failure");}}; break;
          case "effect-throw": value={toString(){hooks.push("effect");made[0].textContent="hook effect";throw new Error("hook failure");}}; break;
          case "symbol": value=Symbol("label"); break;
          case "unconvertible": value=Object.create(null); break;
          case "proxy": value=new Proxy({}, {getPrototypeOf(){throw new Error("prototype trap");}}); break;
        }
        if (which === "input") result=api.inputField(value,"text","field",{required:true});
        if (which === "type") result=api.inputField("Label",value,"field",{});
        if (which === "textarea") result=api.textareaField(value,"field",{rows:3});
        if (which === "checkbox") result=api.checkboxField(value,"field","true",{checked:true});
        if (which === "select") { const option=create.call(document,"option");option.value="a";option.textContent="A";result=api.selectField(value,"field",[option]); }
        if (which === "children") result=api.selectField("Label","field",["Before",value,"After"]);
        if (which === "name") result=api.createItemNameField({get label(){reads++;return value;}});
      } catch (caught) { error={name:caught.name,message:caught.message}; }
      finally {document.createElement=create;}
      const label=made.find(n=>n.tagName==="LABEL"), input=made.find(n=>n.tagName==="INPUT");
      return {html:label?.outerHTML, error, hooks, reads, identity: result ? [...result.childNodes, ...result.querySelectorAll("select > *")].includes(value) : false,
        type:input?.type, attribute:input?.getAttribute("type"), controlParent:input?.parentElement?.tagName || null};
    }
    const comparisons=[];
    for(const which of ["input","textarea","checkbox","select","name","type","children"]) for(const kind of cases) comparisons.push({which,kind,before:observe(before,which,kind),after:observe(after,which,kind)});
    frame.remove(); return {version:navigator.userAgent,comparisons};
  })()`);
  for (const entry of results.comparisons) {
    const { which, kind, before, after } = entry;
    if (which !== "type" && kind === "foreign-node") {
      expect(before.identity).toBe(true);
      expect(after.identity).toBe(false);
      expect(after.html).toContain("[object HTMLElement]");
      continue;
    }
    if (which !== "type" && kind === "proxy") {
      expect(before.error).toBeUndefined();
      expect(after.error).toEqual({ name: "Error", message: "prototype trap" });
      continue;
    }
    if (kind === "symbol" || kind === "unconvertible") {
      expect(before.error?.name).toBe("TypeError");
      expect(after.error?.name).toBe("TypeError");
      expect({ ...after, error: undefined }).toEqual({ ...before, error: undefined });
    } else {
      expect(after, `${which}/${kind}`).toEqual(before);
    }
    if (which !== "type" && kind === "fake-node") {
      expect(after.error).toBeUndefined();
      expect(after.html).toContain("[object Node]");
    }
    if (kind === "throw" || kind === "effect-throw") {
      expect(after.error).toEqual({ name: "Error", message: "hook failure" });
      expect(after.hooks).toHaveLength(1);
      expect(after.controlParent).toBeNull();
    }
    if (which === "name") expect(after.reads).toBe(1);
  }
  await retainTable(testInfo,"append-values",{version:results.version,rows:results.comparisons.filter(entry=>entry.which==="children")});
  console.log(JSON.stringify({ browser: results.version, nativeFailures: results.comparisons.filter(entry => entry.kind === "symbol" || entry.kind === "unconvertible").map(({which,kind,before,after})=>({which,kind,before:before.error,after:after.error})) }));
});

test("real field reader preserves opaque labels and checkbox semantics", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/lists.html");
  const observed = await page.evaluate(`(() => {
    ${functions}
    const prior = window.LongtailForge.workspaceContext;
    const label = document.createElement("strong"); label.textContent = "Node label";
    const fields = [
      { field: "item_name", label, width: "full" },
      { field: "notes", type: "textarea", label: ["A", "B"], rows: "3" },
      { field: "save_to_catalog", type: "checkbox", default: true, label: "Reuse" },
      { field: "quantity", type: { toString() { return "number"; } }, default: "2", label: "Qty" },
      { field: "purchase_status", type: "select", label: "Status", default: "b", options: [["a", "A"], ["b", "B"]] }
    ];
    try {
      window.LongtailForge.workspaceContext = { viewSurfaces: [{id:"lists.workspace",moduleId:"lists",detail:{itemForm:{fields}}}] };
      const entry = itemFormField("item_name");
      const name = createItemFieldFromDescriptor(entry);
      const notes = createItemFieldFromDescriptor(itemFormField("notes"));
      const checkbox = createItemFieldFromDescriptor(itemFormField("save_to_catalog")).querySelector("input");
      const quantity = createItemFieldFromDescriptor(itemFormField("quantity")).querySelector("input");
      const select = createItemFieldFromDescriptor(itemFormField("purchase_status")).querySelector("select");
      const fallback = itemFormField("not_contributed");
      return { identity: entry === fields[0] && name.firstChild === label, width: name.dataset.viewFieldWidth, notes: notes.textContent, checked: checkbox.checked, defaultChecked: checkbox.defaultChecked, value: checkbox.value, type: quantity.type, quantity: quantity.value, options: [...select.options].map(o=>[o.value,o.defaultSelected]), selected: select.value, fallback };
    } finally { window.LongtailForge.workspaceContext = prior; }
  })()`);
  expect(observed).toEqual({ identity: true, width: "full", notes: "A,B", checked: true, defaultChecked: true, value: "true", type: "number", quantity: "2", options: [["a", false], ["b", true]], selected: "b", fallback: { field: "not_contributed", type: "text", label: "not_contributed" } });
});


test("input type conversion stays before name and getter-backed attributes", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/lists.html");
  const result = await page.evaluate(`(() => {
    const factories = [
      () => { ${Object.values(baseline.functions).join("\n")} return inputField; },
      () => { ${functions} return inputField; }
    ];
    return factories.map(make => [false, true].map(throws => {
      const inputField = make(), log = [], sentinel = { marker: "type conversion" };
      const original = document.createElement; let input;
      document.createElement = function(name, ...rest) {
        const node = Reflect.apply(original, this, [name, ...rest]);
        log.push("create:" + name);
        if (name === "input") input = node;
        return node;
      };
      const type = { toString() { log.push(["type", input.name, input.getAttribute("type")]); if (throws) throw sentinel; return "number"; } };
      const attributes = {
        get type() { log.push(["attribute:type", input.name, input.type]); return "text"; },
        get min() { log.push(["attribute:min", input.name, input.type]); return "2"; }
      };
      let sameError = false, html;
      try { html = inputField("Label", type, "quantity", attributes).outerHTML; }
      catch (error) { sameError = error === sentinel; }
      finally { document.createElement = original; }
      return { log, sameError, html, name: input.name, type: input.type, attribute: input.getAttribute("type") };
    }));
  })()`);
  expect(result[1]).toEqual(result[0]);
  expect(result[1][0].log).toEqual(["create:label", "create:input", ["type", "", null], ["attribute:type", "quantity", "number"], ["attribute:min", "quantity", "number"]]);
  expect(result[1][0].type).toBe("text");
  expect(result[1][1].log).toEqual(["create:label", "create:input", ["type", "", null]]);
  expect(result[1][1].sameError).toBe(true);
  expect(result[1][1].name).toBe("");
});

test("real descriptor path exposes native iterator failures after select setup", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/lists.html");
  const result = await page.evaluate(`(() => {
    const factories = [
      () => { ${Object.values(baseline.functions).join("\n")} return { itemFormField, createItemFieldFromDescriptor }; },
      () => { ${functions} return { itemFormField, createItemFieldFromDescriptor }; }
    ];
    const prior = window.LongtailForge.workspaceContext, original = document.createElement;
    try {
      return factories.map(make => ["valid", "null-control", "number-control", "object-control", "symbol-control", "iterator-number", "next-number", "step-number", "next-throws", "done-throws", "value-throws", "iterator-throws"].map(kind => {
        const api = make(), log = [], sentinel = { marker: kind }; let select, error, html, sameError = false;
        document.createElement = function(name, ...rest) {
          const node = Reflect.apply(original, this, [name, ...rest]); log.push("create:" + name);
          if (name === "select") select = node;
          return node;
        };
        const iterator = {
          get next() {
            log.push("get-next"); if (kind === "next-number") return 7;
            let count = 0;
            return function() {
              log.push(["next", this === iterator, arguments.length]);
              if (kind === "next-throws") throw sentinel;
              if (kind === "step-number") return 7;
              return {
                get done() { log.push("done"); if (kind === "done-throws") throw sentinel; return count++ > 0; },
                get value() { log.push("value"); if (kind === "value-throws") throw sentinel; if (kind === "null-control") return null; if (kind === "number-control") return 7; if (kind === "symbol-control") return Symbol("control"); if (kind === "object-control") return {toString(){log.push("convert-control");return "Control text";}}; return "Text"; }
              };
            };
          },
          get return() { log.push("get-return"); return function() { log.push("return"); return {}; }; }
        };
        const iterable = {
          get [Symbol.iterator]() {
            log.push(["get-iterator", select && select.name]);
            if (kind === "iterator-throws") throw sentinel;
            return function() { log.push(["iterator", this === iterable, arguments.length]); return kind === "iterator-number" ? 7 : iterator; };
          }
        };
        const options = { get map() { log.push("get-map-1"); return function() {
          log.push(["map-1", this === options, arguments.length]);
          const mapped = { get map() { log.push("get-map-2"); return function() {
            log.push(["map-2", this === mapped, arguments.length]); return iterable;
          }; } }; return mapped;
        }; } };
        const field = {field:"purchase_status", type:"select", label:"Status", options};
        window.LongtailForge.workspaceContext = {viewSurfaces:[{id:"lists.workspace",moduleId:"lists",detail:{itemForm:{fields:[field]}}}]};
        try { html = api.createItemFieldFromDescriptor(api.itemFormField("purchase_status")).outerHTML; }
        catch (caught) { sameError = caught === sentinel; error = sameError ? "sentinel" : { name:caught.name, message:caught.message }; }
        finally { document.createElement = original; }
        return { kind, log, html, error, sameError, selectHtml:select && select.outerHTML };
      }));
    } finally { window.LongtailForge.workspaceContext = prior; document.createElement = original; }
  })()`);
  const messages = new Map([
    ["iterator-number", "The list item option controls iterator method did not return an object."],
    ["next-number", "The list item option controls iterator has no callable next."],
    ["step-number", "The list item option controls iterator next method did not return an object."],
    ["symbol-control", "Cannot convert a Symbol value to a string"],
  ]);
  expect(result[1]).toEqual(result[0].map(/** @param {{kind:string, [key:string]:unknown}} entry */ entry => messages.has(entry.kind) ? {...entry,error:{name:"TypeError",message:messages.get(entry.kind)}} : entry));
  for (const entry of result[1]) {
    expect(entry.log).toContainEqual(["get-iterator", "purchase_status"]);
    expect(entry.log).not.toContain("get-return");
    if (entry.kind.endsWith("throws")) expect(entry.sameError).toBe(true);
    if (entry.error) expect(entry.selectHtml).toBe('<select name="purchase_status"></select>');
  }
  console.log(JSON.stringify({ iteratorBoundaries: result[0], after:result[1] }));
});


test("field construction failure rejects initialization rather than reaching saveItem status", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.addInitScript('window.__listsConstructionErrors = []; window.addEventListener("unhandledrejection", event => window.__listsConstructionErrors.push({name:event.reason.name,message:event.reason.message}));');
  for (const variant of [baselinePage, source]) {
    const injected = variant.replace("  function createItemFieldFromDescriptor(field) {", '  function createItemFieldFromDescriptor(field) {\n    if (field.field === "purchase_status") field = {...field, type:"select", options:{map:7}};');
    expect(injected).not.toBe(variant);
    let served = 0;
    await page.route(listsAsset, route => { served += 1; return route.fulfill({status:200,contentType:"application/javascript",body:injected}); });
    await page.goto("/lists.html");
    await expect.poll(() => page.evaluate("window.__listsConstructionErrors")).toContainEqual({name:"TypeError",message:variant === baselinePage ? "(field.options || []).map is not a function" : "The list item options collection has no callable map."});
    expect(served).toBe(1);
    await expect(page.locator("[data-list-item-dialog]")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("(field.options || []).map is not a function");
    await expect(page.locator("body")).not.toContainText("The list item options collection has no callable map.");
    await expect(page.locator("body")).toContainText("A required service is temporarily unavailable. Wait a moment, then try again.");
    console.log(JSON.stringify({constructionRejections:await page.evaluate("window.__listsConstructionErrors")}));
    await page.unroute(listsAsset);
  }
});


test("custom second maps preserve pair destructuring and iterator close failures", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/lists.html");
  const result = await page.evaluate(`(() => {
    const factories = [
      () => { ${Object.values(baseline.functions).join("\n")} return { itemFormField, createItemFieldFromDescriptor }; },
      () => { ${functions} return { itemFormField, createItemFieldFromDescriptor }; }
    ];
    const prior = window.LongtailForge.workspaceContext;
    try {
      return factories.map(make => ["valid", "pair-number", "pair-null", "return-number", "return-result-number", "return-getter-throws", "return-call-throws"].map(kind => {
        const api = make(), log = [], sentinel = {kind}; let error, html, sameError = false, index = 0;
        const iterator = {
          get next() { log.push("get-next"); return function() {
            log.push(["next",this===iterator,arguments.length]);
            return { get done(){log.push("done");return false;}, get value(){log.push("value");return index++ === 0 ? "v" : "Label";} };
          }; },
          get return() {
            log.push("get-return");
            if (kind === "return-getter-throws") throw sentinel;
            if (kind === "return-number") return 7;
            return function() {log.push(["return",this===iterator,arguments.length]);if(kind==="return-call-throws")throw sentinel;return kind==="return-result-number"?7:{};};
          }
        };
        const pair = { get [Symbol.iterator]() {log.push("get-iterator");return function(){log.push(["iterator",this===pair,arguments.length]);return iterator;};} };
        const field = {field:"purchase_status",type:"select",label:"Status",options:{map(){return {map(callback){return [callback(kind==="pair-number"?7:kind==="pair-null"?null:pair)];}};}}};
        window.LongtailForge.workspaceContext = {viewSurfaces:[{id:"lists.workspace",moduleId:"lists",detail:{itemForm:{fields:[field]}}}]};
        try {html=api.createItemFieldFromDescriptor(api.itemFormField("purchase_status")).outerHTML;}
        catch(caught){sameError=caught===sentinel;error=sameError?"sentinel":{name:caught.name,message:caught.message};}
        return {kind,log,error,html,sameError};
      }));
    } finally {window.LongtailForge.workspaceContext=prior;}
  })()`);
  const messages = new Map([
    ["pair-number", "The list item option pair is not iterable."],
    ["pair-null", "The list item option pair is not iterable."],
    ["return-number", "The list item option pair iterator has no callable return."],
    ["return-result-number", "The list item option pair iterator return method did not return an object."],
  ]);
  expect(result[1]).toEqual(result[0].map(/** @param {{kind:string, [key:string]:unknown}} entry */ entry=>messages.has(entry.kind)?{...entry,error:{name:"TypeError",message:messages.get(entry.kind)}}:entry));
  expect(result[1][0].log).toEqual(["get-iterator",["iterator",true,0],"get-next",["next",true,0],"done","value",["next",true,0],"done","value","get-return",["return",true,0]]);
  expect(result[1][0].html).toContain('<option value="v">Label</option>');
  for (const entry of result[1]) if (entry.kind.endsWith("throws")) expect(entry.sameError).toBe(true);
  console.log(JSON.stringify({pairBoundaries:result[0],after:result[1]}));
});


test("approved protocol catalogue preserves each real pair and controls failure position", async ({ isolatedWorkspace }, testInfo) => {
  const { page } = isolatedWorkspace;
  await page.goto("/lists.html");
  /** @type {{version:string, rows:{site:string,kind:string,before:{log:unknown[],error?:{name:string,message:string},sameError:boolean,html?:string},after:{log:unknown[],error?:{name:string,message:string},sameError:boolean,html?:string}}[]}} */
  const table = await page.evaluate(`(() => {
    const factories = [
      () => { ${Object.values(baseline.functions).join("\n")} return { itemFormField, createItemFieldFromDescriptor }; },
      () => { ${functions} return { itemFormField, createItemFieldFromDescriptor }; }
    ];
    const prior = window.LongtailForge.workspaceContext;
    const kinds = ["valid","function-objects","short-zero","short-one","done-truthy","method-missing","method-null","method-number","method-getter-throws","method-throws","iterator-number","next-number","next-getter-throws","next-throws","step-number","done-throws","value-throws","return-null","return-undefined","return-number","return-result-number","return-getter-throws","return-throws","option-throws"];
    function run(make,site,kind) {
      const api=make(), log=[], sentinel={kind};let count=0,error,html,sameError=false;
      const iterator=kind==="function-objects"?function(){}:{};
      Object.defineProperty(iterator,"next",{get(){
        log.push("get-next"); if(kind==="next-getter-throws")throw sentinel;if(kind==="next-number")return 7;
        const next=function(){log.push(["next",this===iterator,arguments.length]);if(kind==="next-throws")throw sentinel;if(kind==="step-number")return 7;
          const index=count++,step=kind==="function-objects"?function(){}:{};
          Object.defineProperties(step,{
            done:{get(){log.push(["done",index]);if(kind==="done-throws")throw sentinel;if(kind==="done-truthy")return "yes";return index>=(kind==="short-zero"?0:kind==="short-one"?1:2);}},
            value:{get(){log.push(["value",index]);if(kind==="value-throws")throw sentinel;return kind==="option-throws"?{toString(){log.push("convert");throw sentinel;}}:index===0?"v":"Label";}}
          });return step;
        };Object.defineProperties(next,{call:{get(){throw new Error("own call read");}},apply:{get(){throw new Error("own apply read");}}});return next;
      }});
      Object.defineProperty(iterator,"return",{get(){log.push("get-return");if(kind==="return-getter-throws")throw sentinel;if(kind==="return-null")return null;if(kind==="return-undefined")return undefined;if(kind==="return-number")return 7;
        return function(){log.push(["return",this===iterator,arguments.length]);if(kind==="return-throws")throw sentinel;return kind==="return-result-number"?7:{};};
      }});
      const input={};Object.defineProperty(input,Symbol.iterator,{get(){log.push("get-iterator");if(kind==="method-getter-throws")throw sentinel;if(kind==="method-missing")return undefined;if(kind==="method-null")return null;if(kind==="method-number")return 7;
        return function(){log.push(["iterator",this===input,arguments.length]);if(kind==="method-throws")throw sentinel;return kind==="iterator-number"?7:iterator;};
      }});
      const field={field:"purchase_status",type:"select",label:"Status",options:{map(){return {map(render){return site==="pair"?[render(input)]:input;}};}}};
      window.LongtailForge.workspaceContext={viewSurfaces:[{id:"lists.workspace",moduleId:"lists",detail:{itemForm:{fields:[field]}}}]};
      try{html=api.createItemFieldFromDescriptor(api.itemFormField("purchase_status")).outerHTML;}catch(caught){sameError=caught===sentinel;error=sameError?undefined:{name:caught.name,message:caught.message};}
      return {log,error,html,sameError};
    }
    try{return {version:navigator.userAgent,rows:["pair","controls"].flatMap(site=>kinds.map(kind=>({site,kind,before:run(factories[0],site,kind),after:run(factories[1],site,kind)})))};}
    finally{window.LongtailForge.workspaceContext=prior;}
  })()`);
  for (const row of table.rows) {
    const prefix = "The list item option " + row.site;
    let message;
    if (["method-missing","method-null","method-number"].includes(row.kind)) message = prefix + (row.site === "pair" ? " is" : " are") + " not iterable.";
    if (row.kind === "iterator-number") message = prefix + " iterator method did not return an object.";
    if (row.kind === "next-number") message = prefix + " iterator has no callable next.";
    if (row.kind === "step-number") message = prefix + " iterator next method did not return an object.";
    if (row.site === "pair" && row.kind === "return-number") message = prefix + " iterator has no callable return.";
    if (row.site === "pair" && row.kind === "return-result-number") message = prefix + " iterator return method did not return an object.";
    expect(row.after, row.site + "/" + row.kind).toEqual(message ? {...row.before,error:{name:"TypeError",message}} : row.before);
    if (row.site === "controls" || ["short-zero","short-one","done-truthy","next-throws","done-throws","value-throws"].includes(row.kind)) expect(row.after.log).not.toContain("get-return");
    if (row.kind === "option-throws") expect(row.after.sameError).toBe(true);
  }
  await retainTable(testInfo,"protocol-table",table);
  console.log(JSON.stringify({protocolTable:table}));
});

test("controls finish collection before conversion and retain the native append lookup", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/lists.html");
  const results = await page.evaluate(`(() => {
    const factories = [
      () => { ${Object.values(baseline.functions).join("\n")} return { itemFormField, createItemFieldFromDescriptor }; },
      () => { ${functions} return { itemFormField, createItemFieldFromDescriptor }; }
    ];
    const prior=window.LongtailForge.workspaceContext,create=document.createElement;
    function run(make,kind){
      const api=make(),log=[],sentinel={kind};let select,error,sameError=false,index=0;
      document.createElement=function(...args){const node=Reflect.apply(create,this,args);if(args[0]==="select"){select=node;const append=node.append;Object.defineProperty(node,"append",{configurable:true,get(){log.push("get-append");return append;}});}return node;};
      const child={toString(){log.push("convert");if(kind==="conversion-failure")throw sentinel;return "text";}};
      const controls={ [Symbol.iterator](){return {next(){log.push(["next",index]);if(index++===0)return {done:false,value:kind==="dom-failure"?select:child};if(kind==="later-step-failure")throw sentinel;return {done:true};},get return(){throw new Error("unexpected cleanup");}};}};
      const field={field:"purchase_status",type:"select",label:"Status",options:{map(){return {map(){return controls;}};}}};
      window.LongtailForge.workspaceContext={viewSurfaces:[{id:"lists.workspace",moduleId:"lists",detail:{itemForm:{fields:[field]}}}]};
      try{api.createItemFieldFromDescriptor(api.itemFormField("purchase_status"));}catch(caught){sameError=caught===sentinel;error=sameError?"sentinel":caught.message;}finally{document.createElement=create;}
      return {log,error,sameError,html:select.outerHTML};
    }
    try{return ["success","later-step-failure","conversion-failure","dom-failure"].map(kind=>({kind,before:run(factories[0],kind),after:run(factories[1],kind)}));}finally{window.LongtailForge.workspaceContext=prior;document.createElement=create;}
  })()`);
  for (const row of results) expect(row.after).toEqual(row.before);
  expect(results[0].after.log).toEqual(["get-append",["next",0],["next",1],"convert"]);
  expect(results[1].after.log).toEqual(["get-append",["next",0],["next",1]]);
  expect(results[2].after.log).toEqual(["get-append",["next",0],["next",1],"convert"]);
  expect(results[1].after.sameError).toBe(true);
  expect(results[2].after.sameError).toBe(true);
});


test("custom maps keep entry reads, pair identity, sparse slots and callback behavior", async ({ isolatedWorkspace }) => {
  const { page }=isolatedWorkspace;await page.goto("/lists.html");
  const results=await page.evaluate(`(() => {
    const factories=[()=>{${Object.values(baseline.functions).join("\n")}return {optionsFromDescriptor,itemFormField,createItemFieldFromDescriptor};},()=>{${functions}return {optionsFromDescriptor,itemFormField,createItemFieldFromDescriptor};}];
    const prior=window.LongtailForge.workspaceContext;
    function run(make,kind){const api=make(),log=[],sentinel={kind};let error,sameError=false,html;
      const pair=["id","Label"];let reads=0;const entry={get value(){log.push(["value",this===entry]);if(kind==="entry-throws")throw sentinel;return reads++===0?undefined:"fallback";},get id(){log.push(["id",this===entry]);return "id";},get label(){log.push(["label",this===entry]);return undefined;},get text(){log.push(["text",this===entry]);return undefined;}};
      const collection={get map(){log.push("get-map-1");return function(callback){log.push(["map-1",this===collection,arguments.length,callback.length]);const a=callback(pair,4,collection);log.push(["pair-identity",a===pair]);const b=callback(entry,5,collection);const mapped={get map(){log.push("get-map-2");return function(render){log.push(["map-2",this===mapped,arguments.length,render.length]);return new Set([render(a,0,mapped),render(b,1,mapped)]);};}};return mapped;};}};
      const options=kind==="sparse"?[,pair,,{id:"b",label:"B"}]:kind==="primitives"?[7,false,"str",Symbol("entry")]:collection;
      const field={field:"purchase_status",type:"select",label:"Status",options};window.LongtailForge.workspaceContext={viewSurfaces:[{id:"lists.workspace",moduleId:"lists",detail:{itemForm:{fields:[field]}}}]};
      try{html=api.createItemFieldFromDescriptor(api.itemFormField("purchase_status")).outerHTML;}catch(caught){sameError=caught===sentinel;error=sameError?"sentinel":caught.message;}
      return {html,log,error,sameError};
    }
    try{return ["custom","entry-throws","sparse","primitives"].map(kind=>({kind,before:run(factories[0],kind),after:run(factories[1],kind)}));}finally{window.LongtailForge.workspaceContext=prior;}
  })()`);
  for(const row of results)expect(row.after).toEqual(row.before);
  expect(results[0].after.log).toEqual(["get-map-1",["map-1",true,1,1],["pair-identity",true],["value",true],["id",true],["label",true],["text",true],["value",true],"get-map-2",["map-2",true,1,1]]);
  expect(results[1].after.sameError).toBe(true);
  expect(results[2].after.html).toContain("undefined");
});
