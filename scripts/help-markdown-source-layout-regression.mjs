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
  "framework.dashboard-workbench": {
    path: "framework/dashboard-and-workbench.md",
    sourceFile: "src/services/help.service.js",
  },
  "framework.workbench-focus": {
    path: "framework/workbench-focus-and-recovery.md",
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
  "framework.tags-search": {
    path: "framework/tags-and-search.md",
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
  "framework.action-catalog": {
    path: "framework/action-catalog.md",
    sourceFile: "src/services/help.service.js",
  },
  "framework.goals": {
    path: "framework/what-do-you-want-to-do.md",
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
  "framework.administration": {
    path: "framework/administration-and-settings.md",
    sourceFile: "src/services/help.service.js",
  },
  "framework.legal-licensing": {
    path: "framework/legal-and-licensing.md",
    sourceFile: "src/services/help.service.js",
  },
  "framework.third-party-notices": {
    path: "framework/third-party-notices.md",
    sourceFile: "src/services/help.service.js",
  },
  "time-tracking.timers": {
    path: "modules/time-tracking/timers-and-saved-duration.md",
    sourceFile: "src/modules/time-tracking/module.js",
  },
  "time-tracking.actions": {
    path: "modules/time-tracking/actions.md",
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
  "tasks.actions": {
    path: "modules/tasks/actions.md",
    sourceFile: "src/modules/tasks/module.js",
  },
  "tasks.reminders-calendar": {
    path: "modules/tasks/reminders-calendar-and-subscriptions.md",
    sourceFile: "src/modules/tasks/module.js",
  },
  "notes.basics": {
    path: "modules/notes/using-notes.md",
    sourceFile: "src/modules/notes/module.help.js",
  },
  "notes.actions": {
    path: "modules/notes/actions.md",
    sourceFile: "src/modules/notes/module.help.js",
  },
  "notes.library": {
    path: "modules/notes/notes-library.md",
    sourceFile: "src/modules/notes/module.help.js",
  },
  "notes.collections": {
    path: "modules/notes/notes-collections.md",
    sourceFile: "src/modules/notes/module.help.js",
  },
  "notes.active-work": {
    path: "modules/notes/active-work.md",
    sourceFile: "src/modules/notes/module.help.js",
  },
  "notes.ongoing-areas": {
    path: "modules/notes/ongoing-areas.md",
    sourceFile: "src/modules/notes/module.help.js",
  },
  "notes.reference-library": {
    path: "modules/notes/reference-library.md",
    sourceFile: "src/modules/notes/module.help.js",
  },
  "notes.archive": {
    path: "modules/notes/archive.md",
    sourceFile: "src/modules/notes/module.help.js",
  },
  "notes.markdown": {
    path: "modules/notes/markdown.md",
    sourceFile: "src/modules/notes/module.help.js",
  },
  "notes.linking": {
    path: "modules/notes/note-linking.md",
    sourceFile: "src/modules/notes/module.help.js",
  },
  "notes.revisions": {
    path: "modules/notes/note-revisions.md",
    sourceFile: "src/modules/notes/module.help.js",
  },
  "notes.secure-notes": {
    path: "modules/notes/secure-notes.md",
    sourceFile: "src/modules/notes/module.help.js",
  },
  "notes.attachments-search": {
    path: "modules/notes/notes-files-and-search.md",
    sourceFile: "src/modules/notes/module.help.js",
  },
  "lists.basics": {
    path: "modules/lists/using-lists.md",
    sourceFile: "src/modules/lists/module.js",
  },
  "lists.actions": {
    path: "modules/lists/actions.md",
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

await check("every declared Help article is reachable exactly once and no Markdown article is orphaned", async () => {
  const toc = await fs.readFile("help/toc.md", "utf8");
  const linkedPaths = [...toc.matchAll(/\[[^\]]+\]\(([^)]+\.md)\)/g)]
    .map((match) => match[1])
    .sort();
  const descriptorPaths = Object.values(HELP_ARTICLE_SOURCES)
    .map((descriptor) => descriptor.path)
    .sort();
  const sourceFiles = [...new Set(Object.values(HELP_ARTICLE_SOURCES).map((descriptor) => descriptor.sourceFile))];
  const declaredPaths = [];

  for (const sourceFile of sourceFiles) {
    const source = await fs.readFile(sourceFile, "utf8");
    declaredPaths.push(
      ...[...source.matchAll(/contentPath:\s*"([^"]+\.md)"/g)].map((match) => match[1]),
    );
  }

  const markdownPaths = (await listMarkdownFiles("help"))
    .map((filePath) => filePath.replaceAll("\\", "/").replace(/^help\//, ""))
    .filter((filePath) => filePath !== "toc.md")
    .sort();

  assert.deepEqual(
    [...new Set(declaredPaths)].sort(),
    descriptorPaths,
    "the source-layout inventory should include every declared Help article",
  );
  assert.deepEqual(linkedPaths, descriptorPaths, "every declared Help article should appear exactly once in the ToC");
  assert.deepEqual(markdownPaths, descriptorPaths, "every Help Markdown article should be declared and reachable");
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

await check("current-state Help rejects known pre-0.33.25 drift", async () => {
  const helpFiles = await listMarkdownFiles("help");
  const helpText = (await Promise.all(helpFiles.map((filePath) => fs.readFile(filePath, "utf8")))).join("\n");
  const settings = await fs.readFile("help/framework/settings-and-user-preferences.md", "utf8");
  const files = await fs.readFile("help/framework/files-and-attachments.md", "utf8");
  const collections = await fs.readFile("help/modules/notes/notes-collections.md", "utf8");
  const secureNotes = await fs.readFile("help/modules/notes/secure-notes.md", "utf8");

  assert.doesNotMatch(helpText, /\bBrowse Summary\b|\bselected-file detail\b|\binline Preview panel\b/i);
  assert.doesNotMatch(helpText, /calendar subscriptions? (?:live|are managed) (?:in|under) User Settings/i);
  assert.doesNotMatch(helpText, /tags? (?:grant|control|determine) permissions?/i);
  assert.match(settings, /workspace administration credentials, not User Settings preferences/);
  assert.match(files, /The Files page under .* is a compact recovery and audit listing/);
  assert.match(collections, /does not add inherited security/);
  assert.match(secureNotes, /Security is currently selected on the note itself/);
});

console.log(`Help Markdown source layout regression passed ${checks} checks.`);

/** @param {string} name @param {() => void | Promise<void>} assertion */
async function check(name, assertion) {
  await assertion();
  checks += 1;
}

/** @param {string} source @param {string} articleId @returns {string} */
function findArticleBlock(source, articleId) {
  const escapedId = escapeRegex(articleId);
  const match = source.match(new RegExp(`\\{\\s*id:\\s*"${escapedId}"[\\s\\S]*?\\n\\s*\\},`));
  assert.ok(match, `${articleId} should be declared`);
  return match[0];
}

/** @param {string} articleBlock @param {string} articleId @returns {string} */
function readContentPath(articleBlock, articleId) {
  const pathMatch = articleBlock.match(/contentPath:\s*"([^"]+)"/);
  assert.ok(pathMatch, `${articleId} should declare contentPath`);
  return pathMatch[1];
}

/** @param {string} value @returns {string} */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** @param {string} directory @returns {Promise<string[]>} */
async function listMarkdownFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listMarkdownFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }

  return files;
}
