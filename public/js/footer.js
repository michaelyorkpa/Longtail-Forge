// Shared footer for public and authenticated pages.
const footer = document.createElement("footer");
footer.className = "site-footer";

const footerInner = document.createElement("div");
footerInner.className = "site-footer-inner";

const footerBrand = document.createElement("p");
footerBrand.className = "site-footer-brand";
footerBrand.textContent = [
  "Longtail Forge",
  "Copyright \u00a9 2026 Raymond Tec",
].join("\n");

const footerLicense = document.createElement("p");
footerLicense.className = "site-footer-license";
footerLicense.textContent = [
  "This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by",
  "the Free Software Foundation, either version 3 of the License, or at your option any later version.",
].join("\n");

footerInner.append(footerBrand, footerLicense);
footer.appendChild(footerInner);
document.body.appendChild(footer);

function updateFooterMetrics() {
  const root = document.documentElement;
  const viewportHeight = window.innerHeight || root.clientHeight || 0;
  const footerRect = typeof footer.getBoundingClientRect === "function"
    ? footer.getBoundingClientRect()
    : { top: viewportHeight };
  const footerTop = Number.isFinite(footerRect.top) ? footerRect.top : viewportHeight;
  const footerBottom = Number.isFinite(footerRect.bottom) ? footerRect.bottom : footerTop;
  const visibleFooterOffset = Math.max(
    0,
    Math.min(viewportHeight, footerBottom) - Math.max(footerTop, 0),
  );

  root.style.setProperty("--site-footer-visible-offset", `${Math.ceil(visibleFooterOffset)}px`);
}

