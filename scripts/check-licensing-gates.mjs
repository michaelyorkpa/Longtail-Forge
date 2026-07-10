import {
  formatLicensingGateReport,
  inspectLicensingGates,
} from "./lib/licensing-gates.mjs";

if (process.argv.length > 2) {
  throw new Error("Usage: node scripts/check-licensing-gates.mjs");
}

console.log(formatLicensingGateReport(inspectLicensingGates()));
