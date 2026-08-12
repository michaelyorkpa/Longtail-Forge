export const regressionMeta = Object.freeze({
  id: "framework.public-demo-files-ingress",
  area: "framework",
  tier: "release-gate",
  tags: ["browser", "demo", "files", "permissions", "routes", "security"],
  description: "Proves public-demo Files ingestion is denied before payload parsing or persistence while seeded reads and standard-mode ingress remain available.",
  runMode: "isolated-database",
});

import { escapeRegExp } from "../../test-support/source-scan.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";
import { getPublicDemoCapability } from "../../../src/core/public-demo-capabilities.js";
import { createProjectTextReader } from "../../test-support/source-scan.mjs";
const { readTextAsync: read } = createProjectTextReader();

const fixture = await createDisposableDatabaseFixture("public-demo-files-ingress");
try {
  const [serviceSource, routesSource, attachmentsSource, shellSource, appSource] = await Promise.all([
    read("src/services/files.service.js"),
    read("src/routes/files.routes.js"),
    read("public/js/shared/file-attachments.js"),
    read("src/services/app-shell.service.js"),
    read("src/core/app.js"),
  ]);

  for (const methodName of ["uploadAndAttach", "uploadStreamAndAttach", "uploadBatchAndAttach", "attachExistingFile"]) {
    assert.match(
      serviceSource,
      new RegExp(`async function ${methodName}\\([^)]*\\) \\{\\s+assertFileIngressAllowed\\(\\);`),
      `${methodName} must deny before inspecting payload, permissions, metadata, quota, storage, jobs, or attachment records`,
    );
  }
  assert.match(serviceSource, /function assertFileIngressAllowed\(\) \{\s+return assertPublicDemoCapabilityAllowed\("files\.ingress"\);/);

  for (const route of ["/files", "/files/upload", "/files/upload/batch", "/files/batch", "/files/attachments"]) {
    assert.match(
      routesSource,
      new RegExp(`filesRoutes\\.post\\("${escapeRegExp(route)}"[^]*?\\{\\s+filesService\\.assertFileIngressAllowed\\(\\);`),
      `${route} must deny before JSON or multipart body parsing`,
    );
  }

  assert.match(attachmentsSource, /filesIngressAllowed: publicDemoFilesIngressAllowed\(\)/);
  assert.match(attachmentsSource, /if \(state\.filesIngressAllowed\) \{\s+children\.push\(uploadControls/);
  assert.match(attachmentsSource, /Uploads are unavailable in the public demo\. Seeded attachments remain available to view\./);
  assert.match(attachmentsSource, /if \(!state\.filesIngressAllowed \|\| !options\.targetId \|\| options\.canUpload === false\)/);
  assert.match(shellSource, /publicDemoCapability: "files\.ingress"/);
  assert.match(shellSource, /filesIngressAllowed: evaluatePublicDemoCapability\("files\.ingress"\)\.allowed/);
  assert.match(shellSource, /if \(!evaluatePublicDemoCapability\(action\.publicDemoCapability \|\| "records\.workspace"\)\.allowed\)/);

  assert.equal(getPublicDemoCapability("files.ingress").classification, "disabled");
  assert.equal(getPublicDemoCapability("files.seeded_content").classification, "read_only");
  assert.equal(getPublicDemoCapability("imports.workspace").classification, "disabled");

  const browserSources = await readBrowserSources();
  const fileInputOwners = browserSources.filter(({ source }) => /type:\s*["']file["']|<input[^>]+type=["']file["']/i.test(source));
  assert.deepEqual(fileInputOwners.map(({ relativePath }) => relativePath), ["public/js/shared/file-attachments.js"]);
  const uploadEndpointOwners = browserSources.filter(({ source }) => /\/api\/files(?:["']|\/(?:upload|batch))/.test(source));
  assert.deepEqual(uploadEndpointOwners.map(({ relativePath }) => relativePath), ["public/js/shared/file-attachments.js"]);
  assert.equal(browserSources.some(({ source }) => /clipboardData[^\n]{0,120}files|paste[^\n]{0,120}FileReader/i.test(source)), false);

  const serverSources = await readSourceFiles("src", [".js"]);
  const directIngressOwners = serverSources.filter(({ source }) => /filesService\.(?:uploadAndAttach|uploadStreamAndAttach|uploadBatchAndAttach|attachExistingFile)\(/.test(source));
  assert.deepEqual(directIngressOwners.map(({ relativePath }) => relativePath), ["src/routes/files.routes.js"]);

  assert.doesNotMatch(appSource, /\/api\/v1\/files/);
  assert.match(appSource, /app\.use\("\/api\/v1", requirePublicDemoCapability\("api_keys"\)\);/);
  assert.match(serviceSource, /async function listAttachments\(/);
  assert.match(serviceSource, /async function downloadFile\(/);
  assert.match(serviceSource, /async function readAttachmentPreviewDescriptor\(/);
  assert.match(serviceSource, /async function readAttachmentPreviewContent\(/);

  runProbe(false);
  runProbe(true);
  console.log("Public-demo Files ingress regression passed.");
} finally {
  await fixture.cleanup();
}

function runProbe(demoEnabled) {
  const result = spawnSync(process.execPath, [
    "scripts/test-support/public-demo-files-ingress-probe.mjs",
    ...(demoEnabled ? ["--demo"] : []),
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: demoEnabled ? demoEnvironment() : standardEnvironment(),
    timeout: 60_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error);
}

function demoEnvironment() {
  return {
    DEMO_MODE: "true",
    LONGTAIL_DATA_DIR: fixture.root,
    LONGTAIL_DATABASE_FILE: fixture.databaseFile,
    LONGTAIL_DEPLOYMENT_MODE: "compose",
    LONGTAIL_ENV: "production",
    LONGTAIL_FILE_SCANNER: "clamscan",
    LONGTAIL_LOCAL_STORAGE_ROOT: path.join(fixture.root, "files"),
    LONGTAIL_PUBLIC_URL: "https://demo.longtailforge.com",
    LONGTAIL_RELEASE_ARTIFACT_SHA256: "b".repeat(64),
    LONGTAIL_RELEASE_BRANCH: "main",
    LONGTAIL_RELEASE_COMMIT: "a".repeat(40),
    LONGTAIL_SECURE_NOTES_MASTER_KEY: "demo-regression-secure-notes-master-key-material",
    LONGTAIL_SESSION_COOKIE_SECURE: "true",
    SUPER_ADMIN_PASSWORD: "demo-regression-bootstrap-password",
    TRUST_PROXY: "127.0.0.1/32",
  };
}

function standardEnvironment() {
  return {
    ...process.env,
    DEMO_MODE: "false",
    LONGTAIL_DATA_DIR: fixture.root,
    LONGTAIL_DATABASE_FILE: fixture.databaseFile,
    LONGTAIL_DEPLOYMENT_MODE: "direct",
    LONGTAIL_ENV: "development",
    LONGTAIL_LOCAL_STORAGE_ROOT: path.join(fixture.root, "files"),
    LONGTAIL_PUBLIC_URL: "http://127.0.0.1",
    LONGTAIL_RELEASE_ARTIFACT_SHA256: "",
    LONGTAIL_RELEASE_BRANCH: "",
    LONGTAIL_RELEASE_COMMIT: "",
    LONGTAIL_SESSION_COOKIE_SECURE: "false",
  };
}

async function readBrowserSources() {
  return [
    ...await readSourceFiles("public/js", [".js"]),
    ...await readSourceFiles("views", [".html"]),
  ].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function readSourceFiles(directory, extensions) {
  const files = await listFiles(directory, extensions);
  return Promise.all(files.map(async (filePath) => ({
    relativePath: filePath.replaceAll("\\", "/"),
    source: await read(filePath),
  })));
}

async function listFiles(directory, extensions) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(entryPath, extensions));
    if (entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension))) files.push(entryPath);
  }
  return files.sort();
}
