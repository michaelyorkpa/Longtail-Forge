import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import vm from "node:vm";
import { describe, it } from "vitest";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source=fs.readFileSync("public/js/lists.js","utf8");
const baseline=JSON.parse(fs.readFileSync("tests/fixtures/lists-zero/baseline.json","utf8"));
const helpers=["isListsDatasetBag","setListsSurfaceHook","isListSortObject","listSortNumeric","compareListSortOrders"];
/** @param {boolean} before @param {string} setup */
function fixture(before,setup="") {
  const c=vm.createContext({});
  for(const value of Object.values(baseline.declarations))vm.runInContext(String(value),c);
  for(const name of before?Object.keys(baseline.functions):[...Object.keys(baseline.functions),...helpers]) vm.runInContext(before?baseline.functions[name]:extractFunctionBlock(source,name),c);
  vm.runInContext(setup,c);return c;
}
/** @param {unknown} value */
const plain=value=>JSON.parse(JSON.stringify(value));

describe("Lists last two inputs",()=>{
 it("pins the committed baseline to its exact historical source",()=>{
  assert.equal(baseline.base,"f29b3aa0b2447cd818cc4da49f5fb7ad8cc39c54");
  const old=execFileSync("git",["show",`${baseline.base}:public/js/lists.js`],{encoding:"utf8"});
  for(const [name,body] of Object.entries(baseline.functions))assert.equal(body,extractFunctionBlock(old,name));
  for(const declaration of Object.values(baseline.declarations))assert.ok(old.includes(String(declaration)));
 });
 it("limits the existing bodies to seven hook writes and the comparator",()=>{
  let surface = baseline.functions.decorateListsDeclarativeSurface;
  for (const [element,key] of [["pageHeading","listsTitle"],["createAction","listCreate"],["filterPanel","listsFiltersPanel"],["filterForm","listsFilters"],["indexPanel","listsIndexPanel"],["summaryTitle","listsCount"],["detail","listDetail"]]) {
    surface = surface.replace(element + ".dataset." + key + ' = "";', 'setListsSurfaceHook(' + element + ', "' + key + '");');
  }
  assert.equal(extractFunctionBlock(source,"decorateListsDeclarativeSurface"),surface);
  assert.equal(extractFunctionBlock(source,"normalizeListProgress"),baseline.functions.normalizeListProgress.replace('(left.sort_order ?? 0) - (right.sort_order ?? 0)','compareListSortOrders(left.sort_order ?? 0, right.sort_order ?? 0)'));
 });
 it("keeps reader acceptance, progress counts, labels and native numeric failures",()=>{
  const expressions=['[9,2]','["9","2"]','["bad","2"]','[null,undefined]','[false,true]','[NaN,Infinity]','[-0,-Infinity]','[9n,2n]','[9n,2]','[Object(9n),2]','[Symbol("s"),2]','[[9],[2]]','[{},2]','[new Date(9),new Date(2)]','[{valueOf(){return 9n;}},2]'];
  for(const expression of expressions){const results=[];
   for(const before of [true,false]){const c=fixture(before,`const values=${expression};const items=values.map((sort_order,index)=>({...Object.fromEntries(ITEM_TEXT_COLUMNS.map(k=>[k,"x"])),...Object.fromEntries(ITEM_NULLABLE_COLUMNS.map(k=>[k,null])),list_item_id:String(index),item_name:"row-"+index,sort_order}));`);
    results.push(vm.runInContext(`(()=>{const d=readListDetail({items});try{const out=normalizeListRecord(d.list,d.items,d.links);return {progress:out.progress,accepted:d.items.length,identity:d.items[0]===items[0]};}catch(e){return {error:e.name,accepted:d.items.length,identity:d.items[0]===items[0]};}})()`,c));}
   assert.deepEqual(plain(results[1]),plain(results[0]),expression);
  }
 });
 it("preserves operand reads before conversions, hook receivers and thrown identity",()=>{
  for(const kind of ['ordinary','exotic','noncallable','object-result','right-getter','left-hook','right-hook','bigint-right-hook']){
   const results=[];
   for(const before of [true,false]){
    const c=fixture(before,`const log=[],sentinel={};
      const leftValue={get [Symbol.toPrimitive](){log.push("left:exotic");return ${kind==='noncallable'?'7':kind==='exotic'||kind==='object-result'?`function(hint){log.push([hint,this===leftValue]);return ${kind==='object-result'?'{}':'9'};}`:'undefined'};},get valueOf(){log.push("left:valueOf");return function(){log.push(["left:call",this===leftValue]);${kind==='left-hook'?'throw sentinel;':kind==='bigint-right-hook'?'return 9n;':'return {};'}};},toString(){log.push("left:toString");return "9";}};
      const rightValue={valueOf(){log.push(["right:call",this===rightValue]);${kind==='right-hook'||kind==='bigint-right-hook'?'throw sentinel;':'return 2;'}}};
      const left={get sort_order(){log.push("left:read");return leftValue;}},right={get sort_order(){log.push("right:read");${kind==='right-getter'?'throw sentinel;':'return rightValue;'}}};`);
    results.push(vm.runInContext(`(()=>{try{const result=${before?'(left.sort_order??0)-(right.sort_order??0)':'compareListSortOrders(left.sort_order??0,right.sort_order??0)'};return {result,log};}catch(e){return {error:e.name,same:e===sentinel,log};}})()`,c));
   }assert.deepEqual(plain(results[1]),plain(results[0]),kind);
  }
 });
 it("keeps deleted filtering, carried counts and earliest dates unchanged",()=>{
  const results=[];for(const before of [true,false]){
   const c=fixture(before);results.push(vm.runInContext(`normalizeListProgress({totalItemCount:"7",checkedItemCount:0},[{sort_order:2,item_name:"later",needed_by_date:"2026-12-01"},{sort_order:1,item_name:"earlier",needed_by_date:"2026-11-01",checked_at:"yes"},{sort_order:0,item_name:"deleted",deleted_at:"yes"}])`,c));
  }assert.deepEqual(plain(results[1]),plain(results[0]));assert.equal(results[1].totalItemCount,7);assert.equal(results[1].nextUncheckedItemLabel,"later");
 });
 it("pins delegated failure wording while still refusing the same cases",()=>{
  const c=fixture(false);
  for(const [expression,message] of [
   ['compareListSortOrders(1n,2)',"Lists cannot mix BigInt and number sort orders."],
   ['compareListSortOrders({[Symbol.toPrimitive](){return {}}},2)',"The list sort order cannot be converted to a primitive."],
   ['setListsSurfaceHook({dataset:null},"hook")',"The Lists surface element has no dataset to decorate."],
  ])assert.throws(()=>vm.runInContext(expression,c),{name:"TypeError",message});
  assert.throws(()=>vm.runInContext("compareListSortOrders(1n,2n)",c),{name:"TypeError",message:"The list item sort order difference is not a number."});
  assert.throws(()=>vm.runInContext("compareListSortOrders({[Symbol.toPrimitive]:7},2)",c),{name:"TypeError"});
 });
 it("keeps dataset setters, primitive receivers and failures at the write",()=>{
  for(const kind of ['object','array','function','number','string','boolean','symbol','null','undefined','getter-throws','setter-throws','frozen']){
   const results=[];for(const before of [true,false]){
    const expression=({object:'{}',array:'[]',function:'function(){}',number:'7',string:'"x"',boolean:'false',symbol:'Symbol("s")',null:'null',undefined:'undefined',frozen:'Object.freeze({})'})[kind]||'{}';
    const c=fixture(before,`const log=[],sentinel={},dataset=${expression};const element={get dataset(){log.push("read");${kind==='getter-throws'?'throw sentinel;':'return dataset;'}}};Object.defineProperty(Object.prototype,"hook",{configurable:true,set:function(value){"use strict";log.push(["set",this===dataset,value]);${kind==='setter-throws'?'throw sentinel;':''}}});`);
    results.push(vm.runInContext(`(()=>{try{${before?'element.dataset.hook="";':'setListsSurfaceHook(element,"hook");'}return {log};}catch(e){return {log,error:e.name,same:e===sentinel};}})()`,c));
   }assert.deepEqual(plain(results[1]),plain(results[0]),kind);
  }
 });
});
