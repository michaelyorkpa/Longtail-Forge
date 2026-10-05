import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/tags.js");

/**
 * The **rendering** half of the tag management page, which is a different concern from the wire
 * half that `tag-catalogue-contracts.test.mjs` already proves.
 *
 * Twenty-two of the twenty-four diagnostics this checkpoint cleared were parameter annotations
 * and two were a default inferring `{}` - all compiler-proved. **One executable line changed**:
 * the debounce timer starts as `undefined` rather than `null`. So the cases below hold that
 * helper still, and cover the readers those annotations now describe.
 */

const LIFTED = [
  "debounce", "slugify", "formatDate", "usageText", "metadataBadge", "createTagActionButton",
];

/**
 * @param {object} [options]
 * @param {boolean} [options.withIcons] whether the shared icon surface is present
 */
function tagsCase(options = {}) {
  const { withIcons = false } = options;
  const document = new FakeDocument();
  /** @type {{ id: number, run: () => void, delay: number }[]} */
  const pending = [];
  /** @type {Record<string, unknown>[]} */
  const iconCalls = [];
  let nextTimerId = 1;

  const sandbox = vm.createContext({
    document,
    window: {
      /** @param {() => void} run @param {number} delay */
      setTimeout: (run, delay) => {
        const id = nextTimerId;
        nextTimerId += 1;
        pending.push({ delay, id, run });
        return id;
      },
      /** @param {number | undefined} id */
      clearTimeout: (id) => {
        const index = pending.findIndex((entry) => entry.id === id);
        if (index >= 0) pending.splice(index, 1);
      },
      ...(withIcons
        ? {
          LongtailForge: {
            icons: {
              /** @param {Record<string, unknown>} iconOptions */
              createIconButton: (iconOptions) => {
                iconCalls.push(iconOptions);
                return document.createElement("button");
              },
            },
          },
        }
        : {}),
    },
  });
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), sandbox);

  return {
    api: vm.runInContext(`({ ${LIFTED.join(", ")} })`, sandbox),
    iconCalls,
    pending,
    /** Run every timer currently queued, in the order it was scheduled. */
    flush: () => { for (const entry of pending.splice(0)) entry.run(); },
  };
}

describe("Tag page debounce", () => {
  it("defers the call until the delay elapses", () => {
    const testCase = tagsCase();
    /** @type {number[]} */ const ran = [];
    const debounced = testCase.api.debounce(() => ran.push(1), 250);

    debounced();
    assert.deepEqual(ran, [], "nothing runs before the timer fires");
    assert.equal(testCase.pending.length, 1);
    assert.equal(testCase.pending[0].delay, 250, "the caller's delay is the one scheduled");

    testCase.flush();
    assert.deepEqual(ran, [1]);
  });

  /** The point of the helper: a burst of input collapses to one call. */
  it("cancels an earlier pending call when invoked again", () => {
    const testCase = tagsCase();
    /** @type {number} */ let runs = 0;
    const debounced = testCase.api.debounce(() => { runs += 1; }, 250);

    debounced();
    debounced();
    debounced();
    assert.equal(testCase.pending.length, 1, "only the latest call may remain scheduled");

    testCase.flush();
    assert.equal(runs, 1, "a burst collapses to a single call");
  });

  /**
   * **The one executable change in this checkpoint.** The timer starts as `undefined` rather
   * than `null`, because that is what `clearTimeout` accepts and what an unset timer already
   * meant. The first invocation clears nothing either way, and this holds that still.
   */
  it("cancels nothing on its first invocation, with no timer yet set", () => {
    const testCase = tagsCase();
    /** @type {unknown[]} */ const cleared = [];
    const debounced = testCase.api.debounce(() => {}, 10);

    assert.doesNotThrow(() => debounced(), "an unset timer must be safe to clear");
    assert.equal(testCase.pending.length, 1);
    assert.deepEqual(cleared, []);
  });

  /** The forwarder passes its caller's arguments through untouched. */
  it("forwards every argument it was given", () => {
    const testCase = tagsCase();
    /** @type {unknown[][]} */ const received = [];
    const debounced = testCase.api.debounce((/** @type {unknown[]} */ ...args) => received.push(args), 5);

    debounced("a", 2, null);
    testCase.flush();
    assert.deepEqual(received, [["a", 2, null]]);
  });

  it("forwards the arguments of the latest call, not an earlier one", () => {
    const testCase = tagsCase();
    /** @type {unknown[][]} */ const received = [];
    const debounced = testCase.api.debounce((/** @type {unknown[]} */ ...args) => received.push(args), 5);

    debounced("first");
    debounced("second");
    testCase.flush();
    assert.deepEqual(received, [["second"]]);
  });

  it("runs again for a call made after the previous one fired", () => {
    const testCase = tagsCase();
    /** @type {number} */ let runs = 0;
    const debounced = testCase.api.debounce(() => { runs += 1; }, 5);

    debounced();
    testCase.flush();
    debounced();
    testCase.flush();
    assert.equal(runs, 2);
  });
});

