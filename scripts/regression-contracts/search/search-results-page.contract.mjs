import assert from "node:assert/strict";
import { REGRESSION_COMMANDS } from "../../regression-suite.mjs";
import { createProjectTextReader } from "../../test-support/source-scan.mjs";
// Consolidated under search.current-static-contracts by 0.33.33.10.
const { readTextAsync: readProjectFile } = createProjectTextReader();

const html = await readProjectFile("views/protected/search.html");
const script = await readProjectFile("public/js/search.js");
const styles = await readProjectFile("public/css/longtail-forge.css");
const staticService = await readProjectFile("src/services/static.service.js");

assert.match(staticService, /\["search\.html",\s*\{\s*id: "search",\s*file: "search\.html"\s*\}\]/);

assert.match(html, /<body data-page-title="Search">/);
assert.match(html, /data-search-form/);
assert.match(html, /data-search-text/);
assert.match(html, /data-search-module/);
assert.match(html, /data-search-record-type/);
assert.match(html, /data-search-client/);
assert.match(html, /data-search-project/);
assert.match(html, /data-search-tag/);
assert.match(html, /data-search-note-collection/);
assert.match(html, /data-search-results/);
assert.match(html, /data-search-pagination/);
assert.match(html, /js\/navigation\.js/);
assert.match(html, /js\/search\.js/);

assert.match(script, /new URLSearchParams\(window\.location\.search\)/);
assert.match(script, /fetch\(`\/api\/search\?\$\{params\}`,\s*\{\s*cache: "no-store"\s*\}\)/);
assert.match(script, /fetch\("\/api\/client-projects\?view=options",\s*\{\s*cache: "no-store"\s*\}\)/);
assert.match(script, /window\.LongtailForge\?\.tags\?\.loadTags/);
assert.match(script, /window\.history\.replaceState\(\{\},\s*"",\s*nextUrl\)/);
assert.match(script, /params\.set\("limit",\s*String\(state\.pageSize\)\)/);
assert.match(script, /appendParam\(params,\s*"text",\s*state\.filters\.text\)/);
assert.match(script, /appendParam\(params,\s*"source",\s*state\.filters\.source\)/);
assert.match(script, /appendParam\(params,\s*"recordType",\s*state\.filters\.recordType\)/);
assert.match(script, /appendParam\(params,\s*"clientId",\s*state\.filters\.clientId\)/);
assert.match(script, /appendParam\(params,\s*"projectId",\s*state\.filters\.projectId\)/);
assert.match(script, /appendParam\(params,\s*"tagId",\s*state\.filters\.tagId\)/);
assert.match(script, /appendParam\(params,\s*"noteCollectionId",\s*state\.filters\.noteCollectionId\)/);
assert.match(script, /appendParam\(params,\s*"status",\s*state\.filters\.status\)/);
assert.match(script, /result\.collectionPath/);
assert.match(script, /title\.href = result\.target\.url/);
assert.match(script, /groupResults\(results\)/);
assert.match(script, /renderPromptState/);
assert.match(script, /renderErrorState/);
assert.match(script, /renderPagination\(hasMore\)/);
assert.doesNotMatch(script, /body_text|tags_text/);

assert.match(styles, /\.search-workspace/);
assert.match(styles, /\.search-filter-form/);
assert.match(styles, /\.search-result-row/);
assert.match(styles, /\.search-pagination/);
assert.match(styles, /@media \(max-width: 700px\)[\s\S]*\.search-workspace/);

assert.ok(
  REGRESSION_COMMANDS.includes("node scripts/regressions/search/current-static-contracts.regression.mjs"),
  "Search results-page coverage must remain in the full regression suite through its current static owner",
);

console.log("Search results page regression passed.");
