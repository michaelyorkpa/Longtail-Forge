import { createHash } from "node:crypto";
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

/** @typedef {import("../types/framework-contracts.js").InternalEvent} InternalEvent */
/** @typedef {import("../types/framework-contracts.js").JobExecutionRecord<"notification.event">} JobExecutionRecord */
/** @typedef {import("../types/framework-contracts.js").JobHandlerContext<"notification.event">} JobHandlerContext */
/** @typedef {import("../types/framework-contracts.js").NotificationEventContribution} NotificationEventContribution */
/** @typedef {import("../types/framework-contracts.js").NotificationEventPayload} NotificationEventPayload */
/** @typedef {import("../types/framework-contracts.js").NotificationTemplateContribution} NotificationTemplateContribution */
/** @typedef {import("../types/http-contracts.js").PermissionSession} PermissionSession */
/** @typedef {import("../types/notes-domain-contracts.js").NotesServiceSession} NotesServiceSession */
/** @typedef {import("../types/http-contracts.js").WorkspaceRequestSession} WorkspaceRequestSession */
/** @typedef {import("../repositories/notifications.repo.js").NotificationCreateInput} NotificationCreateInput */
/** @typedef {import("../repositories/notifications.repo.js").NotificationDisplayPreferenceRow} NotificationDisplayPreferenceRow */
/** @typedef {import("../repositories/notifications.repo.js").NotificationRow} NotificationRow */
/** @typedef {import("../repositories/notifications.repo.js").NotificationUserPreferenceRow} NotificationUserPreferenceRow */
/** @typedef {import("../repositories/notifications.repo.js").NotificationWorkspaceDefaultRow} NotificationWorkspaceDefaultRow */
/** @typedef {Record<string, unknown>} LooseRecord */
/** @typedef {NonNullable<Awaited<ReturnType<typeof notificationsRepository.create>>>} NotificationValue */
/** @typedef {NonNullable<Awaited<ReturnType<typeof notificationsRepository.readUserDisplayPreferences>>>} NotificationDisplayPreferenceValue */
/** @typedef {{authorization_source?: "notification", role?: string, user_id?: string, username?: string, workspace_id?: string|null}} NotificationSessionContext */
/** @typedef {{actor_user_id?: string, emitted_at?: string, metadata?: LooseRecord, module_id?: string, name: string, new_value?: unknown, previous_value?: unknown, record_id?: string, record_type?: string, session?: NotificationSessionContext|import("../types/http-contracts.js").RequestSession|null, source?: string, workspace_id?: string}} NotificationEventRecord */
/** @typedef {NotificationEventRecord & {actor_user_id: string, emitted_at: string, metadata: LooseRecord, module_id: string, new_value: LooseRecord, previous_value: LooseRecord, record_id: string, record_type: string, session: NotificationSessionContext|null, source: string, workspace_id: string}} NormalizedNotificationEvent */
/** @typedef {{job?: JobExecutionRecord|LooseRecord, maxAttempts?: number, max_attempts?: number, priority?: number}} NotificationEventOptions */
/** @typedef {NotificationCreateInput & {metadata: LooseRecord}} NormalizedNotificationCreateInput */
/** @typedef {LooseRecord & {canOpen: boolean, context?: LooseRecord, label?: string, moduleId: string, recordId: string, recordType: string, targetExists: boolean, url: string}} NotificationTargetMetadata */

const FRAMEWORK_NOTIFICATION_MODULE_ID = "framework";
const NOTIFICATION_DEFAULT_PAGE_SIZE = 25;
const NOTIFICATION_MAX_PAGE_SIZE = 100;
const NOTIFICATION_EVENT_JOB_TYPE = "notification.event";
const NOTIFICATION_EVENT_JOB_PRIORITY = 20;
const NOTIFICATION_EVENT_JOB_OPERATION = "process_event";
/**
 * @type {(() => void)[]}
 */
let notificationEventUnsubscribers = [];
let notificationEventHandlersRegistered = false;
let notificationJobHandlersRegistered = false;

/** @param {LooseRecord} payload @param {NotificationSessionContext|null} [session] */
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

/** @param {LooseRecord[]} payloads @param {NotificationSessionContext|null} [session] */
async function createMany(payloads, session = null) {
  const notifications = [];

  for (const payload of payloads || []) {
    const result = await create(payload, session);
    notifications.push(result.notification);
  }

  return { notifications };
}

/**
 * @param {import("../types/http-contracts.js").PermissionSession | null | undefined} session
 * @param {LooseRecord} [query]
 */
