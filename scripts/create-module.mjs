import path from "node:path";
import { fileURLToPath } from "node:url";
import { createModule } from "./lib/module-scaffold/index.mjs";

const args = process.argv.slice(2);
if (args.length !== 1 && !(args.length === 3 && args[1] === "--root")) {
  console.error("Usage: npm run module:create -- <module-id> [--root <repository-root>]");
  process.exitCode = 1;
} else {
  const root = args[2] ? path.resolve(args[2]) : fileURLToPath(new URL("../", import.meta.url));
  try {
    const files = await createModule(root, args[0]);
    console.log(`Created ${args[0]} (${files.length} files) in ${root}:\n${files.join("\n")}`);
    console.log("Next: implement module-owned storage, then run modules:registry:generate and the normal verification gates.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
