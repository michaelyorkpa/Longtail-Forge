/**
 * The modal stack: which dialogs are open, which is on top, which belong to which parent, and
 * what happens to focus when one closes.
 *
 * Extracted from `public/js/shared/view-builder.js` by `0.33.33.35.3`. The builder keeps
 * publishing `showModal`, `closeModal`, `closeChildModals`, and `isTopModal` on the frozen
 * `LongtailForge.view` factory and delegates each to this module, so the public factory
 * contract, its writer list, and its member sets are unchanged. **This module must never write
 * `LongtailForge.view`.**
 *
 * The modal *constructors* stay in the builder. `createModal`, `createModalForm`, and
 * `createModalFooter` are built from the builder's element factory and depend on none of the
 * state here; keeping them there is what lets this module depend on nothing but the dialogs it
 * is handed and `global.document` for the active element.
 *
 * @param {Window} global
 */
(function attachViewModalStack(global) {
  // Scoped inside the IIFE deliberately: a top-level JSDoc typedef in a classic script leaks
  // into the shared type environment the way a top-level `const` leaks into the shared lexical
  // one, which is the thing `0.33.33.33` removed from this estate. Recorded at `0.33.33.34`.

  /**
   * What this module needs of a dialog.
   *
   * Deliberately structural rather than `HTMLDialogElement`: the framework drives real dialogs
   * and the framework regressions drive a fake DOM whose nodes implement only what is used
   * here. A nominal DOM type would make the contract a lie in one of those two worlds.
   * @typedef {{
   *   addEventListener?: (type: string, listener: (event: StackDialogEvent) => void) => void,
   *   close?: (value?: string) => void,
   *   dataset?: Record<string, string | undefined>,
   *   hasAttribute?: (name: string) => boolean,
   *   isConnected?: boolean,
   *   nodeType?: number,
   *   open?: boolean,
   *   removeAttribute?: (name: string) => void,
   *   setAttribute?: (name: string, value: string) => void,
   *   showModal?: () => void,
   * }} StackDialog
   */

  /** @typedef {{ preventDefault?: () => void, stopPropagation?: () => void, target?: unknown }} StackDialogEvent */

  /** @typedef {{ focus?: () => void, isConnected?: boolean }} StackTrigger */

  /**
   * @typedef {{
   *   parent?: StackDialog | null,
   *   returnFocus?: boolean,
   *   trigger?: StackTrigger | null,
   * }} StackOptions
   */

  /**
   * One dialog's place in the stack: who opened it, what to give focus back to, and whether to.
   * @typedef {{
   *   dialog: StackDialog,
   *   parent: StackDialog | null,
   *   returnFocus: boolean,
   *   trigger: StackTrigger | null,
   * }} StackEntry
   */

  const namespace = global.LongtailForge || {};

  /** @type {StackEntry[]} */
  const modalStack = [];
  /** @type {WeakMap<object, StackEntry>} */
  const modalEntries = new WeakMap();

  /**
   * Give a dialog its stack identity and the guardrails that keep a nested dialog from being
   * dismissed out of order.
   *
   * Registering twice updates the existing entry rather than rebinding listeners, so a dialog
   * reopened with a new parent or trigger keeps one set of handlers.
   *
   * @param {StackDialog} dialog
   * @param {StackOptions} [options]
   * @returns {StackEntry}
   */
  function registerModalStack(dialog, options = {}) {
    if (!dialog || typeof dialog.addEventListener !== "function") {
      throw new Error("Modal stack guardrails require a dialog element.");
    }

    const existingEntry = modalEntries.get(dialog);
    if (existingEntry) {
      updateModalStackEntry(existingEntry, options);
      return existingEntry;
    }

    /** @type {StackEntry} */
    const entry = {
      dialog,
      parent: normalizeModalParent(options.parent),
      returnFocus: options.returnFocus !== false,
      trigger: options.trigger || null,
    };
    modalEntries.set(dialog, entry);
    if (dialog.dataset) {
      dialog.dataset.viewModalStack = "";
    }

    // Escape and backdrop clicks only dismiss the top dialog: a parent must not close out from
    // under the child it opened.
    dialog.addEventListener("cancel", (event) => {
      if (!isTopModal(dialog)) {
        event.preventDefault?.();
        event.stopPropagation?.();
      }
    });

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog && !isTopModal(dialog)) {
        event.preventDefault?.();
        event.stopPropagation?.();
      }
    });

    dialog.addEventListener("close", () => {
      closeChildModals(dialog, "parent-closed");
      removeModalStackEntry(dialog);
      if (entry.returnFocus && entry.trigger && typeof entry.trigger.focus === "function" && entry.trigger.isConnected !== false) {
        entry.trigger.focus();
      }
    });

    return entry;
  }

  /**
   * @param {StackEntry} entry
   * @param {StackOptions} [options]
   * @returns {void}
   */
  function updateModalStackEntry(entry, options = {}) {
    if (Object.prototype.hasOwnProperty.call(options, "parent")) {
      entry.parent = normalizeModalParent(options.parent);
    }
    if (options.trigger) {
      entry.trigger = options.trigger;
    }
    entry.returnFocus = options.returnFocus !== false;
  }

  /**
   * @param {unknown} parent
   * @returns {StackDialog | null}
   */
  function normalizeModalParent(parent) {
    return parent && /** @type {StackDialog} */ (parent).nodeType === 1
      ? /** @type {StackDialog} */ (parent)
      : null;
  }

  /**
   * A dialog opened without an explicit parent belongs to whatever is currently on top, which
   * is what makes a dialog opened from inside another one a child of it.
   * @param {StackDialog} dialog
   * @returns {StackDialog | null}
   */
  function defaultModalParent(dialog) {
    const top = modalStack[modalStack.length - 1]?.dialog || null;
    return top && top !== dialog ? top : null;
  }

  /**
   * @param {StackDialog | null | undefined} dialog
   * @returns {boolean}
   */
  function isDialogOpen(dialog) {
    if (!dialog) {
      return false;
    }
    return Boolean(dialog.open || (typeof dialog.hasAttribute === "function" && dialog.hasAttribute("open")));
  }

  /**
   * @param {StackEntry} entry
   * @returns {void}
   */
  function pushModalStackEntry(entry) {
    removeModalStackEntry(entry.dialog, { sync: false });
    modalStack.push(entry);
    syncModalStackMetadata();
  }

  /**
   * @param {StackDialog} dialog
   * @param {{ sync?: boolean }} [options]
   * @returns {void}
   */
  function removeModalStackEntry(dialog, options = {}) {
    const index = modalStack.findIndex((entry) => entry.dialog === dialog);
    if (index >= 0) {
      modalStack.splice(index, 1);
    }
    if (options.sync !== false) {
      syncModalStackMetadata();
    }
  }

  /**
   * Publish each dialog's depth and top-ness onto the DOM, which is what styling and the
   * framework regressions read.
   * @returns {void}
   */
  function syncModalStackMetadata() {
    modalStack.forEach((entry, index) => {
      if (!entry.dialog.dataset) {
        return;
      }
      entry.dialog.dataset.viewModalStackLevel = String(index + 1);
      if (index === modalStack.length - 1) {
        entry.dialog.dataset.viewModalStackTop = "true";
      } else {
        delete entry.dialog.dataset.viewModalStackTop;
      }
    });
  }

  /**
   * Open a dialog on top of the stack.
   *
   * An explicitly passed `parent` is honoured even when it is null, which is how a dialog opts
   * out of being treated as a child of whatever happens to be open.
   *
   * @param {StackDialog} dialog
   * @param {StackOptions} [options]
   * @returns {StackDialog}
   */
  function showModal(dialog, options = {}) {
    const parent = Object.prototype.hasOwnProperty.call(options, "parent")
      ? normalizeModalParent(options.parent)
      : defaultModalParent(dialog);
    const entry = registerModalStack(dialog, { ...options, parent });
    entry.trigger = options.trigger || entry.trigger || /** @type {StackTrigger | null} */ (global.document?.activeElement) || null;
    entry.parent = parent;
    pushModalStackEntry(entry);

    if (!isDialogOpen(dialog)) {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute?.("open", "");
        dialog.open = true;
      }
    }

    return dialog;
  }

  /**
   * Close a dialog and everything it opened.
   *
   * Children close first so a parent never outlives its own descendants. When the dialog is
   * genuinely open the native `close` fires and the registered handler removes the entry; the
   * fallback path removes it here, because no event will arrive.
   *
   * @param {StackDialog | null | undefined} dialog
   * @param {string} [value]
   * @returns {void}
   */
  function closeModal(dialog, value = "") {
    if (!dialog) {
      return;
    }

    closeChildModals(dialog, "parent-closed");
    if (isDialogOpen(dialog)) {
      if (typeof dialog.close === "function") {
        dialog.close(value);
      } else {
        dialog.removeAttribute?.("open");
        dialog.open = false;
        removeModalStackEntry(dialog);
      }
      return;
    }

    removeModalStackEntry(dialog);
  }

  /**
   * Close every dialog opened from this one, deepest first.
   * @param {StackDialog | null | undefined} parent
   * @param {string} [value]
   * @returns {void}
   */
  function closeChildModals(parent, value = "parent-closed") {
    if (!parent) {
      return;
    }

    [...modalStack]
      .reverse()
      .filter((entry) => entry.parent === parent)
      .forEach((entry) => closeModal(entry.dialog, value));
  }

  /**
   * @param {StackDialog | null | undefined} dialog
   * @returns {boolean}
   */
  function isTopModal(dialog) {
    return Boolean(dialog && modalStack[modalStack.length - 1]?.dialog === dialog);
  }

  // Only what view-builder.js delegates. registerModalStack and the entry bookkeeping stay
  // private: the builder has no reason to reach them, and a wider surface would invite one.
  namespace.viewModalStack = Object.freeze({
    closeChildModals,
    closeModal,
    isTopModal,
    showModal,
  });
  global.LongtailForge = namespace;
})(window);
