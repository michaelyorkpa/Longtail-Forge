import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const notificationsService = read("src/services/notifications.service.js");
const eventSummaries = read("src/core/events/event-summaries.js");
const browser = read("public/js/notifications.js");
const navigation = read("public/js/navigation.js");

/**
 * One function body lifted from the shipped source and run for real.
 *
 * Sliced at the indentation it is written at: the same guard lives at column 0 in one file
 * and inside an IIFE in another, and a fixed terminator finds the wrong end in the second.
 * @param {string} source @param {string} opener @param {number} [indent]
 */
function lift(source, opener, indent = 0) {
  const pad = " ".repeat(indent);
  const at = source.indexOf(pad + opener);
  assert.notEqual(at, -1, opener + " must exist");
  const end = source.indexOf("\n" + pad + "}\n", at);
  assert.notEqual(end, -1, opener + " must terminate");
  return new Function("return " + source.slice(at, end + pad.length + 2))();
}

const safeRelativeUrl = lift(notificationsService, "function safeRelativeUrl(value) {");
const safeUrl = lift(eventSummaries, "function safeUrl(value) {");
const isApplicationRelativeUrl = lift(browser, "function isApplicationRelativeUrl(value) {");
// The app shell's notification panel carries its own copy of the same guard.
const isPanelRelativeUrl = lift(navigation, "function isApplicationRelativeUrl(value) {", 2);

const SLASH = String.fromCharCode(47);
const BACK = String.fromCharCode(92);

/** The origin a notification link is resolved against when it reaches an `href`. */
const ORIGIN = "https://app.example";

/** Every two-character authority prefix a browser can reach an authority through. */
const AUTHORITY_PREFIXES = [
  SLASH + SLASH,
  SLASH + BACK,
  BACK + SLASH,
  BACK + BACK,
];

/**
 * The URL shapes first-party writers actually emit, read out of the producing modules.
 *
 * **Not retyped here.** If a module starts emitting a shape these guards reject, this list grows
 * and the acceptance assertions below fail - which is the point.
 */
function producedUrlShapes() {
  const sources = [
    "src/modules/lists/lists.service.js",
    "src/modules/notes/notes.service.js",
    "src/modules/tasks/task-recurrence.service.js",
    "src/modules/tasks/task-timers.service.js",
    "src/modules/time-tracking/module.js",
    "src/modules/users/module.js",
    "src/modules/developer-example/module.js",
  ];
  /** @type {string[]} */
  const shapes = [];
  for (const path of sources) {
    const source = read(path);
    for (const match of source.matchAll(/^\s*url: ("([^"]*)"|`([^`]*)`),$/gm)) {
      const raw = match[2] !== undefined ? match[2] : match[3];
      // Template placeholders stand for an encoded id; the shape is what matters here.
      shapes.push(raw.replace(/\$\{[^}]*\}/g, "abc"));
    }
  }
  return [...new Set(shapes)];
}

const PRODUCED = producedUrlShapes();

describe("the writer inventory is read from the producers", () => {
  it("finds the shapes the modules actually emit", () => {
    assert.ok(PRODUCED.length >= 7, "the scan must still find the producers it was written for");
    for (const shape of ["workbench.html", "workspace-settings.html", "developer-example.html"]) {
      assert.ok(PRODUCED.includes(shape), shape + " must be among the produced shapes");
    }
    assert.ok(PRODUCED.some((shape) => shape.includes("?")), "at least one carries a query");
    assert.ok(
      PRODUCED.every((shape) => !/^[a-z][a-z0-9+.-]*:/i.test(shape)),
      "no producer emits a scheme",
    );
  });

  it("emits no shape with a leading slash, which is why the browser rule mattered", () => {
    const rooted = PRODUCED.filter((shape) => shape.startsWith(SLASH));
    assert.deepEqual(rooted, [], "every producer emits a bare path");
  });
});

describe("the defect: an authority form resolves away from this origin", () => {
  for (const prefix of AUTHORITY_PREFIXES) {
    const raw = prefix + "evil.example/p";

    it("resolves " + JSON.stringify(prefix) + " to another origin when placed in a link", () => {
      const resolved = new URL(raw, ORIGIN);
      assert.notEqual(resolved.origin, ORIGIN, "this is the escape the guards must stop");
      assert.equal(resolved.origin, "https://evil.example");
    });

    it("is refused by the notification guard for " + JSON.stringify(prefix), () => {
      assert.equal(safeRelativeUrl(raw), "");
    });

    it("is refused by the event-summary guard for " + JSON.stringify(prefix), () => {
      assert.equal(safeUrl(raw), "");
    });

    it("is refused by both browser guards for " + JSON.stringify(prefix), () => {
      assert.equal(isApplicationRelativeUrl(raw), false);
      assert.equal(isPanelRelativeUrl(raw), false, "and by the app-shell panel");
    });
  }

  it("refuses an authority form that arrives with surrounding whitespace", () => {
    const raw = "  " + SLASH + SLASH + "evil.example/p  ";
    assert.equal(safeRelativeUrl(raw), "");
    assert.equal(safeUrl(raw), "");
    assert.equal(isApplicationRelativeUrl(raw), false);
  });

  it("leaves a single leading backslash alone, because it stays on this origin", () => {
    const raw = BACK + "tasks.html";
    assert.equal(new URL(raw, ORIGIN).origin, ORIGIN);
    assert.equal(safeRelativeUrl(raw), raw);
    assert.equal(safeUrl(raw), raw);
    assert.equal(isApplicationRelativeUrl(raw), true);
  });
});

