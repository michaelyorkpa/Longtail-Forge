import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

import { collectBrowserPublicationInventory } from "../../scripts/test-support/browser-publication-inventory.mjs";

/**
 * The six publication roots `0.33.33.38.2.6.8` addressed through a checked local binding.
 *
 * The binding is the point, not merely the check. The publication inventory resolves a writer
 * through the **binding** an assignment is rooted at, so `requireNamespace().filesDialog = ...`
 * - a call expression - cannot be proved to be the namespace, and six real surfaces would have
 * dropped out of governance. A local `const` read straight from the global is what the resolver
 * understands, and it is also the smallest acquisition each publication point can carry.
 */

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

/** The six sites: file, the surface it publishes, and the binding it publishes through. */
const SITES = Object.freeze([
  ["public/js/clients-projects.js", "clientProjectDialog", "namespace"],
  ["public/js/files.js", "filesDialog", "namespace"],
  ["public/js/lists.js", "listsDialog", "namespace"],
  ["public/js/notes.js", "notesDialog", "namespace"],
  ["public/js/navigation.js", "userPreferences", "shellNamespace"],
  ["public/js/navigation.js", "supportView", "supportNamespace"],
]);

describe("the publication inventory still attributes all six surfaces", () => {
  const inventory = collectBrowserPublicationInventory({});

  it("records every surface against the file that publishes it", () => {
    for (const [path, surface] of SITES) {
      const entry = inventory.surfaces.get("window.LongtailForge." + surface);
      assert.ok(entry, surface + " must still be a published surface");
      const writers = (entry.writers ?? []).map((writer) => writer.file);
      assert.ok(writers.includes(path), surface + " must still be attributed to " + path);
    }
  });

  it("resolves each of them through a binding rather than a spelling", () => {
    for (const [path, surface, binding] of SITES) {
      const entry = inventory.surfaces.get("window.LongtailForge." + surface);
      assert.ok(entry, surface + " must still be a published surface");
      const writer = (entry.writers ?? []).find((candidate) => candidate.file === path);
      assert.ok(writer, surface + " must have a writer in " + path);
      assert.equal(writer.form, "alias", surface + " is published through a binding");
      assert.equal(writer.alias, binding, surface + " is published through " + binding);
    }
  });

  it("introduces no deep, computed or unsupported rooted write", () => {
    assert.deepEqual(inventory.deepWrites, [], "no publication writes below a surface");
    assert.deepEqual(inventory.unsupportedTargets, [], "no publication the resolver cannot place");
  });

  it("leaves the namespace root writes alone", () => {
    // This child changes how six members are addressed, not how the root itself is established.
    const rootWriters = inventory.namespaceRootWrites.map((write) => write.file);
    assert.ok(rootWriters.includes("public/js/navigation.js"),
      "navigation.js still establishes the root it later publishes onto");
  });
});

describe("each publication acquires its root at the publication point", () => {
  /**
   * One site's guard-and-assignment region, run against a window the test controls.
   * @param {string} path @param {string} surface @param {string} binding
   * @param {unknown} root @param {Record<string, unknown>} [stubs]
   */
  function publish(path, surface, binding, root, stubs = {}) {
    const source = read(path);
    const assignment = source.indexOf(binding + "." + surface + " =");
    assert.notEqual(assignment, -1, path + " must publish " + surface + " through " + binding);
    // The acquisition that guards *this* publication, not some earlier binding of the same name:
    // three of these files already had a `namespace` const elsewhere.
    const declaration = "const " + binding + " = window.LongtailForge;";
    const start = source.lastIndexOf(declaration, assignment);
    assert.notEqual(start, -1, path + " must acquire " + binding + " before publishing " + surface);
    // End at the assignment's own terminating semicolon, which for the frozen publications is
    // several lines down: walk forward and stop at the first `;` outside any bracket.
    let depth = 0;
    let end = -1;
    for (let at = assignment; at < source.length; at += 1) {
      const character = source[at];
      if ("([{".includes(character)) {
        depth += 1;
      } else if (")]}".includes(character)) {
        depth -= 1;
      } else if (character === ";" && depth === 0) {
        end = at;
        break;
      }
    }
    assert.notEqual(end, -1, path + "'s publication of " + surface + " must terminate");
    const region = source.slice(start, end + 1);

    const names = Object.keys(stubs);
    /** @type {{ LongtailForge: unknown }} */
    const win = { LongtailForge: root };
    new Function("window", "Object", ...names, region)(
      win, Object, ...names.map((name) => stubs[name]));
    return win;
  }

  /**
   * Whether each surface is published frozen, as its publication contract requires.
   * @type {Readonly<Record<string, boolean>>}
   */
  const FROZEN = Object.freeze({
    clientProjectDialog: false,
    filesDialog: true,
    listsDialog: true,
    notesDialog: true,
    userPreferences: true,
    supportView: true,
  });

  /** @type {Record<string, Record<string, unknown>>} */
  const STUBS = {
    clientProjectDialog: { clientProjectDialogApi: { openAddClient: () => "added" } },
    filesDialog: {
      openFileEditor: () => "editor",
      openFileEditorAction: () => "editorAction",
      requireFilePreview: () => ({ openFilePreview: () => "preview" }),
      openFilePreviewAction: () => "previewAction",
    },
    listsDialog: { listsDialogApi: { openListEditor: () => "lists" } },
    notesDialog: { notesDialogApi: { openNoteEditor: () => "notes" } },
    userPreferences: { shell: { user: { preferredCalendarView: "week" } } },
    supportView: { supportView: { reason: "audit" } },
  };

  for (const [path, surface, binding] of SITES) {
    it(surface + " publishes onto the very root it read", () => {
      /** @type {Record<string, unknown>} */
      const root = { existingSibling: "kept" };
      const win = publish(path, surface, binding, root, STUBS[surface]);
      assert.equal(win.LongtailForge, root, "the global still holds the same object");
      assert.ok(Object.prototype.hasOwnProperty.call(root, surface),
        surface + " is published onto that object");
      assert.equal(root.existingSibling, "kept", "and its existing members survive");
    });

    it(surface + " refuses an absent root rather than creating one", () => {
      assert.throws(() => publish(path, surface, binding, undefined, STUBS[surface]),
        /requires the LongtailForge namespace\./,
        path + " must keep failing when there is no root to publish onto");
    });
  }

  it("keeps the frozen publications frozen and the plain one plain", () => {
    for (const [path, surface, binding] of SITES) {
      /** @type {Record<string, unknown>} */
      const root = {};
      publish(path, surface, binding, root, STUBS[surface]);
      const published = root[surface];
      // Stated here rather than derived from the source under test: reading the expectation out
      // of the same assignment would let a change move both sides together and prove nothing.
      const expected = FROZEN[surface];
      assert.equal(Object.isFrozen(published), expected,
        surface + (expected ? " is published frozen" : " is published unfrozen"));
    }
  });

  it("publishes the identity it was given, for the surface that forwards one", () => {
    /** @type {Record<string, unknown>} */
    const root = {};
    const api = STUBS.clientProjectDialog.clientProjectDialogApi;
    publish("public/js/clients-projects.js", "clientProjectDialog", "namespace", root,
      STUBS.clientProjectDialog);
    assert.equal(root.clientProjectDialog, api, "the same object, not a copy");
  });
});

