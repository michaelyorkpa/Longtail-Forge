(function initSharedTags(global) {
  const namespace = global.LongtailForge = global.LongtailForge || {};
  const DEFAULT_TAG_COLOR = "#64748b";
  const NO_TAGS_FILTER_VALUE = "__no_tags__";
  const mountedPickers = new Set();
  let tagPickerId = 0;
  let tagSuggestionId = 0;

  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserErrorContract} BrowserErrorContract */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserTagCatalogRecord} TagCatalogRecord */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserTagLoadOptions} TagLoadOptions */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserTagPickerOptions} TagPickerOptions */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserTagPickerController} TagPickerController */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserTagFilterPickerOptions} TagFilterPickerOptions */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserTagFilterPickerController} TagFilterPickerController */

  /**
   * The error the two mutating requests throw.
   *
   * `namespace.errors?.createError?.(...)` answers a `BrowserApiError`, which already carries a
   * status and a body, but the `|| new Error(...)` fallback beside it does not - and both paths
   * then have the status and the body attached to them by name. This names what the two arms have
   * in common rather than asserting that the plain one is the richer type.
   * @typedef {Error & { body?: unknown, status?: number }} TagRequestError
   */

  /**
   * One tag as `normalizeTagList` rebuilds it, derived from that normaliser rather than restated.
   *
   * It is deliberately **not** `BrowserTagCatalogRecord`: this shape carries the assignment
   * members - `assignment_source`, `tag_assignment_id`, `origin` and the rest - that a catalogue
   * record does not describe, which is the distinction `0.33.33.38.4.14` recorded when it closed
   * the catalogue boundary. Writing it as a `ReturnType` keeps the two from drifting apart.
   * @typedef {ReturnType<typeof normalizeTagList>[number]} PickerTag
   */

  /**
   * A tag the picker holds selected.
   *
   * **Two shapes reach this slot and the union says so rather than hiding one.** Most arrive
   * through `normalizeTagList`. One does not: `ensureTag` answers `createTag`'s freshly created
   * catalogue record directly, and `addSelectedTag` stores that. It works - a catalogue record
   * names no assignment source, so the origin predicates answer `"manual"` for it and it is
   * treated as a direct tag, which is what a tag you just created is - but it is not the
   * normalised shape, and typing the slot as though it were would be the claim rather than the
   * fact.
   * @typedef {PickerTag | TagCatalogRecord} SelectedTag
   */

  /**
   * The picker's own mutable state, which three module-level helpers read and write.
   *
   * `selectedTags` is annotated rather than inferred because its empty initializer would
   * otherwise infer `never[]` and refuse every later write.
   * @typedef {object} TagPickerState
   * @property {number} activeSuggestionIndex
   * @property {PickerTag[]} allTags
   * @property {boolean} busy
   * @property {SelectedTag[]} selectedTags
   */

  /**
   * The filter picker's state. It holds no `busy` flag, because it performs no request.
   * @typedef {object} TagFilterState
   * @property {number} activeSuggestionIndex
   * @property {PickerTag[]} allTags
   * @property {string} value
   */

  /**
   * One choice the filter offers: the two sentinels, and one per tag.
   * @typedef {object} TagFilterChoice
   * @property {string} value
   * @property {string} label
   * @property {string} [keywords]
   * @property {PickerTag} [tag]
   */

  /**
   * How a chip is drawn. Every member is read for truthiness, and `removable` decides the element
   * as well as the affordance, which is why a chip that is removable is a button.
   * @typedef {object} TagChipOptions
   * @property {boolean} [removable]
   * @property {boolean} [showOrigin]
   * @property {boolean} [suppressible]
   */

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

  /** The nine members `tagRowToAppValue` rebuilds as text. */
  const TAG_TEXT_MEMBERS = Object.freeze([
    "color", "created_at", "created_by_user_id", "description", "name", "slug", "tag_id",
    "updated_at", "workspace_id",
  ]);

  /** The four usage aggregates it rebuilds through `Number(... || 0)`. */
  const TAG_COUNT_MEMBERS = Object.freeze([
    "direct_usage_count", "propagated_usage_count", "system_usage_count", "usage_count",
  ]);

  /** The vocabulary the `tags.status` column's CHECK constraint admits. */
  const TAG_STATUSES = Object.freeze(["active", "archived", "disabled"]);

  /** @param {unknown} value @returns {value is Record<string, unknown>} */
  function isTagRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * One tag as `tagRowToAppValue` rebuilds it.
   *
   * Every text member is a string because the normaliser fills the nullable columns with `""`,
   * and every count is a finite non-negative integer because each is a `COALESCE`d aggregate or
   * a zero default put through `Number`.
   * @param {unknown} value
   * @returns {value is import("../../../src/types/browser-contracts.js").BrowserTagCatalogRecord}
   */
  function isTagCatalogRecord(value) {
    return isTagRecord(value)
      && TAG_TEXT_MEMBERS.every((member) => typeof value[member] === "string")
      && TAG_COUNT_MEMBERS.every((member) => typeof value[member] === "number"
        && Number.isInteger(value[member])
        && Number(value[member]) >= 0)
      && value.tag_id !== ""
      && TAG_STATUSES.some((status) => status === value.status);
  }

  /**
   * The catalogue entries of a `GET /api/tags` body, filtered to the usable ones.
   *
   * **This helper's policy is deliberately looser than the Tags page's, and the difference is the
   * consumer.** It feeds pickers and filters: an entry it cannot read is one option fewer on a
   * list the viewer can still complete by hand, so it is dropped rather than taken as grounds to
   * refuse the whole picker. `tags.js` administers the catalogue itself and refuses whole.
   *
   * The envelope stays absence-tolerant for the same reason and because that is the contract this
   * helper already published: a body with no usable `tags` array resolves `[]`, exactly as a
   * non-OK response does.
   *
   * **The producer's own records are answered**, so anything the catalogue grows next survives.
   * @param {unknown} body
   * @returns {import("../../../src/types/browser-contracts.js").BrowserTagCatalogRecord[]}
   */
  function readTagCatalogEntries(body) {
    if (!isTagRecord(body) || !Array.isArray(body.tags)) {
      return [];
    }

    return /** @type {import("../../../src/types/browser-contracts.js").BrowserTagCatalogRecord[]} */ (
      body.tags.filter(isTagCatalogRecord)
    );
  }

  /**
   * The tag `POST /api/tags` created, or `null` when the body is not one this producer sent.
   *
   * The create envelope is exact at one member and the service throws rather than answering
   * without it, so a successful response that carries no readable tag did not come from here.
   * @param {unknown} body
   * @returns {import("../../../src/types/browser-contracts.js").BrowserTagCatalogRecord | null}
   */
  function readCreatedTag(body) {
    if (!isTagRecord(body) || !isTagCatalogRecord(body.tag)) {
      return null;
    }

    return body.tag;
  }

  /**
   * @param {TagLoadOptions} [options]
   * @returns {Promise<TagCatalogRecord[]>}
   */
  async function loadTags(options = {}) {
    const params = new URLSearchParams({
      status: options.status || "active",
      search: options.search || "",
    });
    const response = await fetch(`/api/tags?${params}`, { cache: "no-store" });

    if (!response.ok) {
      return [];
    }

    /** @type {unknown} */
    const body = await response.json();
    return readTagCatalogEntries(body);
  }

  /**
   * @param {unknown} [payload]
   * @returns {Promise<TagCatalogRecord>}
   */
  async function createTag(payload = {}) {
    const response = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await readJsonResponse(response);

    if (!response.ok) {
      /** @type {TagRequestError} */
      const error = namespace.errors?.createError?.(body, "Unable to create tag.", response.status)
        || new Error("Unable to create tag.");
      error.status = response.status;
      error.body = body;
      throw error;
    }

    const tag = readCreatedTag(body);

    if (!tag) {
      throw new Error("The created tag could not be read.");
    }

    notifyTagCreated(tag);
    return tag;
  }

  /**
   * @param {string} assignmentId
   * @returns {Promise<unknown>}
   */
  async function suppressPropagatedTag(assignmentId) {
    const response = await fetch(`/api/tags/assignments/${encodeURIComponent(assignmentId)}/suppress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = await readJsonResponse(response);

    if (!response.ok) {
      /** @type {TagRequestError} */
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

  /**
   * @param {Element | null | undefined} container
   * @param {unknown[]} [tags]
   */
  function renderTagList(container, tags = []) {
    if (!container) {
      return;
    }

    container.replaceChildren(...(tags.length > 0
      ? tags.map((tag) => createTagChip(tag))
      : []));
  }

  /**
   * One chip, for a tag this function proves rather than one it was promised.
   *
   * `renderTagList` is published as taking `unknown[]`, and a consumer relies on that, so the
   * value reaching here can be anything. The record proof answers what the member reads already
   * answered - `undefined` for every member of a non-record - and the three DOM sinks are the
   * places a string is required, which is the coercion the DOM was performing anyway.
   * @param {unknown} rawTag
   * @param {TagChipOptions} [options]
   * @returns {HTMLElement}
   */
  function createTagChip(rawTag, options = {}) {
    const tag = isTagRecord(rawTag) ? rawTag : {};
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
      // The surrounding condition already chose the button branch; `in` is what says so to the
      // compiler without asserting a subtype the condition has decided.
      if ("type" in chip) {
        chip.type = "button";
      }
      chip.dataset.tagPickerRemove = String(tag.tag_id || "");
      chip.setAttribute("aria-label", `Remove ${tag.name || tag.slug || "tag"}`);
      chip.title = `Remove ${tag.name || tag.slug || "tag"}`;
    }
    swatch.className = "tag-chip-swatch";
    swatch.style.backgroundColor = String(tag.color || DEFAULT_TAG_COLOR);
    swatch.setAttribute("aria-hidden", "true");
    label.textContent = String(tag.name || tag.slug || "Tag");
    chip.append(swatch, label);
    if (options.showOrigin && !options.suppressible && !options.removable && !isDirectTag(tag)) {
      chip.append(createOriginBadge(tag));
    }
    return chip;
  }

  /**
   * @param {Element | null | undefined} container
   * @param {TagPickerOptions} [options]
   * @returns {Promise<TagPickerController | null>}
   */
  async function mountPicker(container, options = {}) {
    if (!container) {
      return null;
    }

    /** @type {TagPickerState} */
    const state = {
      activeSuggestionIndex: -1,
      allTags: normalizeTagList(Array.isArray(options.tags) ? options.tags : await loadTags()),
      busy: false,
      selectedTags: [],
    };
    const selectedIds = new Set(normalizeTagIds(options.selectedTags || options.selectedTagIds || []));
    /** The accumulator, named so the fold has an element type rather than an empty one. */
    /** @type {SelectedTag[]} */
    const deduped = [];
    state.selectedTags = [
      ...normalizeTagList(options.selectedTags || []),
      ...state.allTags.filter((tag) => selectedIds.has(tag.tag_id)),
    ].reduce((tags, tag) => {
      if (tag.tag_id && !tags.some((selected) => selected.tag_id === tag.tag_id)) {
        tags.push(tag);
      }
      return tags;
    }, deduped);

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

    /** @param {unknown} rawValue */
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
      if (activeSuggestion instanceof HTMLElement) {
        activeSuggestion.click();
        return;
      }
      await addByText(input.value);
    });

    suggestions.addEventListener("click", async (event) => {
      const button = event.target instanceof Element && event.target.closest("[data-tag-picker-suggestion]");
      if (!(button instanceof HTMLElement)) {
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
      const suppressButton = event.target instanceof Element
        && event.target.closest("[data-tag-picker-suppress]");
      if (suppressButton instanceof HTMLButtonElement) {
        const assignmentId = suppressButton.dataset.tagPickerSuppress;
        if (!assignmentId || state.busy) {
          return;
        }

        state.busy = true;
        suppressButton.disabled = true;
        setStatus(status, "Removing inherited tag");
        try {
          await suppressPropagatedTag(assignmentId);
          state.selectedTags = state.selectedTags.filter((tag) => selectedTagAssignmentId(tag) !== assignmentId);
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

      const button = event.target instanceof Element && event.target.closest("[data-tag-picker-remove]");
      if (!(button instanceof HTMLElement)) {
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
      /** @param {unknown} [tagIds] */
      setSelected: (tagIds = []) => {
        const nextIds = new Set(normalizeTagIds(tagIds));
        state.selectedTags = state.allTags.filter((tag) => nextIds.has(tag.tag_id));
        sync();
      },
    };
  }

  /**
   * @param {Element} container
   * @param {SelectedTag[]} tags
   */
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

  /**
   * @param {SelectedTag} tag
   * @returns {HTMLElement}
   */
  function createSelectedTagChip(tag) {
    if (isDirectTag(tag)) {
      return createTagChip(tag, { removable: true });
    }

    const wrapper = document.createElement("span");
    wrapper.className = "tag-picker-readonly-tag";
    wrapper.append(createTagChip(tag, { showOrigin: true }));

    if (isPropagatedTag(tag) && selectedTagAssignmentId(tag)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tag-picker-suppress";
      button.dataset.tagPickerSuppress = selectedTagAssignmentId(tag);
      button.textContent = "Remove from this record";
      button.title = "Suppress this inherited tag on the current record";
      wrapper.append(button);
    }

    return wrapper;
  }

  /**
   * @param {HTMLElement} container
   * @param {TagPickerState} state
   * @param {unknown} rawValue
   * @param {{ allowCreate?: boolean }} [options]
   */
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

  /**
   * @param {PickerTag} tag
   * @returns {HTMLButtonElement}
   */
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

  /**
   * @param {string} name
   * @returns {HTMLButtonElement}
   */
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

  /**
   * @param {HTMLInputElement} input
   * @param {Element} container
   * @param {TagPickerState} state
   * @param {number} direction
   */
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

  /**
   * @param {Element} container
   * @param {TagPickerState} state
   * @param {Element | null} [input]
   */
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

  /**
   * @param {HTMLInputElement | null | undefined} input
   * @param {TagFilterPickerOptions} [options]
   * @returns {TagFilterPickerController | null}
   */
  function mountFilterPicker(input, options = {}) {
    if (!input) {
      return null;
    }

    /**
     * The control, bound once the guard has proved it.
     *
     * Two reasons, and both are the compiler recording what the code already does: a parameter's
     * narrowing does not reach the handlers below, every one of which is a closure; and the
     * cleanup hook this function installs is its own expando, which the element type does not
     * declare and which only this file writes or reads.
     * @type {HTMLInputElement & { _tagFilterPickerCleanup?: () => void }}
     */
    const field = input;

    field._tagFilterPickerCleanup?.();
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
    suggestions.setAttribute("aria-label", `${field.getAttribute("aria-label") || "Tag filter"} suggestions`);
    field.parentElement?.appendChild(suggestions);
    field.autocomplete = "off";
    field.setAttribute("aria-autocomplete", "list");
    field.setAttribute("aria-controls", suggestions.id);
    field.setAttribute("aria-expanded", "false");
    field.setAttribute("role", "combobox");

    /** @returns {TagFilterChoice[]} */
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
      field.value = choice.label;
      field.dataset.tagFilterValue = choice.value;
      field.dataset.tagFilterLabel = choice.label;
    }

    function renderFilterSuggestions() {
      const query = String(field.value || "").trim().toLowerCase();
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
      field.setAttribute("aria-expanded", buttons.length > 0 ? "true" : "false");
      syncFilterSuggestionSelection();
    }

    function syncFilterSuggestionSelection() {
      const buttons = [...suggestions.querySelectorAll("[data-tag-filter-suggestion]")];
      buttons.forEach((button, index) => {
        const selected = index === state.activeSuggestionIndex;
        button.classList.toggle("is-active", selected);
        button.setAttribute("aria-selected", selected ? "true" : "false");
        if (selected) {
          field.setAttribute("aria-activedescendant", button.id);
          button.scrollIntoView?.({ block: "nearest" });
        }
      });
      if (!buttons.some((button) => button.getAttribute("aria-selected") === "true")) {
        field.removeAttribute("aria-activedescendant");
      }
    }

    /**
     * @param {unknown} value
     * @param {{ notify?: boolean }} [options]
     */
    function choose(value, { notify = true } = {}) {
      state.value = normalizeFilterValue(value);
      state.activeSuggestionIndex = -1;
      writeSelectedChoice();
      suggestions.hidden = true;
      field.setAttribute("aria-expanded", "false");
      field.removeAttribute("aria-activedescendant");
      if (notify) {
        // The element's own realm when it has one, and this script's otherwise, which is the
        // spelling `shared/view-builder.js` already uses for the same read.
        const view = field.ownerDocument.defaultView || global;
        field.dispatchEvent(new view.Event("change", { bubbles: true }));
      }
    }

    function handleInput() {
      state.activeSuggestionIndex = -1;
      renderFilterSuggestions();
    }

    function handleFocus() {
      field.select?.();
      renderFilterSuggestions();
    }

    function handleBlur() {
      global.setTimeout(() => {
        if (!suggestions.contains(document.activeElement)) {
          writeSelectedChoice();
          suggestions.hidden = true;
          field.setAttribute("aria-expanded", "false");
        }
      }, 120);
    }

    /** @param {KeyboardEvent} event */
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
        field.setAttribute("aria-expanded", "false");
        return;
      }
      if (event.key === "Enter") {
        const active = suggestions.querySelector('[data-tag-filter-suggestion][aria-selected="true"]')
          || suggestions.querySelector("[data-tag-filter-suggestion]");
        if (active instanceof HTMLElement) {
          event.preventDefault();
          choose(active.dataset.tagFilterSuggestion);
        }
      }
    }

    /** @param {MouseEvent} event */
    function handleSuggestionClick(event) {
      const button = event.target instanceof Element && event.target.closest("[data-tag-filter-suggestion]");
      if (button instanceof HTMLElement) {
        choose(button.dataset.tagFilterSuggestion);
        field.focus();
      }
    }

    field.addEventListener("input", handleInput);
    field.addEventListener("focus", handleFocus);
    field.addEventListener("blur", handleBlur);
    field.addEventListener("keydown", handleKeydown);
    /** @param {Event} event */
    const handleSuggestionMouseDown = (event) => event.preventDefault();
    suggestions.addEventListener("mousedown", handleSuggestionMouseDown);
    suggestions.addEventListener("click", handleSuggestionClick);
    writeSelectedChoice();

    const controller = {
      readValue: () => state.value,
      /** @param {unknown} [tags] */
      setTags: (tags = []) => {
        state.allTags = normalizeTagList(tags);
        if (!choices().some((choice) => choice.value === state.value)) {
          state.value = "all";
        }
        writeSelectedChoice();
      },
      /**
       * @param {unknown} value
       * @param {{ notify?: boolean }} [setOptions]
       */
      setValue: (value, setOptions = {}) => choose(value, { notify: setOptions.notify === true }),
      destroy: () => field._tagFilterPickerCleanup?.(),
    };
    field._tagFilterPickerCleanup = () => {
      field.removeEventListener("input", handleInput);
      field.removeEventListener("focus", handleFocus);
      field.removeEventListener("blur", handleBlur);
      field.removeEventListener("keydown", handleKeydown);
      suggestions.removeEventListener("mousedown", handleSuggestionMouseDown);
      suggestions.removeEventListener("click", handleSuggestionClick);
      suggestions.remove();
      delete field._tagFilterPickerCleanup;
    };
    return controller;
  }

  /**
   * @param {unknown} value
   * @returns {string}
   */
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

  /**
   * @param {string} name
   * @param {TagPickerState} state
   * @returns {Promise<SelectedTag>}
   */
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

  /**
   * @param {TagPickerState} state
   * @param {SelectedTag} tag
   */
  function addSelectedTag(state, tag) {
    if (!tag?.tag_id || state.selectedTags.some((selected) => selected.tag_id === tag.tag_id)) {
      return;
    }

    state.selectedTags = [...state.selectedTags, tag];
  }

  /**
   * @param {Element | null | undefined} container
   * @returns {string[]}
   */
  function readTagIds(container) {
    return [...(container?.querySelectorAll("[data-tag-picker-selected]") || [])]
      .map((input) => input instanceof HTMLInputElement ? input.value : "")
      .filter(Boolean);
  }

  function allTagsOption() {
    return createFilterOption("", "All tags");
  }

  function noTagsOption() {
    return createFilterOption(NO_TAGS_FILTER_VALUE, "No Tags");
  }

  /**
   * @param {string} value
   * @param {string} label
   * @returns {HTMLOptionElement}
   */
  function createFilterOption(value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }

  /** @param {unknown} [tags] */
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

  /**
   * @param {unknown} [tags]
   * @returns {string[]}
   */
  function normalizeTagIds(tags = []) {
    return (Array.isArray(tags) ? tags : [])
      .map((tag) => typeof tag === "string" ? tag : tag?.tag_id)
      .map((tagId) => String(tagId || "").trim())
      .filter(Boolean);
  }

  /**
   * @param {PickerTag[]} tags
   * @param {unknown} value
   * @returns {PickerTag | null}
   */
  function findTagByNameOrSlug(tags, value) {
    const slug = normalizeSlug(value);
    const name = String(value || "").trim().toLowerCase();
    return tags.find((tag) => normalizeSlug(tag.slug || tag.name) === slug || String(tag.name || "").trim().toLowerCase() === name) || null;
  }

  /**
   * @param {PickerTag} tag
   * @param {unknown} value
   * @returns {boolean}
   */
  function matchesTagSearch(tag, value) {
    const query = String(value || "").trim().toLowerCase();
    return String(tag.name || "").toLowerCase().includes(query) || String(tag.slug || "").toLowerCase().includes(query);
  }

  /**
   * @param {unknown} value
   * @returns {string}
   */
  function normalizeSlug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  /**
   * @param {unknown} tags
   * @param {unknown} tag
   * @returns {PickerTag[]}
   */
  function upsertTag(tags, tag) {
    return mergeTags(tags, [tag]);
  }

  /**
   * @param {unknown} currentTags
   * @param {unknown} nextTags
   * @returns {PickerTag[]}
   */
  function mergeTags(currentTags, nextTags) {
    const byId = new Map(normalizeTagList(currentTags).map((tag) => [tag.tag_id, tag]));
    normalizeTagList(nextTags).forEach((tag) => byId.set(tag.tag_id, tag));
    return [...byId.values()].sort((a, b) => String(a.name || a.slug).localeCompare(String(b.name || b.slug)));
  }

  /** @param {unknown} tag */
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

  /**
   * Where a tag's assignment says it came from, read off a record this proves itself.
   *
   * The three predicates below are handed everything from a normalised picker tag to a raw wire
   * entry `renderTagList` was given, so no single declared shape covers their callers - a
   * published interface carries no index signature and cannot satisfy one. The proof answers what
   * the optional chaining it replaced answered: `undefined` for every member of a non-record,
   * which `normalizeAssignmentSource` then reads as `"manual"`.
   * @param {unknown} tag
   * @returns {string}
   */
  function assignmentSourceOf(tag) {
    const record = isTagRecord(tag) ? tag : {};

    return normalizeAssignmentSource(record.assignment_source || record.origin || record.source);
  }

  /**
   * The assignment a selected tag was made through, or the empty string where it has none.
   *
   * A freshly created catalogue record has no assignment member at all, which is why this reads
   * the union rather than the member. The empty string stands where `undefined` stood: both
   * differ from every assignment id, which is the only comparison either is used in.
   * @param {SelectedTag} tag
   * @returns {string}
   */
  function selectedTagAssignmentId(tag) {
    return "tag_assignment_id" in tag ? tag.tag_assignment_id : "";
  }

  /** @param {unknown} tag */
  function isDirectTag(tag) {
    return assignmentSourceOf(tag) === "manual";
  }

  /** @param {unknown} tag */
  function isPropagatedTag(tag) {
    return assignmentSourceOf(tag) === "propagated";
  }

  /** @param {unknown} tag */
  function isSystemTag(tag) {
    return assignmentSourceOf(tag) === "system";
  }

  /**
   * @param {unknown} value
   * @returns {string}
   */
  function normalizeAssignmentSource(value) {
    const normalized = String(value || "manual").trim().toLowerCase();
    return ["manual", "propagated", "system"].includes(normalized) ? normalized : "manual";
  }

  /**
   * @param {Record<string, unknown>} tag
   * @returns {HTMLElement}
   */
  function createOriginBadge(tag) {
    const badge = document.createElement("span");
    badge.className = "tag-picker-origin";
    badge.textContent = String(tag.origin_label || (isSystemTag(tag) ? "System" : "Inherited"));
    return badge;
  }

  /**
   * The parsed body of one response, as `unknown`.
   *
   * `response.json()` is typed `any`, and without this the three callers inherited it. The two
   * mutation callers narrow what they need; `suppressPropagatedTag` deliberately does not, because
   * its only caller awaits and discards the result.
   * @param {Response} response
   * @returns {Promise<unknown>}
   */
  async function readJsonResponse(response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * @param {HTMLElement | null} status
   * @param {string} message
   * @param {boolean} [isError]
   */
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
