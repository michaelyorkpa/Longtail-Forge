import { db } from "../../core/database.js";
import {
  normalizeBillableFlag,
  normalizeBillingPeriod,
  normalizeBillingRate,
  normalizeBillingRounding,
  normalizeProjectTaskDefaults,
} from "../../utils/normalizers.js";

const PROJECT_COLUMNS = [
  "id",
  "workspace_id",
  "client_id",
  "parent_project_id",
  "name",
  "status",
  "billable",
  "billing_rate",
  "billing_period_type",
  "billing_period_start_day",
  "billing_rounding_enabled",
  "billing_rounding_increment",
  "task_default_priority",
  "task_default_status",
  "task_default_sort_order_json",
  "task_default_assignee_mode",
  "created_at",
  "updated_at",
];

const PROJECT_INSERT_SQL = `
INSERT INTO projects (
  ${PROJECT_COLUMNS.join(",\n  ")}
)
VALUES (
  :projectId,
  :workspaceId,
  :clientId,
  :parentProjectId,
  :name,
  :status,
  :billable,
  :billingRate,
  :billingPeriodType,
  :billingPeriodStartDay,
  :billingRoundingEnabled,
  :billingRoundingIncrement,
  :taskDefaultPriority,
  :taskDefaultStatus,
  :taskDefaultSortOrderJson,
  :taskDefaultAssigneeMode,
  :createdAt,
  :updatedAt
);
`;

async function readAll(workspaceId, options = {}) {
  const statusSql = options.activeOnly === true ? "\n  AND projects.status != 'Inactive'" : "";
  const rows = await db.query(`
SELECT
  ${projectSelectColumnsSql()}
FROM ${projectSelectFromSql()}
WHERE projects.workspace_id = :workspaceId${statusSql}
ORDER BY ${db.dialect.comparison.orderByNoCase("projects.name", "ASC")};
`, { workspaceId: text(workspaceId) });

  return rows.map(projectRowToAppProject);
}

async function readById(workspaceId, projectId) {
  const row = await db.get(`
SELECT
  ${projectSelectColumnsSql()}
FROM ${projectSelectFromSql()}
WHERE projects.workspace_id = :workspaceId
  AND projects.id = :projectId
LIMIT 1;
`, {
    projectId: text(projectId),
    workspaceId: text(workspaceId),
  });

  return row ? projectRowToAppProject(row) : null;
}

async function readByIds(workspaceId, projectIds = []) {
  const ids = normalizeIdList(projectIds);

  if (ids.length === 0) {
    return [];
  }

  const rows = await db.query(`
SELECT
  ${projectSelectColumnsSql()}
FROM ${projectSelectFromSql()}
WHERE projects.workspace_id = :workspaceId
  AND projects.id IN (:projectIds)
ORDER BY ${db.dialect.comparison.orderByNoCase("projects.name", "ASC")};
`, {
    projectIds: ids,
    workspaceId: text(workspaceId),
  });

  return rows.map(projectRowToAppProject);
}

async function readByClientId(workspaceId, clientId) {
  const rows = await db.query(`
SELECT
  ${projectSelectColumnsSql()}
FROM ${projectSelectFromSql()}
WHERE projects.workspace_id = :workspaceId
  AND projects.client_id = :clientId
ORDER BY ${db.dialect.comparison.orderByNoCase("projects.name", "ASC")};
`, {
    clientId: text(clientId),
    workspaceId: text(workspaceId),
  });

  return rows.map(projectRowToAppProject);
}

async function readByNameInScope(workspaceId, clientId, projectName, excludeProjectId = "") {
  const normalizedClientId = text(clientId).trim();
  const normalizedExcludeProjectId = text(excludeProjectId).trim();
  const params = {
    projectName: text(projectName),
    workspaceId: text(workspaceId),
  };
  const clientScopeSql = normalizedClientId
    ? "projects.client_id = :clientId"
    : "(projects.client_id IS NULL OR projects.client_id = '')";
  const excludeSql = normalizedExcludeProjectId
    ? "AND projects.id <> :excludeProjectId"
    : "";

  if (normalizedClientId) {
    params.clientId = normalizedClientId;
  }
  if (normalizedExcludeProjectId) {
    params.excludeProjectId = normalizedExcludeProjectId;
  }

  const row = await db.get(`
SELECT
  ${projectSelectColumnsSql()}
FROM ${projectSelectFromSql()}
WHERE projects.workspace_id = :workspaceId
  AND ${clientScopeSql}
  AND ${db.dialect.comparison.equalsNoCase("trim(projects.name)", "trim(:projectName)")}
  ${excludeSql}
LIMIT 1;
`, params);

  return row ? projectRowToAppProject(row) : null;
}

async function create(workspaceId, clientId, project) {
  const now = new Date().toISOString();

  await db.run(PROJECT_INSERT_SQL, projectWriteParams({
    clientId,
    createdAt: now,
    project,
    updatedAt: now,
    workspaceId,
  }));
}

async function update(workspaceId, project) {
  const now = new Date().toISOString();

  await db.run(`
UPDATE projects
SET
  workspace_id = :workspaceId,
  client_id = :clientId,
  parent_project_id = :parentProjectId,
  name = :name,
  status = :status,
  billable = :billable,
  billing_rate = :billingRate,
  billing_period_type = :billingPeriodType,
  billing_period_start_day = :billingPeriodStartDay,
  billing_rounding_enabled = :billingRoundingEnabled,
  billing_rounding_increment = :billingRoundingIncrement,
  task_default_priority = :taskDefaultPriority,
  task_default_status = :taskDefaultStatus,
  task_default_sort_order_json = :taskDefaultSortOrderJson,
  task_default_assignee_mode = :taskDefaultAssigneeMode,
  updated_at = :updatedAt
WHERE workspace_id = :workspaceId
  AND id = :projectId;
`, projectWriteParams({
    clientId: project.client_id,
    project,
    updatedAt: now,
    workspaceId,
  }));
}

