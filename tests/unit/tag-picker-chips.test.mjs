import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/shared/tags.js");

/**
 * The picker half of the shared tag surface, which nothing executed.
 *
 * `tag-catalogue-contracts` lifts the catalogue reader block and `tag-surface-declaration` runs
 * the two option builders and the two mounts' refusals. Neither reaches a chip, an origin
 * predicate or a normaliser. `0.33.33.39.6` annotated all of them, and three reads moved with the
 * annotations: the origin predicates now prove the record they read, the chip does the same and
 * coerces the three DOM sinks the DOM was coercing anyway, and a selected tag's assignment is
 * read through the union rather than off a member only one of its two shapes has.
 *
 * These cases hold what each of those answered before.
 */

const LIFTED = [
  "isTagRecord", "normalizeAssignmentSource", "assignmentSourceOf", "selectedTagAssignmentId",
  "isDirectTag", "isPropagatedTag", "isSystemTag", "normalizeSlug", "normalizeTagList",
  "normalizeTagIds", "findTagByNameOrSlug", "matchesTagSearch", "mergeTags", "upsertTag",
  "normalizeFilterValue", "createOriginBadge", "createTagChip", "readTagIds",
];

/** The shipped constants, not a restatement of them. */
function liftedConstants() {
  const start = source.indexOf("  const DEFAULT_TAG_COLOR = ");
  const end = source.indexOf("\n", source.indexOf("  const NO_TAGS_FILTER_VALUE = "));
  assert.ok(start !== -1 && end > start, "the two constants must lead the module");
  return source.slice(start, end);
}

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

function picker() {
  const browser = createFakeBrowserContext();
  const context = vm.createContext({ document: browser.document, ...fakeDomConstructors() });
  vm.runInContext(liftedConstants(), context);
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), context);
  return {
    api: vm.runInContext(`({ ${LIFTED.join(", ")}, DEFAULT_TAG_COLOR, NO_TAGS_FILTER_VALUE })`, context),
    document: browser.document,
  };
}

describe("Where a tag says its assignment came from", () => {
  it("reads the three spellings in order and normalises the answer", () => {
    const { api } = picker();
    assert.equal(api.assignmentSourceOf({ assignment_source: "propagated", origin: "system" }), "propagated");
    assert.equal(api.assignmentSourceOf({ origin: "system", source: "propagated" }), "system");
    assert.equal(api.assignmentSourceOf({ source: "propagated" }), "propagated");
  });

  /** The proof answers what the optional chaining it replaced answered: nothing, so "manual". */
  it("answers manual for anything that is not a record", () => {
    const { api } = picker();
    for (const value of [null, undefined, "propagated", 7, true, ["propagated"], ""]) {
      assert.doesNotThrow(() => api.assignmentSourceOf(value), `value: ${JSON.stringify(value)}`);
      assert.equal(api.assignmentSourceOf(value), "manual", `value: ${JSON.stringify(value)}`);
    }
  });

  it("answers manual for a word the vocabulary does not admit", () => {
    const { api } = picker();
    for (const word of ["inherited", "", null, 5, {}]) {
      assert.equal(api.assignmentSourceOf({ assignment_source: word }), "manual", `word: ${JSON.stringify(word)}`);
    }
    // The reader trims and lower-cases before matching, so casing and padding are accepted
    // rather than refused. That is the existing behaviour, not a widening.
    assert.equal(api.assignmentSourceOf({ assignment_source: " SYSTEM " }), "system");
  });

  it("gives the three predicates one answer between them", () => {
    const { api } = picker();
    for (const [tag, direct, propagated, system] of [
      [{}, true, false, false],
      [{ assignment_source: "propagated" }, false, true, false],
      [{ origin: "system" }, false, false, true],
      ["not a tag", true, false, false],
    ]) {
      assert.equal(api.isDirectTag(tag), direct, JSON.stringify(tag));
      assert.equal(api.isPropagatedTag(tag), propagated, JSON.stringify(tag));
      assert.equal(api.isSystemTag(tag), system, JSON.stringify(tag));
    }
  });
});

