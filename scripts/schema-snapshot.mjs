import {
  checkGeneratedSchema,
  collectSchemaWorkflowGuardErrors,
  refreshGeneratedSchema,
} from "./lib/migration-schema-workflow.mjs";
import { collectChangedPaths } from "./lib/regression-change-routing.mjs";

const options = parseOptions(process.argv.slice(2));
const guardErrors = collectSchemaWorkflowGuardErrors({
  allowSchemaWithoutMigration: options.allowSchemaWithoutMigration,
  changedPaths: collectChangedPaths(),
});
if (guardErrors.length > 0) {
  throw new Error(guardErrors.join("\n"));
}

if (options.mode === "refresh") {
  const result = await refreshGeneratedSchema();
  console.log(`Refreshed src/db/schema/current.generated.sql from the baseline plus ${result.migrations.length} migration(s).`);
} else {
  const result = await checkGeneratedSchema();
  if (!result.matches) {
    throw new Error("Schema snapshot drift detected. Run npm run db:schema:refresh and review the generated schema diff.");
  }
  console.log(`Schema snapshot is current (${result.migrations.length} migration(s)).`);
}

function parseOptions(args) {
  const allowed = new Set(["--refresh", "--check", "--allow-schema-without-migration"]);
  for (const argument of args) {
    if (!allowed.has(argument)) {
      throw new Error(`Unknown schema snapshot option: ${argument}.`);
    }
  }
  const modeArgs = args.filter((argument) => argument === "--refresh" || argument === "--check");
  if (modeArgs.length !== 1) {
    throw new Error("Use exactly one of --refresh or --check.");
  }
  return {
    allowSchemaWithoutMigration: args.includes("--allow-schema-without-migration"),
    mode: modeArgs[0].slice(2),
  };
}
