import { appendFileSync } from "node:fs";
import { collectPullRequestChangeClassification } from "./lib/pull-request-change-classification.mjs";

const args = process.argv.slice(2);
if (args.some((argument) => !["--github-output", "--json"].includes(argument)) || new Set(args).size !== args.length) {
  throw new Error("Usage: node scripts/classify-pull-request-changes.mjs [--github-output] [--json]");
}

const classification = collectPullRequestChangeClassification();

if (args.includes("--json")) {
  console.log(JSON.stringify(classification, null, 2));
} else {
  console.log(classification.summary);
  for (const entry of classification.entries) {
    console.log(`- ${entry.status}: ${entry.paths.join(" -> ")}`);
  }
}

if (args.includes("--github-output")) {
  const outputPath = String(process.env.GITHUB_OUTPUT || "").trim();
  if (!outputPath) {
    throw new Error("GITHUB_OUTPUT is required with --github-output.");
  }
  appendFileSync(
    outputPath,
    [
      `docs_only=${classification.docsOnly}`,
      `changed_entries=${classification.entries.length}`,
      "",
    ].join("\n"),
    "utf8",
  );
}
