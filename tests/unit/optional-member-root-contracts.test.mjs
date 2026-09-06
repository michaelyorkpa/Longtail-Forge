import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * The forty required-root, optional-member accesses `0.33.33.38.2.6.10` adopted.
 *
 * These sites read the namespace root unchecked and then reached a member that was **already**
 * optional - `root.member?.method(...)`, `root.member?.method?.(...)`, or a plain read whose
 * every later use is optional. The root is now checked and **nothing else moved**: every `?.`
 * stays exactly where it stood, no argument was hoisted or precomputed, and no member became
 * required. A missing root threw at the property read before and throws here, in the same
 * expression and the same region.
 *
 * The root is checked and the member is not, because those are different facts.
 */

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const FILES = /** @type {const} */ ([
  "files", "lists", "navigation", "notes", "role-assignments",
  "tasks", "time-entries", "workbench", "workspace-settings",
]);

/** @type {Record<string, string>} */
const sources = {};
for (const name of FILES) sources[name] = read(`public/js/${name}.js`);

/**
 * Every adopted line, verbatim, with the number of optional links it carries and the number of
 * times it appears. Stated here rather than read out of the source, so a spelling that drifts
 * cannot move both sides together.
 * @type {Record<string, ReadonlyArray<readonly [string, number, number]>>}
 */
const FORMS = {
  "files": [
    ["namespace.moduleActions?.register?.({", 2, 2],
    ["const normalizedClients = requireNamespace().clientProjectOptions?.normalizeClients?.(clientProjects) || [];", 2, 1],
    ["const clientLabel = requireNamespace().clientProjectOptions?.optionLabel?.(client)", 2, 1],
    ["requireNamespace().clientProjectOptions?.optionLabel?.(client) || client.name || \"Untitled Client\",", 2, 1],
    ["label: requireNamespace().clientProjectOptions?.optionLabel?.(client) || client.name || \"Untitled Client\",", 2, 1],
  ],
  "lists": [
    ["namespace.moduleActions?.register?.({", 2, 2],
  ],
  "navigation": [
    ["if (context && !requireNamespace().workspaceContext) {", 0, 1],
    ["shellNamespace.timezones?.setUserTimezone?.(shell.user?.timezone || shell.timezone);", 3, 1],
    ["if (requireNamespace().supportView || window.sessionStorage.getItem(SUPPORT_VIEW_RESTORE_FOCUS_KEY) !== \"true\") {", 0, 1],
  ],
  "notes": [
    ["editor = requireNamespace().notesEditor?.createPlainTextarea(bodyInput);", 1, 1],
    ["namespace.moduleActions?.register?.({", 2, 3],
    ["const fileAttachments = requireNamespace().fileAttachments;", 0, 1],
    ["const filesAvailable = Boolean(filesDialog) && Boolean(filesEditor) && Boolean(requireNamespace().fileAttachments);", 0, 1],
  ],
  "role-assignments": [
    ["void requireNamespace().recovery?.permissionDenied();", 1, 1],
  ],
  "tasks": [
    ["requireNamespace().tasksDialog?.configure?.();", 2, 1],
    ["await requireNamespace().timezones?.loadSessionTimezone?.();", 2, 1],
    ["void requireNamespace().taskResumeNoteCapture?.offer({", 1, 1],
    ["const tasksDialog = requireNamespace().tasksDialog;", 0, 2],
    [".map((continuity) => requireNamespace().tasksDialog?.recurrenceContinuityMessage?.(continuity))", 2, 1],
    ["requireNamespace().tasksDialog?.pollRecurrenceContinuity?.(taskId, {", 2, 1],
    ["requireNamespace().tasksDialog?.configure?.({", 2, 1],
    ["return requireNamespace().timezones?.formatDateTime?.(task.due_at_utc, task.due_timezone) ||", 2, 1],
  ],
  "time-entries": [
    ["const timeEntryDialog = requireNamespace().timeEntryDialog;", 0, 1],
    ["{ name: \"time entry dialog helper exists\", ok: Boolean(requireNamespace().timeEntryDialog) },", 0, 1],
  ],
  "workbench": [
    ["requireNamespace().quickActionRefresh?.subscribe({", 1, 1],
    ["requireNamespace().navigationIntent?.registerExitGuard({", 1, 1],
    ["const result = await requireNamespace().taskResumeNoteCapture?.offer({", 1, 1],
    ["const captureResult = await requireNamespace().taskResumeNoteCapture?.offer({", 1, 1],
    ["const consumer = requireNamespace().taskResumeNoteCapture?.consume;", 1, 1],
    ["const tasksDialog = requireNamespace().tasksDialog;", 0, 1],
    ["requireNamespace().tasksDialog?.pollRecurrenceContinuity?.(taskId, {", 2, 1],
    ["void requireNamespace().taskResumeNoteCapture?.offer({", 1, 1],
    ["moduleActionCount: requireNamespace().moduleActions?.list?.().length || 0,", 2, 1],
  ],
  "workspace-settings": [
    ["await requireNamespace().refreshAppShell?.();", 1, 2],
  ],
};

