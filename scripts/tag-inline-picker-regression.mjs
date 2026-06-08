import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const helper = readText("public/js/shared/tags.js");
const css = readText("public/css/longtail-forge.css");

assert.match(helper, /async function createTag/, "shared tag helper must expose a tag creation helper");
assert.match(helper, /fetch\("\/api\/tags"/, "inline tag creation must use the module-owned tag API");
assert.match(helper, /method:\s*"POST"/, "inline tag creation must post new tag definitions");
assert.match(helper, /status !== 409/, "inline duplicate conflicts should be handled separately from hard failures");
assert.match(helper, /loadTags\(\{ search: name, status: "active" \}\)/, "slug conflicts should reload matching active tags for reuse");
assert.match(helper, /findTagByNameOrSlug/, "inline picker must reuse existing tags by normalized name or slug");
assert.match(helper, /event\.key !== "Enter" && event\.key !== ","/, "inline picker must tokenize with Enter and comma");
assert.match(helper, /event\.preventDefault\(\)/, "tokenization must not submit the surrounding form");
assert.match(helper, /dataset\.tagPickerRemove/, "selected tag chips must be removable");
assert.match(helper, /dataset\.tagPickerSelected/, "selected IDs must remain readable from stable hidden inputs");
assert.match(helper, /if \(options\.allowCreate === false\)[\s\S]*Select an existing tag from the list\./, "record workflows must be able to disable inline tag creation with clear feedback");
assert.match(helper, /catch \(error\) \{[\s\S]*setStatus\(status, error\.message \|\| "Unable to create tag\.", true\)/, "inline create permission failures must surface the API error message");
assert.match(helper, /aria-autocomplete", "list"/, "tag entry must advertise autocomplete behavior");
assert.match(helper, /aria-live", "polite"/, "inline status must announce create and validation feedback");
assert.match(helper, /createTag,\s*\n\s*loadTags,\s*\n\s*mountPicker,/, "shared namespace must expose createTag, loadTags, and mountPicker");

assert.match(css, /\.tag-picker-entry/, "inline tag picker entry styles must exist");
assert.match(css, /\.tag-picker-suggestions/, "inline tag picker suggestions styles must exist");
assert.match(css, /\.tag-chip-remove/, "removable tag chip styles must exist");
assert.match(css, /\.tag-picker-status\.is-error/, "inline picker error status styles must exist");

console.log("Tag inline picker regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
