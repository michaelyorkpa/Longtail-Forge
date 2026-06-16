import MarkdownIt from "markdown-it";

const SAFE_LINK_SCHEMES = new Set(["http:", "https:", "mailto:"]);
const SAFE_RELATIVE_PREFIXES = ["/", "./", "../", "#"];
const TASK_LIST_ITEM_PATTERN = /<li>\[([ xX])\]\s+/g;

const parser = MarkdownIt("commonmark", {
  html: false,
  linkify: false,
  typographer: false,
  breaks: false,
}).enable(["table"]);

parser.disable(["strikethrough"]);
parser.validateLink = (url) => isSafeMarkdownUrl(url);

parser.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const hrefIndex = token.attrIndex("href");

  if (hrefIndex >= 0 && !isSafeMarkdownUrl(token.attrs[hrefIndex][1])) {
    token.attrs.splice(hrefIndex, 1);
  }

  const target = token.attrGet("target");
  if (target === "_blank") {
    token.attrSet("rel", "noopener noreferrer");
  }

  return self.renderToken(tokens, index, options);
};

parser.renderer.rules.image = (tokens, index, options, env) => {
  const token = tokens[index];
  const src = token.attrGet("src") || "";

  if (!env?.allowImages || !isSafeMarkdownUrl(src)) {
    return escapeHtml(token.content || token.attrGet("alt") || "");
  }

  const alt = escapeAttribute(token.content || token.attrGet("alt") || "");
  return `<img src="${escapeAttribute(src)}" alt="${alt}">`;
};

function normalizeMarkdownSource(markdown = "") {
  return String(markdown || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

function renderMarkdownToHtml(markdown = "", options = {}) {
  const source = stripUnsafeMarkdownLinks(normalizeMarkdownSource(markdown));
  const html = parser.render(source, { allowImages: options.allowImages === true });

  return applyTaskListMarkup(html);
}

function markdownToPlainText(markdown = "", options = {}) {
  const source = stripUnsafeMarkdownLinks(normalizeMarkdownSource(markdown));
  const tokens = parser.parse(source, { allowImages: options.allowImages === true });
  const parts = [];

  collectPlainText(tokens, parts);

  return parts
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function createMarkdownExcerpt(markdown = "", maxLength = 220) {
  const text = markdownToPlainText(markdown);

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function isSafeMarkdownUrl(url = "") {
  const value = String(url || "").trim();

  if (!value) {
    return false;
  }

  if (SAFE_RELATIVE_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    return !/[\u0000-\u001F\u007F]/.test(value);
  }

  try {
    const parsed = new URL(value);
    return SAFE_LINK_SCHEMES.has(parsed.protocol);
  } catch {
    return false;
  }
}

function applyTaskListMarkup(html = "") {
  return String(html || "").replace(TASK_LIST_ITEM_PATTERN, (_match, state) => {
    const checked = state.trim() ? " checked" : "";
    return `<li class="markdown-task-list-item"><input class="markdown-task-list-checkbox" type="checkbox" disabled${checked}> `;
  });
}

function stripUnsafeMarkdownLinks(markdown = "") {
  return String(markdown || "")
    .replace(/!\[([^\]\n]*)\]\(((?:javascript|vbscript|data):[^\n]+)\)/gi, "$1")
    .replace(/\[([^\]\n]+)\]\(((?:javascript|vbscript|data):[^\n]+)\)/gi, "$1")
    .replace(/!\[([^\]\n]*)\]\(([^)\n]+)\)/g, (match, alt, url) => (
      isSafeMarkdownUrl(url) ? match : alt
    ))
    .replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, (match, label, url) => (
      isSafeMarkdownUrl(url) ? match : label
    ));
}

function collectPlainText(tokens = [], parts = []) {
  for (const token of tokens) {
    if (token.type === "text" || token.type === "code_inline" || token.type === "code_block" || token.type === "fence") {
      appendPlainText(parts, stripTaskMarker(token.content));
    }

    if (token.type === "image") {
      appendPlainText(parts, token.content || token.attrGet("alt") || "");
    }

    if (Array.isArray(token.children)) {
      collectPlainText(token.children, parts);
    }
  }
}

function stripTaskMarker(value = "") {
  return String(value || "").replace(/^\[([ xX])\]\s+/, "");
}

function appendPlainText(parts, value = "") {
  const text = String(value || "").trim();
  if (text) {
    parts.push(text);
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value = "") {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

const markdownService = Object.freeze({
  createMarkdownExcerpt,
  isSafeMarkdownUrl,
  markdownToPlainText,
  normalizeMarkdownSource,
  renderMarkdownToHtml,
});

export {
  createMarkdownExcerpt,
  isSafeMarkdownUrl,
  markdownService,
  markdownToPlainText,
  normalizeMarkdownSource,
  renderMarkdownToHtml,
};
