import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { describe, it } from "vitest";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = fs.readFileSync(new URL("../../public/js/lists.js", import.meta.url), "utf8");
class TestNode {}
/** @param {Record<string, unknown>} [extra] */
function fixture(extra = {}) {
  const sandbox = vm.createContext({Node:TestNode,...extra});
  for (const name of ["optionsFromDescriptor","listItemOptionEntryField","readListItemOptionValues","listItemOptionChildren","selectField"]) vm.runInContext(extractFunctionBlock(source,name),sandbox);
  return vm.runInContext("({optionsFromDescriptor,readListItemOptionValues,listItemOptionChildren,selectField})",sandbox);
}

describe("Lists local option protocols", () => {
  it("keeps the first custom map receiver and pair identity", () => {
    const pair=["a","A"];
    const collection={
      /** @param {(entry: unknown) => unknown} callback */
      map(callback){assert.equal(this,collection);return callback(pair);}};
    assert.equal(fixture().optionsFromDescriptor({options:collection}),pair);
  });
  it("closes pair binding after two values without a third next", () => {
    /** @type {string[]} */
    const log=[];
    const iterator={next(){log.push("next");return {done:false,value:"v"};},return(){assert.equal(this,iterator);log.push("return");return {};}};
    const values=fixture().readListItemOptionValues({[Symbol.iterator](){return iterator;}},true);
    assert.deepEqual([...values],["v","v"]);
    assert.deepEqual(log,["next","next","return"]);
  });
  it("does not close a failing step or coerce values before collection completes", () => {
    /** @type {string[]} */
    const log=[]; const sentinel={};let index=0;
    const input={ [Symbol.iterator](){return {next(){if(index++===0)return {done:false,value:{toString(){log.push("convert");return "text";}}};throw sentinel;},get return(){log.push("return");return undefined;}};}};
    assert.throws(()=>fixture().listItemOptionChildren(input),error=>error===sentinel);
    assert.deepEqual(log,[]);
  });
  it("reads append before collection and conversion, preserving child order", () => {
    /** @type {string[]} */
    const log=[];
    const select={name:"",get append(){log.push("append lookup");return /** @param {...unknown} values */ (...values)=>{assert.deepEqual(values,["a","b"]);log.push("append");};}};
    const label={append(){log.push("label append");}};
    const api=fixture({document:{
      /** @param {string} name */
      createElement(name){return name==="select"?select:label;}}});
    const options={*[Symbol.iterator](){log.push("iterate");yield {toString(){log.push("convert a");return "a";}};yield "b";log.push("done");}};
    api.selectField("Label","field",options);
    assert.deepEqual(log,["append lookup","iterate","done","convert a","append","label append"]);
  });
  it("pins missing-entry and map refusal wording separately", () => {
    const api=fixture();
    assert.throws(()=>api.optionsFromDescriptor({options:{map:7}}),{name:"TypeError",message:"The list item options collection has no callable map."});
    assert.throws(()=>api.optionsFromDescriptor({options:[null]}),{name:"TypeError",message:"A list item option entry cannot be read."});
    assert.deepEqual([...api.optionsFromDescriptor({options:[7]})[0]],["",""]);
  });
});
