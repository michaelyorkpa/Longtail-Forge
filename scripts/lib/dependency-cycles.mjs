// The first-party import graph, its cycles, and the no-growth ratchet over them (`0.33.33.47.1`,
// with its measurement basis corrected by `0.33.33.47.3`).
//
// Parsing uses `espree`, the parser ESLint already runs over this repository, for the reason
// `scripts/lib/regression-source-measure.mjs` records: `typescript@7` ships the native compiler and
// exposes no JavaScript parser, and a regular expression cannot tell an import from import-shaped
// text inside a string - which the source-text regressions are full of.
//
// What is measured, over the first-party universe the typecheck governance owns:
// - static edges: `import ... from`, bare `import "..."`, and `export ... from`;
// - dynamic edges: `import()` whose specifier is a string literal, or a template literal with no
//   substitutions;
// - computed `import()` sites, which no resolver can follow. They are counted per file, so the
//   tool's blind spots stay visible and cannot grow unseen.
// Only relative specifiers name first-party files. Packages and `node:` builtins are not part of
// the graph.
//
// A cycle is a strongly connected component of two or more files, or a file that imports itself.
// The ratchet compares the current cycles with a recorded baseline:
// - growth is refused: no new cycle, no cycle gaining a file, no two recorded cycles merging, and
//   no file gaining a computed import;
// - shrinking is welcome but must be recorded: a cycle that loses a file, splits or disappears asks
//   for the smaller baseline to be written, so a file that left a cycle cannot quietly rejoin it.
// A renamed cycle member is declared explicitly when the baseline is written, rather than being
// mistaken for a file joining.
//
// Two measurements are taken (`0.33.33.47.3`):
// - the raw runtime dependency measurement, over every edge. It is reported and never enforced. The
//   runtime cycle it shows through the bundled-module catalog is retained, not removed.
// - the enforcement measurement with the named exception: the same graph without the one edge the
//   operator authorized. This is what the ratchet governs. Measured through the catalog's
//   composition edge, every registered module's dependencies became one component, so the ratchet
//   refused ordinary module growth and could not see a new import between files already inside it.
// The ratchet stays a no-growth policy over cyclic components. It does not prove that every
// undesirable import inside an already permitted component is detected.

import fs from "node:fs";
import path from "node:path";
import { parse } from "espree";

/** @typedef {"static" | "dynamic"} EdgeKind */
/** @typedef {{ target: string, kind: EdgeKind }} ImportEdge */
/**
 * @typedef {{
 *   files: readonly string[],
 *   edges: ReadonlyMap<string, readonly ImportEdge[]>,
 *   computedDynamicImports: Readonly<Record<string, number>>,
 * }} ImportGraph
 */
/**
 * One exact edge the enforcement measurement leaves out, and why.
 * @typedef {{ from: string, to: string, kind: EdgeKind, reason: string }} CycleException
 */
/**
 * One measurement. Components are sorted, and so are their members, so equal measurements
 * serialise to equal text.
 * @typedef {{
 *   static: string[][],
 *   staticAndDynamic: string[][],
 *   computedDynamicImports: Record<string, number>,
 * }} DependencyCycleState
 */
/**
 * The recorded policy: the exceptions, and the enforcement measurement taken without them.
 * @typedef {{
 *   schemaVersion: 2,
 *   exceptions: CycleException[],
 *   enforcement: DependencyCycleState,
 * }} DependencyCycleBaseline
 */
/** @typedef {{ growth: string[], shrink: string[] }} DependencyCycleComparison */

const GRAPHS = /** @type {const} */ (["static", "staticAndDynamic"]);

/**
 * The only exception the operator has authorized: ruling D2 of 2026-10-01, `0.33.33.47.3`. Its
 * authority is this list, which the unit tests pin independently. A baseline must record exactly
 * this list, so one edited to exempt another edge is refused rather than becoming its own authority.
 */
const AUTHORIZED_CYCLE_EXCEPTIONS = Object.freeze([
  Object.freeze({
    from: "src/core/modules/registry.js",
    to: "src/core/modules/bundled-module-catalog.generated.js",
    kind: "static",
    reason: "The framework's module-catalog composition link otherwise combines ordinary registered module dependencies into one large component and prevents the intended module-growth workflow.",
  }),
]);

