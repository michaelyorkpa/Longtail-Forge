// @ts-check

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "../config.js";
import { modulesService } from "../core/modules/modules.service.js";
import { markdownToPlainText, renderMarkdownToHtml } from "../core/markdown/markdown.service.js";
import { db } from "../core/database.js";
import { validateHelpContribution } from "../core/modules/manifest-contract.js";
import { AppError } from "../utils/app-error.js";
import { correspondingSourceUrl, trackedSourceUrl } from "../core/corresponding-source.js";

/** @typedef {import("../types/help-static-contracts.js").HelpArticle} HelpArticle */
/** @typedef {import("../types/help-static-contracts.js").HelpArticleDetailPayload} HelpArticleDetailPayload */
/** @typedef {import("../types/help-static-contracts.js").HelpArticleListPayload} HelpArticleListPayload */
/** @typedef {import("../types/help-static-contracts.js").HelpContribution} HelpContribution */
/** @typedef {import("../types/help-static-contracts.js").HelpListResponse} HelpListResponse */
/** @typedef {import("../types/help-static-contracts.js").HelpNavigation} HelpNavigation */
/** @typedef {import("../types/help-static-contracts.js").HelpNavigationItem} HelpNavigationItem */
/** @typedef {import("../types/help-static-contracts.js").HelpRequestSession} HelpRequestSession */
/** @typedef {import("../types/help-static-contracts.js").HelpReadResponse} HelpReadResponse */
/** @typedef {import("../types/help-static-contracts.js").HelpSearchDocument} HelpSearchDocument */
/** @typedef {import("../types/help-static-contracts.js").HelpSearchIndexOptions} HelpSearchIndexOptions */
/** @typedef {import("../types/help-static-contracts.js").HelpSection} HelpSection */
/** @typedef {import("../types/help-static-contracts.js").HelpSectionPayload} HelpSectionPayload */
/** @typedef {import("../types/help-static-contracts.js").HydratedHelpArticle} HydratedHelpArticle */
/** @typedef {import("../types/help-static-contracts.js").HydratedHelpContribution} HydratedHelpContribution */
/** @typedef {import("../types/framework-contracts.js").SearchableTypeContribution} SearchableTypeContribution */

const HELP_SEARCH_INDEXER_ID = "framework.help-articles";
const HELP_SEARCH_RECORD_TYPE = "help_article";
const HELP_SEARCH_SOURCE = "Help";
const FRAMEWORK_HELP_MODULE_ID = "framework";
const HELP_CONTENT_ROOT = fileURLToPath(new URL("../../help/", import.meta.url));
const HELP_TOC_PATH = path.join(HELP_CONTENT_ROOT, "toc.md");
const THIRD_PARTY_NOTICES_PATH = fileURLToPath(new URL("../../THIRD_PARTY_NOTICES.md", import.meta.url));

/** @type {HelpSection} */
const FRAMEWORK_HELP_SECTION = {
  id: "framework.help-center",
  ownerType: "framework",
  title: "Longtail Forge",
  description: "Framework-owned Longtail Forge help.",
  sortOrder: 0,
  audience: "all",
  tags: ["framework", "help"],
};

