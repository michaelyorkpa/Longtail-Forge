import {
  buildEventChangedContext,
  readChangedFields,
  summarizeNotificationEvent,
  taskUpdatedLabel,
} from "../core/events/event-summaries.js";
import { enqueueJob } from "../core/jobs/job-queue.js";
import { getJobHandler, registerJobHandler } from "../core/jobs/index.js";
import { modulesService } from "../core/modules/modules.service.js";
import { boundedPaginationEnvelope, normalizeBoundedPagination } from "../core/bounded-pagination.js";
import { notificationsRepository } from "../repositories/notifications.repo.js";
import { usersRepository } from "../repositories/users.repo.js";
import { AppError } from "../utils/app-error.js";
import { auditService } from "./audit.service.js";
import { permissionsService } from "./permissions.service.js";

const FRAMEWORK_NOTIFICATION_MODULE_ID = "framework";
const NOTIFICATION_DEFAULT_PAGE_SIZE = 25;
const NOTIFICATION_MAX_PAGE_SIZE = 100;
const NOTIFICATION_EVENT_JOB_TYPE = "notification.event";
const NOTIFICATION_EVENT_JOB_PRIORITY = 20;
const NOTIFICATION_EVENT_JOB_OPERATION = "process_event";
let notificationEventUnsubscribers = [];
let notificationEventHandlersRegistered = false;
let notificationJobHandlersRegistered = false;

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

  const pagination = normalizeBoundedPagination(query, {
    defaultLimit: NOTIFICATION_DEFAULT_PAGE_SIZE,
    maxLimit: NOTIFICATION_MAX_PAGE_SIZE,
  });
  const filters = normalizeNotificationListFilters(query);
  const repositoryQuery = {
    ...filters,
    limit: pagination.limit,
    offset: pagination.offset,
  };
  const [notifications, total, filterOptions] = await Promise.all([
    notificationsRepository.listForRecipient(session.workspace_id, session.user_id, repositoryQuery),
    notificationsRepository.countForRecipient(session.workspace_id, session.user_id, repositoryQuery),
    notificationsRepository.readFilterOptionsForRecipient(session.workspace_id, session.user_id, filters),
  ]);

  return {
    filterOptions,
    notifications: await Promise.all(notifications.map((notification) => decorateForSession(notification, session))),
    pagination: boundedPaginationEnvelope({
      ...pagination,
      hasMore: pagination.offset + notifications.length < total,
      returned: notifications.length,
      total,
    }),
  };
}

async function unreadCount(session) {
  await permissionsService.assertCanInAnyScope(session, "notifications.view_own");

  return notificationsRepository.readBellSummaryForRecipient(session.workspace_id, session.user_id);
}

async function preferences(session) {
  await permissionsService.assertCanInAnyScope(session, "notifications.manage_preferences");

  const [userRows, displayPreferences, defaultRows, canManageWorkspaceDefaults, configurableEvents] = await Promise.all([
    notificationsRepository.readUserPreferences(session.workspace_id, session.user_id),
    notificationsRepository.readUserDisplayPreferences(session.workspace_id, session.user_id),
    notificationsRepository.readWorkspaceDefaults(session.workspace_id),
    permissionsService.canInAnyScope(session, "notifications.manage_workspace_defaults"),
    listConfigurableNotificationEvents(session.workspace_id),
  ]);
  const userPreferenceByEvent = new Map(userRows.map((row) => [row.event_type, row]));
  const workspaceDefaultByEvent = new Map(defaultRows.map((row) => [row.event_type, row]));

  return {
    canManageWorkspaceDefaults,
    groupingPreferences: shapeUserDisplayPreferences(displayPreferences),
    events: configurableEvents.map((event) => {
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
        moduleEnabled: event.moduleEnabled !== false,
        userEnabled: userPreference ? Number(userPreference.enabled) === 1 : workspaceEnabled,
        workspaceEnabled,
        workspacePriority: workspaceDefault?.priority || event.defaultPriority || "normal",
      };
    }),
  };
}

