// Runtime proof for the Task option-catalog element contracts.
//
// `0.33.33.38.4.3.2` typed the list envelope and left `clients`, `projects`, `tasks` and `users`
// as `unknown[]` with container-only validation. That was honest while their producers were
// untraced, and typing the state slot made the element-level debt visible in the consumers rather
// than creating it. This child traces the four producers and closes it.
//
// **Four producers, four records, one envelope.** A single option type covering all four would
// erase exactly the distinctions these checkpoints recovered.
//
// Producer authority is read from the two option payload builders, the two row shapers and the
// user shaper; contract authority from the browser declaration; the runtime from the shared
// module. No expected answer is derived from the source under test.

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();

const taskServiceSource = readText("src/modules/tasks/tasks.service.js");
const clientsRepoSource = readText("src/modules/client-projects/clients.repo.js");
const projectsRepoSource = readText("src/modules/client-projects/projects.repo.js");
const usersRepoSource = readText("src/repositories/users.repo.js");
const normalizersSource = readText("src/utils/normalizers.js");
const declarationSource = readText("src/types/browser-contracts.d.ts");
const sharedSource = readText("public/js/shared/task-records.js");

const shared = sandbox(sharedSource,
  ["isResponseRecord", "isText", "isClientOption", "isProjectOption", "isTaskPickerOption",
    "isUserOption", "readTaskListOptions"],
  ["TASK_OPTION_COLLECTIONS", "TASK_OPTION_TEXT_LISTS", "TASK_OPTION_FLAGS",
    "CLIENT_OPTION_TEXT", "PROJECT_OPTION_TEXT", "TASK_PICKER_OPTION_TEXT", "USER_OPTION_TEXT"]);

describe("the four collections are four records", () => {
  it("gives every collection its own element type", () => {
    const block = declarationBlock("BrowserTaskListOptions");
    for (const [member, record] of [
      ["clients", "BrowserTaskClientOption"],
      ["projects", "BrowserTaskProjectOption"],
      ["tasks", "BrowserTaskPickerOption"],
      ["users", "BrowserTaskUserOption"],
    ]) {
      assert.match(block, new RegExp(`\\n  ${member}: ${record}\\[\\];`),
        `${member} comes from its own producer and must carry its own record`);
      assert.doesNotMatch(block, new RegExp(`\\n  ${member}: unknown\\[\\];`));
    }
    const members = new Set([
      ...declaredMembers("BrowserTaskClientOption"),
      ...declaredMembers("BrowserTaskProjectOption"),
      ...declaredMembers("BrowserTaskUserOption"),
    ]);
    assert.ok(!members.has("optionKind") && !members.has("type"),
      "no discriminator, because these were never one type with optional halves");
  });

  it("will not let one option record stand in for another", () => {
    assert.equal(shared.isClientOption(projectOption()), false, "a project carries a client relationship");
    assert.equal(shared.isProjectOption(clientOption()), false, "and a client carries a parent instead");
    assert.equal(shared.isClientOption(userOption()), false);
    assert.equal(shared.isUserOption(clientOption()), false);
    assert.equal(shared.isTaskPickerOption(projectOption()), false);
    assert.equal(shared.isUserOption(pickerOption()), false);
  });
});