describe("schemes are still refused, and by all three", () => {
  for (const raw of ["javascript:alert(1)", "data:text/html,x", "vbscript:msgbox(1)", "https://evil.example/p", "HTTPS://evil.example/p"]) {
    it("refuses " + raw, () => {
      assert.equal(safeRelativeUrl(raw), "");
      assert.equal(safeUrl(raw), "");
      assert.equal(isApplicationRelativeUrl(raw), false);
    });
  }
});

describe("every value a first-party writer produces is still accepted", () => {
  it("accepts each produced shape through both server guards", () => {
    for (const shape of PRODUCED) {
      if (shape === "") {
        continue;
      }
      assert.equal(safeRelativeUrl(shape), shape, shape + " must survive the notification guard");
      assert.equal(safeUrl(shape), shape, shape + " must survive the event-summary guard");
    }
  });

  it("accepts each produced shape at the browser boundary", () => {
    for (const shape of PRODUCED) {
      assert.equal(isApplicationRelativeUrl(shape), true, shape + " must reach an href");
      assert.equal(isPanelRelativeUrl(shape), true, shape + " must reach the panel's href too");
    }
  });

  it("still accepts a root-relative path, which some callers pass", () => {
    for (const raw of ["/tasks.html", "/tasks.html?task=abc", "/notes.html#anchor"]) {
      assert.equal(safeRelativeUrl(raw), raw);
      assert.equal(safeUrl(raw), raw);
      assert.equal(isApplicationRelativeUrl(raw), true);
    }
  });

  it("keeps every accepted value on this origin", () => {
    for (const shape of [...PRODUCED, "/tasks.html", BACK + "tasks.html"]) {
      if (shape === "") {
        continue;
      }
      assert.equal(new URL(shape, ORIGIN).origin, ORIGIN, shape + " must resolve here");
    }
  });
});

describe("empty means no link, and that is unchanged", () => {
  it("answers the empty string for every absent value", () => {
    for (const raw of ["", "   ", null, undefined, 0, false]) {
      assert.equal(safeRelativeUrl(raw), "");
      assert.equal(safeUrl(raw), "");
    }
  });

  it("accepts the empty string at the browser boundary, because absence is legal", () => {
    assert.equal(isApplicationRelativeUrl(""), true);
    assert.equal(isApplicationRelativeUrl(null), false, "but a non-string is not a URL");
    assert.equal(isApplicationRelativeUrl(undefined), false);
    assert.equal(isApplicationRelativeUrl(7), false);
  });
});

describe("the three guards answer identically, and each is written independently", () => {
  const MATRIX = [
    ...AUTHORITY_PREFIXES.map((prefix) => prefix + "evil.example/p"),
    "javascript:alert(1)", "data:text/html,x", "vbscript:msgbox(1)", "https://evil.example/p",
    "/tasks.html", "/tasks.html?task=abc", "tasks.html", "tasks.html?task=abc",
    "dashboard.html", BACK + "tasks.html", "notes.html#anchor",
  ];

  it("agrees on every value in the matrix", () => {
    for (const raw of MATRIX) {
      const server = safeRelativeUrl(raw) !== "";
      const summary = safeUrl(raw) !== "";
      const client = isApplicationRelativeUrl(raw);
      assert.equal(server, summary, raw + ": the two server guards must agree");
      assert.equal(server, client, raw + ": the server and browser boundaries must agree");
      assert.equal(client, isPanelRelativeUrl(raw), raw + ": both browser copies must agree");
    }
  });

  it("keeps three implementations rather than one shared regex constant", () => {
    // They sit in three runtimes with no shared dependency. What binds them is this matrix, not a
    // constant - so a change to one that the others do not follow fails here.
    assert.equal((notificationsService.match(/\[\/\\\\\]\{2\}/g) || []).length, 1);
    assert.equal((eventSummaries.match(/\[\/\\\\\]\{2\}/g) || []).length, 1);
    assert.equal((browser.match(/\[\/\\\\\]\{2\}/g) || []).length, 1);
assert.equal((navigation.match(/\[\/\\\\\]\{2\}/g) || []).length, 1);
  });

  it("states the finding without claiming an exploit", () => {
    const doc = notificationsService.slice(
      notificationsService.indexOf("A notification URL this application will store"),
      notificationsService.indexOf("function safeRelativeUrl(value) {"),
    );
    assert.match(doc, /authority, not a path/);
    assert.ok(!/attacker|exploit|vulnerab/i.test(doc), "no exploit claim in the guard's own record");
  });
});
