import { initializeDatabase } from "../src/db/index.js";
import { searchIndexRebuildService } from "../src/services/search-index-rebuild.service.js";

const args = parseArgs(process.argv.slice(2));

if (!args.allWorkspaces && !args.workspaceId) {
  printUsageAndExit();
}

await initializeDatabase();

const result = args.allWorkspaces
  ? await searchIndexRebuildService.rebuildApp({
      dryRun: args.dryRun,
      moduleId: args.moduleId,
      source: "local-script",
    })
  : await searchIndexRebuildService.rebuildWorkspace({
      audit: false,
      dryRun: args.dryRun,
      moduleId: args.moduleId,
      source: "local-script",
      workspaceId: args.workspaceId,
    });

console.log(JSON.stringify(result, null, 2));

function parseArgs(values) {
  const parsed = {
    allWorkspaces: false,
    dryRun: false,
    moduleId: "",
    workspaceId: "",
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === "--all-workspaces") {
      parsed.allWorkspaces = true;
    } else if (value === "--dry-run") {
      parsed.dryRun = true;
    } else if (value === "--workspace") {
      parsed.workspaceId = String(values[index + 1] || "").trim();
      index += 1;
    } else if (value === "--module") {
      parsed.moduleId = String(values[index + 1] || "").trim();
      index += 1;
    } else if (value === "--help" || value === "-h") {
      printUsageAndExit(0);
    }
  }

  return parsed;
}

function printUsageAndExit(code = 1) {
  console.log([
    "Usage:",
    "  node scripts/search-index-rebuild.mjs --workspace <workspace_id> [--module <module_id>] [--dry-run]",
    "  node scripts/search-index-rebuild.mjs --all-workspaces [--module <module_id>] [--dry-run]",
  ].join("\n"));
  process.exit(code);
}
