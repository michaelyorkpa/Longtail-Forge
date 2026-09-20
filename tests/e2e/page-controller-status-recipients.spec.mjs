import { expect, test } from "./support/isolated-workspace.mjs";

/** @typedef {import("../../src/types/browser-contracts.js").BrowserStatusRecipient} StatusRecipient */

/**
 * The recipients `pageController.setStatus` actually supports, in a real document.
 *
 * `0.33.33.39.35` corrected the declaration from `HTMLElement` to the capability the writer uses
 * - a node it sets `textContent` on and an element it writes `dataset` to - and from a `string`
 * message to the opaque one it never converts. Only a real document can answer whether an SVG
 * element takes both writes, and what its own `textContent` setter does with a value: the DOM
 * double stores whatever it is handed and models neither.
 */
test("setStatus writes the message and the tone to HTML and SVG recipients alike", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/tasks.html");
  await expect.poll(() => page.evaluate(() => typeof globalThis.window.LongtailForge?.pageController?.setStatus)).toBe("function");

  const observed = await page.evaluate(() => {
    const controller = globalThis.window.LongtailForge?.pageController;
    if (!controller) throw new Error("Page controller unavailable");
    const doc = globalThis.document;

    /** @param {StatusRecipient} element @param {unknown} message @param {{ isError?: boolean }} [options] */
    const read = (element, message, options) => {
      controller.setStatus(element, message, options);
      return { text: element.textContent, tone: element.dataset.statusTone, children: element.childNodes.length };
    };

    /** @param {() => unknown} build */
    const failure = (build) => {
      try {
        build();
        return "no error";
      } catch (error) {
        return error instanceof Error ? error.name : typeof error;
      }
    };

    const paragraph = doc.createElement("p");
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    const svgText = doc.createElementNS("http://www.w3.org/2000/svg", "text");
    svg.append(svgText);
    doc.body.append(paragraph, svg);

    const htmlSaved = read(paragraph, "Saved", { isError: false });
    const htmlError = read(paragraph, "Could not save", { isError: true });
    const htmlCleared = read(paragraph, "");
    const svgSaved = read(svgText, "Saved", { isError: true });
    const svgCleared = read(svgText, null);

    return {
      htmlSaved,
      htmlError,
      htmlCleared,
      svgSaved,
      svgCleared,
      isSvg: svgText instanceof globalThis.SVGElement && !(svgText instanceof globalThis.HTMLElement),
      number: read(paragraph, 42).text,
      object: read(paragraph, { toString: () => "from an object" }).text,
      falsy: [undefined, false, 0, Number.NaN].map((message) => read(paragraph, message).text),
      symbol: failure(() => controller.setStatus(paragraph, Symbol("message"))),
      toneAfterSymbol: paragraph.dataset.statusTone,
      absent: failure(() => controller.setStatus(null, "Saved")),
      absentUndefined: failure(() => controller.setStatus(undefined, Symbol("never converted"))),
    };
  });

  // An HTML recipient takes both writes, and an empty message clears the line rather than
  // writing a word into it.
  expect(observed.htmlSaved).toEqual({ text: "Saved", tone: "", children: 1 });
  expect(observed.htmlError).toEqual({ text: "Could not save", tone: "error", children: 1 });
  expect(observed.htmlCleared).toEqual({ text: "", tone: "", children: 0 });

  // An SVG recipient takes exactly the same two writes, which the old `HTMLElement` declaration
  // refused while the browser accepted them.
  expect(observed.isSvg).toBe(true);
  expect(observed.svgSaved).toEqual({ text: "Saved", tone: "error", children: 1 });
  expect(observed.svgCleared).toEqual({ text: "", tone: "", children: 0 });

  // The setter is the conversion, so an object takes its `toString` and a Symbol still throws.
  expect(observed.number).toBe("42");
  expect(observed.object).toBe("from an object");
  expect(observed.falsy).toEqual(["", "", "", ""]);
  expect(observed.symbol).toBe("TypeError");
  // The tone is not reached when the message fails at the setter.
  expect(observed.toneAfterSymbol).toBe("");

  // A missing recipient is still a no-op, and converts nothing.
  expect(observed.absent).toBe("no error");
  expect(observed.absentUndefined).toBe("no error");
});
