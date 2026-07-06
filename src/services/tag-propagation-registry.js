import { db } from "../core/database.js";

const resolvers = new Map();

function registerTagPropagationResolver(resolverId, resolver) {
  const normalizedResolverId = normalizeResolverId(resolverId);

  if (typeof resolver !== "function") {
    throw new TypeError(`Tag propagation resolver '${normalizedResolverId}' must be a function.`);
  }

  resolvers.set(normalizedResolverId, resolver);
  return normalizedResolverId;
}

function readTagPropagationResolver(resolverId) {
  return resolvers.get(normalizeResolverId(resolverId)) || null;
}

function listTagPropagationResolverIds() {
  return [...resolvers.keys()].sort();
}

function resetTagPropagationResolvers() {
  resolvers.clear();
  registerBuiltInResolvers();
}

function normalizeResolverId(resolverId) {
  const normalizedResolverId = String(resolverId || "").trim();

  if (!normalizedResolverId) {
    throw new TypeError("Tag propagation resolver ID is required.");
  }

  return normalizedResolverId;
}

function registerBuiltInResolvers() {
  registerTagPropagationResolver("tag-propagation.noop", async () => []);
  registerTagPropagationResolver("client-projects.client-children", resolveClientChildren);
  registerTagPropagationResolver("client-projects.client-projects", resolveClientProjects);
  registerTagPropagationResolver("client-projects.project-children", resolveProjectChildren);
  registerTagPropagationResolver("tasks.project-tasks", resolveProjectTasks);
  registerTagPropagationResolver("notes.client-notes", resolveClientNotes);
  registerTagPropagationResolver("notes.project-notes", resolveProjectNotes);
}

async function resolveClientChildren(context = {}) {
  if (context.sourceTargetId) {
    return mapRows(await db.query(`
SELECT parent_client_id AS source_target_id, id AS target_id
FROM clients
WHERE workspace_id = :workspaceId
  AND parent_client_id = :sourceTargetId;
`, {
      sourceTargetId: text(context.sourceTargetId),
      workspaceId: text(context.workspaceId),
    }), "client", "client");
  }

  if (context.targetId) {
    return mapRows(await db.query(`
SELECT parent_client_id AS source_target_id, id AS target_id
FROM clients
WHERE workspace_id = :workspaceId
  AND id = :targetId
  AND parent_client_id IS NOT NULL
  AND parent_client_id != '';
`, {
      targetId: text(context.targetId),
      workspaceId: text(context.workspaceId),
    }), "client", "client");
  }

  return mapRows(await db.query(`
SELECT parent_client_id AS source_target_id, id AS target_id
FROM clients
WHERE workspace_id = :workspaceId
  AND parent_client_id IS NOT NULL
  AND parent_client_id != '';
`, {
    workspaceId: text(context.workspaceId),
  }), "client", "client");
}

async function resolveClientProjects(context = {}) {
  if (context.sourceTargetId) {
    return mapRows(await db.query(`
SELECT client_id AS source_target_id, id AS target_id
FROM projects
WHERE workspace_id = :workspaceId
  AND client_id = :sourceTargetId;
`, {
      sourceTargetId: text(context.sourceTargetId),
      workspaceId: text(context.workspaceId),
    }), "client", "project");
  }

  if (context.targetId) {
    return mapRows(await db.query(`
SELECT client_id AS source_target_id, id AS target_id
FROM projects
WHERE workspace_id = :workspaceId
  AND id = :targetId
  AND client_id IS NOT NULL
  AND client_id != '';
`, {
      targetId: text(context.targetId),
      workspaceId: text(context.workspaceId),
    }), "client", "project");
  }

  return mapRows(await db.query(`
SELECT client_id AS source_target_id, id AS target_id
FROM projects
WHERE workspace_id = :workspaceId
  AND client_id IS NOT NULL
  AND client_id != '';
`, {
    workspaceId: text(context.workspaceId),
  }), "client", "project");
}

async function resolveProjectChildren(context = {}) {
  if (context.sourceTargetId) {
    return mapRows(await db.query(`
SELECT parent_project_id AS source_target_id, id AS target_id
FROM projects
WHERE workspace_id = :workspaceId
  AND parent_project_id = :sourceTargetId;
`, {
      sourceTargetId: text(context.sourceTargetId),
      workspaceId: text(context.workspaceId),
    }), "project", "project");
  }

  if (context.targetId) {
    return mapRows(await db.query(`
SELECT parent_project_id AS source_target_id, id AS target_id
FROM projects
WHERE workspace_id = :workspaceId
  AND id = :targetId
  AND parent_project_id IS NOT NULL
  AND parent_project_id != '';
`, {
      targetId: text(context.targetId),
      workspaceId: text(context.workspaceId),
    }), "project", "project");
  }

  return mapRows(await db.query(`
SELECT parent_project_id AS source_target_id, id AS target_id
FROM projects
WHERE workspace_id = :workspaceId
  AND parent_project_id IS NOT NULL
  AND parent_project_id != '';
`, {
    workspaceId: text(context.workspaceId),
  }), "project", "project");
}

