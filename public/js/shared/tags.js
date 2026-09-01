(function initSharedTags(global) {
  const namespace = global.LongtailForge = global.LongtailForge || {};
  const DEFAULT_TAG_COLOR = "#64748b";
  const NO_TAGS_FILTER_VALUE = "__no_tags__";
  const mountedPickers = new Set();
  let tagPickerId = 0;
  let tagSuggestionId = 0;

  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserErrorContract} BrowserErrorContract */

  /**
   * The narrowing contract for the values this file catches.
   *
   * A `catch` binding is `unknown` and no declaration can change that: anything can be
   * thrown. Every page that loads this script also loads `shared/error-contract.js`, so the
   * checked read fails exactly where the raw `error.message` read failed before.
   * @returns {BrowserErrorContract}
   */
  function requireErrors() {
    const errors = namespace?.errors;
    if (!errors) {
      throw new Error("Shared tags requires LongtailForge.errors.");
    }
    return errors;
  }

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
      const error = namespace.errors?.createError?.(body, "Unable to create tag.", response.status)
        || new Error("Unable to create tag.");
      error.status = response.status;
      error.body = body;
      throw error;
    }

    const tag = body?.tag || null;
    notifyTagCreated(tag);
    return tag;
  }

  async function suppressPropagatedTag(assignmentId) {
    const response = await fetch(`/api/tags/assignments/${encodeURIComponent(assignmentId)}/suppress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = await readJsonResponse(response);

    if (!response.ok) {
      const error = namespace.errors?.createError?.(
        body,
        "Unable to remove inherited tag.",
        response.status,
      ) || new Error("Unable to remove inherited tag.");
      error.status = response.status;
      error.body = body;
      throw error;
    }

    return body;
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
    if (isPropagatedTag(tag)) {
      chip.classList.add("tag-chip-inherited");
    } else if (isSystemTag(tag)) {
      chip.classList.add("tag-chip-system");
    }
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
    if (options.showOrigin && !options.suppressible && !options.removable && !isDirectTag(tag)) {
      chip.append(createOriginBadge(tag));
    }
    return chip;
  }

  async function mountPicker(container, options = {}) {
    if (!container) {
      return null;
    }

    const state = {
      activeSuggestionIndex: -1,
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
    input.setAttribute("role", "combobox");
    suggestions.className = "tag-picker-suggestions";
    suggestions.dataset.tagPickerSuggestions = "";
    suggestions.id = `tag-picker-suggestions-${++tagPickerId}`;
    suggestions.hidden = true;
    suggestions.setAttribute("role", "listbox");
    suggestions.setAttribute("aria-label", `${legend.textContent} suggestions`);
    input.setAttribute("aria-controls", suggestions.id);
    input.setAttribute("aria-expanded", "false");
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
        state.activeSuggestionIndex = -1;
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
          state.activeSuggestionIndex = -1;
          setStatus(status, `Added ${tag.name || tag.slug}`);
        }
      } catch (error) {
        setStatus(status, requireErrors().caughtMessage(error, "Unable to create tag."), true);
      } finally {
        state.busy = false;
        input.disabled = false;
        input.focus();
        sync();
      }
    }

    input.addEventListener("input", () => {
      state.activeSuggestionIndex = -1;
      sync();
    });
    input.addEventListener("keydown", async (event) => {
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        moveTagSuggestionSelection(input, suggestions, state, event.key === "ArrowDown" ? 1 : -1);
        return;
      }

      if (event.key !== "Enter" && event.key !== ",") {
        return;
      }

      event.preventDefault();
      const activeSuggestion = suggestions.querySelector('[aria-selected="true"]');
      if (activeSuggestion) {
        activeSuggestion.click();
        return;
      }
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
        state.activeSuggestionIndex = -1;
        setStatus(status, "");
        sync();
        input.focus();
      }
    });

    selectedList.addEventListener("click", async (event) => {
      const suppressButton = event.target.closest("[data-tag-picker-suppress]");
      if (suppressButton) {
        const assignmentId = suppressButton.dataset.tagPickerSuppress;
        if (!assignmentId || state.busy) {
          return;
        }

        state.busy = true;
        suppressButton.disabled = true;
        setStatus(status, "Removing inherited tag");
        try {
          await suppressPropagatedTag(assignmentId);
          state.selectedTags = state.selectedTags.filter((tag) => tag.tag_assignment_id !== assignmentId);
          setStatus(status, "Inherited tag removed from this record.");
        } catch (error) {
          suppressButton.disabled = false;
          setStatus(status, requireErrors().caughtMessage(error, "Unable to remove inherited tag."), true);
        } finally {
          state.busy = false;
          sync();
          input.focus();
        }
        return;
      }

      const button = event.target.closest("[data-tag-picker-remove]");
      if (!button) {
        return;
      }

      state.selectedTags = state.selectedTags.filter((tag) => !(tag.tag_id === button.dataset.tagPickerRemove && isDirectTag(tag)));
      sync();
      input.focus();
    });

    sync();

    const pickerController = {
      container,
      refreshTags: async () => {
        if (!document.documentElement.contains(container)) {
          mountedPickers.delete(pickerController);
          return;
        }

        state.allTags = mergeTags(state.allTags, await loadTags());
        sync();
      },
    };
    mountedPickers.add(pickerController);

    return {
      readTagIds: () => state.selectedTags.filter(isDirectTag).map((tag) => tag.tag_id).filter(Boolean),
      refreshTags: pickerController.refreshTags,
      setSelected: (tagIds = []) => {
        const nextIds = new Set(normalizeTagIds(tagIds));
        state.selectedTags = state.allTags.filter((tag) => nextIds.has(tag.tag_id));
        sync();
      },
    };
  }

  function renderSelectedTags(container, tags) {
    const hiddenInputs = tags.filter(isDirectTag).map((tag) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.value = tag.tag_id;
      input.dataset.tagPickerOption = "";
      input.dataset.tagPickerSelected = "";
      return input;
    });
    const chips = tags.length > 0
      ? tags.map((tag) => createSelectedTagChip(tag))
      : [emptySelectedTagHint()];
    container.replaceChildren(...chips, ...hiddenInputs);
  }

  function createSelectedTagChip(tag) {
    if (isDirectTag(tag)) {
      return createTagChip(tag, { removable: true });
    }

    const wrapper = document.createElement("span");
    wrapper.className = "tag-picker-readonly-tag";
    wrapper.append(createTagChip(tag, { showOrigin: true }));

    if (isPropagatedTag(tag) && tag.tag_assignment_id) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tag-picker-suppress";
      button.dataset.tagPickerSuppress = tag.tag_assignment_id;
      button.textContent = "Remove from this record";
      button.title = "Suppress this inherited tag on the current record";
      wrapper.append(button);
    }

    return wrapper;
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

    if (state.activeSuggestionIndex >= buttons.length) {
      state.activeSuggestionIndex = buttons.length - 1;
    }
    container.replaceChildren(...buttons);
    container.hidden = buttons.length === 0;
    const pickerInput = container.previousElementSibling;
    pickerInput?.setAttribute("aria-expanded", buttons.length > 0 ? "true" : "false");
    syncTagSuggestionSelection(container, state);
  }

  function createSuggestionButton(tag) {
    const button = document.createElement("button");
    button.id = `tag-picker-suggestion-${++tagSuggestionId}`;
    button.type = "button";
    button.className = "tag-picker-suggestion";
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", "false");
    button.dataset.tagPickerSuggestion = tag.tag_id;
    button.append(createTagChip(tag));
    return button;
  }

  function createCreateSuggestionButton(name) {
    const button = document.createElement("button");
    button.id = `tag-picker-suggestion-${++tagSuggestionId}`;
    button.type = "button";
    button.className = "tag-picker-suggestion tag-picker-create";
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", "false");
    button.dataset.tagPickerSuggestion = "create";
    button.textContent = `Create "${name}"`;
    return button;
  }

  function moveTagSuggestionSelection(input, container, state, direction) {
    const buttons = [...container.querySelectorAll("[data-tag-picker-suggestion]")];
    if (buttons.length === 0) {
      state.activeSuggestionIndex = -1;
      input.removeAttribute("aria-activedescendant");
      return;
    }

    const currentIndex = Number.isInteger(state.activeSuggestionIndex) ? state.activeSuggestionIndex : -1;
    state.activeSuggestionIndex = direction > 0
      ? (currentIndex + 1 + buttons.length) % buttons.length
      : (currentIndex <= 0 ? buttons.length - 1 : currentIndex - 1);
    syncTagSuggestionSelection(container, state, input);
  }

  function syncTagSuggestionSelection(container, state, input = container.previousElementSibling) {
    const buttons = [...container.querySelectorAll("[data-tag-picker-suggestion]")];
    buttons.forEach((button, index) => {
      const selected = index === state.activeSuggestionIndex;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", selected ? "true" : "false");
      if (selected) {
        input?.setAttribute("aria-activedescendant", button.id);
        button.scrollIntoView?.({ block: "nearest" });
      }
    });
    if (!buttons.some((button) => button.getAttribute("aria-selected") === "true")) {
      input?.removeAttribute("aria-activedescendant");
    }
  }

  function mountFilterPicker(input, options = {}) {
    if (!input) {
      return null;
    }

    input._tagFilterPickerCleanup?.();
    const state = {
      activeSuggestionIndex: -1,
      allTags: normalizeTagList(options.tags || []),
      value: normalizeFilterValue(options.value),
    };
    const suggestions = document.createElement("div");
    suggestions.className = "tag-picker-suggestions tag-filter-suggestions";
    suggestions.dataset.tagFilterSuggestions = "";
    suggestions.id = `tag-filter-suggestions-${++tagPickerId}`;
    suggestions.hidden = true;
    suggestions.setAttribute("role", "listbox");
    suggestions.setAttribute("aria-label", `${input.getAttribute("aria-label") || "Tag filter"} suggestions`);
    input.parentElement?.appendChild(suggestions);
    input.autocomplete = "off";
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", suggestions.id);
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("role", "combobox");

    function choices() {
      return [
        { value: "all", label: "All tags", keywords: "all any" },
        { value: NO_TAGS_FILTER_VALUE, label: "No Tags", keywords: "none untagged" },
        ...state.allTags.map((tag) => ({
          value: tag.tag_id,
          label: tag.name || tag.slug || "Tag",
          keywords: `${tag.slug || ""} ${tag.description || ""}`,
          tag,
        })),
      ];
    }

    function selectedChoice() {
      return choices().find((choice) => choice.value === state.value) || choices()[0];
    }

    function writeSelectedChoice() {
      const choice = selectedChoice();
      state.value = choice.value;
      input.value = choice.label;
      input.dataset.tagFilterValue = choice.value;
      input.dataset.tagFilterLabel = choice.label;
    }

    function renderFilterSuggestions() {
      const query = String(input.value || "").trim().toLowerCase();
      const matches = choices()
        .filter((choice) => !query || `${choice.label} ${choice.keywords || ""}`.toLowerCase().includes(query))
        .slice(0, 10);
      const buttons = matches.map((choice) => {
        const button = document.createElement("button");
        button.id = `tag-filter-suggestion-${++tagSuggestionId}`;
        button.type = "button";
        button.className = "tag-picker-suggestion";
        button.dataset.tagFilterSuggestion = choice.value;
        button.setAttribute("role", "option");
        button.setAttribute("aria-selected", "false");
        if (choice.tag) {
          button.append(createTagChip(choice.tag));
        } else {
          button.textContent = choice.label;
        }
        return button;
      });
      if (state.activeSuggestionIndex >= buttons.length) {
        state.activeSuggestionIndex = buttons.length - 1;
      }
      suggestions.replaceChildren(...buttons);
      suggestions.hidden = buttons.length === 0;
      input.setAttribute("aria-expanded", buttons.length > 0 ? "true" : "false");
      syncFilterSuggestionSelection();
    }

    function syncFilterSuggestionSelection() {
      const buttons = [...suggestions.querySelectorAll("[data-tag-filter-suggestion]")];
      buttons.forEach((button, index) => {
        const selected = index === state.activeSuggestionIndex;
        button.classList.toggle("is-active", selected);
        button.setAttribute("aria-selected", selected ? "true" : "false");
        if (selected) {
          input.setAttribute("aria-activedescendant", button.id);
          button.scrollIntoView?.({ block: "nearest" });
        }
      });
      if (!buttons.some((button) => button.getAttribute("aria-selected") === "true")) {
        input.removeAttribute("aria-activedescendant");
      }
    }

    function choose(value, { notify = true } = {}) {
      state.value = normalizeFilterValue(value);
      state.activeSuggestionIndex = -1;
      writeSelectedChoice();
      suggestions.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      if (notify) {
        input.dispatchEvent(new input.ownerDocument.defaultView.Event("change", { bubbles: true }));
      }
    }

    function handleInput() {
      state.activeSuggestionIndex = -1;
      renderFilterSuggestions();
    }

    function handleFocus() {
      input.select?.();
      renderFilterSuggestions();
    }

    function handleBlur() {
      global.setTimeout(() => {
        if (!suggestions.contains(document.activeElement)) {
          writeSelectedChoice();
          suggestions.hidden = true;
          input.setAttribute("aria-expanded", "false");
        }
      }, 120);
    }

    function handleKeydown(event) {
      const buttons = [...suggestions.querySelectorAll("[data-tag-filter-suggestion]")];
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        if (suggestions.hidden) {
          renderFilterSuggestions();
        }
        const count = buttons.length || suggestions.querySelectorAll("[data-tag-filter-suggestion]").length;
        if (count > 0) {
          state.activeSuggestionIndex = event.key === "ArrowDown"
            ? (state.activeSuggestionIndex + 1 + count) % count
            : (state.activeSuggestionIndex <= 0 ? count - 1 : state.activeSuggestionIndex - 1);
          syncFilterSuggestionSelection();
        }
        return;
      }
      if (event.key === "Escape") {
        writeSelectedChoice();
        suggestions.hidden = true;
        input.setAttribute("aria-expanded", "false");
        return;
      }
      if (event.key === "Enter") {
        const active = suggestions.querySelector('[data-tag-filter-suggestion][aria-selected="true"]')
          || suggestions.querySelector("[data-tag-filter-suggestion]");
        if (active) {
          event.preventDefault();
          choose(active.dataset.tagFilterSuggestion);
        }
      }
    }

    function handleSuggestionClick(event) {
      const button = event.target.closest("[data-tag-filter-suggestion]");
      if (button) {
        choose(button.dataset.tagFilterSuggestion);
        input.focus();
      }
    }

    input.addEventListener("input", handleInput);
    input.addEventListener("focus", handleFocus);
    input.addEventListener("blur", handleBlur);
    input.addEventListener("keydown", handleKeydown);
    const handleSuggestionMouseDown = (event) => event.preventDefault();
    suggestions.addEventListener("mousedown", handleSuggestionMouseDown);
    suggestions.addEventListener("click", handleSuggestionClick);
    writeSelectedChoice();

    const controller = {
      readValue: () => state.value,
      setTags: (tags = []) => {
        state.allTags = normalizeTagList(tags);
        if (!choices().some((choice) => choice.value === state.value)) {
          state.value = "all";
        }
        writeSelectedChoice();
      },
      setValue: (value, setOptions = {}) => choose(value, { notify: setOptions.notify === true }),
      destroy: () => input._tagFilterPickerCleanup?.(),
    };
    input._tagFilterPickerCleanup = () => {
      input.removeEventListener("input", handleInput);
      input.removeEventListener("focus", handleFocus);
      input.removeEventListener("blur", handleBlur);
      input.removeEventListener("keydown", handleKeydown);
      suggestions.removeEventListener("mousedown", handleSuggestionMouseDown);
      suggestions.removeEventListener("click", handleSuggestionClick);
      suggestions.remove();
      delete input._tagFilterPickerCleanup;
    };
    return controller;
  }

  function normalizeFilterValue(value) {
    const normalized = String(value || "").trim();
    return normalized === "__no_effective_tags__" ? NO_TAGS_FILTER_VALUE : normalized || "all";
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
      if (requireErrors().caughtStatus(error) !== 409) {
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

  function allTagsOption() {
    return createFilterOption("", "All tags");
  }

  function noTagsOption() {
    return createFilterOption(NO_TAGS_FILTER_VALUE, "No Tags");
  }

  function createFilterOption(value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
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
        assignment_source: normalizeAssignmentSource(tag?.assignment_source || tag?.origin || tag?.source),
        origin: normalizeAssignmentSource(tag?.origin || tag?.assignment_source || tag?.source),
        origin_label: String(tag?.origin_label || "").trim(),
        source: normalizeAssignmentSource(tag?.source || tag?.assignment_source || tag?.origin),
        source_assignment_id: String(tag?.source_assignment_id || "").trim(),
        source_target_type: String(tag?.source_target_type || "").trim(),
        source_target_id: String(tag?.source_target_id || "").trim(),
        propagation_rule_id: String(tag?.propagation_rule_id || "").trim(),
        tag_assignment_id: String(tag?.tag_assignment_id || "").trim(),
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

  function notifyTagCreated(tag) {
    const normalized = normalizeTagList(tag ? [tag] : [])[0];
    if (!normalized) {
      return;
    }

    for (const picker of [...mountedPickers]) {
      if (!document.documentElement.contains(picker.container)) {
        mountedPickers.delete(picker);
        continue;
      }

      picker.refreshTags();
    }
  }

  function isDirectTag(tag) {
    return normalizeAssignmentSource(tag?.assignment_source || tag?.origin || tag?.source) === "manual";
  }

  function isPropagatedTag(tag) {
    return normalizeAssignmentSource(tag?.assignment_source || tag?.origin || tag?.source) === "propagated";
  }

  function isSystemTag(tag) {
    return normalizeAssignmentSource(tag?.assignment_source || tag?.origin || tag?.source) === "system";
  }

  function normalizeAssignmentSource(value) {
    const normalized = String(value || "manual").trim().toLowerCase();
    return ["manual", "propagated", "system"].includes(normalized) ? normalized : "manual";
  }

  function createOriginBadge(tag) {
    const badge = document.createElement("span");
    badge.className = "tag-picker-origin";
    badge.textContent = tag.origin_label || (isSystemTag(tag) ? "System" : "Inherited");
    return badge;
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
    NO_TAGS_FILTER_VALUE,
    allTagsOption,
    createTag,
    createFilterOption,
    loadTags,
    mountFilterPicker,
    mountPicker,
    noTagsOption,
    readTagIds,
    renderTagList,
    suppressPropagatedTag,
  };
})(window);