/**
 * Parse one file. A classic browser script that is not valid module code is parsed as a script;
 * it can hold no import declaration, but it may still call `import()`.
 * @param {string} source
 * @returns {unknown}
 */
function parseSource(source) {
  try {
    return parse(source, { ecmaVersion: "latest", sourceType: "module" });
  } catch {
    return parse(source, { ecmaVersion: "latest", sourceType: "script" });
  }
}

/**
 * The specifier a `source` node spells, when it spells one exactly.
 * @param {unknown} node
 * @returns {string | null}
 */
function literalSpecifier(node) {
  if (!node || typeof node !== "object" || !("type" in node)) return null;
  if (node.type === "Literal" && "value" in node && typeof node.value === "string") return node.value;
  if (node.type !== "TemplateLiteral" || !("expressions" in node) || !("quasis" in node)) return null;
  const expressions = node.expressions;
  const quasis = node.quasis;
  if (!Array.isArray(expressions) || expressions.length > 0 || !Array.isArray(quasis) || quasis.length !== 1) return null;
  /** @type {unknown} */
  const quasi = quasis[0];
  if (!quasi || typeof quasi !== "object" || !("value" in quasi)) return null;
  const value = quasi.value;
  if (!value || typeof value !== "object" || !("cooked" in value) || typeof value.cooked !== "string") return null;
  return value.cooked;
}

/**
 * Every import a parsed file makes, in source order, and how many `import()` calls it computes.
 * @param {unknown} program
 * @returns {{ specifiers: { specifier: string, kind: EdgeKind }[], computed: number }}
 */
function readImports(program) {
  /** @type {{ specifier: string, kind: EdgeKind, position: number }[]} */
  const found = [];
  let computed = 0;
  /** @type {unknown[]} */
  const pending = [program];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node || typeof node !== "object") continue;
    if (Array.isArray(node)) {
      /** @type {unknown[]} */
      const items = node;
      pending.push(...items);
      continue;
    }
    if ("type" in node && typeof node.type === "string") {
      const position = "start" in node && typeof node.start === "number" ? node.start : 0;
      const isDeclaration = node.type === "ImportDeclaration" || node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration";
      if (isDeclaration && "source" in node && node.source) {
        const specifier = literalSpecifier(node.source);
        if (specifier !== null) found.push({ specifier, kind: "static", position });
      }
      if (node.type === "ImportExpression" && "source" in node) {
        const specifier = literalSpecifier(node.source);
        if (specifier === null) computed += 1;
        else found.push({ specifier, kind: "dynamic", position });
      }
    }
    /** @type {unknown[]} */
    const children = Object.values(node);
    pending.push(...children);
  }
  const specifiers = found
    .sort((left, right) => left.position - right.position)
    .map(({ specifier, kind }) => ({ specifier, kind }));
  return { specifiers, computed };
}

/**
 * Build the import graph over a list of repository-relative files. An edge is kept only when a
 * relative specifier names another file in the list.
 * @param {{ root: string, files: readonly string[] }} input
 * @returns {ImportGraph}
 */
function collectImportGraph({ root, files }) {
  const known = new Set(files);
  /** @type {Map<string, ImportEdge[]>} */
  const edges = new Map();
  /** @type {Record<string, number>} */
  const computedDynamicImports = {};
  for (const file of files) {
    const { specifiers, computed } = readImports(parseSource(fs.readFileSync(path.join(root, file), "utf8")));
    if (computed > 0) computedDynamicImports[file] = computed;
    /** @type {ImportEdge[]} */
    const fileEdges = [];
    for (const { specifier, kind } of specifiers) {
      if (!specifier.startsWith("./") && !specifier.startsWith("../")) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      if (known.has(target)) fileEdges.push({ target, kind });
    }
    edges.set(file, fileEdges);
  }
  return { files: [...files], edges, computedDynamicImports };
}

/**
 * The adjacency the given edge kinds make, restricted to known files.
 * @param {ImportGraph} graph @param {readonly EdgeKind[]} kinds
 * @returns {Map<string, string[]>}
 */
