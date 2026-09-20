import { expect, test } from "./support/isolated-workspace.mjs";

/**
 * The recipients `pageController.setStatus` actually writes to, in a real document.
 *
 * `0.33.33.39.35` corrected the declaration from `HTMLElement` to a recipient capability and to
 * the opaque message the writer never converts. `0.33.33.39.37` reconciled the recipient with
 * what the writer does: it writes the message to the node's own `textContent`, then the tone to
 * `dataset`. An element of another namespace that carries a `dataset` - MathML - takes both; one
 * that carries none takes the message and then fails at the tone. Only a real document can answer
 * either, or say what a setter does with a value the writer hands over unconverted.
 */
test("setStatus writes to every element that carries a dataset, and fails at the tone where none does", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/tasks.html");
  await expect.poll(() => page.evaluate(() => typeof globalThis.window.LongtailForge?.pageController?.setStatus)).toBe("function");

  const observed = await page.evaluate(() => {
    const controller = globalThis.window.LongtailForge?.pageController;
    if (!controller) throw new Error("Page controller unavailable");
    const doc = globalThis.document;

    /** @param {Element} element */
    const tone = (element) => {
      const dataset = Reflect.get(element, "dataset");
      return dataset && typeof dataset === "object" ? Reflect.get(dataset, "statusTone") : "no dataset";
    };

    /** @param {Element} element @param {unknown} message @param {{ isError?: boolean }} [options] */
    const read = (element, message, options) => {
      controller.setStatus(element, message, options);
      return { text: element.textContent, tone: tone(element), children: element.childNodes.length };
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
    const svgText = doc.createElementNS("http://www.w3.org/2000/svg", "text");
    const math = doc.createElementNS("http://www.w3.org/1998/Math/MathML", "math");
    // An element of a namespace the platform gives no `dataset` to.
    const namespaced = doc.createElementNS("urn:longtail-forge:status", "status");
    doc.body.append(paragraph, svgText, math, namespaced);

    const namespacedFailure = failure(() => controller.setStatus(namespaced, "Saved", { isError: true }));

    return {
      html: read(paragraph, "Saved", { isError: false }),
      htmlError: read(paragraph, "Could not save", { isError: true }),
      htmlCleared: read(paragraph, ""),
      svg: read(svgText, "Saved", { isError: true }),
      math: read(math, "Saved", { isError: true }),
      isSvg: svgText instanceof globalThis.SVGElement && !(svgText instanceof globalThis.HTMLElement),
      isMath: math instanceof globalThis.Element && !(math instanceof globalThis.HTMLElement) && !(math instanceof globalThis.SVGElement),
      namespacedIsElement: namespaced instanceof globalThis.Element,
      namespacedHasDataset: Reflect.get(namespaced, "dataset") !== undefined,
      namespacedFailure,
      namespacedText: namespaced.textContent,
      number: read(paragraph, 42).text,
      object: read(paragraph, { toString: () => "from an object" }).text,
      falsy: [undefined, false, 0, Number.NaN].map((message) => read(paragraph, message).text),
      symbol: failure(() => controller.setStatus(paragraph, Symbol("message"))),
      toneAfterSymbol: tone(paragraph),
      absent: failure(() => controller.setStatus(null, "Saved")),
      absentUndefined: failure(() => controller.setStatus(undefined, Symbol("never converted"))),
    };
  });

  // An HTML recipient takes both writes, and an empty message clears the line.
  expect(observed.html).toEqual({ text: "Saved", tone: "", children: 1 });
  expect(observed.htmlError).toEqual({ text: "Could not save", tone: "error", children: 1 });
  expect(observed.htmlCleared).toEqual({ text: "", tone: "", children: 0 });

  // So do the two other namespaces that carry a `dataset`, which the `HTMLElement` declaration
  // refused while the browser accepted them.
  expect(observed.isSvg).toBe(true);
  expect(observed.svg).toEqual({ text: "Saved", tone: "error", children: 1 });
  expect(observed.isMath).toBe(true);
  expect(observed.math).toEqual({ text: "Saved", tone: "error", children: 1 });

  // An element with no `dataset` takes the message and then fails at the tone - unchanged, and
  // the reason the declaration does not refuse it up front.
  expect(observed.namespacedIsElement).toBe(true);
  expect(observed.namespacedHasDataset).toBe(false);
  expect(observed.namespacedFailure).toBe("TypeError");
  expect(observed.namespacedText).toBe("Saved");

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
