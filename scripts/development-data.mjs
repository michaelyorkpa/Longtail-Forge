#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertOperatorPassword,
  assertSeedDirectoryEmpty,
  DEMO_PROFILE,
  DEVELOPMENT_PROFILE,
  resetSeedTarget,
  resolveSeedTarget,
  writeSeedMarker,
} from "./lib/development-data-safety.mjs";

const BASE_DATE = "2026-07-15";
const DISABLED_PERSONA_PASSWORD = "!development-persona-login-disabled!";
const SEED_CONTRACT = "development-data-v1";
const scriptPath = fileURLToPath(import.meta.url);
let databaseApi = null;

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
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
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const target = resolveSeedTarget(options);
  if (options.command === "reset") {
    print(await resetSeedTarget(target, options.confirm));
    return;
  }
  if (options.command !== "seed") {
    throw new Error("Choose seed or reset.");
  }

  assertOperatorPassword();
  await assertSeedDirectoryEmpty(target);
  await fs.mkdir(target.filesRoot, { recursive: true });
  configureRuntime(target);
  databaseApi = await import("../src/db/index.js");
  await databaseApi.initializeDatabase();
  const result = await seed(databaseApi.db, target, options.anchorDate || BASE_DATE);
  await writeFiles(target, result.files);
  await writeSeedMarker(target, {
    contractVersion: SEED_CONTRACT,
    anchorDate: result.anchorDate,
    semanticFingerprint: result.semanticFingerprint,
  });
  print({
    ok: true,
    profile: target.profile,
    dataDir: target.dataDir,
    database: target.database,
    filesRoot: target.filesRoot,
    anchorDate: result.anchorDate,
    semanticFingerprint: result.semanticFingerprint,
    counts: result.counts,
    workbench: result.workbench,
    identities: "Seeded personas use reserved example domains and disabled login credentials. Use the unique operator password supplied through SUPER_ADMIN_PASSWORD.",
  });
}