async function savePreferences(session, payload = {}) {
  await permissionsService.assertCanInAnyScope(session, "notifications.manage_preferences");

  const allowedEventIds = new Set((await listConfigurableNotificationEvents(session.workspace_id)).map((event) => event.id));
  const preferenceRows = normalizePreferenceList(payload.preferences || payload.events, allowedEventIds);
  const previousRows = await notificationsRepository.readUserPreferences(session.workspace_id, session.user_id);
  const displayPreferences = normalizeDisplayPreferences(payload.groupingPreferences || payload.displayPreferences);
  await notificationsRepository.saveUserPreferences(session.workspace_id, session.user_id, preferenceRows);
  if (displayPreferences) {
    await notificationsRepository.saveUserDisplayPreferences(session.workspace_id, session.user_id, displayPreferences);
  }
  await auditService.record({
    action: "notification_preferences_updated",
    changeType: "settings_change",
    metadata: {
      eventTypes: preferenceRows.map((preference) => preference.event_type),
      ...(displayPreferences ? { groupingMode: displayPreferences.grouping_mode } : {}),
    },
    newValue: preferenceRows,
    previousValue: previousRows.map(notificationPreferenceAuditValue),
    recordId: session.user_id,
    recordLabel: "Notification preferences",
    recordType: "user",
    session,
  });
  return preferences(session);
}

async function saveWorkspaceDefaults(session, payload = {}) {
  await permissionsService.assertCanInAnyScope(session, "notifications.manage_workspace_defaults");

  const allowedEventIds = new Set((await listConfigurableNotificationEvents(session.workspace_id)).map((event) => event.id));
  const defaults = normalizeWorkspaceDefaultList(payload.defaults || payload.events, allowedEventIds);
  const previousRows = await notificationsRepository.readWorkspaceDefaults(session.workspace_id);
  await notificationsRepository.saveWorkspaceDefaults(session.workspace_id, defaults);
  await auditService.record({
    action: "notification_workspace_defaults_updated",
    changeType: "settings_change",
    metadata: {
      eventTypes: defaults.map((preference) => preference.event_type),
    },
    newValue: defaults,
    previousValue: previousRows.map(notificationWorkspaceDefaultAuditValue),
    recordId: "notification_workspace_defaults",
    recordLabel: "Notification workspace defaults",
    recordType: "workspace_setting",
    session,
  });
  return preferences(session);
}

async function subscriptionStatus(session, query = {}) {
  const target = normalizeSubscriptionTarget(query);
  await assertCanFollowTarget(session, target);

  const subscription = await notificationsRepository.readSubscription(session.workspace_id, session.user_id, target);
  return {
    isFollowing: subscription?.status === "active",
    subscription,
    target,
  };
}

async function followTarget(session, payload = {}) {
  const target = normalizeSubscriptionTarget(payload);
  await assertCanFollowTarget(session, target);

  const previous = await notificationsRepository.readSubscription(session.workspace_id, session.user_id, target);
  const subscription = await notificationsRepository.saveSubscription(session.workspace_id, session.user_id, target);
  await auditService.record({
    action: "notification_subscription_followed",
    changeType: "settings_change",
    metadata: target,
    newValue: subscription,
    previousValue: previous,
    recordId: session.user_id,
    recordLabel: "Notification subscription",
    recordType: "user",
    session,
  });

  return {
    isFollowing: true,
    subscription,
    target,
  };
}