async function list(session, query = {}) {
  const activeSession = await permissionsService.assertCanInAnyScope(session, "notifications.view_own");

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
    notificationsRepository.listForRecipient(activeSession.workspace_id, activeSession.user_id, repositoryQuery),
    notificationsRepository.countForRecipient(activeSession.workspace_id, activeSession.user_id, repositoryQuery),
    notificationsRepository.readFilterOptionsForRecipient(activeSession.workspace_id, activeSession.user_id, filters),
  ]);

  return {
    filterOptions,
    notifications: await Promise.all(notifications.map((notification) => decorateForSession(notification, activeSession))),
    pagination: boundedPaginationEnvelope({
      ...pagination,
      hasMore: pagination.offset + notifications.length < total,
      returned: notifications.length,
      total,
    }),
  };
}

/**
 * @param {import("../types/http-contracts.js").PermissionSession | null | undefined} session
 */
async function unreadCount(session) {
  const activeSession = await permissionsService.assertCanInAnyScope(session, "notifications.view_own");

  return notificationsRepository.readBellSummaryForRecipient(activeSession.workspace_id, activeSession.user_id);
}

/**
 * @param {import("../types/http-contracts.js").PermissionSession | null | undefined} session
 */
async function preferences(session) {
  const activeSession = await permissionsService.assertCanInAnyScope(session, "notifications.manage_preferences");

  const [userRows, displayPreferences, defaultRows, canManageWorkspaceDefaults, configurableEvents] = await Promise.all([
    notificationsRepository.readUserPreferences(activeSession.workspace_id, activeSession.user_id),
    notificationsRepository.readUserDisplayPreferences(activeSession.workspace_id, activeSession.user_id),
    notificationsRepository.readWorkspaceDefaults(activeSession.workspace_id),
    permissionsService.canInAnyScope(activeSession, "notifications.manage_workspace_defaults"),
    listConfigurableNotificationEvents(activeSession.workspace_id),
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

/**
 * @param {import("../types/http-contracts.js").PermissionSession | null | undefined} session
 */
/** @param {PermissionSession|null|undefined} session @param {LooseRecord} [payload] */
async function savePreferences(session, payload = {}) {
  const activeSession = await permissionsService.assertCanInAnyScope(session, "notifications.manage_preferences");

  const allowedEventIds = new Set((await listConfigurableNotificationEvents(activeSession.workspace_id)).map((event) => event.id));
  const preferenceRows = normalizePreferenceList(payload.preferences || payload.events, allowedEventIds);
  const previousRows = await notificationsRepository.readUserPreferences(activeSession.workspace_id, activeSession.user_id);
  const displayPreferences = normalizeDisplayPreferences(payload.groupingPreferences || payload.displayPreferences);
  await notificationsRepository.saveUserPreferences(activeSession.workspace_id, activeSession.user_id, preferenceRows);
  if (displayPreferences) {
    await notificationsRepository.saveUserDisplayPreferences(activeSession.workspace_id, activeSession.user_id, displayPreferences);
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
    recordId: activeSession.user_id,
    recordLabel: "Notification preferences",
    recordType: "user",
    session: activeSession,
  });
  return preferences(activeSession);
}

/**
 * @param {import("../types/http-contracts.js").PermissionSession | null | undefined} session
 */
/** @param {PermissionSession|null|undefined} session @param {LooseRecord} [payload] */
async function saveWorkspaceDefaults(session, payload = {}) {
  const activeSession = await permissionsService.assertCanInAnyScope(session, "notifications.manage_workspace_defaults");

  const allowedEventIds = new Set((await listConfigurableNotificationEvents(activeSession.workspace_id)).map((event) => event.id));
  const defaults = normalizeWorkspaceDefaultList(payload.defaults || payload.events, allowedEventIds);
  const previousRows = await notificationsRepository.readWorkspaceDefaults(activeSession.workspace_id);
  await notificationsRepository.saveWorkspaceDefaults(activeSession.workspace_id, defaults);
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
    session: activeSession,
  });
  return preferences(activeSession);
}

/**
 * @param {WorkspaceRequestSession} session
 * @param {LooseRecord} [query]
 */
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

/**
 * @param {WorkspaceRequestSession} session
 * @param {LooseRecord} [payload]
 */
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

/**
 * @param {WorkspaceRequestSession} session
 * @param {LooseRecord} [payload]
 */
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

/**
 * @param {string} notificationId
 * @param {WorkspaceRequestSession} session
 */