async function updateFooterBrand() {
  try {
    const response = await fetch("/api/app-info", {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("App info unavailable");
    }

    const appInfo = await response.json();
    const name = appInfo.name || "Longtail Forge";
    const version = appInfo.version ? ` v${appInfo.version}` : "";

    footerBrand.textContent = [
      `${name}${version}`,
      "Copyright \u00a9 2026 Raymond Tec",
    ].join("\n");
  } catch {
    footerBrand.textContent = [
      "Longtail Forge",
      "Copyright \u00a9 2026 Raymond Tec",
    ].join("\n");
  } finally {
    updateFooterMetrics();
  }
}

updateFooterBrand();
updateFooterMetrics();
mountQuickActionCapture();
window.addEventListener?.("resize", updateFooterMetrics);
window.addEventListener?.("scroll", updateFooterMetrics, { passive: true });

const quickActionScriptLoads = new Map();
const moduleActionBaseDependencies = [
  { src: "js/shared/api-client.js", test: () => window.LongtailForge?.api },
  { src: "js/shared/module-actions.js?v=2", test: () => window.LongtailForge?.moduleActions },
  { src: "js/shared/icons.js?v=4", test: () => window.LongtailForge?.icons },
  { src: "js/shared/view-builder.js?v=16", test: () => window.LongtailForge?.view },
  { src: "js/shared/view-renderer.js?v=13", test: () => window.LongtailForge?.view?.renderSurface },
];
const quickActionDependencySets = {
  "tasks.add": [
    { src: "js/shared/modal.js", test: () => window.LongtailForge?.modal },
    { src: "js/shared/api-client.js", test: () => window.LongtailForge?.api },
    { src: "js/shared/page-controller.js", test: () => window.LongtailForge?.pageController },
    { src: "js/shared/module-actions.js?v=2", test: () => window.LongtailForge?.moduleActions },
    { src: "js/shared/icons.js?v=4", test: () => window.LongtailForge?.icons },
    { src: "js/shared/timezones.js", test: () => window.LongtailForge?.timezones },
    { src: "js/shared/tags.js", test: () => window.LongtailForge?.tags },
    { src: "js/shared/file-attachments.js?v=8", test: () => window.LongtailForge?.fileAttachments },
    { src: "js/shared/notes-linked-panel.js?v=2", test: () => window.LongtailForge?.notesLinkedPanel },
    { src: "js/shared/view-builder.js?v=16", test: () => window.LongtailForge?.view },
    { src: "js/shared/view-renderer.js?v=13", test: () => window.LongtailForge?.view?.renderSurface },
    { src: "js/shared/file-preview.js?v=1", test: () => window.LongtailForge?.filePreview },
    { src: "js/task-dialog.js?v=23", test: () => window.LongtailForge?.tasksDialog?.openTaskEditor },
  ],
  "notes.add": [
    { src: "js/shared/modal.js", test: () => window.LongtailForge?.modal },
    ...moduleActionBaseDependencies,
    { src: "js/shared/tags.js?v=1", test: () => window.LongtailForge?.tags },
    { src: "js/shared/file-attachments.js?v=8", test: () => window.LongtailForge?.fileAttachments },
    { src: "js/shared/notification-subscriptions.js?v=1", test: () => window.LongtailForge?.notificationSubscriptions },
    { src: "js/shared/notes-editor.js?v=4", test: () => window.LongtailForge?.notesEditor },
    { src: "js/shared/file-preview.js?v=1", test: () => window.LongtailForge?.filePreview },
    { module: true, src: "js/notes.js?v=71", test: () => window.LongtailForge?.notesDialog?.openNoteEditor },
  ],
  "lists.add": [
    ...moduleActionBaseDependencies,
    { src: "js/shared/client-project-options.js?v=2", test: () => window.LongtailForge?.clientProjectOptions },
    { module: true, src: "js/lists.js?v=14", test: () => window.LongtailForge?.listsDialog?.openListEditor },
  ],
};

function mountQuickActionCapture() {
  if (!window.LongtailForge?.workspaceContextReady || !document.querySelector(".site-header")) {
    return;
  }

  const shell = createQuickActionShell();
  document.body.append(shell.root);

  window.LongtailForge.workspaceContextReady
    .catch(() => null)
    .finally(() => {
      const actions = readQuickActions();
      if (actions.length === 0) {
        shell.root.hidden = true;
        return;
      }

      renderQuickActions(shell, actions);
      shell.root.hidden = false;
      updateFooterMetrics();
    });
}

function createQuickActionShell() {
  const root = document.createElement("section");
  const toggle = createQuickActionToggle();
  const drawer = document.createElement("div");
  const header = document.createElement("div");
  const title = document.createElement("h2");
  const close = document.createElement("button");
  const body = document.createElement("div");
  const list = document.createElement("div");
  const status = document.createElement("p");

  root.className = "quick-action-capture";
  root.dataset.quickActionCapture = "";
  root.hidden = true;

  drawer.className = "quick-action-capture-drawer surface-drawer";
  drawer.id = "quick-action-capture-drawer";
  drawer.dataset.quickActionDrawer = "";
  drawer.hidden = true;
  drawer.setAttribute("aria-hidden", "true");
  drawer.setAttribute("aria-labelledby", "quick-action-capture-title");
  drawer.setAttribute("role", "dialog");

  header.className = "quick-action-capture-header surface-drawer-header";
  title.id = "quick-action-capture-title";
  title.textContent = "Quick actions";

  close.className = "quick-action-capture-close";
  close.type = "button";
  close.dataset.quickActionClose = "";
  close.setAttribute("aria-label", "Close quick actions");
  close.title = "Close quick actions";
  decorateQuickActionButton(close, { icon: "close", label: "Close quick actions" });
  close.addEventListener("click", () => setQuickActionDrawerOpen({ drawer, toggle }, false));

  body.className = "quick-action-capture-body surface-drawer-body";
  list.className = "quick-action-capture-list";
  list.dataset.quickActionList = "";

  status.className = "quick-action-capture-status";
  status.dataset.quickActionStatus = "";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  header.append(title, close);
  body.append(list, status);
  drawer.append(header, body);
  root.append(toggle, drawer);

  toggle.addEventListener("click", () => {
    const isOpen = toggle.getAttribute("aria-expanded") === "true";
    setQuickActionDrawerOpen({ drawer, list, toggle }, !isOpen);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setQuickActionDrawerOpen({ drawer, toggle }, false);
    }
  });
  document.addEventListener("click", (event) => {
    if (toggle.getAttribute("aria-expanded") !== "true" || root.contains(event.target)) {
      return;
    }

    setQuickActionDrawerOpen({ drawer, toggle }, false, { returnFocus: false });
  });

  return { drawer, list, root, status, toggle };
}

function createQuickActionToggle() {
  const button = document.createElement("button");

  button.className = "quick-action-capture-toggle";
  button.type = "button";
  button.dataset.quickActionToggle = "";
  button.setAttribute("aria-controls", "quick-action-capture-drawer");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", "Quick actions");
  button.title = "Quick actions";
  decorateQuickActionButton(button, {
    icon: "bolt",
    label: "Quick actions",
    text: "Capture",
  });

  return button;
}

function renderQuickActions(shell, actions) {
  const actionButtons = actions.map((action) => createQuickActionItem(action, shell));
  shell.list.replaceChildren(...actionButtons);
}

