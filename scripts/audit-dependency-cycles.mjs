import fs from "node:fs";
import path from "node:path";
import {
  AUTHORIZED_CYCLE_EXCEPTIONS,
  collectImportGraph,
  compareDependencyCycles,
  closingEdges,
  measureDependencyCycles,
  parseRenames,
  readDependencyCycleBaseline,
  serializeDependencyCycleBaseline,
  serializeDependencyCycles,
  validateCycleExceptions,
  withoutExceptions,
} from "./lib/dependency-cycles.mjs";
import { firstPartyJavaScriptFiles } from "./typecheck-governance.mjs";

// The dependency-cycle ratchet (`0.33.33.47.1`, corrected by `0.33.33.47.3`). It takes two
// measurements of the first-party import graph:
// - the raw runtime dependency measurement, over every edge, which is reported and never enforced;
// - the enforcement measurement with the named exception: the same graph without the one
//   operator-authorized edge. This is what the ratchet governs.
// The default run reports both, with the edges that close each cycle and what would remain without
// them. `--check` refuses growth of the enforcement measurement and asks for any shrinking to be
// recorded. `--update-baseline` records the shrinking, refusing growth even then. Both refuse a
// baseline whose exceptions are not exactly the authorized ones, or whose excepted edge no longer
// exists. A renamed cycle member is declared with `--renamed=old=new`, so it is not mistaken for a
// file joining a cycle. Nothing bootstraps or resets the baseline: it is reviewed policy, and a
// missing one is restored from version control, not regenerated.

const root = process.cwd();
const baselinePath = path.join(root, "scripts", "baselines", "dependency-cycle-baseline.json");
const args = process.argv.slice(2);
/** @type {string[]} */
const renameDeclarations = [];
let check = false;
let update = false;
for (const argument of args) {
  if (argument === "--check") check = true;
  else if (argument === "--update-baseline") update = true;
  else if (argument.startsWith("--renamed=")) renameDeclarations.push(argument.slice("--renamed=".length));
  else throw new Error(`Unknown dependency-cycle audit option: ${argument}. Use --check, --update-baseline, or --renamed=old=new.`);
}
if (check && update) throw new Error("Use --check or --update-baseline, not both.");
if (renameDeclarations.length > 0 && !update) throw new Error("--renamed only applies when the baseline is updated.");

const files = firstPartyJavaScriptFiles();
const graph = collectImportGraph({ root, files });
const raw = measureDependencyCycles(graph);
const relativeBaseline = path.relative(root, baselinePath).split(path.sep).join("/");
const RAW_LABEL = "Raw runtime dependency measurement (every edge; reported, not enforced)";
const ENFORCEMENT_LABEL = "Enforcement measurement with the named exception";
const GRAPH_KINDS = /** @type {const} */ ([["static", ["static"]], ["staticAndDynamic", ["static", "dynamic"]]]);

/** @param {import("./lib/dependency-cycles.mjs").DependencyCycleState} state */
function summarize(state) {
  return GRAPH_KINDS.map(([name]) => `${name} ${state[name].length} cycle(s) of ${state[name].map((component) => component.length).join(", ") || "no"} file(s)`).join("; ");
}

/** @param {readonly import("./lib/dependency-cycles.mjs").CycleException[]} exceptions */
function describeExceptions(exceptions) {
  return exceptions.map((exception) => `  exception: ${exception.from} -> ${exception.to} (${exception.kind}). ${exception.reason}`).join("\n");
}

/**
 * @param {string} label @param {import("./lib/dependency-cycles.mjs").ImportGraph} measured
 * @param {import("./lib/dependency-cycles.mjs").DependencyCycleState} state
 */
