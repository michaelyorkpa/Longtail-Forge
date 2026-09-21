(function () {
  const namespace = window.LongtailForge || {};
  let modalCounter = 0;

  /**
   * One button the dialog offers, and the value closing through it resolves with.
   * @typedef {{ label: string, value: boolean, autofocus?: boolean, danger?: boolean }} DialogAction
   */

  /**
   * Whether an element can take focus.
   *
   * `document.activeElement` and a query both answer an `Element`, and focusing belongs to
   * `HTMLElement` and `SVGElement` rather than to every element. This reads the member the
   * way `typeof element.focus === "function"` read it and claims only what that proves.
   *
   * @param {unknown} value
   * @returns {value is Element & { focus: () => unknown }}
   */
  function isFocusable(value) {
    return typeof Reflect.get(Object(value), "focus", value) === "function";
  }

  function confirmDialog({
    title = "Confirm action",
    message = "Continue?",
    confirmLabel = "Continue",
    cancelLabel = "Cancel",
    danger = false,
  } = {}) {
    return openDialog({
      title,
      message,
      actions: [
        { label: cancelLabel, value: false, autofocus: true },
        { label: confirmLabel, value: true, danger },
      ],
    });
  }

  function alertDialog({
    title = "Notice",
    message = "",
    confirmLabel = "OK",
  } = {}) {
    return openDialog({
      title,
      message,
      actions: [{ label: confirmLabel, value: true, autofocus: true }],
    });
  }

  /** @param {{ title: string, message: string, actions: DialogAction[] }} options */
  function openDialog({ title, message, actions }) {
    const trigger = document.activeElement;
    const dialog = document.createElement("dialog");
    const form = document.createElement("form");
    const heading = document.createElement("h2");
    const text = document.createElement("p");
    const actionWrap = document.createElement("div");
    const headingId = `app-dialog-title-${Date.now()}-${modalCounter}`;
    const descriptionId = `app-dialog-description-${Date.now()}-${modalCounter}`;

    modalCounter += 1;

    dialog.className = "app-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", headingId);
    dialog.setAttribute("aria-describedby", descriptionId);

    form.method = "dialog";
    form.className = "app-dialog-form";

    heading.id = headingId;
    heading.textContent = title;
    text.id = descriptionId;
    text.textContent = message;
    actionWrap.className = "form-actions";

    form.append(heading, text, actionWrap);
    dialog.appendChild(form);
    document.body.appendChild(dialog);

    return new Promise((resolve) => {
      let resolvedValue = false;

      /** @param {boolean} value */
      function closeWith(value) {
        resolvedValue = value;
        dialog.close(String(value));
      }

      actions.forEach((action) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = action.label;

        if (action.danger) {
          button.className = "danger-action";
        }

        button.addEventListener("click", () => closeWith(action.value));
        actionWrap.appendChild(button);

        if (action.autofocus) {
          button.dataset.autofocus = "";
        }
      });

      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        closeWith(false);
      });
      dialog.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeWith(false);
        }
      });
      dialog.addEventListener(
        "close",
        () => {
          dialog.remove();

          if (trigger && isFocusable(trigger)) {
            trigger.focus();
          }

          resolve(resolvedValue);
        },
        { once: true },
      );

      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }

      const focusTarget =
        dialog.querySelector("[data-autofocus]") ||
        dialog.querySelector("button");

      if (focusTarget) {
        if (!isFocusable(focusTarget)) {
          throw new TypeError("The dialog's focus target cannot take focus.");
        }
        focusTarget.focus();
      }
    });
  }

  namespace.modal = {
    alert: alertDialog,
    confirm: confirmDialog,
  };
  window.LongtailForge = namespace;
}());
