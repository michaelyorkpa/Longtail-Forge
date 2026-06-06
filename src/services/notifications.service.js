import { summarizeNotificationEvent } from "../core/events/event-summaries.js";
import { modulesService } from "../core/modules/modules.service.js";
import { notificationsRepository } from "../repositories/notifications.repo.js";
import { usersRepository } from "../repositories/users.repo.js";
import { AppError } from "../utils/app-error.js";
import { permissionsService } from "./permissions.service.js";

const FRAMEWORK_NOTIFICATION_MODULE_ID = "framework";
let notificationEventUnsubscribers = [];
let notificationEventHandlersRegistered = false;

async function create(payload, session = null) {
  const normalized = await normalizeCreatePayload(payload, session);
  await assertNotificationCreateAllowed(normalized);

  const recipient = await usersRepository.readById(normalized.workspace_id, normalized.recipient_user_id);
  if (!recipient) {
    throw new AppError("Notification recipient not found.", 404);
  }

  return {
    notification: await decorateForSession(await notificationsRepository.create({
      ...normalized,
      metadata_json: JSON.stringify(normalized.metadata),
    }), {
      ...session,
      workspace_id: normalized.workspace_id,
      user_id: normalized.recipient_user_id,
    }),
  };
}

async function createMany(payloads, session = null) {
  const notifications = [];

  for (const payload of payloads || []) {
    const result = await create(payload, session);
    notifications.push(result.notification);
  }

  return { notifications };
}

async function list(session, query = {}) {
  await permissionsService.assertCanInAnyScope(session, "notifications.view_own");

  const notifications = await notificationsRepository.listForRecipient(session.workspace_id, session.user_id, query);
  return { notifications: await Promise.all(notifications.map((notification) => decorateForSession(notification, session))) };
}

async function unreadCount(session) {
  await permissionsService.assertCanInAnyScope(session, "notifications.view_own");

  return {
    count: await notificationsRepository.countUnreadForRecipient(session.workspace_id, session.user_id),
    unreadCount: await notificationsRepository.countUnreadForRecipient(session.workspace_id, session.user_id),
  };
}

async function preferences(session) {
  await permissionsService.assertCanInAnyScope(session, "notifications.manage_preferences");

  const [userRows, defaultRows, canManageWorkspaceDefaults] = await Promise.all([
    notificationsRepository.readUserPreferences(session.workspace_id, session.user_id),
    notificationsRepository.readWorkspaceDefaults(session.workspace_id),
    permissionsService.canInAnyScope(session, "notifications.manage_workspace_defaults"),
  ]);
  const userPreferenceByEvent = new Map(userRows.map((row) => [row.event_type, row]));
  const workspaceDefaultByEvent = new Map(defaultRows.map((row) => [row.event_type, row]));

  return {
    canManageWorkspaceDefaults,
    events: listConfigurableNotificationEvents().map((event) => {
      const userPreference = userPreferenceByEvent.get(event.id);
      const workspaceDefault = workspaceDefaultByEvent.get(event.id);
      const workspaceEnabled = workspaceDefault ? Number(workspaceDefault.enabled) === 1 : event.defaultEnabled !== false;

      return {
        id: event.id,
        moduleId: event.moduleId,
        label: event.label,
        description: event.description,
        defaultEnabled: event.defaultEnabled !== false,
        defaultPriority: event.defaultPriority || "normal",
        userEnabled: userPreference ? Number(userPreference.enabled) === 1 : workspaceEnabled,
        workspaceEnabled,
        workspacePriority: workspaceDefault?.priority || event.defaultPriority || "normal",
      };
    }),
  };
}

async function savePreferences(session, payload = {}) {
  await permissionsService.assertCanInAnyScope(session, "notifications.manage_preferences");

  const allowedEventIds = new Set(listConfigurableNotificationEvents().map((event) => event.id));
  const preferenceRows = normalizePreferenceList(payload.preferences || payload.events, allowedEventIds);
  await notificationsRepository.saveUserPreferences(session.workspace_id, session.user_id, preferenceRows);
  return preferences(session);
}

