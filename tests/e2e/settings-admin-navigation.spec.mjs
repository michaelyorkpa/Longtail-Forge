import { expect, test } from "@playwright/test";

test("Workspace groups optional modules and repaired module Settings hosts load", async ({ page }) => {
  const workspaceResponse = await page.goto("/workspace-settings.html");
  expect(workspaceResponse.status()).toBe(200);

  const workspaceHeader = page.locator(".view-page-header");
  const usersButton = workspaceHeader.getByRole("button", { name: "Users", exact: true });
  await expect(usersButton).toBeVisible();
  await expect(usersButton.locator("svg.icon")).toHaveCount(1);
  await expect(page.locator("[data-workspace-type-input]")).toBeDisabled();
  await expect(page.locator(".settings-secondary-actions [data-open-workspace-users]")).toHaveCount(0);
  await usersButton.click();
  await expect(page.locator("[data-workspace-users-dialog]")).toBeVisible();
  await page.locator("[data-close-workspace-users]").click();

  const primaryLegends = page.locator(".workspace-settings-column").first().locator(".view-settings-section-legend");
  await expect(primaryLegends.nth(0)).toHaveText("Workspace");
  await expect(primaryLegends.nth(1)).toHaveText(/Clients & Projects|Projects/);
  await expect(primaryLegends.nth(2)).toHaveText("Modules");

  const groupedModuleLegends = page.locator(".settings-grouped-module > .view-settings-section-legend");
  await expect(groupedModuleLegends).toHaveText([
    "Notes",
    "Procurement Lists",
    "Tasks",
    "Time Tracking",
    "Developer Example",
  ]);

  const developerToggle = page.locator('[data-module-id="developer-example"][data-module-setting="developerExampleEnabled"]');
  await developerToggle.check();
  await page.locator('[data-settings-page-save][data-settings-action-position="top"]').click();
  await expect(page.locator('[data-settings-page-save][data-settings-action-position="top"]')).toBeDisabled();

  const filesResponse = await page.goto("/files-settings.html");
  expect(filesResponse.status()).toBe(200);
  await expect(page.locator(".view-settings-section-legend", { hasText: "Storage Accounting" })).toBeVisible();
  await expect(page.locator("[data-module-settings-status]")).not.toContainText("undefined");

  const developerResponse = await page.goto("/developer-example.html");
  expect(developerResponse.status()).toBe(200);
  await expect(page.locator("h1")).toHaveText("Developer Example Settings");
  await expect(page.locator('[data-setting-field="developerExampleHintsEnabled"]')).toBeVisible();
  await expect(page.locator('[data-setting-field="developerExampleMode"]')).toBeHidden();
  await page.locator('[data-module-setting="developerExampleHintsEnabled"]').check();
  await expect(page.locator('[data-setting-field="developerExampleMode"]')).toBeVisible();
  await expect(page.locator("[data-settings-page-save]")).toHaveCount(2);
});