async function markRead(notificationId, session) {
  await assertCanMutateOwnNotification(notificationId, session);
  const notification = await notificationsRepository.markRead(session.workspace_id, session.user_id, notificationId);

  return { notification: await decorateForSession(notification, session) };
}

/**
 * @param {import("../types/http-contracts.js").PermissionSession | null | undefined} session
 */
async function markAllRead(session) {
  const activeSession = await permissionsService.assertCanInAnyScope(session, "notifications.view_own");

  await notificationsRepository.markAllRead(activeSession.workspace_id, activeSession.user_id);
  return unreadCount(activeSession);
}

/**
 * @param {string} notificationId
 * @param {WorkspaceRequestSession} session
 */
async function dismiss(notificationId, session) {
  await assertCanMutateOwnNotification(notificationId, session);
  const notification = await notificationsRepository.dismiss(session.workspace_id, session.user_id, notificationId);

  return { notification: await decorateForSession(notification, session) };
}

/**
 * @param {import("../types/http-contracts.js").PermissionSession | null | undefined} session
 */
async function dismissAll(session) {
  const activeSession = await permissionsService.assertCanInAnyScope(session, "notifications.view_own");

  await notificationsRepository.dismissAll(activeSession.workspace_id, activeSession.user_id);
  return unreadCount(activeSession);
}

/**
 * @param {string} cutoffIso
 */
async function archiveOldNotifications(cutoffIso) {
  await notificationsRepository.archiveOlderThan(cutoffIso);
}

/**
 * @param {string} workspaceId
 * @param {string} moduleId
 * @param {string} recordType
 * @param {unknown[] | undefined} recordIds
 */
async function removeTargetArtifacts(workspaceId, moduleId, recordType, recordIds) {
  return notificationsRepository.removeForTargets(workspaceId, moduleId, recordType, recordIds);
}

/** @param {NotificationValue|LooseRecord} notification @param {NotificationSessionContext} session @returns {Promise<NotificationTargetMetadata>} */
async function readTargetMetadata(notification, session) {
  const moduleId = normalizeJobText(notification.module_id);
  const recordType = normalizeJobText(notification.record_type);
  const recordId = normalizeJobText(notification.record_id);
  const moduleDefinition = moduleId && moduleId !== FRAMEWORK_NOTIFICATION_MODULE_ID ? modulesService.getModule(moduleId) : null;
  /** @type {NotificationTargetMetadata} */
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
      url: normalizeJobText(notification.url),
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
    url: normalizeJobText(notification.url),
  };
}

function registerEventHandlers() {
  registerNotificationJobHandlers();

  if (notificationEventHandlersRegistered) {
    return;
  }

  notificationEventHandlersRegistered = true;
  notificationEventUnsubscribers = modulesService.listNotificationEvents().map((declaration) => (
    modulesService.onInternalEvent(declaration.id, async (/** @type {import("../types/framework-contracts.js").InternalEvent} */ event) => {
      await queueNotificationEvent(event, declaration);
    }, {
      id: `notifications:${declaration.id}`,
      moduleId: FRAMEWORK_NOTIFICATION_MODULE_ID,
    })
  ));
}

/** @param {{replace?: boolean}} [options] */
function registerNotificationJobHandlers(options = {}) {
  if (notificationJobHandlersRegistered && !options.replace && getJobHandler(NOTIFICATION_EVENT_JOB_TYPE)) {
    return;
  }

  registerJobHandler(NOTIFICATION_EVENT_JOB_TYPE, handleNotificationEventJob, {
    publicDemoCapability: "records.workspace",
    replace: true,
  });
  notificationJobHandlersRegistered = true;
}

/**
 * @param {unknown} event
 * @param {NotificationEventContribution|null} [declaration]
 * @param {NotificationEventOptions} [options]
 */
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
    dedupeKey: notificationEventJobDedupeKey(normalizedEvent),
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

/** @param {JobHandlerContext} jobContext */
async function handleNotificationEventJob({ payload, job }) {
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

  return createFromEvent(event, declaration, { job });
}

function resetEventHandlersForTests() {
  for (const unsubscribe of notificationEventUnsubscribers) {
    unsubscribe();
  }

  notificationEventUnsubscribers = [];
  notificationEventHandlersRegistered = false;
}

/**
 * @param {NotificationEventRecord} event
 * @param {NotificationEventContribution|null} [declaration]
 * @param {NotificationEventOptions} [options]
 */