async function saveWorkspaceDefaults(session, payload = {}) {
  await permissionsService.assertCanInAnyScope(session, "notifications.manage_workspace_defaults");

  const allowedEventIds = new Set(listConfigurableNotificationEvents().map((event) => event.id));
  const defaults = normalizeWorkspaceDefaultList(payload.defaults || payload.events, allowedEventIds);
  await notificationsRepository.saveWorkspaceDefaults(session.workspace_id, defaults);
  return preferences(session);
}

async function markRead(notificationId, session) {
  await assertCanMutateOwnNotification(notificationId, session);
  const notification = await notificationsRepository.markRead(session.workspace_id, session.user_id, notificationId);

  return { notification: await decorateForSession(notification, session) };
}

async function markAllRead(session) {
  await permissionsService.assertCanInAnyScope(session, "notifications.view_own");

  await notificationsRepository.markAllRead(session.workspace_id, session.user_id);
  return unreadCount(session);
}

async function dismiss(notificationId, session) {
  await assertCanMutateOwnNotification(notificationId, session);
  const notification = await notificationsRepository.dismiss(session.workspace_id, session.user_id, notificationId);

  return { notification: await decorateForSession(notification, session) };
}

async function archiveOldNotifications(cutoffIso) {
  await notificationsRepository.archiveOlderThan(cutoffIso);
}

async function readTargetMetadata(notification, session) {
  const moduleId = notification.module_id || "";
  const recordType = notification.record_type || "";
  const recordId = notification.record_id || "";
  const moduleDefinition = moduleId && moduleId !== FRAMEWORK_NOTIFICATION_MODULE_ID ? modulesService.getModule(moduleId) : null;
  const metadata = {
    canOpen: false,
    moduleId,
    recordId,
    recordType,
    targetExists: false,
    url: "",
  };

  if (moduleId && moduleId !== FRAMEWORK_NOTIFICATION_MODULE_ID && !moduleDefinition) {
    return metadata;
  }

  if (!recordType || !recordId) {
    return {
      ...metadata,
      canOpen: Boolean(notification.url),
      targetExists: true,
      url: notification.url || "",
    };
  }

  if (!moduleDeclaresRecordType(moduleId, recordType)) {
    return metadata;
  }

  if (recordType === "task") {
    return readTaskTargetMetadata(notification, session, metadata);
  }

  return {
    ...metadata,
    canOpen: Boolean(notification.url),
    targetExists: true,
    url: notification.url || "",
  };
}

function registerEventHandlers() {
  if (notificationEventHandlersRegistered) {
    return;
  }

  notificationEventHandlersRegistered = true;
  notificationEventUnsubscribers = modulesService.listNotificationEvents().map((declaration) => (
    modulesService.onInternalEvent(declaration.id, async (event) => {
      await createFromEvent(event, declaration);
    }, {
      id: `notifications:${declaration.id}`,
      moduleId: FRAMEWORK_NOTIFICATION_MODULE_ID,
    })
  ));
}

function resetEventHandlersForTests() {
  for (const unsubscribe of notificationEventUnsubscribers) {
    unsubscribe();
  }

  notificationEventUnsubscribers = [];
  notificationEventHandlersRegistered = false;
}

async function createFromEvent(event, declaration = null) {
  const notificationDeclaration = declaration || modulesService.listNotificationEvents()
    .find((candidate) => candidate.id === event.name);

  if (!notificationDeclaration?.defaultEnabled) {
    return { notifications: [] };
  }

  const workspaceId = event.workspace_id || "";
  const moduleId = notificationDeclaration.moduleId || event.module_id || "";

  if (!workspaceId || !moduleId || !(await modulesService.canWriteModule(workspaceId, moduleId))) {
    return { notifications: [] };
  }

  const recipients = await resolveRecipients(event, notificationDeclaration);
  const enabledRecipients = await filterEnabledRecipients(workspaceId, recipients, notificationDeclaration.id);
  const summary = summarizeNotificationEvent(event);
  const template = modulesService.listNotificationTemplates().find((candidate) => candidate.event === event.name);
  const workspaceDefault = await readWorkspaceDefault(workspaceId, notificationDeclaration.id);
  if (!workspaceDefault.enabled) {
    return { notifications: [] };
  }

  const payloads = enabledRecipients.map((recipientUserId) => ({
    workspace_id: workspaceId,
    module_id: moduleId,
    event_type: event.name,
    recipient_user_id: recipientUserId,
    actor_user_id: event.actor_user_id || "",
    record_type: event.record_type || "",
    record_id: event.record_id || "",
    title: template?.title || summary.title,
    body: template?.body || summary.body,
    url: template?.url || summary.url,
    priority: workspaceDefault.priority || notificationDeclaration.defaultPriority || "normal",
    metadata: {
      emitted_at: event.emitted_at,
      source: event.source || "",
    },
  }));

  return createMany(payloads, event.session || null);
}

