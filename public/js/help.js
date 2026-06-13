(function initializeHelpPage() {
const statusMessage = document.querySelector("[data-help-status]");
const sectionsContainer = document.querySelector("[data-help-sections]");
const articleContainer = document.querySelector("[data-help-article]");

const state = {
  articles: [],
  defaultArticleId: "",
  navigation: [],
  navGroupCounter: 0,
  sections: [],
  selectedArticleId: readSelectedArticleFromUrl(),
};

initialize();

async function initialize() {
  setStatus("Loading help...");
  renderArticlePrompt("Loading help...");

  try {
    const response = await fetch("/api/help", { cache: "no-store" });
    const body = await readJson(response);

    if (!response.ok) {
      throw new Error(errorMessage(body) || "Help is unavailable.");
    }

    state.sections = normalizeSections(body.sections);
    state.articles = normalizeArticles(body.articles);
    state.navigation = normalizeNavigation(body.navigation);
    state.defaultArticleId = body.defaultArticleId || body.defaultArticleSlug || "";
    renderSections();

    if (state.articles.length === 0) {
      setStatus("");
      renderArticlePrompt("No help articles are visible.");
      return;
    }

    const selected = findArticle(state.selectedArticleId) || findArticle(state.defaultArticleId) || state.articles[0];
    await selectArticle(selected.id, { replaceUrl: !state.selectedArticleId });
  } catch (error) {
    state.sections = [];
    state.articles = [];
    state.navigation = [];
    state.defaultArticleId = "";
    renderSections();
    setStatus(error.message || "Help is unavailable.", true);
    renderArticlePrompt("Help is unavailable.");
  }
}

async function selectArticle(articleId, options = {}) {
  const article = findArticle(articleId);

  if (!article) {
    return;
  }

  state.selectedArticleId = article.id;
  updateSelectedArticleLinks();
  if (options.replaceUrl !== false) {
    updateUrl(article);
  }
  renderArticlePrompt("Loading article...");

  try {
    const response = await fetch(`/api/help/articles/${encodeURIComponent(article.slug || article.id)}`, { cache: "no-store" });
    const body = await readJson(response);

    if (!response.ok) {
      throw new Error(errorMessage(body) || "Article is unavailable.");
    }

    renderArticle(body.article || article);
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Article is unavailable.", true);
    renderArticlePrompt("Article is unavailable.");
  }
}

function renderSections() {
  if (!sectionsContainer) {
    return;
  }

  const navigation = state.navigation.length > 0 ? state.navigation : sectionsWithArticles();

  if (navigation.length === 0) {
    sectionsContainer.replaceChildren(emptyElement("No help articles are visible."));
    return;
  }

  state.navGroupCounter = 0;
  sectionsContainer.replaceChildren(...navigation.map((item) => createNavigationItem(item, 1)));
}

function createNavigationItem(item, depth = 1) {
  if (item.type === "article") {
    return createArticleLink(item, depth);
  }

  const group = document.createElement("section");
  const heading = document.createElement("button");
  const list = document.createElement("div");
  const title = document.createElement("span");
  const icon = document.createElement("span");
  const groupId = `help-nav-group-${state.navGroupCounter += 1}`;

  group.className = "help-section-group";
  group.dataset.helpNavDepth = String(depth);
  heading.type = "button";
  heading.className = "help-section-toggle";
  heading.setAttribute("aria-expanded", "true");
  heading.setAttribute("aria-controls", groupId);
  title.textContent = item.title || "Help";
  icon.className = "help-section-toggle-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "▾";
  heading.append(icon, title);
  heading.addEventListener("click", () => {
    const expanded = heading.getAttribute("aria-expanded") !== "false";
    heading.setAttribute("aria-expanded", String(!expanded));
    list.hidden = expanded;
  });
  list.className = "help-article-list";
  list.id = groupId;
  list.replaceChildren(
    ...(item.id ? [createArticleLink({ ...item, type: "article" }, depth + 1)] : []),
    ...(item.children || []).map((child) => createNavigationItem(child, depth + 1)),
  );
  group.append(heading, list);
  return group;
}

function createArticleLink(article, depth = 1) {
  const button = document.createElement("button");
  const title = document.createElement("span");
  const meta = document.createElement("span");

  button.type = "button";
  button.className = "help-article-link";
  button.dataset.helpNavDepth = String(depth);
  button.dataset.helpArticleId = article.id;
  button.setAttribute("aria-pressed", String(article.id === state.selectedArticleId));
  button.addEventListener("click", () => selectArticle(article.id));

  title.textContent = article.title || "Untitled article";
  meta.textContent = article.sourceLabel || sourceLabel(article);
  button.append(title, meta);
  return button;
}

function renderArticle(article) {
  if (!articleContainer) {
    return;
  }

  const header = document.createElement("header");
  const title = document.createElement("h2");
  const meta = document.createElement("p");
  const summary = document.createElement("p");
  const body = document.createElement("div");

  header.className = "help-article-header";
  title.textContent = article.title || "Untitled article";
  meta.className = "help-article-meta";
  meta.textContent = articleMetaParts(article).join(" - ");
  header.append(title, meta);

  summary.className = "help-article-summary";
  summary.textContent = article.summary || article.description || "";

  body.className = "help-article-body";
  body.replaceChildren(...paragraphs(article.body || ""));

  articleContainer.replaceChildren(header, summary, body);
}

function renderArticlePrompt(message) {
  articleContainer?.replaceChildren(emptyElement(message));
}

function sectionsWithArticles() {
  const sectionsById = new Map(state.sections.map((section) => [section.id, { ...section, articles: [] }]));
  const fallbackSection = {
    id: "uncategorized",
    title: "Other",
    sortOrder: 9999,
    articles: [],
  };

  for (const article of state.articles) {
    const section = sectionsById.get(article.sectionId) || fallbackSection;
    section.articles.push(article);
  }

  return [...sectionsById.values(), fallbackSection]
    .filter((section) => section.articles.length > 0)
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||
      String(left.title || "").localeCompare(String(right.title || "")))
    .map((section) => ({
      children: section.articles.map((article) => navigationArticle(article)),
      title: section.title || "Help",
      type: "group",
    }));
}

function updateSelectedArticleLinks() {
  document.querySelectorAll("[data-help-article-id]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.helpArticleId === state.selectedArticleId));
  });
}