test("module lifecycle saves refresh recovery and timer surfaces immediately", async ({ page }) => {
  const settingsFixture = await readJson(page, "/api/settings");
  const catalogFixture = await readJson(page, "/api/settings/catalog");
  const shellFixture = await readJson(page, "/api/app-shell/bootstrap");
  let timeTrackingDisabled = false;
  let taskTimersDisabled = false;

  await page.route("**/api/settings", async (route) => {
    if (route.request().method() === "PUT") {
      const payload = route.request().postDataJSON() || {};
      timeTrackingDisabled = payload.moduleSettings?.["time-tracking"]?.timeTrackingEnabled === false;
      taskTimersDisabled = payload.moduleSettings?.tasks?.taskTimersEnabled === false;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: settingsResponse() }) });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(settingsResponse()) });
  });
  await page.route("**/api/settings/catalog", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(catalogResponse()) });
  });
  await page.route("**/api/app-shell/bootstrap", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(shellResponse()) });
  });
  await page.route(/\/api\/tasks(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    if (taskTimersDisabled) {
      result.tasks = [{
        task_id: "timer-suppression-fixture",
        title: "Timer suppression fixture",
        status: "open",
        priority: "normal",
        project_id: "fixture-project",
        project_name: "Fixture Project",
        assignee_ids: [result.currentUserId].filter(Boolean),
        tags: [],
      }];
      result.options = {
        ...(result.options || {}),
        projects: [{ project_id: "fixture-project", project_name: "Fixture Project" }],
        taskTimersEnabled: false,
        timeTrackingEnabled: true,
      };
    }
    await route.fulfill({ response, json: result });
  });
  await page.route("**/api/tasks/workbench-items", async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    if (taskTimersDisabled) {
      result.options = {
        ...(result.options || {}),
        taskTimersEnabled: false,
        timeTrackingEnabled: true,
      };
    }
    await route.fulfill({ response, json: result });
  });
  await page.route("**/api/active-timers/all", async (route) => {
    if (!taskTimersDisabled) {
      await route.continue();
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        timers: [
          timerFixture({ id: "manual-visible", label: "Manual timer remains", sourceType: "manual" }),
          timerFixture({ id: "task-hidden", label: "Task timer is hidden", sourceType: "task" }),
        ],
      }),
    });
  });

  await page.goto("/workspace-settings.html");
  await expect(page.locator('[data-quick-action-id="timer"]')).toHaveCount(1);
  const timeTrackingToggle = page.locator('[data-module-id="time-tracking"][data-module-setting="timeTrackingEnabled"]');
  await timeTrackingToggle.uncheck();
  await page.locator('[data-settings-page-save][data-settings-action-position="top"]').click();
  await expect(page.locator('[data-settings-page-save][data-settings-action-position="top"]')).toBeDisabled();

  await expect(page.locator('a[href="time-tracker.html"]')).toHaveCount(0);
  await expect(page.locator('a[href="time-tracking-settings.html"]')).toHaveCount(0);
  await expect(page.locator('a[href="workspace-settings.html"]')).not.toHaveCount(0);
  await expect(page.locator('[data-quick-action-id="timer"]')).toHaveCount(0);

  const recoveryResponse = await page.goto("/time-tracking-settings.html");
  expect(recoveryResponse.status()).toBe(200);
  await expect(page.locator("h1")).toHaveText("Time Tracking Settings");
  await expect(page.locator('[data-disabled-module-recovery="time-tracking"]')).toContainText("Time Tracking is disabled");
  await expect(page.locator('[data-module-recovery-link="time-tracking"]')).toHaveAttribute("href", "workspace-settings.html");

  await page.locator('[data-module-recovery-link="time-tracking"]').click();
  await page.locator('[data-module-id="time-tracking"][data-module-setting="timeTrackingEnabled"]').check();
  await page.locator('[data-settings-page-save][data-settings-action-position="top"]').click();
  await expect(page.locator('a[href="time-tracker.html"]')).not.toHaveCount(0);
  await expect(page.locator('[data-quick-action-id="timer"]')).toHaveCount(1);

  await page.goto("/tasks-settings.html");
  await page.locator('[data-module-id="tasks"][data-module-setting="taskTimersEnabled"]').uncheck();
  await page.locator('[data-settings-page-save][data-settings-action-position="top"]').click();
  await expect(page.locator('a[href="time-tracker.html"]')).not.toHaveCount(0);

  await page.goto("/tasks.html");
  await expect(page.getByRole("button", { name: "Timer suppression fixture" })).toBeVisible();
  await expect(page.locator('[data-task-workflow-action^="start-task-timer"]')).toHaveCount(0);
  await expect(page.locator('[data-task-workflow-action^="pause-task-timer"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Timer suppression fixture" }).click();
  await expect(page.locator("[data-task-timer-field]")).toBeHidden();

  await page.goto("/workbench.html");
  await expect(page.locator('[data-workbench-timer-key="manual-slot:1"]')).toContainText("Manual timer remains");
  await expect(page.locator('[data-workbench-timer-key="task:timer-suppression-fixture"]')).toHaveCount(0);

  function settingsResponse() {
    const settings = cloneJson(settingsFixture);
    settings.enabledModules = (settings.enabledModules || []).filter((moduleId) => (
      !timeTrackingDisabled || moduleId !== "time-tracking"
    ));
    for (const module of settings.modules || []) {
      if (module.id === "time-tracking") module.status = timeTrackingDisabled ? "disabled" : "enabled";
    }
    for (const module of settings.moduleSettings || []) {
      if (module.moduleId === "time-tracking") module.status = timeTrackingDisabled ? "disabled" : "enabled";
      for (const setting of module.settings || []) {
        if (setting.id === "timeTrackingEnabled") setting.value = !timeTrackingDisabled;
        if (setting.id === "taskTimersEnabled") setting.value = !taskTimersDisabled;
      }
    }
    return settings;
  }

  function catalogResponse() {
    const catalog = cloneJson(catalogFixture);
    if (timeTrackingDisabled) delete catalog.attachments?.module?.["time-tracking"];
    for (const sections of Object.values(catalog.attachments || {})) {
      const list = Array.isArray(sections) ? sections : Object.values(sections || {}).flat();
      for (const section of list) {
        for (const setting of section.settings || []) {
          if (setting.id === "timeTrackingEnabled") setting.value = !timeTrackingDisabled;
          if (setting.id === "taskTimersEnabled") setting.value = !taskTimersDisabled;
        }
      }
    }
    return catalog;
  }

  function shellResponse() {
    const shell = cloneJson(shellFixture);
    if (!timeTrackingDisabled) return shell;
    shell.enabledModules = (shell.enabledModules || []).filter((moduleId) => moduleId !== "time-tracking");
    shell.workspaceContext.enabledModules = (shell.workspaceContext?.enabledModules || [])
      .filter((moduleId) => moduleId !== "time-tracking");
    shell.quickActions = (shell.quickActions || []).filter((action) => action.moduleId !== "time-tracking");
    shell.navigation = removeModuleNavigation(shell.navigation || [], "time-tracking");
    return shell;
  }
});

async function readJson(page, url) {
  const response = await page.request.get(url);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function removeModuleNavigation(items, moduleId) {
  return items.flatMap((item) => {
    if (item.moduleId === moduleId || [
      "time-tracker.html",
      "time-entries.html",
      "time-tracking-settings.html",
    ].includes(item.href)) return [];
    if (!Array.isArray(item.items)) return [item];
    const children = removeModuleNavigation(item.items, moduleId);
    return children.length > 0 ? [{ ...item, items: children }] : [];
  });
}

function timerFixture({ id, label, sourceType }) {
  return {
    accumulated_elapsed_seconds: 60,
    active_timer_id: id,
    description: label,
    source_enabled: true,
    source_id: sourceType === "task" ? "timer-suppression-fixture" : "",
    source_label: label,
    source_module_id: sourceType === "task" ? "tasks" : "time-tracking",
    source_type: sourceType,
    task_id: sourceType === "task" ? "timer-suppression-fixture" : "",
    timer_slot: sourceType === "task" ? "2" : "1",
    timer_status: "paused",
  };
}