describe("The assignment a selected tag was made through", () => {
  /**
   * Both shapes reach the slot: `ensureTag` answers a freshly created catalogue record, which
   * names no assignment at all. The empty string stands where `undefined` stood, and both differ
   * from every assignment id, which is the only comparison either is used in.
   */
  it("answers the id for a normalised tag and the empty string for a record without one", () => {
    const { api } = picker();
    assert.equal(api.selectedTagAssignmentId({ tag_assignment_id: "ta_1" }), "ta_1");
    assert.equal(api.selectedTagAssignmentId({ tag_id: "t_1", name: "Urgent" }), "");
    assert.notEqual(api.selectedTagAssignmentId({ tag_id: "t_1" }), "ta_1");
  });
});

describe("One tag chip", () => {
  it("draws a plain chip from the tag's own name and colour", () => {
    const { api } = picker();
    const chip = api.createTagChip({ tag_id: "t_1", name: "Urgent", color: "#ff0000" });
    assert.equal(chip.tagName, "SPAN");
    assert.equal(chip.className, "tag-chip");
    const [swatch, label] = chip.children;
    assert.equal(swatch.className, "tag-chip-swatch");
    assert.equal(swatch.style.backgroundColor, "#ff0000");
    assert.equal(label.textContent, "Urgent");
  });

  it("falls back to the slug, then to Tag, and to the default colour", () => {
    const { api } = picker();
    assert.equal(api.createTagChip({ slug: "urgent" }).children[1].textContent, "urgent");
    assert.equal(api.createTagChip({}).children[1].textContent, "Tag");
    assert.equal(api.createTagChip({}).children[0].style.backgroundColor, api.DEFAULT_TAG_COLOR);
  });

  it("draws a removable chip as a button that names what it removes", () => {
    const { api } = picker();
    const chip = api.createTagChip({ tag_id: "t_1", name: "Urgent" }, { removable: true });
    assert.equal(chip.tagName, "BUTTON");
    assert.equal(chip.className, "tag-chip tag-chip-remove");
    assert.equal(chip.type, "button");
    assert.equal(chip.dataset.tagPickerRemove, "t_1");
    assert.equal(chip.getAttribute("aria-label"), "Remove Urgent");
    assert.equal(chip.title, "Remove Urgent");
  });

  it("marks an inherited tag and a system tag differently, and a direct tag not at all", () => {
    const { api } = picker();
    assert.ok(api.createTagChip({ assignment_source: "propagated" }).classList.contains("tag-chip-inherited"));
    assert.ok(api.createTagChip({ assignment_source: "system" }).classList.contains("tag-chip-system"));
    const direct = api.createTagChip({ assignment_source: "manual" });
    assert.ok(!direct.classList.contains("tag-chip-inherited"));
    assert.ok(!direct.classList.contains("tag-chip-system"));
  });

  /** **Non-throwing first.** The record proof is what lets a non-record reach the same chip. */
  it("draws a chip for a value that is not a record at all", () => {
    const { api } = picker();
    for (const value of [null, undefined, "urgent", 7, [], true]) {
      assert.doesNotThrow(() => api.createTagChip(value), `value: ${JSON.stringify(value)}`);
      const chip = api.createTagChip(value);
      assert.equal(chip.children[1].textContent, "Tag");
      assert.equal(chip.children[0].style.backgroundColor, api.DEFAULT_TAG_COLOR);
    }
  });

  /**
   * The three sinks write text. A real `dataset`, `style` and `textContent` coerce a non-string
   * to the same text on assignment, so the coercion changes no rendered value; this fake stores
   * what it is given, so the case pins the coercion rather than proving that equivalence.
   */
  it("writes a non-string id, name and colour as the text the DOM would have made of them", () => {
    const { api } = picker();
    const chip = api.createTagChip({ tag_id: 42, name: 7, color: 0x10 }, { removable: true });
    assert.equal(chip.dataset.tagPickerRemove, "42");
    assert.equal(chip.children[1].textContent, "7");
    assert.equal(chip.children[0].style.backgroundColor, "16");
  });

  it("adds the origin badge only for a chip that is shown, not chosen, and not direct", () => {
    const { api } = picker();
    const inherited = { assignment_source: "propagated", origin_label: "From Project" };
    assert.equal(api.createTagChip(inherited, { showOrigin: true }).children.length, 3);
    assert.equal(api.createTagChip(inherited, { showOrigin: true }).children[2].textContent, "From Project");
    assert.equal(api.createTagChip(inherited, { showOrigin: true, removable: true }).children.length, 2);
    assert.equal(api.createTagChip(inherited, { showOrigin: true, suppressible: true }).children.length, 2);
    assert.equal(api.createTagChip({ assignment_source: "manual" }, { showOrigin: true }).children.length, 2);
  });

  it("names a system tag System and any other inherited tag Inherited", () => {
    const { api } = picker();
    assert.equal(api.createOriginBadge({ assignment_source: "system" }).textContent, "System");
    assert.equal(api.createOriginBadge({ assignment_source: "propagated" }).textContent, "Inherited");
    assert.equal(api.createOriginBadge({ origin_label: "From Client" }).textContent, "From Client");
  });
});

