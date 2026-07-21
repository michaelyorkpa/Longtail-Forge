import { db } from "../../core/database.js";
import { projectsRepository } from "./projects.repo.js";
import {
  normalizeBillableFlag,
  normalizeBillingContact,
  normalizeBillingPeriod,
  normalizeBillingRate,
  normalizeBillingRounding,
} from "../../utils/normalizers.js";

const CLIENT_COLUMNS = [
  "id",
  "workspace_id",
  "parent_client_id",
  "name",
  "status",
  "billable",
  "billing_rate",
  "billing_period_type",
  "billing_period_start_day",
  "billing_rounding_enabled",
  "billing_rounding_increment",
  "billing_contact_name",
  "billing_contact_email",
  "billing_contact_alternate_name",
  "billing_contact_alternate_email",
  "billing_contact_phone_number",
  "billing_contact_alternate_phone_number",
  "billing_contact_street_address_1",
  "billing_contact_street_address_2",
  "billing_contact_city",
  "billing_contact_state",
  "billing_contact_zip_code",
  "created_at",
  "updated_at",
];

const CLIENT_INSERT_SQL = `
INSERT INTO clients (
  ${CLIENT_COLUMNS.join(",\n  ")}
)
VALUES (
  :clientId,
  :workspaceId,
  :parentClientId,
  :name,
  :status,
  :billable,
  :billingRate,
  :billingPeriodType,
  :billingPeriodStartDay,
  :billingRoundingEnabled,
  :billingRoundingIncrement,
  :billingContactName,
  :billingContactEmail,
  :billingContactAlternateName,
  :billingContactAlternateEmail,
  :billingContactPhoneNumber,
  :billingContactAlternatePhoneNumber,
  :billingContactStreetAddress1,
  :billingContactStreetAddress2,
  :billingContactCity,
  :billingContactState,
  :billingContactZipCode,
  :createdAt,
  :updatedAt
);
`;

async function readAll(workspaceId, options = {}) {
  const statusSql = options.activeOnly === true ? "\n  AND status != 'Inactive'" : "";
  const rows = await db.query(`
SELECT ${CLIENT_COLUMNS.join(", ")}
FROM clients
WHERE workspace_id = :workspaceId${statusSql}
ORDER BY ${db.dialect.comparison.orderByNoCase("name", "ASC")};
`, { workspaceId: text(workspaceId) });

  return rows.map(clientRowToAppClient);
}

async function readById(workspaceId, clientId) {
  const row = await db.get(`
SELECT ${CLIENT_COLUMNS.join(", ")}
FROM clients
WHERE workspace_id = :workspaceId
  AND id = :clientId
LIMIT 1;
`, {
    clientId: text(clientId),
    workspaceId: text(workspaceId),
  });

  return row ? clientRowToAppClient(row) : null;
}

async function readByIds(workspaceId, clientIds = []) {
  const ids = normalizeIdList(clientIds);

  if (ids.length === 0) {
    return [];
  }

  const rows = await db.query(`
SELECT ${CLIENT_COLUMNS.join(", ")}
FROM clients
WHERE workspace_id = :workspaceId
  AND id IN (:clientIds)
ORDER BY ${db.dialect.comparison.orderByNoCase("name", "ASC")};
`, {
    clientIds: ids,
    workspaceId: text(workspaceId),
  });

  return rows.map(clientRowToAppClient);
}

async function create(workspaceId, client) {
  const now = new Date().toISOString();

  await db.run(CLIENT_INSERT_SQL, clientWriteParams({
    client,
    createdAt: now,
    updatedAt: now,
    workspaceId,
  }));
}

async function update(workspaceId, client) {
  const now = new Date().toISOString();

  await db.run(`
UPDATE clients
SET
  workspace_id = :workspaceId,
  parent_client_id = :parentClientId,
  name = :name,
  status = :status,
  billable = :billable,
  billing_rate = :billingRate,
  billing_period_type = :billingPeriodType,
  billing_period_start_day = :billingPeriodStartDay,
  billing_rounding_enabled = :billingRoundingEnabled,
  billing_rounding_increment = :billingRoundingIncrement,
  billing_contact_name = :billingContactName,
  billing_contact_email = :billingContactEmail,
  billing_contact_alternate_name = :billingContactAlternateName,
  billing_contact_alternate_email = :billingContactAlternateEmail,
  billing_contact_phone_number = :billingContactPhoneNumber,
  billing_contact_alternate_phone_number = :billingContactAlternatePhoneNumber,
  billing_contact_street_address_1 = :billingContactStreetAddress1,
  billing_contact_street_address_2 = :billingContactStreetAddress2,
  billing_contact_city = :billingContactCity,
  billing_contact_state = :billingContactState,
  billing_contact_zip_code = :billingContactZipCode,
  updated_at = :updatedAt
WHERE workspace_id = :workspaceId
  AND id = :clientId;
`, clientWriteParams({
    client,
    updatedAt: now,
    workspaceId,
  }));
}

