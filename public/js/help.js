/* global DOMParser, Node */

(function initializeHelpPage() {
const statusMessage = document.querySelector("[data-help-status]");
const sectionsContainer = document.querySelector("[data-help-sections]");
const articleContainer = document.querySelector("[data-help-article]");

/**
 * A record this page read out of a Help response, with no member guaranteed.
 *
 * The wire shapes are the server's `HelpSectionPayload`, `HelpArticleListPayload` and
 * `HelpArticleDetailPayload`, which are declared and checked **there** - in a program this one
 * does not include. Restating them here would create a second, unchecked copy that could drift
 * from the first without either side noticing, so this page states only what it verifies:
 * that the value it reads from is a record.
 * @typedef {Record<string, unknown>} HelpRecord
 */

/**
 * A Help section, as **this page's own normalizer** produces it.
 *
 * Named precisely rather than left open, because `normalizeSections` is the producer: every
 * member below is written by it, so the shape is a local fact rather than a claim about the wire.
 * @typedef {object} HelpSection
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {number} sortOrder
 * @property {string} ownerType
 * @property {string} moduleId
 * @property {string} sourceLabel
 */

/**
 * A Help article, as `normalizeArticles` produces it. Named for the same reason as
 * {@link HelpSection}.
 * @typedef {object} HelpArticle
 * @property {string} id
 * @property {string} slug
 * @property {string} sectionId
 * @property {string} title
 * @property {string} summary
 * @property {string} description
 * @property {number} sortOrder
 * @property {readonly unknown[]} tags
 * @property {string} ownerType
 * @property {string} moduleId
 * @property {string} sourceLabel
 */

/**
 * One navigation entry that resolves to an article.
 *
 * **Only `id`, `title` and `type` are guaranteed.** `navigationArticle` writes all seven, but
 * `createNavigationItem` also builds one by re-typing a group that carries its own article id,
 * and a group is not required to carry the other four.
 * @typedef {object} HelpNavigationArticle
 * @property {"article"} type
 * @property {string} id
 * @property {string} title
 * @property {string} [moduleId]
 * @property {string} [ownerType]
 * @property {string} [slug]
 * @property {string} [sourceLabel]
 */

/**
 * One navigation entry that holds other entries.
 *
 * `sectionsWithArticles` builds the fallback navigation from three members only, so everything
 * a declared group carries beyond `children`, `title` and `type` is optional here.
 * @typedef {object} HelpNavigationGroup
 * @property {"group"} type
 * @property {string} title
 * @property {HelpNavigationItem[]} children
 * @property {string} [id]
 * @property {string} [moduleId]
 * @property {string} [ownerType]
 * @property {string} [slug]
 * @property {string} [sourceLabel]
 */

/** @typedef {HelpNavigationArticle | HelpNavigationGroup} HelpNavigationItem */

/**
 * The record a Help member carries, or `null`.
 *
 * Arrays are refused because every caller asks this for a member it will read *by name*, and an
 * array answers `undefined` for each of them anyway.
 * @param {unknown} value
 * @returns {HelpRecord | null}
 */
function helpRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? /** @type {HelpRecord} */ (value)
    : null;
}

/**
 * A Help list, with every entry read as a record.
 *
 * A malformed entry becomes `{}` rather than being dropped, because the normalizers already
 * drop what they cannot use - `normalizeSections` and `normalizeArticles` both filter on an id
 * and a title - so removing it here would take that decision away from them.
 * @param {unknown} value
 * @returns {HelpRecord[]}
 */
function helpRecordList(value) {
  /** @type {readonly unknown[]} */
  const entries = Array.isArray(value) ? value : [];
  return entries.map((entry) => helpRecord(entry) || {});
}

/**
 * A Help member as text.
 *
 * **`String(value || "")`, not `String(value ?? "")`**, because every site this replaces read
 * `member || ""` - so `0`, `false` and `""` must all still reach the empty string rather than
 * their own spellings. A truthy non-string is the only value that changes: it becomes its text
 * instead of staying raw, which is what the two `localeCompare` sorts below already required of
 * it and would otherwise have thrown on.
 * @param {unknown} value
 * @returns {string}
 */
function helpText(value) {
  return String(value || "");
}

/**
 * @typedef {object} HelpPageState
 * @property {HelpArticle[]} articles
 * @property {string} defaultArticleId
 * @property {HelpNavigationItem[]} navigation
 * @property {number} navGroupCounter
 * @property {HelpSection[]} sections
 * @property {string} selectedArticleId
 */

/** @type {HelpPageState} */
const state = {
  articles: [],
  defaultArticleId: "",
  navigation: [],
  navGroupCounter: 0,
  sections: [],
  selectedArticleId: readSelectedArticleFromUrl(),
};

initialize();

/** @typedef {import("../../src/types/browser-contracts.js").BrowserErrorContract} BrowserErrorContract */

/**
 * The narrowing contract for the values this file catches.
 *
 * A `catch` binding is `unknown` and no declaration can change that: anything can be
 * thrown. Every page that loads this script also loads `shared/error-contract.js`, so the
 * checked read fails exactly where the raw `error.message` read failed before.
 * @returns {BrowserErrorContract}
 */
function requireErrors() {
  const errors = window.LongtailForge?.errors;
  if (!errors) {
    throw new Error("Help requires LongtailForge.errors.");
  }
  return errors;
}

async function initialize() {
  setStatus("Loading help...");
  renderArticlePrompt("Loading help...");

  try {
    const response = await fetch("/api/help", { cache: "no-store" });
    const body = await readJson(response);

    if (!response.ok) {
      throw new Error(errorMessage(body) || "Help is unavailable.");
    }

    // Narrowed after the failure branch, so `errorMessage` keeps reading the body exactly as it
    // arrived rather than one this page substituted.
    const payload = helpRecord(body) || {};
    state.sections = normalizeSections(payload.sections);
    state.articles = normalizeArticles(payload.articles);
    state.navigation = normalizeNavigation(payload.navigation);
    state.defaultArticleId = helpText(payload.defaultArticleId || payload.defaultArticleSlug);
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
    setStatus(requireErrors().caughtMessage(error, "Help is unavailable."), true);
    renderArticlePrompt("Help is unavailable.");
  }
}

/**
 * @param {unknown} articleId an id or a slug, from the URL, a click, or the default
 * @param {{ replaceUrl?: boolean }} [options]
 */
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

    renderArticle(helpRecord(helpRecord(body)?.article) || article);
    setStatus("");
  } catch (error) {
    setStatus(requireErrors().caughtMessage(error, "Article is unavailable."), true);
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

/** @param {HelpNavigationItem} item @param {number} [depth] */
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
  heading.setAttribute("aria-controls", groupId);
  title.textContent = item.title || "Help";
  icon.className = "help-section-toggle-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "v";
  heading.append(icon, title);
  heading.addEventListener("click", () => {
    const expanded = heading.getAttribute("aria-expanded") !== "false";
    heading.setAttribute("aria-expanded", String(!expanded));
    list.hidden = expanded;
  });
  list.className = "help-article-list";
  list.id = groupId;
  list.replaceChildren(
    // `id` is restated after the spread only so the narrowing the guard already performed
    // survives it; the value is the one the spread carried.
    ...(item.id ? [createArticleLink({ ...item, id: item.id, type: "article" }, depth + 1)] : []),
    ...(item.children || []).map((child) => createNavigationItem(child, depth + 1)),
  );
  const expanded = shouldStartGroupExpanded(item, depth);
  heading.setAttribute("aria-expanded", String(expanded));
  list.hidden = !expanded;
  group.append(heading, list);
  return group;
}

