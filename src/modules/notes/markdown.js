const UNSAFE_MARKDOWN_PATTERNS = [
  /<\s*\/?\s*(script|iframe|object|embed|style|link|meta|form|input|button|textarea|select|option|svg|math)\b/i,
  /\son[a-z]+\s*=/i,
  /\b(?:javascript|vbscript|data)\s*:/i,
];

const WIKI_LINK_PATTERN = /\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g;
const REVISION_FIELDS = [
  "title",
  "body_markdown",
  "note_type",
  "library_bucket",
  "status",
  "visibility",
  "security_mode",
];

function normalizeMarkdown(markdown = "") {
  return String(markdown || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

function validateMarkdownSafety(markdown = "") {
  const normalized = normalizeMarkdown(markdown);
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

function assertSafeMarkdown(markdown = "") {
  const result = validateMarkdownSafety(markdown);

  if (!result.ok) {
    throw new Error(result.errors[0]);
  }

  return result.markdown;
}

function extractPlainTextFromMarkdown(markdown = "") {
  return normalizeMarkdown(markdown)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(WIKI_LINK_PATTERN, (_match, target, label) => label || target)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/[*_~>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function createMarkdownExcerpt(markdown = "", maxLength = 220) {
  const text = extractPlainTextFromMarkdown(markdown);

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function renderMarkdownToSafeHtml(markdown = "") {
  const safeMarkdown = assertSafeMarkdown(markdown);
  const lines = safeMarkdown.split("\n");
  const html = [];
  const listStack = [];
  let inCodeBlock = false;
  let codeLines = [];

  function closeListsToDepth(depth = 0) {
    while (listStack.length > depth) {
      closeList();
    }
  }

  function closeList() {
    const current = listStack.pop();
    if (!current) {
      return;
    }

    closeCurrentListItem(current);
    html.push(`</${current.type}>`);
  }

  function closeCurrentListItem(current = listStack.at(-1)) {
    if (current?.liOpen) {
      html.push("</li>");
      current.liOpen = false;
    }
  }

  function appendListItem(type, indent, content) {
    let current = listStack.at(-1);

    if (!current || indent > current.indent) {
      html.push(`<${type}>`);
      listStack.push({ type, indent, liOpen: false });
      current = listStack.at(-1);
    } else {
      while (listStack.length && indent < listStack.at(-1).indent) {
        closeList();
      }

      current = listStack.at(-1);
      if (!current || current.indent !== indent || current.type !== type) {
        if (current && current.indent === indent && current.type !== type) {
          closeList();
        }
        html.push(`<${type}>`);
        listStack.push({ type, indent, liOpen: false });
        current = listStack.at(-1);
      } else {
        closeCurrentListItem(current);
      }
    }

    html.push(`<li>${content}`);
    current.liOpen = true;
  }

  function flushCode() {
    html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    codeLines = [];
  }

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      closeListsToDepth();
      if (inCodeBlock) {
        flushCode();
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      closeListsToDepth();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeListsToDepth();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const blockquote = line.match(/^>\s?(.*)$/);
    if (blockquote) {
      closeListsToDepth();
      html.push(`<blockquote>${renderInlineMarkdown(blockquote[1])}</blockquote>`);
      continue;
    }

    const checklist = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.+)$/);
    if (checklist) {
      const checked = checklist[2].trim() ? " checked" : "";
      appendListItem(
        "ul",
        indentationWidth(checklist[1]),
        `<input type="checkbox" disabled${checked}> ${renderInlineMarkdown(checklist[3])}`,
      );
      continue;
    }

    const unordered = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (unordered) {
      appendListItem("ul", indentationWidth(unordered[1]), renderInlineMarkdown(unordered[2]));
      continue;
    }

    const ordered = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (ordered) {
      appendListItem("ol", indentationWidth(ordered[1]), renderInlineMarkdown(ordered[2]));
      continue;
    }

    closeListsToDepth();
    html.push(`<p>${renderInlineMarkdown(line)}</p>`);
  }

  closeListsToDepth();
  if (inCodeBlock) {
    flushCode();
  }

  return html.join("\n");
}

function indentationWidth(value = "") {
  return String(value || "").replace(/\t/g, "    ").length;
}

function renderInlineMarkdown(value = "") {
  let output = escapeHtml(value);

  output = output.replace(/`([^`]+)`/g, (_match, code) => `<code>${code}</code>`);
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  output = output.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_match, label, url) =>
    `<a href="${escapeAttribute(url)}" rel="noopener noreferrer">${label}</a>`);
  output = output.replace(WIKI_LINK_PATTERN, (_match, target, label) => {
    const display = escapeHtml(label || target);
    return `<span class="note-wiki-link" data-note-title="${escapeAttribute(target)}">${display}</span>`;
  });

  return output;
}

function extractWikiLinks(markdown = "") {
  const normalized = normalizeMarkdown(markdown);
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

function describeRevisionChanges(previousNote = {}, nextNote = {}) {
  return REVISION_FIELDS
    .filter((fieldName) => normalizeComparable(previousNote[fieldName]) !== normalizeComparable(nextNote[fieldName]))
    .map((fieldName) => ({
      field: fieldName,
      previousValue: previousNote[fieldName] ?? null,
      nextValue: nextNote[fieldName] ?? null,
    }));
}

function shouldCreateRevision(previousNote = {}, nextNote = {}) {
  return describeRevisionChanges(previousNote, nextNote).length > 0;
}

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

function normalizeComparable(value) {
  return value === undefined || value === null ? "" : String(value);
}

function normalizeWikiTarget(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function slugifyNoteTitle(value = "") {
  return normalizeWikiTarget(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
