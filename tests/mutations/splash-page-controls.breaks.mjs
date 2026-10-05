import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Run explicitly, with no server or other verification reading this source concurrently.
//
// **This file had no break campaign before `0.33.33.38.3.8`.** It is small - two controls and two
// fetches - and the checkpoint that prompted this only narrowed the two lookups, so the table is
// correspondingly small and is honest about that. The narrowings are runtime-inert while
// `views/public/index.html` renders what it renders; what the cases can attack is a narrowing that
// stops checking, one that demands a subtype the splash page never renders, and the absence
// handling that is the reason no refusal was added.

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the narrowings ----------------------------------------------------------------------------
  ["the version line stops being narrowed",
    "  const splashVersion = splashVersionElement instanceof HTMLElement ? splashVersionElement : null;",
    "  const splashVersion = splashVersionElement;"],
  ["the action stops being narrowed",
    "  const splashAction = splashActionElement instanceof HTMLAnchorElement ? splashActionElement : null;",
    "  const splashAction = splashActionElement;"],
  ["the action demands a button, which this page does not render",
    "splashActionElement instanceof HTMLAnchorElement",
    "splashActionElement instanceof HTMLButtonElement"],
  ["the version line demands an anchor",
    "splashVersionElement instanceof HTMLElement",
    "splashVersionElement instanceof HTMLAnchorElement"],

  // --- the absence handling that makes a refusal unnecessary --------------------------------------
  ["the version write stops tolerating an absent line",
    "      if (splashVersion && displayVersion) {",
    "      if (displayVersion) {"],
  ["the action work stops tolerating an absent action",
    "    if (!splashAction) {\n      return;\n    }",
    "    if (false) {\n      return;\n    }"],
];

runMutationCampaign({
  sourcePath: "public/js/splash.js",
  suites: ["tests/unit/remaining-page-control-narrowing.test.mjs"],
  cases: cases.map(([name, find, replace]) => ({ name, find, replace })),
  suiteTimeoutMs: 60000,
});
