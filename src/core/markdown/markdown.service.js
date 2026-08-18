import MarkdownIt from "markdown-it";

/** @typedef {import("markdown-it").MarkdownIt} MarkdownParser */
/** @typedef {import("markdown-it").MarkdownItOptions} MarkdownParserOptions */
/** @typedef {import("markdown-it").Renderer} MarkdownRenderer */
/** @typedef {import("markdown-it").StateInline} MarkdownInlineState */
/** @typedef {import("markdown-it").Token} MarkdownToken */
/** @typedef {"document" | "user-authored"} MarkdownRenderMode */
/** @typedef {{ allowImages?: boolean, mode?: MarkdownRenderMode, renderMode?: MarkdownRenderMode, softLineBreaks?: boolean }} MarkdownRenderPreferences */
/** @typedef {import("markdown-it").Env & { allowImages?: boolean }} MarkdownRenderEnvironment */
/** @typedef {(tokens: MarkdownToken[], index: number, options: Required<MarkdownParserOptions>, env: MarkdownRenderEnvironment | undefined, renderer: MarkdownRenderer) => string} MarkdownRendererRule */
/** @typedef {string} SanitizedMarkdownHtml */

const SAFE_LINK_SCHEMES = new Set(["http:", "https:", "mailto:"]);
const SAFE_RELATIVE_PREFIXES = ["./", "../", "#"];
const TASK_LIST_ITEM_PATTERN = /<li>\[([ xX])\]\s+/g;
const PLUS_MARKER = 0x2B;
const BACKSLASH_MARKER = 0x5C;
const LINE_FEED_MARKER = 0x0A;
/** @type {Readonly<{ DOCUMENT: "document", USER_AUTHORED: "user-authored" }>} */
const MARKDOWN_RENDER_MODES = Object.freeze({
  DOCUMENT: "document",
  USER_AUTHORED: "user-authored",
});

const documentParser = createParser();
const userAuthoredParser = createParser({ softLineBreaks: true });

