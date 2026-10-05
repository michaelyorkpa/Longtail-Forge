// Runtime proof for the Workbench bootstrap response contracts.
//
// **Three of this envelope's seven members are constants, and the producer says so in its own
// source.** `taskOptions` is literally `null`, `timers` and `workCandidates` are literally `[]`,
// and a comment beside them records that the fifty-candidate bootstrap computation was removed once
// the browser began resolving candidates from `/api/workbench/focus-candidates`. So no Task option
// contract is reused here - none is sent - and there is no work-candidate record to derive.
//
// What is real: a module state map that `buildModuleStateMap` reconstructs exactly, and a registry
// of three contribution lists whose entries are **spread** from each module's own declaration, so
// only `moduleId` is a guarantee this boundary may make.
//
// Producer authority is read from the workbench and modules services; contract authority from the
// browser declaration; the runtime from the page's own parser.

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();

const workbenchServiceSource = readText("src/services/workbench.service.js");
const modulesServiceSource = readText("src/core/modules/modules.service.js");
const demoSource = readText("src/core/public-demo-enforcement.js");
const declarationSource = readText("src/types/browser-contracts.d.ts");
const workbenchPage = readText("public/js/workbench.js");

const page = sandbox(workbenchPage,
  ["isBootstrapRecord", "isWorkbenchContribution", "isWorkbenchModuleState",
    "readWorkbenchRegistry", "readWorkbenchModuleStates", "readWorkbenchBootstrap"],
  ["WORKBENCH_MODULE_STATUSES"]);

describe("the bootstrap envelope", () => {
  it("describes the seven members the service builds", () => {
    const built = shapedMembers(workbenchServiceSource, "bootstrap", 4);
    assert.deepEqual(built.slice().sort(),
      ["currentUserId", "modules", "registry", "taskOptions", "timers", "workCandidateMode", "workCandidates"],
      "the service returns exactly those seven members");
    assert.deepEqual(declaredMembers("BrowserWorkbenchBootstrap").slice().sort(), built.slice().sort(),
      "the contract is exactly what the service returns");
  });

  it("records the three members the producer sends as constants", () => {
    const block = extractFunctionBlock(workbenchServiceSource, "bootstrap");
    assert.match(block, /\n\s+taskOptions: null,/,
      "the bootstrap never sends a task option catalog, so none is reused here");
    assert.match(block, /\n\s+timers: \[\],/);
    assert.match(block, /\n\s+workCandidates: \[\],/);
    assert.match(block, /former 50-candidate bootstrap computation/,
      "and the producer explains why the candidate list is empty");
    assert.match(declarationBlock("BrowserWorkbenchBootstrap"), /\n  taskOptions: null;/,
      "the contract states the constant rather than implying a catalog arrives");
  });

  it("does not reuse the Task option catalog it never receives", () => {
    assert.doesNotMatch(declarationBlock("BrowserWorkbenchBootstrap"), /BrowserTaskListOptions/,
      "reusing the option catalog here would claim a producer identity that does not exist");
  });

  it("takes the current user straight from the session", () => {
    assert.match(extractFunctionBlock(workbenchServiceSource, "bootstrap"), /currentUserId: session\.user_id,/,
      "the producer takes it straight from the authenticated session");
    assert.match(declarationBlock("BrowserWorkbenchBootstrap"), /\n  currentUserId: string;/);
    assert.equal(page.readWorkbenchBootstrap({ currentUserId: 4 }).currentUserId, "",
      "a body that cannot supply it answers the empty string, which is what the read fell back to");
  });

  it("answers every absence the page already handled", () => {
    for (const empty of [null, undefined, "body", 4, [], {}]) {
      const read = page.readWorkbenchBootstrap(empty);
      assert.equal(read.registry, null, "which the page turns into its cached registry");
      assert.equal(read.modules, null, "and this into the module map it is holding");
      assert.equal(read.currentUserId, "");
      assert.equal(read.taskOptions, null);
      assert.deepEqual(plain(read.workCandidates), []);
      assert.deepEqual(plain(read.timers), []);
      assert.equal(read.workCandidateMode, "");
    }
  });

  it("accepts a bootstrap the service could send", () => {
    const body = {
      currentUserId: "u-1",
      modules: { tasks: moduleState() },
      registry: registry(),
      taskOptions: null,
      timers: [],
      workCandidateMode: "",
      workCandidates: [],
    };
    assert.deepEqual(plain(page.readWorkbenchBootstrap(body)), body);
  });
});

