import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/api-keys.js");

/**
 * The **rendering** half of the API keys page, which is a different concern from the wire half.
 *
 * `api-key-contracts.test.mjs` already proves what the routes answer and what the page is
 * willing to vouch for, and it pins that the catalogue writes `access` and that
 * `BrowserApiScope` declares it. Nothing pinned that the page then *uses* it - and it did not:
 * `normalizeAvailableScopes` rebuilt each row without `access`, so the label always read "Read"
 * and the access ordering never applied. These cases hold the corrected readers still, and the
 * two own-key table reads with them.
 */

const LIFTED = [
  "normalizeAvailableScopes", "groupScopesByOwner", "compareScopes", "moduleScopeLabel",
  "createScopeOption", "createCell", "formatStatus", "formatDate",
];

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

function scopesCase() {
  const document = new FakeDocument();
  const sandbox = vm.createContext({ document });
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), sandbox);
  return { api: vm.runInContext(`({ ${LIFTED.join(", ")} })`, sandbox), document };
}

/**
 * A catalogue scope as `listAvailableApiScopes` writes it: six members, every one text.
 * @param {Record<string, unknown>} [overrides]
 */
const scope = (overrides = {}) => ({
  access: "read", description: "", id: "notes:read", label: "Read notes",
  moduleId: "notes", scope: "notes:read", ...overrides,
});

describe("API key scope normalizer", () => {
  /**
   * **The defect this checkpoint found, held still.** The catalogue sends `access` and the page
   * discarded it. This is the case that fails if it is ever dropped again.
   */
  it("carries the access the catalogue sent", () => {
    const { api } = scopesCase();
    const [normalized] = api.normalizeAvailableScopes([scope({ access: "write" })]);
    assert.equal(normalized.access, "write");
  });

  it("answers the five members this page renders, and not the duplicate id", () => {
    const { api } = scopesCase();
    assert.deepEqual(plain(api.normalizeAvailableScopes([scope()])), [{
      access: "read", description: "", id: "notes:read", label: "Read notes", moduleId: "notes",
    }]);
  });

  it("trims every member the catalogue may have padded", () => {
    const { api } = scopesCase();
    const [normalized] = api.normalizeAvailableScopes([scope({
      access: " write ", description: "  Manage notes  ", id: "  notes:manage  ",
      label: "  Manage  ", moduleId: "  notes  ",
    })]);
    assert.deepEqual(plain(normalized), {
      access: "write", description: "Manage notes", id: "notes:manage", label: "Manage", moduleId: "notes",
    });
  });

  it("falls back through id and scope for a blank label, and drops a row with no id at all", () => {
    const { api } = scopesCase();
    assert.equal(api.normalizeAvailableScopes([scope({ label: "" })])[0].label, "notes:read");

    // **Length first.** Dropping the `|| scope.scope` fallback leaves a blank id, which the
    // filter then removes - so reading `[0]` straight away crashes rather than failing, and a
    // crash is not the same evidence as a wrong answer.
    const fromDuplicate = api.normalizeAvailableScopes([scope({ id: "", label: "" })]);
    assert.equal(fromDuplicate.length, 1, "a blank id must still resolve through the published duplicate");
    assert.equal(fromDuplicate[0].id, "notes:read");
    assert.equal(fromDuplicate[0].label, "notes:read", "and the label falls through to it too");
    assert.deepEqual(plain(api.normalizeAvailableScopes([scope({ id: "", scope: "" })])), [],
      "a row naming no scope cannot be rendered or submitted");
    assert.deepEqual(plain(api.normalizeAvailableScopes([])), []);
  });
});

