#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_SEED_PASSWORD = "Scale-Seed-Password-123!";
const DEFAULT_PROFILE = "";
const SEED_SOURCE = "scale-seed";
const SCALE_MARKER_TABLE = "scale_seed_runs";
const DISPOSABLE_PATH_PATTERN = /(?:^|[\\/\s._-])(disposable|test|tmp|temp|seed|scale|demo)(?:[\\/\s._-]|$)/i;
const BASE_TIME_MS = Date.parse("2026-01-01T09:00:00.000Z");

const PROFILES = Object.freeze({
  "dev-demo": Object.freeze({
    description: "Small fast profile for local script verification and UI smoke work.",
    workspaces: 1,
    users: 8,
    clients: 5,
    projects: 20,
    tasks: 80,
    notes: 60,
    lists: 12,
    listItems: 120,
    tags: 16,
    notifications: 60,
    auditLogs: 200,
    files: 24,
    timeEntries: 150,
  }),
  "sqlite-small-office-50": Object.freeze({
    description: "Minimum realistic SQLite small-office profile for roughly 50 total users.",
    workspaces: 1,
    users: 50,
    clients: 50,
    projects: 500,
    tasks: 10000,
    notes: 10000,
    lists: 750,
    listItems: 5000,
    tags: 100,
    notifications: 5000,
    auditLogs: 100000,
    files: 2000,
    timeEntries: 25000,
  }),
  "sqlite-heavy-workspace": Object.freeze({
    description: "Upper-end SQLite workspace profile for bounded-query and performance stress work.",
    workspaces: 1,
    users: 50,
    clients: 100,
    projects: 1000,
    tasks: 50000,
    notes: 25000,
    lists: 2000,
    listItems: 20000,
    tags: 150,
    notifications: 20000,
    auditLogs: 150000,
    files: 10000,
    timeEntries: 100000,
  }),
  "future-saas-postgres-mixed": Object.freeze({
    description: "Reserved mixed SaaS shape; currently seeds SQLite until the PostgreSQL provider exists.",
    workspaces: 1,
    users: 75,
    clients: 150,
    projects: 1500,
    tasks: 75000,
    notes: 35000,
    lists: 2500,
    listItems: 30000,
    tags: 200,
    notifications: 30000,
    auditLogs: 200000,
    files: 15000,
    timeEntries: 150000,
  }),
});

let databaseApi = null;

