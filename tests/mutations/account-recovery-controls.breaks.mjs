import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Run explicitly, with no server or other verification reading this source concurrently.
//
// **This file had no break campaign before `0.33.33.38.3.8`.** The checkpoint narrowed its two
// buttons and changed nothing else, so the table holds the narrowing and the absence handling that
// is the reason no refusal was added - not the export flow, which this checkpoint did not touch.

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the narrowing ------------------------------------------------------------------------------
  ["the buttons stop being narrowed",
    "    return element instanceof HTMLButtonElement ? element : null;",
    "    return element;"],
  ["the buttons are asserted rather than checked",
    "    return element instanceof HTMLButtonElement ? element : null;",
    "    return /** @type {HTMLButtonElement | null} */ (element);"],
  ["the buttons demand an anchor, which this page does not render",
    "    return element instanceof HTMLButtonElement ? element : null;",
    "    return element instanceof HTMLAnchorElement ? element : null;"],
  ["no control is ever accepted",
    "    return element instanceof HTMLButtonElement ? element : null;",
    "    return null;"],

  // --- the absence handling that makes a refusal unnecessary --------------------------------------
  ["the export button stops tolerating absence at its wiring",
    "  downloadButton?.addEventListener(\"click\", async () => {",
    "  downloadButton.addEventListener(\"click\", async () => {"],
  ["the logout button stops tolerating absence at its wiring",
    "  logoutButton?.addEventListener(\"click\", async () => {",
    "  logoutButton.addEventListener(\"click\", async () => {"],
];

runMutationCampaign({
  sourcePath: "public/js/account-recovery.js",
  suites: ["tests/unit/remaining-page-control-narrowing.test.mjs"],
  cases: cases.map(([name, find, replace]) => ({ name, find, replace })),
  suiteTimeoutMs: 60000,
});
