import {
  inspectThirdPartyNotices,
  writeThirdPartyNotices,
} from "./lib/third-party-notices.mjs";

const write = process.argv[2] === "--write";
if (process.argv.length > (write ? 3 : 2)) {
  throw new Error("Usage: node scripts/check-third-party-notices.mjs [--write]");
}

if (write) {
  const result = writeThirdPartyNotices();
  console.log(`Wrote THIRD_PARTY_NOTICES.md for ${result.componentCount} shipped components/assets.`);
} else {
  const result = inspectThirdPartyNotices();
  console.log(result.message);
  if (!result.current) {
    process.exitCode = 1;
  }
}