try {
  await main();
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
} finally {
  if (databaseApi?.closeDatabase) {
    await databaseApi.closeDatabase();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (options.listProfiles) {
    printProfiles(Boolean(options.json));
    return;
  }

  const profileName = options.profile || DEFAULT_PROFILE;
  const profile = PROFILES[profileName];

  if (!profile) {
    throw new Error("Scale seed requires --profile. Run with --list-profiles to see available profiles.");
  }

  if (!options.provider) {
    throw new Error("Scale seed requires an explicit --provider sqlite argument.");
  }

  if (!options.database) {
    throw new Error("Scale seed requires an explicit --database path.");
  }

  const provider = String(options.provider).trim().toLowerCase();
  const databaseFile = path.resolve(String(options.database).trim());

  if (provider !== "sqlite") {
    throw new Error(`Unsupported scale seed provider "${provider}". SQLite is the only implemented provider in this version.`);
  }

  assertDisposableDatabasePath(databaseFile);
  await fs.mkdir(path.dirname(databaseFile), { recursive: true });
  configureRuntimeEnvironment(provider, databaseFile);

  databaseApi = await import("../src/db/index.js");
  const { hashPassword } = await import("../src/security/passwords.js");
  const { permissionsService } = await import("../src/core/permissions.js");
  const startupHealth = await databaseApi.initializeDatabase();
  await assertDatabaseCanBeSeeded(databaseApi.db, databaseFile);

  const context = await readSeedContext(databaseApi.db, profile);
  const seeded = await seedProfile({
    db: databaseApi.db,
    hashPassword,
    profile,
    profileName,
    seedContext: context,
  });

  const verification = await verifySeed({
    db: databaseApi.db,
    permissionsService,
    profile,
    seedContext: seeded,
  });
  const secondStartupHealth = await databaseApi.initializeDatabase();
  const startupSanity = await verifyStartupSanity(databaseApi.db, secondStartupHealth, seeded.workspace.workspace_id);
  const result = {
    ok: true,
    profile: profileName,
    provider,
    database: databaseFile,
    startup: {
      provider: startupHealth.provider,
      secondStartupProvider: secondStartupHealth.provider,
      foreignKeysEnabled: startupSanity.foreignKeysEnabled,
      workspaceModules: startupSanity.workspaceModules,
    },
    expectedCounts: verification.expectedCounts,
    actualCounts: verification.actualCounts,
    permissionSanity: verification.permissionSanity,
    searchSanity: verification.searchSanity,
  };

  if (options.json) {
    console.log(JSON.stringify(result));
    return;
  }

  printSeedResult(result);
}

function parseArgs(args) {
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--list-profiles") {
      options.listProfiles = true;
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--profile" || arg === "--provider" || arg === "--database") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value.`);
      }
      options[arg.slice(2)] = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown scale seed argument: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/seed-scale.mjs --profile dev-demo --provider sqlite --database ./data/scale-seed-dev-demo.disposable.db

Required:
  --profile     One of: ${Object.keys(PROFILES).join(", ")}
  --provider    Must be sqlite in this version
  --database    Explicit disposable/test database path

Options:
  --list-profiles  Print available seed profiles
  --json           Print machine-readable JSON summary
  --help           Show this help

Safety:
  The database path must be clearly disposable/test-only, such as a temp path or a filename containing seed, scale, demo, test, or disposable. Existing app data is refused unless it is a clean fresh-start database with no scale seed marker.`);
}

function printProfiles(json = false) {
  const profiles = Object.fromEntries(
    Object.entries(PROFILES).map(([name, profile]) => [name, { ...profile }]),
  );

  if (json) {
    console.log(JSON.stringify({ profiles }));
    return;
  }

  for (const [name, profile] of Object.entries(PROFILES)) {
    console.log(`${name}: ${profile.description}`);
    console.log(`  users=${profile.users} clients=${profile.clients} projects=${profile.projects} tasks=${profile.tasks} notes=${profile.notes} timeEntries=${profile.timeEntries} listItems=${profile.listItems} files=${profile.files} auditLogs=${profile.auditLogs}`);
  }
}

function assertDisposableDatabasePath(databaseFile) {
  const normalized = path.normalize(databaseFile);
  const inTemp = normalized.toLowerCase().startsWith(path.normalize(os.tmpdir()).toLowerCase());

  if (inTemp || DISPOSABLE_PATH_PATTERN.test(normalized)) {
    return;
  }

  throw new Error(
    `Refusing to seed non-disposable database path: ${databaseFile}. ` +
    "Use a temp/test/seed/scale/demo/disposable database path.",
  );
}

function configureRuntimeEnvironment(provider, databaseFile) {
  process.env.LONGTAIL_ENV = process.env.LONGTAIL_ENV || "test";
  process.env.LONGTAIL_DATABASE_PROVIDER = provider;
  process.env.LONGTAIL_DATABASE_FILE = databaseFile;
  process.env.LONGTAIL_DATA_DIR = process.env.LONGTAIL_DATA_DIR || path.dirname(databaseFile);
  process.env.SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || DEFAULT_SEED_PASSWORD;
}

async function assertDatabaseCanBeSeeded(db, databaseFile) {
  const markerExists = await tableExists(db, SCALE_MARKER_TABLE);

  if (markerExists) {
    const previousRun = await db.get(`
SELECT profile, seeded_at
FROM ${SCALE_MARKER_TABLE}
ORDER BY seeded_at DESC
LIMIT 1;
`);

    if (previousRun) {
      throw new Error(
        `Refusing to seed ${databaseFile}; it already contains a scale seed run (${previousRun.profile} at ${previousRun.seeded_at}).`,
      );
    }
  }

  const counts = await countTables(db, [
    "workspaces",
    "users",
    "clients",
    "projects",
    "tasks",
    "notes",
    "lists",
    "list_items",
    "time_entries",
    "tags",
    "notifications",
    "audit_logs",
    "files",
    "file_attachments",
  ]);
  const nonBootstrapTables = Object.entries(counts)
    .filter(([table, count]) => (
      (table === "workspaces" && count > 1) ||
      (table === "users" && count > 1) ||
      (!["workspaces", "users"].includes(table) && count > 0)
    ));

  if (nonBootstrapTables.length > 0) {
    const details = nonBootstrapTables.map(([table, count]) => `${table}=${count}`).join(", ");
    throw new Error(
      `Refusing to seed ${databaseFile}; it is not a clean disposable database (${details}).`,
    );
  }
}

async function seedProfile({ db, hashPassword, profile, profileName, seedContext }) {
  return db.transaction(async (transaction) => {
    await ensureScaleSeedRunTable(transaction);
    await updateWorkspace(transaction, seedContext.workspace.workspace_id, profileName);

    const users = await seedUsers({
      transaction,
      hashPassword,
      profile,
      seedContext,
    });
    const clients = await seedClients(transaction, profile, seedContext);
    const projects = await seedProjects(transaction, profile, seedContext, clients);
    const tags = await seedTags(transaction, profile, seedContext, users);
    const tasks = await seedTasks(transaction, profile, seedContext, users, clients, projects);
    const notes = await seedNotes(transaction, profile, seedContext, users, clients, projects, tasks);
    const lists = await seedLists(transaction, profile, seedContext, users, clients, projects);
    const listItems = await seedListItems(transaction, profile, seedContext, users, lists);
    const files = await seedFiles(transaction, profile, seedContext, users, clients, projects, tasks, notes, lists);

    await seedTimeEntries(transaction, profile, seedContext, users, clients, projects, tasks);
    await seedRoleAssignments(transaction, profile, seedContext, users, clients, projects);
    await seedTagAssignments(transaction, seedContext, users, tags, tasks, notes, lists, files);
    await seedNotifications(transaction, profile, seedContext, users, tasks, notes, lists);
    await seedSearchIndex(transaction, seedContext, clients, projects, tasks, notes, lists, files);
    await seedAuditLogs(transaction, profile, seedContext, users, clients, projects, tasks, notes, lists, files);
    await recordScaleSeedRun(transaction, profile, profileName, seedContext);

    return {
      ...seedContext,
      users,
      clients,
      projects,
      tags,
      tasks,
      notes,
      lists,
      listItems,
      files,
    };
  });
}

async function readSeedContext(db, profile) {
  const workspace = await db.get(`
SELECT workspace_id, name
FROM workspaces
ORDER BY created_at, workspace_id
LIMIT 1;
`);

  if (!workspace?.workspace_id) {
    throw new Error("Scale seed requires app startup to create a workspace before seeding.");
  }

  if (profile.workspaces !== 1) {
    throw new Error("This scale seed slice supports one seeded workspace per run.");
  }

  const superAdmin = await db.get(`
SELECT user_id, username, display_name
FROM users
WHERE home_workspace_id = :workspaceId
ORDER BY protected_user DESC, username
LIMIT 1;
`, { workspaceId: workspace.workspace_id });

  if (!superAdmin?.user_id) {
    throw new Error("Scale seed requires app startup to create a seed user before seeding.");
  }

  return {
    workspace,
    superAdmin,
  };
}

async function ensureScaleSeedRunTable(db) {
  await db.run(`
CREATE TABLE IF NOT EXISTS ${SCALE_MARKER_TABLE} (
  scale_seed_run_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  profile TEXT NOT NULL,
  provider TEXT NOT NULL,
  seeded_at TEXT NOT NULL,
  expected_counts_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
`);
}

async function updateWorkspace(db, workspaceId, profileName) {
  const now = isoAt(0);
  await db.run(`
UPDATE workspaces
SET name = :name,
    status = 'Active',
    workspace_type = 'business',
    updated_at = :now
WHERE workspace_id = :workspaceId;
`, {
    name: `Scale Seed ${profileName}`,
    now,
    workspaceId,
  });
}

async function seedUsers({ transaction, hashPassword, profile, seedContext }) {
  const users = [{
    user_id: seedContext.superAdmin.user_id,
    username: seedContext.superAdmin.username,
    display_name: seedContext.superAdmin.display_name || "Scale Seed Super Admin",
  }];
  const rows = [];
  const hashedPassword = hashPassword(DEFAULT_SEED_PASSWORD);

  for (let index = 1; index < profile.users; index += 1) {
    const oneBased = index + 1;
    const user = {
      user_id: idFor("scale-user", oneBased),
      username: `scale.user${pad(oneBased, 3)}@example.test`,
      display_name: `Scale User ${pad(oneBased, 3)}`,
    };
    users.push(user);
    rows.push({
      user_id: user.user_id,
      home_workspace_id: seedContext.workspace.workspace_id,
      username: user.username,
      display_name: user.display_name,
      alt_email: "",
      timezone: pick(["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"], index),
      password: hashedPassword,
      theme_mode: pick(["light", "dark"], index),
      user_status: index % 29 === 0 ? "inactive" : "active",
      protected_user: "no",
      active_workspace_id: seedContext.workspace.workspace_id,
    });
  }

  await insertRows(transaction, "users", [
    "user_id",
    "home_workspace_id",
    "username",
    "display_name",
    "alt_email",
    "timezone",
    "password",
    "theme_mode",
    "user_status",
    "protected_user",
    "active_workspace_id",
  ], rows);

  const now = isoAt(1);
  await insertRows(transaction, "user_workspaces", [
    "user_workspace_id",
    "user_id",
    "workspace_id",
    "status",
    "created_at",
    "updated_at",
  ], users.slice(1).map((user, index) => ({
    user_workspace_id: idFor("scale-membership", index + 1),
    user_id: user.user_id,
    workspace_id: seedContext.workspace.workspace_id,
    status: rows[index]?.user_status === "inactive" ? "inactive" : "active",
    created_at: now,
    updated_at: now,
  })));

  await insertRows(transaction, "user_workspace_creation_permissions", [
    "user_id",
    "can_create_workspaces",
    "allowed_workspace_types_json",
    "created_at",
    "updated_at",
  ], users.slice(1).map((user, index) => ({
    user_id: user.user_id,
    can_create_workspaces: index < 2 ? 1 : 0,
    allowed_workspace_types_json: index < 2 ? JSON.stringify(["business", "personal", "family"]) : JSON.stringify(["business"]),
    created_at: now,
    updated_at: now,
  })));

  return users;
}

async function seedClients(db, profile, seedContext) {
  const rows = Array.from({ length: profile.clients }, (_, index) => {
    const oneBased = index + 1;
    const now = isoAt(index);
    return {
      id: idFor("scale-client", oneBased),
      workspace_id: seedContext.workspace.workspace_id,
      parent_client_id: index > 0 && index % 7 === 0 ? idFor("scale-client", Math.max(1, oneBased - 3)) : null,
      name: `Scale Client ${pad(oneBased, 4)}`,
      status: index % 23 === 0 ? "Inactive" : "Active",
      billable: index % 5 === 0 ? "no" : "yes",
      billing_rate: String(95 + (index % 8) * 15),
      billing_period_type: pick(["monthly", "weekly", "custom"], index),
      billing_period_start_day: (index % 28) + 1,
      billing_rounding_enabled: index % 3 === 0 ? 1 : 0,
      billing_rounding_increment: pick(["0.25", "0.5", "1"], index),
      billing_contact_name: `Client Contact ${oneBased}`,
      billing_contact_email: `billing${pad(oneBased, 4)}@example.test`,
      billing_contact_alternate_name: "",
      billing_contact_alternate_email: "",
      billing_contact_phone_number: "",
      billing_contact_alternate_phone_number: "",
      billing_contact_street_address_1: "",
      billing_contact_street_address_2: "",
      billing_contact_city: "",
      billing_contact_state: "",
      billing_contact_zip_code: "",
      created_at: now,
      updated_at: now,
    };
  });

  await insertRows(db, "clients", [
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
  ], rows);

  return rows;
}

async function seedProjects(db, profile, seedContext, clients) {
  const rows = Array.from({ length: profile.projects }, (_, index) => {
    const oneBased = index + 1;
    const client = clients[index % clients.length];
    const now = isoAt(index);
    return {
      id: idFor("scale-project", oneBased),
      workspace_id: seedContext.workspace.workspace_id,
      client_id: index % 11 === 0 ? null : client.id,
      parent_project_id: index > 4 && index % 13 === 0 ? idFor("scale-project", Math.max(1, oneBased - 5)) : null,
      name: `Scale Project ${pad(oneBased, 5)}`,
      status: index % 31 === 0 ? "Inactive" : "Active",
      billable: index % 6 === 0 ? "no" : "yes",
      billing_rate: String(110 + (index % 10) * 10),
      billing_period_type: pick(["monthly", "weekly", "custom"], index),
      billing_period_start_day: (index % 28) + 1,
      billing_rounding_enabled: index % 4 === 0 ? 1 : 0,
      billing_rounding_increment: pick(["0.25", "0.5", "1"], index),
      created_at: now,
      updated_at: now,
      task_default_priority: pick(["low", "normal", "high", "urgent"], index),
      task_default_status: pick(["open", "in_progress", "blocked"], index),
      task_default_sort_order_json: JSON.stringify(["due_date", "priority", "status"]),
      task_default_assignee_mode: pick(["creator", "project_admin", "none"], index),
    };
  });

  await insertRows(db, "projects", [
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
    "created_at",
    "updated_at",
    "task_default_priority",
    "task_default_status",
    "task_default_sort_order_json",
    "task_default_assignee_mode",
  ], rows);

  return rows;
}

async function seedTags(db, profile, seedContext, users) {
  const rows = Array.from({ length: profile.tags }, (_, index) => {
    const oneBased = index + 1;
    const now = isoAt(index);
    return {
      tag_id: idFor("scale-tag", oneBased),
      workspace_id: seedContext.workspace.workspace_id,
      name: `Scale Tag ${pad(oneBased, 3)}`,
      slug: `scale-tag-${pad(oneBased, 3)}`,
      description: `Scale seed tag ${oneBased}`,
      color: pick(["#2563eb", "#16a34a", "#dc2626", "#7c3aed", "#0891b2", "#ca8a04"], index),
      status: index % 37 === 0 ? "archived" : "active",
      created_by_user_id: users[index % users.length].user_id,
      created_at: now,
      updated_at: now,
    };
  });

  await insertRows(db, "tags", [
    "tag_id",
    "workspace_id",
    "name",
    "slug",
    "description",
    "color",
    "status",
    "created_by_user_id",
    "created_at",
    "updated_at",
  ], rows);

  return rows;
}

async function seedTasks(db, profile, seedContext, users, clients, projects) {
  const rows = Array.from({ length: profile.tasks }, (_, index) => {
    const oneBased = index + 1;
    const project = projects[index % projects.length];
    const clientId = project.client_id || clients[index % clients.length].id;
    const status = pick(["open", "in_progress", "blocked", "complete", "archived"], index);
    const completed = status === "complete";
    const archived = status === "archived";
    const now = isoAt(index);
    return {
      task_id: idFor("scale-task", oneBased),
      workspace_id: seedContext.workspace.workspace_id,
      client_id: clientId,
      project_id: project.id,
      title: `Scale Task ${pad(oneBased, 6)}`,
      description: `Seeded task ${oneBased} for bounded query and paging verification.`,
      status,
      priority: pick(["low", "normal", "high", "urgent"], index),
      due_date: index % 5 === 0 ? null : localDate(index - 15),
      due_time: index % 4 === 0 ? null : `${pad(8 + (index % 9), 2)}:${pad((index * 7) % 60, 2)}`,
      due_timezone: "America/New_York",
      due_at_utc: index % 5 === 0 ? null : isoAt(index + 240),
      source_type: "manual",
      source_id: null,
      archived_at: archived ? now : null,
      completed_at: completed ? now : null,
      created_by_user_id: users[index % users.length].user_id,
      updated_by_user_id: users[(index + 1) % users.length].user_id,
      completed_by_user_id: completed ? users[(index + 2) % users.length].user_id : null,
      archived_by_user_id: archived ? users[(index + 3) % users.length].user_id : null,
      reminder_override_enabled: index % 9 === 0 ? 1 : 0,
      recurrence_template_id: null,
      recurrence_instance_date: null,
      billable: index % 6 === 0 ? "no" : "yes",
      created_at: now,
      updated_at: isoAt(index + 1),
      next_action: index % 3 === 0 ? "Review the next useful action." : "",
      blocked_reason: status === "blocked" ? "Waiting for a decision or source material." : "",
      resume_note: index % 7 === 0 ? "Resume from the latest work context." : "",
      last_worked_at: index % 2 === 0 ? isoAt(index + 2) : null,
    };
  });

  await insertRows(db, "tasks", [
    "task_id",
    "workspace_id",
    "client_id",
    "project_id",
    "title",
    "description",
    "status",
    "priority",
    "due_date",
    "due_time",
    "due_timezone",
    "due_at_utc",
    "source_type",
    "source_id",
    "archived_at",
    "completed_at",
    "created_by_user_id",
    "updated_by_user_id",
    "completed_by_user_id",
    "archived_by_user_id",
    "reminder_override_enabled",
    "recurrence_template_id",
    "recurrence_instance_date",
    "billable",
    "created_at",
    "updated_at",
    "next_action",
    "blocked_reason",
    "resume_note",
    "last_worked_at",
  ], rows);

  await insertRows(db, "task_assignees", [
    "task_assignee_id",
    "workspace_id",
    "task_id",
    "assignee_type",
    "user_id",
    "role_id",
    "assigned_by_user_id",
    "assigned_at",
    "removed_at",
  ], rows.filter((_, index) => index % 3 !== 0).map((task, index) => ({
    task_assignee_id: idFor("scale-task-assignee", index + 1),
    workspace_id: seedContext.workspace.workspace_id,
    task_id: task.task_id,
    assignee_type: "user",
    user_id: users[(index + 1) % users.length].user_id,
    role_id: null,
    assigned_by_user_id: users[0].user_id,
    assigned_at: task.created_at,
    removed_at: null,
  })));

  return rows;
}

async function seedNotes(db, profile, seedContext, users, clients, projects, tasks) {
  const rows = Array.from({ length: profile.notes }, (_, index) => {
    const oneBased = index + 1;
    const project = projects[index % projects.length];
    const task = tasks[index % tasks.length];
    const title = `Scale Note ${pad(oneBased, 6)}`;
    const body = `# ${title}\n\nThis seeded note preserves work context for scale testing.\n\nNext action: review related task ${task.title}.`;
    const now = isoAt(index);
    return {
      note_id: idFor("scale-note", oneBased),
      workspace_id: seedContext.workspace.workspace_id,
      title,
      slug: `scale-note-${pad(oneBased, 6)}`,
      body_markdown: body,
      body_excerpt: body.slice(0, 180),
      body_plaintext_index: `${title} seeded note work context related task ${task.title}`,
      note_type: pick(["general", "meeting", "research", "decision", "procedure", "reference", "idea", "log", "client", "project", "task"], index),
      library_bucket: pick(["active_work", "ongoing_area", "reference"], index),
      library_bucket_source: "manual",
      status: pick(["active", "active", "active", "pinned", "archived"], index),
      visibility: pick(["internal", "workspace", "private"], index),
      security_mode: "normal",
      secure_payload: null,
      secure_payload_version: null,
      encrypted_data_key: null,
      encryption_key_version: null,
      encryption_algorithm: null,
      key_wrapping_algorithm: null,
      encryption_nonce: null,
      encryption_auth_tag: null,
      key_wrapping_nonce: null,
      key_wrapping_auth_tag: null,
      encrypted_at: null,
      client_id: index % 4 === 0 ? null : (project.client_id || clients[index % clients.length].id),
      project_id: project.id,
      task_id: index % 2 === 0 ? task.task_id : null,
      ticket_id: null,
      linked_user_id: users[index % users.length].user_id,
      note_collection_id: null,
      owner_user_id: users[index % users.length].user_id,
      created_by_user_id: users[index % users.length].user_id,
      updated_by_user_id: users[(index + 1) % users.length].user_id,
      created_at: now,
      updated_at: isoAt(index + 1),
      archived_at: index % 5 === 4 ? isoAt(index + 1) : null,
      deleted_at: null,
      metadata_json: JSON.stringify({ source: SEED_SOURCE, profile: "scale" }),
      import_source: null,
      import_source_id: null,
      import_source_path: null,
      imported_at: null,
      import_batch_id: null,
      original_notebook: null,
      original_section_group: null,
      original_section: null,
      original_page_id: null,
    };
  });

  await insertRows(db, "notes", [
    "note_id",
    "workspace_id",
    "title",
    "slug",
    "body_markdown",
    "body_excerpt",
    "body_plaintext_index",
    "note_type",
    "library_bucket",
    "library_bucket_source",
    "status",
    "visibility",
    "security_mode",
    "secure_payload",
    "secure_payload_version",
    "encrypted_data_key",
    "encryption_key_version",
    "encryption_algorithm",
    "key_wrapping_algorithm",
    "encryption_nonce",
    "encryption_auth_tag",
    "key_wrapping_nonce",
    "key_wrapping_auth_tag",
    "encrypted_at",
    "client_id",
    "project_id",
    "task_id",
    "ticket_id",
    "linked_user_id",
    "note_collection_id",
    "owner_user_id",
    "created_by_user_id",
    "updated_by_user_id",
    "created_at",
    "updated_at",
    "archived_at",
    "deleted_at",
    "metadata_json",
    "import_source",
    "import_source_id",
    "import_source_path",
    "imported_at",
    "import_batch_id",
    "original_notebook",
    "original_section_group",
    "original_section",
    "original_page_id",
  ], rows);

  return rows;
}

