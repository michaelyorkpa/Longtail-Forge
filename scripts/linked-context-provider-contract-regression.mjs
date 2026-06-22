import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { modulesService } from "../src/core/modules/modules.service.js";
import {
  LINKED_CONTEXT_TARGET_RESPONSE_CONTRACT,
  LINKED_CONTEXT_TARGET_RESPONSE_FIELDS,
  assertLinkedContextTargetContract,
  validateLinkedContextTarget,
} from "../src/core/linked-context/provider-contract.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const packageLock = JSON.parse(await fs.readFile(path.join(root, "package-lock.json"), "utf8"));
const workflowContract = await fs.readFile(path.join(root, "docs", "workflow-context-contract.md"), "utf8");
const pickerContract = await fs.readFile(path.join(root, "docs", "linked-context-picker-contract.md"), "utf8");
const moduleContract = await fs.readFile(path.join(root, "docs", "module-contract.md"), "utf8");

assert.equal(packageJson.version, "0.33.5.18.6.6.4", "package.json should report the current app version");
assert.equal(packageLock.version, "0.33.5.18.6.6.4", "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, "0.33.5.18.6.6.4", "package-lock package entry should report the current app version");

assert.deepEqual(LINKED_CONTEXT_TARGET_RESPONSE_FIELDS, [
  "moduleId",
  "targetType",
  "targetId",
  "displayLabel",
  "secondaryLabel",
  "sortKey",
  "sourceUrl",
  "clientId",
  "projectId",
  "workspaceId",
  "isAvailable",
  "primaryContextHints",
]);

assert.equal(LINKED_CONTEXT_TARGET_RESPONSE_CONTRACT, "linked-context-target.v1");

const providers = modulesService.listLinkedContextProviders();
const providerIds = providers.map((provider) => provider.id);
assert.deepEqual([...new Set(providerIds)].sort(), providerIds.sort(), "linked context provider ids should be unique");

const providersByTargetType = new Map(providers.map((provider) => [provider.targetType, provider]));
for (const targetType of ["client", "project", "task", "note", "list", "user"]) {
  assert.ok(providersByTargetType.has(targetType), `${targetType} provider should be registered`);
}

for (const provider of providers) {
  assert.equal(provider.responseContract, LINKED_CONTEXT_TARGET_RESPONSE_CONTRACT, `${provider.id} should use the shared response contract`);
  assert.ok(provider.provider.includes(".linked-context."), `${provider.id} should expose a provider registry id`);
  assert.ok(provider.requiredReadPermission, `${provider.id} should declare requiredReadPermission`);
  assert.ok(provider.requiredPermissions?.includes(provider.requiredReadPermission), `${provider.id} permissions should include requiredReadPermission`);
  assert.ok(provider.requiredModules?.includes(provider.moduleId), `${provider.id} should require its owner module`);
}

assert.deepEqual(providersByTargetType.get("client").workspaceTypes, ["business"], "client target provider should be business-only");
assert.ok(
  providersByTargetType.get("project").requiredWorkspaceCapabilities.includes("projects"),
  "project provider should support project-capable non-business workspaces",
);

const normalized = assertLinkedContextTargetContract({
  moduleId: "tasks",
  targetType: "task",
  targetId: "2f6f0c3e-dc1b-4d73-8f45-9b469711f95a",
  displayLabel: "Review trailer wiring",
  secondaryLabel: "Camper - Active",
  sortKey: "review trailer wiring",
  sourceUrl: "tasks.html?task=2f6f0c3e-dc1b-4d73-8f45-9b469711f95a",
  clientId: "",
  projectId: "671b3460-5225-491f-bce1-77fb7d017712",
  workspaceId: "169e6608-a1f9-4ab7-8ff8-b4083f3cce8f",
  isAvailable: true,
  primaryContextHints: {
    projectId: "671b3460-5225-491f-bce1-77fb7d017712",
  },
}, providersByTargetType.get("task"));

assert.equal(normalized.displayLabel, "Review trailer wiring");
assert.equal(normalized.primaryContextHints.projectId, "671b3460-5225-491f-bce1-77fb7d017712");

const rawUuidLabel = validateLinkedContextTarget({
  ...normalized,
  displayLabel: normalized.targetId,
});
assert.equal(rawUuidLabel.ok, false, "displayLabel should reject raw target ids");
assert.ok(rawUuidLabel.errors.some((error) => error.includes("displayLabel")), "raw displayLabel should explain the unsafe label");

const embeddedUuidLabel = validateLinkedContextTarget({
  ...normalized,
  displayLabel: `Task ${normalized.targetId}`,
});
assert.equal(embeddedUuidLabel.ok, false, "displayLabel should reject embedded raw UUIDs");

const rawUuidSecondary = validateLinkedContextTarget({
  ...normalized,
  secondaryLabel: normalized.projectId,
});
assert.equal(rawUuidSecondary.ok, false, "secondaryLabel should reject raw context ids");

for (const requiredSnippet of [
  "Source modules own provider data, permission-safe filtering, sorting, labels, summaries, and source URLs.",
  "The framework must not hard-code how Clients, Projects, Tasks, Notes, Lists, Users, or future modules sort records or construct display labels.",
  "`moduleId`",
  "`targetType`",
  "`targetId`",
  "`displayLabel`",
  "`secondaryLabel`",
  "`sortKey`",
  "`sourceUrl`",
  "`clientId`",
  "`projectId`",
  "`workspaceId`",
  "`isAvailable`",
  "`primaryContextHints`",
  "must not be raw UUIDs",
]) {
  assert.ok(pickerContract.includes(requiredSnippet), `picker contract should include ${requiredSnippet}`);
}

assert.ok(workflowContract.includes("linked-context-target.v1"), "workflow context contract should reference provider contract version");
assert.ok(workflowContract.includes("displayLabel"), "workflow context contract should document displayLabel");
assert.ok(moduleContract.includes("linkedContextProviders"), "module contract should list linkedContextProviders as an active field");
assert.ok(
  moduleContract.includes("Source modules own target lookup, permission-safe filtering, sorting, safe display labels"),
  "module contract should keep sorting and labels module-owned",
);

console.log("Linked Context provider contract regression passed.");
