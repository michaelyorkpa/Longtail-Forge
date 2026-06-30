import { querySql, sqlText } from "../core/database.js";

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
    return mapRows(await querySql(`
SELECT parent_client_id AS source_target_id, id AS target_id
FROM clients
WHERE workspace_id = ${sqlText(context.workspaceId)}
  AND parent_client_id = ${sqlText(context.sourceTargetId)};
`), "client", "client");
  }

  if (context.targetId) {
    return mapRows(await querySql(`
SELECT parent_client_id AS source_target_id, id AS target_id
FROM clients
WHERE workspace_id = ${sqlText(context.workspaceId)}
  AND id = ${sqlText(context.targetId)}
  AND parent_client_id IS NOT NULL
  AND parent_client_id != '';
`), "client", "client");
  }

  return mapRows(await querySql(`
SELECT parent_client_id AS source_target_id, id AS target_id
FROM clients
WHERE workspace_id = ${sqlText(context.workspaceId)}
  AND parent_client_id IS NOT NULL
  AND parent_client_id != '';
`), "client", "client");
}

async function resolveClientProjects(context = {}) {
  if (context.sourceTargetId) {
    return mapRows(await querySql(`
SELECT client_id AS source_target_id, id AS target_id
FROM projects
WHERE workspace_id = ${sqlText(context.workspaceId)}
  AND client_id = ${sqlText(context.sourceTargetId)};
`), "client", "project");
  }

  if (context.targetId) {
    return mapRows(await querySql(`
SELECT client_id AS source_target_id, id AS target_id
FROM projects
WHERE workspace_id = ${sqlText(context.workspaceId)}
  AND id = ${sqlText(context.targetId)}
  AND client_id IS NOT NULL
  AND client_id != '';
`), "client", "project");
  }

  return mapRows(await querySql(`
SELECT client_id AS source_target_id, id AS target_id
FROM projects
WHERE workspace_id = ${sqlText(context.workspaceId)}
  AND client_id IS NOT NULL
  AND client_id != '';
`), "client", "project");
}

async function resolveProjectChildren(context = {}) {
  if (context.sourceTargetId) {
    return mapRows(await querySql(`
SELECT parent_project_id AS source_target_id, id AS target_id
FROM projects
WHERE workspace_id = ${sqlText(context.workspaceId)}
  AND parent_project_id = ${sqlText(context.sourceTargetId)};
`), "project", "project");
  }

  if (context.targetId) {
    return mapRows(await querySql(`
SELECT parent_project_id AS source_target_id, id AS target_id
FROM projects
WHERE workspace_id = ${sqlText(context.workspaceId)}
  AND id = ${sqlText(context.targetId)}
  AND parent_project_id IS NOT NULL
  AND parent_project_id != '';
`), "project", "project");
  }

  return mapRows(await querySql(`
SELECT parent_project_id AS source_target_id, id AS target_id
FROM projects
WHERE workspace_id = ${sqlText(context.workspaceId)}
  AND parent_project_id IS NOT NULL
  AND parent_project_id != '';
`), "project", "project");
}

async function resolveProjectTasks(context = {}) {
  if (context.sourceTargetId) {
    return mapRows(await querySql(`
SELECT project_id AS source_target_id, task_id AS target_id
FROM tasks
WHERE workspace_id = ${sqlText(context.workspaceId)}
  AND project_id = ${sqlText(context.sourceTargetId)};
`), "project", "task");
  }

  if (context.targetId) {
    return mapRows(await querySql(`
SELECT project_id AS source_target_id, task_id AS target_id
FROM tasks
WHERE workspace_id = ${sqlText(context.workspaceId)}
  AND task_id = ${sqlText(context.targetId)}
  AND project_id IS NOT NULL
  AND project_id != '';
`), "project", "task");
  }

  return mapRows(await querySql(`
SELECT project_id AS source_target_id, task_id AS target_id
FROM tasks
WHERE workspace_id = ${sqlText(context.workspaceId)}
  AND project_id IS NOT NULL
  AND project_id != '';
`), "project", "task");
}

async function resolveClientNotes(context = {}) {
  return resolveNoteContext(context, "client", "client_id");
}

async function resolveProjectNotes(context = {}) {
  return resolveNoteContext(context, "project", "project_id");
}

async function resolveNoteContext(context = {}, sourceTargetType, noteColumn) {
  const targetTypeSql = sqlText(sourceTargetType);
  const moduleIdSql = sqlText("client-projects");

  if (context.sourceTargetId) {
    return mapRows(await querySql(`
SELECT ${noteColumn} AS source_target_id, note_id AS target_id
FROM notes
WHERE workspace_id = ${sqlText(context.workspaceId)}
  AND ${noteColumn} = ${sqlText(context.sourceTargetId)}
  AND status != 'deleted'
UNION
SELECT target_id AS source_target_id, note_id AS target_id
FROM note_links
WHERE workspace_id = ${sqlText(context.workspaceId)}
  AND module_id = ${moduleIdSql}
  AND target_type = ${targetTypeSql}
  AND target_id = ${sqlText(context.sourceTargetId)}
  AND removed_at IS NULL;
`), sourceTargetType, "note");
  }

  if (context.targetId) {
    return mapRows(await querySql(`
SELECT ${noteColumn} AS source_target_id, note_id AS target_id
FROM notes
WHERE workspace_id = ${sqlText(context.workspaceId)}
  AND note_id = ${sqlText(context.targetId)}
  AND ${noteColumn} IS NOT NULL
  AND ${noteColumn} != ''
  AND status != 'deleted'
UNION
SELECT target_id AS source_target_id, note_id AS target_id
FROM note_links
WHERE workspace_id = ${sqlText(context.workspaceId)}
  AND note_id = ${sqlText(context.targetId)}
  AND module_id = ${moduleIdSql}
  AND target_type = ${targetTypeSql}
  AND target_id IS NOT NULL
  AND target_id != ''
  AND removed_at IS NULL;
`), sourceTargetType, "note");
  }

  return mapRows(await querySql(`
SELECT ${noteColumn} AS source_target_id, note_id AS target_id
FROM notes
WHERE workspace_id = ${sqlText(context.workspaceId)}
  AND ${noteColumn} IS NOT NULL
  AND ${noteColumn} != ''
  AND status != 'deleted'
UNION
SELECT target_id AS source_target_id, note_id AS target_id
FROM note_links
WHERE workspace_id = ${sqlText(context.workspaceId)}
  AND module_id = ${moduleIdSql}
  AND target_type = ${targetTypeSql}
  AND target_id IS NOT NULL
  AND target_id != ''
  AND removed_at IS NULL;
`), sourceTargetType, "note");
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

registerBuiltInResolvers();

export {
  listTagPropagationResolverIds,
  readTagPropagationResolver,
  registerTagPropagationResolver,
  resetTagPropagationResolvers,
};
