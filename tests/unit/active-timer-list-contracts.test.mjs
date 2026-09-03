import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const service = read("src/modules/time-tracking/active-timers.service.js");
const repo = read("src/modules/time-tracking/active-timers.repo.js");
const routes = read("src/modules/time-tracking/time-entries.routes.js");
const schema = read("src/db/schema/current.sql");
const stopWatch = read("public/js/stop-watch.js");
const timerDialog = read("public/js/time-tracking-timer-dialog.js");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener */
function functionBody(source, opener) {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf("\n}\n", start);
  return source.slice(start, end === -1 ? source.length : end);
}

/** @param {string} name */
function declaredInterface(name) {
  const at = contracts.indexOf("export interface " + name + " {");
  assert.notEqual(at, -1, name + " must be declared");
  return contracts.slice(at, contracts.indexOf("\n}", at));
}

/**
 * The reader as each page ships it, instantiated from that page's own source.
 * @param {string} source @param {string} name
 */
function shippedReader(source, name) {
  /** @param {string} opener */
  const slice = (opener) => {
    const start = source.indexOf(opener);
    assert.notEqual(start, -1, name + " must carry " + opener);
    return source.slice(start, source.indexOf("\n  }\n", start) + 4);
  };
  return new Function([
    slice("function isActiveTimerRecord(value) {"),
    slice("function isActiveTimerSlotRecord(value) {"),
    slice("function readActiveTimerList(body) {"),
    "return readActiveTimerList;",
  ].join("\n"))();
}

const timer = (overrides = {}) => ({
  active_timer_id: "timer-1",
  timer_slot: "1",
  source_type: "manual",
  source_label: "",
  source_url: "",
  resumeContext: { accumulatedElapsedSeconds: 0 },
  ...overrides,
});