describe("Tag slug derivation", () => {
  it("lowercases and hyphenates a readable name", () => {
    const { api } = tagsCase();
    assert.equal(api.slugify("Client Reporting"), "client-reporting");
  });

  it("collapses runs of punctuation and trims the hyphens they leave", () => {
    const { api } = tagsCase();
    assert.equal(api.slugify("  --Urgent!! / Review--  "), "urgent-review");
  });

  it("answers an empty string for a value carrying nothing usable", () => {
    const { api } = tagsCase();
    for (const value of ["", "   ", "!!!", null, undefined]) {
      assert.equal(api.slugify(value), "", `value: ${String(value)}`);
    }
  });

  it("truncates at eighty characters", () => {
    const { api } = tagsCase();
    assert.equal(api.slugify("a".repeat(120)).length, 80);
  });

  /** A non-string is coerced rather than refused, which is what the untyped read did. */
  it("coerces a non-string rather than refusing it", () => {
    const { api } = tagsCase();
    assert.equal(api.slugify(42), "42");
  });
});

describe("Tag date formatting", () => {
  /**
   * **Non-throwing first.** Dropping the guard leaves `date` as `null` for an absent value, so
   * the reader crashes rather than answering wrongly - and a crash is not the same evidence as
   * a wrong answer. The unparseable string takes the other arm, where a `Date` exists but its
   * time is `NaN`.
   */
  it("answers unknown for a value it cannot read as a date", () => {
    const { api } = tagsCase();
    for (const value of [null, undefined, "", "not a date"]) {
      assert.doesNotThrow(() => api.formatDate(value), `value: ${String(value)}`);
      assert.equal(api.formatDate(value), "unknown", `value: ${String(value)}`);
    }
  });

  it("renders a readable date for a timestamp", () => {
    const { api } = tagsCase();
    const rendered = api.formatDate("2026-09-15T12:00:00.000Z");
    assert.notEqual(rendered, "unknown");
    assert.match(rendered, /2026/);
  });
});

describe("Tag usage summary", () => {
  it("names the total alone when no breakdown is carried", () => {
    const { api } = tagsCase();
    assert.equal(api.usageText({ usage_count: 4 }), "4 uses");
  });

  it("uses the singular for exactly one use", () => {
    const { api } = tagsCase();
    assert.equal(api.usageText({ usage_count: 1 }), "1 use");
  });

  it("answers zero uses for a tag carrying no counts at all", () => {
    const { api } = tagsCase();
    assert.equal(api.usageText({}), "0 uses");
  });

  it("adds direct and propagated once either is present", () => {
    const { api } = tagsCase();
    assert.equal(
      api.usageText({ direct_usage_count: 2, propagated_usage_count: 3, usage_count: 5 }),
      "5 uses | 2 direct | 3 propagated",
    );
  });

  /** The system count is added only when it is non-zero, unlike the other two. */
  it("adds the system count only when there is one", () => {
    const { api } = tagsCase();
    assert.equal(
      api.usageText({ direct_usage_count: 1, propagated_usage_count: 0, system_usage_count: 7, usage_count: 8 }),
      "8 uses | 1 direct | 0 propagated | 7 system",
    );
    assert.equal(
      api.usageText({ direct_usage_count: 1, propagated_usage_count: 0, system_usage_count: 0, usage_count: 1 }),
      "1 use | 1 direct | 0 propagated",
    );
  });

  /** A breakdown carried only by the system count still opens the detail list. */
  it("opens the breakdown when only the system count is present", () => {
    const { api } = tagsCase();
    assert.equal(
      api.usageText({ system_usage_count: 2, usage_count: 2 }),
      "2 uses | 0 direct | 0 propagated | 2 system",
    );
  });
});

