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
import {
  configureSanitizedDemoBootstrap,
  loadSanitizedDemoRoleFixtures,
  LOCAL_ROLE_FIXTURE_MODE,
  RT_LTF_DEMO_ROLE_FIXTURE_BINDING,
} from "./lib/sanitized-demo-role-fixtures.mjs";
import { loadRuntimeEnvFile } from "../src/runtime-env.js";
import { hashPassword } from "../src/security/passwords.js";

loadRuntimeEnvFile();

const DISABLED_PERSONA_PASSWORD = "!development-persona-login-disabled!";
const SEED_CONTRACT = "development-data-v2";

// Resets re-anchor to the current local date by default so every relative
// offset (TODAY-30 .. TODAY+30) moves with the reset; pass --anchor-date for a
// pinned deterministic anchor (regressions and repeatable captures).
function currentAnchorDate() {
  const value = new Date();
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
const scriptPath = fileURLToPath(import.meta.url);
let databaseApi = null;

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

  const roleFixtures = await loadSanitizedDemoRoleFixtures({
    credentialBinding: options.roleFixtureBinding === RT_LTF_DEMO_ROLE_FIXTURE_BINDING.target
      ? RT_LTF_DEMO_ROLE_FIXTURE_BINDING
      : null,
    mode: options.roleFixtures,
    target,
  });
  if (roleFixtures) {
    configureSanitizedDemoBootstrap(roleFixtures);
  } else {
    assertOperatorPassword();
  }
  await assertSeedDirectoryEmpty(target);
  await fs.mkdir(target.filesRoot, { recursive: true });
  configureRuntime(target);
  databaseApi = await import("../src/db/index.js");
  await databaseApi.initializeDatabase();
  const result = await seed(
    databaseApi.db,
    target,
    options.anchorDate || currentAnchorDate(),
    roleFixtures,
  );
  const searchRepair = await repairSeedSearchIndex(result.counts.search_index);
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
    search: searchRepair,
    workbench: result.workbench,
    identities: roleFixtures
      ? "Seven private role-test identities are enabled from the protected local credential file. Passwords are never printed."
      : "Seeded personas use reserved example domains and disabled login credentials. Use the unique operator password supplied through SUPER_ADMIN_PASSWORD.",
  });
}

async function repairSeedSearchIndex(expectedCount) {
  const { searchService } = await import("../src/services/search.service.js");
  const result = await searchService.repairSearchBackendIndex({}, { refresh: true });
  if (result.skipped || result.rebuiltCount !== expectedCount) {
    throw new Error("Seeded Search backend did not materialize every canonical search document.");
  }
  return {
    backend: result.adapterId,
    rebuiltCount: result.rebuiltCount,
  };
}

