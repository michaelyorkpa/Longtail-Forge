/**
 * Option hydration for declarative view surface fields: `<select>` population and the
 * search-suggestion combobox that stands in for a select on free-text controls.
 *
 * Extracted from `public/js/shared/view-renderer.js` by `0.33.33.35.2`. The renderer reaches
 * this module through exactly three entry points - `setFieldOptions`, `mountSearchOptions`,
 * and `setFieldOptionsError` - all from its mount flush, and hands the same three to
 * module-owned option-source behaviors through the behavior context.
 *
 * It renders options it is given. It holds no descriptor structure, no default option sets,
 * and no product labels: `0.33.33.35.1.2` made the server-delivered descriptor the single
 * source of truth and this module must not become a second one. The only strings it owns are
 * its own unavailable-state fallbacks, which are control state rather than descriptor content.
 *
 * @param {Window} global
 */
(function attachViewSearchOptions(global) {
  // Scoped inside the IIFE deliberately: a top-level JSDoc typedef in a classic script leaks
  // into the shared type environment the way a top-level `const` leaks into the shared lexical
  // one, which is the thing `0.33.33.33` removed from this estate. Recorded at `0.33.33.34`.

  /**
   * A normalized option row. `selected` is resolved from the several shapes descriptors and
   * option sources use, so everything downstream sees one shape.
   * @typedef {{
   *   color?: unknown,
   *   keywords?: unknown,
   *   label?: unknown,
   *   selected?: boolean,
   *   value?: unknown,
   * }} FieldOption
   */

  /**
   * What this module needs of a field control.
   *
   * Deliberately structural rather than `HTMLElement`: the renderer drives real DOM, and the
   * framework regressions drive a fake DOM whose nodes implement only what is used here. A
   * nominal DOM type would make the contract a lie in one of those two worlds.
   * @typedef {{
   *   _viewSearchOptionsCleanup?: (() => void) | undefined,
   *   addEventListener?: (type: string, listener: (event: FieldControlEvent) => void, capture?: boolean) => void,
   *   appendChild?: (node: unknown) => unknown,
   *   autocomplete?: string,
   *   dataset?: Record<string, string | undefined>,
   *   disabled?: boolean,
   *   dispatchEvent?: (event: unknown) => unknown,
   *   getBoundingClientRect?: () => { bottom: number, height: number, left: number, right: number, top: number, width: number },
   *   multiple?: boolean,
   *   options?: { length: number },
   *   removeAttribute?: (name: string) => void,
   *   replaceChildren?: (...nodes: unknown[]) => void,
   *   selectedOptions?: Iterable<{ value: string }>,
   *   setAttribute?: (name: string, value: string) => void,
   *   tagName?: string,
   *   value?: string,
   * }} FieldControl
   */

  /** @typedef {{ key?: string, preventDefault?: () => void }} FieldControlEvent */

  /**
   * The suggestion popup. `style` is optional-and-writable because the fake DOM starts without
   * one and this module installs a plain object in that case.
   * @typedef {{
   *   click?: () => void,
   *   hidden?: boolean,
   *   id?: string,
   *   className?: string,
   *   parentNode?: { removeChild?: (node: unknown) => unknown } | null,
   *   querySelector?: (selector: string) => { click?: () => void } | null,
   *   replaceChildren?: (...nodes: unknown[]) => void,
   *   setAttribute?: (name: string, value: string) => void,
   *   style?: Record<string, string>,
   * }} OptionsPopup
   */

  /**
   * @typedef {{
   *   emptyMessage?: string,
   *   maxResults?: number,
   *   minChars?: number,
   *   selectedValue?: unknown,
   *   submitMode?: string,
   * }} SearchOptionsConfig
   */

  const namespace = global.LongtailForge || {};
  let searchOptionsCounter = 0;

  /**
   * Route option hydration by control type: native selects get options, everything else gets
   * the suggestion combobox.
   *
   * @param {FieldControl | null | undefined} control
   * @param {unknown[]} [options]
   * @param {unknown} [selectedValue]
   * @param {SearchOptionsConfig} [optionsConfig]
   * @returns {void}
   */
  function setFieldOptions(control, options = [], selectedValue = undefined, optionsConfig = {}) {
    if (control?.tagName === "SELECT") {
      setSelectOptions(control, options, selectedValue);
      return;
    }
    mountSearchOptions(control, options, {
      ...optionsConfig,
      selectedValue,
    });
  }

  /**
   * @param {FieldControl | null | undefined} control
   * @param {unknown[]} [options]
   * @param {unknown} [selectedValue]
   * @returns {void}
   */
  function setSelectOptions(control, options = [], selectedValue = undefined) {
    if (!control || control.tagName !== "SELECT") {
      return;
    }
    const selectedValues = control.multiple
      ? new Set((Array.isArray(selectedValue)
        ? selectedValue
        : selectedValue === undefined || selectedValue === null
          ? [...(control.selectedOptions || [])].map((option) => option.value)
          : [selectedValue]).map((value) => String(value)))
      : null;
    const selected = selectedValue !== undefined && selectedValue !== null ? String(selectedValue) : control.value;
    const optionNodes = normalizeSelectOptions(options).map((option) => {
      const optionElement = document.createElement("option");
      optionElement.textContent = String(option.label ?? option.value ?? "");
      optionElement.value = String(option.value ?? "");
      optionElement.selected = selectedValues
        ? selectedValues.has(optionElement.value) || (selectedValues.size === 0 && Boolean(option.selected))
        : Boolean(option.selected);
      return optionElement;
    });
    control.replaceChildren?.(...optionNodes);
    if (!control.multiple && selected && optionNodes.some((option) => option.value === selected)) {
      control.value = selected;
    }
    control.disabled = false;
    delete control.dataset?.viewOptionsError;
  }

  /**
   * Mount the suggestion combobox on a text control.
   *
   * A control may be re-hydrated, so any previous mount is torn down first through the cleanup
   * hook this function installs on the control itself.
   *
   * @param {FieldControl | null | undefined} control
   * @param {unknown[]} [options]
   * @param {SearchOptionsConfig} [config]
   * @returns {void}
   */
  function mountSearchOptions(control, options = [], config = {}) {
    if (!control || control.tagName !== "INPUT") {
      return;
    }

    const normalizedOptions = normalizeSelectOptions(options)
      .filter((option) => option && (option.label !== "" || option.value !== ""));
    const submitMode = config.submitMode || "input";
    const minChars = Number.isFinite(config.minChars) ? Number(config.minChars) : 1;
    const maxResults = Number.isInteger(config.maxResults) ? Number(config.maxResults) : 8;
    const emptyMessage = config.emptyMessage || "No matching options.";

    if (typeof control._viewSearchOptionsCleanup === "function") {
      control._viewSearchOptionsCleanup();
    }

    const popup = /** @type {OptionsPopup} */ (/** @type {unknown} */ (document.createElement("div")));
    const popupId = `view-search-options-${++searchOptionsCounter}`;
    popup.id = popupId;
    popup.className = "view-search-options";
    popup.hidden = true;
    popup.setAttribute?.("role", "listbox");

    if (document.body?.appendChild) {
      document.body.appendChild(/** @type {Node} */ (/** @type {unknown} */ (popup)));
    }

    control.autocomplete = "off";
    setControlData(control, "viewSearchOptions", "true");
    setControlData(control, "viewSearchSubmitMode", submitMode);
    control.setAttribute?.("aria-autocomplete", "list");
    control.setAttribute?.("aria-controls", popupId);
    control.setAttribute?.("aria-expanded", "false");
    control.removeAttribute?.("aria-invalid");
    delete control.dataset?.viewOptionsError;

    const selectedValue = config.selectedValue !== undefined && config.selectedValue !== null
      ? String(config.selectedValue)
      : "";
    if (selectedValue) {
      const selectedOption = normalizedOptions.find((option) => String(option.value ?? "") === selectedValue);
      if (selectedOption) {
        selectSearchOption(control, selectedOption, { notify: false });
      }
    }

    const renderOptions = () => {
      const query = String(control.value || "").trim().toLowerCase();
      if (query.length < minChars) {
        hideSearchOptions(control, popup);
        return;
      }

      const matches = normalizedOptions
        .filter((option) => searchOptionText(option).includes(query))
        .slice(0, maxResults);

      if (matches.length === 0) {
        const empty = document.createElement("div");
        empty.className = "view-search-option-empty";
        empty.textContent = emptyMessage;
        popup.replaceChildren?.(empty);
      } else {
        popup.replaceChildren?.(...matches.map((option) => createSearchOptionButton(control, popup, option)));
      }

      showSearchOptions(control, popup);
    };

    const handleInput = () => {
      const selectedLabel = control.dataset?.viewSearchOptionLabel || "";
      const hadSelectedValue = Boolean(control.dataset?.viewSearchOptionValue);
      if (hadSelectedValue && control.value !== selectedLabel) {
        delete control.dataset?.viewSearchOptionValue;
        delete control.dataset?.viewSearchOptionLabel;
        if (!control.value) {
          dispatchFieldEvent(control, "change");
        }
      }
      renderOptions();
    };
    const handleFocus = () => renderOptions();
    const handleBlur = () => {
      global.setTimeout?.(() => hideSearchOptions(control, popup), 120);
    };
    /** @param {FieldControlEvent} event */
    const handleKeydown = (event) => {
      if (event.key === "Escape") {
        hideSearchOptions(control, popup);
        return;
      }
      if (event.key !== "Enter" || popup.hidden) {
        return;
      }
      const firstOption = popup.querySelector?.(".view-search-option");
      if (!firstOption) {
        return;
      }
      event.preventDefault?.();
      firstOption.click?.();
    };
    const reposition = () => positionSearchOptions(control, popup);

    control.addEventListener?.("input", handleInput);
    control.addEventListener?.("focus", handleFocus);
    control.addEventListener?.("blur", handleBlur);
    control.addEventListener?.("keydown", handleKeydown);
    if (typeof global.addEventListener === "function") {
      global.addEventListener("resize", reposition);
      global.addEventListener("scroll", reposition, true);
    }

    control._viewSearchOptionsCleanup = () => {
      if (typeof global.removeEventListener === "function") {
        global.removeEventListener("resize", reposition);
        global.removeEventListener("scroll", reposition, true);
      }
      if (popup.parentNode?.removeChild) {
        popup.parentNode.removeChild(popup);
      }
      delete control._viewSearchOptionsCleanup;
    };
  }

  /**
   * @param {FieldControl} control
   * @param {OptionsPopup} popup
   * @param {FieldOption} option
   * @returns {HTMLButtonElement}
   */
  function createSearchOptionButton(control, popup, option) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "view-search-option";
    button.setAttribute("role", "option");
    button.dataset.viewSearchOptionValue = String(option.value ?? "");
    if (option.color) {
      const swatch = document.createElement("span");
      swatch.className = "view-search-option-swatch";
      swatch.style.background = String(option.color);
      button.appendChild(swatch);
    }
    const label = document.createElement("span");
    label.textContent = String(option.label ?? option.value ?? "");
    button.appendChild(label);
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      selectSearchOption(control, option);
      hideSearchOptions(control, popup);
    });
    return button;
  }

  /**
   * @param {FieldControl} control
   * @param {FieldOption} option
   * @param {{ notify?: boolean }} [settings]
   * @returns {void}
   */
  function selectSearchOption(control, option, { notify = true } = {}) {
    const label = String(option.label ?? option.value ?? "");
    const value = String(option.value ?? "");
    control.value = label;
    setControlData(control, "viewSearchOptionValue", value);
    setControlData(control, "viewSearchOptionLabel", label);
    if (notify) {
      dispatchFieldEvent(control, "input");
      dispatchFieldEvent(control, "change");
      global.setTimeout?.(() => cleanupDetachedSearchOptions(control), 0);
    }
  }

  /**
   * Tear a mount down once its control has left the document, so a re-rendered surface does
   * not leave orphan popups behind.
   * @param {FieldControl} control
   * @returns {void}
   */
  function cleanupDetachedSearchOptions(control) {
    if (typeof document.body?.contains !== "function"
      || document.body.contains(/** @type {Node} */ (/** @type {unknown} */ (control)))) {
      return;
    }
    control._viewSearchOptionsCleanup?.();
  }

  /**
   * @param {FieldControl} control
   * @param {OptionsPopup} popup
   * @returns {void}
   */
  function showSearchOptions(control, popup) {
    popup.hidden = false;
    control.setAttribute?.("aria-expanded", "true");
    positionSearchOptions(control, popup);
  }

  /**
   * @param {FieldControl} control
   * @param {OptionsPopup} popup
   * @returns {void}
   */
  function hideSearchOptions(control, popup) {
    popup.hidden = true;
    control.setAttribute?.("aria-expanded", "false");
  }

  /**
   * Place the popup against the control, flipping above it when there is more room there.
   * @param {FieldControl} control
   * @param {OptionsPopup} popup
   * @returns {void}
   */
  function positionSearchOptions(control, popup) {
    if (popup.hidden || typeof control.getBoundingClientRect !== "function") {
      return;
    }
    const rect = control.getBoundingClientRect();
    const viewportWidth = global.innerWidth || document.documentElement?.clientWidth || rect.right || 320;
    const viewportHeight = global.innerHeight || document.documentElement?.clientHeight || rect.bottom || 480;
    const spacing = 6;
    const width = Math.max(rect.width || 0, 180);
    const below = viewportHeight - rect.bottom - spacing;
    const above = rect.top - spacing;
    const openAbove = below < 140 && above > below;
    const availableHeight = Math.max(96, Math.min(260, openAbove ? above - spacing : below - spacing));
    const left = Math.min(
      Math.max(8, rect.left || 8),
      Math.max(8, viewportWidth - width - 8),
    );
    if (!popup.style) {
      popup.style = {};
    }
    popup.style.left = `${left}px`;
    popup.style.top = `${openAbove ? Math.max(8, rect.top - availableHeight - spacing) : rect.bottom + spacing}px`;
    popup.style.width = `${width}px`;
    popup.style.maxHeight = `${availableHeight}px`;
  }

  /**
   * The haystack one option contributes to substring matching: its label, its value, and any
   * declared keywords.
   * @param {FieldOption} option
   * @returns {string}
   */
  function searchOptionText(option) {
    const keywords = Array.isArray(option.keywords)
      ? option.keywords
      : String(option.keywords || "").split(/\s+/);
    return [
      option.label,
      option.value,
      ...keywords,
    ].filter(Boolean).join(" ").toLowerCase();
  }

  /**
   * @param {FieldControl} control
   * @param {string} eventName
   * @returns {void}
   */
  function dispatchFieldEvent(control, eventName) {
    if (typeof control.dispatchEvent !== "function") {
      return;
    }
    if (typeof global.Event === "function") {
      control.dispatchEvent(new global.Event(eventName, { bubbles: true }));
      return;
    }
    control.dispatchEvent({ type: eventName, bubbles: true });
  }

  /**
   * Put a control into its options-unavailable state without inventing option content.
   * @param {FieldControl | null | undefined} control
   * @param {string} [message]
   * @returns {void}
   */
  function setFieldOptionsError(control, message) {
    if (!control) {
      return;
    }
    if (control.tagName !== "SELECT") {
      setControlData(control, "viewOptionsError", message || "Options unavailable.");
      control.setAttribute?.("aria-invalid", "true");
      return;
    }
    if (!control.options?.length) {
      const optionElement = document.createElement("option");
      optionElement.textContent = "Options unavailable";
      optionElement.value = "";
      control.appendChild?.(optionElement);
    }
    control.disabled = true;
    setControlData(control, "viewOptionsError", message || "Options unavailable.");
  }

  /**
   * Normalize the option shapes descriptors and option sources use - pair arrays, objects, and
   * bare scalars - into one row shape.
   * @param {unknown[]} [options]
   * @returns {FieldOption[]}
   */
  function normalizeSelectOptions(options = []) {
    if (!Array.isArray(options)) {
      return [];
    }

    return options.map((option) => {
      if (Array.isArray(option)) {
        return {
          value: option[0] ?? "",
          label: option[1] ?? option[0] ?? "",
          selected: Boolean(option[2]),
        };
      }
      if (option && typeof option === "object") {
        const source = /** @type {Record<string, unknown>} */ (option);
        const value = source.value ?? source.id ?? "";
        return {
          ...source,
          value,
          label: source.label ?? source.text ?? value,
          selected: Boolean(source.selected || source.default),
        };
      }
      return {
        value: option ?? "",
        label: option ?? "",
        selected: false,
      };
    });
  }

  /**
   * @param {FieldControl} control
   * @param {string} key
   * @param {string} value
   * @returns {void}
   */
  function setControlData(control, key, value) {
    if (control.dataset) {
      control.dataset[key] = value;
    }
  }

  namespace.viewSearchOptions = Object.freeze({
    mountSearchOptions,
    normalizeSelectOptions,
    setFieldOptions,
    setFieldOptionsError,
    setSelectOptions,
  });
  global.LongtailForge = namespace;
})(window);
