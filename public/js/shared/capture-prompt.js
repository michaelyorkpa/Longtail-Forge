(function attachCapturePrompt(global) {
  const namespace = global.LongtailForge || {};

  function requireView() {
    const view = namespace.view;
    if (!view?.createModalForm || !view?.createActionButton || !view?.createElement || !view?.showModal || !view?.closeModal) {
      throw new Error("Capture prompts require LongtailForge.view modal helpers.");
    }
    return view;
  }

  function open(options = {}) {
    const view = requireView();
    const input = options.multiline === false
      ? view.createElement("input", {
          attrs: {
            type: "text",
            required: true,
            value: options.value || "",
          },
        })
      : view.createElement("textarea", {
          attrs: {
            required: true,
            rows: String(options.rows || 3),
          },
          text: options.value || "",
        });
    input.dataset.capturePromptInput = "";

    const cancel = view.createActionButton({
      label: options.cancelLabel || "Cancel",
      role: "secondary",
      type: "button",
    });
    cancel.dataset.capturePromptCancel = "";
    const continueAction = view.createActionButton({
      label: options.confirmLabel || "Continue",
      role: "primary",
      type: "submit",
    });
    continueAction.dataset.capturePromptContinue = "";

    const dialog = view.createModalForm({
      title: options.prompt || "Add context",
      className: ["capture-prompt-dialog", options.className].filter(Boolean).join(" "),
      formClassName: "capture-prompt-form",
      fields: [
        view.createElement("label", {
          attrs: { "data-view-field-width": "full" },
          children: [options.label || "Details", input],
        }),
      ],
      actions: [cancel, continueAction],
    });
    dialog.dataset.capturePrompt = "";

    return new Promise((resolve) => {
      let result = { confirmed: false, value: "" };
      dialog.viewParts.form.addEventListener("submit", (event) => {
        event.preventDefault();
        const value = input.value.trim();
        if (!value) {
          input.reportValidity?.();
          return;
        }
        result = { confirmed: true, value };
        view.closeModal(dialog, "continue");
      });
      cancel.addEventListener("click", () => view.closeModal(dialog, "cancel"));
      dialog.addEventListener("close", () => {
        dialog.remove();
        resolve(result);
      }, { once: true });

      document.body.appendChild(dialog);
      view.showModal(dialog, {
        parent: options.parent || null,
        trigger: options.trigger || document.activeElement,
      });
      input.focus();
      input.select?.();
    });
  }

  namespace.capturePrompt = { open };
  global.LongtailForge = namespace;
}(window));