/** The per-file totals this checkpoint claims, stated independently of the table above. */
const SITES = /** @type {const} */ ({
  files: 6, lists: 2, navigation: 3, notes: 6, "role-assignments": 1,
  tasks: 9, "time-entries": 2, workbench: 9, "workspace-settings": 2,
});

/** @param {string} haystack @param {string} needle */
const occurrences = (haystack, needle) => haystack.split(needle).length - 1;

/** @param {string} source @param {string} opener */
function slice(source, opener) {
  const start = source.indexOf("  " + opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf("\n  }\n", start);
  assert.notEqual(end, -1, opener + " must terminate");
  return source.slice(start, end + 4);
}

/**
 * Lift one shipped function together with its file's own `requireNamespace`, so the test drives
 * the acquisition that actually ships rather than a copy of it.
 * @param {string} key @param {string} opener @param {ReadonlyArray<string>} names
 */
function lift(key, opener, names = []) {
  const built = new Function("window", "document", ...names, [
    slice(sources[key], "function requireNamespace() {"),
    slice(sources[key], opener),
    "return " + opener.replace(/^(async )?function /, "").replace(/\(.*$/, "") + ";",
  ].join("\n"));
  return (/** @type {unknown} */ windowValue, /** @type {unknown} */ documentValue = undefined,
    /** @type {Record<string, unknown>} */ scope = {}) =>
    built(windowValue, documentValue, ...names.map((name) => scope[name]));
}

describe("the forty adopted accesses, spelled exactly as they ship", () => {
  it("adopts the sites this checkpoint claims, per file and in total", () => {
    let total = 0;
    for (const name of FILES) {
      const counted = FORMS[name].reduce((sum, [, , times]) => sum + times, 0);
      assert.equal(counted, SITES[name], `${name}.js should carry ${SITES[name]} adopted access(es)`);
      total += counted;
    }
    assert.equal(total, 40, "the checkpoint adopts forty accesses");
  });

  /**
   * Spellings an earlier checkpoint already put in a file, which this one happens to repeat.
   * `notes.mountFilesPanel` acquired the same surface the same way under `0.33.33.38.2.6.9`, so
   * the file carries that line twice while only one of the two belongs to this checkpoint.
   * @type {Record<string, Record<string, number>>}
   */
  const INHERITED = { notes: { "const fileAttachments = requireNamespace().fileAttachments;": 1 } };

  it("carries every adopted line verbatim, as many times as claimed", () => {
    // Counted as whole lines rather than as substrings: one adopted expression is the tail of
    // another (`label: <the same call>`), and a substring count would read the shorter one twice.
    for (const name of FILES) {
      const lines = sources[name].split("\n").map((line) => line.trim());
      for (const [form, , times] of FORMS[name]) {
        const inherited = INHERITED[name]?.[form] ?? 0;
        assert.equal(lines.filter((line) => line === form).length, times + inherited,
          `${name}.js should carry ${times + inherited} line(s) reading exactly: ${form}`);
      }
    }
  });

  it("keeps each line's optional links, adding none and dropping none", () => {
    for (const name of FILES) {
      for (const [form, links] of FORMS[name]) {
        assert.equal((form.match(/\?\./g) || []).length, links,
          `${form} should carry ${links} optional link(s)`);
      }
    }
  });

  it("never makes the root itself optional", () => {
    for (const name of FILES) {
      for (const [form] of FORMS[name]) {
        assert.doesNotMatch(form, /requireNamespace\(\)\?\.|(?<![.\w])(namespace|shellNamespace)\?\./,
          `${form} must check the root rather than tolerate its absence`);
      }
    }
  });

  it("leaves a directly called member directly called", () => {
    // Each of these called its method without a second optional link before this checkpoint,
    // and turning `member?.method(...)` into `member?.method?.(...)` would change what a
    // present-but-malformed member does.
    const DIRECT = /** @type {const} */ ([
      ["notes", "notesEditor?.createPlainTextarea(bodyInput)"],
      ["role-assignments", "recovery?.permissionDenied()"],
      ["tasks", "taskResumeNoteCapture?.offer({"],
      ["workbench", "quickActionRefresh?.subscribe({"],
      ["workbench", "navigationIntent?.registerExitGuard({"],
      ["workbench", "taskResumeNoteCapture?.offer({"],
    ]);
    for (const [name, call] of DIRECT) {
      const doubled = call.replace(/\?\.(\w+)\(/, "?.$1?.(");
      assert.ok(!sources[name].includes(doubled), `${name}.js must not add an optional call to ${call}`);
      assert.ok(sources[name].includes(call), `${name}.js should still call ${call} directly`);
    }
  });
});

describe("the four accessors this checkpoint added", () => {
  const PAGES = /** @type {const} */ ({
    files: "Files",
    navigation: "Navigation",
    "role-assignments": "Role Assignments",
    "workspace-settings": "Workspace Settings",
  });

  /** @param {string} key */
  const accessor = (key) => {
    const built = new Function("window", [
      slice(sources[key], "function requireNamespace() {"),
      "return requireNamespace;",
    ].join("\n"));
    return built;
  };

  for (const [key, page] of Object.entries(PAGES)) {
    it(`${key}.js refuses an absent root by its own name`, () => {
      const requireNamespace = accessor(key)({ LongtailForge: undefined });
      assert.throws(() => requireNamespace(), new RegExp(`^Error: ${page} requires the LongtailForge namespace\.$`));
    });

    it(`${key}.js answers the root by identity, and reads it again on the next call`, () => {
      /** @type {{ LongtailForge: unknown }} */
      const host = { LongtailForge: { first: true } };
      const requireNamespace = accessor(key)(host);
      assert.equal(requireNamespace(), host.LongtailForge, "the accessor must not copy the root");
      const replaced = { second: true };
      host.LongtailForge = replaced;
      assert.equal(requireNamespace(), replaced, "a root replaced between calls must be seen");
    });
  }

  it("leaves every root-tolerant read tolerant", () => {
    // These read the root with `?.` today. This checkpoint adopts required-root sites and makes
    // no tolerant read strict, in either the files it touched or the ones it did not.
    const TOLERANT = /** @type {const} */ ([
      ["files", "window.LongtailForge?.errors"],
      ["navigation", "window.LongtailForge?.api"],
      ["workspace-settings", "window.LongtailForge?.applyWorkspaceName"],
      ["navigation", "window.LongtailForge?.icons?.createIconButton"],
      ["tasks", "window.LongtailForge?.getWorkspaceProjectsLabel"],
    ]);
    for (const [name, read] of TOLERANT) {
      assert.ok(sources[name].includes(read), `${name}.js should still read ${read} tolerantly`);
    }
  });
});

describe("the reused bindings, and why reuse was allowed", () => {
  it("registers module actions through the checked publication binding, not a fresh read", () => {
    // `files`, `lists` and `notes` each check a root at their publication point and register on
    // the very next statements. Reusing that binding is what the guard above them already
    // proved; a fresh read there would be a second acquisition for no gain.
    const EXPECTED = /** @type {const} */ ({ files: 2, lists: 2, notes: 3 });
    for (const [name, times] of Object.entries(EXPECTED)) {
      const source = sources[name];
      assert.ok(!source.includes("requireNamespace().moduleActions?.register?.({"),
        `${name}.js should not re-read the root for a registration the guard already proved`);
      const guard = source.lastIndexOf("const namespace = window.LongtailForge;");
      assert.notEqual(guard, -1, `${name}.js should declare its publication binding`);
      const check = source.indexOf("if (!namespace) {", guard);
      assert.notEqual(check, -1, `${name}.js should check that binding`);
      assert.equal(occurrences(source.slice(check), "namespace.moduleActions?.register?.({"), times,
        `${name}.js should register ${times} action(s) after the check`);
      assert.equal(occurrences(source, "namespace.moduleActions?.register?.({"), times,
        `${name}.js should register no action before the check`);
    }
  });

  it("reads navigation's shell binding after the shell body it belongs to", () => {
    // `shellNamespace` is acquired after `await response.json()`. A root captured before that
    // await is not provably the root that exists after it, which is why the timezone call reuses
    // this binding rather than one taken earlier in the function.
    const source = sources.navigation;
    const parsed = source.indexOf("await response.json()");
    const bound = source.indexOf("const shellNamespace = window.LongtailForge;");
    const used = source.indexOf("shellNamespace.timezones?.setUserTimezone?.(");
    assert.notEqual(used, -1, "the timezone call reuses the binding taken above it");
    assert.ok(parsed !== -1 && bound !== -1, "the shell bootstrap should keep its shape");
    assert.ok(parsed < bound, "the binding is taken after the body is parsed");
    assert.ok(bound < used, "the timezone call reuses the binding taken above it");
    assert.ok(!source.slice(bound, used).includes("await "),
      "nothing awaits between the binding and its reuse, so it is provably the same root");
  });
});

describe("what the shipped functions do when the member is absent", () => {
  it("time-entries refuses the dialog by its own message, not the namespace's", () => {
    const run = lift("time-entries", "function requireTimeEntryDialog() {");
    assert.throws(() => run({ LongtailForge: undefined })(),
      /^Error: Time Entries requires the LongtailForge namespace\.$/);
    assert.throws(() => run({ LongtailForge: {} })(),
      /^Error: The time entry dialog is required to open an entry\.$/);
    const dialog = { open() {} };
    assert.equal(run({ LongtailForge: { timeEntryDialog: dialog } })(), dialog,
      "a present dialog is answered by identity");
  });

  it("role-assignments still reports a 403 when recovery is absent", () => {
    const run = lift("role-assignments", "function handleLoadError(error, fallbackMessage) {", ["setStatus"]);
    /** @type {string[]} */
    const reported = [];
    const setStatus = (/** @type {string} */ message) => reported.push(message);

    run({ LongtailForge: {}, location: { replace() {} } }, undefined, { setStatus })(
      { status: 403, message: "Denied." }, "fallback");
    assert.deepEqual(reported, ["Denied."], "the status still reports when recovery is missing");

    /** @type {unknown[]} */
    const receivers = [];
    const recovery = {
      permissionDenied() {
        receivers.push(this);
        return Promise.resolve();
      },
    };
    run({ LongtailForge: { recovery }, location: { replace() {} } }, undefined, { setStatus })(
      { status: 403, message: "Denied again." }, "fallback");
    assert.deepEqual(receivers, [recovery], "permissionDenied runs on the recovery surface");
    assert.deepEqual(reported, ["Denied.", "Denied again."]);

    // The member is optional; the root is not. An absent root failed at the property read
    // before this checkpoint and fails here, on the same path and inside no new boundary.
    assert.throws(() => run({ LongtailForge: undefined, location: { replace() {} } }, undefined, { setStatus })(
      { status: 403, message: "Denied once more." }, "fallback"),
    /^Error: Role Assignments requires the LongtailForge namespace\.$/);
  });

  it("role-assignments never reaches the root on the 401 path", () => {
    // The redirect returns before the recovery read, and it did so before this checkpoint too.
    const run = lift("role-assignments", "function handleLoadError(error, fallbackMessage) {", ["setStatus"]);
    /** @type {string[]} */
    const replaced = [];
    assert.doesNotThrow(() => run(
      { LongtailForge: undefined, location: { replace: (/** @type {string} */ href) => replaced.push(href) } },
      undefined, { setStatus() {} },
    )({ status: 401 }, "fallback"));
    assert.deepEqual(replaced, ["/login.html"]);
  });

  for (const [page, statusName] of /** @type {const} */ ([["tasks", "taskStatus"], ["workbench", "statusText"]])) {
    it(`${page} falls back to the plain completion message when the dialog is absent`, () => {
      const run = lift(page, "function renderTaskRecurrenceContinuity(continuity) {", ["setStatus", statusName]);
      /** @type {string[]} */
      const said = [];
      const statusNode = { node: true };
      const scope = { setStatus: (/** @type {string} */ m) => said.push(m), [statusName]: statusNode };

      run({ LongtailForge: {} }, undefined, scope)({ status: "available" });
      assert.deepEqual(said, ["Task completed."], "an absent dialog leaves the default message");

      /** @type {unknown[][]} */
      const rendered = [];
      const tasksDialog = {
        recurrenceContinuityMessage: (/** @type {unknown} */ c) => `Next: ${JSON.stringify(c)}`,
        renderRecurrenceContinuity(/** @type {unknown[]} */ ...args) { rendered.push([this, ...args]); },
      };
      run({ LongtailForge: { tasksDialog } }, undefined, scope)({ status: "available" });
      assert.equal(said[1], 'Next: {"status":"available"}');
      assert.deepEqual(rendered, [[tasksDialog, statusNode, { status: "available" }]],
        "the render call keeps its receiver and both arguments, in order");
    });

    it(`${page} refuses an absent root where the property read refused it`, () => {
      const run = lift(page, "function renderTaskRecurrenceContinuity(continuity) {", ["setStatus", statusName]);
      assert.throws(() => run({ LongtailForge: undefined }, undefined,
        { setStatus() {}, [statusName]: {} })({ status: "available" }),
      /requires the LongtailForge namespace\.$/);
    });
  }

  it("notes reads the root only after the two terms that short-circuit ahead of it", () => {
    const run = lift("notes", "function updateFilesUtilityState(note = state.editorNote) {", [
      "state", "filesToggle", "filesDialog", "filesEditor", "isSecureNote", "isSecureEditorMode", "closeFilesDialog",
    ]);
    const base = {
      state: { editorNote: null },
      isSecureNote: () => false,
      isSecureEditorMode: () => false,
      closeFilesDialog() {},
    };
    const toggle = () => ({ hidden: false, setAttribute() {} });

    // No toggle: the function returns before anything else, absent root included.
    assert.doesNotThrow(() => run({ LongtailForge: undefined }, undefined,
      { ...base, filesToggle: null, filesDialog: {}, filesEditor: {} })({ note_id: "n1" }));

    // No dialog: `Boolean(filesDialog) && ...` short-circuits, so the root is never read.
    assert.doesNotThrow(() => run({ LongtailForge: undefined }, undefined,
      { ...base, filesToggle: toggle(), filesDialog: null, filesEditor: {} })({ note_id: "n1" }));

    // Both present: the root is read, exactly as the property access read it before.
    assert.throws(() => run({ LongtailForge: undefined }, undefined,
      { ...base, filesToggle: toggle(), filesDialog: {}, filesEditor: {} })({ note_id: "n1" }),
    /^Error: Notes requires the LongtailForge namespace\.$/);

    const hidden = toggle();
    run({ LongtailForge: {} }, undefined, { ...base, filesToggle: hidden, filesDialog: {}, filesEditor: {} })(
      { note_id: "n1" });
    assert.equal(hidden.hidden, true, "an absent fileAttachments still hides the toggle");

    const shown = toggle();
    run({ LongtailForge: { fileAttachments: {} } }, undefined,
      { ...base, filesToggle: shown, filesDialog: {}, filesEditor: {} })({ note_id: "n1" });
    assert.equal(shown.hidden, false, "a present fileAttachments still shows it");
  });

  it("navigation reads the root before it touches session storage, as it did before", () => {
    const run = lift("navigation", "function restoreFocusAfterSupportView() {",
      ["SUPPORT_VIEW_RESTORE_FOCUS_KEY"]);
    /** @type {string[]} */
    const readKeys = [];
    const sessionStorage = {
      getItem: (/** @type {string} */ key) => { readKeys.push(key); return "true"; },
      removeItem() {},
    };
    assert.throws(() => run({ LongtailForge: undefined, sessionStorage }, undefined,
      { SUPPORT_VIEW_RESTORE_FOCUS_KEY: "k" })(),
    /^Error: Navigation requires the LongtailForge namespace\.$/);
    assert.equal(readKeys.length, 0, "the root is the first term, so storage is not consulted");

    // A present root with no `supportView` still consults storage and still returns early on
    // anything but "true" - the member stayed optional.
    const quiet = { getItem: (/** @type {string} */ key) => { readKeys.push(key); return "false"; } };
    assert.doesNotThrow(() => run({ LongtailForge: {}, sessionStorage: quiet }, undefined,
      { SUPPORT_VIEW_RESTORE_FOCUS_KEY: "k" })());
    assert.deepEqual(readKeys, ["k"]);
  });
});