/** @type {HelpArticle[]} */
const FRAMEWORK_HELP_ARTICLES = [
    {
      id: "framework.help-center",
      slug: "help-center",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Help Center",
      summary: "Find framework and module help articles for the active workspace.",
      contentPath: "framework/help-center.md",
      sortOrder: 0,
      audience: "all",
      tags: ["framework", "help"],
      relatedArticleIds: ["framework.getting-started", "framework.search"],
    },
    {
      id: "framework.getting-started",
      slug: "getting-started",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Getting Started",
      summary: "Start with the Dashboard, navigation, and active workspace context.",
      contentPath: "framework/getting-started.md",
      sortOrder: 10,
      audience: "all",
      tags: ["framework", "getting-started", "dashboard"],
      relatedArticleIds: ["framework.dashboard-workbench", "framework.workbench-focus", "framework.search"],
    },
    {
      id: "framework.dashboard-workbench",
      slug: "dashboard-and-workbench",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Dashboard and Workbench",
      summary: "Choose between workspace overview and live, resumable work.",
      contentPath: "framework/dashboard-and-workbench.md",
      sortOrder: 12,
      audience: "all",
      tags: ["framework", "dashboard", "workbench", "overview"],
      relatedArticleIds: ["framework.workbench-focus", "framework.getting-started", "framework.notifications"],
    },
    {
      id: "framework.workbench-focus",
      slug: "workbench-focus-and-recovery",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Workbench Focus and Recovery",
      summary: "Understand each focus choice, recommendation ordering, and resume-safe handoff.",
      contentPath: "framework/workbench-focus-and-recovery.md",
      sortOrder: 14,
      audience: "all",
      tags: ["framework", "workbench", "focus", "resume work", "recovery"],
      relatedArticleIds: ["framework.dashboard-workbench", "framework.goals", "framework.action-catalog"],
    },
    {
      id: "framework.workspaces",
      slug: "workspaces-and-switching",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Workspaces and Workspace Switching",
      summary: "Understand active workspace scope and workspace switching.",
      contentPath: "framework/workspaces-and-switching.md",
      sortOrder: 20,
      audience: "all",
      tags: ["framework", "workspaces", "settings"],
      relatedArticleIds: ["framework.modules", "framework.users-permissions", "framework.settings"],
    },
    {
      id: "framework.users-permissions",
      slug: "users-roles-and-permissions",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Users, Roles, and Permissions",
      summary: "Review how users, role assignments, and scoped access work.",
      contentPath: "framework/users-roles-and-permissions.md",
      sortOrder: 30,
      audience: "all",
      tags: ["framework", "users", "permissions"],
      relatedArticleIds: ["framework.workspaces", "framework.settings"],
    },
    {
      id: "framework.clients-projects",
      slug: "clients-and-projects",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Clients and Projects",
      summary: "Use clients and projects for work structure and billing context.",
      contentPath: "framework/clients-and-projects.md",
      sortOrder: 40,
      audience: "all",
      tags: ["framework", "clients", "projects"],
      relatedArticleIds: ["framework.time-tracking", "framework.tasks", "framework.tags"],
    },
    {
      id: "framework.time-tracking",
      slug: "time-tracking-basics",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Time Tracking Basics",
      summary: "Use the first-party Time Tracking module for timers and saved time entries.",
      contentPath: "framework/time-tracking-basics.md",
      sortOrder: 50,
      audience: "all",
      tags: ["framework", "time-tracking", "timers"],
      relatedArticleIds: ["framework.clients-projects", "framework.settings"],
    },
    {
      id: "framework.tasks",
      slug: "tasks-basics",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Tasks Basics",
      summary: "Use the first-party Tasks module to create, assign, filter, complete, archive, and time tasks.",
      contentPath: "framework/tasks-basics.md",
      sortOrder: 60,
      audience: "all",
      tags: ["framework", "tasks", "workbench"],
      relatedArticleIds: ["framework.time-tracking", "framework.clients-projects"],
    },
    {
      id: "framework.notifications",
      slug: "notifications",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Notifications",
      summary: "Use the notification bell and notification preferences.",
      contentPath: "framework/notifications.md",
      sortOrder: 70,
      audience: "all",
      tags: ["framework", "notifications"],
      relatedArticleIds: ["framework.dashboard-workbench", "framework.settings", "framework.modules"],
    },
    {
      id: "framework.tags",
      slug: "tags",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Tags",
      summary: "Classify supported records with workspace tags.",
      contentPath: "framework/tags.md",
      sortOrder: 80,
      audience: "all",
      tags: ["framework", "tags", "search"],
      relatedArticleIds: ["framework.tags-search", "framework.search", "framework.clients-projects"],
    },
    {
      id: "framework.tags-search",
      slug: "tags-and-search",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Tags and Search",
      summary: "Understand classification, recovery, indexing, and permission-shaped results.",
      contentPath: "framework/tags-and-search.md",
      sortOrder: 85,
      audience: "all",
      tags: ["framework", "tags", "search", "recovery"],
      relatedArticleIds: ["framework.tags", "framework.search", "framework.workbench-focus"],
    },
    {
      id: "framework.search",
      slug: "search",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Search",
      summary: "Search indexed records and Help articles from the shared app shell.",
      contentPath: "framework/search.md",
      sortOrder: 90,
      audience: "all",
      tags: ["framework", "search", "help"],
      relatedArticleIds: ["framework.tags-search", "framework.help-center", "framework.tags"],
    },
    {
      id: "framework.files-attachments",
      slug: "files-and-attachments",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Files and Attachments",
      summary: "Attach files to supported records and browse visible workspace attachments.",
      contentPath: "framework/files-and-attachments.md",
      sortOrder: 95,
      audience: "all",
      tags: ["framework", "files", "attachments"],
      relatedArticleIds: ["framework.tasks", "framework.search", "framework.modules"],
    },
    {
      id: "framework.action-catalog",
      slug: "action-catalog",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Action Catalog",
      summary: "Find app-wide actions, their purpose, and where they appear.",
      contentPath: "framework/action-catalog.md",
      sortOrder: 97,
      audience: "all",
      tags: ["framework", "actions", "quick actions", "workbench"],
      relatedArticleIds: ["framework.goals", "framework.files-attachments", "framework.clients-projects"],
    },
    {
      id: "framework.goals",
      slug: "what-do-you-want-to-do",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "What Do You Want to Do?",
      summary: "Start with a goal and follow the shortest route to the right workflow.",
      contentPath: "framework/what-do-you-want-to-do.md",
      sortOrder: 98,
      audience: "all",
      tags: ["framework", "goals", "next action", "how to"],
      relatedArticleIds: ["framework.action-catalog", "framework.administration", "framework.getting-started"],
    },
    {
      id: "framework.settings",
      slug: "settings-and-user-preferences",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Settings and User Preferences",
      summary: "Find user preferences, workspace settings, module settings, audit logs, and Help.",
      contentPath: "framework/settings-and-user-preferences.md",
      sortOrder: 100,
      audience: "all",
      tags: ["framework", "settings", "preferences"],
      relatedArticleIds: ["framework.users-permissions", "framework.modules", "framework.help-center"],
    },
    {
      id: "framework.administration",
      slug: "administration-and-settings",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Administration and Settings",
      summary: "Route user preferences, users, roles, workspaces, modules, and module settings to the right administration page.",
      contentPath: "framework/administration-and-settings.md",
      sortOrder: 105,
      audience: "all",
      tags: ["framework", "administration", "settings", "roles", "modules"],
      relatedArticleIds: ["framework.settings", "framework.users-permissions", "framework.modules"],
    },
    {
      id: "framework.modules",
      slug: "modules-and-optional-features",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Modules and Optional Features",
      summary: "Understand enabled modules and module-owned Help contributions.",
      contentPath: "framework/modules-and-optional-features.md",
      sortOrder: 110,
      audience: "all",
      tags: ["framework", "modules", "help"],
      relatedArticleIds: ["framework.workspaces", "framework.help-center", "framework.search"],
    },
    {
      id: "framework.legal-licensing",
      slug: "legal-and-licensing",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Legal and Licensing",
      summary: "Review the running version, source rights, warranty, third-party notices, and trademark policy.",
      contentPath: "framework/legal-and-licensing.md",
      sortOrder: 120,
      audience: "all",
      tags: ["framework", "legal", "licensing", "source", "trademark"],
      relatedArticleIds: ["framework.third-party-notices", "framework.help-center"],
    },
    {
      id: "framework.third-party-notices",
      slug: "third-party-notices",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Third-Party Notices",
      summary: "Review the tracked license notices for production dependencies and bundled assets.",
      contentPath: "framework/third-party-notices.md",
      sortOrder: 130,
      audience: "all",
      tags: ["framework", "legal", "licensing", "third-party"],
      relatedArticleIds: ["framework.legal-licensing"],
    },
];