async function filterEnabledRecipients(workspaceId, recipientIds, eventType) {
  const userPreferences = await Promise.all(recipientIds.map(async (userId) => {
    const rows = await notificationsRepository.readUserPreferences(workspaceId, userId);
    const preference = rows.find((row) => row.event_type === eventType);
    return {
      enabled: !preference || Number(preference.enabled) === 1,
      userId,
    };
  }));

  return userPreferences.filter((preference) => preference.enabled).map((preference) => preference.userId);
}

async function readWorkspaceDefault(workspaceId, eventType) {
  const event = modulesService.listNotificationEvents().find((candidate) => candidate.id === eventType);
  const rows = await notificationsRepository.readWorkspaceDefaults(workspaceId);
  const defaultRow = rows.find((row) => row.event_type === eventType);

  return {
    enabled: defaultRow ? Number(defaultRow.enabled) === 1 : event?.defaultEnabled !== false,
    priority: defaultRow?.priority || event?.defaultPriority || "normal",
  };
}

async function resolveRecipients(event, declaration) {
  const recipientIds = new Set();
  const hints = new Set([
    declaration.recipientMode || "",
    ...summarizeNotificationEvent(event).recipientHints,
  ].filter(Boolean));

  for (const userId of readExplicitRecipientIds(event)) {
    recipientIds.add(userId);
  }

  if (hints.has("actor") && event.actor_user_id) {
    recipientIds.add(event.actor_user_id);
  }

  if (hints.has("assignees")) {
    for (const userId of readAssigneeIds(event)) {
      recipientIds.add(userId);
    }
  }

  if (hints.has("workspace_admins")) {
    for (const userId of await notificationsRepository.readWorkspaceAdminUserIds(event.workspace_id)) {
      recipientIds.add(userId);
    }
  }

  return [...recipientIds].filter(Boolean);
}

async function normalizeCreatePayload(payload = {}, session = null) {
  const workspaceId = payload.workspace_id || payload.workspaceId || session?.workspace_id || "";
  const moduleId = payload.module_id || payload.moduleId || "";
  const eventType = payload.event_type || payload.eventType || "";
  const recipientUserId = payload.recipient_user_id || payload.recipientUserId || "";
  const recordType = payload.record_type || payload.recordType || "";
  const recordId = payload.record_id || payload.recordId || "";

  if (!workspaceId || !eventType || !recipientUserId || !payload.title) {
    throw new AppError("Notification workspace, event type, recipient, and title are required.", 400);
  }

  return {
    workspace_id: workspaceId,
    module_id: moduleId,
    event_type: eventType,
    recipient_user_id: recipientUserId,
    actor_user_id: payload.actor_user_id || payload.actorUserId || session?.user_id || "",
    record_type: recordType,
    record_id: recordId,
    title: String(payload.title || "").trim(),
    body: String(payload.body || "").trim(),
    url: safeRelativeUrl(payload.url),
    status: normalizeStatus(payload.status),
    priority: normalizePriority(payload.priority),
    metadata: normalizeMetadata(payload.metadata || payload.metadata_json),
  };
}