describe("the module state map", () => {
  it("is an exact reconstruction of three members", () => {
    const built = shapedMembers(workbenchServiceSource, "buildModuleStateMap", 6);
    assert.deepEqual(built.slice().sort(), ["displayName", "enabled", "status"]);
    assert.deepEqual(declaredMembers("BrowserWorkbenchModuleState").slice().sort(), built.slice().sort());
    const block = extractFunctionBlock(workbenchServiceSource, "buildModuleStateMap");
    assert.match(block, /enabled: moduleDefinition\.status === "enabled",/);
    assert.match(block, /status: moduleDefinition\.status === "enabled" \? "enabled" : "disabled",/,
      "the two spellings come from one comparison, so they cannot disagree");
    assert.match(declarationSource, /export type BrowserWorkbenchModuleStatus = "disabled" \| "enabled";/);
  });

  it("checks each value rather than the map", () => {
    assert.deepEqual(plain(page.readWorkbenchModuleStates({ tasks: moduleState() })), { tasks: moduleState() });
    assert.deepEqual(
      plain(page.readWorkbenchModuleStates({ tasks: moduleState(), notes: { enabled: true }, lists: null })),
      { tasks: moduleState() },
      "an object keyed by module id does not make its values module states");
    for (const member of ["displayName", "enabled", "status"]) {
      assert.equal(page.isWorkbenchModuleState(omit(moduleState(), member)), false, `${member} is always built`);
    }
    assert.equal(page.isWorkbenchModuleState({ ...moduleState(), status: "pending" }), false,
      "a word the shaper never writes is not a status");
    assert.equal(page.isWorkbenchModuleState({ ...moduleState(), enabled: "true" }), false);
    for (const malformed of [null, "tasks", 4, [moduleState()]]) {
      assert.equal(page.readWorkbenchModuleStates(malformed), null,
        "a map that is not a record answers null, which the page turned into the map it held");
    }
  });
});