async function seedLists(db, profile, seedContext, users, clients, projects) {
  const rows = Array.from({ length: profile.lists }, (_, index) => {
    const oneBased = index + 1;
    const project = projects[index % projects.length];
    const status = pick(["active", "active", "active", "completed", "finalized", "archived"], index);
    const now = isoAt(index);
    return {
      list_id: idFor("scale-list", oneBased),
      workspace_id: seedContext.workspace.workspace_id,
      client_id: index % 5 === 0 ? null : (project.client_id || clients[index % clients.length].id),
      project_id: project.id,
      title: `Scale List ${pad(oneBased, 5)}`,
      description: "Seeded operational list for bounded list testing.",
      list_type: pick(["shopping", "procurement", "packing", "supplies", "parts", "checklist", "bill_of_materials"], index),
      status,
      is_reusable: index % 9 === 0 ? 1 : 0,
      source_list_id: null,
      duplicated_from_list_id: null,
      created_by_user_id: users[index % users.length].user_id,
      updated_by_user_id: users[(index + 1) % users.length].user_id,
      finalized_by_user_id: status === "finalized" ? users[(index + 2) % users.length].user_id : null,
      created_at: now,
      updated_at: isoAt(index + 1),
      completed_at: status === "completed" ? isoAt(index + 1) : null,
      finalized_at: status === "finalized" ? isoAt(index + 1) : null,
      archived_at: status === "archived" ? isoAt(index + 1) : null,
      deleted_at: null,
      metadata_json: JSON.stringify({ source: SEED_SOURCE }),
    };
  });

  await insertRows(db, "lists", [
    "list_id",
    "workspace_id",
    "client_id",
    "project_id",
    "title",
    "description",
    "list_type",
    "status",
    "is_reusable",
    "source_list_id",
    "duplicated_from_list_id",
    "created_by_user_id",
    "updated_by_user_id",
    "finalized_by_user_id",
    "created_at",
    "updated_at",
    "completed_at",
    "finalized_at",
    "archived_at",
    "deleted_at",
    "metadata_json",
  ], rows);

  return rows;
}

