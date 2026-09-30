import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, it } from "vitest";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = readFileSync("public/js/lists.js", "utf8");
const baseline = JSON.parse(readFileSync("tests/fixtures/lists-editor-inputs/baseline.json", "utf8"));
const helpers = ["listEditorField", "callListEditorMember", "listEditorLinkTypeLabel", "listEditorValues", "listEditorIndex", "isListEditorClosedStatus", "listEditorContextItems"];
/** @param {boolean} before @param {string[]} names @param {string} setup */
function fixture(before, names, setup = "") {
  const sandbox = vm.createContext({});
  vm.runInContext(setup, sandbox);
  for (const name of before ? names : [...helpers, ...names]) {
    vm.runInContext(before ? baseline.functions[name] : extractFunctionBlock(source, name), sandbox);
  }
  return sandbox;
}
/** @param {unknown} value */
const plain = value => JSON.parse(JSON.stringify(value));

describe("Lists opaque editor input reconciliation", () => {
  it("pins the committed browser baseline to its full-history source", () => {
    assert.equal(baseline.base, "18e19e3e5f817b904a7c95f9202f335f9ff1f4e3");
    const original = execFileSync("git", ["show", `${baseline.base}:public/js/lists.js`], { encoding: "utf8" });
    for (const [name, body] of Object.entries(baseline.functions)) assert.equal(body, extractFunctionBlock(original, name), name);
  });

  it("preserves opening identity, precedence, getter order and truthy-empty fetches", async () => {
    for (const kind of ["host", "array-id", "object-id", "empty", "null", "getter-throws"]) {
      const results = [];
      for (const before of [true, false]) {
        const sandbox = fixture(before, ["openListEditor", "normalizeListEditorMode", "normalizeListEditorDefaults", "readListEditorId"], `
          const log=[], sentinel={}, record={list_id:7}, focus={}, hostResult={};
          const id=${kind === "array-id" ? '[]' : '{toString(){log.push("convert");return "";}}'};
          async function prepareListDialogData(){log.push("prepare");}
          async function loadListDetail(value){log.push(["load",value===id]);return record;}
          function openListDialog(value,options){log.push(["dialog",value===record,options.trigger===focus]);return "dialog-result";}
          const input=${kind === "null" ? 'null' : `new Proxy({mode:"edit",${kind === "host" ? 'list:record,' : ''}listId:${kind === "empty" ? '""' : 'id'},returnFocusTo:focus},{get(target,key,receiver){log.push(key);${kind === "getter-throws" ? 'if(key==="record")throw sentinel;' : ''}return Reflect.get(target,key,receiver);}})`};
        `);
        results.push(await vm.runInContext(`(async()=>{try{const result=await openListEditor(input,{result:hostResult});return {log,host:result===hostResult};}catch(error){return {log,name:error.name,sentinel:error===sentinel};}})()`, sandbox));
      }
      assert.deepEqual(plain(results[1]), plain(results[0]), kind);
    }
  });

  it("preserves native URI conversion after the fetch truthiness gate and API acquisition", async () => {
    for (const value of ['7', '[]', '{toString(){log.push("convert");return "a/b";}}', 'Symbol("id")', '{toString(){throw sentinel;}}']) {
      const results=[];
      for (const before of [true,false]) {
        const sandbox=fixture(before,["loadListDetail"], `
          const log=[],sentinel={},id=${value};
          function requireApi(){log.push("api");return {getJson:async(route)=>{log.push(route);return {}}};}
          function readListDetail(){return null;}
        `);
        results.push(await vm.runInContext('(async()=>({value:await loadListDetail(id),log}))()',sandbox));
      }
      assert.deepEqual(plain(results[1]),plain(results[0]));
    }
  });

  it("keeps custom collection map receivers, callback reads and result identity", () => {
    const results=[];
    for(const before of [true,false]) {
      const sandbox=fixture(before,["linkedContextItems","unavailableLinkedRecordLabel","formatToken"],`
        const log=[],result={},LIST_LINK_TYPE_LABELS={task:"Task"};
        const target=new Proxy({label:"Title",id:7},{get(o,k,r){log.push("target:"+String(k));return Reflect.get(o,k,r);}});
        const link=new Proxy({target,target_type:"task"},{get(o,k,r){log.push("link:"+String(k));return Reflect.get(o,k,r);}});
        let row;
        const collection={get map(){log.push("map-get");return function(callback){log.push(["receiver",this===collection]);row=callback(link);return result;};}};
      `);
      results.push(vm.runInContext(`({same:${before ? 'linkedContextItems' : 'listEditorContextItems'}({links:collection})===result,log,row})`,sandbox));
    }
    assert.deepEqual(plain(results[1]),plain(results[0]));
    assert.equal(results[1].same,true);
  });

  it("keeps spread protocol order, target identity and iterator failures", () => {
    for (const fault of ["none","method","iterator","next","step","done","value"]) {
      const results=[];
      for(const before of [true,false]) {
        const sandbox=fixture(before,["listEditorHasLinkTarget","sameListLinkTarget"],`
          const log=[],sentinel={},entry={targetType:"task",targetId:7};let count=0;
          const iterator={get next(){log.push("next-get");return ${fault === "next" ? '7' : `function(){log.push(["next",this===iterator]);if(count++)return {done:true};${fault === "step" ? 'return 7;' : `return {get done(){log.push("done");${fault === "done" ? 'throw sentinel;' : 'return false;'}},get value(){log.push("value");${fault === "value" ? 'throw sentinel;' : 'return entry;'}}};`}}`};}};
          const collection={get [Symbol.iterator](){log.push("iterator-get");return ${fault === "method" ? '7' : `function(){log.push(["iterator",this===collection]);return ${fault === "iterator" ? '7' : 'iterator'};}`};}};
          const state={editorList:{links:collection},editorStagedTargets:[]};
        `);
        results.push(vm.runInContext(`(()=>{try{return {result:listEditorHasLinkTarget(entry),log};}catch(e){return {name:e.name,sentinel:e===sentinel,log};}})()`,sandbox));
      }
      assert.deepEqual(plain(results[1]),plain(results[0]),fault);
    }
  });

  it("preserves property-key conversion including Symbol results and inherited labels", () => {
    for(const expr of ['"task"','"constructor"','Symbol("key")','{[Symbol.toPrimitive](hint){log.push(hint);return key;}}','{[Symbol.toPrimitive](){throw sentinel;}}']) {
      const results=[];
      for(const before of [true,false]) {
        const sandbox=fixture(before,[],`const log=[],key=Symbol("key"),sentinel={},LIST_LINK_TYPE_LABELS={task:"Task",[key]:"symbol"};const input=${expr};`);
        results.push(vm.runInContext(`(()=>{try{const value=${before ? 'LIST_LINK_TYPE_LABELS[input]' : 'listEditorLinkTypeLabel(input)'};return {log,value:typeof value==="function"?"function":value};}catch(e){return {log,same:e===sentinel};}})()`,sandbox));
      }
      assert.deepEqual(plain(results[1]),plain(results[0]),expr);
    }
  });

  it("retains both status getter reads and pins delegated wording only at reached failures", () => {
    for(const before of [true,false]) {
      const sandbox=fixture(before,["canManageListLinks"], 'const state={editorList:null};let reads=0;const list={get status(){return ++reads===1?"active":7;}};');
      assert.equal(vm.runInContext('canManageListLinks(list)',sandbox),true);
      assert.equal(vm.runInContext('reads',sandbox),2);
    }
    const sandbox=fixture(false,[]);
    assert.throws(()=>vm.runInContext('listEditorField(null,"listId")',sandbox),{name:"TypeError",message:"The list editor value cannot be read."});
    assert.throws(()=>vm.runInContext('callListEditorMember({},"map",[])',sandbox),{name:"TypeError",message:"The list editor value has no callable map."});
    for(const [expr,message] of [
      ['listEditorValues({})',"The list editor collection is not iterable."],
      ['listEditorValues({[Symbol.iterator](){return 7;}})',"The list editor iterator did not return an object."],
      ['listEditorValues({[Symbol.iterator](){return {next:7};}})',"The list editor iterator has no callable next."],
      ['listEditorValues({[Symbol.iterator](){return {next(){return 7;}};}})',"The list editor iterator next did not return an object."],
    ]) assert.throws(()=>vm.runInContext(expr,sandbox),{name:"TypeError",message});
  });
  it("preserves both linked projection maps, optional sinks and original link identity", () => {
    for (const sink of [true, false]) {
      const results=[];
      for(const before of [true,false]) {
        const sandbox=fixture(before,["renderListEditorLinkedItems","linkedContextItems","unavailableLinkedRecordLabel","formatToken","canManageListLinks"], `
          const log=[],LIST_LINK_TYPE_LABELS={task:"Task"},link={target_type:"task",target:{label:"Kept",id:7}};
          const state={editorList:{links:[link]},editorStagedTargets:[]};
          let supplied;
          const parts=${sink ? '{setLinkedItems(items){log.push(this===parts);supplied=items;}}' : '{}'};
          function listEditorPickerParts(){return parts;}
        `);
        results.push(vm.runInContext('renderListEditorLinkedItems();({log,row:supplied?.[0],identity:supplied?.[0].link===link})',sandbox));
      }
      assert.deepEqual(plain(results[1]),plain(results[0]));
      assert.equal(results[1].identity,sink);
    }
  });

});