async function archive(workspaceId, projectId) {
  const now = new Date().toISOString();

  await db.run(`
UPDATE projects
SET status = 'Inactive',
    updated_at = :updatedAt
WHERE workspace_id = :workspaceId
  AND id = :projectId;
`, {
    projectId: text(projectId),
    updatedAt: now,
    workspaceId: text(workspaceId),
  });
}

async function insertProject(databaseClient, workspaceId, clientId, project, now) {
  await databaseClient.run(PROJECT_INSERT_SQL, projectWriteParams({
    clientId,
    createdAt: now,
    project,
    updatedAt: now,
    workspaceId,
  }));
}

function projectRowToAppProject(row) {
  return {
    id: row.id,
    workspace_id: row.workspace_id || "",
    client_id: row.client_id || "",
    client_name: row.client_name || "",
    parent_project_id: row.parent_project_id || "",
    parent_project_name: row.parent_project_name || "",
    name: row.name,
    billable: normalizeBillableFlag(row.billable),
    billing_rate: normalizeBillingRate(row.billing_rate),
    billing_period: billingPeriodRowToAppValue(row),
    billing_rounding: billingRoundingRowToAppValue(row),
    taskDefaults: normalizeProjectTaskDefaults({
      task_default_priority: row.task_default_priority,
      task_default_status: row.task_default_status,
      task_default_sort_order_json: row.task_default_sort_order_json,
      task_default_assignee_mode: row.task_default_assignee_mode,
    }),
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function projectSelectFromSql() {
  return `
projects
LEFT JOIN clients
  ON clients.workspace_id = projects.workspace_id
  AND clients.id = projects.client_id
LEFT JOIN projects AS parent_projects
  ON parent_projects.workspace_id = projects.workspace_id
  AND parent_projects.id = projects.parent_project_id`;
}

function projectSelectColumnsSql() {
  return `
  projects.id,
  projects.workspace_id,
  projects.client_id,
  clients.name AS client_name,
  projects.parent_project_id,
  parent_projects.name AS parent_project_name,
  projects.name,
  projects.status,
  projects.billable,
  projects.billing_rate,
  projects.billing_period_type,
  projects.billing_period_start_day,
  projects.billing_rounding_enabled,
  projects.billing_rounding_increment,
  projects.task_default_priority,
  projects.task_default_status,
  projects.task_default_sort_order_json,
  projects.task_default_assignee_mode,
  projects.created_at,
  projects.updated_at`.trim();
}

function projectWriteParams({ clientId, createdAt = undefined, project, updatedAt, workspaceId }) {
  const params = {
    billable: text(project.billable),
    billingPeriodStartDay: nullableInteger(project.billing_period?.startDay),
    billingPeriodType: nullableText(project.billing_period?.type),
    billingRate: nullableText(project.billing_rate),
    billingRoundingEnabled: bindNullableBoolean(project.billing_rounding?.enabled, project.billing_rounding),
    billingRoundingIncrement: nullableText(project.billing_rounding?.increment),
    clientId: nullableText(clientId),
    name: text(project.name),
    parentProjectId: nullableText(project.parent_project_id),
    projectId: text(project.id),
    status: text(project.status),
    taskDefaultAssigneeMode: text(project.taskDefaults?.defaultAssigneeMode || "creator"),
    taskDefaultPriority: text(project.taskDefaults?.priority || "normal"),
    taskDefaultSortOrderJson: text(JSON.stringify(project.taskDefaults?.sortOrder || ["due_date", "priority", "status"])),
    taskDefaultStatus: text(project.taskDefaults?.status || "open"),
    updatedAt: text(updatedAt),
    workspaceId: text(workspaceId),
  };

  if (createdAt !== undefined) {
    params.createdAt = text(createdAt);
  }

  return params;
}

function billingPeriodRowToAppValue(row) {
  if (!row.billing_period_type) {
    return null;
  }

  return normalizeBillingPeriod({
    type: row.billing_period_type,
    startDay: row.billing_period_start_day,
  });
}

function billingRoundingRowToAppValue(row) {
  if (row.billing_rounding_enabled === null || row.billing_rounding_enabled === undefined) {
    return null;
  }

  return normalizeBillingRounding({
    enabled: db.dialect.boolean.read(row.billing_rounding_enabled) === true,
    increment: row.billing_rounding_increment,
  });
}

function bindNullableBoolean(value, owner) {
  return owner ? db.dialect.boolean.bind(value === true) : null;
}

function normalizeIdList(ids) {
  return [...new Set((Array.isArray(ids) ? ids : [])
    .map((id) => text(id).trim())
    .filter(Boolean))];
}

function nullableInteger(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number.parseInt(value, 10);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function nullableText(value) {
  return value === null || value === undefined || String(value).trim() === ""
    ? null
    : String(value);
}

function text(value) {
  return String(value ?? "");
}

export const projectsRepository = {
  archive,
  create,
  insertProject,
  readAll,
  readByClientId,
  readById,
  readByIds,
  readByNameInScope,
  update,
};