async function assertNotificationCreateAllowed(notification) {
  if (notification.module_id) {
    const moduleDefinition = modulesService.getModule(notification.module_id);
    if (!moduleDefinition) {
      throw new AppError("Notification module is not registered.", 400);
    }

    if (!(await modulesService.canWriteModule(notification.workspace_id, notification.module_id))) {
      throw new AppError("Disabled modules cannot create new notifications.", 403);
    }
  }

  if (notification.record_type && !moduleDeclaresRecordType(notification.module_id, notification.record_type)) {
    throw new AppError("Notification target record type is not registered.", 400);
  }
}

async function assertCanMutateOwnNotification(notificationId, session) {
  await permissionsService.assertCanInAnyScope(session, "notifications.view_own");

  const notification = await notificationsRepository.readByIdForRecipient(session.workspace_id, session.user_id, notificationId);
  if (!notification) {
    throw new AppError("Notification not found.", 404);
  }
}

async function decorateForSession(notification, session) {
  if (!notification) {
    throw new AppError("Notification not found.", 404);
  }

  const target = await readTargetMetadata(notification, session);
  const displayTitle = target.label || notification.title;

  return {
    ...notification,
    displayTitle,
    url: target.canOpen ? target.url : "",
    target,
  };
}

async function readTaskTargetMetadata(notification, session, baseMetadata) {
  const { tasksService } = await import("../modules/tasks/tasks.service.js");

  try {
    const result = await tasksService.read(notification.record_id, session);
    const task = result.task || {};
    return {
      ...baseMetadata,
      canOpen: Boolean(notification.url),
      context: {
        clientName: task.client_name || "",
        projectName: task.project_name || "",
      },
      label: task.title || "",
      targetExists: true,
      url: notification.url || "",
    };
  } catch {
    return baseMetadata;
  }
}

function moduleDeclaresRecordType(moduleId, recordType) {
  if (!recordType) {
    return true;
  }

  return modulesService.listModuleEventTypes().some((eventType) => (
    eventType.recordType === recordType && (!moduleId || eventType.moduleId === moduleId)
  ));
}

function readExplicitRecipientIds(event) {
  const ids = event.metadata?.recipient_user_ids || event.metadata?.recipientUserIds || [];
  return Array.isArray(ids) ? ids.map((id) => String(id || "").trim()).filter(Boolean) : [];
}

function readAssigneeIds(event) {
  const ids = event.new_value?.assignee_ids || event.previous_value?.assignee_ids || [];
  return Array.isArray(ids) ? ids.map((id) => String(id || "").trim()).filter(Boolean) : [];
}

function safeRelativeUrl(value) {
  const url = String(value || "").trim();
  return url && !/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : "";
}

function normalizeStatus(status) {
  return ["unread", "read", "dismissed", "archived"].includes(status) ? status : "unread";
}

function normalizePriority(priority) {
  return ["low", "normal", "high", "urgent"].includes(priority) ? priority : "normal";
}

function normalizeMetadata(metadata) {
  if (!metadata) {
    return {};
  }

  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
}

function listConfigurableNotificationEvents() {
  return modulesService.listNotificationEvents()
    .filter((event) => modulesService.getModule(event.moduleId))
    .sort((left, right) => left.moduleId.localeCompare(right.moduleId) || left.label.localeCompare(right.label));
}

function normalizePreferenceList(items, allowedEventIds) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      enabled: item.enabled !== false && item.userEnabled !== false,
      event_type: item.event_type || item.eventType || item.id,
    }))
    .filter((item) => allowedEventIds.has(item.event_type));
}

function normalizeWorkspaceDefaultList(items, allowedEventIds) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      enabled: item.enabled !== false && item.workspaceEnabled !== false,
      event_type: item.event_type || item.eventType || item.id,
      priority: normalizePriority(item.priority || item.workspacePriority),
    }))
    .filter((item) => allowedEventIds.has(item.event_type));
}

export const notificationsService = {
  archiveOldNotifications,
  create,
  createFromEvent,
  createMany,
  dismiss,
  list,
  markAllRead,
  markRead,
  preferences,
  readTargetMetadata,
  registerEventHandlers,
  resetEventHandlersForTests,
  savePreferences,
  saveWorkspaceDefaults,
  unreadCount,
};