function adjacency(graph, kinds) {
  /** @type {Map<string, string[]>} */
  const next = new Map();
  for (const file of graph.files) {
    next.set(file, [...new Set((graph.edges.get(file) || []).filter((edge) => kinds.includes(edge.kind)).map((edge) => edge.target))]);
  }
  return next;
}

/**
 * Strongly connected components that form a cycle: two or more files, or one file that imports
 * itself. Tarjan's algorithm, iterative so a deep import chain cannot exhaust the call stack.
 * @param {ImportGraph} graph @param {readonly EdgeKind[]} kinds
 * @returns {string[][]}
 */
function findCycles(graph, kinds) {
  const next = adjacency(graph, kinds);
  /** @type {Map<string, number>} */
  const order = new Map();
  /** @type {Map<string, number>} */
  const low = new Map();
  /** @type {string[]} */
  const stack = [];
  const onStack = new Set();
  /** @type {string[][]} */
  const cycles = [];
  let counter = 0;
  for (const start of graph.files) {
    if (order.has(start)) continue;
    /** @type {{ file: string, targets: string[], position: number }[]} */
    const frames = [{ file: start, targets: next.get(start) || [], position: 0 }];
    order.set(start, counter);
    low.set(start, counter);
    counter += 1;
    stack.push(start);
    onStack.add(start);
    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      if (frame.position < frame.targets.length) {
        const target = frame.targets[frame.position];
        frame.position += 1;
        if (!order.has(target)) {
          order.set(target, counter);
          low.set(target, counter);
          counter += 1;
          stack.push(target);
          onStack.add(target);
          frames.push({ file: target, targets: next.get(target) || [], position: 0 });
        } else if (onStack.has(target)) {
          low.set(frame.file, Math.min(Number(low.get(frame.file)), Number(order.get(target))));
        }
        continue;
      }
      frames.pop();
      if (frames.length > 0) {
        const parent = frames[frames.length - 1].file;
        low.set(parent, Math.min(Number(low.get(parent)), Number(low.get(frame.file))));
      }
      if (low.get(frame.file) !== order.get(frame.file)) continue;
      /** @type {string[]} */
      const component = [];
      let member = "";
      do {
        member = String(stack.pop());
        onStack.delete(member);
        component.push(member);
      } while (member !== frame.file);
      const importsItself = component.length === 1 && (next.get(component[0]) || []).includes(component[0]);
      if (component.length > 1 || importsItself) cycles.push(component.sort());
    }
  }
  return sortComponents(cycles);
}

/** @param {string[][]} components @returns {string[][]} */
function sortComponents(components) {
  return components
    .map((component) => [...component].sort())
    .sort((left, right) => right.length - left.length || left[0].localeCompare(right[0]));
}

/**
 * The edges that close a cycle: those whose removal alone leaves the smallest largest cycle
 * behind, measured by removing each internal edge in turn. Answers the edges, ties included, and
 * the cycles that would remain without the first of them - so a report can say both where a
 * cycle is closed and what is left once it is opened.
 * @param {ImportGraph} graph @param {readonly EdgeKind[]} kinds @param {readonly string[]} component
 * @returns {{ edges: string[], remaining: string[][] }}
 */
function closingEdges(graph, kinds, component) {
  const members = new Set(component);
  const next = adjacency(graph, kinds);
  /** @type {[string, string][]} */
  const internal = [];
  for (const file of component) {
    for (const target of next.get(file) || []) if (members.has(target)) internal.push([file, target]);
  }
  /** @param {readonly [string, string]} removed @returns {string[][]} */
  const cyclesWithout = (removed) => {
    /** @type {Map<string, ImportEdge[]>} */
    const edges = new Map(component.map((file) => [file, []]));
    for (const [from, to] of internal) {
      if (from !== removed[0] || to !== removed[1]) edges.get(from)?.push({ target: to, kind: "static" });
    }
    return findCycles({ files: [...component], edges, computedDynamicImports: {} }, ["static"]);
  };
  let smallest = Infinity;
  /** @type {string[]} */
  let edges = [];
  /** @type {string[][]} */
  let remaining = [];
  for (const edge of internal) {
    const left = cyclesWithout(edge);
    const largest = left[0]?.length ?? 0;
    if (largest < smallest) {
      smallest = largest;
      edges = [];
      remaining = left;
    }
    if (largest === smallest) edges.push(`${edge[0]} -> ${edge[1]}`);
  }
  return { edges: edges.sort(), remaining };
}

