import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * The thirty guarded member reads `0.33.33.38.2.6.9` adopted.
 *
 * Every one of these sites already proved its member present before using it; only the *root*
 * was unchecked. So the member's optionality is untouched - each guard keeps the exact test it
 * had - and the local it captures is what makes the guard's guarantee visible at the use.
 *
 * Where a term before the member read short-circuits, the root must not be read above it. Those
 * conditions are split at exactly that boundary rather than hoisting the capture, and the tests
 * below drive the shipped functions through both branches to show the order is unchanged.
 */

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

/** @type {Record<string, string>} */
const sources = {
  "clients-projects": read("public/js/clients-projects.js"),
  notes: read("public/js/notes.js"),
  tasks: read("public/js/tasks.js"),
  "time-entries": read("public/js/time-entries.js"),
  workbench: read("public/js/workbench.js"),
};

/** @param {string} source @param {string} opener */
function slice(source, opener) {
  const start = source.indexOf("  " + opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf("\n  }\n", start);
  assert.notEqual(end, -1, opener + " must terminate");
  return source.slice(start, end + 4);
}

/**
 * Lift one shipped function together with its file's own `requireNamespace`.
 * @param {string} key @param {string} opener @param {Record<string, unknown>} scope
 */
function lift(key, opener, scope) {
  const source = sources[key];
  const names = Object.keys(scope);
  const built = new Function("window", "document", ...names, [
    slice(source, "function requireNamespace() {"),
    slice(source, opener),
    "return " + opener.replace(/^(async )?function /, "").replace(/\(.*$/, "") + ";",
  ].join("\n"));
  return (/** @type {unknown} */ root, /** @type {unknown} */ documentValue = undefined) =>
    built({ LongtailForge: root }, documentValue, ...names.map((name) => scope[name]));
}

/** A minimal document whose createElement answers a recording node. */
function fakeDocument() {
  /** @type {{ created: string[] }} */
  const log = { created: [] };
  return {
    log,
    createElement(/** @type {string} */ tag) {
      log.created.push(tag);
      return { className: "", appendChild() {} };
    },
  };
}

describe("the thirty adopted sites, and the guards they belong to", () => {
  const EXPECTED = Object.freeze({
    "clients-projects": 4, notes: 9, tasks: 7, "time-entries": 6, workbench: 4,
  });

  /** Every function this checkpoint adopted, by file. */
  const ADOPTED = Object.freeze({
    "clients-projects": ["function appendTagChips(container, tags) {",
      "function mountTagPicker(container, tags = [], label = \"Tags\") {"],
    notes: ["async function loadTags() {", "async function mountTagEditor(note) {",
      "async function mountBulkTagPicker() {", "function mountFilesPanel(note, mount) {"],
    tasks: ["async function followTaskNotifications(task) {", "async function loadTagOptions() {",
      "function appendTagChips(container, tags) {"],
    "time-entries": ["async function loadTagOptions() {"],
    workbench: ["function navigateFromWorkbench(href, kind = \"workbench-navigation\") {"],
  });

  it("leaves no bare root read inside any adopted function", () => {
    // Scoped to what this checkpoint adopted. Reads elsewhere in these files belong to other
    // cohorts, and one of them - the ternary in clients-projects `loadTagOptions` - guards the
    // root with `?.` and must keep tolerating an absent root.
    for (const [key, openers] of Object.entries(ADOPTED)) {
      for (const opener of openers) {
        const body = slice(sources[key], opener);
        assert.ok(!/window\.LongtailForge\./.test(body),
          key + " " + opener.slice(0, 40) + " must not read the root directly");
        assert.match(body, /requireNamespace\(\)\./, key + " must acquire through the accessor");
      }
    }
    assert.equal(Object.values(EXPECTED).reduce((total, count) => total + count, 0), 30,
      "thirty sites across five files");
  });

  it("leaves the root-tolerant read in clients-projects tolerant", () => {
    assert.match(sources["clients-projects"],
      /window\.LongtailForge\?\.tags\?\.loadTags\s*\n\s*\? window\.LongtailForge\.tags\.loadTags\(/,
      "that ternary already tolerates an absent root and must not gain a hard dependency");
  });

  it("acquires through each file's own accessor, which checks only the root", () => {
    for (const key of Object.keys(EXPECTED)) {
      const body = slice(sources[key], "function requireNamespace() {");
      assert.match(body, /const namespace = window\.LongtailForge;/, key + " reads the root per call");
      assert.match(body, /requires the LongtailForge namespace\./, key + " names itself when it refuses");
      assert.ok(!/tags|fileAttachments|notificationSubscriptions|navigationIntent/.test(body),
        key + "'s accessor must not check any member");
    }
  });

  it("keeps every guard's own kind of test", () => {
    // Truthiness, method probes and positive conditions each survive as they were written.
    assert.match(sources.notes, /if \(!tagSurface\) \{/, "notes keeps a truthiness guard");
    assert.match(sources.tasks, /if \(!tagSurface\?\.loadTags\) \{/, "tasks keeps a method probe");
    assert.match(sources["time-entries"],
      /if \(tagSurface\?\.renderTagList && Array\.isArray\(entry\.tags\) && entry\.tags\.length > 0\) \{/,
      "time-entries keeps its positive guard and the terms after it");
    assert.match(sources.workbench, /if \(intent\) \{/, "workbench keeps a truthiness guard");
  });
});

describe("a capture above the guard, where the root was already read on every path", () => {
  const loadTags = (/** @type {unknown} */ root, /** @type {Record<string, unknown>} */ state) =>
    lift("notes", "async function loadTags() {", { state })(root);

  it("falls back and returns when the member is absent", async () => {
    const state = { availableTags: ["stale"] };
    await loadTags({}, state)();
    assert.deepEqual(state.availableTags, [], "the existing fallback still runs");
  });

  it("loads through the member when it is present", async () => {
    const state = { availableTags: [] };
    const surface = { loadTags: async (/** @type {unknown} */ query) => ["a", query] };
    await loadTags({ tags: surface }, state)();
    assert.deepEqual(state.availableTags, ["a", { status: "active" }],
      "the same argument reaches the same method, and its result is kept");
  });

  it("keeps the existing catch, so a rejecting member still falls back", async () => {
    const state = { availableTags: ["stale"] };
    await loadTags({ tags: { loadTags: async () => { throw new Error("nope"); } } }, state)();
    assert.deepEqual(state.availableTags, [], "the catch that was there still catches");
  });

  it("refuses an absent root where the property read used to throw", async () => {
    const state = { availableTags: ["stale"] };
    await assert.rejects(loadTags(undefined, state)(), /Notes requires the LongtailForge namespace\./);
    assert.deepEqual(state.availableTags, ["stale"], "and nothing was overwritten first");
  });

  it("reads the current root on a second invocation", async () => {
    const state = { availableTags: [] };
    const first = { tags: { loadTags: async () => ["first"] } };
    const run = lift("notes", "async function loadTags() {", { state });
    await run(first)();
    assert.deepEqual(state.availableTags, ["first"]);
    await run({ tags: { loadTags: async () => ["second"] } })();
    assert.deepEqual(state.availableTags, ["second"], "a replaced surface is seen");
  });
});

describe("the guard that reads its member on both paths keeps doing so", () => {
  /** @param {unknown} root @param {unknown} tagsEditor @param {{ hidden: boolean } | null} tagsToggle */
  const mountTagEditor = (root, tagsEditor, tagsToggle) => lift("notes",
    "async function mountTagEditor(note) {",
    { tagsEditor, tagsToggle, state: { tagsDialogNoteId: "", tagPicker: null } })(root);

  it("shows the toggle when the surface exists but the editor is absent", async () => {
    const tagsToggle = { hidden: true };
    await mountTagEditor({ tags: { mountPicker: async () => "picker" } }, null, tagsToggle)({});
    assert.equal(tagsToggle.hidden, false,
      "the surface is present, so the toggle is revealed exactly as before");
  });

  it("hides the toggle when the surface is absent", async () => {
    const tagsToggle = { hidden: false };
    await mountTagEditor({}, null, tagsToggle)({});
    assert.equal(tagsToggle.hidden, true);
  });

  it("mounts through the surface when both are present", async () => {
    /** @type {[unknown, { selectedTags: unknown[] }][]} */
    const calls = [];
    const surface = {
      /** @param {unknown} editor @param {unknown} options */
      mountPicker: async (editor, options) => {
        calls.push([editor, /** @type {{ selectedTags: unknown[] }} */ (options)]);
        return "picker";
      },
    };
    const editor = { id: "editor" };
    await mountTagEditor({ tags: surface }, editor, { hidden: true })({ note_id: "n1", tags: ["x"] });
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], editor, "the editor is forwarded by identity");
    assert.equal(calls[0][1].selectedTags[0], "x");
  });
});

describe("two uses behind one guard keep their receiver", () => {
  it("calls both members on the surface that guarded them", async () => {
    /** @type {string[]} */
    const statuses = [];
    /** @type {[unknown, { id: string, receiver: unknown }][]} */
    const followed = [];
    const surface = {
      /** @this {unknown} @param {unknown} target */
      async follow(target) {
        followed.push([this, /** @type {{ id: string, receiver: unknown }} */ (target)]);
      },
      /** @this {unknown} @param {string} id */
      taskTarget(id) {
        return { receiver: this, id };
      },
    };
    const run = lift("tasks", "async function followTaskNotifications(task) {", {
      setStatus: (/** @type {string} */ message) => statuses.push(message),
      requireErrors: () => ({ caughtMessage: (/** @type {unknown} */ _e, /** @type {string} */ f) => f }),
    });
    await run({ notificationSubscriptions: surface })({ task_id: "task-1" });

    assert.equal(followed.length, 1);
    assert.equal(followed[0][0], surface, "follow ran with the surface as its receiver");
    assert.equal(followed[0][1].receiver, surface, "and so did taskTarget");
    assert.equal(followed[0][1].id, "task-1", "with the argument it was given");
    assert.deepEqual(statuses, ["Following task notifications...", "Task notifications followed."]);
  });

  it("reports unavailability and returns when the member is absent", async () => {
    /** @type {string[]} */
    const statuses = [];
    const run = lift("tasks", "async function followTaskNotifications(task) {", {
      setStatus: (/** @type {string} */ message) => statuses.push(message),
      requireErrors: () => ({ caughtMessage: (/** @type {unknown} */ _e, /** @type {string} */ f) => f }),
    });
    await run({})({ task_id: "task-1" });
    assert.deepEqual(statuses, ["Notification following is unavailable."],
      "the existing early return is untouched");
  });
});

describe("a split guard reads the root only where the original did", () => {
  const appendTagChips = (/** @type {unknown} */ root, /** @type {unknown} */ documentValue) =>
    lift("clients-projects", "function appendTagChips(container, tags) {", {})(root, documentValue);

  it("returns before touching the root when the container is absent", () => {
    // The original short-circuited on `!container` before ever reading the namespace, so an
    // absent root must still not be an error on this path.
    const document = fakeDocument();
    assert.doesNotThrow(() => appendTagChips(undefined, document)(null, ["a"]));
    assert.deepEqual(document.log.created, [], "and nothing was built");
  });

  it("refuses an absent root once the container is present", () => {
    assert.throws(() => appendTagChips(undefined, fakeDocument())({ appendChild() {} }, ["a"]),
      /Clients and Projects requires the LongtailForge namespace\./);
  });

  it("returns when the guarded method is missing", () => {
    const document = fakeDocument();
    appendTagChips({ tags: {} }, document)({ appendChild() {} }, ["a"]);
    assert.deepEqual(document.log.created, [], "the method probe still refuses");
  });

  it("returns for the terms after the member, in their original order", () => {
    const document = fakeDocument();
    const surface = { renderTagList: () => {} };
    appendTagChips({ tags: surface }, document)({ appendChild() {} }, "not-an-array");
    appendTagChips({ tags: surface }, document)({ appendChild() {} }, []);
    assert.deepEqual(document.log.created, [], "a non-array and an empty list both still return");
  });

  it("renders through the guarded surface with its original arguments", () => {
    /** @type {[unknown, unknown, unknown][]} */
    const rendered = [];
    const surface = {
      /** @this {unknown} @param {unknown} list @param {unknown} tags */
      renderTagList(list, tags) { rendered.push([this, list, tags]); },
    };
    /** @type {unknown[]} */
    const appended = [];
    const container = { appendChild: (/** @type {unknown} */ node) => appended.push(node) };
    appendTagChips({ tags: surface }, fakeDocument())(container, ["a", "b"]);
    assert.equal(rendered.length, 1);
    assert.equal(rendered[0][0], surface, "rendered through its owning object");
    assert.deepEqual(rendered[0][2], ["a", "b"]);
    assert.equal(appended.length, 1, "and the list still reaches the container");
  });
});

describe("a split guard whose body did work keeps that work", () => {
  const mountTagPicker = (/** @type {unknown} */ root) => lift("clients-projects",
    "function mountTagPicker(container, tags = [], label = \"Tags\") {", { tagOptions: ["x"] })(root);

  it("answers null without touching the container when it is absent", () => {
    assert.equal(mountTagPicker(undefined)(null), null,
      "an absent container still short-circuits before the root is read");
  });

  it("hides the container and answers null when the member is missing", () => {
    const container = { hidden: false };
    assert.equal(mountTagPicker({ tags: {} })(container), null);
    assert.equal(container.hidden, true, "the body that hid the container still runs");
  });

  it("shows the container and mounts through the surface", () => {
    const container = { hidden: true };
    const surface = { mountPicker: (/** @type {unknown} */ node) => ({ mounted: node }) };
    const result = mountTagPicker({ tags: surface })(container, ["a"], "Labels");
    assert.equal(container.hidden, false);
    assert.equal(result.mounted, container, "mounted onto the container it was given");
  });
});

describe("the workbench navigation guard", () => {
  it("navigates through the intent when it exists", () => {
    /** @type {[unknown, string, unknown][]} */
    const navigated = [];
    const intent = {
      /** @this {unknown} @param {string} href @param {unknown} options */
      navigate(href, options) { navigated.push([this, href, options]); },
    };
    const win = { LongtailForge: { navigationIntent: intent }, location: { href: "start" } };
    const run = new Function("window", [
      slice(sources.workbench, "function requireNamespace() {"),
      slice(sources.workbench, "function navigateFromWorkbench(href, kind = \"workbench-navigation\") {"),
      "return navigateFromWorkbench;",
    ].join("\n"))(win);

    run("/tasks.html", "test-kind");
    assert.equal(navigated.length, 1);
    assert.equal(navigated[0][0], intent, "called on the intent itself");
    assert.deepEqual(navigated[0].slice(1), ["/tasks.html", { kind: "test-kind" }]);
    assert.equal(win.location.href, "start", "and the fallback did not run");
  });

  it("falls back to the location when the intent is absent", () => {
    const win = { LongtailForge: {}, location: { href: "start" } };
    const run = new Function("window", [
      slice(sources.workbench, "function requireNamespace() {"),
      slice(sources.workbench, "function navigateFromWorkbench(href, kind = \"workbench-navigation\") {"),
      "return navigateFromWorkbench;",
    ].join("\n"))(win);
    run("/tasks.html");
    assert.equal(win.location.href, "/tasks.html", "the existing fallback is unchanged");
  });

  it("refuses an absent root, as the property read did", () => {
    const win = { LongtailForge: undefined, location: { href: "start" } };
    const run = new Function("window", [
      slice(sources.workbench, "function requireNamespace() {"),
      slice(sources.workbench, "function navigateFromWorkbench(href, kind = \"workbench-navigation\") {"),
      "return navigateFromWorkbench;",
    ].join("\n"))(win);
    assert.throws(() => run("/tasks.html"), /Workbench requires the LongtailForge namespace\./);
    assert.equal(win.location.href, "start");
  });
});
