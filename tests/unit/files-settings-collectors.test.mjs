import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * The Files settings collectors, and the one executable line `0.33.33.43.4` changed.
 *
 * Five of that checkpoint's six diagnostics were annotations the compiler proves. **One line
 * changed**: `Number.parseInt(value, 10)` became ``Number.parseInt(`${value}`, 10)``, because the
 * parameter is now `unknown` and `parseInt` wants a string.
 *
 * That line is the reason this suite exists. The obvious spelling - `String(value)` - is **not**
 * the conversion `parseInt` performs. `parseInt` does `ToString`, which throws on a symbol;
 * `String()` has a special case that answers `"Symbol(x)"` instead. So `String(value)` would have
 * turned a throw into a quiet `null`. A template literal is `ToString`, so it throws exactly where
 * the raw call threw and agrees with it everywhere else. The cases below hold that.
 *
 * The three collectors are pure and close over nothing, so they lift cleanly.
 */

const source = createProjectTextReader().readText("public/js/files-settings.js");

const LIFTED = ["parseExtensions", "nullableInteger", "formatBytes"];

function collectors() {
  const sandbox = vm.createContext({});
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), sandbox);

  return vm.runInContext(`({ ${LIFTED.join(", ")} })`, sandbox);
}

describe("The storage limit collector keeps parseInt's own conversion", () => {
  it("reads the values the settings form actually supplies", () => {
    const { nullableInteger } = collectors();

    assert.equal(nullableInteger("1024"), 1024);
    assert.equal(nullableInteger("0"), 0);
    assert.equal(nullableInteger(" 12"), 12, "leading space is what parseInt already skipped");
  });

  it("answers null for the three values the form uses to mean unset", () => {
    const { nullableInteger } = collectors();

    assert.equal(nullableInteger(""), null);
    assert.equal(nullableInteger(null), null);
    assert.equal(nullableInteger(undefined), null);
  });

  it("refuses a negative or unparseable limit rather than storing it", () => {
    const { nullableInteger } = collectors();

    assert.equal(nullableInteger("-1"), null);
    assert.equal(nullableInteger("nonsense"), null);
    assert.equal(nullableInteger({}), null);
    assert.equal(nullableInteger(true), null);
  });

  /**
   * The case the conversion choice turns on. `String(value)` would answer `null` here, which reads
   * as "unset" - a value the caller would then save. The raw call threw, and so must this one.
   */
  it("still throws on a symbol, exactly as the untyped call did", () => {
    const { nullableInteger } = collectors();

    // Checked by `name`, not `instanceof`: the error is constructed in the lifted function's own
    // realm, so it is not an instance of this realm's TypeError. The engine's message text is
    // deliberately not pinned.
    let thrown = null;
    try {
      nullableInteger(Symbol("limit"));
    } catch (error) {
      thrown = error;
    }

    assert.ok(thrown, "a symbol must still throw rather than reading as unset");
    assert.equal(/** @type {Error} */ (thrown).name, "TypeError");
  });

  it("agrees with the untyped call on every value that is not a symbol", () => {
    const { nullableInteger } = collectors();
    const raw = (/** @type {never} */ value) => {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    };

    for (const value of ["42", "0", " 12px", "0x1f", 42, 1e21, [7], {}, true, "-3"]) {
      if (value === "" || value === null || value === undefined) continue;
      assert.equal(
        nullableInteger(value),
        raw(/** @type {never} */ (value)),
        `disagreed on ${String(value)}`,
      );
    }
  });
});

describe("The extension collector reads whatever the form holds", () => {
  it("splits on commas and whitespace and drops the empties", () => {
    const { parseExtensions } = collectors();

    assert.deepEqual([...parseExtensions("pdf, png,  jpg")], ["pdf", "png", "jpg"]);
    // Whitespace with no comma, because the comma-separated case cannot tell the two separators
    // apart: `trim()` cleans up the spaces either way, so only this input proves `\s` is read.
    assert.deepEqual([...parseExtensions("pdf png")], ["pdf", "png"]);
    assert.deepEqual([...parseExtensions("pdf\tpng\njpg")], ["pdf", "png", "jpg"]);
    assert.deepEqual([...parseExtensions("")], []);
    assert.deepEqual([...parseExtensions(null)], []);
    assert.deepEqual([...parseExtensions(undefined)], []);
  });

  it("coerces a value that is not a string rather than refusing it", () => {
    const { parseExtensions } = collectors();

    assert.deepEqual([...parseExtensions(42)], ["42"]);
    assert.deepEqual([...parseExtensions(["pdf", "png"])], ["pdf", "png"]);
  });
});

describe("The byte readout formats what the accounting record carries", () => {
  it("names each magnitude", () => {
    const { formatBytes } = collectors();

    assert.equal(formatBytes(0), "0 B");
    assert.equal(formatBytes(512), "512 B");
    assert.equal(formatBytes(2048), "2 KB");
    assert.equal(formatBytes(5 * 1024 * 1024), "5.0 MB");
  });

  it("treats an unusable value as no usage rather than rendering NaN", () => {
    const { formatBytes } = collectors();

    assert.equal(formatBytes(null), "0 B");
    assert.equal(formatBytes(undefined), "0 B");
    assert.equal(formatBytes("nonsense"), "0 B");
  });
});

describe("The source decisions this checkpoint made", () => {
  it("converts through a template rather than String, which is a different conversion", () => {
    assert.match(
      source,
      /const parsed = Number\.parseInt\(`\$\{value\}`, 10\);/,
      "String(value) would turn a symbol's throw into a quiet null",
    );
    assert.doesNotMatch(source, /Number\.parseInt\(String\(value\), 10\)/);
  });

  it("carries the settings catalogue as unknown and never reads a member of it", () => {
    assert.match(source, /@type \{unknown\}\s*\n\s*\*\/\s*\n\s*let settingsCatalog = null;/);

    const reads = source.match(/settingsCatalog\s*\.\s*[A-Za-z_]/g);
    assert.equal(reads, null, "a member read would be a claim this page never validates");
    assert.match(
      source,
      /attachmentSections\(settingsCatalog, "module", "files"\)/,
      "the catalogue is handed over unread, which is why unknown is the accurate type",
    );
  });

  it("annotates rather than asserts", () => {
    assert.doesNotMatch(
      source,
      /\/\*\* @type \{[^}]*\} \*\/ \(settingsCatalog\)/,
      "the catalogue must not be cast into a shape nothing checked",
    );
  });
});
