import assert from "node:assert/strict";
import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";
const cases=[
 {name:"extra array push during iteration",find:'yield listEditorField(step, "value");',replace:'const row = listEditorField(step, "value"); [].push(row); yield row;'},
 {name:"identifier coerced before truthiness",find:'return listEditorField(params, "listId") || listEditorField(params, "list_id") || listEditorField(params, "recordId") || listEditorField(params, "id") || "";',replace:'return `${listEditorField(params, "listId") || listEditorField(params, "list_id") || listEditorField(params, "recordId") || listEditorField(params, "id") || ""}`;'},
 {name:"host record cloned",find:'state.editorList = list;',replace:'state.editorList = {...Object(list)};'},
 {name:"map receiver lost",find:'if (typeof method !== "function") throw new TypeError(`The list editor value has no callable ${String(key)}.`);\n    return Reflect.apply(method, value, args);',replace:'if (typeof method !== "function") throw new TypeError(`The list editor value has no callable ${String(key)}.`);\n    return Reflect.apply(method, undefined, args);'},
 {name:"iterator entry dropped",find:'yield listEditorField(step, "value");',replace:'yield undefined;'},
 {name:"second status read lost",find:'isListEditorClosedStatus(listEditorField(list, "status"))',replace:'true'},
];
// The browser-only assignment has its own identity comparison; omit that case from this unit campaign.
const unitCases=cases.filter(entry=>entry.name!=="host record cloned");
const result=runMutationCampaign({sourcePath:"public/js/lists.js",suites:["tests/unit/lists-editor-inputs.test.mjs"],cases:unitCases});
assert.equal(result.caught.length,unitCases.length);
assert.equal(result.survivors.length+result.unusable.length,0);