async function archive(workspaceId, clientId) {
  const now = new Date().toISOString();

  await db.transaction(async (transaction) => {
    await transaction.run(`
UPDATE clients
SET status = 'Inactive',
    updated_at = :updatedAt
WHERE workspace_id = :workspaceId
  AND id = :clientId;
`, {
      clientId: text(clientId),
      updatedAt: now,
      workspaceId: text(workspaceId),
    });

    await transaction.run(`
UPDATE projects
SET status = 'Inactive',
    updated_at = :updatedAt
WHERE workspace_id = :workspaceId
  AND client_id = :clientId
  AND status != 'Completed';
`, {
      clientId: text(clientId),
      updatedAt: now,
      workspaceId: text(workspaceId),
    });
  });
}

async function replaceAll(workspaceId, clients) {
  const now = new Date().toISOString();

  await db.transaction(async (transaction) => {
    await transaction.run(`
DELETE FROM projects
WHERE workspace_id = :workspaceId;
`, { workspaceId: text(workspaceId) });

    await transaction.run(`
DELETE FROM clients
WHERE workspace_id = :workspaceId;
`, { workspaceId: text(workspaceId) });

    for (const client of clients) {
      await insertClient(transaction, workspaceId, client, now);

      for (const project of client.projects) {
        await projectsRepository.insertProject(transaction, workspaceId, client.id, project, now);
      }
    }
  });
}

async function insertClient(databaseClient, workspaceId, client, now) {
  await databaseClient.run(CLIENT_INSERT_SQL, clientWriteParams({
    client,
    createdAt: now,
    updatedAt: now,
    workspaceId,
  }));
}

function clientWriteParams({ client, createdAt = undefined, updatedAt, workspaceId }) {
  const contact = normalizeBillingContact(client.billing_contact);
  const params = {
    billable: text(client.billable),
    billingContactAlternateEmail: text(contact.alternate_email),
    billingContactAlternateName: text(contact.alternate_name),
    billingContactAlternatePhoneNumber: text(contact.alternate_phone_number),
    billingContactCity: text(contact.city),
    billingContactEmail: text(contact.email),
    billingContactName: text(contact.name),
    billingContactPhoneNumber: text(contact.phone_number),
    billingContactState: text(contact.state),
    billingContactStreetAddress1: text(contact.street_address_1),
    billingContactStreetAddress2: text(contact.street_address_2),
    billingContactZipCode: text(contact.zip_code),
    billingPeriodStartDay: nullableInteger(client.billing_period?.startDay),
    billingPeriodType: nullableText(client.billing_period?.type),
    billingRate: nullableText(client.billing_rate),
    billingRoundingEnabled: bindNullableBoolean(client.billing_rounding?.enabled, client.billing_rounding),
    billingRoundingIncrement: nullableText(client.billing_rounding?.increment),
    clientId: text(client.id),
    name: text(client.name),
    parentClientId: nullableText(client.parent_client_id),
    status: text(client.status),
    updatedAt: text(updatedAt),
    workspaceId: text(workspaceId),
  };

  if (createdAt !== undefined) {
    params.createdAt = text(createdAt);
  }

  return params;
}

function clientRowToAppClient(row) {
  return {
    id: row.id,
    workspace_id: row.workspace_id || "",
    parent_client_id: row.parent_client_id || "",
    name: row.name,
    status: row.status,
    billable: normalizeBillableFlag(row.billable),
    billing_rate: normalizeBillingRate(row.billing_rate),
    billing_period: billingPeriodRowToAppValue(row),
    billing_rounding: billingRoundingRowToAppValue(row),
    billing_contact: {
      name: row.billing_contact_name,
      email: row.billing_contact_email,
      alternate_name: row.billing_contact_alternate_name,
      alternate_email: row.billing_contact_alternate_email,
      phone_number: row.billing_contact_phone_number,
      alternate_phone_number: row.billing_contact_alternate_phone_number,
      street_address_1: row.billing_contact_street_address_1,
      street_address_2: row.billing_contact_street_address_2,
      city: row.billing_contact_city,
      state: row.billing_contact_state,
      zip_code: row.billing_contact_zip_code,
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
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

export const clientsRepository = {
  archive,
  create,
  readAll,
  readById,
  readByIds,
  replaceAll,
  update,
};