async function createFromEvent(event, declaration = null, options = {}) {
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

  const summary = summarizeNotificationEvent(/** @type {import("../types/framework-contracts.js").EventSummaryInput} */ (event), { moduleId: notificationDeclaration.moduleId });
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
  const deliveryKey = notificationDeliveryKey(event, options);
  const defaultRecipients = shouldPreserveActorRecipient(event, notificationDeclaration)
    ? enabledRecipients
    : suppressActorRecipients(enabledRecipients, event);
  const finalRecipients = [...new Set([...defaultRecipients, ...subscribedRecipients])];

  const payloads = finalRecipients.map((recipientUserId) => ({
    ...(deliveryKey ? { notification_id: notificationIdForDeliveryKey(workspaceId, notificationDeclaration.id, recipientUserId, deliveryKey) } : {}),
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
    metadata: deliveryKey ? {
      ...metadata,
      notification_delivery_key: deliveryKey,
    } : metadata,
  }));

  return createMany(payloads, event.session || null);
}

/** @param {string} workspaceId @param {string[]} recipientIds @param {string} eventType */
async function filterEnabledRecipients(workspaceId, recipientIds, eventType) {
  const userPreferences = await Promise.all(recipientIds.map(async (/** @type {string} */ userId) => {
    const rows = await notificationsRepository.readUserPreferences(workspaceId, userId);
    const preference = rows.find((row) => row.event_type === eventType);
    return {
      enabled: !preference || Number(preference.enabled) === 1,
      userId,
    };
  }));

  return userPreferences.filter((preference) => preference.enabled).map((preference) => preference.userId);
}

/**
 * @param {string} workspaceId
 * @param {string} eventType
 */
async function readWorkspaceDefault(workspaceId, eventType) {
  const event = modulesService.listNotificationEvents().find((candidate) => candidate.id === eventType);
  const rows = await notificationsRepository.readWorkspaceDefaults(workspaceId);
  const defaultRow = rows.find((row) => row.event_type === eventType);

  return {
    enabled: defaultRow ? Number(defaultRow.enabled) === 1 : event?.defaultEnabled !== false,
    priority: defaultRow?.priority || event?.defaultPriority || "normal",
  };
}

/** @param {NotificationEventRecord} event @param {NotificationEventContribution} declaration */
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
      url: summarizeNotificationEvent(/** @type {import("../types/framework-contracts.js").EventSummaryInput} */ (event), { moduleId: declaration.moduleId }).url,
      user_id: subscription.user_id,
      workspace_id: workspaceId,
    }) ? subscription : null;
  }));

  return allowedSubscriptions.flatMap((subscription) => (subscription ? [subscription.user_id] : []));
}

/** @param {NotificationEventRecord} event @param {NotificationEventContribution} declaration */
async function resolveRecipients(event, declaration) {
  /** @type {Set<string>} */
  const recipientIds = new Set();
  const hints = new Set([
    declaration.recipientMode || "",
    ...summarizeNotificationEvent(/** @type {import("../types/framework-contracts.js").EventSummaryInput} */ (event), { moduleId: declaration.moduleId }).recipientHints,
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
    for (const userId of await notificationsRepository.readWorkspaceAdminUserIds(event.workspace_id || "")) {
      recipientIds.add(userId);
    }
  }

  return [...recipientIds].filter(Boolean);
}

/** @param {string[]} recipientIds @param {NotificationEventRecord} event */
function suppressActorRecipients(recipientIds, event) {
  const actorUserId = String(event.actor_user_id || "").trim();

  if (!actorUserId) {
    return recipientIds;
  }

  return recipientIds.filter((userId) => String(userId || "").trim() !== actorUserId);
}

/**
 * @param {NotificationEventRecord} event
 */
function isNotificationSuppressed(event) {
  const metadata = normalizeMetadata(event?.metadata);
  return metadata.suppress_notifications === true ||
    metadata.suppressNotifications === true ||
    Boolean(String(metadata.notification_suppression_reason || "").trim());
}

/** @param {unknown} [event] @returns {NormalizedNotificationEvent} */
function normalizeNotificationEventForJob(event = {}) {
  const sourceEvent = objectValue(event);
  const metadata = normalizeMetadata(sourceEvent.metadata);
  return {
    actor_user_id: normalizeJobText(sourceEvent.actor_user_id || sourceEvent.actorUserId),
    emitted_at: normalizeJobText(sourceEvent.emitted_at || sourceEvent.emittedAt) || new Date().toISOString(),
    metadata,
    module_id: normalizeJobText(sourceEvent.module_id || sourceEvent.moduleId),
    name: normalizeJobText(sourceEvent.name || sourceEvent.event_type || sourceEvent.eventType),
    new_value: normalizeJobPlainValue(sourceEvent.new_value || sourceEvent.newValue),
    previous_value: normalizeJobPlainValue(sourceEvent.previous_value || sourceEvent.previousValue),
    record_id: normalizeJobText(sourceEvent.record_id || sourceEvent.recordId),
    record_type: normalizeJobText(sourceEvent.record_type || sourceEvent.recordType),
    session: normalizeJobSession(sourceEvent.session),
    source: normalizeJobText(sourceEvent.source || metadata.source) || "internal-event",
    workspace_id: normalizeJobText(sourceEvent.workspace_id || sourceEvent.workspaceId),
  };
}

/** @param {unknown} value @returns {LooseRecord} */
function normalizeJobPlainValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return /** @type {LooseRecord} */ (value);
}