/**
 * Measure the cycles in a graph: the raw graph for the raw measurement, or the graph without the
 * exceptions for the enforcement measurement.
 * @param {ImportGraph} graph
 * @returns {DependencyCycleState}
 */
function measureDependencyCycles(graph) {
  /** @type {Record<string, number>} */
  const computedDynamicImports = {};
  for (const file of Object.keys(graph.computedDynamicImports).sort()) computedDynamicImports[file] = graph.computedDynamicImports[file];
  return {
    static: findCycles(graph, ["static"]),
    staticAndDynamic: findCycles(graph, ["static", "dynamic"]),
    computedDynamicImports,
  };
}

/**
 * The enforcement graph: the same files, without exactly the excepted edges. An edge is left out
 * only when its source, target and kind all match an exception. A dynamic import between the same
 * two files, the target's own imports, and every other edge of the source all stay.
 * @param {ImportGraph} graph @param {readonly CycleException[]} exceptions
 * @returns {ImportGraph}
 */
function withoutExceptions(graph, exceptions) {
  /** @type {Map<string, ImportEdge[]>} */
  const edges = new Map();
  for (const [file, fileEdges] of graph.edges) {
    edges.set(file, fileEdges.filter((edge) => !exceptions.some((exception) => (
      exception.from === file && exception.to === edge.target && exception.kind === edge.kind
    ))));
  }
  return { files: graph.files, edges, computedDynamicImports: graph.computedDynamicImports };
}

/** @param {CycleException} exception */
function describeException(exception) {
  return `${exception.from} -> ${exception.to} (${exception.kind})`;
}

/** @param {CycleException} left @param {CycleException} right */
function sameException(left, right) {
  return left.from === right.from && left.to === right.to && left.kind === right.kind && left.reason === right.reason;
}

/**
 * Every reason a recorded exception list cannot be honoured: an entry recorded twice, an entry that
 * is not exactly an authorized one, an authorized one that is missing, or an entry whose edge the
 * graph no longer has. Every problem is answered, so none is silently discarded.
 * @param {readonly CycleException[]} recorded @param {ImportGraph} graph
 * @returns {string[]}
 */
function validateCycleExceptions(recorded, graph) {
  /** @type {string[]} */
  const errors = [];
  const seen = new Set();
  for (const exception of recorded) {
    const described = describeException(exception);
    if (seen.has(described)) errors.push(`duplicate exception: ${described}`);
    seen.add(described);
    if (!AUTHORIZED_CYCLE_EXCEPTIONS.some((authorized) => sameException(authorized, exception))) {
      errors.push(`unauthorized exception: ${described} is not exactly the operator-authorized exception`);
    }
    const present = (graph.edges.get(exception.from) || []).some((edge) => edge.target === exception.to && edge.kind === exception.kind);
    if (!present) errors.push(`stale exception: ${described} names an edge that no longer exists`);
  }
  for (const authorized of AUTHORIZED_CYCLE_EXCEPTIONS) {
    if (!recorded.some((exception) => sameException(exception, authorized))) {
      errors.push(`missing exception: the authorized ${describeException(authorized)} is not recorded`);
    }
  }
  return errors;
}

/**
 * Compare a measurement with the recorded baseline. Growth is what the ratchet refuses; shrinking
 * is what it asks to have recorded. `renames` maps a recorded path to the path it now has.
 * @param {DependencyCycleState} baseline @param {DependencyCycleState} current
 * @param {ReadonlyMap<string, string>} [renames]
 * @returns {DependencyCycleComparison}
 */
