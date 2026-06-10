import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { modulesService } from "../src/core/modules/modules.service.js";
import { FILE_LIFECYCLE_EVENTS } from "../src/core/files/file-lifecycle.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const modules = modulesService.listModules();
let checks = 0;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function check(name, assertion) {
  assertion();
  checks += 1;
}

check("manifest validation covers closeout contribution families", () => {
  const manifestContract = read("src/core/modules/manifest-contract.js");

  [
    "validateNotificationEvents",
    "validateNotificationTemplates",
    "validateNotificationFollowTargets",
    "validateTaggableTypes",
    "validateSearchableTypes",
    "validateAttachableTypes",
    "validateHelpContribution",
    "validateEventTypes",
  ].forEach((validatorName) => {
    assert.ok(manifestContract.includes(validatorName), `manifest contract should include ${validatorName}`);
  });
});

check("first-party modules do not own file storage or direct file download routes", () => {
  const moduleFiles = listFiles(path.join(root, "src/modules"), ".js");
  const forbiddenPatterns = [
    /createWriteStream\s*\(/,
    /fs\.(?:writeFile|mkdir|rm|rename|copyFile)/,
    /\/files\/[^"']*download/,
    /file_attachments/,
    /INSERT\s+INTO\s+files/i,
  ];

  for (const filePath of moduleFiles) {
    const source = fs.readFileSync(filePath, "utf8");
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${relative(filePath)} should not bypass framework file services`);
    }
  }
});

check("file lifecycle events remain safe canonical framework events", () => {
  const lifecycleSource = read("src/core/files/file-lifecycle.js");
  const fileService = read("src/services/files.service.js");

  assert.ok(FILE_LIFECYCLE_EVENTS.length >= 13, "file lifecycle event catalog should cover the upload/download/report/remove/delete flow");
  assert.ok(lifecycleSource.includes("sanitizeFileLifecyclePayload"), "file lifecycle payloads should be sanitized centrally");
  ["content", "contents", "data", "buffer", "path", "storagePath", "secret", "token"].forEach((blockedKey) => {
    assert.ok(lifecycleSource.includes(`"${blockedKey}"`), `lifecycle sanitizer should block ${blockedKey}`);
  });
  assert.ok(fileService.includes("emitFileLifecycleEvent"), "files service should emit lifecycle events");
  assert.ok(fileService.includes("recordFileAudit"), "files service should write audit records");
});

check("public-safe file access uses explicit visibility and permissions, not tags", () => {
  const filesMigration = read("src/db/migrations/042_add_file_framework.sql");
  const filesService = read("src/services/files.service.js");
  const decisions = read("DECISIONS.md");

  assert.ok(filesMigration.includes("visibility"), "file attachment schema should include explicit visibility");
  assert.ok(filesService.includes("normalizeVisibility"), "file service should normalize explicit visibility values");
  assert.ok(filesService.includes("permissionsService"), "file service should enforce permissions");
  assert.ok(decisions.includes("tags must not become the public/private source of truth"), "decisions should reject tag-driven file visibility");
});

check("Help content includes the 0.32 file closeout article and stays current-state oriented", () => {
  const helpService = read("src/services/help.service.js");
  const helpRegression = read("scripts/help-content-regression.mjs");

  assert.ok(helpService.includes("framework.files-attachments"), "framework Help should include Files and Attachments");
  assert.ok(helpService.includes("Protected internal files are the default."), "Files Help should document protected default");
  assert.ok(helpRegression.includes("framework.files-attachments"), "Help regression should cover Files article");
  assert.doesNotMatch(helpService, /future roadmap promises/i, "Help service content should avoid roadmap-style promises");
});

check("module contracts are ready for Notes without new file primitives", () => {
  const taskModule = modules.find((moduleDefinition) => moduleDefinition.id === "tasks");
  const closeoutDoc = read("docs/0.32-module-file-closeout.md");
  const moduleContract = read("docs/module-contract.md");
  const moduleDevelopment = read("docs/module-development.md");

  assert.ok(taskModule?.attachableTypes?.some((type) => type.targetType === "task"), "Tasks should demonstrate attachable target usage");
  assert.ok(moduleContract.includes("attachableTypes"), "module contract should document attachable declarations");
  assert.ok(moduleDevelopment.includes("LongtailForge.fileAttachments.mount()"), "module development should document browser helper");
  assert.ok(closeoutDoc.includes("Notes should be built as a first-party module"), "closeout doc should name Notes readiness");
  assert.ok(closeoutDoc.includes("should not require new file primitives"), "closeout doc should constrain 0.33 file scope");
});

check("framework-owned surfaces respect disabled-module filtering boundaries", () => {
  const moduleService = read("src/core/modules/modules.service.js");
  const helpService = read("src/services/help.service.js");
  const searchService = read("src/services/search.service.js");
  const filesService = read("src/services/files.service.js");

  assert.ok(moduleService.includes("listActiveHelpContributions"), "Help contributions should have active workspace filtering");
  assert.ok(moduleService.includes("listActiveSearchableTypes"), "Searchable types should have active workspace filtering");
  assert.ok(moduleService.includes("listActiveAttachableTypes"), "Attachable types should have active workspace filtering");
  assert.ok(helpService.includes("listVisibleContributions"), "Help service should filter visible contributions");
  assert.ok(searchService.includes("listActiveSearchableTypes"), "Search service should use active searchable types");
  assert.ok(filesService.includes("resolveAttachableType(session.workspace_id"), "Files service should resolve active attachable targets for workspace sessions");
});

function listFiles(directory, extension) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return listFiles(entryPath, extension);
    }
    if (entry.isFile() && entry.name.endsWith(extension)) {
      return [entryPath];
    }
    return [];
  });
}

function relative(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

console.log(`Module/file closeout regression passed ${checks} checks.`);