/** @param {HelpNavigationArticle} article @param {number} [depth] */
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

/**
 * **The detail body or the list entry, whichever the response yielded.** Both reach here, so the
 * parameter is a record rather than a `HelpArticle`: the detail comes straight off the wire.
 * @param {HelpRecord} article
 */
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
  title.textContent = helpText(article.title) || "Untitled article";
  meta.className = "help-article-meta";
  meta.textContent = articleMetaParts(article).join(" - ");
  header.append(title, meta);

  summary.className = "help-article-summary";
  summary.textContent = helpText(article.summary || article.description);

  body.className = "help-article-body";
  body.replaceChildren(...articleBodyNodes(article));

  articleContainer.replaceChildren(header, summary, body);
}

/** @param {HelpRecord} article */
function articleBodyNodes(article) {
  if (article.bodyHtml) {
    return renderSafeHtmlNodes(article.bodyHtml);
  }

  return renderMarkdownNodes(article.bodyMarkdown || article.body || "");
}

/** @param {string} message */
function renderArticlePrompt(message) {
  articleContainer?.replaceChildren(emptyElement(message));
}

/** @returns {HelpNavigationItem[]} */
function sectionsWithArticles() {
  /** @typedef {{ id: string, title: string, sortOrder: number, articles: HelpArticle[] }} HelpSectionBucket */
  /** @type {Map<string, HelpSectionBucket>} */
  const sectionsById = new Map(state.sections.map((section) => [section.id, { ...section, articles: [] }]));
  /** @type {HelpSectionBucket} */
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
    // `dataset` lives on `HTMLElement`, and `querySelectorAll` answers `Element`. Every match is
    // a button this page built, so the narrowing states what the selector already implies.
    if (!(button instanceof HTMLElement)) {
      return;
    }
    button.setAttribute("aria-pressed", String(button.dataset.helpArticleId === state.selectedArticleId));
  });
}