function reportMeasurement(label, measured, state) {
  console.log(`${label}:`);
  for (const [name, kinds] of GRAPH_KINDS) {
    const components = state[name];
    console.log(`  ${name}: ${components.length} cycle(s), ${components.reduce((total, component) => total + component.length, 0)} file(s) in cycles.`);
    components.forEach((component, index) => {
      const closing = closingEdges(measured, kinds, component);
      const left = closing.remaining.length === 0
        ? "no cycle is left"
        : `the cycles left are ${closing.remaining.map((cycle) => cycle.length).join(", ")} file(s)`;
      console.log(`    cycle ${index + 1}: ${component.length} files, closed by ${closing.edges.join(" or ")}; without it, ${left}`);
      closing.remaining.forEach((cycle, inner) => {
        console.log(`      left ${inner + 1}: ${cycle.join(", ")}`);
      });
    });
  }
}

/** @param {string} heading @param {readonly string[]} entries */
function refuse(heading, entries) {
  console.error(`${heading}\n${entries.map((entry) => `- ${entry}`).join("\n")}`);
  process.exitCode = 1;
}

if (!check && !update) {
  const edgeCount = [...graph.edges.values()].reduce((total, edges) => total + edges.length, 0);
  console.log(`First-party import graph: ${files.length} files, ${edgeCount} internal edges.`);
  reportMeasurement(RAW_LABEL, graph, raw);
  const authorityErrors = validateCycleExceptions(AUTHORIZED_CYCLE_EXCEPTIONS, graph);
  if (authorityErrors.length > 0) {
    refuse("The authorized cycle exception cannot be applied:", authorityErrors);
  } else {
    const enforcementGraph = withoutExceptions(graph, AUTHORIZED_CYCLE_EXCEPTIONS);
    console.log(describeExceptions(AUTHORIZED_CYCLE_EXCEPTIONS));
    reportMeasurement(ENFORCEMENT_LABEL, enforcementGraph, measureDependencyCycles(enforcementGraph));
  }
  const computed = Object.entries(raw.computedDynamicImports);
  console.log(`computed import() the measurement cannot see through: ${computed.length === 0 ? "none" : computed.map(([file, count]) => `${file} (${count})`).join(", ")}`);
} else if (!fs.existsSync(baselinePath)) {
  refuse(`Missing ${relativeBaseline}.`, ["It is reviewed policy, not a cache: restore it from version control rather than regenerating it."]);
} else {
  /** @type {import("./lib/dependency-cycles.mjs").DependencyCycleBaseline | null} */
  let baseline = null;
  try {
    baseline = readDependencyCycleBaseline(fs.readFileSync(baselinePath, "utf8"));
  } catch (error) {
    refuse(`${relativeBaseline} is not a valid dependency-cycle baseline:`, [error instanceof Error ? error.message : String(error)]);
  }
  const exceptionErrors = baseline ? validateCycleExceptions(baseline.exceptions, graph) : [];
  if (baseline && exceptionErrors.length > 0) {
    refuse(`The cycle exceptions recorded in ${relativeBaseline} are refused; nothing was written:`, exceptionErrors);
  } else if (baseline) {
    const renames = parseRenames(renameDeclarations, files);
    const enforcement = measureDependencyCycles(withoutExceptions(graph, baseline.exceptions));
    console.log(`${RAW_LABEL}: ${summarize(raw)}.`);
    console.log(`${ENFORCEMENT_LABEL}: ${summarize(enforcement)}.`);
    const { growth, shrink } = compareDependencyCycles(baseline.enforcement, enforcement, renames);
    if (growth.length > 0) {
      refuse("Dependency cycles may not grow:", growth);
      if (check) console.error("If a cycle member was only renamed, record it with npm run audit:cycles:update-baseline -- --renamed=old=new.");
    } else if (update) {
      fs.writeFileSync(baselinePath, serializeDependencyCycleBaseline({ schemaVersion: 2, exceptions: baseline.exceptions, enforcement }));
      console.log(`Updated ${relativeBaseline}.${shrink.length > 0 ? ` Recorded shrinking:\n${shrink.map((entry) => `- ${entry}`).join("\n")}` : ""}`);
    } else if (serializeDependencyCycles(enforcement) !== serializeDependencyCycles(baseline.enforcement)) {
      refuse("Dependency cycles shrank; record the smaller baseline with npm run audit:cycles:update-baseline:", shrink);
    } else {
      console.log(`Dependency cycles match ${relativeBaseline}.`);
    }
  }
}
