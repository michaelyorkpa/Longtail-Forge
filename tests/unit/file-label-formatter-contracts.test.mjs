import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * How the Files page turns raw values into the words and tokens it shows.
 *
 * `0.33.33.43.13` typed seven formatters and changed **no executable line**. Six of them already
 * converted through `String(...)`, so `unknown` cost nothing; the seventh converts through
 * `Number(...)`, which behaves differently in one respect worth pinning.
 *
 * These are pure, so they are **run** rather than read. Each case fixes what the existing
 * conversion already did, so that a later annotation which quietly adds or moves one is refused.
 */

const source = createProjectTextReader().readText("public/js/files.js");

const LIFTED = [
  "formatToken", "scanStatusLabel", "reviewStateLabel", "visibleFileCountLabel",
  "fileTypeBadgeText", "safeFileTypeToken", "safeFileStateToken", "metadataText",
];

/** The formatters in a bare realm. They are pure, so nothing needs stubbing. */
function formatters() {
  const sandbox = vm.createContext({});
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), sandbox);

  return vm.runInContext(`({ ${LIFTED.join(", ")} })`, sandbox);
}

/**
 * What a call answered, or the **name** of the error it threw, so the two are comparable in one
 * assertion. The name rather than `instanceof`: these functions run in their own realm, so the
 * `TypeError` they throw is not this realm's `TypeError` and would fail every `instanceof` check.
 * @param {() => unknown} run
 */
function answered(run) {
  try {
    return run();
  } catch (error) {
    return error !== null && typeof error === "object" && "name" in error ? error.name : error;
  }
}

describe("A scan state becomes the words the page shows for it", () => {
  it("names the four states it knows", () => {
    const { scanStatusLabel } = formatters();

    assert.equal(scanStatusLabel("not_required"), "No review needed");
    assert.equal(scanStatusLabel("passed"), "Reviewed");
    assert.equal(scanStatusLabel("pending"), "Review pending");
    assert.equal(scanStatusLabel("error"), "Review needed");
  });

  it("falls back to a tidied token for a state it does not know", () => {
    const { scanStatusLabel } = formatters();

    assert.equal(scanStatusLabel("awaiting_manual_review"), "Awaiting Manual Review");
    assert.equal(scanStatusLabel("re-scanned"), "Re Scanned");
  });

  it("answers nothing at all for a falsy state, rather than a tidied empty string", () => {
    const { scanStatusLabel } = formatters();

    for (const value of [undefined, null, "", 0, false]) {
      assert.equal(scanStatusLabel(value), "", `${String(value)} must produce no label`);
    }
  });

  /**
   * The comparisons are `===`, so a value that merely *looks* like a state is not one - it falls
   * through to `formatToken`, which converts it with `String(...)` and therefore honours whatever
   * `toString` it carries. Both halves matter: the mapping is not consulted, and the conversion is
   * the ordinary one rather than something stricter this checkpoint might have been tempted to add.
   */
  it("does not match a lookalike, and converts it the ordinary way instead", () => {
    const { scanStatusLabel } = formatters();

    assert.equal(scanStatusLabel(new String("passed")), "Passed", "boxed, so not === \"passed\"");
    assert.equal(scanStatusLabel({ toString: () => "passed" }), "Passed", "a custom toString is honoured");
    assert.equal(scanStatusLabel(["passed"]), "Passed", "as is an array's own join-based one");
    assert.equal(scanStatusLabel({}), "[Object Object]", "and a plain object gets no special case");
  });
});

describe("A file in review says so; anything else is described by its scan state", () => {
  it("prefers the quarantined state over whatever the scan said", () => {
    const { reviewStateLabel } = formatters();

    assert.equal(reviewStateLabel("quarantined", "passed"), "In review");
    assert.equal(reviewStateLabel("quarantined", undefined), "In review");
  });

  it("otherwise delegates, passing the scan state through untouched", () => {
    const { reviewStateLabel } = formatters();

    assert.equal(reviewStateLabel("available", "pending"), "Review pending");
    assert.equal(reviewStateLabel(undefined, "not_required"), "No review needed");
    assert.equal(reviewStateLabel("available", undefined), "");
  });
});

describe("The visible-count label, and the one conversion in this group that throws", () => {
  it("counts in words, singular and plural", () => {
    const { visibleFileCountLabel } = formatters();

    assert.equal(visibleFileCountLabel(1), "1 file attachment visible");
    assert.equal(visibleFileCountLabel(2), "2 file attachments visible");
    assert.equal(visibleFileCountLabel(0), "0 file attachments visible", "none is plural");
  });

  it("says when more exist, and only then", () => {
    const { visibleFileCountLabel } = formatters();

    assert.equal(visibleFileCountLabel(3, { hasMore: true }), "3 file attachments visible. More available.");
    assert.equal(visibleFileCountLabel(3, { hasMore: false }), "3 file attachments visible");
    assert.equal(visibleFileCountLabel(3, {}), "3 file attachments visible");
  });

  it("treats a falsy count as none, because the || runs before the conversion", () => {
    const { visibleFileCountLabel } = formatters();

    for (const value of [undefined, null, "", false, Number.NaN]) {
      assert.equal(visibleFileCountLabel(value), "0 file attachments visible");
    }
  });

  /**
   * This is the asymmetry the checkpoint had to be careful about. Six of these formatters convert
   * with `String`, which **answers** for a symbol; this one converts with `Number`, which **throws**.
   * Both behaviours are the page's own and predate the annotations - the point of fixing them here
   * is that a later change which swaps one conversion for the other would be caught.
   */
  it("throws on a symbol, where its String-converting siblings answer", () => {
    const { visibleFileCountLabel, metadataText, safeFileTypeToken, fileTypeBadgeText } = formatters();
    const token = Symbol("seven");

    assert.equal(answered(() => visibleFileCountLabel(token)), "TypeError", "Number cannot convert a symbol");
    assert.equal(answered(() => metadataText(token)), "Symbol(seven)");
    assert.equal(answered(() => safeFileTypeToken(token)), "symbol-seven");
    assert.equal(answered(() => fileTypeBadgeText(token, "")), "SYMB");
  });
});

