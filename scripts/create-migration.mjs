import { createMigrationFile } from "./lib/migration-schema-workflow.mjs";

const args = process.argv.slice(2);
if (args.length !== 1) {
  throw new Error("Usage: npm run db:migration:create -- <name>");
}

const migration = await createMigrationFile(args[0]);
console.log(`Created ${migration.relativePath}`);
console.log("Next: add the forward-only change, refresh the schema snapshot, and run the database checks.");