function parseArgs(args) {
  const options = { command: args[0] };
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (["--profile", "--environment", "--data-dir", "--database", "--files-root", "--confirm", "--anchor-date", "--role-fixtures", "--role-fixture-binding"].includes(arg)) {
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
  if (options.roleFixtureBinding && options.roleFixtureBinding !== RT_LTF_DEMO_ROLE_FIXTURE_BINDING.target) {
    throw new Error(`--role-fixture-binding must be exactly ${RT_LTF_DEMO_ROLE_FIXTURE_BINDING.target}.`);
  }
  if (options.roleFixtureBinding && options.roleFixtures !== LOCAL_ROLE_FIXTURE_MODE) {
    throw new Error("--role-fixture-binding requires the explicit sanitized-demo role fixture mode.");
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/development-data.mjs seed --profile development --environment development --data-dir ./data/development-seed
  node scripts/development-data.mjs reset --profile development --environment development --data-dir ./data/development-seed --confirm development-seed
  node scripts/development-data.mjs seed --profile sanitized-demo --environment development --data-dir ./data/sanitized-demo --role-fixtures ${LOCAL_ROLE_FIXTURE_MODE}
  node scripts/development-data.mjs seed --profile sanitized-demo --environment development --data-dir ./sanitized-demo --role-fixtures ${LOCAL_ROLE_FIXTURE_MODE} --role-fixture-binding ${RT_LTF_DEMO_ROLE_FIXTURE_BINDING.target}

Profiles: ${DEVELOPMENT_PROFILE}, ${DEMO_PROFILE}

Development seed requires a unique SUPER_ADMIN_PASSWORD environment value and keeps every fictional persona login-disabled. Sanitized-demo seed requires --role-fixtures ${LOCAL_ROLE_FIXTURE_MODE} and reads seven unique passwords from the ignored local credential file. No password is accepted on the command line, printed, or stored in source. The data directory must contain the profile's exact marker segment and must be empty.`);
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

async function seed(db, target, anchorDate, roleFixtures = null) {
  const ledger = [];
  const bootstrapWorkspace = await db.get("SELECT workspace_id FROM workspaces ORDER BY created_at, workspace_id LIMIT 1;");
  const operator = await db.get("SELECT user_id FROM users WHERE protected_user = 'yes' ORDER BY username LIMIT 1;");
  if (!bootstrapWorkspace?.workspace_id || !operator?.user_id) throw new Error("Fresh development bootstrap was not created.");
  const roleFixtureRows = roleFixtures
    ? await createRoleFixtureRows(roleFixtures, operator.user_id)
    : [];

  const business = bootstrapWorkspace.workspace_id;
  const personal = id("workspace", "personal");
  const family = id("workspace", "family");
  const fieldOps = id("workspace", "field-ops");
  const priyaPersonal = id("workspace", "priya-personal");
  const users = {
    alex: operator.user_id,
    priya: id("user", "priya"),
    sam: id("user", "sam"),
    dana: id("user", "dana"),
    jordan: id("user", "jordan"),
  };
  for (const persona of GENERATED_PERSONAS) {
    users[persona.key] = id("user", persona.key);
  }
  const businessCreatedAt = `${anchorDate}T13:59:00.000Z`;
  const now = `${anchorDate}T14:00:00.000Z`;
  await db.transaction(async (tx) => {
    const add = createInserter(tx, ledger);
    await tx.run("UPDATE workspaces SET name = :name, workspace_type = 'business', status = 'Active', owner_user_id = :owner, created_at = :createdAt, updated_at = :now WHERE workspace_id = :workspace;", { createdAt: businessCreatedAt, name: "Northwind Studio", owner: users.alex, now, workspace: business });
    await tx.run(`
UPDATE users
SET display_name = :displayName,
    alt_email = :altEmail,
    timezone = 'America/New_York',
    theme_mode = 'light'
WHERE user_id = :userId;
`, {
      altEmail: roleFixtures ? "" : "alex@example.com",
      displayName: roleFixtures
        ? roleFixtures.credentials.get("super_admin").displayName
        : "Alex Rivera",
      userId: users.alex,
    });
    await add("workspaces", { workspace_id: personal, name: "Alex's Personal Workspace", status: "Active", workspace_type: "personal", owner_user_id: users.alex, created_at: now, updated_at: now });
    await add("workspaces", { workspace_id: family, name: "Rivera Family", status: "Active", workspace_type: "family", owner_user_id: users.alex, created_at: now, updated_at: now });
    await add("workspaces", { workspace_id: fieldOps, name: "Northwind Field Ops", status: "Active", workspace_type: "business", owner_user_id: users.alex, created_at: now, updated_at: now });
    await add("workspaces", { workspace_id: priyaPersonal, name: "Priya's Personal Workspace", status: "Active", workspace_type: "personal", owner_user_id: users.priya, created_at: now, updated_at: now });

    for (const workspaceId of [personal, family, fieldOps, priyaPersonal]) {
      await tx.run(`INSERT INTO workspace_settings (workspace_id, audit_logging_enabled, audit_retention_days, audit_settings_updated_at, created_at, updated_at)
        SELECT :workspaceId, audit_logging_enabled, audit_retention_days, audit_settings_updated_at, :now, :now FROM workspace_settings WHERE workspace_id = :business;`, { workspaceId, business, now });
      await tx.run(`INSERT INTO workspace_modules (workspace_id, module_id, status, enabled_at, disabled_at, updated_at)
        SELECT :workspaceId, module_id, status, :now, NULL, :now FROM workspace_modules WHERE workspace_id = :business;`, { workspaceId, business, now });
      await tx.run(`INSERT INTO workspace_module_settings (workspace_id, module_id, setting_id, setting_value_json, created_at, updated_at)
        SELECT :workspaceId, module_id, setting_id, setting_value_json, :now, :now FROM workspace_module_settings WHERE workspace_id = :business;`, { workspaceId, business, now });
    }

    const fat = fatScenarios({ anchorDate, business, family, fieldOps, now, personal, priyaPersonal, users });

    const personaRows = [
      [users.priya, business, "priya@example.com", "Priya Shah"],
      [users.sam, business, "sam@example.com", "Sam Okafor"],
      [users.dana, personal, "dana@example.com", "Dana Lindqvist"],
      [users.jordan, family, "jordan@example.com", "Jordan Bell"],
      ...GENERATED_PERSONAS.map((persona) => [
        users[persona.key],
        persona.home === "field-ops" ? fieldOps : business,
        `${persona.key}@example.com`,
        persona.display,
      ]),
    ];
    for (const [userId, home, username, display] of personaRows) {
      await add("users", { user_id: userId, home_workspace_id: home, username, display_name: display, alt_email: "", timezone: "America/New_York", password: DISABLED_PERSONA_PASSWORD, theme_mode: "light", user_status: "inactive", protected_user: "no", active_workspace_id: home });
    }
    for (const fixture of roleFixtureRows.filter((row) => row.roleId !== "super_admin")) {
      await add("users", {
        user_id: fixture.userId,
        home_workspace_id: business,
        username: fixture.username,
        display_name: fixture.displayName,
        alt_email: "",
        timezone: "America/New_York",
        password: fixture.passwordHash,
        theme_mode: "light",
        user_status: "active",
        protected_user: "no",
        active_workspace_id: business,
      });
    }
    const memberships = [
      [users.alex, business], [users.alex, personal], [users.alex, family], [users.alex, fieldOps],
      [users.priya, business], [users.priya, priyaPersonal], [users.sam, business], [users.dana, personal], [users.jordan, family],
      ...fat.memberships,
      ...roleFixtureRows
        .filter((row) => row.roleId !== "super_admin")
        .map((row) => [row.userId, business]),
    ];
    for (const [userId, workspaceId] of memberships) {
      await add("user_workspaces", { user_workspace_id: id("membership", userId, workspaceId), user_id: userId, workspace_id: workspaceId, status: "active", created_at: now, updated_at: now }, { ignore: true });
    }
    const roles = [
      ...(roleFixtures ? [] : [[business, users.alex, "workspace_admin", "workspace", business]]),
      [business, users.priya, "project_admin", "project", id("project", "website")],
      [business, users.sam, "project_user", "project", id("project", "maintenance")],
      ...(roleFixtures ? [] : [
        [personal, users.alex, "workspace_admin", "workspace", personal],
        [family, users.alex, "workspace_admin", "workspace", family],
      ]),
      [family, users.jordan, "project_user", "project", id("project", "weekend")],
      ...(roleFixtures ? [] : [[fieldOps, users.alex, "workspace_admin", "workspace", fieldOps]]),
      [priyaPersonal, users.priya, "workspace_admin", "workspace", priyaPersonal],
      ...fat.roles,
      ...roleFixtureRows
        .filter((row) => row.roleId !== "super_admin")
        .map((row) => [
          business,
          row.userId,
          row.roleId,
          row.scopeType,
          resolveRoleFixtureScopeId(row, { business }),
        ]),
    ];
    for (const [workspaceId, userId, roleId, scopeType, scopeId] of roles) {
      await add("user_role_assignments", { assignment_id: id("role", workspaceId, userId, roleId), workspace_id: workspaceId, user_id: userId, role_id: roleId, scope_type: scopeType, scope_id: scopeId, client_id: scopeType === "client" ? scopeId : null, project_id: scopeType === "project" ? scopeId : null, permission_overrides_json: null, created_at: now, updated_at: now }, { ignore: true });
    }

    const clients = [
      [id("client", "cedar"), business, "Cedar & Bloom"], [id("client", "maple"), business, "Maple Lane Cafe"], [id("client", "ridgeline"), business, "Ridgeline IT"],
      ...fat.clients,
    ];
    for (const [clientId, workspaceId, name] of clients) {
      await add("clients", clientRow(clientId, workspaceId, name, now));
    }
    const projects = [
      [id("project", "website"), business, id("client", "cedar"), "Website Refresh"],
      [id("project", "pos"), business, id("client", "maple"), "POS Setup"],
      [id("project", "maintenance"), business, id("client", "ridgeline"), "Monthly Maintenance"],
      [id("project", "studio"), personal, null, "Home Studio Reset"],
      [id("project", "weekend"), family, null, "Weekend Gathering"],
      ...fat.projects,
    ];
    for (const [projectId, workspaceId, clientId, name] of projects) {
      await add("projects", { id: projectId, workspace_id: workspaceId, client_id: clientId, parent_project_id: null, name, status: "Active", billable: workspaceId === business || workspaceId === fieldOps ? "yes" : "no", billing_rate: null, billing_period_type: null, billing_period_start_day: null, billing_rounding_enabled: null, billing_rounding_increment: null, created_at: now, updated_at: now });
    }

    const recurrenceId = id("recurrence", "maintenance-review");
    await add("task_recurrence_templates", { recurrence_template_id: recurrenceId, workspace_id: business, client_id: id("client", "ridgeline"), project_id: id("project", "maintenance"), title: "Review monthly maintenance report", description: "Check the fake monthly service summary before sharing it.", status: "open", priority: "normal", recurrence_anchor_date: date(anchorDate, -7), due_time: "10:00", due_timezone: "America/New_York", due_at_utc: `${date(anchorDate, -7)}T14:00:00.000Z`, rrule: "FREQ=MONTHLY;BYMONTHDAY=8", recurrence_end_date: null, template_status: "active", created_by_user_id: users.alex, updated_by_user_id: users.alex, created_at: now, updated_at: now });

    const scenarioTasks = taskScenarios({ anchorDate, now, business, personal, family, users, recurrenceId });
    const tasks = [...scenarioTasks, ...fat.tasks];
    for (const task of tasks) await add("tasks", task);
    await add("task_recurrence_assignees", { recurrence_assignee_id: id("recurrence-assignee", "maintenance"), workspace_id: business, recurrence_template_id: recurrenceId, assignee_type: "user", user_id: users.alex, role_id: null, assigned_by_user_id: users.alex, assigned_at: now, removed_at: null });
    for (const task of scenarioTasks.filter((row) => !["complete", "archived"].includes(row.status))) {
      await add("task_assignees", { task_assignee_id: id("task-assignee", task.task_id), workspace_id: task.workspace_id, task_id: task.task_id, assignee_type: "user", user_id: users.alex, role_id: null, assigned_by_user_id: users.alex, assigned_at: now, removed_at: null });
    }
    for (const assignee of fat.taskAssignees) {
      await add("task_assignees", assignee);
    }
    for (const checklistItem of fat.checklistItems) {
      await add("task_checklist_items", checklistItem);
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
    for (const tag of fat.tags) await add("tags", tag);
    for (const [targetType, targetId, tagSlug, workspaceId] of [["task", heroTask, "launch", business], ["task", id("task", "personal-upcoming"), "home", personal]]) {
      await add("tag_assignments", { tag_assignment_id: id("tag-assignment", targetType, targetId, tagSlug), workspace_id: workspaceId, tag_id: id("tag", tagSlug), target_type: targetType, target_id: targetId, created_by_user_id: users.alex, source: "manual", source_assignment_id: null, source_target_type: null, source_target_id: null, propagation_rule_id: null, created_at: now });
    }
    for (const tagAssignment of fat.tagAssignments) await add("tag_assignments", tagAssignment);

    const collections = [
      [id("collection", "active"), business, "Active client work", "active-client-work", "active_work"],
      [id("collection", "reference"), business, "Studio reference", "studio-reference", "reference"],
      [id("collection", "personal"), personal, "Home reference", "home-reference", "reference"],
      [id("collection", "family"), family, "Family plans", "family-plans", "ongoing_area"],
    ];
    for (const [collectionId, workspaceId, title, slug, bucket] of [...collections, ...fat.collections]) {
      await add("note_library_collections", { note_library_collection_id: collectionId, workspace_id: workspaceId, title, slug, description: "Deterministic fake collection for local development and screenshots.", library_bucket: bucket, parent_collection_id: null, sort_order: 0, status: "active", created_by_user_id: users.alex, created_at: now, updated_at: now, archived_at: null, deleted_at: null, metadata_json: JSON.stringify({ fake: true }), path_cache: slug, depth: 0, collection_source: "manual", updated_by_user_id: users.alex });
    }
    const notes = [...noteScenarios({ now, business, personal, family, users, heroTask }), ...fat.notes];
    for (const note of notes) {
      await add("notes", note);
      await add("note_revisions", revisionRow(note, note.created_by_user_id, now, 1, "Seeded safe fake note"));
    }
    await add("note_revisions", { ...revisionRow(notes[0], users.alex, now, 2, "Added responsive test result"), body_markdown: `${notes[0].body_markdown}\n\n- Confirmed the cart button stays visible at 380px.`, body_excerpt: "Fake checkout findings with responsive retest result." });
    await add("note_links", { note_link_id: id("note-link", "hero"), workspace_id: business, note_id: notes[0].note_id, module_id: "tasks", target_type: "task", target_id: heroTask, link_role: "related", scope_role: "primary", created_by_user_id: users.alex, created_at: now, removed_at: null, metadata_json: JSON.stringify({ fake: true }) });
    await add("tag_assignments", { tag_assignment_id: id("tag-assignment", "note", notes[0].note_id), workspace_id: business, tag_id: id("tag", "review"), target_type: "note", target_id: notes[0].note_id, created_by_user_id: users.alex, source: "manual", source_assignment_id: null, source_target_type: null, source_target_id: null, propagation_rule_id: null, created_at: now });

    const lists = [...listScenarios({ now, business, personal, family, users }), ...fat.lists];
    for (const list of lists) await add("lists", list);
    const listItems = [
      [lists[0], "Confirm workspace contacts", "received"], [lists[0], "Create kickoff agenda", "received"], [lists[1], "Retest mobile checkout", "received"], [lists[1], "Publish launch checklist", "needed"], [lists[2], "Archive final approval", "received"], [lists[3], "Label storage bins", "needed"], [lists[4], "Bring reusable cups", "planned"],
      ...fat.listItems,
    ];
    for (let index = 0; index < listItems.length; index += 1) {
      const [list, itemName, status] = listItems[index];
      await add("list_items", { list_item_id: id("list-item", index), workspace_id: list.workspace_id, list_id: list.list_id, catalog_item_id: null, item_name: itemName, quantity: 1, unit: "item", needed_by_date: null, vendor_name: null, url: null, estimated_cost: null, actual_cost: null, purchase_status: status, tracking_id: null, notes: "Safe fake list item.", assigned_user_id: null, created_by_user_id: users.alex, updated_by_user_id: users.alex, checked_at: status === "received" ? now : null, checked_by_user_id: status === "received" ? users.alex : null, completed_at: status === "received" ? now : null, completed_by_user_id: status === "received" ? users.alex : null, sort_order: index, created_at: now, updated_at: now, deleted_at: null, metadata_json: JSON.stringify({ fake: true }) });
    }
    await add("list_links", { list_link_id: id("list-link", "hero"), workspace_id: business, list_id: lists[1].list_id, module_id: "tasks", target_type: "task", target_id: heroTask, link_role: "related", created_by_user_id: users.alex, created_at: now, removed_at: null, metadata_json: JSON.stringify({ fake: true }) });

    const activeTimer = timerRow("running", business, users.alex, id("task", "due-today"), id("client", "maple"), id("project", "pos"), "Maple Lane Cafe", "POS Setup", "Validate POS receipt layout", now, "running", 780, {
      movedTaskToInProgress: true,
      movedTaskFromOpen: true,
      movedTaskFromBlocked: false,
      previousBlockedReason: "",
      previousStatus: "open",
    });
    const pausedTimer = timerRow("paused", business, users.alex, heroTask, id("client", "cedar"), id("project", "website"), "Cedar & Bloom", "Website Refresh", "Fix mobile checkout overlap", now, "paused", 2460, {
      movedTaskToInProgress: false,
      movedTaskFromOpen: false,
      movedTaskFromBlocked: false,
      previousBlockedReason: "",
      previousStatus: "in_progress",
    });
    await add("active_work_timers", activeTimer);
    await add("active_work_timers", pausedTimer);
    await add("time_entries", timeEntry("completed-timer", business, users.alex, id("client", "cedar"), id("project", "website"), heroTask, "Completed task timer: responsive header investigation", `${date(anchorDate, -1)}T14:00:00.000Z`, `${date(anchorDate, -1)}T15:25:00.000Z`, 5100, "yes", now));
    await add("time_entries", timeEntry("manual", business, users.alex, id("client", "ridgeline"), id("project", "maintenance"), null, "Manual time: prepare fake maintenance summary", `${date(anchorDate, -2)}T17:00:00.000Z`, `${date(anchorDate, -2)}T17:45:00.000Z`, 2700, "no", now));
    for (const entry of fat.timeEntries) await add("time_entries", entry);
    for (const resumeRow of fat.resumeRows) await add("work_resume_state", resumeRow);

    const fileSpecs = [
      { key: "checkout-findings.md", name: "checkout-findings.md", mime: "text/markdown", bytes: "# Checkout findings\n\nFake fixture only. The header overlapped the cart button below 380px.\n" },
      { key: "launch-readme.txt", name: "launch-readme.txt", mime: "text/plain", bytes: "Sanitized demo fixture. No customer or production data.\n" },
    ];
    for (const spec of fileSpecs) {
      const bytes = Buffer.from(spec.bytes, "utf8");
      const fileId = id("file", spec.key);
      await add("files", { file_id: fileId, workspace_id: business, storage_provider: "local", storage_key: `seed/${spec.key}`, original_filename: spec.name, stored_filename: spec.name, display_name: spec.name, extension: path.extname(spec.name), mime_type_claimed: spec.mime, mime_type_detected: spec.mime, file_size_bytes: bytes.length, sha256_hash: createHash("sha256").update(bytes).digest("hex"), status: "available", scan_status: "not_required", quarantine_reason: null, uploaded_by_user_id: users.alex, created_at: now, updated_at: now, deleted_at: null, metadata_json: JSON.stringify({ fake: true, harmless: true }), storage_kind: "internal", external_source_provider: null, external_source_id: null, external_availability_status: "not_external", external_reported_bytes: 0 });
      await add("file_attachments", { file_attachment_id: id("attachment", spec.key), workspace_id: business, file_id: fileId, module_id: "tasks", target_type: "task", target_id: heroTask, client_id: id("client", "cedar"), project_id: id("project", "website"), visibility: "private", attachment_role: "reference", caption: "Harmless fake development fixture.", sort_order: 0, attached_by_user_id: users.alex, created_at: now, removed_at: null, metadata_json: JSON.stringify({ fake: true }) });
    }

    await add("notifications", { notification_id: id("notification", "reminder"), workspace_id: business, module_id: "tasks", event_type: "task.reminder.due", recipient_user_id: users.alex, actor_user_id: null, record_type: "task", record_id: heroTask, title: "Reminder: Fix mobile checkout overlap", body: "Fake due-soon reminder for the Northwind scenario.", url: `workbench.html?taskId=${heroTask}`, status: "unread", priority: "high", created_at: now, read_at: null, dismissed_at: null, metadata_json: JSON.stringify({ fake: true, reminder: true }) });
    await add("notifications", { notification_id: id("notification", "completed"), workspace_id: business, module_id: "tasks", event_type: "task.completed", recipient_user_id: users.alex, actor_user_id: users.priya, record_type: "task", record_id: id("task", "completed"), title: "Launch copy approved", body: "Priya completed a safe fake task.", url: "tasks.html", status: "read", priority: "normal", created_at: now, read_at: now, dismissed_at: null, metadata_json: JSON.stringify({ fake: true }) });
    for (const notification of fat.notifications) await add("notifications", notification);

    const searchable = [
      ...tasks.map((row) => [row.workspace_id, "tasks", "task", row.task_id, row.title, row.description, row.client_id, row.project_id, row.status]),
      ...notes.map((row) => [row.workspace_id, "notes", "note", row.note_id, row.title, row.body_excerpt || "", row.client_id, row.project_id, row.status]),
      ...lists.map((row) => [row.workspace_id, "lists", "list", row.list_id, row.title, row.description || "", row.client_id, row.project_id, row.status]),
    ];
    for (const [workspaceId, moduleId, recordType, recordId, title, summary, clientId, projectId, status] of searchable) {
      await add("search_index", { search_index_id: id("search", moduleId, recordId), workspace_id: workspaceId, module_id: moduleId, record_type: recordType, record_id: recordId, title, summary, body: summary, tags_text: "fake deterministic", client_id: clientId, project_id: projectId, visibility: "normal", record_status: status === "complete" ? "completed" : "active", source: "development-data", record_created_at: now, record_updated_at: now, indexed_at: now, library_bucket: moduleId === "notes" ? "reference" : null, note_collection_id: null, collection_path: null });
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
      personaLoginEnabled: Boolean(roleFixtures),
      roleFixtureLoginCount: roleFixtures ? roleFixtures.fixtures.length : 0,
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
  await verifySeededRoleFixtureContract(db, roleFixtures, {
    businessWorkspaceId: business,
    operatorUserId: operator.user_id,
  });
  const files = [{ key: "checkout-findings.md", bytes: "# Checkout findings\n\nFake fixture only. The header overlapped the cart button below 380px.\n" }, { key: "launch-readme.txt", bytes: "Sanitized demo fixture. No customer or production data.\n" }];
  return { anchorDate, semanticFingerprint: row.semantic_fingerprint, counts, workbench: JSON.parse(row.scenario_manifest_json), files };
}

function taskScenarios({ anchorDate, now, business, personal, family, users, recurrenceId }) {
  const common = { description: "Deterministic fake scenario data only.", priority: "normal", due_time: null, due_timezone: "America/New_York", source_type: "manual", source_id: null, archived_at: null, created_by_user_id: users.alex, updated_by_user_id: users.alex, completed_by_user_id: null, archived_by_user_id: null, reminder_override_enabled: 0, recurrence_template_id: null, recurrence_instance_date: null, billable: "yes", created_at: now, updated_at: now, next_action: "", blocked_reason: "", resume_note: "", last_worked_at: null };
  const make = (key, workspace_id, title, extra = {}) => ({ task_id: id("task", key), workspace_id, client_id: null, project_id: null, title, status: "open", due_date: null, due_at_utc: null, completed_at: null, ...common, ...extra });
  return [
    make("hero", business, "Fix mobile checkout overlap", { client_id: id("client", "cedar"), project_id: id("project", "website"), status: "in_progress", priority: "high", due_date: anchorDate, due_time: "17:00", due_at_utc: `${anchorDate}T21:00:00.000Z`, next_action: "Retest the cart button at 380px and attach the clean capture.", resume_note: "Paused after isolating the narrow-width header collision.", last_worked_at: `${date(anchorDate, -1)}T19:10:00.000Z` }),
    make("overdue", business, "Confirm florist catalog redirects", { client_id: id("client", "cedar"), project_id: id("project", "website"), due_date: date(anchorDate, -2), due_at_utc: `${date(anchorDate, -2)}T21:00:00.000Z`, priority: "high", next_action: "Check the final redirect map." }),
    make("due-today", business, "Validate POS receipt layout", { client_id: id("client", "maple"), project_id: id("project", "pos"), status: "in_progress", due_date: anchorDate, due_time: "16:00", due_at_utc: `${anchorDate}T20:00:00.000Z`, next_action: "Print one fake receipt from the test register." }),
    make("upcoming", business, "Prepare maintenance review", { client_id: id("client", "ridgeline"), project_id: id("project", "maintenance"), due_date: date(anchorDate, 5), due_at_utc: `${date(anchorDate, 5)}T14:00:00.000Z`, next_action: "Summarize the fake uptime checks." }),
    make("blocked", business, "Schedule launch rehearsal", { client_id: id("client", "cedar"), project_id: id("project", "website"), status: "blocked", blocked_reason: "Waiting for the fake content approval.", next_action: "Choose a rehearsal slot after approval." }),
    make("recurring", business, "Review monthly maintenance report", { client_id: id("client", "ridgeline"), project_id: id("project", "maintenance"), recurrence_template_id: recurrenceId, recurrence_instance_date: anchorDate, due_date: date(anchorDate, 2), due_time: "10:00", due_at_utc: `${date(anchorDate, 2)}T14:00:00.000Z` }),
    make("completed", business, "Approve launch copy", { client_id: id("client", "cedar"), project_id: id("project", "website"), status: "complete", completed_at: `${date(anchorDate, -1)}T18:00:00.000Z`, completed_by_user_id: users.priya, due_date: date(anchorDate, -1), due_at_utc: `${date(anchorDate, -1)}T21:00:00.000Z` }),
    make("undated", business, "Explore future studio typography", { client_id: id("client", "cedar"), project_id: id("project", "website"), priority: "low" }),
    make("personal-upcoming", personal, "Rearrange recording corner", { project_id: id("project", "studio"), billable: "no", due_date: date(anchorDate, 3), due_at_utc: `${date(anchorDate, 3)}T21:00:00.000Z`, next_action: "Measure the shelf wall." }),
    make("personal-completed", personal, "Label cable drawer", { project_id: id("project", "studio"), billable: "no", status: "complete", completed_at: now, completed_by_user_id: users.alex }),
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

// Generated-but-themed volume for the fat Northwind profile. Everything stays
// deterministic: ids hash from stable keys, the pseudo-random stream uses a
// fixed seed, and every date is an offset from the anchor so resets move the
// whole scenario with today.
const GENERATED_PERSONAS = [
  { key: "mika", display: "Mika Tanaka", home: "business" },
  { key: "rowan", display: "Rowan Ellis", home: "business" },
  { key: "ivy", display: "Ivy Chen", home: "business" },
  { key: "theo", display: "Theo Marsh", home: "business" },
  { key: "nadia", display: "Nadia Petrov", home: "business" },
  { key: "omar", display: "Omar Haddad", home: "business" },
  { key: "lena", display: "Lena Fischer", home: "business" },
  { key: "caleb", display: "Caleb Wright", home: "business" },
  { key: "sofia", display: "Sofia Marino", home: "field-ops" },
  { key: "elliot", display: "Elliot Kim", home: "field-ops" },
  { key: "grace", display: "Grace Nwosu", home: "field-ops" },
  { key: "felix", display: "Felix Berg", home: "field-ops" },
  { key: "harper", display: "Harper Quinn", home: "business" },
];
const GENERATED_CLIENTS = {
  business: [
    ["harbor-pine", "Harbor & Pine Outfitters"], ["bluebird", "Bluebird Bakery"], ["summit-physio", "Summit Physio"],
    ["copper-kettle", "Copper Kettle Coffee"], ["lakeview-dental", "Lakeview Dental"], ["fernwood", "Fernwood Landscaping"],
    ["brightpath", "Brightpath Tutoring"], ["old-town", "Old Town Records"], ["juniper-yoga", "Juniper Yoga"],
    ["stonebridge", "Stonebridge Legal"], ["wildflower", "Wildflower Events"], ["anchor-point", "Anchor Point Marine"],
  ],
  fieldOps: [
    ["northgate", "Northgate Property Group"], ["redwood-rentals", "Redwood Rentals"], ["cascade", "Cascade Facilities"],
    ["beacon-storage", "Beacon Storage"], ["elm-street", "Elm Street Markets"],
  ],
};
const GENERATED_PROJECT_NAMES = [
  "Brand Refresh", "Spring Campaign", "Booking System", "Menu Redesign", "Photo Library Cleanup", "Quarterly Retainer",
  "Signage Package", "Newsletter Automation", "Site Migration", "Social Templates", "Onboarding Portal", "Holiday Promo",
  "Storefront Audit", "Print Collateral", "Event Microsite",
];
const TASK_VERBS = ["Draft", "Review", "Retest", "Publish", "Schedule", "Archive", "Outline", "Polish", "Measure", "Update", "Prepare", "Collect", "Approve", "Storyboard", "Export"];
const TASK_OBJECTS = ["homepage hero copy", "invoice template", "gallery layout", "kickoff agenda", "color palette", "launch checklist", "print proofs", "booking flow", "photo selects", "menu board mockup", "status summary", "backup rotation", "style guide", "contact form", "analytics snapshot"];
const PERSONAL_TASK_TITLES = ["Sort camera shelf", "Back up sample packs", "Clean monitor arms", "Reorganize plugin folder", "Plan practice schedule", "Label patch cables", "Test new headphones", "Archive old session files", "Sketch desk layout", "Update backup drive"];
const FAMILY_TASK_TITLES = ["Plan Saturday dinner", "Book dentist appointments", "Sort donation boxes", "Refill emergency kit", "Schedule car service", "Pick a movie night film", "Update chore rotation", "Plan garden beds", "Order team snacks", "Check library due dates"];
const BLOCKED_REASONS = ["Waiting for fake client approval.", "Blocked on the vendor sample kit.", "Needs the updated brand assets first.", "On hold until the fixture photos arrive."];
const NEXT_ACTIONS = ["Confirm the next revision window.", "Send the sanitized summary for review.", "Collect the remaining fixture assets.", "Book a fifteen-minute check-in.", "Capture one clean screenshot for the log."];
const DUE_OFFSETS = [-30, -21, -14, -10, -7, -5, -3, -2, -1, 0, 1, 2, 3, 5, 7, 10, 14, 21, 30];
const DUE_TIMES = [["10:00", "14:00"], ["14:30", "18:30"], ["16:00", "20:00"]];
const NOTE_TOPICS = ["kickoff summary", "shoot day checklist", "asset naming rules", "feedback round notes", "vendor comparison", "retro highlights", "budget snapshot", "style references", "delivery checklist", "maintenance log"];

function mulberry32(seedValue) {
  let state = seedValue >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fatScenarios({ anchorDate, business, family, fieldOps, now, personal, priyaPersonal, users }) {
  const random = mulberry32(0x0f2a11d5);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const chance = (probability) => random() < probability;
  const result = {
    checklistItems: [], clients: [], collections: [], listItems: [], lists: [], memberships: [], notes: [],
    notifications: [], projects: [], resumeRows: [], roles: [], tags: [], taskAssignees: [], tasks: [], tagAssignments: [], timeEntries: [],
  };

  const workspaceSlugs = { [business]: "business", [fieldOps]: "field-ops", [personal]: "personal", [priyaPersonal]: "priya-personal", [family]: "family" };
  const businessPersonas = GENERATED_PERSONAS.filter((persona) => persona.home === "business").map((persona) => users[persona.key]);
  const fieldPersonas = GENERATED_PERSONAS.filter((persona) => persona.home === "field-ops").map((persona) => users[persona.key]);
  const assigneePools = {
    [business]: [users.alex, users.priya, users.sam, ...businessPersonas],
    [fieldOps]: [users.alex, ...fieldPersonas],
    [personal]: [users.alex],
    [priyaPersonal]: [users.priya],
    [family]: [users.alex, users.jordan],
  };

  for (const persona of GENERATED_PERSONAS) {
    const home = persona.home === "field-ops" ? fieldOps : business;
    result.memberships.push([users[persona.key], home]);
  }
  result.memberships.push([users.mika, fieldOps], [users.sofia, business]);

  const projectDescriptors = [];
  const registerClient = (slug, name, workspaceId) => {
    const clientId = id("client", slug);
    result.clients.push([clientId, workspaceId, name]);
    return { clientId, name };
  };
  const registerProject = (slug, name, workspaceId, client) => {
    const projectId = id("project", slug);
    result.projects.push([projectId, workspaceId, client ? client.clientId : null, name]);
    projectDescriptors.push({
      clientId: client ? client.clientId : null,
      clientName: client ? client.name : "",
      projectId,
      projectName: name,
      workspaceId,
    });
  };

  for (const [workspaceKey, clientPool] of [["business", GENERATED_CLIENTS.business], ["fieldOps", GENERATED_CLIENTS.fieldOps]]) {
    const workspaceId = workspaceKey === "business" ? business : fieldOps;
    for (const [slug, name] of clientPool) {
      const client = registerClient(slug, name, workspaceId);
      const projectCount = 1 + Math.floor(random() * 3);
      for (let index = 0; index < projectCount; index += 1) {
        registerProject(`${slug}-project-${index}`, pick(GENERATED_PROJECT_NAMES), workspaceId, client);
      }
    }
  }
  registerProject("studio-archive", "Sample Library Cleanup", personal, null);
  registerProject("priya-reading", "Reading Backlog", priyaPersonal, null);
  registerProject("family-holiday", "Holiday Planning", family, null);

  const businessRoleTargets = projectDescriptors.filter((descriptor) => descriptor.workspaceId === business);
  const fieldRoleTargets = projectDescriptors.filter((descriptor) => descriptor.workspaceId === fieldOps);
  businessPersonas.forEach((userId, index) => {
    const descriptor = businessRoleTargets[index % businessRoleTargets.length];
    result.roles.push(index % 3 === 0
      ? [business, userId, "client_user", "client", descriptor.clientId]
      : [business, userId, "project_user", "project", descriptor.projectId]);
  });
  fieldPersonas.forEach((userId, index) => {
    const descriptor = fieldRoleTargets[index % fieldRoleTargets.length];
    result.roles.push([fieldOps, userId, "project_user", "project", descriptor.projectId]);
  });

  const taskCounts = [[business, 258], [fieldOps, 80], [personal, 20], [priyaPersonal, 10], [family, 20]];
  const taskDefaults = { archived_at: null, billable: "yes", blocked_reason: "", completed_at: null, completed_by_user_id: null, archived_by_user_id: null, description: "Deterministic fake scenario data only.", due_at_utc: null, due_date: null, due_time: null, due_timezone: "America/New_York", last_worked_at: null, next_action: "", recurrence_instance_date: null, recurrence_template_id: null, reminder_override_enabled: 0, resume_note: "", source_id: null, source_type: "manual" };

  for (const [workspaceId, count] of taskCounts) {
    const workspaceProjects = projectDescriptors.filter((descriptor) => descriptor.workspaceId === workspaceId);
    const pool = assigneePools[workspaceId];
    const businesslike = workspaceId === business || workspaceId === fieldOps;
    for (let index = 0; index < count; index += 1) {
      const key = `gen-${workspaceSlugs[workspaceId]}-${index}`;
      const descriptor = workspaceProjects.length > 0 && (businesslike || chance(0.7)) ? pick(workspaceProjects) : null;
      const creator = pick(pool);
      const roll = random();
      const status = roll < 0.42 ? "complete" : roll < 0.47 ? "archived" : roll < 0.55 ? "blocked" : roll < 0.66 ? "in_progress" : "open";
      const title = businesslike
        ? `${pick(TASK_VERBS)} ${pick(TASK_OBJECTS)}`
        : pick(workspaceId === family ? FAMILY_TASK_TITLES : PERSONAL_TASK_TITLES);
      const terminal = status === "complete" || status === "archived";
      const dueOffset = chance(0.16) ? null : terminal ? pick(DUE_OFFSETS.filter((offset) => offset <= 0)) : pick(DUE_OFFSETS);
      const dueDate = dueOffset === null ? null : date(anchorDate, dueOffset);
      const timed = dueDate !== null && chance(0.3) ? pick(DUE_TIMES) : null;
      const task = {
        task_id: id("task", key),
        workspace_id: workspaceId,
        client_id: descriptor?.clientId || null,
        project_id: descriptor?.projectId || null,
        title: `${title}${businesslike && descriptor ? ` — ${descriptor.clientName}` : ""}`,
        status,
        priority: chance(0.18) ? "high" : chance(0.12) ? "low" : "normal",
        created_by_user_id: creator,
        updated_by_user_id: creator,
        created_at: `${date(anchorDate, -30 + Math.floor(random() * 25))}T12:00:00.000Z`,
        updated_at: `${date(anchorDate, -Math.floor(random() * 10))}T15:00:00.000Z`,
        ...taskDefaults,
        billable: businesslike ? "yes" : "no",
      };
      task.due_date = dueDate;
      task.due_time = timed ? timed[0] : null;
      task.due_at_utc = dueDate === null ? null : `${dueDate}T${timed ? timed[1] : "21:00"}:00.000Z`;
      if (status === "complete") {
        task.completed_at = `${date(anchorDate, pick([-1, -2, -3, -5, -7, -10, -14, -21]))}T18:00:00.000Z`;
        task.completed_by_user_id = pick(pool);
      }
      if (status === "archived") {
        task.archived_at = `${date(anchorDate, pick([-14, -21, -30]))}T18:00:00.000Z`;
        task.archived_by_user_id = creator;
      }
      if (status === "blocked") {
        task.blocked_reason = pick(BLOCKED_REASONS);
      }
      if (status === "in_progress") {
        task.last_worked_at = `${date(anchorDate, pick([0, -1, -2, -3]))}T16:30:00.000Z`;
        if (chance(0.5)) task.resume_note = "Paused mid-way through the fake pass.";
      }
      if (!terminal && chance(0.5)) {
        task.next_action = pick(NEXT_ACTIONS);
      }
      result.tasks.push(task);

      if (!terminal && chance(0.85)) {
        const assignee = pick(pool);
        result.taskAssignees.push({ task_assignee_id: id("task-assignee", key, assignee), workspace_id: workspaceId, task_id: task.task_id, assignee_type: "user", user_id: assignee, role_id: null, assigned_by_user_id: creator, assigned_at: now, removed_at: null });
      }
      if (index % 8 === 0) {
        const itemCount = 2 + Math.floor(random() * 3);
        for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
          const checked = terminal || chance(0.4) ? 1 : 0;
          result.checklistItems.push({ task_checklist_item_id: id("check", key, itemIndex), workspace_id: workspaceId, task_id: task.task_id, label: `${pick(TASK_VERBS)} ${pick(TASK_OBJECTS)}`, is_checked: checked, completed_at: checked ? now : null, completed_by_user_id: checked ? creator : null, sort_order: itemIndex, deleted_at: null, deleted_by_user_id: null, created_by_user_id: creator, updated_by_user_id: creator, created_at: now, updated_at: now });
        }
      }
    }
  }

  const collectionSpecs = [
    ["gen-biz-campaigns", business, "Campaign notes", "campaign-notes", "active_work"],
    ["gen-biz-processes", business, "Studio processes", "studio-processes", "reference"],
    ["gen-field-sites", fieldOps, "Site walkthroughs", "site-walkthroughs", "active_work"],
    ["gen-field-reference", fieldOps, "Field reference", "field-reference", "reference"],
    ["gen-priya", priyaPersonal, "Reading notes", "reading-notes", "reference"],
    ["gen-family-areas", family, "Household areas", "household-areas", "ongoing_area"],
  ];
  for (const [key, workspaceId, title, slug, bucket] of collectionSpecs) {
    result.collections.push([id("collection", key), workspaceId, title, slug, bucket]);
  }
  const collectionsByWorkspace = {
    [business]: [id("collection", "active"), id("collection", "reference"), id("collection", "gen-biz-campaigns"), id("collection", "gen-biz-processes")],
    [fieldOps]: [id("collection", "gen-field-sites"), id("collection", "gen-field-reference")],
    [personal]: [id("collection", "personal")],
    [priyaPersonal]: [id("collection", "gen-priya")],
    [family]: [id("collection", "family"), id("collection", "gen-family-areas")],
  };

  const noteCounts = [[business, 120], [fieldOps, 30], [personal, 20], [priyaPersonal, 10], [family, 16]];
  for (const [workspaceId, count] of noteCounts) {
    const workspaceProjects = projectDescriptors.filter((descriptor) => descriptor.workspaceId === workspaceId);
    const pool = assigneePools[workspaceId];
    for (let index = 0; index < count; index += 1) {
      const key = `gen-note-${workspaceSlugs[workspaceId]}-${index}`;
      const descriptor = workspaceProjects.length > 0 && chance(0.6) ? pick(workspaceProjects) : null;
      const author = pick(pool);
      const topic = pick(NOTE_TOPICS);
      const title = descriptor ? `${descriptor.clientName || descriptor.projectName} ${topic}` : `${topic[0].toUpperCase()}${topic.slice(1)}`;
      const body = `# ${title}\n\nDeterministic fake ${topic} for the Northwind scenario.\n\n- Everything here is fictional demo content.\n- Anchored ${Math.floor(random() * 30)} days into the fake timeline.\n\n## Follow-up\n\n${pick(NEXT_ACTIONS)}`;
      result.notes.push({
        note_id: id("note", key), workspace_id: workspaceId, title, slug: key, body_markdown: body,
        body_excerpt: body.replace(/[#*_`\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180),
        body_plaintext_index: body.replace(/[#*_`]/g, " "),
        note_type: pick(["general", "reference", "research", "decision"]), library_bucket: chance(0.4) ? "active_work" : "reference", library_bucket_source: "manual",
        status: chance(0.06) ? "archived" : "active", visibility: "workspace", security_mode: "normal",
        secure_payload: null, secure_payload_version: null, encrypted_data_key: null, encryption_key_version: null, encryption_algorithm: null, key_wrapping_algorithm: null, encryption_nonce: null, encryption_auth_tag: null, key_wrapping_nonce: null, key_wrapping_auth_tag: null, encrypted_at: null,
        client_id: descriptor?.clientId || null, project_id: descriptor?.projectId || null, task_id: null, ticket_id: null, linked_user_id: null,
        note_collection_id: chance(0.65) ? pick(collectionsByWorkspace[workspaceId]) : null,
        owner_user_id: author, created_by_user_id: author, updated_by_user_id: author,
        created_at: `${date(anchorDate, -Math.floor(random() * 30))}T12:30:00.000Z`, updated_at: `${date(anchorDate, -Math.floor(random() * 10))}T16:00:00.000Z`,
        archived_at: null, deleted_at: null, metadata_json: JSON.stringify({ fake: true, generated: true }),
        import_source: null, import_source_id: null, import_source_path: null, imported_at: null, import_batch_id: null, original_notebook: null, original_section_group: null, original_section: null, original_page_id: null,
      });
    }
  }

  const listCounts = [[business, 10], [fieldOps, 4], [personal, 2], [priyaPersonal, 1], [family, 2]];
  for (const [workspaceId, count] of listCounts) {
    const workspaceProjects = projectDescriptors.filter((descriptor) => descriptor.workspaceId === workspaceId);
    const pool = assigneePools[workspaceId];
    for (let index = 0; index < count; index += 1) {
      const key = `gen-list-${workspaceSlugs[workspaceId]}-${index}`;
      const descriptor = workspaceProjects.length > 0 && chance(0.7) ? pick(workspaceProjects) : null;
      const owner = pick(pool);
      const list = {
        list_id: id("list", key), workspace_id: workspaceId, client_id: descriptor?.clientId || null, project_id: descriptor?.projectId || null,
        title: `${descriptor ? `${descriptor.projectName} ` : ""}${pick(["prep list", "supply run", "handoff checklist", "review checklist", "pack list"])}`,
        description: "Deterministic safe fake list.", list_type: pick(["checklist", "supplies", "packing"]), status: "active", is_reusable: chance(0.2) ? 1 : 0,
        source_list_id: null, duplicated_from_list_id: null, created_by_user_id: owner, updated_by_user_id: owner, finalized_by_user_id: null,
        created_at: now, updated_at: now, completed_at: null, finalized_at: null, archived_at: null, deleted_at: null, metadata_json: JSON.stringify({ fake: true, generated: true }),
      };
      result.lists.push(list);
      const itemCount = 5 + Math.floor(random() * 5);
      for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
        result.listItems.push([list, `${pick(TASK_VERBS)} ${pick(TASK_OBJECTS)}`, pick(["needed", "planned", "received", "received"])]);
      }
    }
  }

  const billableProjects = projectDescriptors.filter((descriptor) => descriptor.workspaceId === business || descriptor.workspaceId === fieldOps);
  for (let index = 0; index < 600; index += 1) {
    const personalEntry = index % 12 === 0;
    const descriptor = personalEntry
      ? projectDescriptors.find((candidate) => candidate.workspaceId === personal)
      : pick(billableProjects);
    const workspaceId = descriptor.workspaceId;
    const userId = pick(assigneePools[workspaceId]);
    const dayOffset = -Math.floor(random() * 30);
    const startHour = 13 + Math.floor(random() * 6);
    const seconds = (15 + Math.floor(random() * 165)) * 60;
    const start = `${date(anchorDate, dayOffset)}T${String(startHour).padStart(2, "0")}:00:00.000Z`;
    result.timeEntries.push({
      entry_id: id("time-entry", `gen-${index}`), workspace_id: workspaceId, user_id: userId,
      client_id: descriptor.clientId, client_name: descriptor.clientName, project_id: descriptor.projectId, project_name: descriptor.projectName,
      description: `${pick(TASK_VERBS)} ${pick(TASK_OBJECTS)}`,
      start_time: start, end_time: new Date(Date.parse(start) + seconds * 1000).toISOString(), duration_seconds: seconds, duration_hours: (seconds / 3600).toFixed(2),
      billable: personalEntry ? "no" : chance(0.85) ? "yes" : "no", invoice_status: "not_invoiced", task_id: null, created_at: now, updated_at: now,
    });
  }

  const notifiableTasks = result.tasks.filter((task) => task.workspace_id === business).slice(0, 120);
  notifiableTasks.forEach((task, index) => {
    const read = chance(0.7);
    result.notifications.push({
      notification_id: id("notification", `gen-${index}`), workspace_id: task.workspace_id, module_id: "tasks",
      event_type: task.status === "complete" ? "task.completed" : "task.reminder.due",
      recipient_user_id: pick(assigneePools[task.workspace_id]), actor_user_id: task.created_by_user_id,
      record_type: "task", record_id: task.task_id, title: task.status === "complete" ? `Completed: ${task.title}` : `Reminder: ${task.title}`,
      body: "Fake generated notification for the Northwind scenario.", url: `workbench.html?taskId=${task.task_id}`,
      status: read ? "read" : "unread", priority: chance(0.2) ? "high" : "normal",
      created_at: `${date(anchorDate, -Math.floor(random() * 14))}T17:00:00.000Z`, read_at: read ? now : null, dismissed_at: null,
      metadata_json: JSON.stringify({ fake: true, generated: true }),
    });
  });

  const resumeCandidates = result.tasks.filter((task) => task.status === "in_progress" && task.workspace_id === business).slice(0, 9);
  resumeCandidates.forEach((task, index) => {
    const userId = pick(assigneePools[task.workspace_id]);
    result.resumeRows.push({
      resume_state_id: id("resume", `gen-${index}`), workspace_id: task.workspace_id, user_id: userId, module_id: "tasks", record_type: "task", record_id: task.task_id,
      client_id: task.client_id, project_id: task.project_id, source_url: `workbench.html?taskId=${task.task_id}`,
      title_snapshot: task.title, context_label_snapshot: "Northwind Studio", last_action_type: "task.updated", last_action_label: "Updated task",
      last_worked_at: task.last_worked_at, handoff_note: "Generated resume thread for the fat scenario.", next_action: task.next_action || "Pick the next fake step.",
      blocked_reason: "", status_snapshot: "in_progress", priority_snapshot: task.priority, due_at_snapshot: task.due_at_utc,
      resume_rank_hint: 50 - index, metadata_json: JSON.stringify({ fake: true, generated: true }), dismissed_at: null, dismissed_source_updated_at: null, created_at: now, updated_at: now,
    });
  });

  const tagSpecs = [
    ["billing", "Billing", "#0ea5e9", business], ["fieldwork", "Fieldwork", "#65a30d", fieldOps], ["client-facing", "Client Facing", "#e11d48", business],
    ["internal", "Internal", "#7c3aed", business], ["urgent-follow-up", "Urgent Follow Up", "#dc2626", business], ["seasonal", "Seasonal", "#f59e0b", business],
    ["reading", "Reading", "#0891b2", priyaPersonal], ["household", "Household", "#16a34a", family], ["site-visit", "Site Visit", "#a16207", fieldOps],
  ];
  for (const [slug, name, color, workspaceId] of tagSpecs) {
    result.tags.push({ tag_id: id("tag", slug), workspace_id: workspaceId, name, slug, description: `Fake ${name.toLowerCase()} scenario tag.`, color, status: "active", created_by_user_id: users.alex, created_at: now, updated_at: now });
  }
  const taggableTags = { [business]: ["billing", "client-facing", "internal", "urgent-follow-up", "seasonal", "review", "launch"], [fieldOps]: ["fieldwork", "site-visit"], [priyaPersonal]: ["reading"], [family]: ["household"] };
  result.tasks.forEach((task, index) => {
    const slugs = taggableTags[task.workspace_id];
    if (!slugs || index % 6 !== 0) return;
    const slug = pick(slugs);
    result.tagAssignments.push({ tag_assignment_id: id("tag-assignment", "task", task.task_id, slug), workspace_id: task.workspace_id, tag_id: id("tag", slug), target_type: "task", target_id: task.task_id, created_by_user_id: users.alex, source: "manual", source_assignment_id: null, source_target_type: null, source_target_id: null, propagation_rule_id: null, created_at: now });
  });
  result.notes.forEach((note, index) => {
    const slugs = taggableTags[note.workspace_id];
    if (!slugs || index % 10 !== 0) return;
    const slug = pick(slugs);
    result.tagAssignments.push({ tag_assignment_id: id("tag-assignment", "note", note.note_id, slug), workspace_id: note.workspace_id, tag_id: id("tag", slug), target_type: "note", target_id: note.note_id, created_by_user_id: users.alex, source: "manual", source_assignment_id: null, source_target_type: null, source_target_id: null, propagation_rule_id: null, created_at: now });
  });

  return result;
}

async function createRoleFixtureRows(roleFixtures, operatorUserId) {
  const rows = [];
  for (const fixture of roleFixtures.fixtures) {
    const credential = roleFixtures.credentials.get(fixture.roleId);
    rows.push({
      ...fixture,
      passwordHash: fixture.roleId === "super_admin"
        ? null
        : await hashPassword(credential.password),
      userId: fixture.roleId === "super_admin"
        ? operatorUserId
        : id("role-fixture-user", fixture.roleId),
    });
  }
  return rows;
}

function resolveRoleFixtureScopeId(fixture, { business }) {
  if (fixture.scopeKey === "all") return "all";
  if (fixture.scopeKey === "northwind") return business;
  if (fixture.scopeKey === "cedar") return id("client", "cedar");
  if (fixture.scopeKey === "website") return id("project", "website");
  throw new Error(`Unknown sanitized-demo role scope key: ${fixture.scopeKey}`);
}

async function verifySeededRoleFixtureContract(db, roleFixtures, {
  businessWorkspaceId,
  operatorUserId,
}) {
  if (!roleFixtures) {
    const activePersonas = await db.get(`
SELECT COUNT(*) AS count
FROM users
WHERE protected_user = 'no'
  AND (user_status != 'inactive' OR password != :disabledPassword);
`, { disabledPassword: DISABLED_PERSONA_PASSWORD });
    if (Number(activePersonas.count) !== 0) {
      throw new Error("Development seed contract violation: a fictional persona login was enabled.");
    }
    return;
  }

  const expectedByUserId = new Map(roleFixtures.fixtures.map((fixture) => {
    const userId = fixture.roleId === "super_admin"
      ? operatorUserId
      : id("role-fixture-user", fixture.roleId);
    return [userId, {
      ...fixture,
      scopeId: resolveRoleFixtureScopeId(fixture, { business: businessWorkspaceId }),
      userId,
    }];
  }));
  const activeUsers = await db.query(`
SELECT user_id, username, user_status, protected_user, password
FROM users
WHERE user_status = 'active'
ORDER BY username;
`);
  if (activeUsers.length !== roleFixtures.fixtures.length) {
    throw new Error("Sanitized-demo role fixture contract requires exactly seven active login identities.");
  }
  for (const user of activeUsers) {
    const expected = expectedByUserId.get(user.user_id);
    if (
      !expected
      || user.username !== expected.username
      || !String(user.password || "").startsWith("$argon2id$")
      || (expected.roleId === "super_admin") !== (user.protected_user === "yes")
    ) {
      throw new Error("Sanitized-demo role fixture identity contract is inconsistent.");
    }

    const memberships = await db.query(`
SELECT workspace_id, status
FROM user_workspaces
WHERE user_id = :userId
ORDER BY workspace_id;
`, { userId: user.user_id });
    if (expected.roleId !== "super_admin" && (
      memberships.length !== 1
      || memberships[0].workspace_id !== businessWorkspaceId
      || memberships[0].status !== "active"
    )) {
      throw new Error("Sanitized-demo role fixture membership contract is inconsistent.");
    }

    const assignments = await db.query(`
SELECT role_id, scope_type, scope_id, permission_overrides_json
FROM user_role_assignments
WHERE user_id = :userId
ORDER BY role_id, scope_type, scope_id;
`, { userId: user.user_id });
    if (
      assignments.length !== 1
      || assignments[0].role_id !== expected.roleId
      || assignments[0].scope_type !== expected.scopeType
      || assignments[0].scope_id !== expected.scopeId
      || assignments[0].permission_overrides_json !== null
    ) {
      throw new Error("Sanitized-demo role fixture assignment contract is inconsistent.");
    }
  }

  const unexpectedActivePersonas = await db.get(`
SELECT COUNT(*) AS count
FROM users
WHERE protected_user = 'no'
  AND user_status != 'inactive'
  AND user_id NOT IN (${[...expectedByUserId.keys()]
    .filter((userId) => userId !== operatorUserId)
    .map((_, index) => `:roleUser${index}`)
    .join(", ")});
`, Object.fromEntries([...expectedByUserId.keys()]
    .filter((userId) => userId !== operatorUserId)
    .map((userId, index) => [`roleUser${index}`, userId])));
  if (Number(unexpectedActivePersonas.count) !== 0) {
    throw new Error("Sanitized-demo role fixture contract enabled an ordinary fictional persona.");
  }

  const identityRows = await db.query("SELECT username, alt_email FROM users;");
  for (const identity of identityRows) {
    for (const value of [identity.username, identity.alt_email].filter(Boolean)) {
      const domain = String(value).split("@")[1]?.toLowerCase();
      if (!["example.com", "example.test", "longtailforge.local"].includes(domain)) {
        throw new Error("Sanitized-demo role fixture contract contains a non-reserved identity domain.");
      }
    }
  }
}

function clientRow(clientId, workspaceId, name, now) {
  return { id: clientId, workspace_id: workspaceId, parent_client_id: null, name, status: "Active", billable: "yes", billing_rate: null, billing_period_type: null, billing_period_start_day: null, billing_rounding_enabled: null, billing_rounding_increment: null, billing_contact_name: "", billing_contact_email: "", billing_contact_alternate_name: "", billing_contact_alternate_email: "", billing_contact_phone_number: "", billing_contact_alternate_phone_number: "", billing_contact_street_address_1: "", billing_contact_street_address_2: "", billing_contact_city: "", billing_contact_state: "", billing_contact_zip_code: "", created_at: now, updated_at: now };
}

function timerRow(key, workspaceId, userId, taskId, clientId, projectId, clientName, projectName, taskTitle, now, status, seconds, taskTimerStatusTransition) {
  return { active_timer_id: id("timer", key), workspace_id: workspaceId, user_id: userId, timer_slot: `source:tasks:task:${taskId}`, source_module_id: "tasks", source_type: "task", source_id: taskId, source_label: taskTitle, source_url: `tasks.html?task=${taskId}`, client_id: clientId, client_name: clientName, project_id: projectId, project_name: projectName, description: taskTitle, billable: "yes", accumulated_elapsed_seconds: seconds, last_active_start_time: status === "running" ? now : null, timer_status: status, created_at: now, updated_at: now, source_metadata_json: JSON.stringify({ fake: true, taskTimerStatusTransition }) };
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
    .filter(([key]) => key !== "id" && key !== "password" && !key.endsWith("_id"))
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

export const __test = { id, semanticFingerprint };
export { main as runDevelopmentDataCli };