async function seedListItems(db, profile, seedContext, users, lists) {
  const rows = Array.from({ length: profile.listItems }, (_, index) => {
    const oneBased = index + 1;
    const list = lists[index % lists.length];
    const status = pick(["needed", "planned", "ordered", "received", "cancelled", "not_needed"], index);
    const now = isoAt(index);
    return {
      list_item_id: idFor("scale-list-item", oneBased),
      workspace_id: seedContext.workspace.workspace_id,
      list_id: list.list_id,
      catalog_item_id: null,
      item_name: `Scale List Item ${pad(oneBased, 6)}`,
      quantity: (index % 6) + 1,
      unit: pick(["each", "box", "case", "hour", "set"], index),
      needed_by_date: localDate(index + 3),
      vendor_name: index % 4 === 0 ? "" : `Vendor ${pad((index % 25) + 1, 2)}`,
      url: "",
      estimated_cost: Number(((index % 20) * 7.5).toFixed(2)),
      actual_cost: status === "received" ? Number(((index % 20) * 7.25).toFixed(2)) : null,
      purchase_status: status,
      tracking_id: "",
      notes: index % 5 === 0 ? "Seeded list item note." : "",
      assigned_user_id: users[index % users.length].user_id,
      created_by_user_id: users[index % users.length].user_id,
      updated_by_user_id: users[(index + 1) % users.length].user_id,
      checked_at: status === "received" ? isoAt(index + 1) : null,
      checked_by_user_id: status === "received" ? users[(index + 2) % users.length].user_id : null,
      completed_at: status === "received" ? isoAt(index + 1) : null,
      completed_by_user_id: status === "received" ? users[(index + 2) % users.length].user_id : null,
      sort_order: index,
      created_at: now,
      updated_at: isoAt(index + 1),
      deleted_at: null,
      metadata_json: JSON.stringify({ source: SEED_SOURCE }),
    };
  });

  await insertRows(db, "list_items", [
    "list_item_id",
    "workspace_id",
    "list_id",
    "catalog_item_id",
    "item_name",
    "quantity",
    "unit",
    "needed_by_date",
    "vendor_name",
    "url",
    "estimated_cost",
    "actual_cost",
    "purchase_status",
    "tracking_id",
    "notes",
    "assigned_user_id",
    "created_by_user_id",
    "updated_by_user_id",
    "checked_at",
    "checked_by_user_id",
    "completed_at",
    "completed_by_user_id",
    "sort_order",
    "created_at",
    "updated_at",
    "deleted_at",
    "metadata_json",
  ], rows);

  return rows;
}

