export const regressionMeta = Object.freeze({
  id: "framework.typecheck-honesty-inventory",
  area: "framework",
  tier: "release-gate",
  tags: ["contracts", "framework", "release", "typecheck"],
  description: "Pins the checked-program honesty inventory, named contract cleanup, and explicit future ownership for strict production, browser, and test residuals.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";

const [honesty, seamInventory, frameworkContracts, httpContracts, modulesService, filesContracts, tasksContracts, billingService, timeEntriesService, taskTimersService] = await Promise.all([
  fs.readFile("scripts/typecheck-honesty-inventory.json", "utf8").then(JSON.parse),
  fs.readFile("scripts/typecheck-seam-inventory.json", "utf8").then(JSON.parse),
  fs.readFile("src/types/framework-contracts.d.ts", "utf8"),
  fs.readFile("src/types/http-contracts.d.ts", "utf8"),
  fs.readFile("src/core/modules/modules.service.js", "utf8"),
  fs.readFile("src/core/files/files.contracts.js", "utf8"),
  fs.readFile("src/modules/tasks/tasks.contracts.js", "utf8"),
  fs.readFile("src/modules/time-tracking/time-tracking-billing.service.js", "utf8"),
  fs.readFile("src/modules/time-tracking/time-entries.service.js", "utf8"),
  fs.readFile("src/modules/tasks/task-timers.service.js", "utf8"),
]);

assert.equal(honesty.reviewedSlice, "checked-program-honesty");
assert.equal(honesty.checkedProgram.errors, 0);
assert.equal(honesty.checkedProgram.optedInFiles, seamInventory.checkedFiles.length);
assert.ok(honesty.checkedProgram.optedInFiles >= 149);
assert.equal(Object.values(honesty.strictServerAndTestProbe.byOwner).reduce((sum, count) => sum + count, 0), honesty.strictServerAndTestProbe.errors);
assert.equal(honesty.strictServerAndTestProbe.productionErrors + honesty.strictServerAndTestProbe.testOnlyErrors + honesty.strictServerAndTestProbe.scriptErrors, honesty.strictServerAndTestProbe.errors);
assert.match(honesty.strictServerAndTestProbe.testDisposition, /non-production test hardening/);
assert.match(honesty.strictPublicBrowserProbe.futureOwner, /client-hardening branch/);

const actualAnyOwners = {};
for (const filePath of seamInventory.checkedFiles) {
  const source = await fs.readFile(filePath, "utf8");
  const matches = source.match(/Record<string, any>|\bany\[\]|\{any\}/g) || [];
  if (matches.length > 0) {
    actualAnyOwners[filePath] = matches.length;
  }
  assert.doesNotMatch(source, /@param\s+\{\*\}/, `${filePath} must not use wildcard parameters`);
  assert.doesNotMatch(source, /as unknown as/, `${filePath} must not use double casts`);
}
assert.deepEqual(actualAnyOwners, honesty.checkedProgram.remainingExplicitAnyByOwner);

const permissionResource = readInterface(httpContracts, "PermissionResource");
const activeApiKey = readInterface(httpContracts, "ActiveApiKey");
assert.doesNotMatch(permissionResource, /\[key: string\]/);
assert.doesNotMatch(activeApiKey, /\[key: string\]/);
assert.match(frameworkContracts, /export interface CatalogContribution \{/);
assert.match(frameworkContracts, /export interface ModuleEventHookContribution extends CatalogContribution/);
assert.match(frameworkContracts, /session: RequestSession;/);
assert.doesNotMatch(modulesService, /Record<string, any> & \{id\?: string/);
assert.doesNotMatch(modulesService, /@type \{(?:ApiScopeCatalogEntry|ModuleEventHook)\[\]\}/);
assert.match(filesContracts, /@template \{import\("zod"\)\.ZodType\} Schema[\s\S]*@returns \{import\("zod"\)\.output<Schema>\}/);
assert.match(tasksContracts, /@template \{import\("zod"\)\.ZodType\} Schema[\s\S]*@returns \{import\("zod"\)\.output<Schema>\}/);
assert.match(billingService, /@type \{TimeTrackingBillingService\}[\s\S]*export const timeTrackingBillingService/);
assert.match(timeEntriesService, /@type \{TimeEntriesService\}[\s\S]*export const timeEntriesService/);
assert.match(taskTimersService, /@type \{TaskTimersService\}[\s\S]*export const taskTimersService/);

console.log("Checked-program honesty inventory regression passed.");

function readInterface(source, interfaceName) {
  const declaration = source.match(new RegExp(`export interface ${interfaceName} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(declaration, `${interfaceName} must remain an exported interface`);
  return declaration[1];
}