/** @type {HelpContribution} */
const FRAMEWORK_HELP_CONTRIBUTION = {
  sections: [FRAMEWORK_HELP_SECTION],
  articles: FRAMEWORK_HELP_ARTICLES,
};

const frameworkHelpValidation = validateHelpContribution(FRAMEWORK_HELP_CONTRIBUTION, {
  ownerType: "framework",
  ownerId: "framework",
  fieldName: "frameworkHelp",
  errors: [],
});

if (frameworkHelpValidation.length > 0) {
  throw new Error(`Invalid framework Help configuration:\n- ${frameworkHelpValidation.join("\n- ")}`);
}

/** @param {HelpRequestSession} session @returns {Promise<HelpListResponse>} */
async function list(session) {
  const contribution = await listVisibleContributions(session);
  const navigation = await buildHelpNavigation(contribution);

  return {
    sections: contribution.sections.map(sectionPayload),
    articles: contribution.articles.map(articleListPayload),
    defaultArticleId: navigation.defaultArticle?.id || "",
    defaultArticleSlug: navigation.defaultArticle?.slug || "",
    navigation: navigation.items,
  };
}

/** @param {HelpRequestSession} session @param {unknown} articleIdOrSlug @returns {Promise<HelpReadResponse>} */
async function readArticle(session, articleIdOrSlug) {
  const lookup = String(articleIdOrSlug || "").trim();

  if (!lookup) {
    throw new AppError("Help article ID or slug is required.", 400);
  }

  const contribution = await listVisibleContributions(session);
  const article = contribution.articles.find((candidate) => (
    candidate.id === lookup || candidate.slug === lookup
  ));

  if (!article) {
    throw new AppError("Help article not found.", 404);
  }

  const section = contribution.sections.find((candidate) => candidate.id === article.sectionId) || null;

  return {
    article: articleDetailPayload(article, section),
  };
}

