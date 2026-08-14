import { modulesService } from "../core/modules/modules.service.js";
import { config } from "../config.js";
import { settingsRepository } from "../repositories/settings.repo.js";

const DASHBOARD_REGIONS = [
  { id: "pulse", label: "Workspace Pulse" },
  { id: "attention", label: "Needs Attention" },
  { id: "calendar", label: "Calendar" },
  { id: "today", label: "Today / Upcoming" },
  { id: "main", label: "Module Overview" },
  { id: "activity", label: "Recent Activity" },
  { id: "secondary", label: "Secondary" },
];

/** @typedef {import("../types/http-contracts.js").WorkspaceRequestSession} WorkspaceRequestSession */

/** @param {WorkspaceRequestSession} session */
async function readDashboard(session) {
  const [settings, dashboardPanels, browserAssets] = await Promise.all([
    settingsRepository.readWorkspaceSettings(session.workspace_id, session),
    modulesService.listDashboardPanels(session.workspace_id, session),
    modulesService.listActiveModuleBrowserAssets(session.workspace_id, session, "dashboard"),
  ]);
  const warnings = readSetupWarnings();

  return {
    workspace: {
      id: session.workspace_id,
      name: settings.workspaceName || "Workspace",
      type: settings.workspaceType || "business",
    },
    layout: {
      regions: DASHBOARD_REGIONS,
      defaultRegion: "main",
    },
    pulse: {
      title: settings.workspaceName || "Workspace",
      summary: dashboardPulseSummary(dashboardPanels, warnings),
      primaryAction: {
        id: "open-workbench",
        label: "Open Workbench",
        href: "workbench.html",
      },
      signals: [
        {
          id: "available-panels",
          label: "Dashboard areas",
          value: dashboardPanels.length,
        },
        {
          id: "setup-warnings",
          label: "Setup warnings",
          value: warnings.length,
        },
      ],
    },
    moduleOverview: {
      emptyState: {
        title: "Module overview will appear here",
        message: "Enabled modules can add compact cards here when they have safe metrics or a useful next handoff.",
        actions: [
          {
            label: "Open Workbench",
            href: "workbench.html",
          },
          {
            label: "Manage Modules",
            href: "workspace-settings.html",
          },
        ],
      },
    },
    recentActivity: {
      status: "deferred",
      emptyState: {
        title: "Recent Activity is intentionally quiet",
        message: "A richer activity digest is deferred until Dashboard has permission-safe, body-free activity rows. For now, use Workbench and Notifications to resume active work.",
        actions: [
          {
            label: "Open Workbench",
            href: "workbench.html",
          },
          {
            label: "Open Notifications",
            href: "notifications.html",
          },
        ],
      },
    },
    setupWarnings: warnings,
    extensionPoints: {
      browserAssets,
      dashboardPanels,
    },
  };
}

/** @param {unknown[]} dashboardPanels @param {unknown[]} warnings */
function dashboardPulseSummary(dashboardPanels, warnings) {
  if (warnings.length > 0) {
    return `${warnings.length} setup item${warnings.length === 1 ? "" : "s"} may need review.`;
  }

  if (dashboardPanels.length === 0) {
    return "No overview panels are available yet.";
  }

  return `${dashboardPanels.length} overview area${dashboardPanels.length === 1 ? "" : "s"} available.`;
}

function readSetupWarnings() {
  return (Array.isArray(config.runtimeWarnings) ? config.runtimeWarnings : [])
    .map((warning, index) => ({
      id: `runtime-config-${index + 1}`,
      title: "Runtime configuration",
      message: String(warning || "").trim(),
      severity: "warning",
      action: {
        label: "Open Settings",
        href: "workspace-settings.html",
      },
    }))
    .filter((warning) => warning.message);
}

const dashboardServiceInternal = {
  readDashboard,
};

export const dashboardService = dashboardServiceInternal;
