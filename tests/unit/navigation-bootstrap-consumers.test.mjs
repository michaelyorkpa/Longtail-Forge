import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const navigation = createProjectTextReader().readText("public/js/navigation.js");

/**
 * The app shell's bootstrap consumers, through the shipped functions.
 *
 * `0.33.33.39.36` took `navigation.js` to zero. The reads that changed are here: wire rows are
 * read member by member, the theme and landing vocabularies are matched by `find` with `===`
 * where `includes` matched them, the workspace option's two values reach the option's own
 * setters, and the support-view countdown hands the `Date` constructor a string unchanged. The
 * element narrowings this slice added are exercised by the browser suites, which run the support
 * view, the drawer, the workspace switch and the theme.
 */

/** @typedef {Record<string, unknown>} Bag */

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

/** @param {unknown} value @returns {value is (...args: unknown[]) => unknown} */
const isCallable = (value) => typeof value === "function";

/** @param {unknown} error */
const nameOf = (error) => (isBag(error) ? String(error.name) : String(error));

const LIFTED = [
  "requiredMember", "optionalMember", "normalizeThemeMode", "normalizeLandingPath",
  "normalizeSearchTargets", "moduleIsEnabled", "createWorkspaceOption",
  "normalizeSupportViewReturnPath", "updateSupportViewRemaining",
];

function consumers() {
  const context = createFakeBrowserContext({ globals: { URL } });
  /** @type {unknown[]} */
  const exits = [];
  Object.assign(context, {
    supportViewExitPending: false,
    exitSupportView: (/** @type {unknown} */ button) => { exits.push(button); },
  });
  Object.assign(context.window, { location: { origin: "https://app.example" }, URL });
  vm.runInNewContext([
    ...LIFTED.map((name) => extractFunctionBlock(navigation, name)),
    `this.shell = { ${LIFTED.join(", ")} };`,
  ].join("\n"), context, { filename: "navigation-bootstrap-consumers.js" });
  const api = context.shell;
  assert.ok(isBag(api));
  /** @param {string} name */
  const member = (name) => {
    const fn = api[name];
    assert.ok(isCallable(fn), `${name} is lifted`);
    /** @param {unknown[]} args */
    return (...args) => Reflect.apply(fn, api, args);
  };
  return { context, exits, member };
}

/** A returned list, proved to be one before it is measured. @param {unknown} value */
function rows(value) {
  assert.ok(Array.isArray(value), "a list of rows");
  return value;
}

/** @param {() => unknown} build */
function thrown(build) {
  try {
    build();
  } catch (error) {
    return nameOf(error);
  }
  return null;
}

describe("the closed vocabularies answer what they answered", () => {
  it("keeps the three theme modes and refuses everything else", () => {
    const normalizeThemeMode = consumers().member("normalizeThemeMode");
    for (const mode of ["light", "auto", "dark"]) {
      assert.equal(normalizeThemeMode(mode), mode);
    }
    for (const rejected of ["", "sideways", "LIGHT", null, undefined, 7, {}, ["dark"]]) {
      assert.equal(normalizeThemeMode(rejected), "light");
    }
  });

  it("keeps the five landing paths and refuses everything else", () => {
    const normalizeLandingPath = consumers().member("normalizeLandingPath");
    for (const path of ["/dashboard.html", "/workbench.html", "/tasks.html", "/notes.html", "/lists.html"]) {
      assert.equal(normalizeLandingPath(path), path);
    }
    for (const rejected of ["/settings.html", "dashboard.html", "", null, undefined, 7, {}]) {
      assert.equal(normalizeLandingPath(rejected), "/dashboard.html");
    }
  });

  it("keeps the support-view return path inside this origin", () => {
    const normalize = consumers().member("normalizeSupportViewReturnPath");
    assert.equal(normalize("/tasks.html?task=1"), "/tasks.html?task=1");
    assert.equal(normalize("https://app.example/notes.html"), "/notes.html");
    for (const rejected of ["/login.html", "/support-view.html", "/support-view-audit.html", "https://elsewhere.example/tasks.html", "/api/tasks", null, ""]) {
      assert.equal(normalize(rejected), "/dashboard.html");
    }
  });
});