/** @param {HelpRequestSession} session @param {unknown} articleId @returns {Promise<boolean>} */
async function canReadIndexedArticle(session, articleId) {
  if (!articleId) {
    return false;
  }

  const contribution = await listVisibleContributions(session);
  return contribution.articles.some((article) => article.id === articleId);
}

/** @returns {SearchableTypeContribution[]} */
function listSearchableTypes() {
  const ownerModuleIds = new Set([FRAMEWORK_HELP_MODULE_ID]);

  for (const article of modulesService.listHelpArticles()) {
    if (article.moduleId) {
      ownerModuleIds.add(article.moduleId);
    }
  }

  return [...ownerModuleIds].sort().map(helpSearchableType);
}

/** @param {string} workspaceId @returns {Promise<SearchableTypeContribution[]>} */
async function listActiveSearchableTypes(workspaceId) {
  if (!(await workspaceExists(workspaceId))) {
    return [];
  }

  const contribution = await listIndexableContributions(workspaceId);
  const ownerModuleIds = new Set(contribution.articles.map(searchModuleIdForArticle));

  return [...ownerModuleIds].sort().map(helpSearchableType);
}

/** @param {string} workspaceId @param {HelpSearchIndexOptions} [options] @returns {Promise<HelpSearchDocument[]>} */
async function listSearchIndexDocuments(workspaceId, options = {}) {
  const contribution = await listIndexableContributions(workspaceId);
  const declarationModuleId = String(options.moduleId || options.module_id || "").trim();
  const recordId = String(options.recordId || options.record_id || "").trim();
  const sectionsById = new Map(contribution.sections.map((section) => [section.id, section]));

  return contribution.articles
    .filter((article) => !declarationModuleId || searchModuleIdForArticle(article) === declarationModuleId)
    .filter((article) => !recordId || article.id === recordId || article.slug === recordId)
    .map((article) => articleSearchDocument(
      workspaceId,
      article,
      article.sectionId ? sectionsById.get(article.sectionId) || null : null,
    ));
}

/** @param {HelpRequestSession} session @returns {Promise<HydratedHelpContribution>} */
async function listVisibleContributions(session) {
  const listActiveHelpContributions = /** @type {(workspaceId: string, session: HelpRequestSession | null) => Promise<HelpContribution>} */ (
    modulesService.listActiveHelpContributions
  );
  const moduleContributions = await listActiveHelpContributions(
    session.workspace_id,
    session,
  );
  const sections = [
    ...FRAMEWORK_HELP_CONTRIBUTION.sections.map((section) => normalizeFrameworkItem(section)),
    ...moduleContributions.sections,
  ];
  const articles = [
    ...FRAMEWORK_HELP_CONTRIBUTION.articles.map((article) => normalizeFrameworkItem(article)),
    ...moduleContributions.articles,
  ];

  return hydrateHelpContribution({
    sections: sections
      .map(decorateHelpItem)
      .sort(sortHelpItems),
    articles: articles
      .map(decorateHelpItem)
      .sort(sortHelpItems),
  });
}

