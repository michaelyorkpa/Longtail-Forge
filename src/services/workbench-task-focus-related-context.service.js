import { modulesService } from "../core/modules/modules.service.js";
import { AppError } from "../core/errors.js";
import { listsService } from "../modules/lists/lists.service.js";
import { notesService } from "../modules/notes/notes.service.js";
import { tasksService } from "../modules/tasks/tasks.service.js";
import { filesService } from "./files.service.js";
import { tagsService } from "./tags.service.js";

/** @typedef {import("../types/http-contracts.js").WorkspaceRequestSession} WorkspaceRequestSession */
/** @typedef {Record<string, unknown>} LooseRecord */
/** @typedef {{type: string, moduleActionId: string, params: LooseRecord, fallbackUrl: string}} RelatedAction */
/** @typedef {LooseRecord & {reason: string, moduleId: string, recordType: string, recordId: unknown, title: string, action?: RelatedAction, rank?: number, sourceOrder?: number}} RelatedItem */
/** @typedef {Map<string, RelatedItem>} RelatedCollection */

const GROUP_LIMIT = 6;
const SHARED_TAG_SCAN_LIMIT = 200;

const GROUP_DEFINITIONS = Object.freeze([
  { id: "linked-notes", label: "Linked notes", reason: "linked_note", reasonLabel: "Linked note", rank: 10 },
  { id: "task-files", label: "Task files", reason: "task_file", reasonLabel: "Task file", rank: 20 },
  { id: "linked-lists", label: "Linked lists", reason: "linked_list", reasonLabel: "Linked list", rank: 30 },
  { id: "same-project-tasks", label: "Same project tasks", reason: "same_project_task", reasonLabel: "Same project", rank: 40 },
  { id: "shared-direct-tags", label: "Shared direct tags", reason: "shared_direct_tag", reasonLabel: "Shared direct tag", rank: 50 },
]);

const GROUP_BY_REASON = new Map(GROUP_DEFINITIONS.map((group) => [group.reason, group]));

/** @param {WorkspaceRequestSession} session @param {unknown} taskId */
async function readTaskFocusRelatedContext(session, taskId) {
  const selectedTaskId = normalizeId(taskId);
  if (!selectedTaskId) {
    throw new AppError("Task ID is required.", 400);
  }

  const selectedTask = await readSelectedTask(session, selectedTaskId);
  const selectedTaskTags = await readSelectedTaskDirectTags(session, selectedTask);
  const selectedTagIds = selectedTaskTags.map((tag) => safeText(tag.tag_id)).filter(Boolean);
  /** @type {RelatedCollection} */
  const collection = new Map();

  await addLinkedNotes(collection, session, selectedTask);
  await addTaskFiles(collection, session, selectedTask);
  await addLinkedLists(collection, session, selectedTask);
  await addSameProjectTasks(collection, session, selectedTask);
  await addSharedDirectTagItems(collection, session, selectedTask, selectedTagIds);

  const items = [...collection.values()].sort(compareRelatedItems);
  const groups = GROUP_DEFINITIONS.map((group) => {
    const groupItems = items.filter((item) => item.reason === group.reason);
    const orderedGroupItems = group.reason === "same_project_task"
      ? [...groupItems].sort((left, right) => compareSameProjectTaskItems(left, right, session))
      : groupItems;
    const visibleItems = orderedGroupItems.slice(0, GROUP_LIMIT).map(stripInternalItemFields);
    return {
      id: group.id,
      label: group.label,
      reason: group.reason,
      reasonLabel: group.reasonLabel,
      count: orderedGroupItems.length,
      hasMore: orderedGroupItems.length > visibleItems.length,
      items: visibleItems,
      limit: GROUP_LIMIT,
    };
  });

  return {
    task: shapeSelectedTask(selectedTask, selectedTaskTags),
    groups,
    items: groups.flatMap((group) => group.items),
    meta: {
      directTagCount: selectedTaskTags.length,
      fileSharedTagSource: fileTaggableTargets().length > 0 ? "taggable-files-available" : "files-not-taggable",
      groupLimit: GROUP_LIMIT,
      selectedTaskId,
      sharedTagScanLimit: SHARED_TAG_SCAN_LIMIT,
    },
  };
}

