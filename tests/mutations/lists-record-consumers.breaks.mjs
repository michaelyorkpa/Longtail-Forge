import assert from "node:assert/strict";
import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

const cases = [
  { name: "missing-record guard weakened", find: "if (list === undefined) {", replace: "if (false) {" },
  { name: "incomplete record rejected", find: "if (list === undefined) {", replace: "if (list === undefined || !list.list_id) {" },
  { name: "different selection substituted for record ID", find: 'const listId = encodeURIComponent(`${list.list_id}`);', replace: 'const listId = encodeURIComponent(`${state.editingListId}`);' },
  { name: "error presentation flag lost", find: 'setStatus(requireErrors().caughtMessage(error, "List action failed."), true);', replace: 'setStatus(requireErrors().caughtMessage(error, "List action failed."), false);' },
  { name: "completed status loses finalize action", find: 'return status === "active" || status === "completed";', replace: 'return status === "active";' },
  { name: "item order changes", find: 'ordered.splice(targetIndex, 0, item);', replace: 'ordered.push(item);' },
];
const result = runMutationCampaign({ sourcePath: "public/js/lists.js", suites: ["tests/unit/lists-record-consumers.test.mjs"], cases });
assert.equal(result.caught.length, cases.length);
assert.equal(result.survivors.length + result.unusable.length, 0);
