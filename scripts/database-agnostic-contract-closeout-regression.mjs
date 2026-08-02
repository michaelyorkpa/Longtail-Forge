import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { assertRoadmapCursorAtLeast } from "./lib/roadmap-cursor.mjs";

const root = process.cwd();

const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");
const moduleContractDocs = readText("docs/module-contract.md");
const moduleDevelopmentDocs = readText("docs/module-development.md");
const viewContractDocs = readText("docs/view-building-contract.md");
const declarativeViewDocs = readText("docs/declarative-view-surfaces.md");


assert.match(auditDocs, /## Baseline-driven workflow[\s\S]*npm run audit:params:check[\s\S]*fails only when runtime source introduces an unreviewed legacy helper call or template-interpolated database operation[\s\S]*Do not update the baseline in unrelated feature work/, "audit docs should publish the baseline-driven parameter-binding ratchet");
assert.match(auditDocs, /## Dialect Adoption Guardrail[\s\S]*Current totals as of 0\.33\.5\.28\.2:[\s\S]*Remaining raw seam-backed dialect sites at application call sites: 0/, "audit docs should publish the final dialect ratchet");
assert.match(auditDocs, /0\.33\.5\.27\.33 Docs, Decisions, 0\.40\.0 Reconciliation, and Closeout[\s\S]*finished contract[\s\S]*0 runtime literal-helper invocations[\s\S]*0 direct helper-interpolated SQL operation sites[\s\S]*0 raw seam-backed dialect sites/, "audit docs should record the closeout slice");

assert.match(databaseDocs, /As of version 0\.33\.5\.27\.33[\s\S]*database extraction contract branch is complete[\s\S]*Future modules and repository changes must start on `src\/core\/database\.js`[\s\S]*0\.40\.0 implements and proves PostgreSQL behind these seams/, "database docs should describe the finished agnostic contract");
assert.match(moduleContractDocs, /As of 0\.33\.5\.28\.2[\s\S]*starting point for every new first-party or future third-party module[\s\S]*module-local SQL literal escaping[\s\S]*Browser descriptors and view adapters remain data consumers only/, "module contract should publish the new-module database boundary");
assert.match(moduleDevelopmentDocs, /## Database Access[\s\S]*As of 0\.33\.5\.28\.2[\s\S]*Import database access from `src\/core\/database\.js`[\s\S]*Do not call `sqlText\(\)`[\s\S]*Browser scripts, view descriptors, and module adapters must not become database access layers/, "module development docs should give authors the enforcement rules");
assert.match(viewContractDocs, /As of 0\.33\.5\.28\.2[\s\S]*view helpers and descriptors also must not learn database provider behavior[\s\S]*canonical filtering, sorting, paging, permission pruning, database reads\/writes/, "view-building contract should keep provider behavior out of helpers");
assert.match(declarativeViewDocs, /As of 0\.33\.5\.28\.2[\s\S]*completed agnostic database contract[\s\S]*must not express SQL, raw provider dialect[\s\S]*server-side route\/service\/repository concerns/, "declarative view docs should keep database ownership server-side");

assert.match(changelog, /## Version 0\.33\.5\.27\.33 - [^\n]+[\s\S]*database extraction contract branch[\s\S]*0 runtime literal-helper invocations[\s\S]*0 direct helper-interpolated SQL operation sites[\s\S]*0 raw seam-backed dialect sites[\s\S]*advanced the live roadmap cursor to 0\.33\.5\.28/, "changelog should record the database agnostic closeout");

assertRoadmapCursorAtLeast("0.33.8", "live roadmap should record the current archived handoff");
assertRoadmapCursorAtLeast("0.33.8", "live roadmap should advance after the completed database extraction contract and parameter-binding gap closeout branches");
assert.doesNotMatch(roadmap, /^## Version 0\.33\.5\.27 - Database extraction contract/m, "live roadmap should not keep the completed database extraction contract branch open");
assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.27\.33 - Docs, decisions, 0\.40\.0 reconciliation, and closeout/, "live roadmap should not keep the completed closeout slice body");
assert.match(roadmap, /Database extraction layer - PostgreSQL adapter and dual-backend support[\s\S]*completed 0\.33\.5\.27 agnostic-by-contract conversion\/seam branch[\s\S]*interpolation and raw-dialect ratchets enforced at zero[\s\S]*not an app-wide SQL rewrite[\s\S]*consume the closed 0\.33\.5\.27 decisions/, "0.40.0 should be reduced to PostgreSQL implementation and proof behind the established seams");


console.log("Database agnostic contract closeout regression passed.");

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}