/** @param {WorkspaceRequestSession} session @param {string} taskId @returns {Promise<LooseRecord>} */
async function readSelectedTask(session, taskId) {
  const result = await tasksService.read(taskId, session);
  if (!result?.task) {
    throw new AppError("Task not found", 404);
  }
  return /** @type {LooseRecord} */ (result.task);
}

/** @param {WorkspaceRequestSession} session @param {LooseRecord} task */
async function readSelectedTaskDirectTags(session, task) {
  const result = await optionalRead(() => tagsService.listAssignments(session, {
    targetId: task.task_id,
    targetType: "task",
  }), { fallback: { directTags: [] } });

  return safeTagBadges(result?.directTags || task.directTags || task.direct_tags || []);
}

/** @param {RelatedCollection} collection @param {WorkspaceRequestSession} session @param {LooseRecord} task */
async function addLinkedNotes(collection, session, task) {
  const result = await optionalRead(() => notesService.listForTarget(session, {
    moduleId: "tasks",
    targetId: task.task_id,
    targetType: "task",
  }));
  const candidates = /** @type {LooseRecord[]} */ (result?.linkedNotes || []);
  const allowedNoteIds = await readAllowedWorkbenchNoteIds(session, candidates);
  const notes = candidates.filter((note) => allowedNoteIds.has(note.note_id || note.id));

  notes.forEach((note, index) => addRelatedItem(collection, {
    moduleId: "notes",
    sourceLabel: "Notes",
    recordType: "note",
    recordId: note.note_id || note.id,
    title: safeTitle(note.label || note.title, "Untitled note"),
    contextLabel: note.security_mode === "secure" ? "Secure note" : "Linked note",
    reason: "linked_note",
    action: moduleAction("notes.view", { noteId: note.note_id || note.id }, safeText(note.sourceUrl || note.source_url) || noteUrl(note.note_id || note.id)),
    badges: safeTagBadges(note.directTags || note.direct_tags || []),
    sortValue: note.updated_at || note.updatedAt || note.created_at || note.createdAt || "",
    sourceOrder: index,
  }));
}

/** @param {RelatedCollection} collection @param {WorkspaceRequestSession} session @param {LooseRecord} task */
async function addTaskFiles(collection, session, task) {
  const result = await optionalRead(() => filesService.listAttachments(session, {
    limit: GROUP_LIMIT,
    moduleId: "tasks",
    sort: "newest",
    targetId: task.task_id,
    targetType: "task",
  }));
  const attachments = /** @type {LooseRecord[]} */ (result?.attachments || []);

  attachments.forEach((attachment, index) => addRelatedItem(collection, {
    moduleId: "framework",
    sourceLabel: "Files",
    recordType: "file_attachment",
    recordId: attachment.fileAttachmentId || attachment.file_attachment_id,
    title: safeTitle(
      objectValue(attachment.file).displayName || objectValue(attachment.file).originalFilename || attachment.file_name || attachment.filename,
      "File attachment",
    ),
    contextLabel: fileContextLabel(attachment),
    reason: "task_file",
    action: moduleAction("files.preview", { attachment: fileActionAttachment(attachment) }, "files.html"),
    badges: fileBadges(attachment),
    sortValue: attachment.createdAt || attachment.created_at || "",
    sourceOrder: index,
  }));
}

/** @param {RelatedCollection} collection @param {WorkspaceRequestSession} session @param {LooseRecord} task */
async function addLinkedLists(collection, session, task) {
  const result = await optionalRead(() => listsService.list(session, {
    moduleId: "tasks",
    status: "active",
    targetId: task.task_id,
    targetType: "task",
  }));
  const lists = /** @type {LooseRecord[]} */ (result?.lists || []);

  lists.forEach((list, index) => addRelatedItem(collection, {
    moduleId: "lists",
    sourceLabel: "Lists",
    recordType: "list",
    recordId: list.list_id || list.id,
    title: safeTitle(list.title, "Untitled list"),
    contextLabel: list.list_type_label || list.listTypeLabel || "Linked list",
    reason: "linked_list",
    action: moduleAction("lists.edit", { listId: list.list_id || list.id }, listUrl(list.list_id || list.id)),
    badges: listBadges(list),
    sortValue: list.updated_at || list.updatedAt || list.created_at || list.createdAt || "",
    sourceOrder: index,
  }));
}