/** @param {unknown} [session] @returns {NotificationSessionContext|null} */
function normalizeJobSession(session = null) {
  if (!session || typeof session !== "object" || Array.isArray(session)) {
    return null;
  }

  return {
    authorization_source: "notification",
    role: normalizeJobText(/** @type {LooseRecord} */ (session).role),
    user_id: normalizeJobText(/** @type {LooseRecord} */ (session).user_id || /** @type {LooseRecord} */ (session).userId),
    username: normalizeJobText(/** @type {LooseRecord} */ (session).username),
    workspace_id: normalizeJobText(/** @type {LooseRecord} */ (session).workspace_id || /** @type {LooseRecord} */ (session).workspaceId),
  };
}

/** @param {NormalizedNotificationEvent} event @param {string} reason */
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

/** @param {unknown} value */
function normalizeJobText(value) {
  return String(value || "").trim();
}

/** @param {NotificationEventRecord} event @param {NotificationEventContribution} declaration */
function shouldPreserveActorRecipient(event, declaration) {
  const eventType = declaration?.id || event.name || "";
  const actorUserId = String(event.actor_user_id || "").trim();

  if (!actorUserId || !["task.due_soon", "task.overdue"].includes(eventType)) {
    return false;
  }

  return readAssigneeIds(event).includes(actorUserId) && taskEventHasDueContext(event);
}

/**
 * @param {NotificationEventRecord} event
 */
function taskEventHasDueContext(event) {
  return hasTaskDueContext(event.new_value) ||
    hasTaskDueContext(event.previous_value) ||
    hasTaskDueContext(event.metadata);
}

/** @param {unknown} [source] */
function hasTaskDueContext(source = {}) {
  const value = objectValue(source);
  return Boolean(
    value.due_date ||
    value.dueDate ||
    value.due_time ||
    value.dueTime ||
    value.due_at_utc ||
    value.dueAtUtc ||
    value.due_kind ||
    value.dueKind,
  );
}