function createQuickActionItem(action, shell) {
  const button = document.createElement("button");
  const body = document.createElement("span");
  const label = document.createElement("span");
  const description = document.createElement("span");

  button.className = "quick-action-capture-action";
  button.type = "button";
  button.dataset.quickActionId = action.id;
  button.dataset.quickActionType = action.actionType;
  button.title = action.temporaryFallback && action.temporaryLabel ? action.temporaryLabel : action.description || action.label;
  decorateQuickActionButton(button, {
    icon: action.icon || "add",
    label: action.label,
  });

  body.className = "quick-action-capture-action-body";
  label.className = "quick-action-capture-action-label";
  label.textContent = action.label;
  description.className = "quick-action-capture-action-description";
  description.textContent = action.temporaryFallback && action.temporaryLabel
    ? action.temporaryLabel
    : action.description || "";

  body.append(label);
  if (description.textContent) {
    body.append(description);
  }
  button.append(body);
  button.addEventListener("click", () => activateQuickAction(action, button, shell));
  return button;
}

async function activateQuickAction(action, button, shell) {
  if (action.actionType === "fallback-link" && action.href) {
    window.location.href = action.href;
    return;
  }

  if (action.actionType !== "module-action" || !action.moduleActionId) {
    setQuickActionStatus(shell.status, "This quick action is not available yet.", true);
    return;
  }

  button.disabled = true;
  setQuickActionStatus(shell.status, `Opening ${action.label}...`);

  try {
    await ensureQuickActionDependencies(action.moduleActionId);
    await window.LongtailForge.moduleActions.open(action.moduleActionId, {
      context: {
        currentPage: readQuickActionPageContext(),
        source: "quick-action-capture",
      },
    }, {
      setStatus: (message, options = {}) => setQuickActionStatus(shell.status, message, options.isError),
    });
    setQuickActionStatus(shell.status, "");
  } catch (error) {
    setQuickActionStatus(shell.status, error.message || `${action.label} could not be opened.`, true);
  } finally {
    button.disabled = false;
  }
}

async function ensureQuickActionDependencies(moduleActionId) {
  const dependencies = quickActionDependencySets[moduleActionId] || [];

  for (const dependency of dependencies) {
    await loadQuickActionScript(dependency);
  }

  if (!window.LongtailForge?.moduleActions?.open) {
    throw new Error("Quick action registry is unavailable.");
  }
}

function loadQuickActionScript(dependency) {
  if (dependency.test?.()) {
    return Promise.resolve();
  }

  const key = new window.URL(dependency.src, document.baseURI).href;
  if (quickActionScriptLoads.has(key)) {
    return quickActionScriptLoads.get(key);
  }

  const promise = dependency.module
    ? import(key)
    : new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = dependency.src;
        script.async = false;
        script.addEventListener("load", () => resolve());
        script.addEventListener("error", () => reject(new Error(`Could not load ${dependency.src}.`)));
        document.body.appendChild(script);
      });

  const checkedPromise = promise.then(() => {
    if (!dependency.test?.()) {
      throw new Error(`Loaded ${dependency.src}, but the expected helper is unavailable.`);
    }
  });

  quickActionScriptLoads.set(key, checkedPromise);
  return checkedPromise;
}

function readQuickActions() {
  const actions = window.LongtailForge?.workspaceContext?.quickActions || [];
  return Array.isArray(actions) ? actions : [];
}

function readQuickActionPageContext() {
  return {
    path: window.location.pathname,
    query: window.location.search,
    title: document.body.dataset.pageTitle || document.title || "",
  };
}

function setQuickActionDrawerOpen(shell, isOpen, options = {}) {
  shell.toggle.setAttribute("aria-expanded", String(isOpen));
  shell.drawer.hidden = !isOpen;
  shell.drawer.setAttribute("aria-hidden", String(!isOpen));

  if (isOpen) {
    window.setTimeout(() => shell.list?.querySelector("button:not(:disabled)")?.focus(), 0);
  } else if (options.returnFocus !== false && typeof shell.toggle.focus === "function") {
    shell.toggle.focus();
  }
}

function setQuickActionStatus(status, message, isError = false) {
  if (!status) {
    return;
  }

  status.textContent = message || "";
  status.classList.toggle("is-error", Boolean(isError));
}

function decorateQuickActionButton(button, options) {
  if (!window.LongtailForge?.icons?.decorateButton) {
    button.textContent = options.text || options.label || "";
    return button;
  }

  return window.LongtailForge.icons.decorateButton(button, {
    icon: options.icon,
    iconOnly: !options.text,
    label: options.label,
    text: options.text || "",
    title: options.label,
  });
}
