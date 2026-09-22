import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Run explicitly, with no server or other verification reading this source concurrently.
//
// **Honest about its size and its reason.** `0.33.33.43.4` cleared six diagnostics, five of which
// were annotations the compiler proves. **One executable line changed**, and the first case below
// is the whole point of this table: `String(value)` is the tempting spelling and is a different
// conversion from the one `parseInt` performs, so it would turn a symbol's throw into a quiet
// `null` that reads as "unset". The rest hold the collector behaviour those annotations describe.

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the one executable line, and the wrong fix for it -------------------------------------------
  ["the conversion becomes String, which swallows a symbol that used to throw",
    "    const parsed = Number.parseInt(`${value}`, 10);",
    "    const parsed = Number.parseInt(String(value), 10);"],
  ["the limit stops being parsed as decimal",
    "    const parsed = Number.parseInt(`${value}`, 10);",
    "    const parsed = Number.parseInt(`${value}`);"],

  // --- the unset vocabulary the three sentinels carry ----------------------------------------------
  //
  // **Three attacks on this guard are equivalent mutations and are deliberately not in the table.**
  // Removing the `""` arm, and replacing the whole condition with `false`, both leave every answer
  // unchanged: each sentinel falls through to `parseInt` - `""`, `"null"` and `"undefined"` all
  // parse to `NaN` - and `NaN >= 0` is false, so the function still returns `null`. The guard is
  // **defensive, not load-bearing**; it states the intent early rather than changing an outcome.
  // A case for it would have to assert an internal path rather than a behaviour. Recorded here
  // instead of chased, and `if (true)` is kept below because that one does change answers.
  ["every value reads as unset",
    '    if (value === "" || value === null || value === undefined) {',
    "    if (true) {"],

  // --- the limit the collector will actually store -------------------------------------------------
  //
  // Dropping `Number.isFinite(parsed)` is likewise **equivalent**: `parseInt` answers either `NaN`
  // or a finite number, never `Infinity`, and `NaN >= 0` is already false. `>= 0` alone decides
  // every reachable case, so that case is not in the table either.
  ["a negative limit is stored",
    "    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;",
    "    return Number.isFinite(parsed) ? parsed : null;"],
  ["zero stops being a real limit",
    "    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;",
    "    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;"],

  // --- the extension list ---------------------------------------------------------------------------
  ["extensions stop splitting on whitespace",
    "    return String(value || \"\").split(/[\\s,]+/).map((item) => item.trim()).filter(Boolean);",
    '    return String(value || "").split(/[,]+/).map((item) => item.trim()).filter(Boolean);'],
  ["empty entries survive the split",
    "    return String(value || \"\").split(/[\\s,]+/).map((item) => item.trim()).filter(Boolean);",
    '    return String(value || "").split(/[\\s,]+/).map((item) => item.trim());'],
  ["an absent field stops collapsing to an empty list",
    "    return String(value || \"\").split(/[\\s,]+/).map((item) => item.trim()).filter(Boolean);",
    "    return String(value).split(/[\\s,]+/).map((item) => item.trim()).filter(Boolean);"],

  // --- the byte readout ------------------------------------------------------------------------------
  //
  // Dropping `|| 0` is **equivalent** too, for the same reason: `Number(undefined)` is `NaN`,
  // `Number("nonsense")` is `NaN`, and the `!bytes` line below already answers `"0 B"` for `NaN`
  // exactly as it does for `0`. The fallback restates the intent; it does not decide an outcome.
  ["kilobytes and bytes swap their boundary",
    "    if (bytes < 1024) return `${bytes} B`;",
    "    if (bytes < 1024 * 1024) return `${bytes} B`;"],
  ["megabytes lose their decimal",
    "    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;",
    "    return `${Math.round(bytes / 1024 / 1024)} MB`;"],

  // --- the catalogue this page deliberately does not read --------------------------------------------
  ["the catalogue is cast into a shape nothing checked",
    '      requireSettingsHost().attachmentSections(settingsCatalog, "module", "files"),',
    '      requireSettingsHost().attachmentSections(/** @type {{sections: unknown[]}} */ (settingsCatalog).sections, "module", "files"),'],
];

runMutationCampaign({
  sourcePath: "public/js/files-settings.js",
  suites: ["tests/unit/files-settings-collectors.test.mjs"],
  cases: cases.map(([name, find, replace]) => ({ name, find, replace })),
  suiteTimeoutMs: 60000,
});