/** @param {unknown} [markdown] @returns {string} */
function normalizeMarkdownSource(markdown = "") {
  return String(markdown || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

/** @param {unknown} [markdown] @param {MarkdownRenderPreferences} [options] @returns {SanitizedMarkdownHtml} */
function renderMarkdownToHtml(markdown = "", options = {}) {
  const source = stripUnsafeMarkdownLinks(normalizeMarkdownSource(markdown));
  const html = parserForOptions(options).render(source, { allowImages: options.allowImages === true });

  return applyTaskListMarkup(html);
}

/** @param {unknown} [markdown] @param {MarkdownRenderPreferences} [options] @returns {string} */
function markdownToPlainText(markdown = "", options = {}) {
  const source = stripUnsafeMarkdownLinks(normalizeMarkdownSource(markdown));
  const tokens = parserForOptions(options).parse(source, { allowImages: options.allowImages === true });
  /** @type {string[]} */
  const parts = [];

  collectPlainText(tokens, parts);

  return parts
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** @param {unknown} [markdown] @param {number} [maxLength] @returns {string} */
function createMarkdownExcerpt(markdown = "", maxLength = 220) {
  const text = markdownToPlainText(markdown);

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

/** @param {unknown} [url] @returns {boolean} */
function isSafeMarkdownUrl(url = "") {
  const value = String(url || "").trim();

  if (!value) {
    return false;
  }

  if (value.startsWith("/")) {
    return !value.startsWith("//")
      && !value.startsWith("/\\")
      && !/[\u0000-\u001F\u007F]/.test(value);
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

/** @param {{ softLineBreaks?: boolean }} [preferences] @returns {MarkdownParser} */
function createParser({ softLineBreaks = false } = {}) {
  const parser = MarkdownIt("commonmark", {
    html: false,
    linkify: false,
    typographer: false,
    breaks: softLineBreaks,
  }).enable(["table"]);

  parser.disable(["strikethrough"]);
  parser.inline.ruler.before("emphasis", "underline", underlineRule);
  parser.validateLink = (url) => isSafeMarkdownUrl(url);

  /** @type {MarkdownRendererRule} */
  parser.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const hrefIndex = token.attrIndex("href");

    if (hrefIndex >= 0 && !isSafeMarkdownUrl(token.attrGet("href"))) {
      token.attrs?.splice(hrefIndex, 1);
    }

    const target = token.attrGet("target");
    if (target === "_blank") {
      token.attrSet("rel", "noopener noreferrer");
    }

    return self.renderToken(tokens, index, options);
  };

  /** @type {MarkdownRendererRule} */
  parser.renderer.rules.image = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const src = token.attrGet("src") || "";

    if (!env?.allowImages || !isSafeMarkdownUrl(src)) {
      return escapeHtml(token.content || token.attrGet("alt") || "");
    }

    const altText = Array.isArray(token.children)
      ? self.renderInlineAsText(token.children, options, env)
      : token.content || token.attrGet("alt") || "";
    const alt = escapeAttribute(altText);
    return `<img src="${escapeAttribute(src)}" alt="${alt}">`;
  };

  return parser;
}

/** @param {MarkdownInlineState} state @param {boolean} silent @returns {boolean} */
function underlineRule(state, silent) {
  const start = state.pos;

  if (
    state.src.charCodeAt(start) !== PLUS_MARKER ||
    state.src.charCodeAt(start + 1) !== PLUS_MARKER
  ) {
    return false;
  }

  const contentStart = start + 2;
  const contentEnd = findUnderlineClose(state.src, contentStart, state.posMax);

  if (contentEnd < 0 || contentEnd === contentStart) {
    return false;
  }

  if (silent) {
    return true;
  }

  const originalPosMax = state.posMax;
  state.push("underline_open", "u", 1).markup = "++";
  state.pos = contentStart;
  state.posMax = contentEnd;
  state.md.inline.tokenize(state);
  state.push("underline_close", "u", -1).markup = "++";
  state.pos = contentEnd + 2;
  state.posMax = originalPosMax;
  return true;
}

/** @param {string} [source] @param {number} [start] @param {number} [max] @returns {number} */
function findUnderlineClose(source = "", start = 0, max = source.length) {
  for (let index = start; index < max - 1; index += 1) {
    const code = source.charCodeAt(index);

    if (code === LINE_FEED_MARKER) {
      return -1;
    }

    if (
      code === PLUS_MARKER &&
      source.charCodeAt(index + 1) === PLUS_MARKER &&
      source.charCodeAt(index - 1) !== BACKSLASH_MARKER
    ) {
      return index;
    }
  }

  return -1;
}

/** @param {MarkdownRenderPreferences} [options] @returns {MarkdownParser} */
function parserForOptions(options = {}) {
  return usesUserAuthoredMode(options) ? userAuthoredParser : documentParser;
}

/** @param {MarkdownRenderPreferences} [options] @returns {boolean} */
function usesUserAuthoredMode(options = {}) {
  return options.softLineBreaks === true ||
    options.mode === MARKDOWN_RENDER_MODES.USER_AUTHORED ||
    options.renderMode === MARKDOWN_RENDER_MODES.USER_AUTHORED;
}

/** @param {unknown} [html] @returns {SanitizedMarkdownHtml} */
function applyTaskListMarkup(html = "") {
  return String(html || "").replace(TASK_LIST_ITEM_PATTERN, (_match, state) => {
    const checked = state.trim() ? " checked" : "";
    return `<li class="markdown-task-list-item"><input class="markdown-task-list-checkbox" type="checkbox" disabled${checked}> `;
  });
}

/** @param {unknown} [markdown] @returns {string} */
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

/** @param {MarkdownToken[]} [tokens] @param {string[]} [parts] @returns {void} */
function collectPlainText(tokens = [], parts = []) {
  for (const token of tokens) {
    if (token.type === "text" || token.type === "code_inline" || token.type === "code_block" || token.type === "fence") {
      appendPlainText(parts, stripTaskMarker(token.content));
    }

    if (token.type === "image") {
      if (Array.isArray(token.children)) {
        collectPlainText(token.children, parts);
      } else {
        appendPlainText(parts, token.content || token.attrGet("alt") || "");
      }
      continue;
    }

    if (Array.isArray(token.children)) {
      collectPlainText(token.children, parts);
    }
  }
}

/** @param {unknown} [value] @returns {string} */
function stripTaskMarker(value = "") {
  return String(value || "").replace(/^\[([ xX])\]\s+/, "");
}

/** @param {string[]} parts @param {unknown} [value] @returns {void} */
function appendPlainText(parts, value = "") {
  const text = String(value || "").trim();
  if (text) {
    parts.push(text);
  }
}

/** @param {unknown} [value] @returns {string} */
function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** @param {unknown} [value] @returns {string} */
function escapeAttribute(value = "") {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

const markdownService = Object.freeze({
  MARKDOWN_RENDER_MODES,
  createMarkdownExcerpt,
  isSafeMarkdownUrl,
  markdownToPlainText,
  normalizeMarkdownSource,
  renderMarkdownToHtml,
});

export {
  MARKDOWN_RENDER_MODES,
  createMarkdownExcerpt,
  isSafeMarkdownUrl,
  markdownService,
  markdownToPlainText,
  normalizeMarkdownSource,
  renderMarkdownToHtml,
};
