import { AppError } from "../../core/errors.js";
import {
  MARKDOWN_RENDER_MODES,
  createMarkdownExcerpt as createFrameworkMarkdownExcerpt,
  markdownToPlainText,
  normalizeMarkdownSource,
  renderMarkdownToHtml,
} from "../../core/markdown/markdown.service.js";

/** @typedef {import("../../types/notes-domain-contracts.js").MarkdownNoteInput} MarkdownNoteInput */
/** @typedef {import("../../types/notes-domain-contracts.js").MarkdownSafetyResult} MarkdownSafetyResult */
/** @typedef {import("../../types/notes-domain-contracts.js").NoteRevisionSnapshot} NoteRevisionSnapshot */
/** @typedef {import("../../types/notes-domain-contracts.js").RevisionChange} RevisionChange */
/** @typedef {import("../../types/notes-domain-contracts.js").RevisionChangelogInput} RevisionChangelogInput */
/** @typedef {import("../../types/notes-domain-contracts.js").RevisionSnapshotOptions} RevisionSnapshotOptions */
/** @typedef {import("../../types/notes-domain-contracts.js").WikiLink} WikiLink */

const UNSAFE_MARKDOWN_PATTERNS = [
  /<\s*\/?\s*(script|iframe|object|embed|style|link|meta|form|input|button|textarea|select|option|svg|math)\b/i,
  /\son[a-z]+\s*=/i,
  /\b(?:javascript|vbscript|data)\s*:/i,
];

const WIKI_LINK_PATTERN = /\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g;
/** @type {readonly RevisionChange["field"][]} */
const REVISION_FIELDS = [
  "title",
  "body_markdown",
  "note_type",
  "library_bucket",
  "status",
  "visibility",
  "security_mode",
];

/** @param {string | null | undefined} [markdown] */
function normalizeMarkdown(markdown = "") {
  return normalizeMarkdownSource(markdown);
}