/** @param {RelatedCollection} collection @param {WorkspaceRequestSession} session @param {LooseRecord} task */
async function addSameProjectTasks(collection, session, task) {
  if (!task.project_id) {
    return;
  }

  const result = await optionalRead(() => tasksService.list(session, {
    limit: SHARED_TAG_SCAN_LIMIT,
    projectId: task.project_id,
    status: "active",
  }));
  const tasks = /** @type {LooseRecord[]} */ (result?.tasks || [])
    .filter((candidate) => candidate.task_id !== task.task_id);

  tasks.forEach((candidate, index) => addRelatedItem(collection, taskRelatedItem(candidate, {
    reason: "same_project_task",
    contextLabel: "Same project",
    sourceOrder: index,
  })));
}

/** @param {RelatedCollection} collection @param {WorkspaceRequestSession} session @param {LooseRecord} task @param {string[]} selectedTagIds */
async function addSharedDirectTagItems(collection, session, task, selectedTagIds) {
  if (selectedTagIds.length === 0) {
    return;
  }

  const selectedTagSet = new Set(selectedTagIds);
  const [tasks, notes, lists] = await Promise.all([
    optionalRead(() => tasksService.list(session, { limit: SHARED_TAG_SCAN_LIMIT, status: "active" }), { fallback: { tasks: [] } }),
    optionalRead(() => notesService.list(session, { limit: SHARED_TAG_SCAN_LIMIT, status: "active" }), { fallback: { notes: [] } }),
    optionalRead(() => listsService.list(session, { status: "active" }), { fallback: { lists: [] } }),
  ]);

  /** @type {LooseRecord[]} */ (tasks?.tasks || [])
    .filter((candidate) => candidate.task_id !== task.task_id)
    .filter((candidate) => sharesDirectTag(candidate, selectedTagSet))
    .forEach((candidate, index) => addRelatedItem(collection, taskRelatedItem(candidate, {
      matchedTagIds: matchedDirectTagIds(candidate, selectedTagSet),
      reason: "shared_direct_tag",
      contextLabel: "Shared direct tag",
      sourceOrder: index,
    })));

  const noteCandidates = /** @type {LooseRecord[]} */ (notes?.notes || []);
  const allowedNoteIds = await readAllowedWorkbenchNoteIds(session, noteCandidates);
  noteCandidates
    .filter((note) => allowedNoteIds.has(note.note_id || note.id))
    .filter((note) => sharesDirectTag(note, selectedTagSet))
    .forEach((note, index) => addRelatedItem(collection, {
      moduleId: "notes",
      sourceLabel: "Notes",
      recordType: "note",
      recordId: note.note_id || note.id,
      title: safeTitle(note.title, "Untitled note"),
      contextLabel: note.security_mode === "secure" ? "Secure note" : "Shared direct tag",
      reason: "shared_direct_tag",
      action: moduleAction("notes.view", { noteId: note.note_id || note.id }, noteUrl(note.note_id || note.id)),
      badges: safeTagBadges(matchedDirectTags(note, selectedTagSet)),
      matchedTagIds: matchedDirectTagIds(note, selectedTagSet),
      sortValue: note.updated_at || note.updatedAt || note.created_at || note.createdAt || "",
      sourceOrder: index,
    }));

  /** @type {LooseRecord[]} */ (lists?.lists || [])
    .filter((list) => sharesDirectTag(list, selectedTagSet))
    .forEach((list, index) => addRelatedItem(collection, {
      moduleId: "lists",
      sourceLabel: "Lists",
      recordType: "list",
      recordId: list.list_id || list.id,
      title: safeTitle(list.title, "Untitled list"),
      contextLabel: "Shared direct tag",
      reason: "shared_direct_tag",
      action: moduleAction("lists.edit", { listId: list.list_id || list.id }, listUrl(list.list_id || list.id)),
      badges: safeTagBadges(matchedDirectTags(list, selectedTagSet)),
      matchedTagIds: matchedDirectTagIds(list, selectedTagSet),
      sortValue: list.updated_at || list.updatedAt || list.created_at || list.createdAt || "",
      sourceOrder: index,
    }));
}

