(function initSharedTags(global) {
  const namespace = global.LongtailForge = global.LongtailForge || {};
  const DEFAULT_TAG_COLOR = "#64748b";

  async function loadTags(options = {}) {
    const params = new URLSearchParams({
      status: options.status || "active",
      search: options.search || "",
    });
    const response = await fetch(`/api/tags?${params}`, { cache: "no-store" });

    if (!response.ok) {
      return [];
    }

    const body = await response.json();
    return Array.isArray(body.tags) ? body.tags : [];
  }

  async function createTag(payload = {}) {
    const response = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await readJsonResponse(response);

    if (!response.ok) {
      const error = new Error(body?.message || body?.error || "Unable to create tag.");
      error.status = response.status;
      error.body = body;
      throw error;
    }

    return body?.tag || null;
  }

  function renderTagList(container, tags = []) {
    if (!container) {
      return;
    }

    container.replaceChildren(...(tags.length > 0
      ? tags.map((tag) => createTagChip(tag))
      : []));
  }

  function createTagChip(tag, options = {}) {
    const chip = options.removable ? document.createElement("button") : document.createElement("span");
    const swatch = document.createElement("span");
    const label = document.createElement("span");

    chip.className = options.removable ? "tag-chip tag-chip-remove" : "tag-chip";
    if (options.removable) {
      chip.type = "button";
      chip.dataset.tagPickerRemove = tag.tag_id || "";
      chip.setAttribute("aria-label", `Remove ${tag.name || tag.slug || "tag"}`);
      chip.title = `Remove ${tag.name || tag.slug || "tag"}`;
    }
    swatch.className = "tag-chip-swatch";
    swatch.style.backgroundColor = tag.color || DEFAULT_TAG_COLOR;
    swatch.setAttribute("aria-hidden", "true");
    label.textContent = tag.name || tag.slug || "Tag";
    chip.append(swatch, label);
    return chip;
  }

  async function mountPicker(container, options = {}) {
    if (!container) {
      return null;
    }

    const state = {
      allTags: normalizeTagList(Array.isArray(options.tags) ? options.tags : await loadTags()),
      busy: false,
      selectedTags: [],
    };
    const selectedIds = new Set(normalizeTagIds(options.selectedTags || options.selectedTagIds || []));
    state.selectedTags = [
      ...normalizeTagList(options.selectedTags || []),
      ...state.allTags.filter((tag) => selectedIds.has(tag.tag_id)),
    ].reduce((tags, tag) => {
      if (tag.tag_id && !tags.some((selected) => selected.tag_id === tag.tag_id)) {
        tags.push(tag);
      }
      return tags;
    }, []);

    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    const selectedList = document.createElement("div");
    const inputRow = document.createElement("div");
    const input = document.createElement("input");
    const suggestions = document.createElement("div");
    const status = document.createElement("p");

    fieldset.className = "tag-picker";
    legend.textContent = options.label || "Tags";
    selectedList.className = "tag-picker-selected";
    selectedList.dataset.tagPickerSelectedList = "";
    inputRow.className = "tag-picker-entry";
    input.type = "text";
    input.autocomplete = "off";
    input.className = "tag-picker-input";
    input.dataset.tagPickerInput = "";
    input.placeholder = options.placeholder || "Type a tag and press Enter";
    input.setAttribute("aria-label", `${legend.textContent} entry`);
    input.setAttribute("aria-autocomplete", "list");
    suggestions.className = "tag-picker-suggestions";
    suggestions.dataset.tagPickerSuggestions = "";
    suggestions.hidden = true;
    status.className = "tag-picker-status";
    status.setAttribute("aria-live", "polite");
    status.dataset.tagPickerStatus = "";

    inputRow.append(input, suggestions);
    fieldset.append(legend, selectedList, inputRow, status);
    container.replaceChildren(fieldset);

    function sync() {
      renderSelectedTags(selectedList, state.selectedTags);
      renderSuggestions(suggestions, state, input.value, {
        allowCreate: options.allowCreate !== false,
      });
    }

    async function addByText(rawValue) {
      const name = String(rawValue || "").trim().replace(/\s+/g, " ");
      if (!name || state.busy) {
        return;
      }

      const existing = findTagByNameOrSlug(state.allTags, name);
      if (existing) {
        addSelectedTag(state, existing);
        input.value = "";
        setStatus(status, "");
        sync();
        return;
      }

      if (options.allowCreate === false) {
        setStatus(status, "Select an existing tag from the list.", true);
        sync();
        return;
      }

      state.busy = true;
      input.disabled = true;
      setStatus(status, `Creating ${name}`);
      try {
        const tag = await ensureTag(name, state);
        if (tag) {
          addSelectedTag(state, tag);
          input.value = "";
          setStatus(status, `Added ${tag.name || tag.slug}`);
        }
      } catch (error) {
        setStatus(status, error.message || "Unable to create tag.", true);
      } finally {
        state.busy = false;
        input.disabled = false;
        input.focus();
        sync();
      }
    }

    input.addEventListener("input", sync);
    input.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter" && event.key !== ",") {
        return;
      }

      event.preventDefault();
      await addByText(input.value);
    });

    suggestions.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-tag-picker-suggestion]");
      if (!button) {
        return;
      }

      const action = button.dataset.tagPickerSuggestion;
      if (action === "create") {
        await addByText(input.value);
        return;
      }

      const tag = state.allTags.find((item) => item.tag_id === action);
      if (tag) {
        addSelectedTag(state, tag);
        input.value = "";
        setStatus(status, "");
        sync();
        input.focus();
      }
    });

    selectedList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-tag-picker-remove]");
      if (!button) {
        return;
      }

      state.selectedTags = state.selectedTags.filter((tag) => tag.tag_id !== button.dataset.tagPickerRemove);
      sync();
      input.focus();
    });

    sync();

    return {
      readTagIds: () => state.selectedTags.map((tag) => tag.tag_id).filter(Boolean),
      setSelected: (tagIds = []) => {
        const nextIds = new Set(normalizeTagIds(tagIds));
        state.selectedTags = state.allTags.filter((tag) => nextIds.has(tag.tag_id));
        sync();
      },
    };
  }

  function renderSelectedTags(container, tags) {
    const hiddenInputs = tags.map((tag) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.value = tag.tag_id;
      input.dataset.tagPickerOption = "";
      input.dataset.tagPickerSelected = "";
      return input;
    });
    const chips = tags.length > 0
      ? tags.map((tag) => createTagChip(tag, { removable: true }))
      : [emptySelectedTagHint()];
    container.replaceChildren(...chips, ...hiddenInputs);
  }

  function renderSuggestions(container, state, rawValue, options = {}) {
    const value = String(rawValue || "").trim();
    const normalizedValue = normalizeSlug(value);
    const selectedIds = new Set(state.selectedTags.map((tag) => tag.tag_id));
    const matches = value
      ? state.allTags
        .filter((tag) => !selectedIds.has(tag.tag_id))
        .filter((tag) => matchesTagSearch(tag, value))
        .slice(0, 8)
      : [];
    const exactMatch = value ? findTagByNameOrSlug(state.allTags, value) : null;
    const buttons = matches.map((tag) => createSuggestionButton(tag));

    if (value && options.allowCreate && !exactMatch && normalizedValue) {
      buttons.push(createCreateSuggestionButton(value));
    }

    container.replaceChildren(...buttons);
    container.hidden = buttons.length === 0;
  }

  function createSuggestionButton(tag) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tag-picker-suggestion";
    button.dataset.tagPickerSuggestion = tag.tag_id;
    button.append(createTagChip(tag));
    return button;
  }

  function createCreateSuggestionButton(name) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tag-picker-suggestion tag-picker-create";
    button.dataset.tagPickerSuggestion = "create";
    button.textContent = `Create "${name}"`;
    return button;
  }

  function emptySelectedTagHint() {
    const hint = document.createElement("span");
    hint.className = "tag-picker-empty";
    hint.textContent = "No tags selected";
    return hint;
  }

  async function ensureTag(name, state) {
    try {
      const tag = await createTag({ name });
      if (tag) {
        state.allTags = upsertTag(state.allTags, tag);
      }
      return tag;
    } catch (error) {
      if (error.status !== 409) {
        throw error;
      }

      const loadedTags = await loadTags({ search: name, status: "active" });
      state.allTags = mergeTags(state.allTags, loadedTags);
      const existing = findTagByNameOrSlug(state.allTags, name);
      if (existing) {
        return existing;
      }

      throw error;
    }
  }

  function addSelectedTag(state, tag) {
    if (!tag?.tag_id || state.selectedTags.some((selected) => selected.tag_id === tag.tag_id)) {
      return;
    }

    state.selectedTags = [...state.selectedTags, tag];
  }

  function readTagIds(container) {
    return [...(container?.querySelectorAll("[data-tag-picker-selected]") || [])]
      .map((input) => input.value)
      .filter(Boolean);
  }

  function normalizeTagList(tags = []) {
    return (Array.isArray(tags) ? tags : [])
      .map((tag) => ({
        tag_id: String(tag?.tag_id || "").trim(),
        workspace_id: String(tag?.workspace_id || "").trim(),
        name: String(tag?.name || "").trim(),
        slug: String(tag?.slug || normalizeSlug(tag?.name)).trim(),
        description: String(tag?.description || "").trim(),
        color: String(tag?.color || "").trim(),
        status: String(tag?.status || "active").trim(),
      }))
      .filter((tag) => tag.tag_id);
  }

  function normalizeTagIds(tags = []) {
    return (Array.isArray(tags) ? tags : [])
      .map((tag) => typeof tag === "string" ? tag : tag?.tag_id)
      .map((tagId) => String(tagId || "").trim())
      .filter(Boolean);
  }

  function findTagByNameOrSlug(tags, value) {
    const slug = normalizeSlug(value);
    const name = String(value || "").trim().toLowerCase();
    return tags.find((tag) => normalizeSlug(tag.slug || tag.name) === slug || String(tag.name || "").trim().toLowerCase() === name) || null;
  }

  function matchesTagSearch(tag, value) {
    const query = String(value || "").trim().toLowerCase();
    return String(tag.name || "").toLowerCase().includes(query) || String(tag.slug || "").toLowerCase().includes(query);
  }

  function normalizeSlug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  function upsertTag(tags, tag) {
    return mergeTags(tags, [tag]);
  }

  function mergeTags(currentTags, nextTags) {
    const byId = new Map(normalizeTagList(currentTags).map((tag) => [tag.tag_id, tag]));
    normalizeTagList(nextTags).forEach((tag) => byId.set(tag.tag_id, tag));
    return [...byId.values()].sort((a, b) => String(a.name || a.slug).localeCompare(String(b.name || b.slug)));
  }

  async function readJsonResponse(response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  function setStatus(status, message, isError = false) {
    if (!status) {
      return;
    }

    status.textContent = message || "";
    status.classList.toggle("is-error", Boolean(isError));
  }

  namespace.tags = {
    createTag,
    loadTags,
    mountPicker,
    readTagIds,
    renderTagList,
  };
})(window);