describe("nothing about the bootstrap or the publication order moved", () => {
  it("creates a root in no file whose publication would have failed", () => {
    for (const [path] of SITES) {
      const source = read(path);
      assert.ok(!/const (namespace|shellNamespace|supportNamespace) = window\.LongtailForge \|\| \{\}/.test(source),
        path + " must not start creating a root at its publication point");
    }
  });

  it("keeps navigation's own root creation, which predates both its publications", () => {
    const source = read("public/js/navigation.js");
    const creation = source.indexOf("window.LongtailForge = window.LongtailForge || {};");
    const shell = source.indexOf("shellNamespace.userPreferences = ");
    const support = source.indexOf("supportNamespace.supportView = ");
    assert.notEqual(creation, -1, "navigation still establishes the root");
    assert.notEqual(shell, -1, "and still publishes the preference");
    assert.notEqual(support, -1, "and still publishes the support view");
    assert.ok(creation < shell && creation < support, "creation still precedes both publications");
  });

  it("acquires separately in navigation's two functions, rather than across the await", () => {
    // `userPreferences` is published after `await response.json()`. A root captured at module
    // scope and reused there would not provably be the root that exists afterwards.
    const source = read("public/js/navigation.js");
    const awaitAt = source.indexOf("bootstrapAdapter.normalize(await response.json())");
    const shellAcquire = source.indexOf("const shellNamespace = window.LongtailForge;");
    const supportAcquire = source.indexOf("const supportNamespace = window.LongtailForge;");
    assert.notEqual(awaitAt, -1, "the bootstrap still awaits its body");
    assert.notEqual(shellAcquire, -1, "the shell publication acquires its own root");
    assert.notEqual(supportAcquire, -1, "the support publication acquires its own root");
    assert.ok(awaitAt < shellAcquire, "and acquires it after the await, not before");
    assert.notEqual(shellAcquire, supportAcquire, "two acquisitions, not one shared binding");
  });

  it("keeps each publication ahead of the module-action registrations that follow it", () => {
    for (const [path, surface, binding] of [
      ["public/js/files.js", "filesDialog", "namespace"],
      ["public/js/lists.js", "listsDialog", "namespace"],
      ["public/js/notes.js", "notesDialog", "namespace"],
    ]) {
      const source = read(path);
      const publication = source.indexOf(binding + "." + surface + " = Object.freeze(");
      const registration = source.indexOf("window.LongtailForge.moduleActions?.register?.(", publication);
      assert.notEqual(publication, -1, path + " must publish " + surface);
      assert.notEqual(registration, -1, path + " must still register its module actions");
      assert.ok(publication < registration, path + " publishes before it registers");
    }
  });

  it("leaves the module-action registrations reading the root as they did", () => {
    // Those are optional reads in another cohort, and this child does not touch them.
    // Counted, not merely matched: these files register more than once, and rerouting only one
    // of them through the publication binding would still leave the others matching.
    /** @type {[string, number][]} */
    const registrationCounts = [
      ["public/js/files.js", 2], ["public/js/lists.js", 2], ["public/js/notes.js", 3],
    ];
    for (const [path, registrations] of registrationCounts) {
      const found = (read(path).match(/window\.LongtailForge\.moduleActions\?\.register\?\.\(/g) || []).length;
      assert.equal(found, registrations, path + " keeps every registration read unchanged");
    }
  });
});