/** @param {string} workspaceId @returns {Promise<HydratedHelpContribution>} */
async function listIndexableContributions(workspaceId) {
  const listActiveHelpContributions = /** @type {(workspaceId: string, session: HelpRequestSession | null) => Promise<HelpContribution>} */ (
    modulesService.listActiveHelpContributions
  );
  const moduleContributions = await listActiveHelpContributions(workspaceId, null);
  const sections = [
    ...FRAMEWORK_HELP_CONTRIBUTION.sections.map((section) => normalizeFrameworkItem(section)),
    ...moduleContributions.sections,
  ];
  const articles = [
    ...FRAMEWORK_HELP_CONTRIBUTION.articles.map((article) => normalizeFrameworkItem(article)),
    ...moduleContributions.articles,
  ];

  return hydrateHelpContribution({
    sections: sections.map(decorateHelpItem).sort(sortHelpItems),
    articles: articles.map(decorateHelpItem).sort(sortHelpItems),
  });
}

/** @param {string} moduleId @returns {SearchableTypeContribution} */
function helpSearchableType(moduleId) {
  return {
    recordType: HELP_SEARCH_RECORD_TYPE,
    moduleId,
    label: "Help",
    description: "Framework and active module Help Center articles.",
    idField: "id",
    titleField: "title",
    summaryField: "summary",
    bodyFields: ["body", "sectionTitle", "ownerLabel", "tagsText"],
    workspaceField: "workspace_id",
    requiredReadPermission: "help.view",
    indexer: HELP_SEARCH_INDEXER_ID,
    sourceLabel: HELP_SEARCH_SOURCE,
  };
}

/** @param {string} workspaceId @param {HydratedHelpArticle} article @param {HelpSection | null} section @returns {HelpSearchDocument} */
function articleSearchDocument(workspaceId, article, section) {
  const moduleId = searchModuleIdForArticle(article);
  const sectionTitle = section?.title || "";
  const ownerLabel = article.sourceLabel || (moduleId === FRAMEWORK_HELP_MODULE_ID ? "Framework" : moduleId);
  const tags = normalizeTags(article.tags);
  const articleText = markdownToPlainText(article.body || "");
  const body = [
    articleText,
    article.summary || article.description,
    sectionTitle,
    ownerLabel,
  ].filter(Boolean).join("\n");

  return {
    workspace_id: workspaceId,
    module_id: moduleId,
    record_type: HELP_SEARCH_RECORD_TYPE,
    id: article.id,
    title: article.title,
    summary: article.summary || article.description || sectionTitle || "",
    body,
    sectionTitle,
    ownerLabel,
    tagsText: tags.join(" "),
    tags_text: tags.join(" "),
    search_status: "active",
    source: HELP_SEARCH_SOURCE,
    record_created_at: "",
    record_updated_at: "",
  };
}

/** @param {HelpContribution} contribution @returns {Promise<HydratedHelpContribution>} */
async function hydrateHelpContribution(contribution) {
  assertUniqueContentPaths(contribution.articles);

  return {
    ...contribution,
    articles: await Promise.all(contribution.articles.map(hydrateHelpArticle)),
  };
}

/** @param {HydratedHelpContribution} contribution @returns {Promise<HelpNavigation>} */
async function buildHelpNavigation(contribution) {
  const toc = await readHelpToc();
  const articlesByPath = new Map();
  const usedArticleIds = new Set();
  const items = toc ? parseHelpToc(toc) : [];
  const filteredItems = filterNavigationItems(items, contribution, articlesByPath, usedArticleIds);
  const fallbackItems = fallbackNavigationItems(contribution.articles, usedArticleIds);
  const defaultArticle = resolveDefaultArticle(toc, contribution, articlesByPath, filteredItems, fallbackItems);

  return {
    defaultArticle,
    items: fallbackItems.length > 0
      ? [...filteredItems, fallbackNavigationGroup(fallbackItems)]
      : filteredItems,
  };
}

/** @returns {Promise<string>} */
async function readHelpToc() {
  try {
    return await fs.readFile(HELP_TOC_PATH, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

/** @param {string} toc @returns {HelpNavigationItem[]} */
function parseHelpToc(toc) {
  /** @type {HelpNavigationItem & { depth: number }} */
  const root = { children: [], depth: 0, title: "", type: "group" };
  const stack = [root];

  for (const rawLine of String(toc || "").split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || /^default\s*:/i.test(line)) {
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const depth = heading[1].length;
      const item = tocGroupItem(heading[2].trim(), depth);

      while (stack.length > 1 && (stack.at(-1)?.depth || 0) >= depth) {
        stack.pop();
      }
      stack.at(-1)?.children.push(item);
      stack.push(item);
      continue;
    }

    const link = line.match(/^[-*]\s+\[([^\]]+)]\(([^)]+\.md)\)\s*$/i);
    if (link) {
      stack.at(-1)?.children.push({
        articlePath: normalizeHelpContentPath(link[2]),
        children: [],
        title: link[1].trim(),
        type: "article",
      });
    }
  }

  return root.children;
}