describe("The badge text a row shows for a file type", () => {
  it("prefers the extension, stripped of its dot and capped at four characters", () => {
    const { fileTypeBadgeText } = formatters();

    assert.equal(fileTypeBadgeText(".pdf", "application/pdf"), "PDF");
    assert.equal(fileTypeBadgeText("jpeg", ""), "JPEG");
    assert.equal(fileTypeBadgeText(".markdown", ""), "MARK", "four characters, no more");
  });

  it("falls back to the first word of the mime type, then to a generic", () => {
    const { fileTypeBadgeText } = formatters();

    assert.equal(fileTypeBadgeText("", "application/pdf"), "APPL");
    assert.equal(fileTypeBadgeText("", "  text/plain"), "TEXT");
    assert.equal(fileTypeBadgeText("", ""), "FILE");
    assert.equal(fileTypeBadgeText(undefined, undefined), "FILE");
  });

  /** `0` never reaches `String`, because `||` replaced it first. It has always produced "FILE". */
  it("treats a falsy argument as absent rather than converting it", () => {
    const { fileTypeBadgeText } = formatters();

    assert.equal(fileTypeBadgeText(0, 0), "FILE", "not \"0\"");
    assert.equal(fileTypeBadgeText(false, null), "FILE");
  });
});

describe("Type and state reduced to something safe for a class name", () => {
  it("slugs whatever it is given", () => {
    const { safeFileTypeToken, safeFileStateToken } = formatters();

    assert.equal(safeFileTypeToken("Application/PDF"), "application-pdf");
    assert.equal(safeFileTypeToken("  spaced  out  "), "spaced-out");
    assert.equal(safeFileStateToken("In Review"), "in-review");
  });

  it("keeps its own default for an absent or unusable value", () => {
    const { safeFileTypeToken, safeFileStateToken } = formatters();

    for (const value of [undefined, null, "", 0, false]) {
      assert.equal(safeFileTypeToken(value), "file");
      assert.equal(safeFileStateToken(value), "unknown");
    }
    assert.equal(safeFileTypeToken("***"), "file", "a value that slugs to nothing takes the default too");
    assert.equal(safeFileStateToken("***"), "unknown");
  });

  it("does not leave a leading or trailing separator behind", () => {
    const { safeFileTypeToken } = formatters();

    assert.equal(safeFileTypeToken("--pdf--"), "pdf");
    assert.equal(safeFileTypeToken("/pdf/"), "pdf");
  });
});

describe("One metadata value as the editor shows it", () => {
  it("trims what it was given and falls back when nothing is left", () => {
    const { metadataText } = formatters();

    assert.equal(metadataText("  1.2 MB  "), "1.2 MB");
    assert.equal(metadataText("   "), "Not recorded");
    assert.equal(metadataText(undefined), "Not recorded");
    assert.equal(metadataText(0), "Not recorded", "falsy is absent, not \"0\"");
  });

  it("answers the caller's own stand-in when one is given", () => {
    const { metadataText } = formatters();

    assert.equal(metadataText(null, "None"), "None");
    assert.equal(metadataText("", ""), "", "an empty stand-in is still the caller's choice");
  });

  /** The result stays a string, which is why `fallback` was not widened along with `value`. */
  it("always answers a string", () => {
    const { metadataText } = formatters();

    for (const value of [undefined, null, 0, 7, "x", true, {}, []]) {
      assert.equal(typeof metadataText(value), "string", `${String(value)} must still produce a string`);
    }
  });
});

describe("What the annotations claim about conversion", () => {
  it("adds none, and leaves each existing one spelled as it was", () => {
    for (const existing of [
      'const safeCount = Number\\(count \\|\\| 0\\);',
      'String\\(extension \\|\\| ""\\)',
      'String\\(fallback \\|\\| ""\\)',
      'String\\(value \\|\\| "file"\\)',
      'String\\(value \\|\\| "unknown"\\)',
      'String\\(value \\|\\| ""\\)\\.trim\\(\\)',
    ]) {
      assert.match(source, new RegExp(existing), "this conversion predates the annotations and must stay spelled this way");
    }
  });

  it("says why the one Number conversion is called out separately", () => {
    assert.match(
      source,
      /including that `Number` \*throws\* on a symbol,/,
      "the asymmetry with the String siblings is the thing a later reader needs",
    );
  });

  it("keeps the metadata fallback a string, and says why", () => {
    assert.match(source, /@param \{unknown\} value @param \{string\} \[fallback\] @returns \{string\}/);
    assert.match(
      source,
      /widening it would make the \*\*result\*\* unknown/,
      "the reason the fallback was not widened with the value",
    );
  });

  it("types the pagination reader by what it actually tests", () => {
    assert.match(source, /@param \{unknown\} count @param \{\{ hasMore\?: unknown \}\} \[pagination\]/);
  });
});
