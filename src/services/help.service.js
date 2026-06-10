import { modulesService } from "../core/modules/modules.service.js";
import { querySql, sqlText } from "../db/index.js";
import { validateHelpContribution } from "../core/modules/manifest-contract.js";
import { AppError } from "../utils/app-error.js";

const HELP_SEARCH_INDEXER_ID = "framework.help-articles";
const HELP_SEARCH_RECORD_TYPE = "help_article";
const HELP_SEARCH_SOURCE = "Help";
const FRAMEWORK_HELP_MODULE_ID = "framework";

const FRAMEWORK_HELP_SECTION = {
  id: "framework.help-center",
  ownerType: "framework",
  title: "Longtail Forge",
  description: "Framework-owned Longtail Forge help.",
  sortOrder: 0,
  audience: "all",
  tags: ["framework", "help"],
};

const FRAMEWORK_HELP_ARTICLES = [
    {
      id: "framework.help-center",
      slug: "help-center",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Help Center",
      summary: "Find framework and module help articles for the active workspace.",
      body: "The Help Center is a framework-owned surface for Longtail Forge product and module documentation. Framework articles stay available across workspaces.\n\nModule articles appear only when their owning module is active and visible in the current workspace. Article cards and article detail views show source metadata so framework and module ownership stay clear.\n\nUse Help for product guidance inside the app. Use the roadmap and repository documentation for planning, release history, and implementation details.",
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
      body: "Use the Dashboard as the main summary screen after signing in. The navigation bar opens the major work areas available to your active workspace.\n\nCheck the workspace switcher when records or modules look different than expected. Most records, settings, search results, and Help visibility are scoped to the active workspace.\n\nUse Search from the navigation row to find indexed records and Help articles. Use Settings for user preferences, workspace settings, modules, audit logs, and Help.",
      sortOrder: 10,
      audience: "all",
      tags: ["framework", "getting-started", "dashboard"],
      relatedArticleIds: ["framework.workspaces", "framework.search", "framework.settings"],
    },
    {
      id: "framework.workspaces",
      slug: "workspaces-and-switching",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Workspaces and Workspace Switching",
      summary: "Understand active workspace scope and workspace switching.",
      body: "A workspace is the active scope for most Longtail Forge data. Clients, projects, tasks, time entries, tags, settings, module availability, and search results are read through the current workspace.\n\nUse the workspace switcher in the app shell when your account belongs to more than one workspace. Switching workspaces changes the available records and may change which modules appear.\n\nWorkspace settings are managed from Settings when your role allows it. Workspace type and enabled modules can affect which tools are visible.",
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
      body: "User access is based on role assignments in the active workspace. Some roles apply to the whole workspace, while client and project roles apply only to their assigned scope.\n\nProtected local administrator accounts keep broad access for local administration. Other users see records and actions allowed by their assigned roles and operation overrides.\n\nUser profile preferences such as theme and timezone live under User settings. User administration and role assignment controls appear only when your current role allows them.",
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
      body: "Clients and projects organize work, billing context, reporting, tasks, and time entries. Business workspaces can use both clients and projects, while some workspace types may use project-only workflows.\n\nClient and project records are archived by setting them inactive instead of deleting them. Historical time entries and related records keep their stable IDs.\n\nProject settings can include billing defaults and task defaults. New records may inherit defaults when created, but saved records keep their own stored values.",
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
      summary: "Track manual timers and saved time entries.",
      body: "Use Time Tracker for active timers and Manual Entry or Time Entries when entering or editing completed work. Active timers are stored for the current user and workspace so they can be restored after reloads.\n\nOnly one timer runs at a time for a user in a workspace. Starting or resuming a timer pauses other running timers for that same user and workspace.\n\nSaved time entries store their duration, project context, billable state, and timestamps. User-local display respects the timezone saved on the active session.",
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
      summary: "Create, assign, filter, complete, archive, and time tasks.",
      body: "Tasks can be scoped to a workspace, client, or project depending on the active workspace and available modules. A task has a title, status, priority, assignees, optional due date and time, and optional client or project context.\n\nTask permissions control who can view, create, edit, assign, complete, archive, or restore tasks. Users may see only the tasks allowed by their role scope.\n\nWhen Tasks and Time Tracking are both enabled, eligible open tasks can start task timers. Task timers finalize into normal time entries with task context.",
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
      body: "Notifications appear from the bell icon in the navigation row. The panel shows unread activity and links to the full Notifications page.\n\nNotifications are scoped to the current user and workspace. Read, dismiss, and preference actions affect your notification view without changing other users' notifications.\n\nNotification preferences are managed through shared settings surfaces. Some notifications are created by module events, and links are hidden when you cannot access the target record.",
      sortOrder: 70,
      audience: "all",
      tags: ["framework", "notifications"],
      relatedArticleIds: ["framework.settings", "framework.modules"],
    },
    {
      id: "framework.tags",
      slug: "tags",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Tags",
      summary: "Classify supported records with workspace tags.",
      body: "Tags are workspace classification metadata. Supported record types can show tag chips, tag pickers, and tag filters when the Tags module is active.\n\nTags help with searching, filtering, and grouping, but they are not the source of truth for permissions, security, record status, or billing behavior.\n\nArchived or inactive tags stay available for historical context, while active tag pickers focus on active tag choices.",
      sortOrder: 80,
      audience: "all",
      tags: ["framework", "tags", "search"],
      relatedArticleIds: ["framework.search", "framework.clients-projects", "framework.tasks"],
    },
    {
      id: "framework.search",
      slug: "search",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Search",
      summary: "Search indexed records and Help articles from the shared app shell.",
      body: "Use the search control in the navigation row to search indexed records and Help articles. The full Search page supports text, source, record type, client, project, tag, status, and pagination filters.\n\nSearch results are permission-shaped. A result appears only when the active workspace, module state, declared record type, and your read permissions allow it.\n\nHelp articles are indexed separately as Help results. Help search results open the Help Center article view and do not expose raw indexed body text in browser responses.",
      sortOrder: 90,
      audience: "all",
      tags: ["framework", "search", "help"],
      relatedArticleIds: ["framework.help-center", "framework.tags"],
    },
    {
      id: "framework.files-attachments",
      slug: "files-and-attachments",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Files and Attachments",
      summary: "Attach files to supported records and browse visible workspace attachments.",
      body: "Files attach to supported records such as tasks through record screens. The owning screen chooses the placement and wording, while the shared file helper handles upload, attachment lists, status, download links, and removal actions.\n\nThe Files page under Settings provides a simple workspace browsing surface for visible attachments. Use the filters for module, target, client, project, filename, and status when you need to find an existing file without opening every record.\n\nProtected internal files are the default. Downloads go through permission-checked app routes, and public or client-visible file behavior depends on explicit file visibility and permission checks rather than tags.",
      sortOrder: 95,
      audience: "all",
      tags: ["framework", "files", "attachments"],
      relatedArticleIds: ["framework.tasks", "framework.search", "framework.modules"],
    },
    {
      id: "framework.settings",
      slug: "settings-and-user-preferences",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Settings and User Preferences",
      summary: "Find user preferences, workspace settings, module settings, audit logs, and Help.",
      body: "Settings groups account and workspace administration surfaces. User settings hold personal preferences such as appearance and profile details.\n\nWorkspace settings, module settings, user administration, audit logs, API keys, and tag management appear based on your current permissions and enabled modules.\n\nHelp is listed under Settings so framework and module documentation is available even when optional workflow modules are disabled.",
      sortOrder: 100,
      audience: "all",
      tags: ["framework", "settings", "preferences"],
      relatedArticleIds: ["framework.users-permissions", "framework.modules", "framework.help-center"],
    },
    {
      id: "framework.modules",
      slug: "modules-and-optional-features",
      ownerType: "framework",
      sectionId: "framework.help-center",
      title: "Modules and Optional Features",
      summary: "Understand enabled modules and module-owned Help contributions.",
      body: "Longtail Forge uses first-party modules for major workflow areas such as Clients and Projects, Time Tracking, Tasks, Tags, and Users. Enabled modules contribute navigation, settings, permissions, APIs, search types, notifications, and Help content.\n\nA disabled module is hidden from normal navigation and active search targets. Historical or recovery behavior may still show existing records where the framework allows it.\n\nModule-authored Help articles appear only when their module is active and visible in the workspace. Framework Help articles stay available across workspaces.",
      sortOrder: 110,
      audience: "all",
      tags: ["framework", "modules", "help"],
      relatedArticleIds: ["framework.workspaces", "framework.help-center", "framework.search"],
    },
];

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

