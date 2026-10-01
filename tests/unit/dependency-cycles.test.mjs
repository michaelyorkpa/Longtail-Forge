// `0.33.33.47.1`: the dependency-cycle measurement and its no-growth ratchet.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { it } from "vitest";
import {
  closingEdges,
  collectImportGraph,
  compareDependencyCycles,
  findCycles,
  measureDependencyCycles,
  parseRenames,
  parseSource,
  readDependencyCycleBaseline,
  readImports,
  serializeDependencyCycles,
} from "../../scripts/lib/dependency-cycles.mjs";

/** @typedef {import("../../scripts/lib/dependency-cycles.mjs").DependencyCycleState} DependencyCycleState */
/** @typedef {import("../../scripts/lib/dependency-cycles.mjs").ImportGraph} ImportGraph */
/** @typedef {import("../../scripts/lib/dependency-cycles.mjs").ImportEdge} ImportEdge */

/**
 * A graph from an adjacency list, every edge static unless its target is prefixed `dynamic:`.
 * @param {Record<string, string[]>} links
 * @returns {ImportGraph}
 */
function graphOf(links) {
  /** @type {Map<string, ImportEdge[]>} */
  const edges = new Map();
  for (const [file, targets] of Object.entries(links)) {
    edges.set(file, targets.map((target) => (target.startsWith("dynamic:")
      ? { target: target.slice("dynamic:".length), kind: "dynamic" }
      : { target, kind: "static" })));
  }
  return { files: Object.keys(links), edges, computedDynamicImports: {} };
}

/**
 * @param {string[][]} components @param {Record<string, number>} [computed] @param {string[][]} [withDynamic]
 * @returns {DependencyCycleState}
 */
function state(components, computed = {}, withDynamic = components) {
  return { schemaVersion: 1, static: components, staticAndDynamic: withDynamic, computedDynamicImports: computed };
}

it("reads every import form, and nothing that only looks like one", () => {
  const source = [
    'import a from "./a.js";',
    'import "./b.js";',
    'import * as c from "./c.js";',
    'export { d } from "./d.js";',
    'export * from "./e.js";',
    'export * as f from "./f.js";',
    'const g = await import("./g.js");',
    "const h = await import(`./h.js`);",
    "const name = './i.js'; await import(name);",
    "await import(`./${name}`);",
    'const text = "import j from \'./j.js\'";',
    '/** @param {import("./k.js").K} k */ function useK(k) { return k; }',
    "const url = import.meta.url;",
    'import express from "express";',
    'import fsModule from "node:fs";',
    "export { useK };",
  ].join("\n");
  const { specifiers, computed } = readImports(parseSource(source));
  assert.deepEqual(
    specifiers.map((entry) => `${entry.kind}:${entry.specifier}`).sort(),
    ["dynamic:./g.js", "dynamic:./h.js", "static:./a.js", "static:./b.js", "static:./c.js", "static:./d.js", "static:./e.js", "static:./f.js", "static:express", "static:node:fs"].sort(),
  );
  assert.equal(computed, 2, "a computed specifier is counted, never guessed");
});

it("parses a classic browser script that is not valid module code", () => {
  const { specifiers, computed } = readImports(parseSource("with (window) { var octal = 010; }\nimport('./late.js');"));
  assert.deepEqual(specifiers, [{ specifier: "./late.js", kind: "dynamic" }]);
  assert.equal(computed, 0);
});

