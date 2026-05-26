import {
  querySql,
  runSql,
  sqlNullableInteger,
  sqlNullableText,
  sqlText,
} from "../db/index.js";
import { projectsRepository } from "./projects.repo.js";
import {
  normalizeBillableFlag,
  normalizeBillingContact,
  normalizeBillingPeriod,
  normalizeBillingRate,
  normalizeBillingRounding,
} from "../utils/normalizers.js";

async function readAll(organizationId) {
  const rows = await querySql(`
SELECT
  id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment,
  billing_contact_name,
  billing_contact_email,
  billing_contact_alternate_name,
  billing_contact_alternate_email,
  billing_contact_phone_number,
  billing_contact_alternate_phone_number,
  billing_contact_street_address_1,
  billing_contact_street_address_2,
  billing_contact_city,
  billing_contact_state,
  billing_contact_zip_code
FROM clients
WHERE organization_id = ${sqlText(organizationId)}
ORDER BY name;
`);

  return rows.map(clientRowToAppClient);
}

async function replaceAll(organizationId, clients) {
  const now = new Date().toISOString();
  const statements = [
    "BEGIN TRANSACTION;",
    `DELETE FROM projects WHERE organization_id = ${sqlText(organizationId)};`,
    `DELETE FROM clients WHERE organization_id = ${sqlText(organizationId)};`,
  ];

  clients.forEach((client) => {
    statements.push(createClientInsertSql(organizationId, client, now));
    client.projects.forEach((project) => {
      statements.push(projectsRepository.createInsertSql(organizationId, client.id, project, now));
    });
  });

  statements.push("COMMIT;");
  await runSql(statements.join("\n"));
}

function createClientInsertSql(organizationId, client, now) {
  const contact = normalizeBillingContact(client.billing_contact);

  return `
INSERT INTO clients (
  id,
  organization_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment,
  billing_contact_name,
  billing_contact_email,
  billing_contact_alternate_name,
  billing_contact_alternate_email,
  billing_contact_phone_number,
  billing_contact_alternate_phone_number,
  billing_contact_street_address_1,
  billing_contact_street_address_2,
  billing_contact_city,
  billing_contact_state,
  billing_contact_zip_code,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(client.id)},
  ${sqlText(organizationId)},
  ${sqlText(client.name)},
  ${sqlText(client.status)},
  ${sqlText(client.billable)},
  ${sqlNullableText(client.billing_rate)},
  ${sqlNullableText(client.billing_period?.type)},
  ${sqlNullableInteger(client.billing_period?.startDay)},
  ${sqlNullableInteger(client.billing_rounding ? (client.billing_rounding.enabled ? 1 : 0) : null)},
  ${sqlNullableText(client.billing_rounding?.increment)},
  ${sqlText(contact.name)},
  ${sqlText(contact.email)},
  ${sqlText(contact.alternate_name)},
  ${sqlText(contact.alternate_email)},
  ${sqlText(contact.phone_number)},
  ${sqlText(contact.alternate_phone_number)},
  ${sqlText(contact.street_address_1)},
  ${sqlText(contact.street_address_2)},
  ${sqlText(contact.city)},
  ${sqlText(contact.state)},
  ${sqlText(contact.zip_code)},
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

function clientRowToAppClient(row) {
  return {
    id: row.id,
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
    enabled: Number(row.billing_rounding_enabled) === 1,
    increment: row.billing_rounding_increment,
  });
}

export const clientsRepository = {
  readAll,
  replaceAll,
};
