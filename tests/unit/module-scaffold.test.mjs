import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { it } from "vitest";
import { createModule, scaffoldFiles } from "../../scripts/lib/module-scaffold/index.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
/** @param {string} cwd @param {string[]} args @param {NodeJS.ProcessEnv} [env] */
function run(cwd, args, env = {}) {
  const result = spawnSync(process.execPath, args, { cwd, env: { ...process.env, ...env }, encoding: "utf8", timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, `${args.join(" ")}\n${result.stdout}\n${result.stderr}\n${result.error || ""}`);
  return result.stdout;
}
/** @param {string} root */
async function cleanup(root) {
  assert.ok(path.dirname(root) === path.resolve(os.tmpdir()) && path.basename(root).startsWith("ltf-scaffold-"));
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

it("rejects unsafe IDs and preflights all collisions without overwriting or partial output", async () => {
  for (const id of ["", "../tasks", "Tasks", "a/b", "a\\b", "a--b", "-a", "a-", "a".repeat(65), "con", "nul", "com1"]) assert.throws(() => scaffoldFiles(id));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-scaffold-collisions-"));
  try {
    await fs.mkdir(path.join(root, "public/js"), { recursive: true });
    await fs.writeFile(path.join(root, "public/js/sample-records.js"), "keep");
    await assert.rejects(createModule(root, "sample-records"), /already exists/);
    assert.equal(await fs.readFile(path.join(root, "public/js/sample-records.js"), "utf8"), "keep");
    await assert.rejects(fs.stat(path.join(root, "src/modules/sample-records")), { code: "ENOENT" });
  } finally { await cleanup(root); }
});

it("refuses linked output parents and keeps the external target untouched", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-scaffold-links-"));
  try {
    const target = path.join(root, "elsewhere");
    await fs.mkdir(target);
    await fs.symlink(target, path.join(root, "public"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(createModule(root, "sample-records"), /Refusing linked output directory/);
    assert.deepEqual(await fs.readdir(target), []);
    await assert.rejects(fs.stat(path.join(root, "src/modules/sample-records")), { code: "ENOENT" });
  } finally { await cleanup(root); }
});

it("prints CLI usage for missing or surplus arguments without generating output", () => {
  for (const args of [[], ["sample", "--unexpected"], ["sample", "--root"]]) {
    const result = spawnSync(process.execPath, ["scripts/create-module.mjs", ...args], {cwd: repository, encoding: "utf8"});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: npm run module:create/);
  }
});

it("generates untouched strict-clean output, builds the real catalog, boots and registers the module", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-scaffold-runtime-"));
  try {
    for (const directory of ["src", "public", "views", "help", "docs", "scripts", "tests"]) await fs.cp(path.join(repository, directory), path.join(root, directory), { recursive: true });
    for (const file of ["package.json", "tsconfig.json", "tsconfig.public.json", "tsconfig.scripts.json", "eslint.config.js", "playwright.config.js", "vitest.config.mjs", "server.js", "worker.js"]) await fs.copyFile(path.join(repository, file), path.join(root, file));
    for (const name of await fs.readdir(repository)) if (name.endsWith(".md")) await fs.copyFile(path.join(repository, name), path.join(root, name));
    await fs.symlink(path.join(repository, "node_modules"), path.join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    const generated = run(repository, ["scripts/create-module.mjs", "sample-records", "--root", root]);
    assert.match(generated, /Created sample-records \(12 files\)/);
    const { paths } = scaffoldFiles("sample-records");
    const before = await Promise.all(Object.values(paths).map(async file => [file, await fs.readFile(path.join(root, file), "utf8")]));
    const manifest = await fs.readFile(path.join(root, paths.module), "utf8");
    assert.doesNotMatch(manifest, /publicViews|seedHooks|repairHooks|migrationsDir|:\s*\[\s*\]/);
    assert.match(manifest, /browserAssetsDir:/);
    assert.match(manifest, /protectedViewsDir:/);
    const controller = await fs.readFile(path.join(root, paths.controller), "utf8");
    assert.match(controller, /^\/\/[^\n]+\n\(\(\) => \{/);
    assert.match(controller, /\}\)\(\);\s*$/);
    assert.ok(paths.controller.endsWith(".js"));
    assert.ok(!Object.values(paths).some(file => /module\.[^.]+\.js$/.test(file)));
    const catalogScript = path.join(repository, "scripts/generate-bundled-module-catalog.mjs");
    run(root, [catalogScript], { LTF_MODULE_REGISTRY_ROOT: root });
    run(root, [catalogScript, "--check"], { LTF_MODULE_REGISTRY_ROOT: root });
    for (const [config, owned] of [["tsconfig.json", paths.module], ["tsconfig.public.json", paths.controller], ["tsconfig.scripts.json", paths.regression]]) {
      const compilerFiles = run(root, [path.join(repository, "node_modules/typescript/bin/tsc"), "-p", config, "--pretty", "false", "--listFiles"]);
      assert.ok(compilerFiles.replaceAll("\\", "/").includes(path.join(root, owned).replaceAll("\\", "/")), `${owned} must actually enter ${config}`);
    }
    run(root, [path.join(repository, "node_modules/eslint/bin/eslint.js"), ...Object.values(paths).filter(file => /\.m?js$/.test(file))]);
    run(root, [paths.regression]);
    await assert.rejects(createModule(root, "sample-records"), /Module directory already exists/);
    await fs.writeFile(path.join(root, "proof.mjs"), bootProof);
    const output = run(root, ["proof.mjs"], {
      LONGTAIL_DATABASE_FILE: path.join(root, "data/proof.db"), LONGTAIL_DATA_DIR: path.join(root, "data"),
      LONGTAIL_LOCAL_STORAGE_ROOT: path.join(root, "data/files"), LONGTAIL_WORKSPACE_BACKUP_ROOT: path.join(root, "data/backups"),
      SUPER_ADMIN_PASSWORD: "Scaffold-Proof-Password-123!", SUPER_ADMIN_USERNAME: "scaffold-admin@example.test", NODE_ENV: "test",
    });
    assert.match(output, /Scaffold catalog, permission, navigation, search and HTTP boot passed/);
    for (const [file, text] of before) assert.equal(await fs.readFile(path.join(root, file), "utf8"), text, "Proof must not repair generated output");
  } finally { await cleanup(root); }
  await assert.rejects(fs.stat(root), { code: "ENOENT" });
}, 120000);

const bootProof = `
import assert from "node:assert/strict";
import { createApp } from "./src/core/app.js";
import { initializeDatabase, closeSqlite } from "./src/db/index.js";
import { getModule, listModulePermissions, listSearchableTypes } from "./src/core/modules/registry.js";
import { getSearchIndexer } from "./src/core/search/indexer-registry.js";
import { permissionsService } from "./src/core/permissions.js";
const module = getModule("sample-records");
assert.ok(module);
assert.equal(module.navigation[0].href, "sample-records.html");
assert.deepEqual(module.navigation[0].requiredPermissions, ["sample_records.view"]);
assert.ok(listModulePermissions().includes("sample_records.view"));
assert.ok(listSearchableTypes().some(type => type.indexer === "sample-records.records"));
assert.equal(getSearchIndexer("sample-records.records"), null, "Import is declaration-only");
let server;
try {
  await initializeDatabase();
  const app = createApp();
  const indexer = getSearchIndexer("sample-records.records");
  assert.ok(indexer);
  assert.deepEqual(await indexer({ workspaceId: "proof" }), { documents: [] });
  assert.equal(await indexer({ workspaceId: "proof", recordId: "absent" }), null);
  await assert.rejects(permissionsService.assertCan(null, "sample_records.view", {workspace_id: "proof", operation: "read"}));
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = "http://127.0.0.1:" + address.port;
  assert.equal((await fetch(base + "/healthz")).status, 200);
  assert.equal((await fetch(base + "/js/sample-records.js")).status, 200);
  const denied = await fetch(base + "/api/sample-records", {headers: {accept: "application/json"}, redirect: "manual"});
  assert.equal(denied.status, 401);
  assert.equal((await fetch(base + "/api/v1/sample-records")).status, 401);
  const csrfResponse = await fetch(base + "/api/csrf-token");
  const { csrfToken } = await csrfResponse.json();
  const csrfCookie = csrfResponse.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ");
  const login = await fetch(base + "/api/login", {method: "POST", headers: {"content-type": "application/json", "x-csrf-token": csrfToken, cookie: csrfCookie}, body: JSON.stringify({username: "scaffold-admin@example.test", password: "Scaffold-Proof-Password-123!"})});
  assert.equal(login.status, 200, await login.text());
  const cookie = [csrfCookie, ...login.headers.getSetCookie().map(value => value.split(";")[0])].join("; ");
  const headers = { cookie, accept: "application/json" };
  const records = await fetch(base + "/api/sample-records", {headers});
  assert.equal(records.status, 200, await records.clone().text());
  assert.deepEqual((await records.json()).records, []);
  const shell = await fetch(base + "/api/app-shell/bootstrap", {headers});
  assert.equal(shell.status, 200);
  assert.ok(JSON.stringify((await shell.json()).navigation).includes("sample-records.html"));
  const page = await fetch(base + "/sample-records.html", {headers});
  assert.equal(page.status, 200);
  assert.match(await page.text(), /data-sample-records-records/);
  const keyResponse = await fetch(base + "/api/api-keys", {method: "POST", headers: {...headers, "content-type": "application/json", "x-csrf-token": csrfToken}, body: JSON.stringify({name: "Scaffold proof", scopes: ["sample_records:read"]})});
  assert.equal(keyResponse.status, 201, await keyResponse.clone().text());
  const { rawKey } = await keyResponse.json();
  const publicResponse = await fetch(base + "/api/v1/sample-records", {headers: {authorization: "Bearer " + rawKey}});
  assert.equal(publicResponse.status, 200, await publicResponse.clone().text());
  const envelope = await publicResponse.json();
  assert.equal(envelope.apiVersion, "v1");
  assert.deepEqual(envelope.data, []);
  assert.equal(envelope.pagination.total, 0);
  assert.equal((await fetch(base + "/api/v1/sample-records/absent", {headers: {authorization: "Bearer " + rawKey}})).status, 404);
  const otherKeyResponse = await fetch(base + "/api/api-keys", {method: "POST", headers: {...headers, "content-type": "application/json", "x-csrf-token": csrfToken}, body: JSON.stringify({name: "Wrong scope proof", scopes: ["clients:read"]})});
  assert.equal(otherKeyResponse.status, 201);
  const otherKey = await otherKeyResponse.json();
  assert.equal((await fetch(base + "/api/v1/sample-records", {headers: {authorization: "Bearer " + otherKey.rawKey}})).status, 403);


  console.log("Scaffold catalog, permission, navigation, search and HTTP boot passed");
} finally {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await closeSqlite();
}
`;