/** @param {WorkspaceRequestSession} session @param {LooseRecord[]} [notes] */
async function readAllowedWorkbenchNoteIds(session, notes = []) {
  const noteIds = notes.map((note) => safeText(note.note_id || note.id)).filter(Boolean);
  if (noteIds.length === 0) {
    return new Set();
  }
  const allowed = await notesService.listConsumerSummaries(session, {
    consumerId: "notes.workbench",
    noteIds,
  });
  return new Set(allowed.map((note) => note.note_id));
}

/** @param {LooseRecord} task @param {LooseRecord} [options] @returns {RelatedItem} */
function taskRelatedItem(task, options = {}) {
  const matchedTagIds = Array.isArray(options.matchedTagIds)
    ? options.matchedTagIds.map(safeText).filter(Boolean)
    : [];
  return {
    moduleId: "tasks",
    sourceLabel: "Tasks",
    recordType: "task",
    recordId: task.task_id,
    title: safeTitle(task.title, "Untitled task"),
    contextLabel: options.contextLabel || "Task",
    reason: safeText(options.reason),
    action: moduleAction("tasks.edit", { taskId: task.task_id }, taskUrl(task.task_id)),
    badges: taskBadges(task, matchedTagIds),
    matchedTagIds,
    dueAt: task.due_at || task.due_at_utc || task.due_date || "",
    dueAtUtc: task.due_at_utc || "",
    dueDate: task.due_date || "",
    dueTime: task.due_time || "",
    priority: task.priority || "",
    status: task.status || "",
    sortValue: task.due_at || task.due_at_utc || task.due_date || task.updated_at || task.created_at || "",
    updatedAt: task.updated_at || task.created_at || "",
    sourceOrder: Number(options.sourceOrder) || 0,
  };
}

/** @param {RelatedCollection} collection @param {RelatedItem} item */
function addRelatedItem(collection, item) {
  const group = GROUP_BY_REASON.get(item.reason);
  if (!group || !item.recordId || !item.title) {
    return;
  }

  const key = `${item.moduleId}:${item.recordType}:${item.recordId}`;
  const next = {
    ...item,
    id: key,
    rank: group.rank,
    reasonLabel: group.reasonLabel,
  };
  const existing = collection.get(key);

  if (!existing || next.rank < Number(existing.rank || 0)) {
    collection.set(key, next);
  }
}

/** @param {RelatedItem} item */
function stripInternalItemFields(item) {
  const {
    dueAt: _dueAt,
    dueAtUtc: _dueAtUtc,
    dueDate: _dueDate,
    dueTime: _dueTime,
    priority: _priority,
    rank: _rank,
    sortValue: _sortValue,
    sourceOrder: _sourceOrder,
    status: _status,
    updatedAt: _updatedAt,
    ...publicItem
  } = item;
  return publicItem;
}

/** @param {RelatedItem} left @param {RelatedItem} right */
function compareRelatedItems(left, right) {
  return Number(left.rank || 0) - Number(right.rank || 0) ||
    String(right.sortValue || "").localeCompare(String(left.sortValue || "")) ||
    String(left.title || "").localeCompare(String(right.title || ""), undefined, { sensitivity: "base" }) ||
    String(left.recordId || "").localeCompare(String(right.recordId || ""));
}

/** @param {RelatedItem} left @param {RelatedItem} right @param {WorkspaceRequestSession} session */
function compareSameProjectTaskItems(left, right, session) {
  if (left.reason !== "same_project_task" || right.reason !== "same_project_task") {
    return 0;
  }

  const today = localDateKey(new Date(), session.timezone);
  const leftBucket = sameProjectDueBucket(left, today);
  const rightBucket = sameProjectDueBucket(right, today);

  return leftBucket - rightBucket ||
    compareSameProjectDueAt(left, right, leftBucket) ||
    priorityRank(right.priority) - priorityRank(left.priority) ||
    statusRank(left.status) - statusRank(right.status) ||
    String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")) ||
    String(left.title || "").localeCompare(String(right.title || ""), undefined, { sensitivity: "base" }) ||
    String(left.recordId || "").localeCompare(String(right.recordId || ""));
}

