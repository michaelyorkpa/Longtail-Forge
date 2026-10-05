import assert from "node:assert/strict";
import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

const cases = [
  { name: "provider order changes", find: 'const LIST_LINK_TARGET_ORDER = ["task", "note", "project", "client"];', replace: 'const LIST_LINK_TARGET_ORDER = ["note", "task", "project", "client"];' },
  { name: "personal picker offers client", find: '.filter((targetType) => targetType !== "client" || usesBusinessScope())', replace: '.filter(() => true)' },
  { name: "missing provider is fabricated", find: '.filter((provider) => provider !== undefined)', replace: '.map((provider) => provider || { targetType: "task", label: "fabricated" })' },
  { name: "legacy provider fallback discarded", find: 'provider.providerId || provider.provider || provider.id || ""', replace: 'provider.providerId || provider.id || ""' },
  { name: "previous search not cancelled", find: 'window.clearTimeout(state.linkTargetSearchTimer ?? undefined);', replace: '' },
  { name: "search delay changes", find: 'window.setTimeout(() => loadListEditorLinkTargets(), 180)', replace: 'window.setTimeout(() => loadListEditorLinkTargets(), 0)' },
];
const result = runMutationCampaign({ sourcePath: "public/js/lists.js", suites: ["tests/unit/lists-link-picker.test.mjs"], cases });
assert.equal(result.caught.length, cases.length);
assert.equal(result.survivors.length + result.unusable.length, 0);
