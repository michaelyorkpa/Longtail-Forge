import {
  collectChangedPaths,
  formatDocsSuggestion,
  suggestDocsForPaths,
} from "./lib/docs-change-routing.mjs";

const options = parseOptions(process.argv.slice(2));
const result = suggestDocsForPaths(collectChangedPaths(), { note: options.note });

console.log(formatDocsSuggestion(result, { check: options.check }));

function parseOptions(args) {
  let check = false;
  let note = "";

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--check") {
      check = true;
    } else if (argument === "--note") {
      note = args[index + 1] || "";
      index += 1;
    } else if (argument.startsWith("--note=")) {
      note = argument.slice("--note=".length);
    } else {
      throw new Error(`Unknown documentation suggestion option: ${argument}.`);
    }
  }

  return { check, note };
}