/** @param {string} text @param {number} depth @returns {HelpNavigationItem & { depth: number }} */
function tocGroupItem(text, depth) {
  const link = text.match(/^\[([^\]]+)]\(([^)]+\.md)\)$/i);

  return {
    articlePath: link ? normalizeHelpContentPath(link[2]) : "",
    children: [],
    depth,
    title: link ? link[1].trim() : text.replace(/#+$/, "").trim(),
    type: "group",
  };
}

/**
 * @param {HelpNavigationItem[]} items
 * @param {HydratedHelpContribution} contribution
 * @param {Map<string, HydratedHelpArticle>} articlesByPath
 * @param {Set<string>} usedArticleIds
 * @returns {HelpNavigationItem[]}
 */
function filterNavigationItems(items, contribution, articlesByPath, usedArticleIds) {
  const visibleArticlesByPath = new Map();

  for (const article of contribution.articles) {
    const contentPath = normalizeHelpContentPath(article.contentPath || "");

    if (contentPath) {
      visibleArticlesByPath.set(contentPath, article);
      articlesByPath.set(contentPath, article);
    }
  }

  return items
    .map((item) => filterNavigationItem(item, visibleArticlesByPath, usedArticleIds))
    .filter((item) => item !== null);
}

/**
 * @param {HelpNavigationItem} item
 * @param {Map<string, HydratedHelpArticle>} visibleArticlesByPath
 * @param {Set<string>} usedArticleIds
 * @returns {HelpNavigationItem | null}
 */
function filterNavigationItem(item, visibleArticlesByPath, usedArticleIds) {
  const article = item.articlePath ? visibleArticlesByPath.get(item.articlePath) : null;
  const children = (item.children || [])
    .map((child) => filterNavigationItem(child, visibleArticlesByPath, usedArticleIds))
    .filter((item) => item !== null);

  if (item.type === "article") {
    if (!article) {
      return null;
    }
    usedArticleIds.add(article.id);
    return navigationArticleItem(article, item.title);
  }

  if (article) {
    usedArticleIds.add(article.id);
  }

  if (!article && children.length === 0) {
    return null;
  }

  return {
    ...(article ? articleNavigationFields(article) : {}),
    children,
    title: item.title || article?.title || "Help",
    type: "group",
  };
}

/** @param {HydratedHelpArticle[]} articles @param {Set<string>} usedArticleIds @returns {HelpNavigationItem[]} */
function fallbackNavigationItems(articles, usedArticleIds) {
  return articles
    .filter((article) => !usedArticleIds.has(article.id))
    .sort(sortHelpItems)
    .map((article) => navigationArticleItem(article));
}

/** @param {HelpNavigationItem[]} children @returns {HelpNavigationItem} */
function fallbackNavigationGroup(children) {
  return {
    children,
    title: "Other",
    type: "group",
  };
}

/**
 * @param {string} toc
 * @param {HydratedHelpContribution} contribution
 * @param {Map<string, HydratedHelpArticle>} articlesByPath
 * @param {HelpNavigationItem[]} navigationItems
 * @param {HelpNavigationItem[]} fallbackItems
 * @returns {HydratedHelpArticle | HelpNavigationItem | null}
 */
function resolveDefaultArticle(toc, contribution, articlesByPath, navigationItems, fallbackItems) {
  const defaultPath = String(toc || "").match(/^default:\s*(\S+)\s*$/im)?.[1] || "";
  const defaultArticle = defaultPath ? articlesByPath.get(normalizeHelpContentPath(defaultPath)) : null;

  return defaultArticle ||
    contribution.articles.find((article) => article.id === "framework.help-center") ||
    contribution.articles.find((article) => article.id === "framework.getting-started") ||
    firstNavigationArticle(navigationItems) ||
    firstNavigationArticle(fallbackItems) ||
    contribution.articles[0] ||
    null;
}

