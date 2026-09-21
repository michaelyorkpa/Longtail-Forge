(function attachSettingsPageController(global) {
  const root = global.LongtailForge ||= {};

  /**
   * @param {import("../../../src/types/browser-contracts.js").BrowserSettingsPageControllerOptions} [options]
   * @returns {import("../../../src/types/browser-contracts.js").BrowserSettingsPageControllerHandle}
   */
  function create(options = {}) {
    const page = requireSettingsHost(options.root);
    const saveButtons = [...page.querySelectorAll("[data-settings-page-save]")];
    const revertButtons = [...page.querySelectorAll("[data-settings-page-revert]")];
    const dialog = page.querySelector("[data-settings-unsaved-dialog]");
    const cancelNavigation = dialog?.querySelector("[data-settings-unsaved-cancel]");
    const continueNavigation = dialog?.querySelector("[data-settings-unsaved-continue]");
    /** @type {Map<Element, string>} */
    let snapshot = new Map();
    let dirty = false;
    let pendingHref = "";
    let saving = false;

    page.addEventListener("input", (event) => {
      if (isTrackedControl(event.target)) updateDirtyState();
    });
    page.addEventListener("change", (event) => {
      if (!isTrackedControl(event.target)) return;
      updateDirtyState();
      if (isImmediateControl(event.target)) flashUnsaved();
    });
    page.addEventListener("focusout", (event) => {
      if (isTrackedControl(event.target) && !isImmediateControl(event.target)) {
        updateDirtyState();
        if (dirty) flashUnsaved();
      }
    });
    saveButtons.forEach((button) => button.addEventListener("click", save));
    revertButtons.forEach((button) => button.addEventListener("click", revert));
    document.addEventListener("click", guardNavigation, true);
    global.addEventListener("beforeunload", guardUnload);
    cancelNavigation?.addEventListener("click", () => closeDialog());
    continueNavigation?.addEventListener("click", () => {
      const href = pendingHref;
      pendingHref = "";
      dirty = false;
      closeDialog();
      if (href) global.location.assign(href);
    });

    setClean();

    async function save() {
      if (!dirty || saving) return;
      saving = true;
      updateButtons();
      try {
        const saved = await options.onSave?.();
        if (saved !== false) setClean();
      } finally {
        saving = false;
        updateButtons();
      }
    }

    function revert() {
      if (!dirty || saving) return;
      for (const [control, value] of snapshot) writeControlValue(control, value);
      options.onRevert?.();
      setDirty(false);
    }

    function setClean() {
      snapshot = new Map(listControls().map((control) => [control, readControlValue(control)]));
      setDirty(false);
    }

    function updateDirtyState() {
      const changed = [...snapshot].some(([control, value]) => readControlValue(control) !== value)
        || listControls().some((control) => !snapshot.has(control));
      setDirty(changed);
    }

    /** @param {boolean} nextDirty */
    function setDirty(nextDirty) {
      dirty = Boolean(nextDirty);
      writeHostDirtyState(page, dirty);
      updateButtons();
      options.onDirtyChange?.(dirty);
    }

    function updateButtons() {
      saveButtons.forEach((button) => { setMember(button, "disabled", !dirty || saving); });
      revertButtons.forEach((button) => { setMember(button, "disabled", !dirty || saving); });
    }

    function flashUnsaved() {
      saveButtons.forEach((button) => {
        button.classList.remove("is-unsaved-flash");
        void member(button, "offsetWidth");
        button.classList.add("is-unsaved-flash");
      });
    }

    function listControls() {
      return [...page.querySelectorAll("[data-settings-scope] input, [data-settings-scope] select, [data-settings-scope] textarea")]
        .filter((control) => !control.closest("[data-settings-action-form]") && !member(control, "disabled"));
    }

    /** @param {unknown} control @returns {boolean} */
    function isTrackedControl(control) {
      return matchesSelector(control, "input, select, textarea")
        && Boolean(callMember(control, "closest", ["[data-settings-scope]"]))
        && !callMember(control, "closest", ["[data-settings-action-form]"]);
    }

    /** @param {MouseEvent} event */
    function guardNavigation(event) {
      if (!dirty || saving || event.defaultPrevented || event.button !== 0) return;
      const link = optionalCallMember(event.target, "closest", ["a[href]"]);
      if (!link || member(link, "target") === "_blank" || callMember(link, "hasAttribute", ["download"])) return;
      const url = new global.URL(String(member(link, "href")), document.baseURI);
      if (url.href === global.location.href || url.origin !== global.location.origin) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      pendingHref = url.href;
      openDialog();
    }

    /** @param {BeforeUnloadEvent} event */
    function guardUnload(event) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function openDialog() {
      if (typeof member(dialog, "showModal") === "function") callMember(dialog, "showModal", []);
      else dialog?.setAttribute("open", "");
    }

    function closeDialog() {
      if (typeof member(dialog, "close") === "function") callMember(dialog, "close", []);
      else dialog?.removeAttribute("open");
    }

    return Object.freeze({ isDirty: () => dirty, setClean, updateDirtyState });
  }

  /**
   * The element the controller wires, which a caller may supply in place of the page's own.
   *
   * @param {Element | null} [hostOption]
   * @returns {Element}
   */
  function requireSettingsHost(hostOption) {
    const page = hostOption || document.querySelector("[data-settings-host]");
    if (!page) {
      throw new Error("Settings page controller requires a settings host.");
    }
    return page;
  }

  /**
   * Record the dirty state on the host's own dataset.
   *
   * `BrowserSettingsPageControllerOptions.root` is an `Element`, because a caller supplies it.
   * `dataset` belongs to `HTMLElement` and `SVGElement` rather than to every element, so it is
   * read the way the member access read it, and a host carrying none fails as it always did -
   * named here rather than reported as an anonymous property access.
   *
   * @param {Element} page
   * @param {boolean} dirty
   */
  function writeHostDirtyState(page, dirty) {
    const dataset = Reflect.get(page, "dataset");
    if (dataset === null || dataset === undefined) {
      throw new TypeError("The settings host carries no dataset to record its dirty state in.");
    }
    Reflect.set(Object(dataset), "settingsDirty", dirty ? "true" : "false", dataset);
  }

  /**
   * `value[key]`, read with `value` as its own receiver.
   *
   * The controls, buttons and links this page collects are `Element`s by selector; the members
   * read here - `disabled`, `offsetWidth`, `type`, `value`, `href` - belong to the subtypes the
   * markup actually renders. Each is read exactly as the property access read it, so an element
   * that does not carry one still answers `undefined` rather than being refused.
   *
   * @param {unknown} value
   * @param {PropertyKey} key
   * @returns {unknown}
   */
  function member(value, key) {
    return Reflect.get(Object(value), key, value);
  }

  /**
   * `[...value]`: the iteration the spread performed, driven by the value's own iterator.
   *
   * The option lists this reads are live collections, and the spread has always walked them
   * through that iterator. Checking for it first is what keeps this a read rather than an
   * assertion: a value that could not be spread still fails, as a `TypeError`, here.
   *
   * @param {unknown} value
   * @returns {unknown[]}
   */
  function spreadOf(value) {
    if (typeof member(value, Symbol.iterator) !== "function") {
      throw new TypeError("The settings control's option list cannot be iterated.");
    }
    return [...Object(value)];
  }

  /**
   * `value[key] = next`, written through the member's own setter.
   *
   * @param {unknown} value
   * @param {string} key
   * @param {unknown} next
   */
  function setMember(value, key, next) {
    Reflect.set(Object(value), key, next, value);
  }

  /**
   * `value[key](...args)`, called on its own receiver.
   *
   * @param {unknown} value
   * @param {string} key
   * @param {unknown[]} args
   * @returns {unknown}
   */
  function callMember(value, key, args) {
    const method = member(value, key);
    if (typeof method !== "function") {
      throw new TypeError(`The settings page cannot call ${key} on this value.`);
    }
    return Reflect.apply(method, value, args);
  }

  /**
   * `value?.[key]?.(...args)`: the optional call, which answers `undefined` when the value or
   * the method is absent and fails where a present, uncallable member failed.
   *
   * @param {unknown} value
   * @param {string} key
   * @param {unknown[]} args
   * @returns {unknown}
   */
  function optionalCallMember(value, key, args) {
    const method = member(value, key);
    return method === null || method === undefined ? undefined : callMember(value, key, args);
  }

  /**
   * `value?.matches?.(selector)` as the truthiness the callers test.
   *
   * @param {unknown} value
   * @param {string} selector
   * @returns {boolean}
   */
  function matchesSelector(value, selector) {
    return Boolean(optionalCallMember(value, "matches", [selector]));
  }

  /** @param {Element} control @returns {string} */
  function readControlValue(control) {
    const type = member(control, "type");
    if (type === "checkbox" || type === "radio") return member(control, "checked") ? "1" : "0";
    if (member(control, "multiple")) {
      return JSON.stringify(spreadOf(member(control, "selectedOptions")).map((option) => member(option, "value")));
    }
    return String(member(control, "value") ?? "");
  }

  /** @param {Element} control @param {string} value */
  function writeControlValue(control, value) {
    if (!member(control, "isConnected")) return;
    const type = member(control, "type");
    if (type === "checkbox" || type === "radio") setMember(control, "checked", value === "1");
    else if (member(control, "multiple")) {
      const selected = new Set(JSON.parse(value || "[]"));
      spreadOf(member(control, "options")).forEach((option) => { setMember(option, "selected", selected.has(member(option, "value"))); });
    } else setMember(control, "value", value);
  }

  /** @param {unknown} control @returns {boolean} */
  function isImmediateControl(control) {
    return matchesSelector(control, "select, input[type='checkbox'], input[type='radio']");
  }

  root.settingsPageController = Object.freeze({ create });
})(window);