/** @param {LooseRecord} [payload] @param {NotificationSessionContext|null} [session] @returns {Promise<NormalizedNotificationCreateInput>} */
async function normalizeCreatePayload(payload = {}, session = null) {
  const workspaceId = normalizeJobText(payload.workspace_id || payload.workspaceId || session?.workspace_id);
  const moduleId = normalizeJobText(payload.module_id || payload.moduleId);
  const eventType = normalizeJobText(payload.event_type || payload.eventType);
  const recipientUserId = normalizeJobText(payload.recipient_user_id || payload.recipientUserId);
  const recordType = normalizeJobText(payload.record_type || payload.recordType);
  const recordId = normalizeJobText(payload.record_id || payload.recordId);

  if (!workspaceId || !eventType || !recipientUserId || !payload.title) {
    throw new AppError("Notification workspace, event type, recipient, and title are required.", 400);
  }

  return {
    notification_id: normalizeJobText(payload.notification_id || payload.notificationId),
    workspace_id: workspaceId,
    module_id: moduleId,
    event_type: eventType,
    recipient_user_id: recipientUserId,
    actor_user_id: normalizeJobText(payload.actor_user_id || payload.actorUserId || session?.user_id),
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

/** @param {NormalizedNotificationCreateInput} notification */
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

  if (notification.record_type && !moduleDeclaresRecordType(notification.module_id || "", notification.record_type)) {
    throw new AppError("Notification target record type is not registered.", 400);
  }
}

/**
 * @param {string} notificationId
 * @param {import("../types/http-contracts.js").PermissionSession | null | undefined} session
 */
async function assertCanMutateOwnNotification(notificationId, session) {
  const activeSession = await permissionsService.assertCanInAnyScope(session, "notifications.view_own");

  const notification = await notificationsRepository.readByIdForRecipient(activeSession.workspace_id, activeSession.user_id, notificationId);
  if (!notification) {
    throw new AppError("Notification not found.", 404);
  }
  return activeSession;
}

/** @param {NotificationValue|null} notification @param {NotificationSessionContext} session */
async function decorateForSession(notification, session) {
  if (!notification) {
    throw new AppError("Notification not found.", 404);
  }

  const target = await readTargetMetadata(notification, session);
  const protectedOrUnavailableNote = notification.record_type === "note" && !target.targetExists;
  const displayTitle = protectedOrUnavailableNote ? "Protected or unavailable note" : target.label || notification.title;
  const updateTypeLabel = notificationUpdateTypeLabel(notification);

  return {
    ...notification,
    ...(protectedOrUnavailableNote ? { body: "", metadata: {}, title: "Protected or unavailable note" } : {}),
    displayType: updateTypeLabel,
    displayTitle,
    updateTypeLabel,
    url: target.canOpen ? target.url : "",
    target,
  };
}

/** @param {NotificationValue|LooseRecord} notification @param {NotificationSessionContext} session @param {NotificationTargetMetadata} baseMetadata @returns {Promise<NotificationTargetMetadata>} */
async function readTaskTargetMetadata(notification, session, baseMetadata) {
  const { tasksService } = await import("../modules/tasks/tasks.service.js");

  try {
    const result = await tasksService.read(
      normalizeJobText(notification.record_id),
      /** @type {import("../types/task-server-contracts.d.ts").TaskServerSession} */ (session),
    );
    const task = result.task || {};
    return {
      ...baseMetadata,
      canOpen: Boolean(notification.url),
      context: {
        clientName: task.client_name || "",
        projectName: task.project_name || "",
      },
      label: normalizeJobText(task.title),
      targetExists: true,
      url: normalizeJobText(notification.url),
    };
  } catch {
    return baseMetadata;
  }
}

/** @param {NotificationValue|LooseRecord} notification @param {NotificationSessionContext} session @param {NotificationTargetMetadata} baseMetadata @returns {Promise<NotificationTargetMetadata>} */
async function readNoteTargetMetadata(notification, session, baseMetadata) {
  const { notesService } = await import("../modules/notes/notes.service.js");

  try {
    if (!isNotesServiceSession(session)) {
      return baseMetadata;
    }
    const note = /** @type {LooseRecord} */ (await notesService.readConsumerSummary(
      normalizeJobText(notification.record_id),
      session,
      "notes.notifications",
    ));
    return {
      ...baseMetadata,
      canOpen: Boolean(notification.url),
      context: {
        clientName: normalizeJobText(objectValue(objectValue(note.linked_context).client).label),
        projectName: normalizeJobText(objectValue(objectValue(note.linked_context).project).label),
      },
      label: normalizeJobText(note.title),
      targetExists: true,
      url: normalizeJobText(notification.url),
    };
  } catch {
    return baseMetadata;
  }
}

/** @param {NotificationSessionContext} session @returns {session is NotesServiceSession} */
function isNotesServiceSession(session) {
  if (!session.workspace_id || !session.user_id || typeof session.username !== "string") {
    return false;
  }

  const record = /** @type {LooseRecord} */ (session);
  if (record.authorization_source === "notification") {
    return true;
  }
  if (typeof record.api_key_id === "string" && record.api_key_id) {
    return true;
  }

  return typeof record.timezone === "string" &&
    typeof record.ip_address === "string" &&
    typeof record.active_workspace_id === "string" &&
    (typeof record.home_workspace_id === "string" || record.home_workspace_id === null) &&
    typeof record.session_mode === "string" &&
    (typeof record.password_change_required === "boolean" || record.session_mode === "private_feed");
}

/** @param {string} moduleId @param {string} recordType */
function moduleDeclaresRecordType(moduleId, recordType) {
  if (!recordType) {
    return true;
  }

  return modulesService.listModuleEventTypes().some((eventType) => (
    eventType.recordType === recordType && (!moduleId || eventType.moduleId === moduleId)
  ));
}

/** @param {string} moduleId @param {string} targetType @param {string} [eventType] */
function moduleDeclaresFollowTarget(moduleId, targetType, eventType = "") {
  return modulesService.listNotificationFollowTargets().some((target) => (
    target.moduleId === moduleId &&
    target.targetType === targetType &&
    (!eventType || !Array.isArray(target.eventTypes) || target.eventTypes.length === 0 || target.eventTypes.includes(eventType))
  ));
}

/** @param {WorkspaceRequestSession} session @param {LooseRecord & {module_id: string, target_type: string, target_id: string, event_type: string}} target */
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

/** @param {LooseRecord} target */
async function canUserAccessTarget(target) {
  const metadata = await readTargetMetadata({
    module_id: target.module_id,
    record_id: target.target_id,
    record_type: target.target_type,
    url: target.url || "",
  }, {
    authorization_source: "notification",
    user_id: normalizeJobText(target.user_id),
    username: normalizeJobText(target.username),
    workspace_id: normalizeJobText(target.workspace_id),
  });

  return metadata.targetExists === true;
}

/** @param {LooseRecord} [source] */
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

/** @param {NotificationEventRecord} event */
function readExplicitRecipientIds(event) {
  const ids = event.metadata?.recipient_user_ids || event.metadata?.recipientUserIds || [];
  return Array.isArray(ids) ? ids.map((id) => String(id || "").trim()).filter(Boolean) : [];
}

/** @param {NotificationEventRecord} event */
function readAssigneeIds(event) {
  const ids = objectValue(event.new_value).assignee_ids || objectValue(event.previous_value).assignee_ids || [];
  return Array.isArray(ids) ? ids.map((id) => String(id || "").trim()).filter(Boolean) : [];
}

/** @param {unknown} value @returns {string} */
function safeRelativeUrl(value) {
  const url = String(value || "").trim();
  return url && !/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : "";
}

/** @param {unknown} status @returns {string} */
function normalizeStatus(status) {
  const normalized = String(status || "");
  return ["unread", "read", "dismissed", "archived"].includes(normalized) ? normalized : "unread";
}

/** @param {unknown} priority @returns {string} */
function normalizePriority(priority) {
  const normalized = String(priority || "");
  return ["low", "normal", "high", "urgent"].includes(normalized) ? normalized : "normal";
}

/**
 * @param {unknown} metadata
 * @returns {LooseRecord}
 */
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

  return typeof metadata === "object" && !Array.isArray(metadata)
    ? /** @type {LooseRecord} */ (metadata)
    : {};
}