/** @param {HelpNavigationItem[]} items @returns {HelpNavigationItem | null} */
function firstNavigationArticle(items) {
  for (const item of items || []) {
    if (item.type === "article" && item.id) {
      return item;
    }
    const child = firstNavigationArticle(item.children || []);
    if (child) {
      return child;
    }
  }
  return null;
}

/** @param {HelpArticle} article @param {string} [title] @returns {HelpNavigationItem} */
function navigationArticleItem(article, title = "") {
  return {
    ...articleNavigationFields(article),
    children: [],
    title: title || article.title,
    type: "article",
  };
}

/** @param {HelpArticle} article */
function articleNavigationFields(article) {
  return {
    id: article.id,
    moduleId: article.moduleId || "",
    ownerType: article.ownerType || "module",
    slug: article.slug || "",
    sourceLabel: article.sourceLabel || "",
  };
}

/** @param {HelpArticle} article @returns {Promise<HydratedHelpArticle>} */
async function hydrateHelpArticle(article) {
  return {
    ...article,
    body: await readHelpArticleBody(article),
  };
}

/** @param {HelpArticle} article @returns {Promise<string>} */
async function readHelpArticleBody(article) {
  const contentPath = String(article.contentPath || "").trim();

  if (!contentPath) {
    return article.body || "";
  }

  const absolutePath = resolveHelpContentPath(contentPath, article.id);

  try {
    const body = await fs.readFile(absolutePath, "utf8");
    const hydrated = await hydrateTrackedLegalContent(article, body);
    return hydrated;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new AppError(`Help article content file is missing for '${article.id}'.`, 500);
    }
    throw error;
  }
}

/** @param {HelpArticle} article @param {string} body @returns {Promise<string>} */
async function hydrateTrackedLegalContent(article, body) {
  if (article.id === "framework.third-party-notices") {
    return fs.readFile(THIRD_PARTY_NOTICES_PATH, "utf8");
  }

  if (article.id !== "framework.legal-licensing") {
    return body;
  }

  const replacements = new Map([
    ["{{APP_NAME}}", config.appName],
    ["{{APP_DISPLAY_VERSION}}", config.appDisplayVersion],
    ["{{APP_CANONICAL_VERSION}}", config.appVersion],
    ["{{CORRESPONDING_SOURCE_URL}}", correspondingSourceUrl()],
    ["{{LICENSE_URL}}", trackedSourceUrl("LICENSE")],
    ["{{TRADEMARK_POLICY_URL}}", trackedSourceUrl("docs/licensing/trademark-policy.md")],
    ["{{THIRD_PARTY_NOTICES_URL}}", "./help.html?article=framework.third-party-notices"],
  ]);

  let hydrated = body;
  for (const [token, value] of replacements) {
    hydrated = hydrated.replaceAll(token, value);
  }
  return hydrated;
}

/** @param {HelpArticle[]} articles */
function assertUniqueContentPaths(articles) {
  const seen = new Map();

  for (const article of articles) {
    const contentPath = normalizeHelpContentPath(article.contentPath || "");

    if (!contentPath) {
      continue;
    }

    if (seen.has(contentPath)) {
      throw new AppError(`Help article content path '${contentPath}' is duplicated.`, 500);
    }
    seen.set(contentPath, article.id);
  }
}

/** @param {string} contentPath @param {string} articleId @returns {string} */
function resolveHelpContentPath(contentPath, articleId) {
  const normalizedPath = normalizeHelpContentPath(contentPath);

  if (!normalizedPath || path.extname(normalizedPath).toLowerCase() !== ".md") {
    throw new AppError(`Help article contentPath must point to a Markdown file for '${articleId}'.`, 500);
  }

  const absolutePath = path.resolve(HELP_CONTENT_ROOT, ...normalizedPath.split("/"));
  const relativeToRoot = path.relative(HELP_CONTENT_ROOT, absolutePath);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new AppError(`Help article contentPath escapes the Help root for '${articleId}'.`, 500);
  }

  return absolutePath;
}

/** @param {unknown} contentPath @returns {string} */
function normalizeHelpContentPath(contentPath) {
  const normalizedPath = String(contentPath || "").trim().replaceAll("\\", "/");

  if (!normalizedPath || normalizedPath.startsWith("/") || normalizedPath.includes("../")) {
    return "";
  }

  return normalizedPath
    .split("/")
    .filter(Boolean)
    .join("/");
}