describe("the client option", () => {
  it("promises what its two producers guarantee and nothing the spreads carry", () => {
    const shaper = extractFunctionBlock(clientsRepoSource, "clientRowToAppClient");
    for (const guaranteed of ["id", "name", "parent_client_id"]) {
      assert.match(shaper, new RegExp(`^    ${guaranteed}: `, "m"),
        `${guaranteed} is reconstructed by the row shaper`);
    }
    const payload = extractFunctionBlock(taskServiceSource, "readClientOptionPayload");
    assert.match(payload, /\.\.\.client,/, "the payload builder spreads, so exactness cannot be claimed");
    for (const built of ["optionLabel", "displayName", "hierarchyDepth"]) {
      assert.match(payload, new RegExp(`^\\s+${built}: `, "m"), `${built} is reconstructed here`);
    }
    assert.deepEqual(declaredMembers("BrowserTaskClientOption").slice().sort(),
      ["displayName", "hierarchyDepth", "id", "name", "optionLabel", "parent_client_id"],
      "the client option is those six members and no others");
  });

  it("never acquires what the two spreads merely carry past it", () => {
    const block = declarationBlock("BrowserTaskClientOption");
    for (const spread of ["billing_rate", "billing_display", "tag_summary", "display_path", "can_manage"]) {
      assert.doesNotMatch(block, new RegExp(`\\n  ${spread}\\??:`),
        `${spread} arrives through a spread and belongs to the client-projects estate`);
    }
  });

  it("rejects a client it cannot vouch for", () => {
    assert.equal(shared.isClientOption(clientOption()), true);
    assert.equal(shared.isClientOption({ ...clientOption(), parent_client_id: "" }), true,
      "a top-level client has the empty string, not an absence");
    assert.equal(shared.isClientOption({ ...clientOption(), parent_client_id: null }), false);
    for (const member of plain(shared.CLIENT_OPTION_TEXT)) {
      assert.equal(shared.isClientOption(omit(clientOption(), member)), false, `${member} is guaranteed`);
      assert.equal(shared.isClientOption({ ...clientOption(), [member]: 4 }), false, `${member} is text`);
    }
    assert.equal(shared.isClientOption({ ...clientOption(), hierarchyDepth: "0" }), false,
      "the builder answers a number");
    assert.equal(shared.isClientOption({ ...clientOption(), id: "" }), false);
    for (const malformed of [null, undefined, "client", 4, [clientOption()]]) {
      assert.equal(shared.isClientOption(malformed), false);
    }
  });
});

