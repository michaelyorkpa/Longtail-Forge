(function attachSettingsHost(global) {
  const root = global.LongtailForge ||= {};
  const view = root.view;

  if (!view?.createElement || !view?.createField || !view?.createFieldGrid || !view?.createActionButton) {
    throw new Error("Settings hosts require LongtailForge.view.");
  }

  const api = Object.freeze({
    attachmentSections,
    mount,
  });
  root.settingsHost = api;

  const host = document.querySelector("[data-settings-host]");
  if (host) {
    mount(host);
  }

  function mount(hostElement) {
    if (!hostElement || hostElement.dataset.settingsHostMounted === "true") {
      return hostElement;
    }
    const placement = String(hostElement.dataset.settingsHost || "").trim();
    hostElement.dataset.settingsHostMounted = "true";
    if (placement === "workspace") {
      mountWorkspaceHost(hostElement);
    } else if (placement === "user") {
      mountUserHost(hostElement);
    } else if (placement === "module") {
      mountModuleHost(hostElement);
    } else {
      throw new Error(`Unknown Settings host '${placement}'.`);
    }
    return hostElement;
  }

  function attachmentSections(catalog, placement, moduleId = "") {
    const attachments = catalog?.attachments || {};
    if (placement === "module") {
      return Array.isArray(attachments.module?.[moduleId]) ? attachments.module[moduleId] : [];
    }
    return Array.isArray(attachments[placement]) ? attachments[placement] : [];
  }

  function mountWorkspaceHost(hostElement) {
    hostElement.appendChild(view.createPageHeader({ title: "Workspace Settings" }));

    const form = element("form", {
      className: "settings-form",
      dataset: { workspaceSettingsForm: "" },
    });
    const layout = element("div", { className: "workspace-settings-grid" });
    const primary = element("div", { className: "workspace-settings-column" });
    const secondary = element("div", { className: "workspace-settings-column" });

    primary.append(
      settingsSection("Workspace", [
        field({ id: "workspaceName", label: "Workspace Name", type: "text", required: true }, "workspaceNameInput"),
        field({
          id: "workspaceType",
          label: "Workspace Type",
          type: "select",
          options: [
            { value: "business", label: "Business" },
            { value: "personal", label: "Personal" },
            { value: "family", label: "Family" },
          ],
        }, "workspaceTypeInput"),
      ]),
      attachment("workspace"),
      settingsSection("Audit Log", [
        field({ id: "auditLoggingEnabled", label: "App Audit Logging", type: "boolean" }, "auditLoggingEnabled"),
        field({
          id: "auditRetentionDays",
          label: "Retention Period",
          type: "select",
          options: [7, 14, 30, 60, 90, 180, 365].map((value) => ({
            value: String(value),
            label: value === 365 ? "1 year" : `${value} days`,
          })),
        }, "auditRetentionDays"),
      ]),
    );

    secondary.append(
      readoutSection("Runtime Diagnostics", "runtime-diagnostics-readout", [
        element("div", {
          className: "settings-summary-grid runtime-diagnostics-grid",
          dataset: { runtimeDiagnosticsSummary: "" },
        }),
        element("div", {
          className: "runtime-diagnostics-warnings",
          attrs: { role: "status", "aria-live": "polite" },
          dataset: { runtimeDiagnosticsWarnings: "" },
        }),
      ], { runtimeDiagnosticsFieldset: "" }),
      readoutSection("Jobs", "job-observability-readout", [
        element("div", {
          className: "settings-summary-grid job-observability-grid",
          dataset: { jobObservabilitySummary: "" },
        }),
        element("div", {
          className: "job-observability-failures",
          attrs: { role: "status", "aria-live": "polite" },
          dataset: { jobObservabilityFailures: "" },
        }),
        action("Load more", "jobObservabilityMore", {
          className: "secondary-button job-observability-more",
          hidden: true,
        }),
      ], { jobObservabilityFieldset: "" }),
    );

    layout.append(primary, secondary);
    form.append(layout, view.createInlineActionRow({
      className: "view-settings-host-actions",
      children: [action("Save Settings", "saveSettings", { type: "submit", role: "primary" })],
    }));

    const secondaryActions = element("div", {
      className: "settings-secondary-actions",
      children: [action("Workspace Users", "openWorkspaceUsers")],
    });
    const status = view.createStatusMessage({ className: "settings-page-status" });
    status.dataset.workspaceSettingsStatus = "";
    hostElement.append(form, secondaryActions, status, workspaceUsersDialog());
  }

  function mountUserHost(hostElement) {
    hostElement.appendChild(view.createPageHeader({ title: "User Settings" }));
    const grid = element("div", { className: "user-settings-grid" });

    grid.append(
      settingsForm("userThemeForm", "Appearance", [
        field({
          id: "themeMode",
          label: "Theme mode",
          type: "radio",
          options: [
            { value: "light", label: "Light" },
            { value: "auto", label: "Auto" },
            { value: "dark", label: "Dark" },
          ],
        }, "themeModeOption", { shellClassName: "theme-mode-control", optionClassName: "settings-segmented-option" }),
        field({
          id: "themeAutoSource",
          label: "Auto source",
          type: "radio",
          options: [{ value: "system", label: "Match operating system" }],
        }, "themeAutoSource", {
          hidden: true,
          shellClassName: "theme-auto-source theme-auto-source-options",
          shellDataset: { themeAutoSourceControls: "" },
          optionClassName: "settings-segmented-option",
        }),
      ]),
      settingsForm("userMarkdownRenderingForm", "Markdown Rendering", [
        field({ id: "openExternalLinksNewTab", label: "Open external links in a new tab", type: "boolean" }, "openExternalLinksNewTab"),
      ]),
      workspaceCreateForm(),
      credentialForm(),
      profileForm(),
      settingsForm("userNotificationPreferencesForm", "Notification Preferences", [
        element("div", { dataset: { userNotificationGroupingPreferences: "" } }),
        element("div", {
          className: "notification-preference-list",
          dataset: { userNotificationPreferenceList: "" },
        }),
      ], [action("Save Notification Preferences", "saveNotificationPreferences", { type: "submit", role: "primary" })]),
      attachment("user"),
    );

    const status = view.createStatusMessage({ className: "settings-page-status" });
    status.dataset.userSettingsStatus = "";
    hostElement.append(grid, status, workspaceRemovalDialog());
  }

  function workspaceCreateForm() {
    const form = element("form", {
      className: "settings-form",
      dataset: { workspaceCreateForm: "" },
    });
    const section = settingsSection("Workspaces", [
      field({ id: "newWorkspaceType", label: "Workspace Type", type: "select", required: true }, "newWorkspaceType"),
      field({ id: "newWorkspaceName", label: "Workspace Name", type: "text", required: true, autocomplete: "off" }, "newWorkspaceName"),
      attachment("new-workspace", { className: "workspace-create-module-settings" }),
    ], {
      actions: [
        action("Leave Workspace", "openWorkspaceRemoval"),
        action("Create Workspace", "createWorkspace", { type: "submit", role: "primary" }),
      ],
    });
    form.appendChild(section);
    return form;
  }

  function credentialForm() {
    return settingsForm("userPasswordForm", "Password", [
      field({ id: "currentPassword", label: "Current Password", type: "text", required: true, autocomplete: "current-password" }, "currentPassword", { inputType: "password" }),
      field({ id: "newPassword", label: "New Password", type: "text", required: true, autocomplete: "new-password" }, "newPassword", { inputType: "password", controlAttrs: { minlength: "8" } }),
      field({ id: "confirmPassword", label: "Confirm New Password", type: "text", required: true, autocomplete: "new-password" }, "confirmPassword", { inputType: "password", controlAttrs: { minlength: "8" } }),
    ], [action("Change Password", "savePassword", { type: "submit", role: "primary" })]);
  }

  function profileForm() {
    return settingsForm("userProfileForm", "Profile", [
      field({ id: "profileUsername", label: "Email Address", type: "text", required: true, autocomplete: "email" }, "profileUsername", { inputType: "email" }),
      field({ id: "profileDisplayName", label: "Display Name", type: "text", required: true, autocomplete: "name" }, "profileDisplayName"),
      field({ id: "profileAltEmail", label: "Alternate Email Address", type: "text", autocomplete: "email" }, "profileAltEmail", { inputType: "email" }),
      field({
        id: "profileTimezone",
        label: "Timezone",
        type: "select",
        required: true,
        options: [
          "America/New_York",
          "America/Chicago",
          "America/Denver",
          "America/Phoenix",
          "America/Los_Angeles",
          "America/Anchorage",
          "Pacific/Honolulu",
          "UTC",
        ].map((value) => ({ value, label: value })),
      }, "profileTimezone"),
    ], [action("Save Profile", "saveProfile", { type: "submit", role: "primary" })]);
  }

  function mountModuleHost(hostElement) {
    const moduleId = String(hostElement.dataset.settingsModuleId || "").trim();
    const title = String(hostElement.dataset.settingsTitle || "Module Settings").trim();
    hostElement.appendChild(view.createPageHeader({ title }));
    const form = element("form", {
      className: "settings-form",
      dataset: { moduleSettingsForm: moduleId },
    });
    form.append(
      attachment("module", { moduleId }),
      element("div", { dataset: { moduleSettingsLegacy: moduleId } }),
    );
    const status = view.createStatusMessage({ className: "settings-page-status" });
    status.dataset.moduleSettingsStatus = "";
    hostElement.append(form, status);
  }

  function settingsForm(datasetKey, title, fields, actions = []) {
    const form = element("form", { className: "settings-form", dataset: { [datasetKey]: "" } });
    form.appendChild(settingsSection(title, fields, { actions }));
    return form;
  }

  function settingsSection(title, fields, options = {}) {
    const fieldset = element("fieldset", {
      className: ["view-settings-section", options.className],
      dataset: options.dataset,
    });
    fieldset.append(
      element("legend", { className: "view-settings-section-legend", text: title }),
      view.createFieldGrid({
        editable: true,
        fields,
        className: "view-settings-section-fields",
        surface: false,
      }),
    );
    if (options.actions?.length) {
      fieldset.appendChild(view.createInlineActionRow({
        className: "view-settings-section-actions",
        children: options.actions,
      }));
    }
    return fieldset;
  }

  function readoutSection(title, className, children, dataset) {
    return element("fieldset", {
      className: ["view-settings-section", className],
      dataset,
      children: [
        element("legend", { className: "view-settings-section-legend", text: title }),
        ...children,
      ],
    });
  }

  function attachment(placement, options = {}) {
    return element("div", {
      className: ["view-settings-sections", options.className],
      dataset: {
        settingsAttachment: placement,
        ...(options.moduleId ? { settingsModuleId: options.moduleId } : {}),
      },
    });
  }

  function field(definition, controlDatasetKey, options = {}) {
    const fieldElement = view.createField(definition, {
      className: options.shellClassName,
      controlAttrs: options.controlAttrs,
      controlDataset: { [controlDatasetKey]: "" },
      disabled: options.disabled,
    });
    Object.entries(options.shellDataset || {}).forEach(([key, value]) => {
      fieldElement.dataset[key] = value;
    });
    Object.entries(options.labelDataset || {}).forEach(([key, value]) => {
      fieldElement.viewParts.label.dataset[key] = value;
    });
    if (options.hidden) {
      fieldElement.hidden = true;
    }
    if (options.inputType) {
      fieldElement.viewParts.control.type = options.inputType;
    }
    if (options.optionClassName) {
      fieldElement.querySelectorAll("label").forEach((label) => label.classList.add(options.optionClassName));
    }
    return fieldElement;
  }

  function action(label, datasetKey, options = {}) {
    const button = view.createActionButton({
      className: options.className,
      label,
      role: options.role,
      type: options.type || "button",
    });
    button.dataset[datasetKey] = "";
    button.hidden = options.hidden === true;
    return button;
  }

  function workspaceUsersDialog() {
    const list = element("div", { className: "workspace-users-list", dataset: { workspaceUsersList: "" } });
    const close = action("Close", "closeWorkspaceUsers");
    const dialog = view.createModal({
      title: "Workspace Users",
      body: [list],
      actions: [close],
      className: "workspace-users-dialog",
    });
    dialog.dataset.workspaceUsersDialog = "";
    return dialog;
  }

  function workspaceRemovalDialog() {
    const intro = element("p", {
      text: "Leaving removes only your membership. The workspace and its data remain available to its other members.",
    });
    const list = element("div", { className: "workspace-removal-list", dataset: { workspaceRemovalList: "" } });
    const close = action("Close", "closeWorkspaceRemoval");
    const dialog = view.createModal({
      title: "Leave a Workspace",
      body: [intro, list],
      actions: [close],
      className: "workspace-removal-dialog",
    });
    dialog.dataset.workspaceRemovalDialog = "";
    return dialog;
  }

  function element(tagName, options = {}) {
    return view.createElement(tagName, options);
  }
})(window);
