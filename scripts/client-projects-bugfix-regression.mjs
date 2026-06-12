import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-client-projects-bugfix-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-client-projects-bugfix.db");
process.env.SUPER_ADMIN_PASSWORD = "Client-Projects-Bugfix-Test-123!";

const { closeSqlite, initializeDatabase, querySql } = await import("../src/db/index.js");
const { clientsService } = await import("../src/modules/client-projects/clients.service.js");
const { tagsService } = await import("../src/services/tags.service.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();

  await assertProjectCreationInheritsClientBilling(session);
  await assertClientBillingSavesPreserveTags(session);
  await assertIntegrity();

  console.log("Client/projects bugfix regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertProjectCreationInheritsClientBilling(session) {
  const client = (await clientsService.createClient({
    name: "Billing Inheritance Client",
    billable: "yes",
    billing_rate: "175",
    billing_period: { type: "custom", startDay: 12 },
    billing_rounding: { enabled: true, increment: "nearestHalfHour" },
  }, session)).client;

  const project = (await clientsService.createProject(client.id, {
    name: "Inherited Billing Project",
  }, session)).project;

  assert.equal(project.billable, "yes", "project should inherit the client billable flag on create");
  assert.equal(project.billing_rate, null, "project should not snapshot the client billing rate as an override");
  assert.equal(project.billing_period, null, "project should leave billing period inherited");
  assert.equal(project.billing_rounding, null, "project should leave rounding inherited");

  const nonBillableClient = (await clientsService.createClient({
    name: "Nonbillable Inheritance Client",
    billable: "no",
    billing_rate: "220",
    billing_rounding: { enabled: true, increment: "nearestHour" },
  }, session)).client;
  const nonBillableProject = (await clientsService.createProject(nonBillableClient.id, {
    name: "Nonbillable Inherited Project",
  }, session)).project;

  assert.equal(nonBillableProject.billable, "no", "project should inherit a non-billable client default");
  assert.equal(nonBillableProject.billing_rate, null, "non-billable inherited project should not store a rate override");
  assert.equal(nonBillableProject.billing_rounding, null, "non-billable inherited project should keep rounding inherited");
}

async function assertClientBillingSavesPreserveTags(session) {
  const directTag = (await tagsService.create(session, { name: "Billing Direct Tag" })).tag;
  const propagatedTag = (await tagsService.create(session, { name: "Billing Propagated Tag" })).tag;
  const parentClient = (await clientsService.createClient({
    name: "Tagged Billing Parent",
    tagIds: [propagatedTag.tag_id],
  }, session)).client;
  const childClient = (await clientsService.createClient({
    name: "Tagged Billing Child",
    parent_client_id: parentClient.id,
    tagIds: [directTag.tag_id],
  }, session)).client;

  await clientsService.updateClient(childClient.id, {
    billable: "no",
    billing_rate: null,
    billing_rounding: { enabled: true, increment: "nearestQuarterHour" },
  }, session);

  assertTagIds(
    await tagsService.listDirectTagsForTarget(session, "client", childClient.id),
    [directTag.tag_id],
    "billing-only client saves should preserve direct tags when tagIds is omitted",
  );
  assertTagIds(
    await tagsService.listEffectiveTagsForTarget(session, "client", childClient.id),
    [directTag.tag_id, propagatedTag.tag_id],
    "billing-only client saves should preserve direct and propagated tags",
  );

  await clientsService.updateClient(childClient.id, {
    name: "Tagged Billing Child",
    tagIds: [],
  }, session);

  assertTagIds(
    await tagsService.listDirectTagsForTarget(session, "client", childClient.id),
    [],
    "explicit client tag edits should still be able to clear direct tags",
  );
  assertTagIds(
    await tagsService.listEffectiveTagsForTarget(session, "client", childClient.id),
    [propagatedTag.tag_id],
    "explicit direct-tag edits should not remove propagated tags",
  );
}

function assertTagIds(assignments, expectedTagIds, message) {
  assert.deepEqual(
    assignments.map((assignment) => assignment.tag_id).sort(),
    [...expectedTagIds].sort(),
    message,
  );
}

async function readSeedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);
  const user = rows[0];

  assert.ok(user, "fresh database should seed a protected super admin");

  return {
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
    home_workspace_id: user.home_workspace_id,
    ip: "127.0.0.1",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}