/** @param {HelpNavigationItem} item @param {number} depth */
function shouldStartGroupExpanded(item, depth) {
  if (navigationItemContainsArticle(item, state.selectedArticleId)) {
    return true;
  }

  if (depth !== 1) {
    return true;
  }

  return normalizeNavigationTitle(item.title) === "longtail forge";
}

/**
 * @param {HelpNavigationItem | null | undefined} item
 * @param {string} articleId
 * @returns {boolean}
 */
function navigationItemContainsArticle(item, articleId) {
  if (!articleId || !item) {
    return false;
  }

  if (item.id === articleId || item.slug === articleId) {
    return true;
  }

  return (item.type === "group" ? item.children || [] : []).some((child) => navigationItemContainsArticle(child, articleId));
}

/** @param {unknown} title */
function normalizeNavigationTitle(title) {
  return helpText(title).trim().toLowerCase();
}

/** @param {HelpArticle} article */
function updateUrl(article) {
  const params = new URLSearchParams(window.location.search);
  params.set("article", article.slug || article.id);
  window.history.replaceState({}, "", `${window.location.pathname}?${params}`);
}

function readSelectedArticleFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("article") || params.get("id") || params.get("slug") || "";
}

/** @param {unknown} articleIdOrSlug */
function findArticle(articleIdOrSlug) {
  return state.articles.find((article) => (
    article.id === articleIdOrSlug || article.slug === articleIdOrSlug
  ));
}

/** @param {unknown} [sections] @returns {HelpSection[]} */
function normalizeSections(sections = []) {
  return helpRecordList(sections)
    .map((section) => ({
      id: helpText(section.id),
      title: helpText(section.title),
      description: helpText(section.description),
      sortOrder: Number(section.sortOrder || 0),
      ownerType: helpText(section.ownerType) || "module",
      moduleId: helpText(section.moduleId),
      sourceLabel: helpText(section.sourceLabel),
    }))
    .filter((section) => section.id && section.title)
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||
      left.title.localeCompare(right.title));
}