async function resolveProjectTasks(context = {}) {
  if (context.sourceTargetId) {
    return mapRows(await db.query(`
SELECT project_id AS source_target_id, task_id AS target_id
FROM tasks
WHERE workspace_id = :workspaceId
  AND project_id = :sourceTargetId;
`, {
      sourceTargetId: text(context.sourceTargetId),
      workspaceId: text(context.workspaceId),
    }), "project", "task");
  }

  if (context.targetId) {
    return mapRows(await db.query(`
SELECT project_id AS source_target_id, task_id AS target_id
FROM tasks
WHERE workspace_id = :workspaceId
  AND task_id = :targetId
  AND project_id IS NOT NULL
  AND project_id != '';
`, {
      targetId: text(context.targetId),
      workspaceId: text(context.workspaceId),
    }), "project", "task");
  }

  return mapRows(await db.query(`
SELECT project_id AS source_target_id, task_id AS target_id
FROM tasks
WHERE workspace_id = :workspaceId
  AND project_id IS NOT NULL
  AND project_id != '';
`, {
    workspaceId: text(context.workspaceId),
  }), "project", "task");
}

async function resolveClientNotes(context = {}) {
  return resolveNoteContext(context, "client", "client_id");
}

async function resolveProjectNotes(context = {}) {
  return resolveNoteContext(context, "project", "project_id");
}

async function resolveNoteContext(context = {}, sourceTargetType, noteColumn) {
  if (context.sourceTargetId) {
    return mapRows(await db.query(`
SELECT ${noteColumn} AS source_target_id, note_id AS target_id
FROM notes
WHERE workspace_id = :workspaceId
  AND ${noteColumn} = :sourceTargetId
  AND status != 'deleted'
UNION
SELECT target_id AS source_target_id, note_id AS target_id
FROM note_links
WHERE workspace_id = :workspaceId
  AND module_id = :moduleId
  AND target_type = :sourceTargetType
  AND target_id = :sourceTargetId
  AND removed_at IS NULL;
`, {
      moduleId: "client-projects",
      sourceTargetId: text(context.sourceTargetId),
      sourceTargetType,
      workspaceId: text(context.workspaceId),
    }), sourceTargetType, "note");
  }

  if (context.targetId) {
    return mapRows(await db.query(`
SELECT ${noteColumn} AS source_target_id, note_id AS target_id
FROM notes
WHERE workspace_id = :workspaceId
  AND note_id = :targetId
  AND ${noteColumn} IS NOT NULL
  AND ${noteColumn} != ''
  AND status != 'deleted'
UNION
SELECT target_id AS source_target_id, note_id AS target_id
FROM note_links
WHERE workspace_id = :workspaceId
  AND note_id = :targetId
  AND module_id = :moduleId
  AND target_type = :sourceTargetType
  AND target_id IS NOT NULL
  AND target_id != ''
  AND removed_at IS NULL;
`, {
      moduleId: "client-projects",
      sourceTargetType,
      targetId: text(context.targetId),
      workspaceId: text(context.workspaceId),
    }), sourceTargetType, "note");
  }

  return mapRows(await db.query(`
SELECT ${noteColumn} AS source_target_id, note_id AS target_id
FROM notes
WHERE workspace_id = :workspaceId
  AND ${noteColumn} IS NOT NULL
  AND ${noteColumn} != ''
  AND status != 'deleted'
UNION
SELECT target_id AS source_target_id, note_id AS target_id
FROM note_links
WHERE workspace_id = :workspaceId
  AND module_id = :moduleId
  AND target_type = :sourceTargetType
  AND target_id IS NOT NULL
  AND target_id != ''
  AND removed_at IS NULL;
`, {
    moduleId: "client-projects",
    sourceTargetType,
    workspaceId: text(context.workspaceId),
  }), sourceTargetType, "note");
}

function mapRows(rows, sourceTargetType, targetType) {
  return rows
    .map((row) => ({
      sourceTargetId: String(row.source_target_id || "").trim(),
      sourceTargetType,
      targetId: String(row.target_id || "").trim(),
      targetType,
    }))
    .filter((row) => row.sourceTargetId && row.targetId);
}

function text(value) {
  return String(value ?? "");
}

registerBuiltInResolvers();

export {
  listTagPropagationResolverIds,
  readTagPropagationResolver,
  registerTagPropagationResolver,
  resetTagPropagationResolvers,
};