it("resolves only relative specifiers that name a first-party file", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ltf-cycles-"));
  try {
    fs.mkdirSync(path.join(root, "src", "nested"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "a.js"), 'import "./nested/b.js"; import "./missing.js"; import "pkg";\n');
    fs.writeFileSync(path.join(root, "src", "nested", "b.js"), 'import "../a.js"; await import("./c.js");\n');
    fs.writeFileSync(path.join(root, "src", "nested", "c.js"), "export const c = 1;\n");
    const graph = collectImportGraph({ root, files: ["src/a.js", "src/nested/b.js", "src/nested/c.js"] });
    assert.deepEqual(graph.edges.get("src/a.js"), [{ target: "src/nested/b.js", kind: "static" }]);
    assert.deepEqual(graph.edges.get("src/nested/b.js"), [{ target: "src/a.js", kind: "static" }, { target: "src/nested/c.js", kind: "dynamic" }]);
    assert.deepEqual(measureDependencyCycles(graph).static, [["src/a.js", "src/nested/b.js"]]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it("finds every cycle, including a self-import, and keeps static and dynamic edges apart", () => {
  const graph = graphOf({
    "a.js": ["b.js"],
    "b.js": ["c.js"],
    "c.js": ["a.js"],
    "d.js": ["d.js"],
    "e.js": ["f.js"],
    "f.js": ["dynamic:e.js"],
    "g.js": ["a.js"],
  });
  assert.deepEqual(findCycles(graph, ["static"]), [["a.js", "b.js", "c.js"], ["d.js"]]);
  assert.deepEqual(findCycles(graph, ["static", "dynamic"]), [["a.js", "b.js", "c.js"], ["e.js", "f.js"], ["d.js"]]);
});

it("names the edges that close a cycle, and what remains without them", () => {
  // The catalog's shape: a catalog imports two modules, both reach core, core reaches the registry,
  // and the registry imports the catalog. One module also has an inner loop of its own.
  const graph = graphOf({
    "catalog.js": ["m1.js", "m2.js"],
    "m1.js": ["core.js", "m1b.js"],
    "m1b.js": ["m1.js"],
    "m2.js": ["core.js"],
    "core.js": ["registry.js"],
    "registry.js": ["catalog.js"],
  });
  const [component] = findCycles(graph, ["static"]);
  assert.equal(component.length, 6);
  const closing = closingEdges(graph, ["static"], component);
  assert.deepEqual(closing.edges, ["core.js -> registry.js", "registry.js -> catalog.js"], "the two edges every route back to the catalog uses");
  assert.deepEqual(closing.remaining, [["m1.js", "m1b.js"]], "opening the ring leaves only the module's own inner loop");
});

it("refuses a new cycle, a file joining a cycle, and two recorded cycles merging", () => {
  const baseline = state([["a.js", "b.js"], ["c.js", "d.js"]]);
  assert.deepEqual(compareDependencyCycles(baseline, baseline), { growth: [], shrink: [] });
  const newCycle = compareDependencyCycles(baseline, state([["a.js", "b.js"], ["c.js", "d.js"], ["e.js", "f.js"]]));
  assert.equal(newCycle.growth.length, 2, "one for each graph");
  assert.match(newCycle.growth[0], /files joining a cycle: e\.js, f\.js/);
  const joined = compareDependencyCycles(baseline, state([["a.js", "b.js", "z.js"], ["c.js", "d.js"]]));
  assert.match(joined.growth[0], /files joining a cycle: z\.js/);
  const merged = compareDependencyCycles(baseline, state([["a.js", "b.js", "c.js", "d.js"]]));
  assert.match(merged.growth[0], /it merges 2 recorded cycles/);
});

it("asks for shrinking to be recorded: a file leaving, a cycle splitting, a cycle disappearing", () => {
  const baseline = state([["a.js", "b.js", "c.js", "d.js"]]);
  const left = compareDependencyCycles(baseline, state([["a.js", "b.js", "c.js"]]));
  assert.deepEqual(left.growth, []);
  assert.match(left.shrink[0], /lost 1 file\(s\): d\.js/);
  const split = compareDependencyCycles(baseline, state([["a.js", "b.js"], ["c.js", "d.js"]]));
  assert.deepEqual(split.growth, []);
  assert.ok(split.shrink.some((entry) => /split into 2 cycles/.test(entry)));
  const gone = compareDependencyCycles(baseline, state([]));
  assert.deepEqual(gone.growth, []);
  assert.ok(gone.shrink.some((entry) => /lost 4 file\(s\)/.test(entry)));
});

it("treats a declared rename as the same file, and an undeclared one as growth", () => {
  const baseline = state([["old.js", "b.js"]], { "old.js": 1 });
  const current = state([["new.js", "b.js"]], { "new.js": 1 });
  assert.ok(compareDependencyCycles(baseline, current).growth.length > 0, "an undeclared rename looks like a file joining");
  assert.deepEqual(compareDependencyCycles(baseline, current, new Map([["old.js", "new.js"]])), { growth: [], shrink: [] });
  assert.deepEqual([...parseRenames(["old.js=new.js"], ["new.js", "b.js"])], [["old.js", "new.js"]]);
  assert.throws(() => parseRenames(["old.js=new.js"], ["old.js", "new.js"]), /still exists/);
  assert.throws(() => parseRenames(["old.js=other.js"], ["new.js"]), /not a first-party file/);
  assert.throws(() => parseRenames(["old.js"], ["new.js"]), /declared as old=new/);
});

it("refuses a new computed import, which the measurement cannot see through", () => {
  const baseline = state([], { "a.js": 1 });
  assert.match(compareDependencyCycles(baseline, state([], { "a.js": 2 })).growth[0], /computed import\(\) in a\.js rose 1 -> 2/);
  assert.match(compareDependencyCycles(baseline, state([], { "a.js": 1, "b.js": 1 })).growth[0], /computed import\(\) in b\.js rose 0 -> 1/);
  assert.match(compareDependencyCycles(baseline, state([], {})).shrink[0], /computed import\(\) in a\.js fell 1 -> 0/);
});

it("round-trips a baseline, and refuses one that is not a baseline", () => {
  const recorded = state([["a.js", "b.js"]], { "c.js": 1 }, [["a.js", "b.js", "c.js"]]);
  assert.deepEqual(readDependencyCycleBaseline(serializeDependencyCycles(recorded)), recorded);
  assert.throws(() => readDependencyCycleBaseline(JSON.stringify({ schemaVersion: 2 })), /schema version 1/);
  assert.throws(() => readDependencyCycleBaseline(JSON.stringify({ schemaVersion: 1, static: [] })), /must record/);
  assert.throws(() => readDependencyCycleBaseline(JSON.stringify({ schemaVersion: 1, static: [[1]], staticAndDynamic: [], computedDynamicImports: {} })), /must be a path/);
  assert.throws(() => readDependencyCycleBaseline(JSON.stringify({ schemaVersion: 1, static: [], staticAndDynamic: [], computedDynamicImports: { "a.js": 0 } })), /positive count/);
});
