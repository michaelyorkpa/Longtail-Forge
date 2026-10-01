import fs from "node:fs";
import path from "node:path";
import {
  collectImportGraph,
  compareDependencyCycles,
  closingEdges,
  measureDependencyCycles,
  parseRenames,
  readDependencyCycleBaseline,
  serializeDependencyCycles,
} from "./lib/dependency-cycles.mjs";
import { firstPartyJavaScriptFiles } from "./typecheck-governance.mjs";

// The dependency-cycle ratchet (`0.33.33.47.1`). The default run reports every cycle, the edges that
// close it, and what would remain without them; `--check` refuses growth and asks for any shrinking to be recorded;
// `--update-baseline` records the current cycles, refusing growth even then. A renamed cycle member
// is declared with `--renamed old=new`, so it is not mistaken for a file joining a cycle.

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
const current = measureDependencyCycles(graph);
const relativeBaseline = path.relative(root, baselinePath).split(path.sep).join("/");

if (!check && !update) {
  const edgeCount = [...graph.edges.values()].reduce((total, edges) => total + edges.length, 0);
  console.log(`First-party import graph: ${files.length} files, ${edgeCount} internal edges.`);
  for (const [name, kinds] of /** @type {const} */ ([["static", ["static"]], ["staticAndDynamic", ["static", "dynamic"]]])) {
    const components = current[name];
    console.log(`${name}: ${components.length} cycle(s), ${components.reduce((total, component) => total + component.length, 0)} file(s) in cycles.`);
    components.forEach((component, index) => {
      const closing = closingEdges(graph, kinds, component);
      const left = closing.remaining.map((cycle) => cycle.length).join(", ") || "none";
      console.log(`  cycle ${index + 1}: ${component.length} files, closed by ${closing.edges.join(" or ")}; without it, the cycles left are ${left} file(s)`);
      closing.remaining.forEach((cycle, inner) => {
        console.log(`    left ${inner + 1}: ${cycle.join(", ")}`);
      });
    });
  }
  const computed = Object.entries(current.computedDynamicImports);
  console.log(`computed import() the measurement cannot see through: ${computed.length === 0 ? "none" : computed.map(([file, count]) => `${file} (${count})`).join(", ")}`);
} else if (!fs.existsSync(baselinePath)) {
  if (check) {
    console.error(`Missing ${relativeBaseline}; run npm run audit:cycles:update-baseline for the reviewed bootstrap.`);
    process.exitCode = 1;
  } else {
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, serializeDependencyCycles(current));
    console.log(`Recorded the initial ${relativeBaseline}.`);
  }
} else {
  const baseline = readDependencyCycleBaseline(fs.readFileSync(baselinePath, "utf8"));
  const renames = parseRenames(renameDeclarations, files);
  const { growth, shrink } = compareDependencyCycles(baseline, current, renames);
  if (growth.length > 0) {
    console.error(`Dependency cycles may not grow:\n${growth.map((entry) => `- ${entry}`).join("\n")}`);
    if (check) console.error("If a cycle member was only renamed, record it with npm run audit:cycles:update-baseline -- --renamed=old=new.");
    process.exitCode = 1;
  } else if (update) {
    fs.writeFileSync(baselinePath, serializeDependencyCycles(current));
    console.log(`Updated ${relativeBaseline}.${shrink.length > 0 ? ` Recorded shrinking:\n${shrink.map((entry) => `- ${entry}`).join("\n")}` : ""}`);
  } else if (serializeDependencyCycles(current) !== serializeDependencyCycles(baseline)) {
    console.error(`Dependency cycles shrank; record the smaller baseline with npm run audit:cycles:update-baseline:\n${shrink.map((entry) => `- ${entry}`).join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`Dependency cycles match ${relativeBaseline}.`);
  }
}
