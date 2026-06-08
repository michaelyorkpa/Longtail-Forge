import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const view = readText("views/protected/tags.html");
const script = readText("public/js/tags.js");
const css = readText("public/css/longtail-forge.css");
const repo = readText("src/repositories/tags.repo.js");

assert.match(view, /Search tags by name or slug/, "Tags page search should be prominent and specific");
assert.match(view, /data-tag-conflict/, "Tags page must include a duplicate/conflict status region");

assert.match(repo, /COUNT\(\*\) AS usage_count/, "Tag list query must compute tag usage counts");
assert.match(repo, /COALESCE\(tag_usage\.usage_count, 0\) AS usage_count/, "Tag usage count should default to zero");
assert.match(repo, /usage_count:\s*Number\(row\.usage_count \|\| 0\)/, "Tag app values must expose usage_count");

assert.match(script, /fetchTags\(new URLSearchParams\(\{ status: "all" \}\)\)/, "Duplicate conflict checks must look across all tag statuses");
assert.match(script, /function renderTagConflictMessage\(\)/, "Tags page must render proactive duplicate conflict feedback");
assert.match(script, /Existing tag uses this normalized slug/, "Duplicate conflict feedback must name normalized slug conflicts");
assert.match(script, /function renderTagMetadata\(container, tag\)/, "Tags page rows must render richer tag metadata");
assert.match(script, /metadataBadge\(`Slug: \$\{tag\.slug/, "Tag metadata must show slug");
assert.match(script, /metadataBadge\(`Status: \$\{tag\.status/, "Tag metadata must show status");
assert.match(script, /metadataBadge\(`Updated: \$\{formatDate\(tag\.updated_at\)\}`\)/, "Tag metadata must show updated date");
assert.match(script, /usage\.textContent = usageText\(tag\)/, "Tag rows must show usage counts");
assert.match(script, /function usageText\(tag\)/, "Usage count labels must be centralized");
assert.doesNotMatch(script, /merge|delete|disable/i, "Pass 3 must not add advanced cleanup actions to inline/list rows");

assert.match(css, /\.tag-row-meta/, "Tag metadata row styles must exist");
assert.match(css, /\.tag-metadata-badge/, "Tag metadata badges must be styled");
assert.match(css, /\.tag-row-usage/, "Tag usage count styles must exist");
assert.match(css, /\.tag-conflict-message/, "Tag conflict message styles must exist");

console.log("Tag management page regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