function compareDependencyCycles(baseline, current, renames = new Map()) {
  /** @param {string} file */
  const renamed = (file) => renames.get(file) ?? file;
  /** @type {string[]} */
  const growth = [];
  /** @type {string[]} */
  const shrink = [];
  for (const graphName of GRAPHS) {
    const recorded = baseline[graphName].map((component) => new Set(component.map(renamed)));
    const recordedMembers = new Set(recorded.flatMap((component) => [...component]));
    /** @type {Map<Set<string>, number>} */
    const piecesPerRecorded = new Map();
    for (const component of current[graphName]) {
      const home = recorded.find((candidate) => component.every((file) => candidate.has(file)));
      if (home) {
        piecesPerRecorded.set(home, (piecesPerRecorded.get(home) || 0) + 1);
        continue;
      }
      const joined = component.filter((file) => !recordedMembers.has(file));
      const merged = recorded.filter((candidate) => component.some((file) => candidate.has(file))).length;
      const detail = [
        joined.length > 0 ? `files joining a cycle: ${joined.join(", ")}` : "",
        merged > 1 ? `it merges ${merged} recorded cycles` : "",
      ].filter(Boolean).join("; ");
      growth.push(`${graphName}: a cycle of ${component.length} files is not inside any recorded cycle (${detail})`);
    }
    const currentMembers = new Set(current[graphName].flat());
    recorded.forEach((component, index) => {
      const left = [...component].filter((file) => !currentMembers.has(file)).sort();
      if (left.length > 0) shrink.push(`${graphName}: recorded cycle ${index + 1} lost ${left.length} file(s): ${left.join(", ")}`);
      const pieces = piecesPerRecorded.get(component) || 0;
      if (pieces > 1) shrink.push(`${graphName}: recorded cycle ${index + 1} split into ${pieces} cycles`);
    });
  }
  const recordedComputed = new Map(Object.entries(baseline.computedDynamicImports).map(([file, count]) => [renamed(file), count]));
  for (const [file, count] of Object.entries(current.computedDynamicImports)) {
    const before = recordedComputed.get(file) || 0;
    if (count > before) growth.push(`computed import() in ${file} rose ${before} -> ${count}; the cycle measurement cannot see through it`);
  }
  for (const [file, count] of recordedComputed) {
    const after = current.computedDynamicImports[file] || 0;
    if (after < count) shrink.push(`computed import() in ${file} fell ${count} -> ${after}`);
  }
  return { growth, shrink };
}

/**
 * Parse `--renamed old=new` declarations, each naming a recorded path that no longer exists and the
 * path that replaced it.
 * @param {readonly string[]} declarations @param {readonly string[]} files
 * @returns {Map<string, string>}
 */
function parseRenames(declarations, files) {
  const present = new Set(files);
  /** @type {Map<string, string>} */
  const renames = new Map();
  for (const declaration of declarations) {
    const separator = declaration.indexOf("=");
    const from = declaration.slice(0, separator).trim();
    const to = declaration.slice(separator + 1).trim();
    if (separator < 1 || !from || !to) throw new Error(`A rename is declared as old=new, not "${declaration}".`);
    if (present.has(from)) throw new Error(`${from} still exists, so it was not renamed.`);
    if (!present.has(to)) throw new Error(`${to} is not a first-party file, so nothing was renamed to it.`);
    renames.set(from, to);
  }
  return renames;
}

/** @param {DependencyCycleState} state */
function serializeDependencyCycles(state) {
  return `${JSON.stringify(state, null, 2)}\n`;
}

/** @param {DependencyCycleBaseline} baseline */
function serializeDependencyCycleBaseline(baseline) {
  return `${JSON.stringify(baseline, null, 2)}\n`;
}

/**
 * Refuse a value that is not a plain object with exactly the named keys.
 * @param {unknown} value @param {readonly string[]} keys @param {string} name
 * @returns {Record<string, unknown>}
 */