/** @param {unknown} [articles] @returns {HelpArticle[]} */
function normalizeArticles(articles = []) {
  return helpRecordList(articles)
    .map((article) => ({
      id: helpText(article.id),
      slug: helpText(article.slug),
      sectionId: helpText(article.sectionId),
      title: helpText(article.title),
      summary: helpText(article.summary || article.description),
      description: helpText(article.description),
      sortOrder: Number(article.sortOrder || 0),
      tags: /** @type {readonly unknown[]} */ (Array.isArray(article.tags) ? article.tags : []),
      ownerType: helpText(article.ownerType) || "module",
      moduleId: helpText(article.moduleId),
      sourceLabel: helpText(article.sourceLabel),
    }))
    .filter((article) => article.id && article.title)
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||
      left.title.localeCompare(right.title));
}

/**
 * **The entries are passed on raw, not read as records first.** `normalizeNavigationItem`
 * answers `null` for anything that is not a record, and that answer is how a malformed entry is
 * *dropped*; substituting an empty record here would turn each one into an untitled group.
 * @param {unknown} [items]
 * @returns {HelpNavigationItem[]}
 */
function normalizeNavigation(items = []) {
  /** @type {readonly unknown[]} */
  const entries = Array.isArray(items) ? items : [];
  /** @type {HelpNavigationItem[]} */
  const normalized = [];
  for (const entry of entries) {
    const item = normalizeNavigationItem(entry);
    if (item) {
      normalized.push(item);
    }
  }
  return normalized;
}

/** @param {unknown} item @returns {HelpNavigationItem | null} */
function normalizeNavigationItem(item) {
  const entry = helpRecord(item);

  if (!entry) {
    return null;
  }

  const type = entry.type === "article" ? "article" : "group";
  const children = normalizeNavigation(entry.children);

  if (type === "article") {
    const article = findArticle(entry.id || entry.slug || "");

    if (!article) {
      return null;
    }

    return {
      ...navigationArticle(article),
      title: helpText(entry.title) || article.title,
    };
  }

  return {
    id: helpText(entry.id),
    moduleId: helpText(entry.moduleId),
    ownerType: helpText(entry.ownerType),
    slug: helpText(entry.slug),
    children,
    sourceLabel: helpText(entry.sourceLabel),
    title: helpText(entry.title) || "Help",
    type: "group",
  };
}

/** @param {HelpArticle} article @returns {HelpNavigationArticle} */
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

/** @param {HelpRecord} article @returns {string[]} */
function articleMetaParts(article) {
  /** @type {string[]} */
  const parts = [];
  const source = helpText(article.sourceLabel) || sourceLabel(article);

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

/**
 * **A record rather than one of the two article shapes**, because both reach it: a navigation
 * entry on its way to a link label, and a detail body straight off the wire.
 * @param {HelpRecord} article
 * @returns {string}
 */
function sourceLabel(article) {
  if (article.ownerType === "framework") {
    return "Framework";
  }

  return helpText(article.moduleId) || "Module";
}

/** @param {unknown} markdown @returns {Node[]} */
function renderMarkdownNodes(markdown) {
  const lines = normalizeMarkdown(markdown).split("\n");
  /** @type {Node[]} */
  const nodes = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      nodes.push(codeBlockElement(codeLines.join("\n")));
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = Math.min(6, Math.max(2, heading[1].length + 1));
      const element = document.createElement(`h${level}`);
      element.replaceChildren(...inlineMarkdownNodes(heading[2]));
      nodes.push(element);
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const tableLines = [lines[index]];
      index += 2;
      while (index < lines.length && isTableRow(lines[index])) {
        tableLines.push(lines[index]);
        index += 1;
      }
      nodes.push(tableElement(tableLines));
      continue;
    }

    const unordered = trimmed.match(/^[-*+]\s+(.+)$/);
    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      const listType = unordered ? "ul" : "ol";
      const list = document.createElement(listType);

      while (index < lines.length) {
        const itemMatch = listType === "ul"
          ? lines[index].trim().match(/^[-*+]\s+(.+)$/)
          : lines[index].trim().match(/^\d+\.\s+(.+)$/);

        if (!itemMatch) {
          break;
        }

        const item = document.createElement("li");
        item.replaceChildren(...inlineMarkdownNodes(itemMatch[1]));
        list.append(item);
        index += 1;
      }

      nodes.push(list);
      continue;
    }

    const paragraphLines = [];
    while (index < lines.length && isParagraphLine(lines, index)) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    const paragraph = document.createElement("p");
    paragraph.replaceChildren(...inlineMarkdownNodes(paragraphLines.join(" ")));
    nodes.push(paragraph);
  }

  return nodes.length > 0 ? nodes : [emptyElement("This article is empty.")];
}