/** @param {NotificationEventRecord} event @param {NotificationEventContribution|null} declaration */
function buildNotificationEventMetadata(event, declaration) {
  const changedFields = readChangedFields(event.previous_value, event.new_value);
  const changedContext = buildEventChangedContext(/** @type {import("../types/framework-contracts.js").EventSummaryInput} */ (event), changedFields);
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

/** @param {NotificationEventRecord} event */
function notificationEventJobDedupeKey(event) {
  const key = explicitNotificationDeliveryKey(event);

  if (!key || !event.workspace_id || !event.name) {
    return null;
  }

  return [
    "notification",
    "event",
    event.workspace_id,
    event.name,
    stableHash(key),
  ].join(":");
}

/** @param {NotificationEventRecord} event @param {NotificationEventOptions} [options] */
function notificationDeliveryKey(event, options = {}) {
  const job = objectValue(options.job);
  return explicitNotificationDeliveryKey(event) ||
    normalizeJobText(job.dedupeKey || job.dedupe_key) ||
    normalizeJobText(job.jobId || job.id);
}

/** @param {NotificationEventRecord} event */
function explicitNotificationDeliveryKey(event) {
  const metadata = normalizeMetadata(event.metadata);

  return normalizeJobText(
    metadata.notification_delivery_key ||
    metadata.notificationDeliveryKey ||
    metadata.idempotency_key ||
    metadata.idempotencyKey ||
    metadata.reminder_delivery_key ||
    metadata.reminderDeliveryKey,
  );
}

/** @param {string} workspaceId @param {string} eventType @param {string} recipientUserId @param {string} deliveryKey */
function notificationIdForDeliveryKey(workspaceId, eventType, recipientUserId, deliveryKey) {
  return `notification:${stableHash([
    workspaceId,
    eventType,
    recipientUserId,
    deliveryKey,
  ].map(normalizeJobText).join("|"))}`;
}

/**
 * @param {string} value
 */
function stableHash(value) {
  return createHash("sha256").update(String(value || "")).digest("hex").slice(0, 48);
}

/** @param {unknown} body @param {unknown} [metadata] */
function notificationBodyWithChangedContext(body, metadata = {}) {
  const normalizedBody = String(body || "").trim();
  const changedContext = objectValue(normalizeMetadata(metadata).changed_context);
  const summary = String(changedContext.summary || "").trim();

  if (!summary) {
    return normalizedBody;
  }

  if (!normalizedBody) {
    return summary;
  }

  return `${normalizedBody} ${summary}`;
}

/** @param {LooseRecord} notification @param {LooseRecord} [options] */
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

/** @param {LooseRecord} [query] */
function normalizeNotificationListFilters(query = {}) {
  return {
    eventType: normalizeOptionalFilter(query.eventType || query.event_type),
    moduleId: normalizeOptionalFilter(query.moduleId || query.module_id || query.module),
    priority: normalizeNotificationPriorityFilter(query.priority),
    status: normalizeNotificationStatus(query.status),
  };
}

/** @param {unknown} value */
function normalizeNotificationStatus(value) {
  const status = String(value || "").trim();
  return ["active", "unread", "read", "dismissed", "archived"].includes(status) ? status : "";
}

/** @param {unknown} value */
function normalizeOptionalFilter(value) {
  return String(value || "").trim().slice(0, 120);
}

/** @param {unknown} value */
function normalizeNotificationPriorityFilter(value) {
  const priority = String(value || "").trim();
  return ["low", "normal", "high", "urgent"].includes(priority) ? priority : "";
}

/** @param {LooseRecord} notification */
function eventDeclarationLabel(notification) {
  const eventType = notification.event_type || notification.eventType || "";
  const moduleId = notification.module_id || notification.moduleId || "";
  const declaration = modulesService.listNotificationEvents().find((event) => (
    event.id === eventType && (!moduleId || event.moduleId === moduleId)
  ));

  return String(declaration?.label || "").trim();
}

/** @param {unknown} eventType */
function fallbackEventLabel(eventType) {
  return String(eventType || "Notification")
    .split(".")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).replaceAll("_", " "))
    .join(" ") || "Notification";
}