describe("API key scope option", () => {
  /**
   * **The user-visible half of the same defect.** Every scope read "(Read, …)" because `access`
   * was absent, including the write and manage ones a key would actually be granted.
   */
  it("names write access as Write, not Read", () => {
    const { api } = scopesCase();
    const option = api.createScopeOption({
      access: "write", description: "", id: "notes:write", label: "Write notes", moduleId: "notes",
    });
    assert.match(option.children[1].textContent, /\(Write, notes:write\)$/);
  });

  it("names read access as Read", () => {
    const { api } = scopesCase();
    const option = api.createScopeOption({
      access: "read", description: "", id: "notes:read", label: "Read notes", moduleId: "notes",
    });
    assert.equal(option.children[1].textContent, "Read notes (Read, notes:read)");
  });

  /** Only `"write"` is spelled out; every other word takes the Read wording, as it always did. */
  it("keeps the two-word vocabulary for every other access the registry may send", () => {
    const { api } = scopesCase();
    for (const access of ["manage", "admin", ""]) {
      const option = api.createScopeOption({ access, description: "", id: "x:y", label: "L", moduleId: "m" });
      assert.match(option.children[1].textContent, /\(Read, x:y\)$/, `access: ${access}`);
    }
  });

  it("carries the scope id as the checkbox value and the description as a title", () => {
    const { api } = scopesCase();
    const option = api.createScopeOption({
      access: "read", description: "What it grants", id: "notes:read", label: "Read notes", moduleId: "notes",
    });
    assert.equal(option.children[0].value, "notes:read");
    assert.equal(option.children[0].type, "checkbox");
    assert.equal(option.title, "What it grants");
  });

  it("leaves the title unset when the catalogue described nothing", () => {
    const { api } = scopesCase();
    const option = api.createScopeOption({
      access: "read", description: "", id: "notes:read", label: "Read notes", moduleId: "notes",
    });
    assert.equal(option.title, undefined);
  });
});

describe("API key scope ordering", () => {
  const row = (/** @type {Record<string, unknown>} */ overrides) => ({
    access: "read", description: "", id: "a:read", label: "A", moduleId: "notes", ...overrides,
  });

  /**
   * **This ordering never ran before**, because every scope scored 10. It is asserted now
   * because `access` reaching the comparator is what this checkpoint changed.
   */
  it("orders read before write before manage before admin", () => {
    const { api } = scopesCase();
    const ordered = [
      row({ access: "admin", id: "d" }), row({ access: "read", id: "a" }),
      row({ access: "manage", id: "c" }), row({ access: "write", id: "b" }),
    ].sort(api.compareScopes);
    assert.deepEqual(ordered.map((/** @type {{ id: string }} */ entry) => entry.id), ["a", "b", "c", "d"]);
  });

  it("sorts an unrecognised access after every recognised one", () => {
    const { api } = scopesCase();
    const ordered = [row({ access: "future", id: "z" }), row({ access: "admin", id: "d" })].sort(api.compareScopes);
    assert.deepEqual(ordered.map((/** @type {{ id: string }} */ entry) => entry.id), ["d", "z"]);
  });

  /**
   * **`?? 10` did not catch this and `Object.hasOwn` does.** An access naming a member of
   * `Object.prototype` answered a *function*, which is not nullish, so it reached the
   * subtraction and made the comparator answer `NaN`. This is the own-key discipline settled
   * in `0.33.33.40.30`.
   */
  it("scores an access naming a prototype member as unrecognised rather than answering NaN", () => {
    const { api } = scopesCase();
    for (const access of ["toString", "constructor", "valueOf", "hasOwnProperty"]) {
      const answer = api.compareScopes(row({ access }), row({ access: "read" }));
      assert.ok(Number.isFinite(answer), `comparing ${access} must answer a number`);
      assert.ok(answer > 0, `${access} must sort after a recognised access`);
    }
  });

  it("falls through to label then id when access ties", () => {
    const { api } = scopesCase();
    const ordered = [
      row({ id: "b:read", label: "Same" }), row({ id: "a:read", label: "Same" }), row({ id: "c:read", label: "Aaa" }),
    ].sort(api.compareScopes);
    assert.deepEqual(ordered.map((/** @type {{ id: string }} */ entry) => entry.id), ["c:read", "a:read", "b:read"]);
  });
});