describe("wire rows are read member by member", () => {
  it("normalises, filters, dedupes and orders the search targets", () => {
    const normalizeSearchTargets = consumers().member("normalizeSearchTargets");
    const targets = normalizeSearchTargets([
      { moduleId: "tasks", recordType: "task", label: "Tasks" },
      { sourceLabel: "Files", recordType: "file" },
      { id: " notes:note ", moduleId: "notes", recordType: "note", label: "Notes" },
      { moduleId: "tasks", recordType: "task", label: "Duplicate" },
      { recordType: "orphan", label: "No module or source" },
      { moduleId: "calendar", label: "No record type" },
    ]);
    assert.deepEqual(JSON.parse(JSON.stringify(targets)), [
      { id: ":file", label: "Files", moduleId: "", recordType: "file", sourceLabel: "Files" },
      { id: "notes:note", label: "Notes", moduleId: "notes", recordType: "note", sourceLabel: "" },
      { id: "tasks:task", label: "Tasks", moduleId: "tasks", recordType: "task", sourceLabel: "" },
    ], "the first id wins, the rest order by label, and a trimmed id keeps its own value");
    assert.equal(rows(normalizeSearchTargets("not a list")).length, 0);
    assert.equal(rows(normalizeSearchTargets()).length, 0);
    assert.equal(thrown(() => normalizeSearchTargets([null])), "TypeError", "a missing row still fails at its first member");
  });

  it("reads a module's state from the list, then from the enabled names", () => {
    const moduleIsEnabled = consumers().member("moduleIsEnabled");
    const settings = {
      modules: [
        { id: "tasks", status: "enabled" },
        { moduleId: "notes", status: "disabled" },
        // Matched by the alias alone, and enabled only there: the names below would answer false.
        { moduleId: "files", status: "enabled" },
      ],
      enabledModules: ["time-tracking"],
    };
    assert.equal(moduleIsEnabled(settings, "tasks"), true);
    assert.equal(moduleIsEnabled(settings, "files"), true, "a module listed under its alias answers its own status");
    assert.equal(moduleIsEnabled(settings, "notes"), false, "a listed module answers its own status");
    assert.equal(moduleIsEnabled(settings, "time-tracking"), true, "and an unlisted one falls back to the names");
    assert.equal(moduleIsEnabled(settings, "calendar"), false, "a module in neither source is off");
    assert.equal(moduleIsEnabled({ modules: "no", enabledModules: "no" }, "tasks"), false);
    assert.equal(thrown(() => moduleIsEnabled(null, "tasks")), "TypeError");
    assert.equal(thrown(() => moduleIsEnabled({ modules: [null] }, "tasks")), "TypeError");
  });
});

describe("the option and the countdown", () => {
  it("hands both workspace values to the option's own setters, defaulting the value to the label", () => {
    const createWorkspaceOption = consumers().member("createWorkspaceOption");
    const labelled = createWorkspaceOption("Northwind", "ws-1");
    assert.ok(isBag(labelled));
    assert.equal(labelled.value, "ws-1");
    assert.equal(labelled.textContent, "Northwind");
    const defaulted = createWorkspaceOption("Workspace");
    assert.ok(isBag(defaulted));
    assert.equal(defaulted.value, "Workspace", "the value defaults to the label it was given");
  });

  it("counts down from the expiry it is given and exits once when it runs out", () => {
    const shell = consumers();
    const updateSupportViewRemaining = shell.member("updateSupportViewRemaining");
    const element = shell.context.document.createElement("span");
    const exitButton = shell.context.document.createElement("button");

    updateSupportViewRemaining(new Date(Date.now() + 125_000).toISOString(), element, exitButton);
    assert.match(String(element.textContent), /^Remaining: 2:0[45]$/);
    assert.deepEqual(shell.exits, []);

    // A numeric expiry reaches the constructor as its number, which is what it read from one.
    updateSupportViewRemaining(Date.now() + 65_000, element, exitButton);
    assert.match(String(element.textContent), /^Remaining: 1:0[45]$/);

    updateSupportViewRemaining(new Date(Date.now() - 1000).toISOString(), element, exitButton);
    assert.equal(element.textContent, "Support View has expired.");
    assert.deepEqual(shell.exits, [exitButton], "the expiry exits through the button it was given");

    updateSupportViewRemaining("not a date", element, exitButton);
    assert.equal(element.textContent, "Support View has expired.", "an unreadable expiry reads as expired, as before");
  });
});
