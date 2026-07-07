import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { createLocalFileStorageAdapter } from "../src/core/files/local-storage-adapter.js";

const root = process.cwd();
const appVersion = "0.33.6.6b";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-file-storage-streaming-"));
const storageRoot = path.join(tempDir, "files");

try {
  assertStaticContracts();

  const adapter = createLocalFileStorageAdapter({ rootDir: storageRoot });

  const buffered = await adapter.save(Buffer.from("buffered body"), {
    workspaceId: "Workspace One",
  });
  assert.match(buffered.storageKey, /^Workspace-One\//, "buffered save should keep normalized workspace storage-key prefixes");
  assert.equal(await readStoredText(adapter, buffered.storageKey), "buffered body", "buffered save callers should still write readable content");

  const streamed = await adapter.saveStream(Readable.from(["streamed ", "body"]), {
    workspaceId: "Workspace Two",
  });
  assert.match(streamed.storageKey, /^Workspace-Two\//, "streamed save should use the same normalized storage-key prefixes");
  assert.equal(await readStoredText(adapter, streamed.storageKey), "streamed body", "streamed save should write readable content");
  assertStoragePathContained(adapter, streamed.storageKey);

  await assert.rejects(
    () => adapter.saveStream(Buffer.from("not a readable stream"), { workspaceId: "Bad Stream" }),
    /readable stream is required/i,
    "saveStream should reject non-stream input clearly",
  );

  const beforeFailure = await listStoredFiles(storageRoot);
  await assert.rejects(
    () => adapter.saveStream(failingStream(), { workspaceId: "Failing Stream" }),
    /stream exploded/,
    "saveStream should surface source stream failures",
  );
  assert.deepEqual(
    await listStoredFiles(storageRoot),
    beforeFailure,
    "saveStream should clean up partial local files after stream failures",
  );

  console.log("File storage streaming contract regression passed.");
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContracts() {
  const packageJson = JSON.parse(readText("package.json"));
  const packageLock = JSON.parse(readText("package-lock.json"));
  const roadmap = readText("ROADMAP.md");
  const changelog = readText("CHANGELOG.md");
  const localStorageAdapter = readText("src/core/files/local-storage-adapter.js");
  const filesService = readText("src/services/files.service.js");
  const regressionSuite = readText("scripts/regression-suite.mjs");

  assert.equal(packageJson.version, appVersion, "package.json should report the streaming storage contract version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the streaming storage contract version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the streaming storage contract version");
  assert.equal(packageJson.dependencies?.busboy, "^1.6.0", "package.json should record the multipart parser dependency decision");
  assert.ok(packageLock.packages["node_modules/busboy"], "package-lock should include the Busboy dependency");

  assert.match(changelog, /Busboy[\s\S]*instead of hand-rolling multipart parsing/, "changelog should record the Busboy multipart parser decision");
  assert.match(changelog, /saveStream\(readable, options\)[\s\S]*save\(buffer, options\)/, "changelog should record the streaming storage adapter contract");
  assert.match(localStorageAdapter, /async saveStream\(readable, options = \{\}\)/, "local storage adapter should expose saveStream");
  assert.match(localStorageAdapter, /pipeline\(readable, createWriteStream\(target\.filePath\)\)/, "local saveStream should pipe directly into the storage file");
  assert.match(localStorageAdapter, /fs\.rm\(target\.filePath, \{ force: true \}\)/, "local saveStream should clean up partial files on stream errors");
  assert.match(filesService, /\["save", "saveStream", "read", "metadata", "delete", "health"\]/, "Files storage adapter registration should require saveStream");
  assert.doesNotMatch(roadmap, /Completed 0\.33\.5\.22 storage provider and scanner runtime work is archived in `ROADMAP-ARCHIVE\.md`/, "live roadmap should not carry completed-history breadcrumbs");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the streaming storage contract slice");
  assert.match(regressionSuite, /scripts\/file-storage-streaming-contract-regression\.mjs/, "regression suite should include the streaming storage contract regression");
}

async function readStoredText(adapter, storageKey) {
  return fs.readFile(adapter.resolveStoragePath(storageKey), "utf8");
}

function assertStoragePathContained(adapter, storageKey) {
  const resolved = adapter.resolveStoragePath(storageKey);
  const relative = path.relative(storageRoot, resolved);

  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "stored file should stay inside the configured local storage root");
}

function failingStream() {
  return Readable.from((async function* readPartialThenFail() {
    yield "partial body";
    throw new Error("stream exploded");
  }()));
}

async function listStoredFiles(directory) {
  const files = [];

  async function walk(currentDirectory) {
    let entries;
    try {
      entries = await fs.readdir(currentDirectory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile()) {
        files.push(path.relative(directory, entryPath).replaceAll(path.sep, "/"));
      }
    }
  }

  await walk(directory);
  return files.sort();
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
