(function attachSettingsHost(global) {
  const root = global.LongtailForge ||= {};
  const view = root.view;
  const LEAVE_WORKSPACE_WARNING = "Leaving a workspace removes only your membership. The workspace and its data are not deleted. A Workspace Administrator or Super Admin must restore your access if you need to return.";

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
    } else if (placement === "calendar") {
      mountCalendarHost(hostElement);
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
    hostElement.appendChild(view.createPageHeader({
      title: "Workspace Settings",
      actions: [
        action("Users", "openWorkspaceUsers", { icon: "user" }),
        ...settingsPageActions("top"),
      ],
    }));

    const form = element("form", {
      className: "settings-form",
      dataset: { workspaceSettingsForm: "", settingsScope: "" },
    });
    const layout = element("div", { className: "workspace-settings-grid" });
    const primary = element("div", { className: "workspace-settings-column" });
    const secondary = element("div", { className: "workspace-settings-column" });

    const workspaceAttachment = attachment("workspace");
    workspaceAttachment.append(
      element("div", { dataset: { workspaceCoreSettings: "" } }),
      element("div", { dataset: { workspaceModuleSettings: "" } }),
    );

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
          description: "Workspace type is set at creation and cannot be changed.",
        }, "workspaceTypeInput", { disabled: true }),
      ]),
      workspaceAttachment,
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
      readoutSection("Workspace Backup", "workspace-backup-readout", [
        element("p", {
          className: "runtime-diagnostics-note",
          text: "Create a protected server-side recovery package for this workspace. It includes workspace records and internal Files objects, excludes credentials and other workspaces, and never includes the Secure Notes master key.",
        }),
        element("div", {
          className: "settings-summary-grid workspace-backup-summary",
          dataset: { workspaceBackupSummary: "" },
        }),
        element("div", {
          className: "runtime-diagnostics-warnings",
          attrs: { role: "status", "aria-live": "polite" },
          dataset: { workspaceBackupStatus: "" },
        }),
        action("Create Workspace Backup", "createWorkspaceBackup", {
          className: "secondary-button",
        }),
      ], { workspaceBackupFieldset: "" }),
      readoutSection("Delete Workspace", "workspace-deletion-readout", [
        element("p", {
          className: "workspace-membership-warning",
          text: "Delete Workspace is separate from Leave Workspace. It schedules this workspace and its data for deletion after a 30-day grace period; nothing is deleted by this request.",
        }),
        element("div", {
          className: "settings-summary-grid workspace-deletion-summary",
          dataset: { workspaceDeletionSummary: "" },
        }),
        element("div", {
          className: "runtime-diagnostics-warnings",
          attrs: { role: "status", "aria-live": "polite" },
          dataset: { workspaceDeletionStatus: "" },
        }),
        action("Delete Workspace", "openWorkspaceDeletion", {
          className: "danger-button",
          hidden: true,
        }),
        action("Cancel Workspace Deletion", "openWorkspaceDeletionCancel", {
          className: "secondary-button",
          hidden: true,
        }),
      ], { workspaceDeletionFieldset: "" }),
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
    form.append(layout);

    const status = view.createStatusMessage({ className: "settings-page-status", hidden: true });
    status.dataset.workspaceSettingsStatus = "";
    hostElement.append(form, settingsPageFooter(), status, workspaceUsersDialog(), workspaceDeletionDialog(), unsavedChangesDialog());
  }

  function mountUserHost(hostElement) {
    hostElement.appendChild(view.createPageHeader({ title: "User Settings", actions: settingsPageActions("top") }));
    const grid = element("div", { className: "user-settings-grid" });
    const primary = element("div", { className: "user-settings-column" });
    const secondary = element("div", { className: "user-settings-column" });
    const userAttachment = attachment("user");
    userAttachment.dataset.settingsScope = "";

    primary.append(
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
        }, "themeModeOption", {
          shellClassName: "theme-mode-field",
          controlsClassName: "theme-mode-control",
          optionClassName: "settings-segmented-option",
        }),
        field({
          id: "themeAutoSource",
          label: "Auto source",
          type: "radio",
          options: [{ value: "system", label: "Match operating system" }],
        }, "themeAutoSource", {
          hidden: true,
          shellClassName: "theme-auto-source",
          controlsClassName: "theme-auto-source-options",
          shellDataset: { themeAutoSourceControls: "" },
          optionClassName: "settings-segmented-option",
        }),
      ]),
      profileForm(),
    );

    secondary.append(
      settingsForm("userAppPreferencesForm", "User App Preferences", [
        field({
          id: "preferredLoginLanding",
          label: "Initial login page",
          type: "select",
          options: userLandingPageOptions(),
        }, "preferredLoginLanding"),
        field({
          id: "preferredWorkspaceSwitchLanding",
          label: "After changing workspaces",
          type: "select",
          options: userLandingPageOptions(),
        }, "preferredWorkspaceSwitchLanding"),
        field({
          id: "preferredCalendarView",
          label: "Default calendar view",
          type: "select",
          options: [
            { value: "", label: "Automatic (Day on mobile, Month on desktop)" },
            { value: "day", label: "Day" },
            { value: "week", label: "Week" },
            { value: "month", label: "Month" },
          ],
        }, "preferredCalendarView"),
      ]),
      settingsForm("userMarkdownRenderingForm", "Markdown Rendering", [
        field({ id: "openExternalLinksNewTab", label: "Open external links in a new tab", type: "boolean" }, "openExternalLinksNewTab"),
      ]),
      credentialForm(),
      userAttachment,
    );

    const notificationPreferences = settingsForm("userNotificationPreferencesForm", "Notification Preferences", [
        element("div", { dataset: { userNotificationGroupingPreferences: "" } }),
        element("div", {
          className: "notification-preference-list",
          dataset: { userNotificationPreferenceList: "" },
        }),
      ]);
    notificationPreferences.classList.add("user-settings-wide");

    grid.append(
      primary,
      secondary,
      notificationPreferences,
      leaveWorkspaceForm(),
      deleteAccountForm(),
      workspaceCreateForm(),
    );

    const status = view.createStatusMessage({ className: "settings-page-status", hidden: true });
    status.dataset.userSettingsStatus = "";
    hostElement.append(grid, settingsPageFooter(), status, workspaceRemovalDialog(), unsavedChangesDialog());
  }

  function mountCalendarHost(hostElement) {
    hostElement.appendChild(view.createPageHeader({ title: "Calendar" }));

    const form = element("form", {
      className: ["settings-form", "calendar-subscription-create-form"],
      dataset: { calendarSubscriptionCreateForm: "", settingsActionForm: "" },
    });
    const clientField = field({
      id: "calendarSubscriptionClient",
      label: "Client",
      type: "select",
      options: [{ value: "", label: "Choose a client" }],
    }, "calendarSubscriptionClient", {
      hidden: true,
      shellDataset: { calendarSubscriptionClientField: "" },
    });
    const projectField = field({
      id: "calendarSubscriptionProject",
      label: "Project",
      type: "select",
      options: [{ value: "", label: "Choose a project" }],
    }, "calendarSubscriptionProject", {
      hidden: true,
      shellDataset: { calendarSubscriptionProjectField: "" },
    });
    form.appendChild(settingsSection("Create Calendar Subscription", [
      element("p", {
        className: "calendar-subscription-intro",
        text: "Create a named, read-only Tasks calendar URL for this workspace. Each URL is a bearer secret and follows its owner's current permissions.",
      }),
      element("p", {
        className: "runtime-diagnostics-note",
        dataset: { calendarSubscriptionAvailability: "" },
        text: "Checking Tasks availability...",
      }),
      field({
        id: "calendarSubscriptionName",
        label: "Name",
        type: "text",
        required: true,
        autocomplete: "off",
        placeholder: "Team planning calendar",
      }, "calendarSubscriptionName", {
        controlAttrs: { maxlength: "120" },
      }),
      field({
        id: "calendarSubscriptionScope",
        label: "Scope",
        type: "select",
        required: true,
        options: [
          { value: "workspace", label: "Workspace" },
          { value: "client", label: "Client" },
          { value: "project", label: "Project" },
        ],
        description: "Start with the workspace, or narrow this subscription to one readable Client or Project.",
      }, "calendarSubscriptionScope"),
      clientField,
      projectField,
      element("p", {
        attrs: { "aria-live": "polite", role: "status" },
        className: "calendar-subscription-status",
        dataset: { calendarSubscriptionCreateStatus: "" },
      }),
    ], {
      actions: [
        action("Create Subscription", "createCalendarSubscription", {
          role: "primary",
          type: "submit",
        }),
      ],
    }));

    const subscriptionUrlField = field({
      id: "calendarSubscriptionUrl",
      label: "Private subscription URL",
      type: "text",
      autocomplete: "off",
    }, "calendarSubscriptionUrl", {
      inputType: "password",
      controlAttrs: {
        readonly: "",
        spellcheck: "false",
      },
      shellDataset: { calendarSubscriptionUrlField: "" },
    });
    const secretPanel = readoutSection("New Calendar Subscription", "calendar-subscription-secret-panel", [
      element("p", {
        className: "calendar-subscription-intro",
        dataset: { calendarSubscriptionSecretDetail: "" },
        text: "Copy this private URL now. Longtail Forge stores only its hash and cannot show it again.",
      }),
      subscriptionUrlField,
      view.createInlineActionRow({
        className: "view-settings-section-actions",
        children: [
          action("Reveal URL", "revealCalendarSubscription"),
          action("Copy URL", "copyCalendarSubscription"),
        ],
      }),
      element("p", {
        attrs: { "aria-live": "polite", role: "status" },
        className: "calendar-subscription-status",
        dataset: { calendarSubscriptionSecretStatus: "" },
      }),
    ], {
      calendarSubscriptionSecretPanel: "",
    });
    secretPanel.hidden = true;

    const guidance = readoutSection("Use the URL", "calendar-subscription-guidance", [
      element("p", {
        text: "Calendar clients refresh subscriptions periodically, not in real time. Subscribe to the URL instead of importing a one-time .ics file.",
      }),
      calendarClientGuidance(),
      element("p", {
        children: [
          element("a", {
            attrs: { href: "help.html?article=settings-and-user-preferences" },
            text: "Open Calendar subscription help",
          }),
        ],
      }),
    ]);

    const table = element("table", {
      className: ["report-table", "calendar-subscription-table"],
      children: [
        element("thead", {
          children: [
            element("tr", {
              children: ["Name", "Owner", "Scope", "Status", "Created", "Rotated", "Revoked", "Actions"]
                .map((label) => element("th", { attrs: { scope: "col" }, text: label })),
            }),
          ],
        }),
        element("tbody", { dataset: { calendarSubscriptionList: "" } }),
      ],
    });
    const listSection = readoutSection("Workspace Calendar Subscriptions", "calendar-subscription-list-section", [
      element("div", {
        className: ["report-table-wrap", "calendar-subscription-table-wrap"],
        children: [table],
      }),
      element("p", {
        attrs: { "aria-live": "polite", role: "status" },
        className: "calendar-subscription-status",
        dataset: { calendarSubscriptionListStatus: "" },
      }),
    ]);

    hostElement.append(form, secretPanel, guidance, listSection);
  }

  function calendarClientGuidance() {
    const links = [
      ["Google Calendar", "https://support.google.com/calendar/answer/37100", "On a computer, choose Other calendars, Add other calendars, then From URL."],
      ["Apple Calendar", "https://support.apple.com/guide/calendar/subscribe-to-calendars-icl1022/mac", "On Mac, choose File, then New Calendar Subscription."],
      ["Outlook", "https://support.microsoft.com/en-US/Outlook/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web", "Choose Add calendar, then Subscribe from web."],
      ["Thunderbird", "https://support.mozilla.org/en-US/kb/creating-new-calendars", "Choose New Calendar, On the Network, then paste the URL."],
    ];
    return element("ul", {
      className: "calendar-subscription-client-list",
      children: links.map(([label, href, text]) => element("li", {
        children: [
          element("a", {
            attrs: { href, rel: "noopener noreferrer", target: "_blank" },
            text: label,
          }),
          document.createTextNode(` - ${text}`),
        ],
      })),
    });
  }

  function workspaceCreateForm() {
    const form = element("form", {
      className: "settings-form",
      dataset: { workspaceCreateForm: "", settingsActionForm: "" },
    });
    const disclosure = element("details", {
      className: ["view-settings-section", "user-settings-wide", "user-settings-disclosure"],
      dataset: { workspaceCreationDisclosure: "" },
    });
    const fields = [
      field({ id: "newWorkspaceType", label: "Workspace Type", type: "select", required: true }, "newWorkspaceType"),
      field({ id: "newWorkspaceName", label: "Workspace Name", type: "text", required: true, autocomplete: "off" }, "newWorkspaceName"),
      attachment("new-workspace", { className: "workspace-create-module-settings" }),
    ];
    disclosure.append(
      element("summary", { className: "user-settings-disclosure-summary", text: "Workspace Creation" }),
      form,
    );
    form.append(
      view.createFieldGrid({
        editable: true,
        fields,
        className: "view-settings-section-fields",
        surface: false,
      }),
      view.createInlineActionRow({
        className: "view-settings-section-actions",
        children: [action("Create Workspace", "createWorkspace", { type: "submit", role: "primary" })],
      }),
    );
    return disclosure;
  }

  function leaveWorkspaceForm() {
    const form = element("form", {
      className: ["settings-form", "user-settings-wide"],
      dataset: { settingsActionForm: "" },
    });
    const section = settingsSection("Leave Workspace", [
      element("p", {
        className: "workspace-membership-warning",
        text: LEAVE_WORKSPACE_WARNING,
      }),
    ], {
      actions: [action("Leave Workspace", "openWorkspaceRemoval")],
    });
    form.appendChild(section);
    return form;
  }

  function deleteAccountForm() {
    const form = element("form", {
      className: ["settings-form", "user-settings-wide"],
      dataset: { settingsActionForm: "" },
    });
    const section = settingsSection("Delete Account", [
      element("p", {
        className: "workspace-membership-warning",
        text: "Retire this account's credentials and access to every workspace. Your email address, display name, contributions, and attribution are retained in workspace history.",
      }),
    ], {
      actions: [action("Delete Account", "deleteAccount", { className: "danger-button" })],
    });
    form.appendChild(section);
    return form;
  }

  function credentialForm() {
    const form = settingsForm("userPasswordForm", "Password", [
      field({ id: "currentPassword", label: "Current Password", type: "text", required: true, autocomplete: "current-password" }, "currentPassword", { inputType: "password" }),
      field({ id: "newPassword", label: "New Password", type: "text", required: true, autocomplete: "new-password" }, "newPassword", { inputType: "password", controlAttrs: { minlength: "8" } }),
      field({ id: "confirmPassword", label: "Confirm New Password", type: "text", required: true, autocomplete: "new-password" }, "confirmPassword", { inputType: "password", controlAttrs: { minlength: "8" } }),
    ], [action("Change Password", "savePassword", { type: "submit", role: "primary" })]);
    form.dataset.settingsActionForm = "";
    return form;
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
        options: root.timezones?.listSupportedTimezones?.() || [{ value: "UTC", label: "UTC (UTC +00:00)" }],
      }, "profileTimezone"),
    ]);
  }

  function userLandingPageOptions() {
    return [
      { value: "dashboard", label: "Dashboard" },
      { value: "workbench", label: "Workbench" },
      { value: "tasks", label: "Actions: Tasks" },
      { value: "notes", label: "Actions: Notes" },
      { value: "lists", label: "Actions: Lists" },
    ];
  }

  function mountModuleHost(hostElement) {
    const moduleId = String(hostElement.dataset.settingsModuleId || "").trim();
    const title = String(hostElement.dataset.settingsTitle || "Module Settings").trim();
    hostElement.appendChild(view.createPageHeader({ title, actions: settingsPageActions("top") }));
    const form = element("form", {
      className: "settings-form",
      dataset: { moduleSettingsForm: moduleId, settingsScope: "" },
    });
    form.append(
      attachment("module", { moduleId }),
      element("div", { dataset: { moduleSettingsLegacy: moduleId } }),
    );
    const status = view.createStatusMessage({ className: "settings-page-status", hidden: true });
    status.dataset.moduleSettingsStatus = "";
    hostElement.append(form, settingsPageFooter(), status, unsavedChangesDialog());
  }

  function settingsForm(datasetKey, title, fields, actions = []) {
    const form = element("form", { className: "settings-form", dataset: { [datasetKey]: "", settingsScope: "" } });
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
    if (options.controlsClassName) {
      const optionLabels = [...fieldElement.querySelectorAll("label")];
      const controls = element("div", {
        className: options.controlsClassName,
        children: optionLabels,
      });
      fieldElement.replaceChildren(
        fieldElement.viewParts.label,
        controls,
        fieldElement.viewParts.message,
      );
    }
    return fieldElement;
  }

  function action(label, datasetKey, options = {}) {
    const button = view.createActionButton({
      className: options.className,
      disabled: options.disabled,
      icon: options.icon,
      label,
      role: options.role,
      type: options.type || "button",
    });
    button.dataset[datasetKey] = "";
    button.hidden = options.hidden === true;
    return button;
  }

  function settingsPageActions(position) {
    const revert = action("Revert", "settingsPageRevert", {
      className: "settings-page-revert",
      disabled: true,
      icon: "restore",
    });
    const save = action("Save", "settingsPageSave", {
      className: "settings-page-save",
      disabled: true,
      icon: "save",
      role: "primary",
    });
    revert.dataset.settingsActionPosition = position;
    save.dataset.settingsActionPosition = position;
    return [revert, save];
  }

  function settingsPageFooter() {
    return view.createInlineActionRow({
      className: "settings-page-footer-actions",
      ariaLabel: "Settings page actions",
      children: settingsPageActions("bottom"),
    });
  }

  function unsavedChangesDialog() {
    const cancel = action("Cancel", "settingsUnsavedCancel");
    const proceed = action("Continue", "settingsUnsavedContinue", { role: "primary" });
    const dialog = view.createModal({
      title: "Unsaved changes",
      body: [element("p", { text: "You have unsaved settings changes. Continue without saving them?" })],
      actions: [cancel, proceed],
      className: "settings-unsaved-dialog",
    });
    dialog.dataset.settingsUnsavedDialog = "";
    return dialog;
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

  function workspaceDeletionDialog() {
    const explanation = element("p", {
      className: "workspace-membership-warning",
      dataset: { workspaceDeletionDialogExplanation: "" },
    });
    const workspaceNameField = field({
      id: "workspaceDeletionName",
      label: "Type the workspace name",
      type: "text",
      required: true,
    }, "workspaceDeletionName");
    const acknowledgementField = field({
      id: "workspaceDeletionAcknowledgement",
      label: "No-current-backup acknowledgement",
      type: "text",
      required: true,
    }, "workspaceDeletionAcknowledgement", {
      shellDataset: { workspaceDeletionAcknowledgementField: "" },
    });
    const status = element("p", {
      attrs: { role: "status", "aria-live": "polite" },
      dataset: { workspaceDeletionDialogStatus: "" },
    });
    const close = action("Close", "closeWorkspaceDeletion");
    const confirm = action("Schedule Deletion", "confirmWorkspaceDeletion", { className: "danger-button" });
    const dialog = view.createModal({
      title: "Delete Workspace",
      body: [explanation, workspaceNameField, acknowledgementField, status],
      actions: [close, confirm],
      className: "workspace-deletion-dialog",
    });
    dialog.dataset.workspaceDeletionDialog = "";
    return dialog;
  }

  function workspaceRemovalDialog() {
    const intro = element("p", {
      className: "workspace-membership-warning",
      text: LEAVE_WORKSPACE_WARNING,
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
