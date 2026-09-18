import { expect, test } from "./support/isolated-workspace.mjs";

/**
 * What the shared `createOption` hands its two setters, checked against a real `<option>`.
 *
 * `0.33.33.39.24` widened `BrowserPageController.createOption` from `(string, string)` to
 * `(unknown, unknown)` because eight page wrappers pass whatever their callers pass, and the
 * helper never converted anything itself: `option.value` and `option.textContent` did. The
 * implementation now hands both arguments to those setters through `Reflect.set` rather than by
 * assignment, so the claim to prove is that **nothing observable moved** - the same conversions,
 * the same empty text for `null` and `undefined`, the same Symbol failures, the element created
 * before either argument is converted, and a real `HTMLOptionElement` returned.
 *
 * Only a real document can answer this: the DOM double stores whatever it is given, so it models
 * neither DOMString conversion nor `textContent`'s nullable one.
 */
test("createOption converts through the option's own setters, after creating it", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/tasks.html");
  await expect.poll(() => page.evaluate(() => typeof globalThis.window.LongtailForge?.pageController?.createOption)).toBe("function");

  const observed = await page.evaluate(() => {
    const controller = globalThis.window.LongtailForge?.pageController;
    if (!controller) throw new Error("Page controller unavailable");

    /** @param {unknown} value @param {unknown} text */
    const read = (value, text) => {
      const option = controller.createOption(value, text);
      return { value: option.value, text: option.textContent, children: option.childNodes.length };
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

    // Creation is observed through an own property that shadows the prototype method for one
    // call and is then deleted, which restores the document exactly rather than pinning a copy.
    /** @type {string[]} */
    const order = [];
    const doc = globalThis.document;
    const originalCreate = doc.createElement;
    Reflect.set(doc, "createElement", (/** @type {unknown[]} */ ...args) => {
      order.push(`create:${String(args[0])}`);
      return Reflect.apply(originalCreate, doc, args);
    });
    let option;
    try {
      option = controller.createOption(
        { toString: () => { order.push("convert:value"); return "v"; } },
        { toString: () => { order.push("convert:text"); return "t"; } },
      );
    } finally {
      Reflect.deleteProperty(doc, "createElement");
    }

    return {
      strings: read("alpha", "Alpha"),
      numbers: read(5, 7),
      objects: read({ toString: () => "from-object" }, { toString: () => "Object label" }),
      nullValue: read(null, "Label"),
      undefinedValue: read(undefined, "Label"),
      nullText: read("id", null),
      undefinedText: read("id", undefined),
      emptyText: read("id", ""),
      symbolValue: failure(() => controller.createOption(Symbol("value"), "Label")),
      symbolText: failure(() => controller.createOption("id", Symbol("text"))),
      order,
      isOption: option instanceof globalThis.HTMLOptionElement,
      restored: doc.createElement === originalCreate && !Object.hasOwn(doc, "createElement"),
      tagName: option.tagName,
      ordered: [option.value, option.textContent],
    };
  });

  expect(observed.strings).toEqual({ value: "alpha", text: "Alpha", children: 1 });
  expect(observed.numbers).toEqual({ value: "5", text: "7", children: 1 });
  expect(observed.objects).toEqual({ value: "from-object", text: "Object label", children: 1 });

  // `value` is a non-nullable DOMString, so a missing value is written as its own name.
  expect(observed.nullValue).toEqual({ value: "null", text: "Label", children: 1 });
  expect(observed.undefinedValue).toEqual({ value: "undefined", text: "Label", children: 1 });

  // `textContent` is nullable: null and undefined leave the option empty rather than writing a word.
  expect(observed.nullText).toEqual({ value: "id", text: "", children: 0 });
  expect(observed.undefinedText).toEqual({ value: "id", text: "", children: 0 });
  expect(observed.emptyText).toEqual({ value: "id", text: "", children: 0 });

  // A Symbol still fails at the setter; `String(symbol)` would not have.
  expect(observed.symbolValue).toBe("TypeError");
  expect(observed.symbolText).toBe("TypeError");

  // Created first, then converted value-then-text - exactly the two assignments' order.
  expect(observed.order).toEqual(["create:option", "convert:value", "convert:text"]);
  expect(observed.isOption).toBe(true);
  expect(observed.restored).toBe(true);
  expect(observed.tagName).toBe("OPTION");
  expect(observed.ordered).toEqual(["v", "t"]);
});