/** @param {RelatedItem} item @param {string} today */
function sameProjectDueBucket(item, today) {
  const dueDateValue = parseDateKey(item.dueDate);
  const todayValue = parseDateKey(today);

  if (Number.isNaN(dueDateValue) || Number.isNaN(todayValue)) {
    return 2;
  }

  return dueDateValue <= todayValue ? 0 : 1;
}

/** @param {RelatedItem} left @param {RelatedItem} right @param {number} bucket */
function compareSameProjectDueAt(left, right, bucket) {
  if (bucket === 0) {
    return String(right.dueAtUtc || sameProjectDueSortValue(right))
      .localeCompare(String(left.dueAtUtc || sameProjectDueSortValue(left)));
  }

  if (bucket === 1) {
    return String(left.dueAtUtc || sameProjectDueSortValue(left))
      .localeCompare(String(right.dueAtUtc || sameProjectDueSortValue(right)));
  }

  return 0;
}

/** @param {RelatedItem} item */
function sameProjectDueSortValue(item) {
  if (item.dueAtUtc) {
    return item.dueAtUtc;
  }

  return `${item.dueDate || "9999-12-31"}T${item.dueTime || "23:59"}:00`;
}

/** @template T,F @param {() => Promise<T>} read @param {{fallback?: F}} [options] @returns {Promise<T|F|null>} */
async function optionalRead(read, options = {}) {
  try {
    return await read();
  } catch (error) {
    const details = objectValue(error);
    if ([403, 404].includes(Number(details.status || details.statusCode))) {
      return options.fallback || null;
    }
    throw error;
  }
}

/** @param {LooseRecord} task @param {unknown} directTags */
function shapeSelectedTask(task, directTags) {
  return {
    taskId: task.task_id,
    task_id: task.task_id,
    title: safeTitle(task.title, "Untitled task"),
    status: task.status || "",
    projectId: task.project_id || "",
    project_id: task.project_id || "",
    projectName: task.project_name || "",
    project_name: task.project_name || "",
    clientId: task.client_id || "",
    client_id: task.client_id || "",
    clientName: task.client_name || "",
    client_name: task.client_name || "",
    directTags: safeTagBadges(directTags),
    direct_tags: safeTagBadges(directTags),
  };
}

/**
 * @param {string} moduleActionId
 */
/** @param {string} moduleActionId @param {LooseRecord} [params] @param {string} [fallbackUrl] @returns {RelatedAction} */
function moduleAction(moduleActionId, params = {}, fallbackUrl = "") {
  return {
    type: "module-action",
    moduleActionId,
    params,
    fallbackUrl,
  };
}

/** @param {LooseRecord} task @param {string[]} [matchedTagIds] */
function taskBadges(task, matchedTagIds = []) {
  const badges = [];
  if (task.status) {
    badges.push({ type: "status", label: formatToken(task.status) });
  }
  if (task.priority) {
    badges.push({ type: "priority", label: formatToken(task.priority) });
  }
  badges.push(...safeTagBadges(
    matchedTagIds.length > 0
      ? matchedDirectTags(task, new Set(matchedTagIds))
      : task.directTags || task.direct_tags || [],
  ));
  return badges.slice(0, 4);
}

/** @param {LooseRecord} list */
function listBadges(list) {
  const badges = [];
  if (list.status) {
    badges.push({ type: "status", label: formatToken(list.status) });
  }
  if (list.list_type || list.listType) {
    badges.push({ type: "list-type", label: formatToken(list.list_type || list.listType) });
  }
  badges.push(...safeTagBadges(list.directTags || list.direct_tags || []));
  return badges.slice(0, 4);
}

/** @param {LooseRecord} attachment */
function fileBadges(attachment) {
  const file = objectValue(attachment.file);
  return [
    file.extension ? { type: "file-type", label: String(file.extension).replace(/^\./, "").toUpperCase() } : null,
    file.status ? { type: "file-status", label: formatToken(file.status) } : null,
  ].filter(Boolean);
}

/** @param {LooseRecord} attachment */
function fileContextLabel(attachment) {
  const file = objectValue(attachment.file);
  const type = file.extension ? String(file.extension).replace(/^\./, "").toUpperCase() : "";
  return type ? `${type} attachment` : "Task file";
}