/**
 * @param {string} workspaceId
 */
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

/** @param {unknown} items @param {Set<string>} allowedEventIds */
function normalizePreferenceList(items, allowedEventIds) {
  return /** @type {LooseRecord[]} */ (Array.isArray(items) ? items : [])
    .map((item) => ({
      enabled: item.enabled !== false && item.userEnabled !== false,
      event_type: item.event_type || item.eventType || item.id,
    }))
    .filter((item) => allowedEventIds.has(normalizeJobText(item.event_type)));
}

/** @param {unknown} items @param {Set<string>} allowedEventIds */
function normalizeWorkspaceDefaultList(items, allowedEventIds) {
  return /** @type {LooseRecord[]} */ (Array.isArray(items) ? items : [])
    .map((item) => ({
      enabled: item.enabled !== false && item.workspaceEnabled !== false,
      event_type: item.event_type || item.eventType || item.id,
      priority: normalizePriority(item.priority || item.workspacePriority),
    }))
    .filter((item) => allowedEventIds.has(normalizeJobText(item.event_type)));
}

/** @param {unknown} [source] */
function normalizeDisplayPreferences(source = null) {
  if (!source || typeof source !== "object") {
    return null;
  }

  return {
    grouping_mode: normalizeGroupingMode(/** @type {LooseRecord} */ (source).grouping_mode || /** @type {LooseRecord} */ (source).groupingMode),
  };
}

/** @param {NotificationDisplayPreferenceValue|null} [preferences] */
function shapeUserDisplayPreferences(preferences = null) {
  return {
    groupingMode: normalizeGroupingMode(preferences?.groupingMode),
  };
}

/**
 * @param {unknown} value
 */
function normalizeGroupingMode(value) {
  const mode = normalizeJobText(value);
  return ["client_project", "notification_type", "record_type"].includes(mode) ? mode : "client_project";
}

/** @param {NotificationUserPreferenceRow} row */
function notificationPreferenceAuditValue(row) {
  return {
    enabled: Number(row.enabled) === 1,
    event_type: row.event_type,
  };
}

/** @param {NotificationWorkspaceDefaultRow} row */
function notificationWorkspaceDefaultAuditValue(row) {
  return {
    enabled: Number(row.enabled) === 1,
    event_type: row.event_type,
    priority: row.priority || "normal",
  };
}

/** @param {unknown} value @returns {LooseRecord} */
function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? /** @type {LooseRecord} */ (value)
    : {};
}

const notificationsServiceInternal = {
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
  removeTargetArtifacts,
  resetEventHandlersForTests,
  savePreferences,
  saveWorkspaceDefaults,
  subscriptionStatus,
  unfollowTarget,
  queueNotificationEvent,
  unreadCount,
};

export const notificationsService = notificationsServiceInternal;

export {
  NOTIFICATION_EVENT_JOB_TYPE,
  handleNotificationEventJob,
  queueNotificationEvent,
  registerNotificationJobHandlers,
};