function updateUrl(article) {
  const params = new URLSearchParams(window.location.search);
  params.set("article", article.slug || article.id);
  window.history.replaceState({}, "", `${window.location.pathname}?${params}`);
}

function readSelectedArticleFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("article") || params.get("id") || params.get("slug") || "";
}

function findArticle(articleIdOrSlug) {
  return state.articles.find((article) => (
    article.id === articleIdOrSlug || article.slug === articleIdOrSlug
  ));
}

function normalizeSections(sections = []) {
  return (Array.isArray(sections) ? sections : [])
    .map((section) => ({
      id: section.id || "",
      title: section.title || "",
      description: section.description || "",
      sortOrder: Number(section.sortOrder || 0),
      ownerType: section.ownerType || "module",
      moduleId: section.moduleId || "",
      sourceLabel: section.sourceLabel || "",
    }))
    .filter((section) => section.id && section.title)
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||
      left.title.localeCompare(right.title));
}

function normalizeArticles(articles = []) {
  return (Array.isArray(articles) ? articles : [])
    .map((article) => ({
      id: article.id || "",
      slug: article.slug || "",
      sectionId: article.sectionId || "",
      title: article.title || "",
      summary: article.summary || article.description || "",
      description: article.description || "",
      sortOrder: Number(article.sortOrder || 0),
      tags: Array.isArray(article.tags) ? article.tags : [],
      ownerType: article.ownerType || "module",
      moduleId: article.moduleId || "",
      sourceLabel: article.sourceLabel || "",
    }))
    .filter((article) => article.id && article.title)
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||
      left.title.localeCompare(right.title));
}

function normalizeNavigation(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(normalizeNavigationItem)
    .filter(Boolean);
}

function normalizeNavigationItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const type = item.type === "article" ? "article" : "group";
  const children = normalizeNavigation(item.children);

  if (type === "article") {
    const article = findArticle(item.id || item.slug || "");

    if (!article) {
      return null;
    }

    return {
      ...navigationArticle(article),
      title: item.title || article.title,
    };
  }

  return {
    id: item.id || "",
    moduleId: item.moduleId || "",
    ownerType: item.ownerType || "",
    slug: item.slug || "",
    children,
    sourceLabel: item.sourceLabel || "",
    title: item.title || "Help",
    type: "group",
  };
}

function navigationArticle(article) {
  return {
    id: article.id,
    moduleId: article.moduleId || "",
    ownerType: article.ownerType || "module",
    slug: article.slug || "",
    sourceLabel: article.sourceLabel || "",
    title: article.title || "Untitled article",
    type: "article",
  };
}

function articleMetaParts(article) {
  const parts = [];
  const source = article.sourceLabel || sourceLabel(article);

  if (source) {
    parts.push(source);
  }
  if (article.ownerType === "framework") {
    parts.push("Framework help");
  } else if (article.moduleId) {
    parts.push("Module help");
  }

  return parts;
}

function sourceLabel(article) {
  if (article.ownerType === "framework") {
    return "Framework";
  }

  return article.moduleId || "Module";
}

function paragraphs(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = part;
      return paragraph;
    });
}

function emptyElement(message) {
  const element = document.createElement("p");
  element.className = "placeholder-copy";
  element.textContent = message;
  return element;
}


function setStatus(message, isError = false) {
  if (!statusMessage) {
    return;
  }

  statusMessage.textContent = message;
  statusMessage.classList.toggle("is-error", isError);
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function errorMessage(body) {
  if (body?.error?.message) {
    return body.error.message;
  }
  if (typeof body?.error === "string") {
    return body.error;
  }
  return "";
}

window.LongtailForge = window.LongtailForge || {};
window.LongtailForge.helpPageReady = true;
}());
