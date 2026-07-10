import { appVersion } from "../src/core/version.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";


const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const runtimeDocs = readText("docs/runtime-configuration.md");
const databaseDocs = readText("docs/database.md");
const architectureDocs = readText("docs/architecture.md");
const sqliteDocs = readText("docs/sqlite-small-office-mode.md");
const moduleContract = readText("docs/module-contract.md");
const moduleDevelopment = readText("docs/module-development.md");
const envExample = readText(".env.example");
const regressionSuite = readText("scripts/regression-suite.mjs");

const branchRegressions = [
  "scripts/file-storage-provider-configuration-regression.mjs",
  "scripts/file-storage-diagnostics-regression.mjs",
  "scripts/file-storage-streaming-contract-regression.mjs",
  "scripts/file-multipart-upload-route-regression.mjs",
  "scripts/file-multipart-batch-upload-helper-regression.mjs",
  "scripts/file-upload-compatibility-error-hardening-regression.mjs",
  "scripts/file-scanner-mode-resolver-regression.mjs",
  "scripts/file-scanner-health-diagnostics-regression.mjs",
  "scripts/file-clamscan-adapter-regression.mjs",
  "scripts/file-clamd-adapter-regression.mjs",
  "scripts/file-scanner-setup-docs-regression.mjs",
  "scripts/file-s3-provider-registration-regression.mjs",
  "scripts/file-s3-object-operation-proof-regression.mjs",
  "scripts/file-s3-diagnostics-signed-url-boundary-regression.mjs",
];

assert.equal(packageJson.version, appVersion, "package.json should report the storage/scanner closeout version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the storage/scanner closeout version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the storage/scanner closeout version");
assert.equal(Boolean(packageJson.dependencies.busboy), true, "Busboy should remain the multipart parser dependency");
assert.equal(Object.keys(packageJson.dependencies || {}).some((name) => /aws-sdk|client-s3/i.test(name)), false, "the branch should not add an S3 SDK dependency");

assert.doesNotMatch(
  roadmap,
  /Completed 0\.33\.5\.22 storage provider and scanner runtime work is archived in `ROADMAP-ARCHIVE\.md`/,
  "live roadmap should not carry completed storage/scanner archive breadcrumbs",
);
assert.doesNotMatch(
  roadmap,
  /^Completed\b/m,
  "live roadmap should not contain completed-history breadcrumb paragraphs",
);
assert.doesNotMatch(
  roadmap,
  /^## Completed\b/m,
  "live roadmap should not contain completed-history sections",
);
assert.doesNotMatch(
  roadmap,
  /^## Version 0\.33\.5\.22 - Storage Provider and Scanner Runtime/m,
  "live roadmap should not keep the completed storage/scanner branch open",
);
assert.match(
  roadmap,
  /Active cursor: `0\.33\.6\.[^`]+`\. Completed work through `0\.33\.6\.[^`]+` is archived in `ROADMAP-ARCHIVE\.md`\./,
  "roadmap should record the current archived handoff",
);
assert.match(
  roadmap,
  /## Remaining 0\.33\.6 Direction/,
  "roadmap should hand off after the completed database extraction contract branch",
);

assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the storage/scanner closeout");
for (let index = 1; index <= 15; index += 1) {
  assert.match(changelog, new RegExp(`## Version 0\\.33\\.5\\.22\\.${index} - `), `changelog should include 0.33.5.22.${index}`);
}
assert.match(changelog, /Closed the 0\.33\.5\.22 storage\/scanner runtime branch/i, "changelog should record the branch closeout");
assert.match(changelog, /scripts\/file-storage-scanner-runtime-closeout-regression\.mjs/, "changelog should name the closeout regression");