async function seedFiles(db, profile, seedContext, users, clients, projects, tasks, notes, lists) {
  const rows = Array.from({ length: profile.files }, (_, index) => {
    const oneBased = index + 1;
    const extension = pick(["md", "txt", "pdf", "png", "csv"], index);
    const filename = `scale-file-${pad(oneBased, 6)}.${extension}`;
    const now = isoAt(index);
    return {
      file_id: idFor("scale-file", oneBased),
      workspace_id: seedContext.workspace.workspace_id,
      storage_provider: "local",
      storage_key: `scale-seed/${seedContext.workspace.workspace_id}/${filename}`,
      original_filename: filename,
      stored_filename: filename,
      display_name: `Scale File ${pad(oneBased, 6)}`,
      extension,
      mime_type_claimed: mimeForExtension(extension),
      mime_type_detected: mimeForExtension(extension),
      file_size_bytes: 1024 + (index % 2048) * 13,
      sha256_hash: createHash("sha256").update(filename).digest("hex"),
      status: pick(["available", "available", "available", "pending", "quarantined", "deleted"], index),
      scan_status: pick(["not_required", "passed", "passed", "pending", "failed"], index),
      quarantine_reason: index % 6 === 4 ? "Seeded review state." : null,
      uploaded_by_user_id: users[index % users.length].user_id,
      created_at: now,
      updated_at: isoAt(index + 1),
      deleted_at: index % 6 === 5 ? isoAt(index + 1) : null,
      metadata_json: JSON.stringify({ source: SEED_SOURCE }),
      storage_kind: "internal",
      external_source_provider: null,
      external_source_id: null,
      external_availability_status: "not_external",
      external_reported_bytes: 0,
    };
  });

  await insertRows(db, "files", [
    "file_id",
    "workspace_id",
    "storage_provider",
    "storage_key",
    "original_filename",
    "stored_filename",
    "display_name",
    "extension",
    "mime_type_claimed",
    "mime_type_detected",
    "file_size_bytes",
    "sha256_hash",
    "status",
    "scan_status",
    "quarantine_reason",
    "uploaded_by_user_id",
    "created_at",
    "updated_at",
    "deleted_at",
    "metadata_json",
    "storage_kind",
    "external_source_provider",
    "external_source_id",
    "external_availability_status",
    "external_reported_bytes",
  ], rows);

  const targetFamilies = [
    { module_id: "tasks", target_type: "task", rows: tasks, key: "task_id" },
    { module_id: "notes", target_type: "note", rows: notes, key: "note_id" },
    { module_id: "lists", target_type: "list", rows: lists, key: "list_id" },
  ];
  const attachmentRows = rows.map((file, index) => {
    const family = targetFamilies[index % targetFamilies.length];
    const target = family.rows[index % family.rows.length];
    const project = projects[index % projects.length];
    return {
      file_attachment_id: idFor("scale-file-attachment", index + 1),
      workspace_id: seedContext.workspace.workspace_id,
      file_id: file.file_id,
      module_id: family.module_id,
      target_type: family.target_type,
      target_id: target[family.key],
      client_id: project.client_id || clients[index % clients.length].id,
      project_id: project.id,
      visibility: "private",
      attachment_role: "reference",
      caption: `Attached source material ${index + 1}`,
      sort_order: index,
      attached_by_user_id: users[index % users.length].user_id,
      created_at: file.created_at,
      removed_at: file.status === "deleted" ? file.deleted_at : null,
      metadata_json: JSON.stringify({ source: SEED_SOURCE }),
    };
  });

  await insertRows(db, "file_attachments", [
    "file_attachment_id",
    "workspace_id",
    "file_id",
    "module_id",
    "target_type",
    "target_id",
    "client_id",
    "project_id",
    "visibility",
    "attachment_role",
    "caption",
    "sort_order",
    "attached_by_user_id",
    "created_at",
    "removed_at",
    "metadata_json",
  ], attachmentRows);

  return rows;
}