describe("The picker's normalisers", () => {
  it("rebuilds each tag as text and drops one with no identifier", () => {
    const { api } = picker();
    const tags = api.normalizeTagList([
      { tag_id: "  t_1  ", name: "  Urgent  ", color: " #f00 " },
      { name: "No identifier" },
      { tag_id: "t_2", name: "Needs Slug" },
    ]);
    assert.equal(tags.length, 2);
    assert.equal(tags[0].tag_id, "t_1");
    assert.equal(tags[0].name, "Urgent");
    assert.equal(tags[0].color, "#f00");
    assert.equal(tags[0].status, "active", "an absent status defaults rather than blanking");
    assert.equal(tags[1].slug, "needs-slug", "an absent slug is derived from the name");
  });

  it("keeps the assignment members the catalogue record does not describe", () => {
    const { api } = picker();
    const [tag] = api.normalizeTagList([{ tag_id: "t_1", origin: "propagated", tag_assignment_id: "ta_9" }]);
    assert.equal(tag.assignment_source, "propagated", "read from whichever spelling was sent");
    assert.equal(tag.tag_assignment_id, "ta_9");
  });

  it("answers an empty list for anything that is not one", () => {
    const { api } = picker();
    for (const value of [null, undefined, "t_1", 7, {}]) {
      assert.deepEqual(plain(api.normalizeTagList(value)), [], `value: ${JSON.stringify(value)}`);
    }
  });

  it("reads identifiers from strings and from records alike", () => {
    const { api } = picker();
    assert.deepEqual(plain(api.normalizeTagIds([" t_1 ", { tag_id: "t_2" }, "", null, { name: "x" }])), ["t_1", "t_2"]);
    assert.deepEqual(plain(api.normalizeTagIds("t_1")), [], "a bare string is not a list");
  });

  it("slugs a name the way the server would", () => {
    const { api } = picker();
    assert.equal(api.normalizeSlug("  Needs Review!  "), "needs-review");
    assert.equal(api.normalizeSlug("--Already--Dashed--"), "already-dashed");
    assert.equal(api.normalizeSlug(null), "");
    assert.equal(api.normalizeSlug("x".repeat(120)).length, 80, "and truncates at the column width");
  });

  it("keeps the legacy no-tags sentinel working and defaults everything else to all", () => {
    const { api } = picker();
    assert.equal(api.normalizeFilterValue("__no_effective_tags__"), api.NO_TAGS_FILTER_VALUE);
    assert.equal(api.normalizeFilterValue(api.NO_TAGS_FILTER_VALUE), api.NO_TAGS_FILTER_VALUE);
    assert.equal(api.normalizeFilterValue(""), "all");
    assert.equal(api.normalizeFilterValue(null), "all");
    assert.equal(api.normalizeFilterValue(" t_1 "), "t_1");
  });

  it("finds a tag by either its name or its slug, however it was typed", () => {
    const { api } = picker();
    const tags = api.normalizeTagList([{ tag_id: "t_1", name: "Needs Review", slug: "needs-review" }]);
    assert.equal(api.findTagByNameOrSlug(tags, "  needs review  ").tag_id, "t_1");
    assert.equal(api.findTagByNameOrSlug(tags, "Needs-Review").tag_id, "t_1");
    assert.equal(api.findTagByNameOrSlug(tags, "needs"), null);
    assert.equal(api.findTagByNameOrSlug([], "needs review"), null);
  });

  it("matches a search against the name and the slug and nothing else", () => {
    const { api } = picker();
    const [tag] = api.normalizeTagList([{ tag_id: "t_1", name: "Needs Review", slug: "needs-review", description: "urgent" }]);
    assert.equal(api.matchesTagSearch(tag, "review"), true);
    assert.equal(api.matchesTagSearch(tag, "NEEDS-"), true);
    assert.equal(api.matchesTagSearch(tag, "urgent"), false, "the description is not searched");
    assert.equal(api.matchesTagSearch(tag, ""), true, "an empty query matches everything");
  });

  it("merges by identifier, letting the newer entry win, and orders by name", () => {
    const { api } = picker();
    const merged = api.mergeTags(
      [{ tag_id: "t_1", name: "Zebra" }, { tag_id: "t_2", name: "Alpha" }],
      [{ tag_id: "t_1", name: "Aardvark" }],
    );
    assert.deepEqual(plain(merged).map((/** @type {{ name: string }} */ tag) => tag.name), ["Aardvark", "Alpha"]);
    assert.equal(merged.length, 2, "and the identifier is what makes an entry the same one");
    assert.deepEqual(plain(api.upsertTag([], { tag_id: "t_3", name: "One" })).map((/** @type {{ tag_id: string }} */ t) => t.tag_id), ["t_3"]);
  });
});