function readExactObject(value, keys, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object.`);
  /** @type {[string, unknown][]} */
  const entries = Object.entries(value);
  /** @type {Record<string, unknown>} */
  const record = Object.fromEntries(entries);
  const present = entries.map(([key]) => key).sort();
  const expected = [...keys].sort();
  if (present.join("\n") !== expected.join("\n")) {
    throw new Error(`${name} must record exactly ${expected.join(", ")}; it records ${present.join(", ") || "nothing"}.`);
  }
  return record;
}

/** @param {unknown} value @param {string} message @returns {string} */
function readNonEmptyString(value, message) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(message);
  return value;
}

/** @param {unknown} value @param {string} message @returns {EdgeKind} */
function readEdgeKind(value, message) {
  if (value === "static" || value === "dynamic") return value;
  throw new Error(message);
}

/**
 * Read the recorded exceptions, refusing a malformed entry. Whether they are the authorized ones,
 * and whether their edges still exist, is `validateCycleExceptions`'s question.
 * @param {unknown} value
 * @returns {CycleException[]}
 */
function readCycleExceptions(value) {
  if (!Array.isArray(value)) throw new Error("The baseline's exceptions must be a list.");
  /** @type {unknown[]} */
  const entries = value;
  return entries.map((entry, index) => {
    const name = `Exception ${index + 1}`;
    const record = readExactObject(entry, ["from", "to", "kind", "reason"], name);
    return {
      from: readNonEmptyString(record.from, `${name}'s from must be a non-empty path.`),
      to: readNonEmptyString(record.to, `${name}'s to must be a non-empty path.`),
      kind: readEdgeKind(record.kind, `${name}'s kind must be static or dynamic.`),
      reason: readNonEmptyString(record.reason, `${name}'s reason must be a non-empty string.`),
    };
  });
}

/**
 * Read one recorded measurement, refusing anything that is not one.
 * @param {unknown} value @param {string} name
 * @returns {DependencyCycleState}
 */
function readDependencyCycleState(value, name) {
  const record = readExactObject(value, ["static", "staticAndDynamic", "computedDynamicImports"], name);
  /** @param {unknown} components @param {string} graphName @returns {string[][]} */
  const readComponents = (components, graphName) => {
    if (!Array.isArray(components)) throw new Error(`The baseline's ${graphName} must be a list of cycles.`);
    /** @type {unknown[]} */
    const list = components;
    return list.map((component) => {
      if (!Array.isArray(component)) throw new Error(`Each cycle in ${graphName} must be a list of files.`);
      /** @type {unknown[]} */
      const members = component;
      return members.map((file) => {
        if (typeof file !== "string") throw new Error(`Each file in ${graphName} must be a path.`);
        return file;
      });
    });
  };
  const computed = record.computedDynamicImports;
  if (!computed || typeof computed !== "object" || Array.isArray(computed)) throw new Error("computedDynamicImports must be a map of files to counts.");
  /** @type {Record<string, number>} */
  const computedDynamicImports = {};
  /** @type {[string, unknown][]} */
  const counts = Object.entries(computed);
  for (const [file, count] of counts) {
    if (typeof count !== "number" || !Number.isInteger(count) || count < 1) throw new Error(`computedDynamicImports for ${file} must be a positive count.`);
    computedDynamicImports[file] = count;
  }
  return {
    static: readComponents(record.static, "static"),
    staticAndDynamic: readComponents(record.staticAndDynamic, "staticAndDynamic"),
    computedDynamicImports,
  };
}

/**
 * Read a recorded baseline, refusing anything that is not one. It must be schema version 2 and
 * record exactly its exceptions and its enforcement measurement.
 * @param {string} text
 * @returns {DependencyCycleBaseline}
 */
function readDependencyCycleBaseline(text) {
  /** @type {unknown} */
  const value = JSON.parse(text);
  if (!value || typeof value !== "object" || !("schemaVersion" in value) || value.schemaVersion !== 2) {
    throw new Error("The dependency-cycle baseline must be schema version 2.");
  }
  const record = readExactObject(value, ["schemaVersion", "exceptions", "enforcement"], "The dependency-cycle baseline");
  return {
    schemaVersion: 2,
    exceptions: readCycleExceptions(record.exceptions),
    enforcement: readDependencyCycleState(record.enforcement, "The baseline's enforcement measurement"),
  };
}

export {
  AUTHORIZED_CYCLE_EXCEPTIONS,
  collectImportGraph,
  compareDependencyCycles,
  closingEdges,
  findCycles,
  measureDependencyCycles,
  parseRenames,
  readDependencyCycleBaseline,
  readImports,
  parseSource,
  serializeDependencyCycleBaseline,
  serializeDependencyCycles,
  validateCycleExceptions,
  withoutExceptions,
};