async function list(session) {
  const contribution = await listVisibleContributions(session);

  return {
    sections: contribution.sections.map(sectionPayload),
    articles: contribution.articles.map(articleListPayload),
  };
}

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

async function canReadIndexedArticle(session, articleId) {
  if (!articleId) {
    return false;
  }

  const contribution = await listVisibleContributions(session);
  return contribution.articles.some((article) => article.id === articleId);
}

function listSearchableTypes() {
  const ownerModuleIds = new Set([FRAMEWORK_HELP_MODULE_ID]);

  for (const article of modulesService.listHelpArticles()) {
    if (article.moduleId) {
      ownerModuleIds.add(article.moduleId);
    }
  }

  return [...ownerModuleIds].sort().map(helpSearchableType);
}

async function listActiveSearchableTypes(workspaceId) {
  if (!(await workspaceExists(workspaceId))) {
    return [];
  }

  const contribution = await listIndexableContributions(workspaceId);
  const ownerModuleIds = new Set(contribution.articles.map(searchModuleIdForArticle));

  return [...ownerModuleIds].sort().map(helpSearchableType);
}

async function listSearchIndexDocuments(workspaceId, options = {}) {
  const contribution = await listIndexableContributions(workspaceId);
  const declarationModuleId = String(options.moduleId || options.module_id || "").trim();
  const recordId = String(options.recordId || options.record_id || "").trim();
  const sectionsById = new Map(contribution.sections.map((section) => [section.id, section]));

  return contribution.articles
    .filter((article) => !declarationModuleId || searchModuleIdForArticle(article) === declarationModuleId)
    .filter((article) => !recordId || article.id === recordId || article.slug === recordId)
    .map((article) => articleSearchDocument(workspaceId, article, sectionsById.get(article.sectionId) || null));
}