async function seedTimeEntries(db, profile, seedContext, users, clients, projects, tasks) {
  const rows = Array.from({ length: profile.timeEntries }, (_, index) => {
    const oneBased = index + 1;
    const user = users[index % users.length];
    const project = projects[index % projects.length];
    const client = clients.find((item) => item.id === project.client_id) || clients[index % clients.length];
    const durationSeconds = 900 + (index % 8) * 900;
    return {
      entry_id: idFor("scale-time-entry", oneBased),
      workspace_id: seedContext.workspace.workspace_id,
      user_id: user.user_id,
      client_id: client.id,
      client_name: client.name,
      project_id: project.id,
      project_name: project.name,
      description: `Scale time entry ${pad(oneBased, 6)}`,
      start_time: isoAt(index),
      end_time: isoAt(index, 15 + (index % 8) * 15),
      duration_seconds: durationSeconds,
      duration_hours: (durationSeconds / 3600).toFixed(2),
      billable: index % 5 === 0 ? "no" : "yes",
      invoice_status: pick(["unbilled", "draft", "invoiced", "paid"], index),
      task_id: index % 4 === 0 ? tasks[index % tasks.length].task_id : null,
      created_at: isoAt(index),
      updated_at: isoAt(index + 1),
    };
  });

  await insertRows(db, "time_entries", [
    "entry_id",
    "workspace_id",
    "user_id",
    "client_id",
    "client_name",
    "project_id",
    "project_name",
    "description",
    "start_time",
    "end_time",
    "duration_seconds",
    "duration_hours",
    "billable",
    "invoice_status",
    "task_id",
    "created_at",
    "updated_at",
  ], rows);
}

async function seedRoleAssignments(db, profile, seedContext, users, clients, projects) {
  const now = isoAt(2);
  const rows = users.slice(1).map((user, index) => {
    const oneBased = index + 1;
    const roleShape = roleForSeedUser(index, profile.users);
    const project = projects[index % projects.length];
    const client = clients[index % clients.length];
    return {
      assignment_id: idFor("scale-role-assignment", oneBased),
      workspace_id: seedContext.workspace.workspace_id,
      user_id: user.user_id,
      role_id: roleShape.role_id,
      scope_type: roleShape.scope_type,
      scope_id: roleShape.scope_type === "workspace"
        ? seedContext.workspace.workspace_id
        : roleShape.scope_type === "client"
          ? client.id
          : roleShape.scope_type === "project"
            ? project.id
            : roleShape.scope_id,
      client_id: roleShape.scope_type === "client" ? client.id : project.client_id,
      project_id: roleShape.scope_type === "project" ? project.id : null,
      permission_overrides_json: null,
      created_at: now,
      updated_at: now,
    };
  });

  await insertRows(db, "user_role_assignments", [
    "assignment_id",
    "workspace_id",
    "user_id",
    "role_id",
    "scope_type",
    "scope_id",
    "client_id",
    "project_id",
    "permission_overrides_json",
    "created_at",
    "updated_at",
  ], rows);
}

function roleForSeedUser(index, totalUsers) {
  if (index < Math.max(2, Math.ceil(totalUsers * 0.08))) {
    return { role_id: "workspace_admin", scope_type: "workspace" };
  }

  if (index % 5 === 0) {
    return { role_id: "client_admin", scope_type: "client" };
  }

  if (index % 2 === 0) {
    return { role_id: "client_user", scope_type: "client" };
  }

  return { role_id: "project_user", scope_type: "project" };
}

async function seedTagAssignments(db, seedContext, users, tags, tasks, notes, lists, files) {
  const targets = [
    ...tasks.filter((_, index) => index % 10 === 0).map((task) => ({ target_type: "task", target_id: task.task_id })),
    ...notes.filter((_, index) => index % 10 === 0).map((note) => ({ target_type: "note", target_id: note.note_id })),
    ...lists.filter((_, index) => index % 5 === 0).map((list) => ({ target_type: "list", target_id: list.list_id })),
    ...files.filter((_, index) => index % 5 === 0).map((file) => ({ target_type: "file", target_id: file.file_id })),
  ];

  await insertRows(db, "tag_assignments", [
    "tag_assignment_id",
    "workspace_id",
    "tag_id",
    "target_type",
    "target_id",
    "created_by_user_id",
    "source",
    "source_assignment_id",
    "source_target_type",
    "source_target_id",
    "propagation_rule_id",
    "created_at",
  ], targets.map((target, index) => ({
    tag_assignment_id: idFor("scale-tag-assignment", index + 1),
    workspace_id: seedContext.workspace.workspace_id,
    tag_id: tags[index % tags.length].tag_id,
    target_type: target.target_type,
    target_id: target.target_id,
    created_by_user_id: users[index % users.length].user_id,
    source: "manual",
    source_assignment_id: null,
    source_target_type: null,
    source_target_id: null,
    propagation_rule_id: null,
    created_at: isoAt(index),
  })));
}

async function seedNotifications(db, profile, seedContext, users, tasks, notes, lists) {
  const rows = Array.from({ length: profile.notifications }, (_, index) => {
    const oneBased = index + 1;
    const target = pick([
      { module_id: "tasks", record_type: "task", record_id: tasks[index % tasks.length].task_id },
      { module_id: "notes", record_type: "note", record_id: notes[index % notes.length].note_id },
      { module_id: "lists", record_type: "list", record_id: lists[index % lists.length].list_id },
    ], index);
    const status = pick(["unread", "read", "dismissed", "archived"], index);
    return {
      notification_id: idFor("scale-notification", oneBased),
      workspace_id: seedContext.workspace.workspace_id,
      module_id: target.module_id,
      event_type: pick(["task.updated", "note.updated", "list.ready", "file.review"], index),
      recipient_user_id: users[index % users.length].user_id,
      actor_user_id: users[(index + 1) % users.length].user_id,
      record_type: target.record_type,
      record_id: target.record_id,
      title: `Scale Notification ${pad(oneBased, 6)}`,
      body: "Seeded notification for attention recovery and bounded list testing.",
      url: `${target.module_id}.html`,
      status,
      priority: pick(["low", "normal", "high", "urgent"], index),
      created_at: isoAt(index),
      read_at: status === "read" ? isoAt(index + 1) : null,
      dismissed_at: status === "dismissed" ? isoAt(index + 1) : null,
      metadata_json: JSON.stringify({ source: SEED_SOURCE }),
    };
  });

  await insertRows(db, "notifications", [
    "notification_id",
    "workspace_id",
    "module_id",
    "event_type",
    "recipient_user_id",
    "actor_user_id",
    "record_type",
    "record_id",
    "title",
    "body",
    "url",
    "status",
    "priority",
    "created_at",
    "read_at",
    "dismissed_at",
    "metadata_json",
  ], rows);
}

