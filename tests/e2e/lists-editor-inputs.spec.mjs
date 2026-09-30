import fs from "node:fs";
import { expect } from "@playwright/test";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
import { test } from "./support/isolated-workspace.mjs";

const source = fs.readFileSync(new URL("../../public/js/lists.js", import.meta.url), "utf8");
const baseline = JSON.parse(fs.readFileSync(new URL("../fixtures/lists-editor-inputs/baseline.json", import.meta.url), "utf8"));
const checkedSource = fs.readFileSync(new URL("../../public/js/shared/checked-dom.js", import.meta.url), "utf8");
const helpers = ["listEditorField", "callListEditorMember", "listEditorLinkTypeLabel", "listEditorValues", "listEditorIndex", "isListEditorClosedStatus", "listEditorContextItems"].map(name => extractFunctionBlock(source, name)).join("\n");
const current = Object.fromEntries(Object.keys(baseline.functions).map(name => [name, extractFunctionBlock(source, name)]));
const required = ["requireListsHandle", "requireCheckedDom"].filter(name => source.includes(`function ${name}(`)).map(name => extractFunctionBlock(source,name)).join("\n");

test("editor native fields preserve host identity, conversion order and partial progress", async ({ isolatedWorkspace, browser }, testInfo) => {
  const {page}=isolatedWorkspace;
  await page.goto("/lists.html");
  const rows=await page.evaluate(async ({baseline,current,helpers,checkedSource,required})=>{
    const rows=[];
    const checkedDom=new Function("window",checkedSource+';return window.LongtailForge.checkedDom;')({});
    for(const kind of ["add","saved","number","array","object","symbol-title","symbol-description","throw-title","throw-description","missing-title","null-project"]) {
      const run=async(/** @type {boolean} */ before)=>{
        /** @type {unknown[]} */ const log=[];
        const sentinel={};
        const dialog=globalThis.document.createElement("dialog");
        const title=globalThis.document.createElement("input");
        const description=globalThis.document.createElement("textarea");
        const type=globalThis.document.createElement("select");
        type.innerHTML='<option value="checklist">Checklist</option>';
        title.value="prior";description.value="prior";
        title.addEventListener("focus",()=>log.push("focus"));
        dialog.append(title,description,type);globalThis.document.body.append(dialog);
        const value=kind==="number"?7:kind==="array"?["a","b"]:kind.startsWith("symbol")?Symbol("value"):{toString(){log.push("convert");if(kind.startsWith("throw"))throw sentinel;return "text";}};
        const record=kind==="add"?null:{list_id:7,title:kind.includes("description")?"Title":kind==="saved"?"Title":value,description:kind.includes("description")?value:"Description",list_type:"checklist"};
        const state={editingListId:"",editorList:null};
        const bindings={
          state,listDialog:dialog,listDialogTitle:globalThis.document.createElement("h2"),listTitleInput:kind==="missing-title"?null:title,listDescriptionInput:description,listTypeInput:type,
          listProjectInput:kind==="null-project"?null:globalThis.document.createElement("select"),listFormStatus:globalThis.document.createElement("p"),listSaveButton:globalThis.document.createElement("button"),
          requireView:()=>({showModal(/** @type {HTMLDialogElement} */ target,/** @type {{trigger?:unknown}} */ options){log.push(["show",target===dialog,options.trigger===title]);target.showModal();}}),
          requireNamespace:()=>({checkedDom}),defaultListType:()=>"checklist",setContextControlsVisible:()=>log.push("context"),shouldShowContextControls:()=>true,
          populateClientOptions:(/** @type {unknown} */ id)=>log.push(["client",id]),populateProjectOptions:(/** @type {unknown} */ select,/** @type {unknown} */ client,/** @type {unknown} */ project)=>log.push(["project",Boolean(select),client,project]),
          configureListEditorPicker:(/** @type {unknown} */ list)=>log.push(["picker",list===record]),
        };
        const build=new Function(...Object.keys(bindings),required+'\n'+(before?'':helpers)+'\n'+(before?baseline.functions.openListDialog:current.openListDialog)+'\nreturn openListDialog;');
        let error=null,result;
        try {const promise=build(...Object.values(bindings))(record,{trigger:title});dialog.returnValue="cancel";dialog.dispatchEvent(new globalThis.Event("close"));result=await promise;}
        catch(e){error={name:e instanceof Error?e.name:undefined,message:e instanceof Error?e.message:undefined,same:e===sentinel};}
        const answer={log,error,result,title:title.value,description:description.value,type:type.value,identity:state.editorList===record,id:state.editingListId};
        dialog.remove();return answer;
      };
      rows.push({kind,before:await run(true),after:await run(false)});
    }
    return rows;
  },{baseline,current,helpers,checkedSource,required});
  for(const row of rows){
    if(row.kind.startsWith("symbol")) {
      expect(row.before.error?.name).toBe("TypeError");expect(row.after.error?.name).toBe("TypeError");
      expect({...row.after,error:null}).toEqual({...row.before,error:null});
    } else expect(row.after).toEqual(row.before);
    expect(row.after.identity).toBe(true);
  }
  await testInfo.attach("editor-native-comparison",{body:JSON.stringify({browser:browser.version(),count:rows.length,rows},null,2),contentType:"application/json"});
});

test("project selection keeps RHS work before the required write", async ({isolatedWorkspace,browser},testInfo)=>{
  const {page}=isolatedWorkspace;await page.goto("/lists.html");
  const rows=await page.evaluate(({baseline,current,helpers,checkedSource,required})=>{
    const checkedDom=new Function("window",checkedSource+';return window.LongtailForge.checkedDom;')({});
    const rows=[];
    for(const kind of ["text","object","symbol","hook","null"]) {
      const run=(/** @type {boolean} */ before)=>{
        /** @type {unknown[]} */const log=[];
        const sentinel={};const id=kind==="symbol"?Symbol("id"):kind==="object"||kind==="hook"?{toString(){log.push("convert");if(kind==="hook")throw sentinel;return "p";}}:"p";
        const select=kind==="null"?null:globalThis.document.createElement("select");
        const bindings={allProjects:()=>[{get id(){log.push("id");return id;},name:"Project"}],usesBusinessScope:()=>false,replaceOptions:()=>log.push("replace"),option:(/** @type {unknown} */ value,/** @type {unknown} */ label)=>({value,label}),requireNamespace:()=>({checkedDom})};
        const call=new Function(...Object.keys(bindings),required+'\n'+(before?'':helpers)+'\n'+(before?baseline.functions.populateProjectOptions:current.populateProjectOptions)+'\nreturn populateProjectOptions;')(...Object.values(bindings));
        let error=null;try{call(select,"all",id);}catch(e){error={name:e instanceof Error?e.name:undefined,message:e instanceof Error?e.message:undefined,same:e===sentinel};}
        return {log,error,value:select?.value};
      };
      rows.push({kind,before:run(true),after:run(false)});
    }return rows;
  },{baseline,current,helpers,checkedSource,required});
  for(const row of rows){
    if(["null","symbol"].includes(row.kind)){
      expect(row.before.error?.name).toBe("TypeError");expect(row.after.error?.name).toBe("TypeError");
      expect({...row.after,error:null}).toEqual({...row.before,error:null});
      if(row.kind==="null")expect(row.after.error?.message).toBe("Lists requires its project select.");
    }else expect(row.after).toEqual(row.before);
  }
  await testInfo.attach("project-selection-comparison",{body:JSON.stringify({browser:browser.version(),count:rows.length,rows},null,2),contentType:"application/json"});
});