/** @param {HelpArticle} article @returns {string} */
function searchModuleIdForArticle(article) {
  return article.ownerType === "framework" || !article.moduleId
    ? FRAMEWORK_HELP_MODULE_ID
    : article.moduleId;
}

/** @param {string} workspaceId @returns {Promise<boolean>} */
async function workspaceExists(workspaceId) {
  const normalizedWorkspaceId = String(workspaceId || "").trim();

  if (!normalizedWorkspaceId) {
    return false;
  }

  const row = await db.get(`
SELECT workspace_id
FROM workspaces
WHERE workspace_id = :workspaceId
LIMIT 1;
`, { workspaceId: normalizedWorkspaceId });

  return Boolean(row);
}

/** @template {HelpSection | HelpArticle} T @param {T} item @returns {T & { ownerType: "framework", moduleId: "" }} */
function normalizeFrameworkItem(item) {
  return {
    ...item,
    ownerType: "framework",
    moduleId: "",
  };
}

/** @template {HelpSection | HelpArticle} T @param {T} item @returns {T & { ownerType: import("../types/help-static-contracts.js").HelpOwnerType, sourceLabel: string }} */
function decorateHelpItem(item) {
  const moduleDefinition = item.moduleId ? modulesService.getModule(item.moduleId) : null;

  return {
    ...item,
    ownerType: item.ownerType || (item.moduleId ? "module" : "framework"),
    sourceLabel: item.ownerType === "framework" || !item.moduleId
      ? "Framework"
      : moduleDefinition?.displayName || moduleDefinition?.name || item.moduleId,
  };
}

/** @param {HelpSection} section @returns {HelpSectionPayload} */
function sectionPayload(section) {
  return {
    id: section.id,
    title: section.title,
    description: section.description || "",
    sortOrder: typeof section.sortOrder === "number" && Number.isFinite(section.sortOrder) ? section.sortOrder : 0,
    audience: section.audience || "",
    tags: normalizeTags(section.tags),
    ownerType: section.ownerType || "module",
    moduleId: section.moduleId || "",
    sourceLabel: section.sourceLabel || "",
  };
}

/** @param {HelpArticle} article @returns {HelpArticleListPayload} */
function articleListPayload(article) {
  return {
    id: article.id,
    slug: article.slug || "",
    sectionId: article.sectionId || "",
    title: article.title,
    summary: article.summary || article.description || "",
    description: article.description || "",
    sortOrder: typeof article.sortOrder === "number" && Number.isFinite(article.sortOrder) ? article.sortOrder : 0,
    audience: article.audience || "",
    tags: normalizeTags(article.tags),
    relatedArticleIds: normalizeTags(article.relatedArticleIds),
    ownerType: article.ownerType || "module",
    moduleId: article.moduleId || "",
    sourceLabel: article.sourceLabel || "",
  };
}

/** @param {HydratedHelpArticle} article @param {HelpSection | null} section @returns {HelpArticleDetailPayload} */
function articleDetailPayload(article, section) {
  const bodyMarkdown = article.body || "";

  return {
    ...articleListPayload(article),
    body: bodyMarkdown,
    bodyFormat: "markdown",
    bodyMarkdown,
    bodyHtml: renderMarkdownToHtml(bodyMarkdown),
    bodyHtmlFormat: "html",
    section: section ? sectionPayload(section) : null,
  };
}

/** @param {unknown} tags @returns {string[]} */
function normalizeTags(tags) {
  return Array.isArray(tags) ? tags.filter((tag) => typeof tag === "string" && tag.trim()) : [];
}

/** @param {HelpSection | HelpArticle} left @param {HelpSection | HelpArticle} right @returns {number} */
function sortHelpItems(left, right) {
  return Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||
    String(left.title || "").localeCompare(String(right.title || "")) ||
    String(left.id || "").localeCompare(String(right.id || ""));
}

export const helpService = {
  canReadIndexedArticle,
  list,
  listActiveSearchableTypes,
  listSearchableTypes,
  listSearchIndexDocuments,
  readArticle,
};

export {
  FRAMEWORK_HELP_MODULE_ID,
  HELP_SEARCH_INDEXER_ID,
  HELP_SEARCH_RECORD_TYPE,
  HELP_SEARCH_SOURCE,
};