/** @param {unknown} html @returns {Node[]} */
function renderSafeHtmlNodes(html) {
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(String(html || ""), "text/html");
  const nodes = Array.from(documentNode.body.childNodes)
    .map((node) => importSafeHelpNode(node))
    .filter((node) => node !== null);

  return nodes.length > 0 ? nodes : [emptyElement("This article is empty.")];
}

/** @param {Node} node @returns {Node | null} */
function importSafeHelpNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.textContent || "");
  }

  // The second half is the narrowing the first already implies - a node reporting `ELEMENT_NODE`
  // is an `Element` - and it is spelled out because `tagName`, `getAttribute` and `hasAttribute`
  // below live on `Element` rather than on `Node`. It can only ever refuse, never admit.
  if (node.nodeType !== Node.ELEMENT_NODE || !(node instanceof Element)) {
    return null;
  }

  const tagName = node.tagName.toLowerCase();
  const allowedTags = new Set([
    "a",
    "blockquote",
    "br",
    "code",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "input",
    "li",
    "ol",
    "p",
    "pre",
    "strong",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
  ]);

  if (!allowedTags.has(tagName)) {
    return document.createTextNode(node.textContent || "");
  }

  const element = document.createElement(tagName);

  // Each narrowing below states the tag the branch already established - `createElement("a")`
  // answers an anchor and `createElement("input")` an input. They can only skip an assignment,
  // never permit one the allowlist or `safeHelpHref` refused.
  if (tagName === "a" && element instanceof HTMLAnchorElement) {
    const safeHref = safeHelpHref(node.getAttribute("href") || "");
    if (safeHref) {
      element.href = safeHref;
      if (/^https?:\/\//i.test(safeHref)) {
        element.rel = "noopener noreferrer";
      }
    }
  }

  if (tagName === "code") {
    const className = node.getAttribute("class") || "";
    if (/^language-[a-z0-9_-]+$/i.test(className)) {
      element.className = className;
    }
  }

  if (tagName === "input" && element instanceof HTMLInputElement && node.getAttribute("type") === "checkbox") {
    element.type = "checkbox";
    element.disabled = true;
    element.checked = node.hasAttribute("checked");
  }

  element.replaceChildren(...Array.from(node.childNodes)
    .map((child) => importSafeHelpNode(child))
    .filter((child) => child !== null));
  return element;
}