async function seedSearchIndex(db, seedContext, clients, projects, tasks, notes, lists, files) {
  const searchRows = [
    ...clients.map((client, index) => searchRow({
      index,
      seedContext,
      module_id: "client-projects",
      record_type: "client",
      record_id: client.id,
      title: client.name,
      body: "Seeded client for scale search.",
      client_id: client.id,
      project_id: null,
      record_status: client.status === "Active" ? "active" : "inactive",
    })),
    ...projects.map((project, index) => searchRow({
      index: clients.length + index,
      seedContext,
      module_id: "client-projects",
      record_type: "project",
      record_id: project.id,
      title: project.name,
      body: "Seeded project for scale search.",
      client_id: project.client_id,
      project_id: project.id,
      record_status: project.status === "Active" ? "active" : "inactive",
    })),
    ...tasks.map((task, index) => searchRow({
      index: clients.length + projects.length + index,
      seedContext,
      module_id: "tasks",
      record_type: "task",
      record_id: task.task_id,
      title: task.title,
      body: task.description,
      client_id: task.client_id,
      project_id: task.project_id,
      record_status: task.status === "archived" ? "archived" : "active",
    })),
    ...notes.map((note, index) => searchRow({
      index: clients.length + projects.length + tasks.length + index,
      seedContext,
      module_id: "notes",
      record_type: "note",
      record_id: note.note_id,
      title: note.title,
      body: note.body_plaintext_index,
      client_id: note.client_id,
      project_id: note.project_id,
      record_status: note.status === "archived" ? "archived" : "active",
      library_bucket: note.library_bucket,
    })),
    ...lists.map((list, index) => searchRow({
      index: clients.length + projects.length + tasks.length + notes.length + index,
      seedContext,
      module_id: "lists",
      record_type: "list",
      record_id: list.list_id,
      title: list.title,
      body: list.description,
      client_id: list.client_id,
      project_id: list.project_id,
      record_status: ["archived", "deleted"].includes(list.status) ? "archived" : "active",
    })),
    ...files.map((file, index) => searchRow({
      index: clients.length + projects.length + tasks.length + notes.length + lists.length + index,
      seedContext,
      module_id: "framework",
      record_type: "file",
      record_id: file.file_id,
      title: file.display_name,
      body: file.original_filename,
      client_id: null,
      project_id: null,
      record_status: file.status === "deleted" ? "archived" : "active",
    })),
  ];

  await insertRows(db, "search_index", [
    "search_index_id",
    "workspace_id",
    "module_id",
    "record_type",
    "record_id",
    "title",
    "summary",
    "body",
    "tags_text",
    "client_id",
    "project_id",
    "visibility",
    "record_status",
    "source",
    "record_created_at",
    "record_updated_at",
    "indexed_at",
    "library_bucket",
    "note_collection_id",
    "collection_path",
  ], searchRows);
}

function searchRow({
  index,
  seedContext,
  module_id,
  record_type,
  record_id,
  title,
  body,
  client_id,
  project_id,
  record_status,
  library_bucket = null,
}) {
  return {
    search_index_id: idFor("scale-search", index + 1),
    workspace_id: seedContext.workspace.workspace_id,
    module_id,
    record_type,
    record_id,
    title,
    summary: String(body || "").slice(0, 180),
    body: body || "",
    tags_text: "scale seeded",
    client_id,
    project_id,
    visibility: "normal",
    record_status,
    source: SEED_SOURCE,
    record_created_at: isoAt(index),
    record_updated_at: isoAt(index + 1),
    indexed_at: isoAt(index + 2),
    library_bucket,
    note_collection_id: null,
    collection_path: null,
  };
}

async function seedAuditLogs(db, profile, seedContext, users, clients, projects, tasks, notes, lists, files) {
  const targetFamilies = [
    { record_type: "client", rows: clients, idKey: "id", labelKey: "name" },
    { record_type: "project", rows: projects, idKey: "id", labelKey: "name" },
    { record_type: "task", rows: tasks, idKey: "task_id", labelKey: "title" },
    { record_type: "note", rows: notes, idKey: "note_id", labelKey: "title" },
    { record_type: "list", rows: lists, idKey: "list_id", labelKey: "title" },
    { record_type: "file", rows: files, idKey: "file_id", labelKey: "display_name" },
  ];
  const rows = Array.from({ length: profile.auditLogs }, (_, index) => {
    const oneBased = index + 1;
    const family = targetFamilies[index % targetFamilies.length];
    const record = family.rows[index % family.rows.length];
    return {
      audit_id: idFor("scale-audit", oneBased),
      workspace_id: seedContext.workspace.workspace_id,
      created_at: isoAt(index),
      actor_user_id: users[index % users.length].user_id,
      actor_user_name: users[index % users.length].username,
      action: pick(["created", "updated", "viewed", "reviewed", "restored"], index),
      change_type: pick(["create", "update", "read", "lifecycle"], index),
      record_type: family.record_type,
      record_id: record[family.idKey],
      record_label: record[family.labelKey],
      record_url: `${family.record_type}s.html`,
      previous_value_json: index % 3 === 0 ? JSON.stringify({ status: "previous" }) : null,
      new_value_json: JSON.stringify({ status: "seeded", index: oneBased }),
      metadata_json: JSON.stringify({ source: SEED_SOURCE, profile: "scale" }),
      ip_address: `10.0.${Math.floor(index / 255) % 255}.${index % 255}`,
    };
  });

  await insertRows(db, "audit_logs", [
    "audit_id",
    "workspace_id",
    "created_at",
    "actor_user_id",
    "actor_user_name",
    "action",
    "change_type",
    "record_type",
    "record_id",
    "record_label",
    "record_url",
    "previous_value_json",
    "new_value_json",
    "metadata_json",
    "ip_address",
  ], rows, 250);
}

async function recordScaleSeedRun(db, profile, profileName, seedContext) {
  await insertRows(db, SCALE_MARKER_TABLE, [
    "scale_seed_run_id",
    "workspace_id",
    "profile",
    "provider",
    "seeded_at",
    "expected_counts_json",
    "metadata_json",
  ], [{
    scale_seed_run_id: idFor("scale-seed-run", 1),
    workspace_id: seedContext.workspace.workspace_id,
    profile: profileName,
    provider: "sqlite",
    seeded_at: new Date().toISOString(),
    expected_counts_json: JSON.stringify(expectedCounts(profile)),
    metadata_json: JSON.stringify({ source: SEED_SOURCE }),
  }]);
}

async function verifySeed({ db, permissionsService, profile, seedContext }) {
  const expected = expectedCounts(profile);
  const actual = await countTables(db, Object.keys(expected));
  const mismatches = Object.entries(expected)
    .filter(([table, expectedCount]) => actual[table] !== expectedCount);

  if (mismatches.length > 0) {
    const details = mismatches
      .map(([table, expectedCount]) => `${table}: expected ${expectedCount}, got ${actual[table]}`)
      .join("; ");
    throw new Error(`Scale seed count verification failed: ${details}`);
  }

  const permissionSanity = await verifyPermissionSanity(db, permissionsService, seedContext.workspace.workspace_id);
  const searchSanity = await verifySearchSanity(db, seedContext.workspace.workspace_id, profile);

  return {
    actualCounts: actual,
    expectedCounts: expected,
    permissionSanity,
    searchSanity,
  };
}