describe("API key scope owner label", () => {
  it("names the three owners the page spells out", () => {
    const { api } = scopesCase();
    assert.equal(api.moduleScopeLabel("client-projects"), "Clients and Projects");
    assert.equal(api.moduleScopeLabel("time-tracking"), "Time Tracking");
    assert.equal(api.moduleScopeLabel("framework"), "Framework");
  });

  it("derives a label from any other module id", () => {
    const { api } = scopesCase();
    assert.equal(api.moduleScopeLabel("notes"), "Notes");
    assert.equal(api.moduleScopeLabel("task-recurrence"), "Task Recurrence");
  });

  /** The same own-key defect as the access table: a module id naming a prototype member. */
  it("derives a label for a module id naming a prototype member, rather than answering a function", () => {
    const { api } = scopesCase();
    for (const moduleId of ["toString", "constructor", "valueOf"]) {
      const label = api.moduleScopeLabel(moduleId);
      assert.equal(typeof label, "string", `${moduleId} must answer text`);
      assert.equal(label, moduleId.charAt(0).toUpperCase() + moduleId.slice(1));
    }
  });

  it("answers an empty id as itself rather than throwing", () => {
    const { api } = scopesCase();
    assert.equal(api.moduleScopeLabel(""), "");
  });
});

describe("API key scope grouping", () => {
  const row = (/** @type {Record<string, unknown>} */ overrides) => ({
    access: "read", description: "", id: "a:read", label: "A", moduleId: "notes", ...overrides,
  });

  it("groups by owner, labels each group, and orders the groups by label", () => {
    const { api } = scopesCase();
    const groups = api.groupScopesByOwner([
      row({ id: "t:read", moduleId: "time-tracking" }),
      row({ id: "n:read", moduleId: "notes" }),
      row({ id: "n:write", access: "write", moduleId: "notes" }),
    ]);
    assert.deepEqual(plain(groups.map((/** @type {{ label: string }} */ group) => group.label)), ["Notes", "Time Tracking"]);
    assert.deepEqual(plain(groups.map((/** @type {{ scopes: unknown[] }} */ group) => group.scopes.length)), [2, 1]);
  });

  /** Access ordering inside a group is the second surface the carried `access` reaches. */
  it("orders the scopes inside a group by access", () => {
    const { api } = scopesCase();
    const [group] = api.groupScopesByOwner([
      row({ id: "n:write", access: "write" }), row({ id: "n:read", access: "read" }),
    ]);
    assert.deepEqual(plain(group.scopes.map((/** @type {{ id: string }} */ entry) => entry.id)), ["n:read", "n:write"]);
  });

  it("files a scope naming no owner under the framework", () => {
    const { api } = scopesCase();
    const [group] = api.groupScopesByOwner([row({ moduleId: "" })]);
    assert.equal(group.id, "framework");
    assert.equal(group.label, "Framework");
  });

  it("answers no groups for no scopes", () => {
    const { api } = scopesCase();
    assert.deepEqual(plain(api.groupScopesByOwner([])), []);
  });
});

describe("API key row formatters", () => {
  it("names a revoked key revoked and everything else active", () => {
    const { api } = scopesCase();
    assert.equal(api.formatStatus("revoked"), "Revoked");
    assert.equal(api.formatStatus("active"), "Active");
    assert.equal(api.formatStatus(""), "Active");
  });

  it("answers an empty string for a timestamp the list did not carry", () => {
    const { api } = scopesCase();
    assert.equal(api.formatDate(null), "");
    assert.equal(api.formatDate(""), "");
    assert.notEqual(api.formatDate("2026-09-15T12:00:00.000Z"), "");
  });

  it("writes an absent cell value as empty text", () => {
    const { api } = scopesCase();
    assert.equal(api.createCell("Name").textContent, "Name");
    assert.equal(api.createCell("").textContent, "");
  });
});

describe("API keys shapes this page states rather than invents", () => {
  /** The derived row reuses the published names rather than opening a second vocabulary. */
  it("derives its scope row from the published record", () => {
    assert.match(source, /@typedef \{Omit<BrowserApiScope, "scope">\} NormalizedApiScope/);
  });

  it("reads both literal tables by own key", () => {
    assert.match(source, /Object\.hasOwn\(accessOrder, access\)/);
    assert.match(source, /Object\.hasOwn\(ownerLabels, moduleId\)/);
    assert.doesNotMatch(source, /accessOrder\[left\.access\]/);
  });

  it("carries the catalogue's access into the row it renders", () => {
    assert.match(source, /access: scope\.access\.trim\(\),/);
  });

  it("carries no suppression and no cast", () => {
    assert.doesNotMatch(source, /@ts-(expect-error|ignore|nocheck)/);
    assert.doesNotMatch(source, /\/\*\* @type \{[^}]*\} \*\/ \(/);
  });
});
