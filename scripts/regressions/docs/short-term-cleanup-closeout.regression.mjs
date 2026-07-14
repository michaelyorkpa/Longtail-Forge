export const regressionMeta = Object.freeze({
  id: "docs.short-term-cleanup-closeout",
  area: "docs",
  tier: "focused",
  tags: ["closeout", "roadmap", "todo"],
  description: "Protects the recovered client change-request plan and the deferred-only TODO Short Term boundary after the 0.33.11 closeout.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs";
import { assertRoadmapCursorAtLeast } from "../../lib/roadmap-cursor.mjs";

const roadmap = fs.readFileSync("ROADMAP.md", "utf8");
const todo = fs.readFileSync("TODO.md", "utf8");
const shortTerm = sectionBetween(todo, "# Short Term", "# Near Term Ideas");

assert.match(roadmap, /## Version 0\.40\.0 - Project Tools expansion/);
assert.match(roadmap, /Client approvals and change requests/);
assert.match(roadmap, /Link approvals to clients, projects, milestones, tasks, notes, tickets, or files where appropriate/);
assert.match(roadmap, /Track request details, status, requester, approver, and related records/);
assert.match(roadmap, /Link change requests to Client\/Project scope/);
assert.match(roadmap, /project history and billing justification without turning it into a contract-management system/);
assert.match(roadmap, /Keep client-facing approval actions out of scope until permissions and client-portal features are ready/);

assert.match(shortTerm, /remaining Short Term notes are intentionally deferred rather than implementation-ready/);
assert.match(shortTerm, /The Lists UI\/UX Overhaul notes were promoted to \*\*ROADMAP\.md 0\.33\.13 - Lists Module UI\/UX Overhaul\*\*/);
assert.doesNotMatch(shortTerm, /## Lists UI\/UX Overhaul \(Notes for 0\.33\.13\)/);
assert.match(shortTerm, /## Notes - Suggested Library/);
assert.match(shortTerm, /## Testing Goals/);
assert.match(shortTerm, /## Knowledge Base Make Good Smart/);
assert.match(shortTerm, /## Administration\/Settings/);
assert.match(shortTerm, /## Mobile Tweaks/);
assert.match(shortTerm, /do not revive layout requests written against retired page anatomy/);
assert.doesNotMatch(shortTerm, /- \[ \]/, "Short Term should not retain implementation-ready unchecked checklist items.");

for (const promotedText of [
  "I think I lost client change requests",
  "Billable flag needs to be deprecated",
  "Adding a task using the {{workspaceName}}",
  "Remove Workspace flow",
]) {
  assert.doesNotMatch(shortTerm, new RegExp(escapeRegExp(promotedText), "i"), `Promoted TODO text should stay removed: ${promotedText}`);
}

assertRoadmapCursorAtLeast("0.33.12", "the completed 0.33.11 cleanup branch should hand off to Reporting");
assert.doesNotMatch(roadmap, /^## Version 0\.33\.11 - Short-Term Critical Cleanup Sweep/m);

console.log("Short-Term cleanup documentation closeout regression passed.");

function sectionBetween(source, startHeading, endHeading) {
  const normalizedSource = source.replace(/\r\n?/g, "\n");
  const start = normalizedSource.indexOf(`${startHeading}\n`);
  const end = normalizedSource.indexOf(`\n${endHeading}\n`, start + startHeading.length);
  assert.notEqual(start, -1, `Missing ${startHeading}`);
  assert.notEqual(end, -1, `Missing ${endHeading}`);
  return normalizedSource.slice(start, end);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
