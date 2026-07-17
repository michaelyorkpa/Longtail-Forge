#!/usr/bin/env node

import { closeDatabase, initializeWorkerDatabase } from "../src/db/index.js";
import { workspacePurgeService } from "../src/services/workspace-purge.service.js";
import { fileURLToPath } from "node:url";

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error?.message || error);
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}

async function main(args) {
  const options = parseCli(args);
  if (options.help) {
    printUsage();
    return;
  }

  await initializeWorkerDatabase();
  const result = await workspacePurgeService.queueWorkspacePurge({
    source: "operator-maintenance-cli",
    workspaceId: options.workspaceId,
  });
  console.log(JSON.stringify({
    action: result.alreadyComplete ? "already-complete" : "queued",
    jobId: result.jobId || null,
    queueAction: result.queueAction || null,
    status: result.status,
  }, null, 2));
}

function parseCli(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--workspace-id") {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error("--workspace-id requires a value.");
      options.workspaceId = value;
    } else {
      throw new Error(`Unknown workspace purge option: ${argument}`);
    }
  }
  if (!options.help && !options.workspaceId) {
    throw new Error("workspace purge requires --workspace-id <id>.");
  }
  return options;
}

function printUsage() {
  console.log("Usage: npm run workspace:purge -- --workspace-id <id>");
  console.log("Queues the irreversible purge only after the workspace deletion grace period has expired.");
}

export { parseCli };
