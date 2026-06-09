const tagList = document.querySelector("[data-tag-list]");
const tagStatus = document.querySelector("[data-tag-status]");
const tagForm = document.querySelector("[data-tag-form]");
const tagIdInput = document.querySelector("[data-tag-id]");
const tagNameInput = document.querySelector("[data-tag-name]");
const tagSlugInput = document.querySelector("[data-tag-slug]");
const tagColorInput = document.querySelector("[data-tag-color]");
const tagDescriptionInput = document.querySelector("[data-tag-description]");
const tagConflictMessage = document.querySelector("[data-tag-conflict]");
const tagSearchInput = document.querySelector("[data-tag-search]");
const tagRefreshButton = document.querySelector("[data-tag-refresh]");
const tagResetButton = document.querySelector("[data-tag-reset]");
const statusButtons = [...document.querySelectorAll("[data-tag-status-filter]")];

const state = {
  allTags: [],
  status: "active",
  tags: [],
};

statusButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.status = button.dataset.tagStatusFilter || "active";
    statusButtons.forEach((candidate) => {
      candidate.setAttribute("aria-pressed", String(candidate === button));
    });
    loadTags();
  });
});

tagForm?.addEventListener("submit", saveTag);
tagRefreshButton?.addEventListener("click", loadTags);
tagResetButton?.addEventListener("click", resetForm);
tagSearchInput?.addEventListener("input", debounce(loadTags, 250));
tagNameInput?.addEventListener("input", () => {
  if (!tagIdInput?.value && tagSlugInput && !tagSlugInput.value.trim()) {
    tagSlugInput.value = slugify(tagNameInput.value);
  }
  renderTagConflictMessage();
});
tagSlugInput?.addEventListener("input", renderTagConflictMessage);

loadTags();

async function loadTags() {
  setStatus("Loading tags");

  try {
    const params = new URLSearchParams({
      status: state.status,
      search: tagSearchInput?.value || "",
    });
    const [listedTags, allTags] = await Promise.all([
      fetchTags(params),
      fetchTags(new URLSearchParams({ status: "all" })),
    ]);
    state.tags = listedTags;
    state.allTags = allTags;
    renderTags();
    renderTagConflictMessage();
    setStatus("");
  } catch (error) {
    state.tags = [];
    renderTags();
    setStatus(error.message || "Tags unavailable.", true);
  }
}

async function saveTag(event) {
  event.preventDefault();
  const tagId = tagIdInput?.value || "";
  const payload = {
    color: tagColorInput?.value || "",
    description: tagDescriptionInput?.value || "",
    name: tagNameInput?.value || "",
    slug: tagSlugInput?.value || "",
  };
  const endpoint = tagId ? `/api/tags/${encodeURIComponent(tagId)}` : "/api/tags";
  const method = tagId ? "PUT" : "POST";

  setStatus("Saving tag");

  try {
    const response = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(await responseError(response, "Tag save failed."));
    }

    resetForm();
    await loadTags();
    setStatus("Tag saved.");
  } catch (error) {
    setStatus(error.message || "Tag save failed.", true);
  }
}

function renderTags() {
  if (!tagList) {
    return;
  }

  tagList.replaceChildren(...(state.tags.length > 0
    ? state.tags.map(createTagRow)
    : [emptyElement("No tags found")]));
}

function createTagRow(tag) {
  const row = document.createElement("article");
  const swatch = document.createElement("span");
  const summary = document.createElement("div");
  const heading = document.createElement("h2");
  const meta = document.createElement("p");
  const description = document.createElement("p");
  const usage = document.createElement("p");
  const actions = document.createElement("div");
  const archiveLabel = tag.status === "active" ? "Archive" : "Restore";
  const editButton = createTagActionButton("Edit", "edit");
  const archiveButton = createTagActionButton(archiveLabel, tag.status === "active" ? "archive" : "restore", {
    danger: tag.status === "active",
  });

  row.className = `tag-row is-${tag.status || "active"}`;
  swatch.className = "tag-swatch";
  swatch.style.backgroundColor = tag.color || "#64748b";
  swatch.setAttribute("aria-hidden", "true");

  summary.className = "tag-row-summary";
  heading.textContent = tag.name || "Tag";
  meta.className = "tag-row-meta";
  renderTagMetadata(meta, tag);
  description.textContent = tag.description || "";
  description.className = "tag-row-description";
  usage.className = "tag-row-usage";
  usage.textContent = usageText(tag);
  summary.append(heading, meta, usage, description);

  actions.className = "tag-row-actions";
  editButton.addEventListener("click", () => editTag(tag));

  archiveButton.addEventListener("click", () => mutateTagStatus(tag));
  actions.append(editButton, archiveButton);

  row.append(swatch, summary, actions);
  return row;
}