async function listVisibleContributions(session) {
  const moduleContributions = await modulesService.listActiveHelpContributions(
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

  return {
    sections: sections
      .map(decorateHelpItem)
      .sort(sortHelpItems),
    articles: articles
      .map(decorateHelpItem)
      .sort(sortHelpItems),
  };
}

async function listIndexableContributions(workspaceId) {
  const moduleContributions = await modulesService.listActiveHelpContributions(workspaceId, null);
  const sections = [
    ...FRAMEWORK_HELP_CONTRIBUTION.sections.map((section) => normalizeFrameworkItem(section)),
    ...moduleContributions.sections,
  ];
  const articles = [
    ...FRAMEWORK_HELP_CONTRIBUTION.articles.map((article) => normalizeFrameworkItem(article)),
    ...moduleContributions.articles,
  ];

  return {
    sections: sections.map(decorateHelpItem).sort(sortHelpItems),
    articles: articles.map(decorateHelpItem).sort(sortHelpItems),
  };
}

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

function articleSearchDocument(workspaceId, article, section) {
  const moduleId = searchModuleIdForArticle(article);
  const sectionTitle = section?.title || "";
  const ownerLabel = article.sourceLabel || (moduleId === FRAMEWORK_HELP_MODULE_ID ? "Framework" : moduleId);
  const tags = normalizeTags(article.tags);
  const body = [
    article.body,
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

function searchModuleIdForArticle(article) {
  return article.ownerType === "framework" || !article.moduleId
    ? FRAMEWORK_HELP_MODULE_ID
    : article.moduleId;
}

async function workspaceExists(workspaceId) {
  const normalizedWorkspaceId = String(workspaceId || "").trim();

  if (!normalizedWorkspaceId) {
    return false;
  }

  const rows = await querySql(`
SELECT workspace_id
FROM workspaces
WHERE workspace_id = ${sqlText(normalizedWorkspaceId)}
LIMIT 1;
`);

  return rows.length > 0;
}

function normalizeFrameworkItem(item) {
  return {
    ...item,
    ownerType: "framework",
    moduleId: "",
  };
}

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

function sectionPayload(section) {
  return {
    id: section.id,
    title: section.title,
    description: section.description || "",
    sortOrder: Number.isFinite(section.sortOrder) ? section.sortOrder : 0,
    audience: section.audience || "",
    tags: normalizeTags(section.tags),
    ownerType: section.ownerType || "module",
    moduleId: section.moduleId || "",
    sourceLabel: section.sourceLabel || "",
  };
}

function articleListPayload(article) {
  return {
    id: article.id,
    slug: article.slug || "",
    sectionId: article.sectionId || "",
    title: article.title,
    summary: article.summary || article.description || "",
    description: article.description || "",
    sortOrder: Number.isFinite(article.sortOrder) ? article.sortOrder : 0,
    audience: article.audience || "",
    tags: normalizeTags(article.tags),
    relatedArticleIds: normalizeTags(article.relatedArticleIds),
    ownerType: article.ownerType || "module",
    moduleId: article.moduleId || "",
    sourceLabel: article.sourceLabel || "",
  };
}

function articleDetailPayload(article, section) {
  return {
    ...articleListPayload(article),
    body: article.body || "",
    section: section ? sectionPayload(section) : null,
  };
}

function normalizeTags(tags) {
  return Array.isArray(tags) ? tags.filter((tag) => typeof tag === "string" && tag.trim()) : [];
}

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