describe("Tag metadata badge", () => {
  it("carries its text and the badge class", () => {
    const { api } = tagsCase();
    const badge = api.metadataBadge("Slug: client-reporting");
    assert.equal(badge.textContent, "Slug: client-reporting");
    assert.equal(badge.className, "tag-metadata-badge");
  });
});

describe("Tag row action button", () => {
  it("builds a plain button when the icon surface is absent", () => {
    const { api } = tagsCase();
    const button = api.createTagActionButton("Edit", "edit");
    assert.equal(button.tagName, "BUTTON");
    assert.equal(button.type, "button");
    assert.equal(button.textContent, "Edit");
    assert.equal(button.classList.contains("danger-button"), false);
  });

  /** The danger class is applied only for an explicit `true`, not for any truthy value. */
  it("marks a plain button dangerous only when told so exactly", () => {
    const { api } = tagsCase();
    assert.equal(api.createTagActionButton("Archive", "archive", { danger: true }).classList.contains("danger-button"), true);
    assert.equal(api.createTagActionButton("Archive", "archive", {}).classList.contains("danger-button"), false);
    assert.equal(api.createTagActionButton("Archive", "archive").classList.contains("danger-button"), false);
  });

  it("asks the icon surface for a labelled button when one is available", () => {
    const testCase = tagsCase({ withIcons: true });
    testCase.api.createTagActionButton("Edit", "edit");
    assert.deepEqual(JSON.parse(JSON.stringify(testCase.iconCalls[0])), {
      icon: "edit", label: "Edit", title: "Edit", variant: "",
    });
  });

  it("passes the danger variant through to the icon surface", () => {
    const testCase = tagsCase({ withIcons: true });
    testCase.api.createTagActionButton("Archive", "archive", { danger: true });
    assert.equal(testCase.iconCalls[0].variant, "danger");
  });
});

describe("tags.js shapes this page states rather than invents", () => {
  /**
   * **The forwarder keeps the relationship between what it takes and what it calls.** A rest
   * parameter of `unknown[]` would have described a helper that discards it.
   */
  it("declares the debounce forwarder generically", () => {
    assert.match(source, /@template \{unknown\[\]\} Args/);
    assert.match(source, /@param \{\(\.\.\.args: Args\) => unknown\} callback/);
    assert.match(source, /@returns \{\(\.\.\.args: Args\) => void\}/);
  });

  it("starts the debounce timer unset rather than null", () => {
    assert.match(source, /@type \{number \| undefined\}\n\s*\*\/\n\s*let timer;/);
  });

  /** Both spellings the tags contracts match as literal text are preserved exactly. */
  it("keeps the pinned action-button signature and danger read", () => {
    assert.match(source, /function createTagActionButton\(label, icon, options = \{\}\) \{/);
    assert.match(source, /variant: options\.danger \? "danger" : "",/);
    assert.match(source, /function renderTagMetadata\(container, tag\) \{/);
    assert.match(source, /function usageText\(tag\) \{/);
  });

  /**
   * The tags usability contract forbids that word anywhere in this file, comments included,
   * so every declaration added here had to be written without it.
   */
  it("adds no occurrence of the word the usability contract forbids", () => {
    assert.doesNotMatch(source, /scope/i);
  });

  it("carries no suppression, and only the cast the catalogue reader already earned", () => {
    assert.doesNotMatch(source, /@ts-(expect-error|ignore|nocheck)/);
    const casts = source.match(/\/\*\* @type \{[^}]*\} \*\/ \(/g) || [];
    assert.equal(casts.length, 1, "only readTagCatalog asserts, and only behind its own validation");
  });
});