function createTagActionButton(label, icon, options = {}) {
  if (window.LongtailForge.icons?.createIconButton) {
    return window.LongtailForge.icons.createIconButton({
      icon,
      label,
      title: label,
      variant: options.danger ? "danger" : "",
    });
  }

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.classList.toggle("danger-button", options.danger === true);
  return button;
}

function editTag(tag) {
  if (tagIdInput) {
    tagIdInput.value = tag.tag_id || "";
  }
  if (tagNameInput) {
    tagNameInput.value = tag.name || "";
    tagNameInput.focus();
  }
  if (tagSlugInput) {
    tagSlugInput.value = tag.slug || "";
  }
  if (tagColorInput) {
    tagColorInput.value = /^#[0-9A-Fa-f]{6}$/.test(tag.color || "") ? tag.color : "#2f6fed";
  }
  if (tagDescriptionInput) {
    tagDescriptionInput.value = tag.description || "";
  }
  renderTagConflictMessage();
}

async function mutateTagStatus(tag) {
  const action = tag.status === "active" ? "archive" : "restore";
  setStatus(`${action === "archive" ? "Archiving" : "Restoring"} tag`);

  try {
    const response = await fetch(`/api/tags/${encodeURIComponent(tag.tag_id)}/${action}`, { method: "POST" });
    if (!response.ok) {
      throw new Error(await responseError(response, "Tag update failed."));
    }

    await loadTags();
    setStatus(action === "archive" ? "Tag archived." : "Tag restored.");
  } catch (error) {
    setStatus(error.message || "Tag update failed.", true);
  }
}

function resetForm() {
  tagForm?.reset();
  if (tagIdInput) {
    tagIdInput.value = "";
  }
  if (tagColorInput) {
    tagColorInput.value = "#2f6fed";
  }
  renderTagConflictMessage();
  tagNameInput?.focus();
}

function renderTagMetadata(container, tag) {
  container.replaceChildren(
    metadataBadge(`Slug: ${tag.slug || "none"}`),
    metadataBadge(`Status: ${tag.status || "active"}`),
    metadataBadge(`Updated: ${formatDate(tag.updated_at)}`),
    metadataBadge(`ID: ${tag.tag_id || "unknown"}`),
  );
}

function metadataBadge(text) {
  const badge = document.createElement("span");
  badge.className = "tag-metadata-badge";
  badge.textContent = text;
  return badge;
}

function usageText(tag) {
  const count = Number(tag.usage_count || 0);
  const direct = Number(tag.direct_usage_count || 0);
  const propagated = Number(tag.propagated_usage_count || 0);
  const system = Number(tag.system_usage_count || 0);
  const parts = [`${count} ${count === 1 ? "use" : "uses"}`];

  if (direct || propagated || system) {
    parts.push(`${direct} direct`);
    parts.push(`${propagated} propagated`);
    if (system) {
      parts.push(`${system} system`);
    }
  }

  return parts.join(" | ");
}

function renderTagConflictMessage() {
  if (!tagConflictMessage) {
    return;
  }

  const conflict = findPotentialTagConflict();
  tagConflictMessage.textContent = conflict
    ? `Existing tag uses this normalized slug: ${conflict.name || conflict.slug}. Edit that tag or choose a different name.`
    : "";
  tagConflictMessage.hidden = !conflict;
}

function findPotentialTagConflict() {
  const currentTagId = tagIdInput?.value || "";
  const normalizedSlug = slugify(tagSlugInput?.value || tagNameInput?.value || "");

  if (!normalizedSlug) {
    return null;
  }

  return state.allTags.find((tag) => tag.tag_id !== currentTagId && slugify(tag.slug || tag.name) === normalizedSlug) || null;
}

async function fetchTags(params) {
  const response = await fetch(`/api/tags?${params}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await responseError(response, "Tags unavailable."));
  }

  const body = await response.json();
  return Array.isArray(body.tags) ? body.tags : [];
}

function formatDate(value) {
  const date = value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return "unknown";
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function setStatus(message, isError = false) {
  if (!tagStatus) {
    return;
  }

  tagStatus.textContent = message;
  tagStatus.className = isError ? "error-message" : "";
}

function emptyElement(message) {
  const element = document.createElement("p");
  element.className = "empty-state";
  element.textContent = message;
  return element;
}

async function responseError(response, fallback) {
  try {
    const body = await response.json();
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function debounce(callback, delay) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
}