function parseArgs(args) {
  const options = { command: args[0] };
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (["--profile", "--environment", "--data-dir", "--database", "--files-root", "--confirm", "--anchor-date"].includes(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      options[key] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.anchorDate && !/^\d{4}-\d{2}-\d{2}$/.test(options.anchorDate)) {
    throw new Error("--anchor-date must use YYYY-MM-DD.");
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/development-data.mjs seed --profile development --environment development --data-dir ./data/development-seed
  node scripts/development-data.mjs reset --profile development --environment development --data-dir ./data/development-seed --confirm development-seed

Profiles: ${DEVELOPMENT_PROFILE}, ${DEMO_PROFILE}

Seed requires a unique SUPER_ADMIN_PASSWORD environment value. Persona accounts are login-disabled and no password is printed or stored in source. The data directory must contain the profile's exact marker segment and must be empty.`);
}

function configureRuntime(target) {
  process.env.LONGTAIL_ENV = "development";
  process.env.LONGTAIL_DATABASE_PROVIDER = "sqlite";
  process.env.LONGTAIL_DATA_DIR = target.dataDir;
  process.env.LONGTAIL_DATABASE_FILE = target.database;
  process.env.LONGTAIL_LOCAL_STORAGE_ROOT = target.filesRoot;
  delete process.env.LONGTAIL_SECURE_NOTES_MASTER_KEY;
  delete process.env.SECURE_NOTES_MASTER_KEY;
}

async function seed(db, target, anchorDate) {
  const ledger = [];
  const bootstrapWorkspace = await db.get("SELECT workspace_id FROM workspaces ORDER BY created_at, workspace_id LIMIT 1;");
  const operator = await db.get("SELECT user_id FROM users WHERE protected_user = 'yes' ORDER BY username LIMIT 1;");
  if (!bootstrapWorkspace?.workspace_id || !operator?.user_id) throw new Error("Fresh development bootstrap was not created.");

  const business = bootstrapWorkspace.workspace_id;
  const personal = id("workspace", "personal");
  const family = id("workspace", "family");
  const users = {
    alex: operator.user_id,
    priya: id("user", "priya"),
    sam: id("user", "sam"),
    dana: id("user", "dana"),
    jordan: id("user", "jordan"),
  };
  const now = `${anchorDate}T14:00:00.000Z`;
  await db.transaction(async (tx) => {
    const add = createInserter(tx, ledger);
    await tx.run("UPDATE workspaces SET name = :name, workspace_type = 'business', status = 'Active', owner_user_id = :owner, updated_at = :now WHERE workspace_id = :workspace;", { name: "Northwind Studio", owner: users.alex, now, workspace: business });
    await tx.run("UPDATE users SET display_name = 'Alex Rivera', alt_email = 'alex@example.com', timezone = 'America/New_York', theme_mode = 'light' WHERE user_id = :userId;", { userId: users.alex });
    await add("workspaces", { workspace_id: personal, name: "Alex's Personal Workspace", status: "Active", workspace_type: "personal", owner_user_id: users.alex, created_at: now, updated_at: now });
    await add("workspaces", { workspace_id: family, name: "Rivera Family", status: "Active", workspace_type: "family", owner_user_id: users.alex, created_at: now, updated_at: now });

    for (const workspaceId of [personal, family]) {
      await tx.run(`INSERT INTO workspace_settings (workspace_id, audit_logging_enabled, audit_retention_days, audit_settings_updated_at, created_at, updated_at)
        SELECT :workspaceId, audit_logging_enabled, audit_retention_days, audit_settings_updated_at, :now, :now FROM workspace_settings WHERE workspace_id = :business;`, { workspaceId, business, now });
      await tx.run(`INSERT INTO workspace_modules (workspace_id, module_id, status, enabled_at, disabled_at, updated_at)
        SELECT :workspaceId, module_id, status, :now, NULL, :now FROM workspace_modules WHERE workspace_id = :business;`, { workspaceId, business, now });
      await tx.run(`INSERT INTO workspace_module_settings (workspace_id, module_id, setting_id, setting_value_json, created_at, updated_at)
        SELECT :workspaceId, module_id, setting_id, setting_value_json, :now, :now FROM workspace_module_settings WHERE workspace_id = :business;`, { workspaceId, business, now });
    }

    const personaRows = [
      [users.priya, business, "priya@example.com", "Priya Shah"],
      [users.sam, business, "sam@example.com", "Sam Okafor"],
      [users.dana, personal, "dana@example.com", "Dana Lindqvist"],
      [users.jordan, family, "jordan@example.com", "Jordan Bell"],
    ];
    for (const [userId, home, username, display] of personaRows) {
      await add("users", { user_id: userId, home_workspace_id: home, username, display_name: display, alt_email: "", timezone: "America/New_York", password: DISABLED_PERSONA_PASSWORD, theme_mode: "light", user_status: "inactive", protected_user: "no", active_workspace_id: home });
    }
    const memberships = [
      [users.alex, business], [users.alex, personal], [users.alex, family],
      [users.priya, business], [users.sam, business], [users.dana, personal], [users.jordan, family],
    ];
    for (const [userId, workspaceId] of memberships) {
      await add("user_workspaces", { user_workspace_id: id("membership", userId, workspaceId), user_id: userId, workspace_id: workspaceId, status: "active", created_at: now, updated_at: now }, { ignore: true });
    }
    const roles = [
      [business, users.alex, "workspace_admin", "workspace", business],
      [business, users.priya, "project_admin", "project", id("project", "website")],
      [business, users.sam, "project_user", "project", id("project", "maintenance")],
      [personal, users.alex, "workspace_admin", "workspace", personal],
      [family, users.alex, "workspace_admin", "workspace", family],
      [family, users.jordan, "project_user", "project", id("project", "weekend")],
    ];
    for (const [workspaceId, userId, roleId, scopeType, scopeId] of roles) {
      await add("user_role_assignments", { assignment_id: id("role", workspaceId, userId, roleId), workspace_id: workspaceId, user_id: userId, role_id: roleId, scope_type: scopeType, scope_id: scopeId, client_id: scopeType === "client" ? scopeId : null, project_id: scopeType === "project" ? scopeId : null, permission_overrides_json: null, created_at: now, updated_at: now }, { ignore: true });
    }

    const clients = [
      [id("client", "cedar"), "Cedar & Bloom"], [id("client", "maple"), "Maple Lane Cafe"], [id("client", "ridgeline"), "Ridgeline IT"],
    ];
    for (const [clientId, name] of clients) {
      await add("clients", clientRow(clientId, business, name, now));
    }
    const projects = [
      [id("project", "website"), business, id("client", "cedar"), "Website Refresh"],
      [id("project", "pos"), business, id("client", "maple"), "POS Setup"],
      [id("project", "maintenance"), business, id("client", "ridgeline"), "Monthly Maintenance"],
      [id("project", "studio"), personal, null, "Home Studio Reset"],
      [id("project", "weekend"), family, null, "Weekend Gathering"],
    ];
    for (const [projectId, workspaceId, clientId, name] of projects) {
      await add("projects", { id: projectId, workspace_id: workspaceId, client_id: clientId, parent_project_id: null, name, status: "Active", billable: workspaceId === business ? "yes" : "no", billing_rate: null, billing_period_type: null, billing_period_start_day: null, billing_rounding_enabled: null, billing_rounding_increment: null, created_at: now, updated_at: now });
    }

    const recurrenceId = id("recurrence", "maintenance-review");
    await add("task_recurrence_templates", { recurrence_template_id: recurrenceId, workspace_id: business, client_id: id("client", "ridgeline"), project_id: id("project", "maintenance"), title: "Review monthly maintenance report", description: "Check the fake monthly service summary before sharing it.", status: "open", priority: "normal", recurrence_anchor_date: date(anchorDate, -7), due_time: "10:00", due_timezone: "America/New_York", due_at_utc: `${date(anchorDate, -7)}T14:00:00.000Z`, rrule: "FREQ=MONTHLY;BYMONTHDAY=8", recurrence_end_date: null, template_status: "active", created_by_user_id: users.alex, updated_by_user_id: users.alex, created_at: now, updated_at: now });

    const tasks = taskScenarios({ anchorDate, now, business, personal, family, users, recurrenceId });
    for (const task of tasks) await add("tasks", task);
    await add("task_recurrence_assignees", { recurrence_assignee_id: id("recurrence-assignee", "maintenance"), workspace_id: business, recurrence_template_id: recurrenceId, assignee_type: "user", user_id: users.alex, role_id: null, assigned_by_user_id: users.alex, assigned_at: now, removed_at: null });
    for (const task of tasks.filter((row) => row.status !== "completed")) {
      await add("task_assignees", { task_assignee_id: id("task-assignee", task.task_id), workspace_id: task.workspace_id, task_id: task.task_id, assignee_type: "user", user_id: users.alex, role_id: null, assigned_by_user_id: users.alex, assigned_at: now, removed_at: null });
    }

    const heroTask = id("task", "hero");
    const checklist = [
      ["Confirm responsive header behavior", 1], ["Retest checkout at 380px", 0], ["Share safe findings summary", 0],
    ];
    for (let index = 0; index < checklist.length; index += 1) {
      const [label, checked] = checklist[index];
      await add("task_checklist_items", { task_checklist_item_id: id("check", index), workspace_id: business, task_id: heroTask, label, is_checked: checked, completed_at: checked ? now : null, completed_by_user_id: checked ? users.alex : null, sort_order: index, deleted_at: null, deleted_by_user_id: null, created_by_user_id: users.alex, updated_by_user_id: users.alex, created_at: now, updated_at: now });
    }
    await add("task_reminder_offsets", { reminder_offset_id: id("reminder", "hero"), workspace_id: business, target_type: "task", target_id: heroTask, due_kind: "date_time", offset_minutes: 60, sort_order: 0, created_at: now, updated_at: now });
    await add("work_resume_state", { resume_state_id: id("resume", "hero"), workspace_id: business, user_id: users.alex, module_id: "tasks", record_type: "task", record_id: heroTask, client_id: id("client", "cedar"), project_id: id("project", "website"), source_url: `workbench.html?taskId=${heroTask}`, title_snapshot: "Fix mobile checkout overlap", context_label_snapshot: "Cedar & Bloom / Website Refresh", last_action_type: "task.updated", last_action_label: "Updated checklist", last_worked_at: `${date(anchorDate, -1)}T19:10:00.000Z`, handoff_note: "Paused after isolating the narrow-width header collision.", next_action: "Retest the cart button at 380px and attach the clean capture.", blocked_reason: "", status_snapshot: "in_progress", priority_snapshot: "high", due_at_snapshot: `${anchorDate}T21:00:00.000Z`, resume_rank_hint: 100, metadata_json: JSON.stringify({ fake: true, scenario: "northwind" }), dismissed_at: null, dismissed_source_updated_at: null, created_at: now, updated_at: now });

    const tags = [["review", "Review", "#4f46e5"], ["launch", "Launch", "#059669"], ["home", "Home", "#d97706"]];
    for (const [slug, name, color] of tags) await add("tags", { tag_id: id("tag", slug), workspace_id: slug === "home" ? personal : business, name, slug, description: `Fake ${name.toLowerCase()} scenario tag.`, color, status: "active", created_by_user_id: users.alex, created_at: now, updated_at: now });
    for (const [targetType, targetId, tagSlug, workspaceId] of [["task", heroTask, "launch", business], ["task", id("task", "personal-upcoming"), "home", personal]]) {
      await add("tag_assignments", { tag_assignment_id: id("tag-assignment", targetType, targetId, tagSlug), workspace_id: workspaceId, tag_id: id("tag", tagSlug), target_type: targetType, target_id: targetId, created_by_user_id: users.alex, source: "manual", source_assignment_id: null, source_target_type: null, source_target_id: null, propagation_rule_id: null, created_at: now });
    }

    const collections = [
      [id("collection", "active"), business, "Active client work", "active-client-work", "active_work"],
      [id("collection", "reference"), business, "Studio reference", "studio-reference", "reference"],
      [id("collection", "personal"), personal, "Home reference", "home-reference", "reference"],
      [id("collection", "family"), family, "Family plans", "family-plans", "ongoing_area"],
    ];
    for (const [collectionId, workspaceId, title, slug, bucket] of collections) {
      await add("note_library_collections", { note_library_collection_id: collectionId, workspace_id: workspaceId, title, slug, description: "Deterministic fake collection for local development and screenshots.", library_bucket: bucket, parent_collection_id: null, sort_order: 0, status: "active", created_by_user_id: users.alex, created_at: now, updated_at: now, archived_at: null, deleted_at: null, metadata_json: JSON.stringify({ fake: true }), path_cache: slug, depth: 0, collection_source: "manual", updated_by_user_id: users.alex });
    }
    const notes = noteScenarios({ now, business, personal, family, users, heroTask });
    for (const note of notes) {
      await add("notes", note);
      await add("note_revisions", revisionRow(note, users.alex, now, 1, "Seeded safe fake note"));
    }
    await add("note_revisions", { ...revisionRow(notes[0], users.alex, now, 2, "Added responsive test result"), body_markdown: `${notes[0].body_markdown}\n\n- Confirmed the cart button stays visible at 380px.`, body_excerpt: "Fake checkout findings with responsive retest result." });
    await add("note_links", { note_link_id: id("note-link", "hero"), workspace_id: business, note_id: notes[0].note_id, module_id: "tasks", target_type: "task", target_id: heroTask, link_role: "related", scope_role: "primary", created_by_user_id: users.alex, created_at: now, removed_at: null, metadata_json: JSON.stringify({ fake: true }) });
    await add("tag_assignments", { tag_assignment_id: id("tag-assignment", "note", notes[0].note_id), workspace_id: business, tag_id: id("tag", "review"), target_type: "note", target_id: notes[0].note_id, created_by_user_id: users.alex, source: "manual", source_assignment_id: null, source_target_type: null, source_target_id: null, propagation_rule_id: null, created_at: now });

    const lists = listScenarios({ now, business, personal, family, users });
    for (const list of lists) await add("lists", list);
    const listItems = [
      [lists[0], "Confirm workspace contacts", "received"], [lists[0], "Create kickoff agenda", "received"], [lists[1], "Retest mobile checkout", "received"], [lists[1], "Publish launch checklist", "needed"], [lists[2], "Archive final approval", "received"], [lists[3], "Label storage bins", "needed"], [lists[4], "Bring reusable cups", "planned"],
    ];
    for (let index = 0; index < listItems.length; index += 1) {
      const [list, itemName, status] = listItems[index];
      await add("list_items", { list_item_id: id("list-item", index), workspace_id: list.workspace_id, list_id: list.list_id, catalog_item_id: null, item_name: itemName, quantity: 1, unit: "item", needed_by_date: null, vendor_name: null, url: null, estimated_cost: null, actual_cost: null, purchase_status: status, tracking_id: null, notes: "Safe fake list item.", assigned_user_id: null, created_by_user_id: users.alex, updated_by_user_id: users.alex, checked_at: status === "received" ? now : null, checked_by_user_id: status === "received" ? users.alex : null, completed_at: status === "received" ? now : null, completed_by_user_id: status === "received" ? users.alex : null, sort_order: index, created_at: now, updated_at: now, deleted_at: null, metadata_json: JSON.stringify({ fake: true }) });
    }
    await add("list_links", { list_link_id: id("list-link", "hero"), workspace_id: business, list_id: lists[1].list_id, module_id: "tasks", target_type: "task", target_id: heroTask, link_role: "related", created_by_user_id: users.alex, created_at: now, removed_at: null, metadata_json: JSON.stringify({ fake: true }) });

    const activeTimer = timerRow("active", business, users.alex, id("task", "due-today"), id("client", "maple"), id("project", "pos"), "Maple Lane Cafe", "POS Setup", now, "active", 780);
    const pausedTimer = timerRow("paused", business, users.alex, heroTask, id("client", "cedar"), id("project", "website"), "Cedar & Bloom", "Website Refresh", now, "paused", 2460);
    await add("active_work_timers", activeTimer);
    await add("active_work_timers", pausedTimer);
    await add("time_entries", timeEntry("completed-timer", business, users.alex, id("client", "cedar"), id("project", "website"), heroTask, "Completed task timer: responsive header investigation", `${date(anchorDate, -1)}T14:00:00.000Z`, `${date(anchorDate, -1)}T15:25:00.000Z`, 5100, "yes", now));
    await add("time_entries", timeEntry("manual", business, users.alex, id("client", "ridgeline"), id("project", "maintenance"), null, "Manual time: prepare fake maintenance summary", `${date(anchorDate, -2)}T17:00:00.000Z`, `${date(anchorDate, -2)}T17:45:00.000Z`, 2700, "no", now));

    const fileSpecs = [
      { key: "checkout-findings.md", name: "checkout-findings.md", mime: "text/markdown", bytes: "# Checkout findings\n\nFake fixture only. The header overlapped the cart button below 380px.\n" },
      { key: "launch-readme.txt", name: "launch-readme.txt", mime: "text/plain", bytes: "Sanitized demo fixture. No customer or production data.\n" },
    ];
    for (const spec of fileSpecs) {
      const bytes = Buffer.from(spec.bytes, "utf8");
      const fileId = id("file", spec.key);
      await add("files", { file_id: fileId, workspace_id: business, storage_provider: "local", storage_key: `seed/${spec.key}`, original_filename: spec.name, stored_filename: spec.name, display_name: spec.name, extension: path.extname(spec.name).slice(1), mime_type_claimed: spec.mime, mime_type_detected: spec.mime, file_size_bytes: bytes.length, sha256_hash: createHash("sha256").update(bytes).digest("hex"), status: "available", scan_status: "not_required", quarantine_reason: null, uploaded_by_user_id: users.alex, created_at: now, updated_at: now, deleted_at: null, metadata_json: JSON.stringify({ fake: true, harmless: true }), storage_kind: "internal", external_source_provider: null, external_source_id: null, external_availability_status: "not_external", external_reported_bytes: 0 });
      await add("file_attachments", { file_attachment_id: id("attachment", spec.key), workspace_id: business, file_id: fileId, module_id: "tasks", target_type: "task", target_id: heroTask, client_id: id("client", "cedar"), project_id: id("project", "website"), visibility: "private", attachment_role: "reference", caption: "Harmless fake development fixture.", sort_order: 0, attached_by_user_id: users.alex, created_at: now, removed_at: null, metadata_json: JSON.stringify({ fake: true }) });
    }

    await add("notifications", { notification_id: id("notification", "reminder"), workspace_id: business, module_id: "tasks", event_type: "task.reminder.due", recipient_user_id: users.alex, actor_user_id: null, record_type: "task", record_id: heroTask, title: "Reminder: Fix mobile checkout overlap", body: "Fake due-soon reminder for the Northwind scenario.", url: `workbench.html?taskId=${heroTask}`, status: "unread", priority: "high", created_at: now, read_at: null, dismissed_at: null, metadata_json: JSON.stringify({ fake: true, reminder: true }) });
    await add("notifications", { notification_id: id("notification", "completed"), workspace_id: business, module_id: "tasks", event_type: "task.completed", recipient_user_id: users.alex, actor_user_id: users.priya, record_type: "task", record_id: id("task", "completed"), title: "Launch copy approved", body: "Priya completed a safe fake task.", url: "tasks.html", status: "read", priority: "normal", created_at: now, read_at: now, dismissed_at: null, metadata_json: JSON.stringify({ fake: true }) });

    const searchable = [
      ...tasks.map((row) => [row.workspace_id, "tasks", "task", row.task_id, row.title, row.description, row.client_id, row.project_id, row.status]),
      ...notes.map((row) => [row.workspace_id, "notes", "note", row.note_id, row.title, row.body_excerpt || "", row.client_id, row.project_id, row.status]),
      ...lists.map((row) => [row.workspace_id, "lists", "list", row.list_id, row.title, row.description || "", row.client_id, row.project_id, row.status]),
    ];
    for (const [workspaceId, moduleId, recordType, recordId, title, summary, clientId, projectId, status] of searchable) {
      await add("search_index", { search_index_id: id("search", moduleId, recordId), workspace_id: workspaceId, module_id: moduleId, record_type: recordType, record_id: recordId, title, summary, body: summary, tags_text: "fake deterministic", client_id: clientId, project_id: projectId, visibility: "normal", record_status: status === "completed" ? "completed" : "active", source: "development-data", record_created_at: now, record_updated_at: now, indexed_at: now, library_bucket: moduleId === "notes" ? "reference" : null, note_collection_id: null, collection_path: null });
    }

    const scenarios = {
      businessWorkspaceId: business,
      personalWorkspaceId: personal,
      familyWorkspaceId: family,
      focusSelectionUrl: "workbench.html",
      taskFocusUrl: `workbench.html?taskId=${heroTask}`,
      dashboardUrl: "dashboard.html",
      sanitized: true,
      secureNotesSeeded: false,
      personaLoginEnabled: false,
    };
    const fingerprint = semanticFingerprint(ledger, { [business]: "{business-workspace}", [users.alex]: "{operator}" });
    await tx.run(`CREATE TABLE development_data_seed_runs (
      seed_run_id TEXT PRIMARY KEY, contract_version TEXT NOT NULL, profile TEXT NOT NULL, anchor_date TEXT NOT NULL,
      semantic_fingerprint TEXT NOT NULL, scenario_manifest_json TEXT NOT NULL, seeded_at TEXT NOT NULL
    );`);
    await add("development_data_seed_runs", { seed_run_id: id("seed-run", target.profile), contract_version: SEED_CONTRACT, profile: target.profile, anchor_date: anchorDate, semantic_fingerprint: fingerprint, scenario_manifest_json: JSON.stringify(scenarios), seeded_at: now });
  });

  const row = await db.get("SELECT semantic_fingerprint, scenario_manifest_json FROM development_data_seed_runs LIMIT 1;");
  const counts = {};
  for (const table of ["workspaces", "users", "clients", "projects", "tasks", "task_checklist_items", "work_resume_state", "active_work_timers", "time_entries", "notes", "note_revisions", "lists", "list_items", "files", "notifications", "search_index"]) {
    counts[table] = Number((await db.get(`SELECT COUNT(*) AS count FROM ${table};`)).count);
  }
  const secure = await db.get("SELECT COUNT(*) AS count FROM notes WHERE security_mode = 'secure' OR secure_payload IS NOT NULL OR encrypted_data_key IS NOT NULL;");
  if (Number(secure.count) !== 0) throw new Error("Seed contract violation: Secure Notes material was created.");
  const integrity = await db.get("PRAGMA integrity_check;");
  if (Object.values(integrity)[0] !== "ok") throw new Error("Seeded database failed PRAGMA integrity_check.");
  const foreignKeyViolations = await db.query("PRAGMA foreign_key_check;");
  if (foreignKeyViolations.length !== 0) throw new Error("Seeded database failed PRAGMA foreign_key_check.");
  const files = [{ key: "checkout-findings.md", bytes: "# Checkout findings\n\nFake fixture only. The header overlapped the cart button below 380px.\n" }, { key: "launch-readme.txt", bytes: "Sanitized demo fixture. No customer or production data.\n" }];
  return { anchorDate, semanticFingerprint: row.semantic_fingerprint, counts, workbench: JSON.parse(row.scenario_manifest_json), files };
}

function taskScenarios({ anchorDate, now, business, personal, family, users, recurrenceId }) {
  const common = { description: "Deterministic fake scenario data only.", priority: "normal", due_time: null, due_timezone: "America/New_York", source_type: "manual", source_id: null, archived_at: null, created_by_user_id: users.alex, updated_by_user_id: users.alex, completed_by_user_id: null, archived_by_user_id: null, reminder_override_enabled: 0, recurrence_template_id: null, recurrence_instance_date: null, billable: "yes", created_at: now, updated_at: now, next_action: "", blocked_reason: "", resume_note: "", last_worked_at: null };
  const make = (key, workspace_id, title, extra = {}) => ({ task_id: id("task", key), workspace_id, client_id: null, project_id: null, title, status: "open", due_date: null, due_at_utc: null, completed_at: null, ...common, ...extra });
  return [
    make("hero", business, "Fix mobile checkout overlap", { client_id: id("client", "cedar"), project_id: id("project", "website"), status: "in_progress", priority: "high", due_date: anchorDate, due_time: "17:00", due_at_utc: `${anchorDate}T21:00:00.000Z`, next_action: "Retest the cart button at 380px and attach the clean capture.", resume_note: "Paused after isolating the narrow-width header collision.", last_worked_at: `${date(anchorDate, -1)}T19:10:00.000Z` }),
    make("overdue", business, "Confirm florist catalog redirects", { client_id: id("client", "cedar"), project_id: id("project", "website"), due_date: date(anchorDate, -2), due_at_utc: `${date(anchorDate, -2)}T21:00:00.000Z`, priority: "high", next_action: "Check the final redirect map." }),
    make("due-today", business, "Validate POS receipt layout", { client_id: id("client", "maple"), project_id: id("project", "pos"), due_date: anchorDate, due_time: "16:00", due_at_utc: `${anchorDate}T20:00:00.000Z`, next_action: "Print one fake receipt from the test register." }),
    make("upcoming", business, "Prepare maintenance review", { client_id: id("client", "ridgeline"), project_id: id("project", "maintenance"), due_date: date(anchorDate, 5), due_at_utc: `${date(anchorDate, 5)}T14:00:00.000Z`, next_action: "Summarize the fake uptime checks." }),
    make("blocked", business, "Schedule launch rehearsal", { client_id: id("client", "cedar"), project_id: id("project", "website"), status: "blocked", blocked_reason: "Waiting for the fake content approval.", next_action: "Choose a rehearsal slot after approval." }),
    make("recurring", business, "Review monthly maintenance report", { client_id: id("client", "ridgeline"), project_id: id("project", "maintenance"), recurrence_template_id: recurrenceId, recurrence_instance_date: anchorDate, due_date: date(anchorDate, 2), due_time: "10:00", due_at_utc: `${date(anchorDate, 2)}T14:00:00.000Z` }),
    make("completed", business, "Approve launch copy", { client_id: id("client", "cedar"), project_id: id("project", "website"), status: "completed", completed_at: `${date(anchorDate, -1)}T18:00:00.000Z`, completed_by_user_id: users.priya, due_date: date(anchorDate, -1), due_at_utc: `${date(anchorDate, -1)}T21:00:00.000Z` }),
    make("undated", business, "Explore future studio typography", { client_id: id("client", "cedar"), project_id: id("project", "website"), priority: "low" }),
    make("personal-upcoming", personal, "Rearrange recording corner", { project_id: id("project", "studio"), billable: "no", due_date: date(anchorDate, 3), due_at_utc: `${date(anchorDate, 3)}T21:00:00.000Z`, next_action: "Measure the shelf wall." }),
    make("personal-completed", personal, "Label cable drawer", { project_id: id("project", "studio"), billable: "no", status: "completed", completed_at: now, completed_by_user_id: users.alex }),
    make("family-due", family, "Confirm picnic headcount", { project_id: id("project", "weekend"), billable: "no", due_date: date(anchorDate, 1), due_at_utc: `${date(anchorDate, 1)}T21:00:00.000Z`, next_action: "Send the final fake RSVP count." }),
    make("family-undated", family, "Choose a board game", { project_id: id("project", "weekend"), billable: "no" }),
  ];
}

function noteScenarios({ now, business, personal, family, users, heroTask }) {
  const make = (key, workspace_id, title, body, extra = {}) => ({ note_id: id("note", key), workspace_id, title, slug: key, body_markdown: body, body_excerpt: body.replace(/[#*_`\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180), body_plaintext_index: body.replace(/[#*_`]/g, " "), note_type: "general", library_bucket: "reference", library_bucket_source: "manual", status: "active", visibility: "workspace", security_mode: "normal", secure_payload: null, secure_payload_version: null, encrypted_data_key: null, encryption_key_version: null, encryption_algorithm: null, key_wrapping_algorithm: null, encryption_nonce: null, encryption_auth_tag: null, key_wrapping_nonce: null, key_wrapping_auth_tag: null, encrypted_at: null, client_id: null, project_id: null, task_id: null, ticket_id: null, linked_user_id: null, note_collection_id: null, owner_user_id: users.alex, created_by_user_id: users.alex, updated_by_user_id: users.alex, created_at: now, updated_at: now, archived_at: null, deleted_at: null, metadata_json: JSON.stringify({ fake: true }), import_source: null, import_source_id: null, import_source_path: null, imported_at: null, import_batch_id: null, original_notebook: null, original_section_group: null, original_section: null, original_page_id: null, ...extra });
  return [
    make("checkout-findings", business, "Checkout responsive findings", "# Checkout findings\n\nThe fake storefront header overlaps the cart button below **380px**.\n\n## Next test\n\n- [ ] Retest with the compact navigation\n- [ ] Capture a sanitized screenshot", { note_type: "research", library_bucket: "active_work", client_id: id("client", "cedar"), project_id: id("project", "website"), task_id: heroTask, note_collection_id: id("collection", "active") }),
    make("launch-decision", business, "Launch rehearsal decision", "# Decision\n\nUse a 30-minute rehearsal with fake accounts only. No customer data or credentials belong in the recording.", { note_type: "decision", note_collection_id: id("collection", "reference") }),
    make("home-layout", personal, "Recording corner layout", "# Recording corner\n\nKeep the microphone arm clear of the shelf and route the cable behind the desk.", { note_type: "reference", project_id: id("project", "studio"), note_collection_id: id("collection", "personal") }),
    make("family-plan", family, "Weekend gathering plan", "# Weekend plan\n\nBring reusable cups, a blanket, and one easy board game. This is entirely fictional demo content.", { note_type: "general", project_id: id("project", "weekend"), note_collection_id: id("collection", "family") }),
  ];
}

function revisionRow(note, userId, now, number, summary) {
  return { note_revision_id: id("note-revision", note.note_id, number), workspace_id: note.workspace_id, note_id: note.note_id, revision_number: number, title: note.title, body_markdown: note.body_markdown, body_excerpt: note.body_excerpt, note_type: note.note_type, library_bucket: note.library_bucket, status: note.status, visibility: note.visibility, security_mode: "normal", secure_payload: null, secure_payload_version: null, encrypted_data_key: null, encryption_key_version: null, encryption_algorithm: null, key_wrapping_algorithm: null, encryption_nonce: null, encryption_auth_tag: null, key_wrapping_nonce: null, key_wrapping_auth_tag: null, encrypted_at: null, changed_by_user_id: userId, change_summary: summary, change_reason: "development_seed", created_at: now, metadata_json: JSON.stringify({ fake: true }), import_source: null, import_source_id: null, import_source_path: null, imported_at: null, import_batch_id: null, original_notebook: null, original_section_group: null, original_section: null, original_page_id: null };
}

function listScenarios({ now, business, personal, family, users }) {
  const make = (key, workspace_id, title, extra = {}) => ({ list_id: id("list", key), workspace_id, client_id: null, project_id: null, title, description: "Deterministic safe fake list.", list_type: "checklist", status: "active", is_reusable: 0, source_list_id: null, duplicated_from_list_id: null, created_by_user_id: users.alex, updated_by_user_id: users.alex, finalized_by_user_id: null, created_at: now, updated_at: now, completed_at: null, finalized_at: null, archived_at: null, deleted_at: null, metadata_json: JSON.stringify({ fake: true }), ...extra });
  return [
    make("onboarding", business, "New client onboarding", { client_id: id("client", "cedar"), project_id: id("project", "website"), is_reusable: 1 }),
    make("launch", business, "Site launch checklist", { client_id: id("client", "cedar"), project_id: id("project", "website") }),
    make("finalized", business, "POS readiness record", { client_id: id("client", "maple"), project_id: id("project", "pos"), status: "finalized", finalized_by_user_id: users.alex, finalized_at: now }),
    make("personal", personal, "Studio reset supplies", { list_type: "supplies", project_id: id("project", "studio") }),
    make("family", family, "Picnic packing list", { list_type: "packing", project_id: id("project", "weekend") }),
  ];
}

function clientRow(clientId, workspaceId, name, now) {
  return { id: clientId, workspace_id: workspaceId, parent_client_id: null, name, status: "Active", billable: "yes", billing_rate: null, billing_period_type: null, billing_period_start_day: null, billing_rounding_enabled: null, billing_rounding_increment: null, billing_contact_name: "", billing_contact_email: "", billing_contact_alternate_name: "", billing_contact_alternate_email: "", billing_contact_phone_number: "", billing_contact_alternate_phone_number: "", billing_contact_street_address_1: "", billing_contact_street_address_2: "", billing_contact_city: "", billing_contact_state: "", billing_contact_zip_code: "", created_at: now, updated_at: now };
}

function timerRow(key, workspaceId, userId, taskId, clientId, projectId, clientName, projectName, now, status, seconds) {
  return { active_timer_id: id("timer", key), workspace_id: workspaceId, user_id: userId, timer_slot: `task-${key}`, source_module_id: "tasks", source_type: "task", source_id: taskId, source_label: key === "paused" ? "Fix mobile checkout overlap" : "Validate POS receipt layout", source_url: `workbench.html?taskId=${taskId}`, client_id: clientId, client_name: clientName, project_id: projectId, project_name: projectName, description: "Fake task timer for local development.", billable: "yes", accumulated_elapsed_seconds: seconds, last_active_start_time: status === "active" ? now : null, timer_status: status, created_at: now, updated_at: now, source_metadata_json: JSON.stringify({ fake: true }) };
}

function timeEntry(key, workspaceId, userId, clientId, projectId, taskId, description, start, end, seconds, billable, now) {
  return { entry_id: id("time-entry", key), workspace_id: workspaceId, user_id: userId, client_id: clientId, client_name: clientId === id("client", "cedar") ? "Cedar & Bloom" : "Ridgeline IT", project_id: projectId, project_name: projectId === id("project", "website") ? "Website Refresh" : "Monthly Maintenance", description, start_time: start, end_time: end, duration_seconds: seconds, duration_hours: (seconds / 3600).toFixed(2), billable, invoice_status: "not_invoiced", task_id: taskId, created_at: now, updated_at: now };
}

function createInserter(db, ledger) {
  return async (table, row, options = {}) => {
    const columns = Object.keys(row);
    const sql = `INSERT ${options.ignore ? "OR IGNORE " : ""}INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((column) => `:${column}`).join(", ")});`;
    await db.run(sql, row);
    ledger.push({ table, row });
  };
}

function semanticFingerprint(ledger, replacements) {
  const normalized = ledger.map(({ table, row }) => [table, Object.fromEntries(Object.entries(row)
    .filter(([key]) => key !== "id" && !key.endsWith("_id"))
    .map(([key, value]) => [key, replacements[value] || value]))]);
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function id(...parts) {
  const hex = createHash("sha256").update(parts.join(":"), "utf8").digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function date(anchor, offset) {
  const value = new Date(`${anchor}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

async function writeFiles(target, files) {
  for (const file of files) {
    const destination = path.join(target.filesRoot, "seed", file.key);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, file.bytes, "utf8");
  }
}

function print(value) {
  console.log(JSON.stringify(value, null, 2));
}

export const __test = { id, semanticFingerprint };
export { main as runDevelopmentDataCli };