/** @param {string | null | undefined} [markdown] @returns {MarkdownSafetyResult} */
function validateMarkdownSafety(markdown = "") {
  const normalized = normalizeMarkdown(markdown);
  /** @type {string[]} */
  const errors = [];

  for (const pattern of UNSAFE_MARKDOWN_PATTERNS) {
    if (pattern.test(normalized)) {
      errors.push("Markdown contains unsafe HTML, event handlers, or scriptable links.");
      break;
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    markdown: normalized,
  };
}

/** @param {string | null | undefined} [markdown] */
function assertSafeMarkdown(markdown = "") {
  const result = validateMarkdownSafety(markdown);

  if (!result.ok) {
    throw new AppError(result.errors[0] || "Markdown contains unsafe content.", 400);
  }

  return result.markdown;
}

/** @param {string | null | undefined} [markdown] */
function extractPlainTextFromMarkdown(markdown = "") {
  return markdownToPlainText(replaceWikiLinksWithText(markdown));
}

/** @param {string | null | undefined} [markdown] @param {number} [maxLength] */
function createMarkdownExcerpt(markdown = "", maxLength = 220) {
  return createFrameworkMarkdownExcerpt(replaceWikiLinksWithText(markdown), maxLength);
}

/** @param {string | null | undefined} [markdown] */
function renderMarkdownToSafeHtml(markdown = "") {
  const safeMarkdown = assertSafeMarkdown(markdown);
  /** @type {Array<{ placeholder: string, target: string, label: string }>} */
  const wikiLinks = [];
  const placeholderMarkdown = safeMarkdown.replace(WIKI_LINK_PATTERN, (_match, target, label) => {
    const placeholder = `LTFWIKILINK${wikiLinks.length}TOKEN`;
    wikiLinks.push({ placeholder, target, label });
    return placeholder;
  });
  let html = renderMarkdownToHtml(placeholderMarkdown, { mode: MARKDOWN_RENDER_MODES.USER_AUTHORED });

  for (const wikiLink of wikiLinks) {
    html = html.replaceAll(
      wikiLink.placeholder,
      `<span class="note-wiki-link" data-note-title="${escapeAttribute(wikiLink.target)}">${escapeHtml(wikiLink.label || wikiLink.target)}</span>`,
    );
  }

  return html;
}

/** @param {string | null | undefined} [markdown] @returns {WikiLink[]} */
function extractWikiLinks(markdown = "") {
  const normalized = normalizeMarkdown(markdown);
  /** @type {WikiLink[]} */
  const links = [];
  const seen = new Set();
  let match;

  while ((match = WIKI_LINK_PATTERN.exec(normalized)) !== null) {
    const target = normalizeWikiTarget(match[1]);
    const displayText = normalizeWikiTarget(match[2] || match[1]);
    const key = `${target}|${displayText}`;

    if (!target || seen.has(key)) {
      continue;
    }

    seen.add(key);
    links.push({
      targetTitle: target,
      targetSlug: slugifyNoteTitle(target),
      displayText,
      raw: match[0],
      status: "unresolved",
    });
  }

  return links;
}

/**
 * @param {MarkdownNoteInput} [note]
 * @param {RevisionSnapshotOptions} [options]
 * @returns {NoteRevisionSnapshot}
 */
function createRevisionSnapshot(note = {}, options = {}) {
  return {
    note_id: note.note_id || note.noteId || "",
    workspace_id: note.workspace_id || note.workspaceId || "",
    revision_number: Number(options.revisionNumber || options.revision_number || 0),
    title: note.title || "",
    body_markdown: normalizeMarkdown(note.body_markdown || note.bodyMarkdown || ""),
    body_excerpt: note.body_excerpt || note.bodyExcerpt || createMarkdownExcerpt(note.body_markdown || note.bodyMarkdown || ""),
    note_type: note.note_type || note.noteType || "general",
    library_bucket: note.library_bucket || note.libraryBucket || "reference",
    status: note.status || "active",
    visibility: note.visibility || "internal",
    security_mode: note.security_mode || note.securityMode || "normal",
    changed_by_user_id: options.changedByUserId || options.changed_by_user_id || "",
    change_summary: options.changeSummary || options.change_summary || "",
    change_reason: options.changeReason || options.change_reason || "",
    created_at: options.createdAt || options.created_at || new Date().toISOString(),
    metadata_json: options.metadataJson || options.metadata_json || null,
  };
}

/** @param {MarkdownNoteInput} [previousNote] @param {MarkdownNoteInput} [nextNote] @returns {RevisionChange[]} */
function describeRevisionChanges(previousNote = {}, nextNote = {}) {
  return REVISION_FIELDS
    .filter((fieldName) => normalizeComparable(previousNote[fieldName]) !== normalizeComparable(nextNote[fieldName]))
    .map((fieldName) => ({
      field: fieldName,
      previousValue: previousNote[fieldName] ?? null,
      nextValue: nextNote[fieldName] ?? null,
    }));
}

/** @param {MarkdownNoteInput} [previousNote] @param {MarkdownNoteInput} [nextNote] */
function shouldCreateRevision(previousNote = {}, nextNote = {}) {
  return describeRevisionChanges(previousNote, nextNote).length > 0;
}

/** @param {RevisionChangelogInput} [revision] @param {RevisionChange[]} [changes] */
function createChangelogEntry(revision = {}, changes = []) {
  const changedFields = changes.map((change) => change.field);

  return {
    revisionNumber: revision.revision_number || revision.revisionNumber || 0,
    changedByUserId: revision.changed_by_user_id || revision.changedByUserId || "",
    changedAt: revision.created_at || revision.createdAt || "",
    changeSummary: revision.change_summary || revision.changeSummary || "",
    changedFields,
    titleChanged: changedFields.includes("title"),
    bodyChanged: changedFields.includes("body_markdown"),
    libraryBucketChanged: changedFields.includes("library_bucket"),
    visibilityChanged: changedFields.includes("visibility"),
    securityModeChanged: changedFields.includes("security_mode"),
  };
}

/** @param {unknown} value */
function normalizeComparable(value) {
  return value === undefined || value === null ? "" : String(value);
}

/** @param {string | null | undefined} [value] */
function normalizeWikiTarget(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

/** @param {string | null | undefined} [markdown] */
function replaceWikiLinksWithText(markdown = "") {
  return normalizeMarkdown(markdown).replace(WIKI_LINK_PATTERN, (_match, target, label) => label || target);
}

/** @param {string | null | undefined} [value] */
function slugifyNoteTitle(value = "") {
  return normalizeWikiTarget(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** @param {string | null | undefined} [value] */
function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** @param {string | null | undefined} [value] */
function escapeAttribute(value = "") {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

export {
  assertSafeMarkdown,
  createChangelogEntry,
  createMarkdownExcerpt,
  createRevisionSnapshot,
  describeRevisionChanges,
  extractPlainTextFromMarkdown,
  extractWikiLinks,
  normalizeMarkdown,
  renderMarkdownToSafeHtml,
  shouldCreateRevision,
  slugifyNoteTitle,
  validateMarkdownSafety,
};