/** @param {unknown} markdown @returns {string} */
function normalizeMarkdown(markdown) {
  return String(markdown || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

/** @param {readonly string[]} lines @param {number} index */
function isParagraphLine(lines, index) {
  const trimmed = lines[index].trim();

  return Boolean(trimmed) &&
    !trimmed.startsWith("```") &&
    !/^(#{1,6})\s+/.test(trimmed) &&
    !/^[-*+]\s+/.test(trimmed) &&
    !/^\d+\.\s+/.test(trimmed) &&
    !isTableStart(lines, index);
}

/** @param {string} code */
function codeBlockElement(code) {
  const pre = document.createElement("pre");
  const element = document.createElement("code");

  element.textContent = code;
  pre.append(element);
  return pre;
}

/** @param {readonly string[]} lines @param {number} index */
function isTableStart(lines, index) {
  return isTableRow(lines[index]) && isTableDivider(lines[index + 1] || "");
}

/** @param {string | undefined} line */
function isTableRow(line) {
  return /^\s*\|.+\|\s*$/.test(line || "");
}

/** @param {string} line */
function isTableDivider(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line || "");
}

/** @param {readonly string[]} lines */
function tableElement(lines) {
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  const headers = splitTableCells(lines[0]);

  const headerRow = document.createElement("tr");
  for (const header of headers) {
    const cell = document.createElement("th");
    cell.replaceChildren(...inlineMarkdownNodes(header));
    headerRow.append(cell);
  }
  thead.append(headerRow);

  for (const line of lines.slice(1)) {
    const row = document.createElement("tr");
    for (const value of splitTableCells(line)) {
      const cell = document.createElement("td");
      cell.replaceChildren(...inlineMarkdownNodes(value));
      row.append(cell);
    }
    tbody.append(row);
  }

  table.append(thead, tbody);
  return table;
}

/** @param {unknown} line @returns {string[]} */
function splitTableCells(line) {
  return String(line || "")
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** @param {unknown} value @returns {Node[]} */
function inlineMarkdownNodes(value) {
  /** @type {Node[]} */
  const nodes = [];
  const pattern = /(`([^`]+)`)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(\[([^\]]+)]\(([^)\s]+)\))/g;
  let cursor = 0;
  let match;

  while ((match = pattern.exec(String(value || ""))) !== null) {
    appendTextNode(nodes, String(value || "").slice(cursor, match.index));

    if (match[2]) {
      const code = document.createElement("code");
      code.textContent = match[2];
      nodes.push(code);
    } else if (match[4]) {
      const strong = document.createElement("strong");
      strong.replaceChildren(...inlineMarkdownNodes(match[4]));
      nodes.push(strong);
    } else if (match[6]) {
      const emphasis = document.createElement("em");
      emphasis.replaceChildren(...inlineMarkdownNodes(match[6]));
      nodes.push(emphasis);
    } else if (match[8] && match[9]) {
      nodes.push(linkElement(match[8], match[9]));
    }

    cursor = pattern.lastIndex;
  }

  appendTextNode(nodes, String(value || "").slice(cursor));
  return nodes;
}

/** @param {Node[]} nodes @param {string} value */
function appendTextNode(nodes, value) {
  if (value) {
    nodes.push(document.createTextNode(value));
  }
}

/** @param {string} label @param {unknown} href */
function linkElement(label, href) {
  const anchor = document.createElement("a");
  const safeHref = safeHelpHref(href);

  anchor.replaceChildren(...inlineMarkdownNodes(label));
  if (safeHref) {
    anchor.href = safeHref;
    if (/^https?:\/\//i.test(safeHref)) {
      anchor.rel = "noopener noreferrer";
    }
  }
  return anchor;
}

/** @param {unknown} href @returns {string} */
function safeHelpHref(href) {
  const value = String(href || "").trim();

  if (!value || /^(javascript|vbscript|data):/i.test(value)) {
    return "";
  }

  if (/^(https?:\/\/|mailto:|#|\/(?!\/)|[a-z0-9._/-]+(?:[?#].*)?$)/i.test(value)) {
    return value;
  }

  return "";
}

/** @param {string} message */
function emptyElement(message) {
  const element = document.createElement("p");
  element.className = "placeholder-copy";
  element.textContent = message;
  return element;
}


/** @param {string} message @param {boolean} [isError] */
function setStatus(message, isError = false) {
  if (!statusMessage) {
    return;
  }

  statusMessage.textContent = message;
  statusMessage.classList.toggle("is-error", isError);
}

/** @param {Response} response @returns {Promise<unknown>} */
async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

/** @param {unknown} body @returns {string} */
function errorMessage(body) {
  return window.LongtailForge?.errors?.read?.(body, "").message || "";
}

window.LongtailForge = window.LongtailForge || {};
window.LongtailForge.helpPageReady = true;
}());
