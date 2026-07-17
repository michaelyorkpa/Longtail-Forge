(function attachSettingsPageController(global) {
  const root = global.LongtailForge ||= {};

  function create(options = {}) {
    const page = options.root || document.querySelector("[data-settings-host]");
    if (!page) {
      throw new Error("Settings page controller requires a settings host.");
    }
    const saveButtons = [...page.querySelectorAll("[data-settings-page-save]")];
    const revertButtons = [...page.querySelectorAll("[data-settings-page-revert]")];
    const dialog = page.querySelector("[data-settings-unsaved-dialog]");
    const cancelNavigation = dialog?.querySelector("[data-settings-unsaved-cancel]");
    const continueNavigation = dialog?.querySelector("[data-settings-unsaved-continue]");
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

    function setDirty(nextDirty) {
      dirty = Boolean(nextDirty);
      page.dataset.settingsDirty = dirty ? "true" : "false";
      updateButtons();
      options.onDirtyChange?.(dirty);
    }

    function updateButtons() {
      saveButtons.forEach((button) => { button.disabled = !dirty || saving; });
      revertButtons.forEach((button) => { button.disabled = !dirty || saving; });
    }

    function flashUnsaved() {
      saveButtons.forEach((button) => {
        button.classList.remove("is-unsaved-flash");
        void button.offsetWidth;
        button.classList.add("is-unsaved-flash");
      });
    }

    function listControls() {
      return [...page.querySelectorAll("[data-settings-scope] input, [data-settings-scope] select, [data-settings-scope] textarea")]
        .filter((control) => !control.closest("[data-settings-action-form]") && !control.disabled);
    }

    function isTrackedControl(control) {
      return control?.matches?.("input, select, textarea")
        && Boolean(control.closest("[data-settings-scope]"))
        && !control.closest("[data-settings-action-form]");
    }

    function guardNavigation(event) {
      if (!dirty || saving || event.defaultPrevented || event.button !== 0) return;
      const link = event.target?.closest?.("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new global.URL(link.href, document.baseURI);
      if (url.href === global.location.href || url.origin !== global.location.origin) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      pendingHref = url.href;
      openDialog();
    }

    function guardUnload(event) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function openDialog() {
      if (typeof dialog?.showModal === "function") dialog.showModal();
      else dialog?.setAttribute("open", "");
    }

    function closeDialog() {
      if (typeof dialog?.close === "function") dialog.close();
      else dialog?.removeAttribute("open");
    }

    return Object.freeze({ isDirty: () => dirty, setClean, updateDirtyState });
  }

  function readControlValue(control) {
    if (control.type === "checkbox" || control.type === "radio") return control.checked ? "1" : "0";
    if (control.multiple) return JSON.stringify([...control.selectedOptions].map((option) => option.value));
    return String(control.value ?? "");
  }

  function writeControlValue(control, value) {
    if (!control?.isConnected) return;
    if (control.type === "checkbox" || control.type === "radio") control.checked = value === "1";
    else if (control.multiple) {
      const selected = new Set(JSON.parse(value || "[]"));
      [...control.options].forEach((option) => { option.selected = selected.has(option.value); });
    } else control.value = value;
  }

  function isImmediateControl(control) {
    return control?.matches?.("select, input[type='checkbox'], input[type='radio']");
  }

  root.settingsPageController = Object.freeze({ create });
})(window);