/** @param {LooseRecord} attachment */
function fileActionAttachment(attachment) {
  const file = objectValue(attachment.file);
  return {
    fileAttachmentId: attachment.fileAttachmentId || attachment.file_attachment_id || "",
    file_attachment_id: attachment.fileAttachmentId || attachment.file_attachment_id || "",
    fileId: attachment.fileId || attachment.file_id || "",
    file_id: attachment.fileId || attachment.file_id || "",
    file: {
      displayName: file.displayName || "",
      extension: file.extension || "",
      originalFilename: file.originalFilename || "",
      scanStatus: file.scanStatus || "",
      status: file.status || "",
    },
    fileName: file.displayName || file.originalFilename || "File attachment",
    moduleId: attachment.moduleId || attachment.module_id || "",
    targetId: attachment.targetId || attachment.target_id || "",
    targetType: attachment.targetType || attachment.target_type || "",
  };
}

/** @param {LooseRecord} record @param {Set<string>} tagSet */
function sharesDirectTag(record, tagSet) {
  return matchedDirectTagIds(record, tagSet).length > 0;
}

/** @param {LooseRecord} record @param {Set<string>} tagSet @returns {LooseRecord[]} */
function matchedDirectTags(record, tagSet) {
  const tags = /** @type {LooseRecord[]} */ (Array.isArray(record.directTags)
    ? record.directTags
    : Array.isArray(record.direct_tags) ? record.direct_tags : []);
  return tags.filter((tag) => tagSet.has(safeText(tag.tag_id)));
}

/** @param {LooseRecord} record @param {Set<string>} tagSet */
function matchedDirectTagIds(record, tagSet) {
  return matchedDirectTags(record, tagSet).map((tag) => safeText(tag.tag_id)).filter(Boolean);
}

/** @param {unknown} [tags] */
function safeTagBadges(tags = []) {
  return /** @type {LooseRecord[]} */ (Array.isArray(tags) ? tags : [])
    .map((tag) => ({
      color: safeText(tag.color),
      label: safeTitle(tag.name || tag.slug, "Tag"),
      slug: safeText(tag.slug),
      tagId: safeText(tag.tag_id),
      tag_id: safeText(tag.tag_id),
      type: "tag",
    }))
    .filter((tag) => tag.tagId && tag.label);
}

function fileTaggableTargets() {
  return /** @type {import("../types/framework-contracts.js").TaggableTypeContribution[]} */ (modulesService.listTaggableTypes())
    .filter((type) => ["file", "file_attachment"].includes(String(type.targetType || "")));
}

/** @param {unknown} value */
function normalizeId(value) {
  return String(value || "").trim();
}

/** @param {unknown} value */
function safeText(value) {
  return String(value || "").trim();
}

/** @param {unknown} value @param {string} fallback */
function safeTitle(value, fallback) {
  return safeText(value) || fallback;
}

/** @param {unknown} value */
function formatToken(value) {
  return safeText(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * @param {unknown} priority
 */
function priorityRank(priority) {
  return {
    urgent: 4,
    high: 3,
    normal: 2,
    low: 1,
  }[safeText(priority)] || 0;
}

/**
 * @param {unknown} status
 */
function statusRank(status) {
  return {
    blocked: 1,
    in_progress: 2,
    open: 3,
    complete: 4,
    archived: 5,
  }[safeText(status)] || 99;
}

/**
 * @param {number | Date | undefined} date
 */
function localDateKey(date, timezone = "America/New_York") {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** @param {unknown} dateKey */
function parseDateKey(dateKey) {
  const match = safeText(dateKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return Number.NaN;
  }

  return Date.UTC(
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10) - 1,
    Number.parseInt(match[3], 10),
  );
}

/** @param {unknown} taskId */
function taskUrl(taskId) {
  return `tasks.html?task=${encodeURIComponent(safeText(taskId))}`;
}

/** @param {unknown} noteId */
function noteUrl(noteId) {
  return `notes.html?note=${encodeURIComponent(safeText(noteId))}`;
}

/** @param {unknown} listId */
function listUrl(listId) {
  return `lists.html?list=${encodeURIComponent(safeText(listId))}`;
}

/** @param {unknown} value @returns {LooseRecord} */
function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? /** @type {LooseRecord} */ (value)
    : {};
}

export const workbenchTaskFocusRelatedContextService = {
  readTaskFocusRelatedContext,
};