describe("Reading the selected identifiers back out of a mounted picker", () => {
  it("reads the hidden inputs the picker wrote, and skips the empty ones", () => {
    const { api, document } = picker();
    const container = document.createElement("div");
    for (const value of ["t_1", "", "t_2"]) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.value = value;
      input.dataset.tagPickerSelected = "";
      container.append(input);
    }
    assert.deepEqual(plain(api.readTagIds(container)), ["t_1", "t_2"]);
  });

  it("reads nothing from a container that is not there rather than throwing", () => {
    const { api } = picker();
    assert.doesNotThrow(() => api.readTagIds(null));
    assert.deepEqual(plain(api.readTagIds(null)), []);
    assert.deepEqual(plain(api.readTagIds(undefined)), []);
  });
});

describe("shared/tags.js states its picker shapes rather than asserting them", () => {
  it("derives the picker tag from the normaliser instead of restating it", () => {
    assert.match(source, /@typedef \{ReturnType<typeof normalizeTagList>\[number\]\} PickerTag/);
    assert.match(source, /@typedef \{PickerTag \| TagCatalogRecord\} SelectedTag/);
    assert.match(source, /@typedef \{Error & \{ body\?: unknown, status\?: number \}\} TagRequestError/);
  });

  it("carries no suppression, and only the checked assertion this file already had", () => {
    assert.doesNotMatch(source, /@ts-(expect-error|ignore|nocheck)/);
    const casts = source.match(/\/\*\* @type \{[^}]*\} \*\/ \(/g) || [];
    assert.equal(casts.length, 1, "only the catalogue filter's own predicate-checked assertion");
    assert.match(source, /body\.tags\.filter\(isTagCatalogRecord\)/);
  });
});