assert.match(runtimeDocs, /As of 0\.33\.5\.22\.15/, "runtime docs should report the closeout version");
assert.match(runtimeDocs, /live local storage\/scanner keys/i, "runtime docs should explicitly collect live storage/scanner keys");
assert.match(runtimeDocs, /`LONGTAIL_STORAGE_PROVIDER`[\s\S]*`LONGTAIL_LOCAL_STORAGE_ROOT`[\s\S]*`LONGTAIL_S3_BUCKET`[\s\S]*`LONGTAIL_FILE_SCANNER`[\s\S]*`LONGTAIL_CLAMD_HOST`[\s\S]*`LONGTAIL_CLAMD_PORT`[\s\S]*`LONGTAIL_CLAMSCAN_PATH`/, "runtime docs should collect live storage and scanner keys");
assert.match(runtimeDocs, /`LONGTAIL_CLAMD_SOCKET`[\s\S]*not active/i, "runtime docs should keep Unix-socket scanning inert");
assert.match(runtimeDocs, /PostgreSQL[\s\S]*0\.40\.0 database extraction layer[\s\S]*0\.33\.5\.23 is SQL parameter-binding migration/i, "runtime docs should not point PostgreSQL settings at 0.33.5.23");
assert.match(runtimeDocs, /No direct\/presigned S3 upload or download route is implemented in 0\.33\.5\.25\.1/, "runtime docs should keep signed URL routes out of this branch");
assert.match(runtimeDocs, /Storage Provider and Scanner Runtime branch is complete/i, "runtime docs should close the storage/scanner branch");

assert.match(databaseDocs, /completed 0\.33\.5\.22 storage\/scanner runtime branch/i, "database docs should summarize the completed storage/scanner branch");
assert.match(databaseDocs, /local Files storage-provider selection[\s\S]*streaming writes[\s\S]*multipart uploads[\s\S]*scanner mode resolution[\s\S]*optional `clamscan`[\s\S]*optional `clamd`[\s\S]*S3-compatible adapter scaffolding[\s\S]*S3 object operations[\s\S]*S3 diagnostics\/signature-boundary[\s\S]*LONGTAIL_STORAGE_PROVIDER=s3[\s\S]*fails app and worker startup/, "database docs should collect the shipped storage/scanner capabilities");
assert.match(architectureDocs, /completed 0\.33\.5\.22 storage\/scanner runtime branch/i, "architecture docs should close the branch");
assert.match(architectureDocs, /actual signed URL\/direct-transfer routes[\s\S]*later work/, "architecture docs should keep direct-transfer work deferred");

assert.match(sqliteDocs, /As of 0\.33\.5\.25\.1[\s\S]*S3 remains deferred scaffolding[\s\S]*Local-vs-S3 deployment guidance/i, "SQLite docs should keep local-vs-S3 deployment guidance current");
assert.match(moduleContract, /As of 0\.33\.5\.22\.15[\s\S]*No direct\/presigned S3 route ships in this branch/, "module contract should record the closeout Files route boundary");
assert.match(moduleDevelopment, /As of 0\.33\.5\.22\.15[\s\S]*Normal module payloads[\s\S]*must not expose signed URLs/, "module development docs should keep module payloads route-backed");

assert.match(envExample, /LONGTAIL_STORAGE_PROVIDER=local/, ".env.example should document the local storage provider default");
assert.match(envExample, /LONGTAIL_S3_BUCKET/, ".env.example should document optional S3 settings");
assert.match(envExample, /LONGTAIL_FILE_SCANNER=none/, ".env.example should document the disabled scanner default");
assert.match(envExample, /LONGTAIL_CLAMD_HOST/, ".env.example should document optional clamd TCP settings");
assert.match(envExample, /LONGTAIL_CLAMSCAN_PATH/, ".env.example should document optional clamscan settings");
assert.doesNotMatch(envExample, /LONGTAIL_CLAMD_SOCKET/, ".env.example should not expose an inactive clamd socket setting");

for (const regression of branchRegressions) {
  assert.match(regressionSuite, new RegExp(escapeRegExp(regression)), `${regression} should be wired into the regression suite`);
}
assert.match(
  regressionSuite,
  /scripts\/static-contract-closeout-regression\.mjs/,
  "regression suite should include the consolidated static closeout regression",
);

console.log("File storage/scanner runtime closeout regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
