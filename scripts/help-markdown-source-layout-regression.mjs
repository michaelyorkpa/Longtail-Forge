import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const HELP_ARTICLE_SOURCES = Object.freeze({
  "framework.help-center": {
    path: "framework/help-center.md",
    sourceFile: "src/services/help.service.js",
  },
  "framework.getting-started": {
    path: "framework/getting-started.md",
    sourceFile: "src/services/help.service.js",
  },
  "framework.workspaces": {
    path: "framework/workspaces-and-switching.md",
    sourceFile: "src/services/help.service.js",
  },
  "framework.users-permissions": {
    path: "framework/users-roles-and-permissions.md",
    sourceFile: "src/services/help.service.js",
  },
  "framework.clients-projects": {
    path: "framework/clients-and-projects.md",
    sourceFile: "src/services/help.service.js",
  },
  "framework.time-tracking": {
    path: "framework/time-tracking-basics.md",
    sourceFile: "src/services/help.service.js",
  },
  "framework.tasks": {
    path: "framework/tasks-basics.md",
    sourceFile: "src/services/help.service.js",
  },
  "framework.notifications": {
    path: "framework/notifications.md",
    sourceFile: "src/services/help.service.js",
  },
  "framework.tags": {
    path: "framework/tags.md",
    sourceFile: "src/services/help.service.js",
  },
  "framework.search": {
    path: "framework/search.md",
    sourceFile: "src/services/help.service.js",
  },
  "framework.files-attachments": {
    path: "framework/files-and-attachments.md",
    sourceFile: "src/services/help.service.js",
  },
  "framework.settings": {
    path: "framework/settings-and-user-preferences.md",
    sourceFile: "src/services/help.service.js",
  },
  "framework.modules": {
    path: "framework/modules-and-optional-features.md",
    sourceFile: "src/services/help.service.js",
  },
  "time-tracking.timers": {
    path: "modules/time-tracking/timers-and-saved-duration.md",
    sourceFile: "src/modules/time-tracking/module.js",
  },
  "time-tracking.entries-corrections": {
    path: "modules/time-tracking/time-entries-and-corrections.md",
    sourceFile: "src/modules/time-tracking/module.js",
  },
  "tasks.resume-context": {
    path: "modules/tasks/resuming-task-work.md",
    sourceFile: "src/modules/tasks/module.js",
  },
  "notes.basics": {
    path: "modules/notes/using-notes.md",
    sourceFile: "src/modules/notes/module.js",
  },
  "notes.library": {
    path: "modules/notes/notes-library.md",
    sourceFile: "src/modules/notes/module.js",
  },
  "notes.collections": {
    path: "modules/notes/notes-collections.md",
    sourceFile: "src/modules/notes/module.js",
  },
  "notes.active-work": {
    path: "modules/notes/active-work.md",
    sourceFile: "src/modules/notes/module.js",
  },
  "notes.ongoing-areas": {
    path: "modules/notes/ongoing-areas.md",
    sourceFile: "src/modules/notes/module.js",
  },
  "notes.reference-library": {
    path: "modules/notes/reference-library.md",
    sourceFile: "src/modules/notes/module.js",
  },
  "notes.archive": {
    path: "modules/notes/archive.md",
    sourceFile: "src/modules/notes/module.js",
  },
  "notes.markdown": {
    path: "modules/notes/markdown.md",
    sourceFile: "src/modules/notes/module.js",
  },
  "notes.linking": {
    path: "modules/notes/note-linking.md",
    sourceFile: "src/modules/notes/module.js",
  },
  "notes.revisions": {
    path: "modules/notes/note-revisions.md",
    sourceFile: "src/modules/notes/module.js",
  },
  "notes.secure-notes": {
    path: "modules/notes/secure-notes.md",
    sourceFile: "src/modules/notes/module.js",
  },
  "notes.attachments-search": {
    path: "modules/notes/notes-files-and-search.md",
    sourceFile: "src/modules/notes/module.js",
  },
  "lists.basics": {
    path: "modules/lists/using-lists.md",
    sourceFile: "src/modules/lists/module.js",
  },
  "lists.items": {
    path: "modules/lists/list-items-and-progress.md",
    sourceFile: "src/modules/lists/module.js",
  },
  "lists.statuses": {
    path: "modules/lists/list-statuses.md",
    sourceFile: "src/modules/lists/module.js",
  },
  "lists.reusable": {
    path: "modules/lists/reusable-lists-and-suggestions.md",
    sourceFile: "src/modules/lists/module.js",
  },
  "lists.business-context": {
    path: "modules/lists/business-project-and-client-context.md",
    sourceFile: "src/modules/lists/module.js",
  },
  "lists.links": {
    path: "modules/lists/linked-records.md",
    sourceFile: "src/modules/lists/module.js",
  },
  "lists.search-tags-files": {
    path: "modules/lists/search-tags-and-files.md",
    sourceFile: "src/modules/lists/module.js",
  },
  "lists.resume-context": {
    path: "modules/lists/resuming-list-work.md",
    sourceFile: "src/modules/lists/module.js",
  },
});