describe("the registry", () => {
  it("is three contribution lists and is not the module map", () => {
    const block = extractFunctionBlock(workbenchServiceSource, "bootstrap");
    assert.match(block, /registry: \{\s+workbenchCards,\s+timerSources,\s+workItemSources,\s+\},/,
      "the registry is a fixed three-member record of lists");
    // The reader names the three lists itself rather than looping a table, so the contract is
     // the authority and the runtime is checked against it by name.
    const reader = extractFunctionBlock(workbenchPage, "readWorkbenchRegistry");
    for (const list of declaredMembers("BrowserWorkbenchRegistry")) {
      assert.match(reader, new RegExp(`${list}: Array\\.isArray\\(${list}\\) \\? ${list}\\.filter\\(isWorkbenchContribution\\)`),
        `the browser must check ${list}, which is one of the three the registry declares`);
    }
    assert.deepEqual(declaredMembers("BrowserWorkbenchRegistry").slice().sort(),
      ["timerSources", "workItemSources", "workbenchCards"],
      "and the browser checks exactly those three");
    assert.notDeepEqual(declaredMembers("BrowserWorkbenchRegistry"), declaredMembers("BrowserWorkbenchModuleState"),
      "registry and modules are different runtime concepts, not two names for one");
  });

  it("promises only what normalizeContribution overrides", () => {
    const block = extractFunctionBlock(modulesServiceSource, "normalizeContribution");
    assert.match(block, /\.\.\.contribution,/,
      "the shaper spreads what the module declared, so exactness cannot be claimed");
    assert.match(block, /moduleId: typeof contribution\.moduleId === "string"/,
      "and overrides exactly one member");
    assert.deepEqual(declaredMembers("BrowserWorkbenchContribution"), ["moduleId"],
      "the contribution contract is that one member");
  });

  it("never claims a member the contributing module declared", () => {
    for (const declared of ["renderer", "label", "sortOrder", "actions", "id"]) {
      assert.doesNotMatch(declarationBlock("BrowserWorkbenchContribution"), new RegExp(`\\n  ${declared}\\??:`),
        `${declared} belongs to the contributing module's own declaration, not to this boundary`);
    }
  });

  it("accepts what the two filters left behind", () => {
    const listing = extractFunctionBlock(modulesServiceSource, "listWorkspaceContributions");
    assert.match(listing, /if \(!enabledModuleIds\.has\(moduleDefinition\.id\)\) \{/,
      "a disabled module contributes nothing");
    assert.match(listing, /if \(!\(await requiredPermissionsAllowed\(normalized, session\)\)\) \{/,
      "and a contribution the caller may not use is dropped before it is sent");
    assert.match(extractFunctionBlock(demoSource, "filterPublicDemoContributionActions"),
      /return \/\*\* @type \{T\} \*\/ \(filterContributionValue\(contribution, options, ""\)\);/,
      "a public demo then removes individual actions");
    assert.equal(page.isWorkbenchContribution({ moduleId: "tasks" }), true,
      "so a contribution stripped to its identity is still a contribution");
  });

  it("checks elements rather than the three containers", () => {
    const good = { moduleId: "tasks", renderer: "active-work-timers" };
    const read = plain(page.readWorkbenchRegistry({
      timerSources: [good, { renderer: "x" }, null],
      workbenchCards: [good, 4],
      workItemSources: "none",
    }));
    assert.deepEqual(read.timerSources, [good], "an array of cards does not make its entries cards");
    assert.deepEqual(read.workbenchCards, [good]);
    assert.deepEqual(read.workItemSources, [], "a list that is not a list contributes none");
    assert.equal(page.isWorkbenchContribution({ moduleId: "" }), false);
    for (const malformed of [null, "registry", 4, [registry()]]) {
      assert.equal(page.readWorkbenchRegistry(malformed), null,
        "a registry that is not a record answers null, which both reads already handled");
    }
  });
});

describe("the transport", () => {
  it("narrows the bootstrap before the page reads any part of it", () => {
    assert.match(workbenchPage, /const bootstrap = readWorkbenchBootstrap\(bootstrapBody\);/,
      "the envelope is narrowed once and the destructure reads the result");
    assert.match(workbenchPage, /readWorkbenchBootstrap\(body\)\.registry \|\| \{\}/,
      "and the early source-data fan-out narrows the same body rather than trusting it");
    // `bootstrap.registry` is still spelled that way and should be: `bootstrap` is now the
    // narrowed value. What must not survive is a read of the raw body, so that is what is checked.
    assert.equal([...workbenchPage.matchAll(/\bbootstrapBody\b/g)].length, 2,
      "the raw body is named where it is awaited and where it is narrowed, and nowhere else");
    assert.doesNotMatch(workbenchPage, /bootstrapBody\./,
      "and no member is read off the raw body directly");
    assert.match(declarationSource, /getJson\([^)]*\): Promise<unknown>;/,
      "BrowserApi keeps returning a promise of unknown");
  });

  it("keeps the parser local rather than publishing a surface for one response", () => {
    assert.doesNotMatch(workbenchPage, /namespace\.workbenchBootstrap/,
      "only Workbench consumes this response, so it needs no published surface");
    assert.doesNotMatch(declarationSource, /readWorkbenchBootstrap\(/,
      "and no namespace contract gains a member for it");
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
  const literal = block.slice(block.indexOf("return"));
  return [...new Set([...literal.matchAll(new RegExp(`^\\s{${indent}}([a-zA-Z_]\\w*)[:,]`, "gm"))]
    .map((entry) => entry[1]))];
}

/** @param {string} name @returns {string} */
function declarationBlock(name) {
  const match = declarationSource.match(new RegExp(`export interface ${name}\\b[^{]*\\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `${name} must be declared`);
  return match[0];
}

/** @param {string} name @returns {string[]} */
function declaredMembers(name) {
  return [...declarationBlock(name).matchAll(/^  (\w+)\??:/gm)].map((entry) => entry[1]);
}

/** @returns {Record<string, unknown>} */
function moduleState() {
  return { displayName: "Tasks", enabled: true, status: "enabled" };
}

/** @returns {Record<string, unknown>} */
function registry() {
  /** @type {Record<string, unknown>} */
  const record = {};
  for (const list of declaredMembers("BrowserWorkbenchRegistry")) record[list] = [{ moduleId: "tasks" }];
  return record;
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
