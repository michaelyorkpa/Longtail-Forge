import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";

// Run explicitly, with no server or other verification reading this source concurrently - and that
// means *any* access, including a `git diff`, per the lesson `0.33.33.43.12` paid for.
//
// **Aimed at `file-label-formatter-contracts.test.mjs`.** `0.33.33.43.13` typed seven formatters and
// changed **no executable line**. Six already converted through `String(...)` and one through
// `Number(...)`, so the table attacks the two things that matter: the mappings themselves, and the
// conversions - swapping one for another, moving it across the `||`, or dropping it entirely.
//
// Anchors stay inside the function under attack, per the lesson `0.33.33.43.7` paid for.
//
// **Dispositioned, not listed.** Widening `metadataText`'s `fallback` to `unknown` is not a case
// here: it makes the *return* unknown and lights up this function's readers, so the compiler owns
// it and the ledger is where it lands. Listing it would credit the suite for a compiler catch.
//
// **An equivalent, and the finding behind it.** Replacing `scanStatusLabel`'s last line,
// `return scanStatus ? formatToken(scanStatus) : "";`, with a bare `return formatToken(scanStatus);`
// survived - correctly, because the two are **the same function**. The truthy path is the identical
// call, and every falsy value (`undefined`, `null`, `""`, `0`, `-0`, `false`, `NaN`, `0n`) reaches
// `formatToken`'s own `String(value || "")` and comes back `""` regardless. So **that ternary is
// dead code**: the guard it performs was already performed one call down.
//
// It is recorded rather than removed. This checkpoint's boundary is typing, and it changed no
// executable line; deleting the ternary would be a behaviour-preserving simplification, but it
// belongs to whoever next owns these formatters - most naturally alongside `formatToken` itself,
// which is still implicitly `any` and was deliberately left outside `0.33.33.43.13`'s boundary.
// No contrived case is added to manufacture a catch the suite cannot honestly make.

/** @type {[string, string, string][]} name, find, replace */
const cases = [
  // --- the conversions, which all predate this checkpoint -------------------------------------------
  ["the count is converted with String instead of Number",
    "    const safeCount = Number(count || 0);",
    '    const safeCount = String(count || 0);'],
  ["the count conversion moves inside the fallback, so a symbol no longer throws",
    "    const safeCount = Number(count || 0);",
    "    const safeCount = Number(count) || 0;"],
  ["the badge converts through a template, which throws where String answered",
    '    const normalizedExtension = String(extension || "").replace(/^\\./, "").trim().toUpperCase();',
    '    const normalizedExtension = `${extension || ""}`.replace(/^\\./, "").trim().toUpperCase();'],
  ["the type token stops converting a falsy value to its default",
    '    return String(value || "file")',
    '    return String(value ?? "file")'],
  ["the state token borrows the type token's default",
    '    return String(value || "unknown")',
    '    return String(value || "file")'],
  ["the metadata reader stops trimming",
    '    const text = String(value || "").trim();\n\n    return text || fallback;',
    '    const text = String(value || "");\n\n    return text || fallback;'],
  ["the metadata reader keeps a whitespace-only value instead of falling back",
    '    const text = String(value || "").trim();\n\n    return text || fallback;',
    '    const text = String(value || "");\n\n    return text.trim() === "" ? text : text;'],

  // --- the scan-state mapping ----------------------------------------------------------------------
  ["a state the page knows is tidied rather than named",
    '    if (scanStatus === "not_required") {\n      return "No review needed";\n    }',
    '    if (false) {\n      return "No review needed";\n    }'],
  ["passed and pending swap their words",
    '    if (scanStatus === "passed") {\n      return "Reviewed";\n    }',
    '    if (scanStatus === "passed") {\n      return "Review pending";\n    }'],
  ["an unknown state answers empty instead of a tidied token",
    '    return scanStatus ? formatToken(scanStatus) : "";',
    '    return "";'],
  ["the comparison loosens, so a boxed lookalike matches",
    '    if (scanStatus === "passed") {',
    "    if (scanStatus == \"passed\") {"],

  // --- review state --------------------------------------------------------------------------------
  // The three-line guard alone is ambiguous: `fileStateLabel` opens with a byte-identical block.
  // Carrying the delegation line keeps the anchor unique and inside the function under attack.
  ["quarantined stops outranking the scan state",
    '    if (status === "quarantined") {\n      return "In review";\n    }\n\n    return scanStatusLabel(scanStatus);',
    '    if (false) {\n      return "In review";\n    }\n\n    return scanStatusLabel(scanStatus);'],
  ["the review label stops delegating",
    "    return scanStatusLabel(scanStatus);",
    '    return "";'],

  // --- the visible-count wording -------------------------------------------------------------------
  ["one attachment is described in the plural",
    '    const label = `${safeCount} file attachment${safeCount === 1 ? "" : "s"} visible`;',
    '    const label = `${safeCount} file attachments visible`;'],
  ["the more-available suffix is always shown",
    "    return pagination.hasMore ? `${label}. More available.` : label;",
    "    return `${label}. More available.`;"],

  // --- the badge's precedence and shape ------------------------------------------------------------
  ["the mime fallback outranks the real extension",
    "    return (normalizedExtension || normalizedFallback).slice(0, 4).toUpperCase();",
    "    return (normalizedFallback || normalizedExtension).slice(0, 4).toUpperCase();"],
  ["the badge stops being capped at four characters",
    "    return (normalizedExtension || normalizedFallback).slice(0, 4).toUpperCase();",
    "    return (normalizedExtension || normalizedFallback).toUpperCase();"],
  ["the generic fallback disappears",
    '    const normalizedFallback = String(fallback || "").split(/[\\s/.-]+/).find(Boolean) || "File";',
    '    const normalizedFallback = String(fallback || "").split(/[\\s/.-]+/).find(Boolean) || "";'],

  // --- the slug's trimming -------------------------------------------------------------------------
  ["the type token keeps its leading and trailing separators",
    '      .replace(/[^a-z0-9]+/g, "-")\n      .replace(/^-+|-+$/g, "") || "file";',
    '      .replace(/[^a-z0-9]+/g, "-") || "file";'],
];

runMutationCampaign({
  sourcePath: "public/js/files.js",
  suites: ["tests/unit/file-label-formatter-contracts.test.mjs"],
  cases: cases.map(([name, find, replace]) => ({ name, find, replace })),
  suiteTimeoutMs: 60000,
});