describe("the active timer producer", () => {
  it("answers one member, reconstructed by name", () => {
    const body = functionBody(service, "async function list(session) {");
    const at = body.indexOf("return {");
    const literal = body.slice(at, body.indexOf("\n  };", at));
    const members = [...literal.matchAll(/^ {4}(\w+)[:,]/gm)].map((entry) => entry[1]);
    assert.deepEqual(members, ["timers"], "the envelope must carry exactly one member");
    assert.ok(!literal.includes("..."), "and must not spread anything into it");
  });

  it("is reached by the route the browser calls", () => {
    const at = routes.indexOf('timeEntriesRoutes.get("/active-timers"');
    assert.notEqual(at, -1, "the active timer route must exist");
    const route = routes.slice(at, routes.indexOf("}));", at));
    assert.match(route, /activeTimersService\.list\(/, "the route must call the traced producer");
    assert.match(route, /response\.status\(200\)\.json\(result\)/, "and answer its result");
  });

  it("lists manual timers, not every work timer", () => {
    assert.match(
      functionBody(service, "async function list(session) {"),
      /activeTimersRepository\.readAll\(session\.workspace_id, session\.user_id\)/,
      "the list must use the manual-timer reader",
    );
    assert.match(
      functionBody(repo, "async function readAll(workspaceId, userId) {"),
      /readAllBySource\(workspaceId, userId, \{ sourceType: "manual" \}\)/,
      "and that reader must select manual timers only",
    );
    assert.match(
      repo,
      /async function readAllWorkTimers\(workspaceId, userId\) \{/,
      "the all-work-timers producer must exist separately, so this distinction means something",
    );
  });

  it("spreads the stored row, which is why the element is a structural minimum", () => {
    const shaper = functionBody(service, "async function shapeTimerPayload(session, timer) {");
    assert.match(shaper, /return \{\n {4}\.\.\.timer,/, "the payload shaper must spread the row");
    assert.ok(
      !shaper.includes("const shaped = {"),
      "and must not reconstruct one, which is what would earn an exact element contract",
    );
  });

  it("guarantees a usable slot at every layer that touches it", () => {
    assert.match(schema, /timer_slot TEXT NOT NULL/, "the column must be NOT NULL");
    assert.match(
      functionBody(repo, "function activeTimerRowToAppValue(row) {"),
      /timer_slot: textParam\(row\.timer_slot\)/,
      "the row mapping must answer it as text",
    );
    const normaliser = functionBody(service, "function normalizeTimerSlot(timerSlot) {");
    assert.match(normaliser, /if \(!normalized\) \{/, "an empty slot must be rejected");
    assert.match(normaliser, /throw new AppError\("Timer slot is required\./, "and rejected by throwing");
  });

  it("still blanks the source label and URL the browser deliberately does not promise", () => {
    const shaper = functionBody(service, "async function shapeTimerPayload(session, timer) {");
    assert.match(shaper, /const sourceReadable = await canReadTimerSource\(session, timer\);/,
      "readability must still be decided per timer");
    assert.match(shaper, /const safeSourceLabel = sourceReadable \? stringOrEmpty\(timer\.source_label \|\| timer\.description\) : "";/,
      "an unreadable source must blank the label");
    assert.match(shaper, /const safeSourceUrl = sourceReadable \? safeUrl\(timer\.source_url\) : "";/,
      "and blank the URL");
    assert.match(shaper, /source_label: safeSourceLabel,\n {4}source_url: safeSourceUrl,/,
      "and the blanked values must be what the payload answers");
    const gate = functionBody(service, "async function canReadTimerSource(session, timer) {");
    assert.match(gate, /modulesService\.canReadModule\(session\.workspace_id, timer\.source_module_id\)/,
      "the gate must consult module readability");
    assert.match(gate, /permissionsService\.can\(session, "tasks\.view"/, "and the task permission where it applies");
  });
});

describe("the declaration", () => {
  it("promises exactly the slot, and does not make it optional", () => {
    const declared = declaredInterface("BrowserActiveTimerSlotRecord");
    const members = [...declared.matchAll(/^ {2}(\w+)\??:/gm)].map((entry) => entry[1]);
    assert.deepEqual(members, ["timer_slot"], "the element must promise exactly one member");
    assert.ok(!/^ {2}\w+\?:/m.test(declared), "and must not make it optional");
  });

  it("deliberately does not name the permission-sensitive or resume members", () => {
    const declared = declaredInterface("BrowserActiveTimerSlotRecord");
    for (const member of ["source_label", "source_url", "resumeContext", "resume_context", "client_id", "project_id"]) {
      assert.ok(!declared.includes(member + ":"), "the element must not promise " + member);
    }
  });

  it("records that the narrowness is a choice, not an omission", () => {
    const at = contracts.indexOf("export interface BrowserActiveTimerSlotRecord {");
    // Unwrapped before matching, so a phrase that happens to straddle a comment line is still
    // one sentence to this proof rather than a regex that has to know where the wrap fell.
    const doc = contracts.slice(contracts.lastIndexOf("/**", at), at).replace(/\n \* ?/g, " ");
    assert.match(doc, /deliberate structural minimum, not a description of the record/,
      "the contract must say the record is richer than this type");
    assert.match(doc, /permission decision this boundary must not become the owner of/,
      "and must say why the source members are left out");
    assert.match(doc, /narrowing is of the type surface, not of the payload/,
      "and that the runtime payload is not truncated");
  });

  it("declares the envelope as the one member the producer names", () => {
    const declared = declaredInterface("BrowserActiveTimerList");
    const members = [...declared.matchAll(/^ {2}(\w+)\??:/gm)].map((entry) => entry[1]);
    assert.deepEqual(members, ["timers"], "the envelope must carry exactly one member");
    assert.match(declared, /timers: BrowserActiveTimerSlotRecord\[\];/, "and it must carry the slot record");
  });
});

describe("the two shipped readers", () => {
  const readers = [
    ["stop-watch", shippedReader(stopWatch, "stop-watch")],
    ["timer-dialog", shippedReader(timerDialog, "timer-dialog")],
  ];

  it("check the shape of what they were given before iterating it", () => {
    // Pinned by source: removing the container guard makes the reader throw rather than answer,
    // and a thrown error names nothing about the guard that was removed.
    for (const [name, source] of [["stop-watch", stopWatch], ["timer-dialog", timerDialog]]) {
      const start = source.indexOf("  function readActiveTimerList(body) {");
      const reader = source.slice(start, source.indexOf("\n  }\n", start));
      assert.match(reader, /!Array\.isArray\(body\.timers\)/,
        name + " must check the roster is a container before iterating it");
      assert.match(reader, /isActiveTimerRecord\(body\)/,
        name + " must check the body is a record before reading its members");
    }
  });

  it("are intentionally identical, so neither page can drift", () => {
    /** @param {string} source */
    const readerText = (source) => {
      const start = source.indexOf("  function isActiveTimerRecord(value) {");
      const end = source.indexOf("\n  }\n", source.indexOf("  function readActiveTimerList(body) {"));
      return source.slice(start, end);
    };
    assert.equal(
      readerText(timerDialog),
      readerText(stopWatch),
      "both copies of the reader must be character-for-character the same",
    );
  });

  for (const [name, readList] of readers) {
    it(name + " accepts a workspace with no running timer", () => {
      const result = readList({ timers: [] });
      assert.ok(result, "an empty list is a real answer");
      assert.deepEqual(result.timers, [], "and is answered as the empty list it is");
    });

    it(name + " accepts occupied slots", () => {
      const result = readList({ timers: [timer(), timer({ timer_slot: "3" })] });
      assert.ok(result, "a populated list must be accepted");
      assert.deepEqual(result.timers.map((/** @type {{ timer_slot: string }} */ entry) => entry.timer_slot), ["1", "3"], "with its slots intact");
    });

    it(name + " refuses a body it cannot read, rather than reading it as no timers", () => {
      for (const bad of [null, undefined, 7, "timers", [], {}, { timers: null }, { timers: {} }, { timers: "1" }]) {
        assert.equal(readList(bad), null, name + " must refuse: " + JSON.stringify(bad));
      }
    });

    it(name + " refuses the whole list when any timer has no usable slot", () => {
      for (const broken of [
        timer({ timer_slot: "" }),
        timer({ timer_slot: 1 }),
        timer({ timer_slot: null }),
        timer({ timer_slot: undefined }),
        "timer",
        null,
      ]) {
        assert.equal(
          readList({ timers: [timer(), broken] }),
          null,
          name + " must not drop a timer and leave its slot looking free: " + JSON.stringify(broken),
        );
      }
    });

    it(name + " accepts members this contract never promised, and keeps them", () => {
      const rich = timer({
        source_label: "Design review",
        source_url: "/tasks/abc",
        aFutureTimerMember: { nested: true },
      });
      const result = readList({ timers: [rich] });
      assert.ok(result, "an unpromised member must not refuse the timer");
      assert.equal(result.timers[0], rich, "and the element must travel on by reference, not rebuilt");
      assert.equal(result.timers[0].source_label, "Design review", "so the richer payload survives narrowing");
    });
  }
});

describe("the two consumers", () => {
  it("no longer default an unreadable list to no timers", () => {
    assert.ok(
      !stopWatch.includes("Array.isArray(data.timers) ? data.timers : []"),
      "the stopwatch's raw array-or-empty default must be gone",
    );
    assert.ok(
      !timerDialog.includes("Array.isArray(activeTimersData?.timers) ? activeTimersData.timers : []"),
      "the dialog's raw array-or-empty default must be gone",
    );
  });

  it("both refuse instead", () => {
    for (const [name, source] of [["stop-watch", stopWatch], ["timer-dialog", timerDialog]]) {
      assert.match(
        source,
        /throw new Error\("Active timers could not be read\./,
        name + " must refuse a list it cannot vouch for",
      );
    }
  });

  it("keeps the dialog from choosing a slot it cannot know is free", () => {
    const prepare = functionBody(timerDialog, "  async function prepareContext({ hostContext = null, params = {} } = {}) {");
    assert.ok(
      prepare.indexOf("could not be read.") < prepare.indexOf("ensureDialog()"),
      "preparation must fail before the dialog is built from an unknown slot inventory",
    );
    const nextSlot = functionBody(timerDialog, "  function nextManualTimerSlot() {");
    assert.match(
      nextSlot,
      /new Set\(activeManualTimers\.map\(\(timer\) => String\(timer\.timer_slot \|\| ""\)\)\)/,
      "slot occupancy must still be decided from the list this child now vouches for",
    );
  });

  it("hands the vouched-for list straight on without rebuilding it", () => {
    assert.match(stopWatch, /const activeTimers = list\.timers;/, "the stopwatch must use the narrowed list");
    assert.match(timerDialog, /activeManualTimers = activeTimerList\.timers;/, "and so must the dialog");
  });
});