async function unfollowTarget(session, payload = {}) {
  const target = normalizeSubscriptionTarget(payload);
  await assertCanFollowTarget(session, target);

  const previous = await notificationsRepository.readSubscription(session.workspace_id, session.user_id, target);
  const subscription = await notificationsRepository.removeSubscription(session.workspace_id, session.user_id, target);
  await auditService.record({
    action: "notification_subscription_unfollowed",
    changeType: "settings_change",
    metadata: target,
    newValue: subscription,
    previousValue: previous,
    recordId: session.user_id,
    recordLabel: "Notification subscription",
    recordType: "user",
    session,
  });

  return {
    isFollowing: false,
    subscription,
    target,
  };
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

async function dismissAll(session) {
  await permissionsService.assertCanInAnyScope(session, "notifications.view_own");

  await notificationsRepository.dismissAll(session.workspace_id, session.user_id);
  return unreadCount(session);
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

  if (recordType === "note") {
    return readNoteTargetMetadata(notification, session, metadata);
  }

  return {
    ...metadata,
    canOpen: Boolean(notification.url),
    targetExists: true,
    url: notification.url || "",
  };
}

function registerEventHandlers() {
  registerNotificationJobHandlers();

  if (notificationEventHandlersRegistered) {
    return;
  }

  notificationEventHandlersRegistered = true;
  notificationEventUnsubscribers = modulesService.listNotificationEvents().map((declaration) => (
    modulesService.onInternalEvent(declaration.id, async (event) => {
      await queueNotificationEvent(event, declaration);
    }, {
      id: `notifications:${declaration.id}`,
      moduleId: FRAMEWORK_NOTIFICATION_MODULE_ID,
    })
  ));
}

function registerNotificationJobHandlers(options = {}) {
  if (notificationJobHandlersRegistered && !options.replace && getJobHandler(NOTIFICATION_EVENT_JOB_TYPE)) {
    return;
  }

  registerJobHandler(NOTIFICATION_EVENT_JOB_TYPE, handleNotificationEventJob, {
    replace: true,
  });
  notificationJobHandlersRegistered = true;
}

async function queueNotificationEvent(event, declaration = null, options = {}) {
  const normalizedEvent = normalizeNotificationEventForJob(event);
  const notificationDeclaration = declaration || modulesService.listNotificationEvents()
    .find((candidate) => candidate.id === normalizedEvent.name);

  if (!notificationDeclaration?.defaultEnabled) {
    return shapeNotificationQueueSkip(normalizedEvent, "event_not_enabled_by_default");
  }

  if (!normalizedEvent.workspace_id) {
    return shapeNotificationQueueSkip(normalizedEvent, "missing_workspace");
  }

  if (isNotificationSuppressed(normalizedEvent)) {
    return shapeNotificationQueueSkip(normalizedEvent, "suppressed");
  }

  const enqueued = await enqueueJob({
    workspaceId: normalizedEvent.workspace_id,
    jobType: NOTIFICATION_EVENT_JOB_TYPE,
    priority: options.priority ?? NOTIFICATION_EVENT_JOB_PRIORITY,
    maxAttempts: options.maxAttempts || options.max_attempts || 3,
    payload: {
      declarationId: notificationDeclaration.id,
      event: normalizedEvent,
      operation: NOTIFICATION_EVENT_JOB_OPERATION,
    },
  });

  return {
    ok: true,
    operation: "queue_notification_event",
    queued: enqueued?.action === "inserted" || enqueued?.action === "updated",
    queueAction: enqueued?.action || "",
    eventName: normalizedEvent.name,
    job: enqueued?.job || null,
    jobId: enqueued?.job?.jobId || "",
    workspaceId: normalizedEvent.workspace_id,
    errors: [],
  };
}

async function handleNotificationEventJob({ payload = {} }) {
  const operation = String(payload.operation || NOTIFICATION_EVENT_JOB_OPERATION).trim();

  if (operation !== NOTIFICATION_EVENT_JOB_OPERATION) {
    throw new Error(`Unknown notification job operation "${operation}".`);
  }

  const event = normalizeNotificationEventForJob(payload.event || payload);
  const declarationId = String(payload.declarationId || payload.declaration_id || event.name || "").trim();
  const declaration = modulesService.listNotificationEvents()
    .find((candidate) => candidate.id === declarationId);

  if (!declaration) {
    return {
      notifications: [],
      skipped: true,
      reason: "notification_event_not_registered",
    };
  }

  return createFromEvent(event, declaration);
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

  if (isNotificationSuppressed(event)) {
    return { notifications: [] };
  }

  const summary = summarizeNotificationEvent(event);
  const template = modulesService.listNotificationTemplates().find((candidate) => candidate.event === event.name);
  const workspaceDefault = await readWorkspaceDefault(workspaceId, notificationDeclaration.id);
  if (!workspaceDefault.enabled) {
    return { notifications: [] };
  }
  const recipients = await resolveRecipients(event, notificationDeclaration);
  const enabledRecipients = await filterEnabledRecipients(workspaceId, recipients, notificationDeclaration.id);
  const rawSubscribedRecipients = await readSubscribedRecipientIds(event, notificationDeclaration);
  const subscribedRecipients = notificationDeclaration.suppressActorSubscriptions === true
    ? suppressActorRecipients(rawSubscribedRecipients, event)
    : rawSubscribedRecipients;
  const metadata = buildNotificationEventMetadata(event, notificationDeclaration);
  const defaultRecipients = shouldPreserveActorRecipient(event, notificationDeclaration)
    ? enabledRecipients
    : suppressActorRecipients(enabledRecipients, event);
  const finalRecipients = [...new Set([...defaultRecipients, ...subscribedRecipients])];

  const payloads = finalRecipients.map((recipientUserId) => ({
    workspace_id: workspaceId,
    module_id: moduleId,
    event_type: event.name,
    recipient_user_id: recipientUserId,
    actor_user_id: event.actor_user_id || "",
    record_type: event.record_type || "",
    record_id: event.record_id || "",
    title: template?.title || summary.title,
    body: notificationBodyWithChangedContext(template?.body || summary.body, metadata),
    url: template?.url || summary.url,
    priority: workspaceDefault.priority || notificationDeclaration.defaultPriority || "normal",
    metadata,
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

async function readSubscribedRecipientIds(event, declaration) {
  const workspaceId = event.workspace_id || "";
  const moduleId = declaration.moduleId || event.module_id || "";
  const targetType = event.record_type || "";
  const targetId = event.record_id || "";

  if (!workspaceId || !moduleId || !targetType || !targetId || !moduleDeclaresFollowTarget(moduleId, targetType, declaration.id)) {
    return [];
  }

  const subscriptions = await notificationsRepository.readSubscriptionsForTarget(workspaceId, {
    event_type: declaration.id,
    module_id: moduleId,
    target_id: targetId,
    target_type: targetType,
  });
  const allowedSubscriptions = await Promise.all(subscriptions.map(async (subscription) => {
    return await canUserAccessTarget({
      module_id: moduleId,
      target_id: targetId,
      target_type: targetType,
      url: summarizeNotificationEvent(event).url,
      user_id: subscription.user_id,
      workspace_id: workspaceId,
    }) ? subscription : null;
  }));

  return allowedSubscriptions.filter(Boolean).map((subscription) => subscription.user_id);
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

function suppressActorRecipients(recipientIds, event) {
  const actorUserId = String(event.actor_user_id || "").trim();

  if (!actorUserId) {
    return recipientIds;
  }

  return recipientIds.filter((userId) => String(userId || "").trim() !== actorUserId);
}

function isNotificationSuppressed(event) {
  const metadata = normalizeMetadata(event?.metadata);
  return metadata.suppress_notifications === true ||
    metadata.suppressNotifications === true ||
    Boolean(String(metadata.notification_suppression_reason || "").trim());
}

function normalizeNotificationEventForJob(event = {}) {
  const metadata = normalizeMetadata(event.metadata);
  return {
    actor_user_id: normalizeJobText(event.actor_user_id || event.actorUserId),
    emitted_at: normalizeJobText(event.emitted_at || event.emittedAt) || new Date().toISOString(),
    metadata,
    module_id: normalizeJobText(event.module_id || event.moduleId),
    name: normalizeJobText(event.name || event.event_type || event.eventType),
    new_value: normalizeJobPlainValue(event.new_value || event.newValue),
    previous_value: normalizeJobPlainValue(event.previous_value || event.previousValue),
    record_id: normalizeJobText(event.record_id || event.recordId),
    record_type: normalizeJobText(event.record_type || event.recordType),
    session: normalizeJobSession(event.session),
    source: normalizeJobText(event.source || metadata.source) || "internal-event",
    workspace_id: normalizeJobText(event.workspace_id || event.workspaceId),
  };
}

function normalizeJobPlainValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
}

function normalizeJobSession(session = null) {
  if (!session || typeof session !== "object" || Array.isArray(session)) {
    return null;
  }

  return {
    role: normalizeJobText(session.role),
    user_id: normalizeJobText(session.user_id || session.userId),
    username: normalizeJobText(session.username),
    workspace_id: normalizeJobText(session.workspace_id || session.workspaceId),
  };
}

function shapeNotificationQueueSkip(event, reason) {
  return {
    ok: true,
    operation: "queue_notification_event",
    queued: false,
    skipped: true,
    reason,
    eventName: event.name || "",
    job: null,
    jobId: "",
    workspaceId: event.workspace_id || "",
    errors: [],
  };
}

function normalizeJobText(value) {
  return String(value || "").trim();
}

function shouldPreserveActorRecipient(event, declaration) {
  const eventType = declaration?.id || event.name || "";
  const actorUserId = String(event.actor_user_id || "").trim();

  if (!actorUserId || !["task.due_soon", "task.overdue"].includes(eventType)) {
    return false;
  }

  return readAssigneeIds(event).includes(actorUserId) && taskEventHasDueContext(event);
}

function taskEventHasDueContext(event) {
  return hasTaskDueContext(event.new_value) ||
    hasTaskDueContext(event.previous_value) ||
    hasTaskDueContext(event.metadata);
}

function hasTaskDueContext(source = {}) {
  return Boolean(
    source?.due_date ||
    source?.dueDate ||
    source?.due_time ||
    source?.dueTime ||
    source?.due_at_utc ||
    source?.dueAtUtc ||
    source?.due_kind ||
    source?.dueKind,
  );
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
  const updateTypeLabel = notificationUpdateTypeLabel(notification);

  return {
    ...notification,
    displayType: updateTypeLabel,
    displayTitle,
    updateTypeLabel,
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

async function readNoteTargetMetadata(notification, session, baseMetadata) {
  const { notesService } = await import("../modules/notes/notes.service.js");

  try {
    const result = await notesService.read(notification.record_id, session);
    const note = result.note || {};
    return {
      ...baseMetadata,
      canOpen: Boolean(notification.url),
      context: {
        clientName: note.linked_context?.client?.label || "",
        projectName: note.linked_context?.project?.label || "",
      },
      label: note.title || "",
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

function moduleDeclaresFollowTarget(moduleId, targetType, eventType = "") {
  return modulesService.listNotificationFollowTargets().some((target) => (
    target.moduleId === moduleId &&
    target.targetType === targetType &&
    (!eventType || !Array.isArray(target.eventTypes) || target.eventTypes.length === 0 || target.eventTypes.includes(eventType))
  ));
}

async function assertCanFollowTarget(session, target) {
  await permissionsService.assertCanInAnyScope(session, "notifications.manage_preferences");

  if (!moduleDeclaresFollowTarget(target.module_id, target.target_type, target.event_type)) {
    throw new AppError("Notification target cannot be followed.", 400);
  }

  if (!(await modulesService.canReadModule(session.workspace_id, target.module_id))) {
    throw new AppError("Notification target module is not available.", 403);
  }

  const canAccessTarget = await canUserAccessTarget({
    ...target,
    user_id: session.user_id,
    workspace_id: session.workspace_id,
  });
  if (!canAccessTarget) {
    throw new AppError("Notification target not found.", 404);
  }
}

async function canUserAccessTarget(target) {
  const metadata = await readTargetMetadata({
    module_id: target.module_id,
    record_id: target.target_id,
    record_type: target.target_type,
    url: target.url || "",
  }, {
    user_id: target.user_id,
    workspace_id: target.workspace_id,
  });

  return metadata.targetExists === true;
}

function normalizeSubscriptionTarget(source = {}) {
  const target = {
    event_type: String(source.event_type || source.eventType || "").trim(),
    module_id: String(source.module_id || source.moduleId || "").trim(),
    target_id: String(source.target_id || source.targetId || source.record_id || source.recordId || "").trim(),
    target_type: String(source.target_type || source.targetType || source.record_type || source.recordType || "").trim(),
  };

  if (!target.module_id || !target.target_type || !target.target_id) {
    throw new AppError("Notification subscription module, target type, and target ID are required.", 400);
  }

  return target;
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

function buildNotificationEventMetadata(event, declaration) {
  const changedFields = readChangedFields(event.previous_value, event.new_value);
  const changedContext = buildEventChangedContext(event, changedFields);
  const metadata = {
    ...(event.metadata || {}),
    ...(changedContext ? { changed_context: changedContext } : {}),
    changed_fields: changedFields,
    emitted_at: event.emitted_at,
    source: event.source || "",
  };
  const updateTypeLabel = notificationUpdateTypeLabel({
    event_type: event.name,
    metadata,
    module_id: declaration?.moduleId || event.module_id || "",
  }, {
    newValue: event.new_value,
    previousValue: event.previous_value,
  });

  return {
    ...metadata,
    update_type_label: updateTypeLabel,
  };
}

function notificationBodyWithChangedContext(body, metadata = {}) {
  const normalizedBody = String(body || "").trim();
  const changedContext = normalizeMetadata(metadata).changed_context || {};
  const summary = String(changedContext.summary || "").trim();

  if (!summary) {
    return normalizedBody;
  }

  if (!normalizedBody) {
    return summary;
  }

  return `${normalizedBody} ${summary}`;
}

function notificationUpdateTypeLabel(notification, options = {}) {
  const eventType = notification.event_type || notification.eventType || "";
  const metadata = normalizeMetadata(notification.metadata || notification.metadata_json);

  if (metadata.update_type_label || metadata.updateTypeLabel) {
    return String(metadata.update_type_label || metadata.updateTypeLabel).trim();
  }

  if (eventType === "task.updated") {
    return taskUpdatedLabel(metadata, options);
  }

  return eventDeclarationLabel(notification) || fallbackEventLabel(eventType);
}

function normalizeNotificationListFilters(query = {}) {
  return {
    eventType: normalizeOptionalFilter(query.eventType || query.event_type),
    moduleId: normalizeOptionalFilter(query.moduleId || query.module_id || query.module),
    priority: normalizeNotificationPriorityFilter(query.priority),
    status: normalizeNotificationStatus(query.status),
  };
}

function normalizeNotificationStatus(value) {
  const status = String(value || "").trim();
  return ["active", "unread", "read", "dismissed", "archived"].includes(status) ? status : "";
}

function normalizeOptionalFilter(value) {
  return String(value || "").trim().slice(0, 120);
}

function normalizeNotificationPriorityFilter(value) {
  const priority = String(value || "").trim();
  return ["low", "normal", "high", "urgent"].includes(priority) ? priority : "";
}

function eventDeclarationLabel(notification) {
  const eventType = notification.event_type || notification.eventType || "";
  const moduleId = notification.module_id || notification.moduleId || "";
  const declaration = modulesService.listNotificationEvents().find((event) => (
    event.id === eventType && (!moduleId || event.moduleId === moduleId)
  ));

  return String(declaration?.label || "").trim();
}

function fallbackEventLabel(eventType) {
  return String(eventType || "Notification")
    .split(".")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).replaceAll("_", " "))
    .join(" ") || "Notification";
}

async function listConfigurableNotificationEvents(workspaceId) {
  const events = modulesService.listNotificationEvents()
    .filter((event) => modulesService.getModule(event.moduleId));
  const eventsWithStatus = await Promise.all(events.map(async (event) => ({
    ...event,
    moduleEnabled: event.moduleId ? await modulesService.canWriteModule(workspaceId, event.moduleId) : true,
  })));

  return eventsWithStatus.sort((left, right) => (
    Number(left.moduleEnabled === false) - Number(right.moduleEnabled === false) ||
    left.moduleId.localeCompare(right.moduleId) ||
    left.label.localeCompare(right.label)
  ));
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

function normalizeDisplayPreferences(source = null) {
  if (!source || typeof source !== "object") {
    return null;
  }

  return {
    grouping_mode: normalizeGroupingMode(source.grouping_mode || source.groupingMode),
  };
}

function shapeUserDisplayPreferences(preferences = null) {
  return {
    groupingMode: normalizeGroupingMode(preferences?.groupingMode),
  };
}

function normalizeGroupingMode(value) {
  return ["client_project", "notification_type", "record_type"].includes(value) ? value : "client_project";
}

function notificationPreferenceAuditValue(row) {
  return {
    enabled: Number(row.enabled) === 1,
    event_type: row.event_type,
  };
}

function notificationWorkspaceDefaultAuditValue(row) {
  return {
    enabled: Number(row.enabled) === 1,
    event_type: row.event_type,
    priority: row.priority || "normal",
  };
}

export const notificationsService = {
  archiveOldNotifications,
  create,
  createFromEvent,
  createMany,
  dismiss,
  dismissAll,
  followTarget,
  list,
  markAllRead,
  markRead,
  preferences,
  readTargetMetadata,
  registerEventHandlers,
  registerNotificationJobHandlers,
  resetEventHandlersForTests,
  savePreferences,
  saveWorkspaceDefaults,
  subscriptionStatus,
  unfollowTarget,
  queueNotificationEvent,
  unreadCount,
};

export {
  NOTIFICATION_EVENT_JOB_TYPE,
  handleNotificationEventJob,
  queueNotificationEvent,
  registerNotificationJobHandlers,
};