describe("the project option", () => {
  it("is not a client option with a client added", () => {
    const shaper = extractFunctionBlock(projectsRepoSource, "projectRowToAppProject");
    for (const guaranteed of ["id", "name", "client_id"]) {
      assert.match(shaper, new RegExp(`^    ${guaranteed}: `, "m"),
        `${guaranteed} is reconstructed by the project row shaper`);
    }
    const payload = extractFunctionBlock(taskServiceSource, "readProjectOptionPayload");
    assert.match(payload, /\.\.\.project,/);
    assert.match(payload, /clientsService\.listProjects\(/,
      "it reaches a different service call than the client payload does");
    assert.deepEqual(declaredMembers("BrowserTaskProjectOption").slice().sort(),
      ["client_id", "displayName", "hierarchyDepth", "id", "name", "optionLabel"],
      "the project option is those six members and no others");
  });

  it("does not borrow the client record's parent relationship", () => {
    assert.ok(!declaredMembers("BrowserTaskProjectOption").includes("parent_client_id"),
      "the parent relationship belongs to the client record");
  });

  it("accepts a project with no client, and rejects one it cannot vouch for", () => {
    assert.equal(shared.isProjectOption(projectOption()), true);
    assert.equal(shared.isProjectOption({ ...projectOption(), client_id: "" }), true,
      "a project with no client is not a malformed project");
    assert.equal(shared.isProjectOption({ ...projectOption(), client_id: null }), false,
      "the row shaper answers the empty string rather than null");
    for (const member of plain(shared.PROJECT_OPTION_TEXT)) {
      assert.equal(shared.isProjectOption(omit(projectOption(), member)), false, `${member} is guaranteed`);
    }
    assert.equal(shared.isProjectOption({ ...projectOption(), hierarchyDepth: null }), false);
    assert.equal(shared.isProjectOption({ ...projectOption(), id: "" }), false);
  });
});

describe("the task picker option", () => {
  it("is a picker projection and not any task record", () => {
    const built = shapedMembers(taskServiceSource, "taskPickerOption", 4);
    assert.equal(built.length, 13, "taskPickerOption reconstructs thirteen members");
    assert.deepEqual(declaredMembers("BrowserTaskPickerOption").slice().sort(), built.slice().sort());
    assert.deepEqual(plain(shared.TASK_PICKER_OPTION_TEXT).slice().sort(), built.slice().sort(),
      "and the browser checks every one of them");
  });

  it("never widens into a task record", () => {
    const block = declarationBlock("BrowserTaskPickerOption");
    for (const taskOnly of ["assignees", "billable", "workspace_id", "reminder_override_enabled",
      "checklistProgress", "resumeContext"]) {
      assert.doesNotMatch(block, new RegExp(`\\n  ${taskOnly}\\??:`),
        `${taskOnly} belongs to a task record and this producer never builds it`);
    }
  });

  it("keeps its permission filtering upstream of the browser", () => {
    const block = extractFunctionBlock(taskServiceSource, "readTaskOptionPayload");
    assert.match(block, /createPermissionEvaluator\(session, "tasks\.view"\)/,
      "the option list is permission-filtered before it is shaped");
    assert.match(block, /canReadTaskRow\(taskResource\(task\)\)/);
    assert.match(block, /\.map\(taskPickerOption\)/);
  });

  it("rejects a picker option it cannot vouch for", () => {
    assert.equal(shared.isTaskPickerOption(pickerOption()), true);
    for (const member of plain(shared.TASK_PICKER_OPTION_TEXT)) {
      assert.equal(shared.isTaskPickerOption({ ...pickerOption(), [member]: null }), false,
        `${member} has a total fallback and is always text`);
    }
    assert.equal(shared.isTaskPickerOption({ ...pickerOption(), task_id: "" }), false);
  });
});

describe("the user option", () => {
  it("is a deliberate subset of the user record and says so", () => {
    assert.match(extractFunctionBlock(usersRepoSource, "readAll"), /return rows\.map\(userRowToAppValue\);/,
      "the producer really is the user-record shaper");
    const full = declaredMembers("BrowserUserRecord");
    const subset = declaredMembers("BrowserTaskUserOption");
    for (const member of subset) {
      assert.ok(full.includes(member), `${member} must exist on the record this is drawn from`);
    }
    assert.deepEqual(subset.slice().sort(), ["displayName", "user_id", "username"],
      "the subset is those three members and no others");
    assert.ok(full.length > subset.length,
      "the wire carries fifteen members; this contract promises three and claims no more");
    // The doc comment sits above `export interface`, so it is outside the member block.
    assert.match(declarationDoc("BrowserTaskUserOption"), /deliberate subset of `BrowserUserRecord`/,
      "and the declaration has to say that, or the subset masquerades as the record");
  });

  it("keeps the columns the user shaper withholds out of the vocabulary", () => {
    const shaper = extractFunctionBlock(normalizersSource, "userRowToAppValue");
    // `passwordChangeRequired` is a member the shaper does build, so the check has to name the
    // column rather than the substring.
    assert.doesNotMatch(shaper, /^\s+password:/m, "the shaper never emits the password column it selects");
    assert.match(shaper, /passwordChangeRequired:/, "while the flag beside it is genuinely sent");
    for (const withheld of ["password", "home_workspace_id", "active_workspace_id"]) {
      assert.doesNotMatch(declarationBlock("BrowserTaskUserOption"), new RegExp(`\\n  ${withheld}\\??:`),
        `${withheld} must never enter this catalog's vocabulary`);
      assert.doesNotMatch(sharedSource, new RegExp(`"${withheld}"`),
        `${withheld} must never enter this catalog's runtime vocabulary`);
    }
  });

  it("rejects a member it cannot vouch for", () => {
    assert.equal(shared.isUserOption(userOption()), true);
    for (const member of plain(shared.USER_OPTION_TEXT)) {
      assert.equal(shared.isUserOption(omit(userOption(), member)), false, `${member} is always built`);
      assert.equal(shared.isUserOption({ ...userOption(), [member]: 7 }), false, `${member} is text`);
    }
    assert.equal(shared.isUserOption({ ...userOption(), user_id: "" }), false);
  });
});

describe("the catalog reader", () => {
  it("drops a malformed option and keeps the catalog", () => {
    const read = plain(shared.readTaskListOptions({
      ...catalog(),
      clients: [clientOption(), { id: "c-2" }, null, "client"],
      projects: [projectOption(), 4],
      tasks: [pickerOption(), {}],
      users: [userOption(), { user_id: "u-2" }],
    }));
    assert.deepEqual(read.clients, [clientOption()],
      "a selector with one unusable entry has always rendered the rest");
    assert.deepEqual(read.projects, [projectOption()], "a selector with one unusable entry keeps the rest");
    assert.deepEqual(read.tasks, [pickerOption()], "a selector with one unusable entry keeps the rest");
    assert.deepEqual(read.users, [userOption()], "a selector with one unusable entry keeps the rest");
    assert.equal(read.workspaceType, "business");
  });

  it("refuses a catalog whose own scalars are wrong", () => {
    for (const broken of [
      { workspaceType: 4 },
      { taskTimersEnabled: "yes" },
      { timeTrackingEnabled: null },
      { priorities: "normal" },
      { statuses: [4] },
      { clients: {} },
      { users: null },
    ]) {
      assert.equal(shared.readTaskListOptions({ ...catalog(), ...broken }), null,
        `an unusable catalog falls back to the stand-in the page holds: ${Object.keys(broken)[0]}`);
    }
    for (const empty of [null, undefined, "options", 4, [], {}]) {
      assert.equal(shared.readTaskListOptions(empty), null);
    }
  });

  it("accepts a catalog the service could build", () => {
    assert.deepEqual(plain(shared.readTaskListOptions(catalog())), catalog(),
      "a well-formed catalog survives the reconstruction unchanged");
  });

  it("answers exactly the members readOptions builds", () => {
    const built = shapedMembers(taskServiceSource, "readOptions", 4);
    assert.deepEqual(Object.keys(plain(shared.readTaskListOptions(catalog()))).sort(), built.slice().sort(),
      "the reconstruction answers exactly the nine members readOptions builds");
  });
});

/** @param {string} source @param {readonly string[]} functions @param {readonly string[]} tables */
function sandbox(source, functions, tables) {
  const context = vm.createContext({});
  for (const table of tables) {
    const match = source.match(new RegExp(`const ${table} = Object\\.freeze\\(\\[[\\s\\S]*?\\]\\);`));
    assert.ok(match, `${table} must remain a frozen table this owner can read`);
    vm.runInContext(match[0], context, { filename: table });
  }
  for (const name of functions) {
    vm.runInContext(extractFunctionBlock(source, name), context, { filename: name });
  }
  return vm.runInContext(`({ ${[...functions, ...tables].join(", ")} })`, context);
}

/** @param {string} source @param {string} fn @param {number} indent */
function shapedMembers(source, fn, indent) {
  const block = extractFunctionBlock(source, fn);
  const literal = block.slice(block.indexOf("return {"));
  return [...new Set([...literal.matchAll(new RegExp(`^\\s{${indent}}([a-zA-Z_]\\w*)[:,]`, "gm"))]
    .map((entry) => entry[1]))];
}

/** @param {string} name @returns {string} */
function declarationBlock(name) {
  const match = declarationSource.match(new RegExp(`export interface ${name}\\b[^{]*\\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `${name} must be declared`);
  return match[0];
}

/** The prose above a declaration, which is where its reasoning lives. @param {string} name */
function declarationDoc(name) {
  const at = declarationSource.indexOf(`export interface ${name} `);
  assert.ok(at > 0, `${name} must be declared`);
  const start = declarationSource.lastIndexOf("/**", at);
  assert.ok(start > 0 && start < at, `${name} must carry a doc comment`);
  return declarationSource.slice(start, at);
}

/** @param {string} name @returns {string[]} */
function declaredMembers(name) {
  return [...declarationBlock(name).matchAll(/^  (\w+)\??:/gm)].map((entry) => entry[1]);
}

/** @returns {Record<string, unknown>} */
function clientOption() {
  /** @type {Record<string, unknown>} */
  const client = { hierarchyDepth: 0 };
  for (const member of plain(shared.CLIENT_OPTION_TEXT)) client[member] = `${member}-value`;
  return client;
}

/** @returns {Record<string, unknown>} */
function projectOption() {
  /** @type {Record<string, unknown>} */
  const project = { hierarchyDepth: 1 };
  for (const member of plain(shared.PROJECT_OPTION_TEXT)) project[member] = `${member}-value`;
  return project;
}

/** @returns {Record<string, unknown>} */
function pickerOption() {
  /** @type {Record<string, unknown>} */
  const option = {};
  for (const member of plain(shared.TASK_PICKER_OPTION_TEXT)) option[member] = `${member}-value`;
  return option;
}

/** @returns {Record<string, unknown>} */
function userOption() {
  /** @type {Record<string, unknown>} */
  const user = {};
  for (const member of plain(shared.USER_OPTION_TEXT)) user[member] = `${member}-value`;
  return user;
}

/** @returns {Record<string, unknown>} */
function catalog() {
  return {
    clients: [clientOption()],
    priorities: ["normal"],
    projects: [projectOption()],
    statuses: ["open"],
    taskTimersEnabled: true,
    tasks: [pickerOption()],
    timeTrackingEnabled: false,
    users: [userOption()],
    workspaceType: "business",
  };
}

/** @param {Record<string, unknown>} record @param {string} member */
function omit(record, member) {
  const { [member]: _removed, ...rest } = record;
  return rest;
}

/** @template T @param {T} value @returns {T} */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
