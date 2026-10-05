// Behavioural contract for the source measurement that replaced the retired
// physical active-owner line ceiling at 0.33.33.30.8.
//
// The point of the structural figure is that it stays meaningful while a
// full-strict conversion adds annotations. These cases prove it actually does:
// commentary moves the physical count and not the structural one, real code
// moves both, comment-like text inside strings and templates is counted as the
// source it is, and line endings do not change the logical result.
//
// That last pair matters because the measurement is lexical, not textual. A
// regular expression stripping comments cannot tell `//` inside a template from
// a comment, which is exactly why this uses a real tokenizer.

import { describe, expect, it } from "vitest";
import { measureSource } from "../../scripts/lib/regression-source-measure.mjs";

const BASE = [
  "const first = 1;",
  "const second = 2;",
].join("\n");

describe("regression source measurement", () => {
  it("counts every newline-delimited line as a physical line", () => {
    const measurement = measureSource(`${BASE}\n`);

    expect(measurement.physicalLines).toBe(2);
    expect(measurement.structuralLines).toBe(2);
  });

  it("does not let comment-only growth change the structural measurement", () => {
    const before = measureSource(`${BASE}\n`);
    const commented = [
      "// a leading explanation",
      "/**",
      " * A JSDoc block of the kind full-strict conversion adds everywhere.",
      " * @returns {void}",
      " */",
      BASE,
      "",
    ].join("\n");
    const after = measureSource(commented);

    expect(after.physicalLines).toBe(before.physicalLines + 5);
    expect(after.structuralLines).toBe(before.structuralLines);
  });

  it("does let a real statement change the structural measurement", () => {
    const before = measureSource(`${BASE}\n`);
    const after = measureSource(`${BASE}\nconst third = 3;\n`);

    expect(after.physicalLines).toBe(before.physicalLines + 1);
    expect(after.structuralLines).toBe(before.structuralLines + 1);
  });

  it("counts comment-like text inside strings and templates as source", () => {
    const measurement = measureSource([
      'const single = "// not a comment";',
      "const block = \"/* also not a comment */\";",
      "const spanning = `template",
      "with // still not a comment",
      "across lines`;",
      "",
    ].join("\n"));

    // Every line here bears a token: the two literals, and all three lines the
    // template spans. A regex comment stripper would have discarded the fourth.
    expect(measurement.physicalLines).toBe(5);
    expect(measurement.structuralLines).toBe(5);
  });

  it("treats LF and CRLF as the same logical source", () => {
    const source = [
      "// commentary",
      "const value = `line one",
      "line two`;",
      "",
    ].join("\n");
    const lineFeed = measureSource(source);
    const carriageReturn = measureSource(source.replace(/\n/g, "\r\n"));

    expect(carriageReturn).toEqual(lineFeed);
    expect(lineFeed.physicalLines).toBe(3);
    expect(lineFeed.structuralLines).toBe(2);
  });

  it("reports which file failed when a source cannot be tokenized", () => {
    // A tokenizer does not care about grammar, so an unbalanced parenthesis
    // tokenizes cleanly. Only a lexical fault such as an unterminated template
    // can fail here, and the file must be named when it does.
    expect(() => measureSource("const broken = `open", "scripts/example.mjs"))
      .toThrow(/scripts\/example\.mjs could not be tokenized/);
  });
});