function expectedCounts(profile) {
  return {
    workspaces: profile.workspaces,
    users: profile.users,
    user_workspaces: profile.users,
    user_role_assignments: profile.users,
    clients: profile.clients,
    projects: profile.projects,
    tasks: profile.tasks,
    notes: profile.notes,
    lists: profile.lists,
    list_items: profile.listItems,
    tags: profile.tags,
    notifications: profile.notifications,
    audit_logs: profile.auditLogs,
    files: profile.files,
    file_attachments: profile.files,
    time_entries: profile.timeEntries,
    search_index: profile.clients + profile.projects + profile.tasks + profile.notes + profile.lists + profile.files,
  };
}

async function verifyPermissionSanity(db, permissionsService, workspaceId) {
  const superAdmin = await db.get(`
SELECT users.user_id
FROM users
INNER JOIN user_role_assignments
  ON user_role_assignments.user_id = users.user_id
WHERE users.home_workspace_id = :workspaceId
  AND users.protected_user = 'yes'
  AND user_role_assignments.role_id = 'super_admin'
LIMIT 1;
`, { workspaceId });
  const workspaceAdmin = await db.get(`
SELECT users.user_id
FROM users
INNER JOIN user_role_assignments
  ON user_role_assignments.user_id = users.user_id
WHERE users.home_workspace_id = :workspaceId
  AND user_role_assignments.workspace_id = :workspaceId
  AND user_role_assignments.role_id = 'workspace_admin'
LIMIT 1;
`, { workspaceId });

  if (!superAdmin?.user_id) {
    throw new Error("Scale seed permission sanity failed: missing protected super_admin assignment.");
  }

  if (!workspaceAdmin?.user_id) {
    throw new Error("Scale seed permission sanity failed: missing workspace_admin assignment.");
  }

  const superAdminCanManageSettings = await permissionsService.can({
    workspace_id: workspaceId,
    user_id: superAdmin.user_id,
  }, "workspace_settings.manage", { workspace_id: workspaceId });
  const workspaceAdminCanViewTasks = await permissionsService.can({
    workspace_id: workspaceId,
    user_id: workspaceAdmin.user_id,
  }, "tasks.view", { workspace_id: workspaceId });

  if (!superAdminCanManageSettings || !workspaceAdminCanViewTasks) {
    throw new Error("Scale seed permission sanity failed: expected admin permissions were not granted.");
  }

  return {
    superAdminCanManageSettings,
    workspaceAdminCanViewTasks,
  };
}

async function verifySearchSanity(db, workspaceId, profile) {
  const taskSearch = await db.get(`
SELECT COUNT(*) AS count
FROM search_index
WHERE workspace_id = :workspaceId
  AND module_id = 'tasks'
  AND record_type = 'task'
  AND title LIKE 'Scale Task%';
`, { workspaceId });
  const noteSearch = await db.get(`
SELECT COUNT(*) AS count
FROM search_index
WHERE workspace_id = :workspaceId
  AND module_id = 'notes'
  AND record_type = 'note'
  AND body LIKE '%work context%';
`, { workspaceId });

  if (Number(taskSearch?.count || 0) !== profile.tasks) {
    throw new Error("Scale seed search sanity failed: task search_index rows are incomplete.");
  }

  if (Number(noteSearch?.count || 0) !== profile.notes) {
    throw new Error("Scale seed search sanity failed: note search_index rows are incomplete.");
  }

  return {
    taskRows: Number(taskSearch.count),
    noteRows: Number(noteSearch.count),
  };
}

async function verifyStartupSanity(db, health, workspaceId) {
  const workspaceModules = await db.get(`
SELECT COUNT(*) AS count
FROM workspace_modules
WHERE workspace_id = :workspaceId
  AND status = 'enabled';
`, { workspaceId });

  if (health.provider !== "sqlite" || health.foreignKeysEnabled !== true) {
    throw new Error("Scale seed startup sanity failed: SQLite startup health is not healthy.");
  }

  if (Number(workspaceModules?.count || 0) === 0) {
    throw new Error("Scale seed startup sanity failed: workspace modules were not available after startup.");
  }

  return {
    foreignKeysEnabled: health.foreignKeysEnabled,
    workspaceModules: Number(workspaceModules.count),
  };
}

async function tableExists(db, tableName) {
  const row = await db.get(`
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name = :tableName
LIMIT 1;
`, { tableName });

  return Boolean(row);
}

async function countTables(db, tableNames) {
  const counts = {};

  for (const tableName of tableNames) {
    if (!(await tableExists(db, tableName))) {
      counts[tableName] = 0;
      continue;
    }

    const row = await db.get(`SELECT COUNT(*) AS count FROM ${tableName};`);
    counts[tableName] = Number(row?.count || 0);
  }

  return counts;
}

async function insertRows(db, tableName, columns, rows, chunkSize = 100) {
  if (rows.length === 0) {
    return;
  }

  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const params = {};
    const values = chunk.map((row, rowIndex) => {
      const placeholders = columns.map((column) => {
        const paramName = `${column}_${rowIndex}`;
        params[paramName] = row[column];
        return `:${paramName}`;
      });
      return `(${placeholders.join(", ")})`;
    });

    await db.run(`
INSERT INTO ${tableName} (${columns.join(", ")})
VALUES ${values.join(", ")};
`, params);
  }
}

function idFor(prefix, index) {
  return `${prefix}-${pad(index, 8)}`;
}

function pad(value, width) {
  return String(value).padStart(width, "0");
}

function pick(values, index) {
  return values[index % values.length];
}

function isoAt(index, minutes = 0) {
  return new Date(BASE_TIME_MS + (index * 17 + minutes) * 60 * 1000).toISOString();
}

function localDate(index) {
  return new Date(BASE_TIME_MS + index * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function mimeForExtension(extension) {
  return {
    csv: "text/csv",
    md: "text/markdown",
    pdf: "application/pdf",
    png: "image/png",
    txt: "text/plain",
  }[extension] || "application/octet-stream";
}

function printSeedResult(result) {
  console.log(`Scale seed complete for ${result.profile}`);
  console.log(`Provider: ${result.provider}`);
  console.log(`Database: ${result.database}`);
  console.log("Counts:");
  for (const [table, count] of Object.entries(result.actualCounts)) {
    console.log(`  ${table}: ${count}`);
  }
  console.log(`Permission sanity: super_admin workspace settings=${result.permissionSanity.superAdminCanManageSettings}, workspace_admin tasks.view=${result.permissionSanity.workspaceAdminCanViewTasks}`);
  console.log(`Search sanity: tasks=${result.searchSanity.taskRows}, notes=${result.searchSanity.noteRows}`);
  console.log(`Startup sanity: provider=${result.startup.secondStartupProvider}, foreign_keys=${result.startup.foreignKeysEnabled}, workspace_modules=${result.startup.workspaceModules}`);
}
