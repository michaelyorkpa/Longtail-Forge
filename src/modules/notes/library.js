const NOTE_LIBRARY_BUCKETS = Object.freeze({
  ACTIVE_WORK: "active_work",
  ONGOING_AREA: "ongoing_area",
  REFERENCE: "reference",
});

const NOTE_LIBRARY_BUCKET_LABELS = Object.freeze({
  [NOTE_LIBRARY_BUCKETS.ACTIVE_WORK]: "Active Work",
  [NOTE_LIBRARY_BUCKETS.ONGOING_AREA]: "Ongoing Areas",
  [NOTE_LIBRARY_BUCKETS.REFERENCE]: "Reference Library",
});

const NOTE_LIBRARY_BUCKET_SOURCES = Object.freeze({
  DERIVED: "derived",
  MANUAL: "manual",
  IMPORTED: "imported",
});

const NOTE_STATUSES = Object.freeze({
  ACTIVE: "active",
  PINNED: "pinned",
  ARCHIVED: "archived",
  DELETED: "deleted",
});

const NOTE_VISIBILITIES = Object.freeze({
  INTERNAL: "internal",
  PRIVATE: "private",
  WORKSPACE: "workspace",
  CLIENT_VISIBLE: "client_visible",
  PUBLIC: "public",
});

const NOTE_SECURITY_MODES = Object.freeze({
  NORMAL: "normal",
  SECURE: "secure",
});

const NOTE_TYPES = Object.freeze({
  GENERAL: "general",
  MEETING: "meeting",
  RESEARCH: "research",
  DECISION: "decision",
  PROCEDURE: "procedure",
  REFERENCE: "reference",
  IDEA: "idea",
  LOG: "log",
});

const LEGACY_NOTE_TYPES = Object.freeze({
  CLIENT: "client",
  PROJECT: "project",
  TASK: "task",
  TICKET: "ticket",
  USER: "user",
});

const NOTE_TYPE_LABELS = Object.freeze({
  [NOTE_TYPES.GENERAL]: "General",
  [NOTE_TYPES.MEETING]: "Meeting",
  [NOTE_TYPES.RESEARCH]: "Research",
  [NOTE_TYPES.DECISION]: "Decision",
  [NOTE_TYPES.PROCEDURE]: "Procedure",
  [NOTE_TYPES.REFERENCE]: "Reference",
  [NOTE_TYPES.IDEA]: "Idea",
  [NOTE_TYPES.LOG]: "Log",
  [LEGACY_NOTE_TYPES.CLIENT]: "Legacy client",
  [LEGACY_NOTE_TYPES.PROJECT]: "Legacy project",
  [LEGACY_NOTE_TYPES.TASK]: "Legacy task",
  [LEGACY_NOTE_TYPES.TICKET]: "Legacy ticket",
  [LEGACY_NOTE_TYPES.USER]: "Legacy user",
});

function deriveSuggestedLibraryBucket(linkContext = {}) {
  const links = normalizeLinkContext(linkContext);
  const hasTaskOrTicket = links.tasks.length > 0 || links.tickets.length > 0;

  if (hasTaskOrTicket && links.projects.length <= 1 && !hasMultipleClientContexts(links)) {
    return NOTE_LIBRARY_BUCKETS.ACTIVE_WORK;
  }

  if ((links.clients.length === 1 || links.projects.length === 1 || links.users.length === 1) && !hasTaskOrTicket) {
    return NOTE_LIBRARY_BUCKETS.ONGOING_AREA;
  }

  if (links.projects.length > 1 && hasOneKnownClientContext(links)) {
    return NOTE_LIBRARY_BUCKETS.ONGOING_AREA;
  }

  return NOTE_LIBRARY_BUCKETS.REFERENCE;
}

function normalizeLinkContext(linkContext = {}) {
  const links = Array.isArray(linkContext)
    ? linkContext
    : linkContext.links || linkContext.linkedRecords || [];

  const normalized = {
    clients: new Set(normalizeIds(linkContext.clientIds || linkContext.client_ids)),
    projects: new Map(),
    tasks: new Set(normalizeIds(linkContext.taskIds || linkContext.task_ids)),
    tickets: new Set(normalizeIds(linkContext.ticketIds || linkContext.ticket_ids)),
    users: new Set(normalizeIds(linkContext.userIds || linkContext.user_ids || linkContext.linkedUserIds || linkContext.linked_user_ids)),
  };

  for (const link of links) {
    const targetType = String(link.targetType || link.target_type || "").trim();
    const targetId = String(link.targetId || link.target_id || "").trim();
    const clientId = String(link.clientId || link.client_id || "").trim();

    if (!targetId) {
      continue;
    }

    if (targetType === "client") {
      normalized.clients.add(targetId);
    } else if (targetType === "project") {
      normalized.projects.set(targetId, clientId || "");
    } else if (targetType === "task") {
      normalized.tasks.add(targetId);
    } else if (targetType === "ticket") {
      normalized.tickets.add(targetId);
    } else if (targetType === "user") {
      normalized.users.add(targetId);
    }
  }

  for (const project of normalizeIds(linkContext.projectIds || linkContext.project_ids)) {
    normalized.projects.set(project, "");
  }

  return {
    clients: [...normalized.clients],
    projects: [...normalized.projects].map(([projectId, clientId]) => ({ projectId, clientId })),
    tasks: [...normalized.tasks],
    tickets: [...normalized.tickets],
    users: [...normalized.users],
  };
}

function normalizeIds(value) {
  if (!value) {
    return [];
  }

  return (Array.isArray(value) ? value : [value])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function hasMultipleClientContexts(links) {
  return collectKnownClientIds(links).size > 1 || links.clients.length > 1;
}

function hasOneKnownClientContext(links) {
  const clientIds = collectKnownClientIds(links);

  return clientIds.size === 1 || (clientIds.size === 0 && links.clients.length === 1);
}

function collectKnownClientIds(links) {
  return new Set([
    ...links.clients,
    ...links.projects.map((project) => project.clientId).filter(Boolean),
  ]);
}

export {
  NOTE_LIBRARY_BUCKET_LABELS,
  NOTE_LIBRARY_BUCKET_SOURCES,
  NOTE_LIBRARY_BUCKETS,
  NOTE_SECURITY_MODES,
  NOTE_STATUSES,
  LEGACY_NOTE_TYPES,
  NOTE_TYPE_LABELS,
  NOTE_TYPES,
  NOTE_VISIBILITIES,
  deriveSuggestedLibraryBucket,
};
