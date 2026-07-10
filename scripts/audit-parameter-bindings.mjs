import fs from "node:fs/promises";
import path from "node:path";
import {
  buildParameterBindingBaseline,
  evaluateParameterBindingBaseline,
  formatParameterBindingAudit,
  scanParameterBindings,
  serializeParameterBindingBaseline,
} from "./lib/parameter-binding-audit.mjs";

const baselinePath = path.resolve("scripts/baselines/parameter-binding-baseline.json");
const args = new Set(process.argv.slice(2));
const allowedArgs = new Set(["--check", "--update-baseline"]);

for (const argument of args) {
  if (!allowedArgs.has(argument)) {
    throw new Error(`Unknown parameter-binding audit option: ${argument}.`);
  }
}
if (args.has("--check") && args.has("--update-baseline")) {
  throw new Error("Use --check or --update-baseline, not both.");
}

const report = scanParameterBindings();

if (args.has("--update-baseline")) {
  const baseline = buildParameterBindingBaseline(report);
  await fs.mkdir(path.dirname(baselinePath), { recursive: true });
  await fs.writeFile(baselinePath, serializeParameterBindingBaseline(baseline), "utf8");
  console.log(`Updated ${path.relative(process.cwd(), baselinePath).replaceAll("\\", "/")} with ${baseline.findings.length} reviewed finding(s).`);
  process.exit(0);
}

const baseline = JSON.parse(await fs.readFile(baselinePath, "utf8"));
const result = evaluateParameterBindingBaseline({ baseline, report });
console.log(formatParameterBindingAudit(result));

if (args.has("--check") && result.newViolations.length > 0) {
  process.exitCode = 1;
}
