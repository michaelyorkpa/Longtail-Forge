export const regressionMeta = Object.freeze({
  id: "database.repository-signature-types",
  area: "database",
  tier: "focused",
  tags: ["contracts", "database", "repositories", "typecheck"],
  description: "Proves Settings, Users, and Workspaces expose checked method inputs, projected rows, and nullable single-row results without changing runtime queries.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { strictCleanOwnerState } from "../../test-support/typecheck-ledger.mjs";

const repositoryPaths = [
  "src/repositories/settings.repo.js",
  "src/repositories/users.repo.js",
  "src/repositories/workspaces.repo.js",
];
const [settingsSource, usersSource, workspacesSource] = await Promise.all(
  repositoryPaths.map((filePath) => fs.readFile(filePath, "utf8")),
);

for (const repositoryPath of repositoryPaths) {
  assert.deepEqual(strictCleanOwnerState(repositoryPath), { owned: true, diagnostics: 0 }, `${repositoryPath} must stay strict-clean in its checked program`);
}
assert.match(settingsSource, /@returns \{Promise<ModuleSettingRow \| null>\}/);
assert.match(usersSource, /@returns \{Promise<UserRow \| null>\}/);
assert.match(workspacesSource, /@returns \{Promise<WorkspaceRow \| null>\}/);
assert.match(usersSource, /@param \{UserProfileInput\} profile/);
assert.match(workspacesSource, /@param \{CreateWorkspaceInput\} input/);

const tempDirectory = await fs.mkdtemp(path.join("scripts", ".repository-signature-types-"));
try {
  await fs.writeFile(path.join(tempDirectory, "valid.js"), `// @ts-check
import { settingsRepository } from "../../src/repositories/settings.repo.js";
import { usersRepository } from "../../src/repositories/users.repo.js";
import { workspacesRepository } from "../../src/repositories/workspaces.repo.js";

async function useRepositories() {
  const setting = await settingsRepository.readModuleSetting("workspace", "tasks", "enabled");
  const user = await usersRepository.readById("workspace", "user");
  const workspace = await workspacesRepository.readById("workspace");
  await usersRepository.updatePassword("workspace", "user", "hash", { passwordChangeRequired: true });
  const created = await workspacesRepository.createWorkspace({
    ownerUser: { user_id: "user" },
    workspaceName: "Workspace",
    workspaceType: "business",
  });
  return {
    settingJson: setting?.setting_value_json ?? null,
    username: user?.username ?? null,
    workspaceName: workspace?.workspace_name ?? created.workspaceName,
  };
}
void useRepositories;
`);
  await fs.writeFile(path.join(tempDirectory, "invalid.js"), `// @ts-check
import { settingsRepository } from "../../src/repositories/settings.repo.js";
import { usersRepository } from "../../src/repositories/users.repo.js";
import { workspacesRepository } from "../../src/repositories/workspaces.repo.js";

async function misuseRepositories() {
  const setting = await settingsRepository.readModuleSetting("workspace", "tasks", "enabled");
  const user = await usersRepository.readById("workspace", "user");
  const workspace = await workspacesRepository.readById("workspace");
  await usersRepository.updatePassword("workspace", "user", "hash", { passwordChangeRequired: "yes" });
  await workspacesRepository.createWorkspace({ ownerUser: {}, workspaceName: "Workspace", workspaceType: "business" });
  return setting.setting_value_json + user.username + workspace.workspace_name;
}
void misuseRepositories;
`);

  const validResult = compileProbe(path.join(tempDirectory, "valid.js"));
  assert.equal(validResult.status, 0, validResult.output);

  const invalidResult = compileProbe(path.join(tempDirectory, "invalid.js"));
  assert.notEqual(invalidResult.status, 0, "invalid repository inputs and unchecked nullable rows must fail the checked build");
  assert.match(invalidResult.output, /Type 'string' is not assignable to type 'boolean \| undefined'/);
  assert.match(invalidResult.output, /Property 'user_id' is missing/);
  assert.match(invalidResult.output, /'setting' is possibly 'null'/);
  assert.match(invalidResult.output, /'user' is possibly 'null'/);
  assert.match(invalidResult.output, /'workspace' is possibly 'null'/);
} finally {
  await fs.rm(tempDirectory, { recursive: true, force: true });
}

console.log("Database repository signature type regression passed.");

function compileProbe(/** @type {string} */ probePath) {
  const result = spawnSync(process.execPath, [
    "node_modules/typescript/bin/tsc",
    "--ignoreConfig",
    "--allowJs",
    "--checkJs",
    "false",
    "--noEmit",
    "--strict",
    "--noImplicitAny",
    "false",
    "--skipLibCheck",
    "--types",
    "node",
    "--module",
    "nodenext",
    "--moduleResolution",
    "nodenext",
    "--target",
    "es2023",
    probePath,
  ], { encoding: "utf8" });
  return {
    status: result.status,
    output: `${result.stdout || ""}${result.stderr || ""}`,
  };
}
