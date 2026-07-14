import { createDisposableDatabaseFixture } from "./test-support/disposable-database.mjs";

const staticCloseoutModules = [
  ["runtime/database foundation", "./runtime-database-foundation-closeout-regression.mjs"],
  ["database agnostic contract", "./database-agnostic-contract-closeout-regression.mjs"],
  ["module/file framework", "./module-file-closeout-regression.mjs"],
  ["Notes import planning", "./notes-import-closeout-regression.mjs"],
  ["surface standardization", "./surface-standardization-closeout-regression.mjs"],
  ["view builder", "./view-builder-closeout-regression.mjs"],
  ["view conversion branch", "./view-conversion-branch-closeout-regression.mjs"],
  ["Files browse/edit/preview", "./files-browse-edit-preview-closeout-regression.mjs"],
  ["Files conversion", "./files-conversion-closeout-regression.mjs"],
  ["Notes slide-out", "./notes-slideout-closeout-regression.mjs"],
  ["Markdown platform", "./markdown-closeout-regression.mjs"],
  ["Tasks conversion", "./tasks-conversion-closeout-regression.mjs"],
  ["Clients/Projects strict cleanup", "./clients-projects-strict-closeout-regression.mjs"],
  ["file storage/scanner runtime", "./file-storage-scanner-runtime-closeout-regression.mjs"],
];

const fixture = await createDisposableDatabaseFixture("static-contract-closeout-regression");

try {
for (const [, modulePath] of staticCloseoutModules) {
  await import(modulePath);
}

console.log(`Static contract closeout regression passed ${staticCloseoutModules.length} imported closeout modules.`);
} finally {
  const { closeDatabase } = await import("../src/db/provider.js");
  await closeDatabase();
  await fixture.cleanup();
}