let checks = 0;

await check("toc default directive and links point to Markdown Help files", async () => {
  const toc = await fs.readFile("help/toc.md", "utf8");
  const defaultDirective = toc.match(/^default:\s*(\S+)\s*$/m);
  assert.ok(defaultDirective, "help/toc.md should declare an explicit default article");
  assert.equal(defaultDirective[1], "framework/help-center.md");

  const linkedPaths = [...toc.matchAll(/\[[^\]]+\]\(([^)]+\.md)\)/g)].map((match) => match[1]);
  const uniqueLinkedPaths = new Set(linkedPaths);

  assert.equal(uniqueLinkedPaths.size, linkedPaths.length, "toc article links should be unique");
  assert.ok(uniqueLinkedPaths.has(defaultDirective[1]), "default article should be linked in the ToC");

  for (const linkedPath of linkedPaths) {
    assert.ok(!path.isAbsolute(linkedPath), `${linkedPath} should be relative`);
    assert.ok(!linkedPath.includes(".."), `${linkedPath} should not escape the Help root`);
    await fs.access(path.join("help", ...linkedPath.split("/")));
  }
});

await check("every converted Help article has contentPath metadata and a Markdown file", async () => {
  for (const [articleId, descriptor] of Object.entries(HELP_ARTICLE_SOURCES)) {
    const source = await fs.readFile(descriptor.sourceFile, "utf8");
    const articleBlock = findArticleBlock(source, articleId);
    const contentPath = readContentPath(articleBlock, articleId);
    const markdown = await fs.readFile(path.join("help", ...descriptor.path.split("/")), "utf8");

    assert.equal(contentPath, descriptor.path, `${articleId} should point at its Markdown source`);
    assert.doesNotMatch(articleBlock, /\n\s*body:\s*"/, `${articleId} should use Markdown source instead of inline body`);
    assert.ok(markdown.trim().length >= 60, `${articleId} Markdown should contain article body content`);
  }
});

console.log(`Help Markdown source layout regression passed ${checks} checks.`);

async function check(name, assertion) {
  await assertion();
  checks += 1;
}

function findArticleBlock(source, articleId) {
  const escapedId = escapeRegex(articleId);
  const match = source.match(new RegExp(`\\{\\s*id:\\s*"${escapedId}"[\\s\\S]*?\\n\\s*\\},`));
  assert.ok(match, `${articleId} should be declared`);
  return match[0];
}

function readContentPath(articleBlock, articleId) {
  const pathMatch = articleBlock.match(/contentPath:\s*"([^"]+)"/);
  assert.ok(pathMatch, `${articleId} should declare contentPath`);
  return pathMatch[1];
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
