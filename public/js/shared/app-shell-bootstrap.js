// @ts-check

/** @typedef {import("../../../src/types/framework-contracts.js").AppShellBootstrap} NormalizedAppShellBootstrap */

/** @param {Window} global */
(function attachAppShellBootstrap(global) {
  const namespace = global.LongtailForge || {};

  /**
   * @param {unknown} value
   * @returns {NormalizedAppShellBootstrap}
   */
  function normalize(value) {
    const source = asRecord(value) || {};
    const sourceWorkspaceContext = asRecord(source.workspaceContext) || {};
    const sourceUser = asRecord(source.user) || {};
    const enabledModules = stringArray(source.enabledModules).length > 0
      ? stringArray(source.enabledModules)
      : stringArray(sourceWorkspaceContext.enabledModules);
    const quickActions = objectArray(source.quickActions).length > 0
      ? objectArray(source.quickActions)
      : objectArray(sourceWorkspaceContext.quickActions);
    const viewSurfaces = objectArray(source.viewSurfaces).length > 0
      ? objectArray(source.viewSurfaces)
      : objectArray(sourceWorkspaceContext.viewSurfaces);

    return {
      activeWorkspaceId: stringValue(source.activeWorkspaceId),
      app: asRecord(source.app) || {},
      enabledModules,
      moduleNavigation: objectArray(source.moduleNavigation),
      moduleSettingsNavigation: objectArray(source.moduleSettingsNavigation),
      navigation: objectArray(source.navigation),
      notificationSummary: asRecord(source.notificationSummary) || {},
      permissionHints: asRecord(source.permissionHints) || {},
      quickActions,
      searchTargets: objectArray(source.searchTargets),
      supportView: asRecord(source.supportView),
      themeAutoSource: stringValue(source.themeAutoSource),
      themeMode: stringValue(source.themeMode),
      timezone: stringValue(source.timezone),
      user: {
        preferredCalendarView: stringValue(sourceUser.preferredCalendarView),
        themeAutoSource: stringValue(sourceUser.themeAutoSource),
        themeMode: stringValue(sourceUser.themeMode),
        timezone: stringValue(sourceUser.timezone),
        user_id: stringValue(sourceUser.user_id),
        username: stringValue(sourceUser.username),
      },
      viewSurfaces,
      workspaceContext: {
        ...sourceWorkspaceContext,
        enabledModules,
        quickActions,
        viewSurfaces,
      },
      workspaces: objectArray(source.workspaces),
    };
  }

  /** @param {unknown} value */
  function stringValue(value) {
    return typeof value === "string" ? value : "";
  }

  /** @param {unknown} value */
  function stringArray(value) {
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  }

  /** @param {unknown} value */
  function objectArray(value) {
    return Array.isArray(value)
      ? value.map(asRecord).filter((item) => item !== null)
      : [];
  }

  /**
   * @param {unknown} value
   * @returns {Record<string, unknown> | null}
   */
  function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? /** @type {Record<string, unknown>} */ (value)
      : null;
  }

  namespace.appShellBootstrap = Object.freeze({ normalize });
  global.LongtailForge = namespace;
})(window);
