import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const reader = createProjectTextReader();
const source = reader.readText("public/js/help.js");

const LIFTED = [
  "helpRecord", "helpRecordList", "helpText",
  "normalizeSections", "normalizeArticles", "normalizeNavigation", "normalizeNavigationItem",
  "navigationArticle", "findArticle", "sectionsWithArticles",
  "shouldStartGroupExpanded", "navigationItemContainsArticle", "normalizeNavigationTitle",
  "sourceLabel", "articleMetaParts",
  "normalizeMarkdown", "isParagraphLine", "isTableStart", "isTableRow", "isTableDivider",
  "splitTableCells", "safeHelpHref",
  "inlineMarkdownNodes", "appendTextNode", "linkElement", "codeBlockElement", "tableElement",
  "emptyElement", "renderMarkdownNodes", "importSafeHelpNode", "renderSafeHtmlNodes",
  "setStatus",
];

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

/**
 * @param {object} [options]
 * @param {Record<string, unknown>[]} [options.sections] already-normalized sections
 * @param {Record<string, unknown>[]} [options.articles] already-normalized articles
 * @param {string} [options.selectedArticleId]
 */
function helpCase(options = {}) {
  const document = new FakeDocument();
  const state = {
    articles: options.articles || [],
    defaultArticleId: "",
    navigation: [],
    navGroupCounter: 0,
    sections: options.sections || [],
    selectedArticleId: options.selectedArticleId || "",
  };

  /** @type {{ html: string }[]} */
  const parsed = [];
  /** One parsed body per `parseFromString` call, in the order the calls will come.
   * @type {import("../../scripts/test-support/fake-dom.mjs").FakeElement[][]} */
  const parsedBodies = [];

  const context = vm.createContext({
    document,
    ...fakeDomConstructors(),
    state,
    statusMessage: document.createElement("p"),
    // Stubbed rather than lifted: parsing is the browser's, and what this page owns is what it
    // does with each top-level node the parse answered.
    DOMParser: class FakeDOMParser {
      /** @param {string} html */
      parseFromString(html) {
        parsed.push({ html });
        const body = document.createElement("body");
        for (const child of parsedBodies.shift() || []) body.appendChild(child);
        return { body };
      }
    },
  });

  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), context);
  const api = vm.runInContext(`({ ${LIFTED.join(", ")} })`, context);

  /**
   * Build an element the sanitizer can read, the way a parsed document would hand it over.
   * @param {string} tag
   * @param {Record<string, string>} [attrs]
   * @param {import("../../scripts/test-support/fake-dom.mjs").FakeElement[]} [children]
   */
  const node = (tag, attrs = {}, children = []) => {
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
    for (const child of children) element.appendChild(child);
    return element;
  };

  return { api, context, document, state, node, parsed, parsedBodies };
}

describe("Help wire-record readers", () => {
  it("answers a record for a record and nothing for everything else", () => {
    const { api } = helpCase();
    assert.deepEqual(plain(api.helpRecord({ id: "a" })), { id: "a" });
    assert.equal(api.helpRecord(null), null);
    assert.equal(api.helpRecord(["a"]), null);
    assert.equal(api.helpRecord("a"), null);
    assert.equal(api.helpRecord(3), null);
  });

  /**
   * **`String(value || "")`, not `String(value ?? "")`.** Every site this replaced read
   * `member || ""`, so a falsy member must still reach the empty string rather than its own
   * spelling. A truthy non-string becomes its text, which is what the two `localeCompare` sorts
   * already required of it.
   */
  it("reads a member as text the way the untyped page did", () => {
    const { api } = helpCase();
    assert.equal(api.helpText(0), "");
    assert.equal(api.helpText(false), "");
    assert.equal(api.helpText(""), "");
    assert.equal(api.helpText(null), "");
    assert.equal(api.helpText(undefined), "");
    assert.equal(api.helpText("Intro"), "Intro");
    assert.equal(api.helpText(7), "7");
  });

  it("keeps a malformed list entry as an empty record, leaving the drop to the normalizers", () => {
    const { api } = helpCase();
    const list = api.helpRecordList([{ id: "a" }, "b", null, { id: "c" }]);
    assert.equal(list.length, 4);
    assert.deepEqual(plain(list), [{ id: "a" }, {}, {}, { id: "c" }]);
    assert.deepEqual(plain(api.helpRecordList("a")), []);
  });
});

describe("Help section and article normalization", () => {
  it("fills every member and sorts by order then title", () => {
    const { api } = helpCase();
    const sections = api.normalizeSections([
      { id: "b", title: "Beta", sortOrder: 2 },
      { id: "a", title: "Alpha", sortOrder: 2, ownerType: "framework", moduleId: "core", description: "d", sourceLabel: "s" },
      { id: "c", title: "Gamma", sortOrder: 1 },
    ]);
    assert.deepEqual(plain(sections.map((/** @type {{id: string}} */ section) => section.id)), ["c", "a", "b"]);
    assert.deepEqual(plain(sections[1]), {
      id: "a", title: "Alpha", description: "d", sortOrder: 2,
      ownerType: "framework", moduleId: "core", sourceLabel: "s",
    });
  });

  it("defaults an absent owner to module and an absent order to zero", () => {
    const { api } = helpCase();
    const [section] = api.normalizeSections([{ id: "a", title: "Alpha" }]);
    assert.equal(section.ownerType, "module");
    assert.equal(section.sortOrder, 0);
    assert.equal(section.description, "");
  });

  /** Both normalizers drop what they cannot address, which is why the reader keeps blanks. */
  it("drops an entry with no id or no title, and anything that is not a record", () => {
    const { api } = helpCase();
    assert.equal(api.normalizeSections([{ id: "a" }, { title: "T" }, "x", null, 4]).length, 0);
    assert.equal(api.normalizeArticles([{ id: "a" }, { title: "T" }, "x", null]).length, 0);
    assert.equal(api.normalizeSections("not-a-list").length, 0);
    assert.equal(api.normalizeArticles(undefined).length, 0);
  });

  it("orders articles by their declared order, then by title", () => {
    const { api } = helpCase();
    const articles = api.normalizeArticles([
      { id: "b", title: "Beta", sortOrder: 2 },
      { id: "a", title: "Alpha", sortOrder: 2 },
      { id: "c", title: "Gamma", sortOrder: 1 },
    ]);
    assert.deepEqual(plain(articles.map((/** @type {{id: string}} */ article) => article.id)), ["c", "a", "b"]);
  });

  it("reads an article summary through its description and keeps both", () => {
    const { api } = helpCase();
    const [withSummary] = api.normalizeArticles([{ id: "a", title: "A", summary: "S", description: "D" }]);
    const [withoutSummary] = api.normalizeArticles([{ id: "b", title: "B", description: "D" }]);
    assert.equal(withSummary.summary, "S");
    assert.equal(withoutSummary.summary, "D");
    assert.equal(withoutSummary.description, "D");
  });

  it("keeps a tag list and refuses anything that is not one", () => {
    const { api } = helpCase();
    assert.deepEqual(plain(api.normalizeArticles([{ id: "a", title: "A", tags: ["x"] }])[0].tags), ["x"]);
    assert.deepEqual(plain(api.normalizeArticles([{ id: "a", title: "A", tags: "x" }])[0].tags), []);
  });

  /**
   * The sorts call `localeCompare` on the normalized title directly, so a numeric title threw
   * before it was read as text. It now sorts instead - the one value the coercion changes.
   */
  it("sorts a non-string title instead of throwing on it", () => {
    const { api } = helpCase();
    const sections = api.normalizeSections([{ id: "a", title: 2 }, { id: "b", title: 1 }]);
    assert.deepEqual(plain(sections.map((/** @type {{title: string}} */ section) => section.title)), ["1", "2"]);
  });
});

describe("Help navigation normalization", () => {
  const articles = [
    { id: "intro", slug: "getting-started", title: "Intro", moduleId: "", ownerType: "framework", sourceLabel: "Framework" },
    { id: "billing", slug: "billing", title: "Billing", moduleId: "time-tracking", ownerType: "module", sourceLabel: "Time Tracking" },
  ];

  it("resolves an article entry by id or by slug and keeps the declared title", () => {
    const { api } = helpCase({ articles });
    const [byId] = api.normalizeNavigation([{ type: "article", id: "intro", title: "Start here" }]);
    const [bySlug] = api.normalizeNavigation([{ type: "article", slug: "billing" }]);
    assert.equal(byId.title, "Start here");
    assert.equal(byId.type, "article");
    assert.equal(bySlug.title, "Billing", "an entry with no title of its own falls back to the article's");
    assert.equal(bySlug.id, "billing");
  });

  it("drops an article entry that names no article this page holds", () => {
    const { api } = helpCase({ articles });
    assert.equal(api.normalizeNavigation([{ type: "article", id: "missing" }]).length, 0);
  });

  /**
   * **The entries are passed on raw.** `normalizeNavigationItem` answers `null` for a non-record,
   * and that answer is how a malformed entry is dropped - reading it as an empty record first
   * would turn each one into an untitled group.
   */
  it("drops a malformed entry rather than making a group of it", () => {
    const { api } = helpCase({ articles });
    assert.equal(api.normalizeNavigation(["x", null, 4, true]).length, 0);
    assert.equal(api.normalizeNavigationItem("x"), null);
    assert.equal(api.normalizeNavigationItem(null), null);
    assert.equal(api.normalizeNavigationItem(["intro"]), null);
  });

  it("treats an unrecognised type as a group and titles an untitled one", () => {
    const { api } = helpCase({ articles });
    const [group] = api.normalizeNavigation([{ type: "section" }]);
    assert.equal(group.type, "group");
    assert.equal(group.title, "Help");
    assert.deepEqual(plain(group.children), []);
  });

  it("normalizes children to any depth", () => {
    const { api } = helpCase({ articles });
    const [group] = api.normalizeNavigation([{
      title: "Guides",
      children: [{ title: "Nested", children: [{ type: "article", id: "intro" }] }, "dropped"],
    }]);
    assert.equal(group.children.length, 1);
    assert.equal(group.children[0].children[0].id, "intro");
  });

  it("builds an article entry from the seven members the page reads", () => {
    const { api } = helpCase({ articles });
    assert.deepEqual(plain(api.navigationArticle(articles[1])), {
      id: "billing", moduleId: "time-tracking", ownerType: "module",
      slug: "billing", sourceLabel: "Time Tracking", title: "Billing", type: "article",
    });
  });

  it("titles an article that has none", () => {
    const { api } = helpCase();
    assert.equal(api.navigationArticle({ id: "x" }).title, "Untitled article");
    assert.equal(api.navigationArticle({ id: "x" }).ownerType, "module");
  });
});

describe("Help navigation fallback from sections", () => {
  const sections = [
    { id: "start", title: "Getting started", sortOrder: 1 },
    { id: "empty", title: "Nothing here", sortOrder: 0 },
  ];
  const articles = [
    { id: "a", title: "A", sectionId: "start", moduleId: "", ownerType: "framework", slug: "a", sourceLabel: "Framework" },
    { id: "b", title: "B", sectionId: "unknown-section", moduleId: "", ownerType: "module", slug: "b", sourceLabel: "" },
  ];

  it("groups articles under their section and drops a section with none", () => {
    const { api } = helpCase({ sections, articles });
    const navigation = api.sectionsWithArticles();
    assert.deepEqual(plain(navigation.map((/** @type {{title: string}} */ group) => group.title)), ["Getting started", "Other"]);
    assert.equal(navigation.every((/** @type {{type: string}} */ group) => group.type === "group"), true);
  });

  /** An article whose section this page does not hold still appears, under the fallback group. */
  it("collects an unplaced article into Other rather than losing it", () => {
    const { api } = helpCase({ sections, articles });
    const other = api.sectionsWithArticles().find((/** @type {{title: string}} */ group) => group.title === "Other");
    assert.deepEqual(plain(other.children.map((/** @type {{id: string}} */ child) => child.id)), ["b"]);
  });

  it("orders the fallback groups by their section order", () => {
    const { api } = helpCase({
      sections: [
        { id: "late", title: "Later", sortOrder: 9 },
        { id: "early", title: "Earlier", sortOrder: 1 },
      ],
      articles: [
        { id: "x", title: "X", sectionId: "late", slug: "x", moduleId: "", ownerType: "module", sourceLabel: "" },
        { id: "y", title: "Y", sectionId: "early", slug: "y", moduleId: "", ownerType: "module", sourceLabel: "" },
      ],
    });
    assert.deepEqual(plain(api.sectionsWithArticles().map((/** @type {{title: string}} */ group) => group.title)), ["Earlier", "Later"]);
  });

  it("titles a section that carries none", () => {
    const { api } = helpCase({
      sections: [{ id: "blank", title: "", sortOrder: 0 }],
      articles: [{ id: "x", title: "X", sectionId: "blank", slug: "x", moduleId: "", ownerType: "module", sourceLabel: "" }],
    });
    assert.equal(api.sectionsWithArticles()[0].title, "Help");
  });

  it("answers nothing when there are no articles at all", () => {
    const { api } = helpCase({ sections, articles: [] });
    assert.deepEqual(plain(api.sectionsWithArticles()), []);
  });
});

describe("Help group expansion", () => {
  it("expands a group holding the selected article, at any depth", () => {
    const { api } = helpCase({ selectedArticleId: "deep" });
    const group = { type: "group", title: "Other", children: [{ type: "group", title: "Inner", children: [{ type: "article", id: "deep", title: "Deep" }] }] };
    assert.equal(api.shouldStartGroupExpanded(group, 1), true);
  });

  it("expands every nested group and collapses an unrelated top-level one", () => {
    const { api } = helpCase({ selectedArticleId: "elsewhere" });
    const group = { type: "group", title: "Modules", children: [] };
    assert.equal(api.shouldStartGroupExpanded(group, 2), true);
    assert.equal(api.shouldStartGroupExpanded(group, 1), false);
  });

  /** The framework's own group is the one top-level group that starts open. */
  it("expands the framework group by name, however it is cased or spaced", () => {
    const { api } = helpCase();
    for (const title of ["Longtail Forge", "  longtail forge  ", "LONGTAIL FORGE"]) {
      assert.equal(api.shouldStartGroupExpanded({ type: "group", title, children: [] }, 1), true);
    }
    assert.equal(api.shouldStartGroupExpanded({ type: "group", title: "Longtail  Forge", children: [] }, 1), false);
  });

  it("matches a containing entry by id or slug and answers false without a selection", () => {
    const { api } = helpCase();
    const group = { type: "group", title: "G", children: [{ type: "article", id: "x", slug: "ex", title: "X" }] };
    assert.equal(api.navigationItemContainsArticle(group, "x"), true);
    assert.equal(api.navigationItemContainsArticle(group, "ex"), true);
    assert.equal(api.navigationItemContainsArticle(group, "other"), false);
    assert.equal(api.navigationItemContainsArticle(group, ""), false);
    assert.equal(api.navigationItemContainsArticle(null, "x"), false);
  });

  /**
   * A normalized group carries `id: ""`, so without the empty-selection guard an absent
   * selection would match every group and open the whole tree.
   */
  it("does not match a normalized group when nothing is selected", () => {
    const { api } = helpCase();
    const [group] = api.normalizeNavigation([{ title: "Modules" }]);
    assert.equal(group.id, "");
    assert.equal(api.navigationItemContainsArticle(group, ""), false);
    assert.equal(api.shouldStartGroupExpanded(group, 1), false);
  });
});

describe("Help article source labels", () => {
  it("labels a framework article and falls back to the module id", () => {
    const { api } = helpCase();
    assert.equal(api.sourceLabel({ ownerType: "framework", moduleId: "ignored" }), "Framework");
    assert.equal(api.sourceLabel({ ownerType: "module", moduleId: "time-tracking" }), "time-tracking");
    assert.equal(api.sourceLabel({}), "Module");
  });

  it("prefers the label the response carried over the one it derives", () => {
    const { api } = helpCase();
    assert.deepEqual(plain(api.articleMetaParts({ sourceLabel: "Time Tracking", moduleId: "time-tracking" })), ["Time Tracking", "Module help"]);
    assert.deepEqual(plain(api.articleMetaParts({ ownerType: "framework" })), ["Framework", "Framework help"]);
  });

  it("omits the scope line for an article that claims neither", () => {
    const { api } = helpCase();
    assert.deepEqual(plain(api.articleMetaParts({ sourceLabel: "Custom" })), ["Custom"]);
  });
});

describe("Help markdown block rendering", () => {
  it("normalizes line endings and trailing spaces before splitting", () => {
    const { api } = helpCase();
    assert.equal(api.normalizeMarkdown("a  \r\nb\t\r\n"), "a\nb");
    assert.equal(api.normalizeMarkdown("a  \nb  \nc"), "a\nb\nc", "every line, not only the first");
    assert.equal(api.normalizeMarkdown(null), "");
  });

  it("renders headings two levels below the markdown level, bounded at h2 and h6", () => {
    const { api } = helpCase();
    const nodes = api.renderMarkdownNodes("# One\n\n## Two\n\n###### Six");
    assert.deepEqual(plain(nodes.map((/** @type {{tagName: string}} */ n) => n.tagName)), ["H2", "H3", "H6"]);
  });

  it("renders fenced code without interpreting it", () => {
    const { api } = helpCase();
    const [pre] = api.renderMarkdownNodes("```\n# not a heading\n```");
    assert.equal(pre.tagName, "PRE");
    assert.equal(pre.children[0].tagName, "CODE");
    assert.equal(pre.children[0].textContent, "# not a heading");
  });

  it("closes an unterminated fence at the end of the article", () => {
    const { api } = helpCase();
    const [pre] = api.renderMarkdownNodes("```\nstill code");
    assert.equal(pre.children[0].textContent, "still code");
  });

  it("renders both list markers and stops at the first non-item", () => {
    const { api } = helpCase();
    const nodes = api.renderMarkdownNodes("- one\n- two\n\n1. first\n2. second\n\nparagraph");
    assert.deepEqual(plain(nodes.map((/** @type {{tagName: string}} */ n) => n.tagName)), ["UL", "OL", "P"]);
    assert.equal(nodes[0].children.length, 2);
    assert.equal(nodes[1].children.length, 2);
  });

  it("joins wrapped paragraph lines with a single space", () => {
    const { api } = helpCase();
    const [paragraph] = api.renderMarkdownNodes("one\n   two   \nthree");
    assert.equal(paragraph.textContent, "one two three");
  });

  it("answers a placeholder for an article with no blocks", () => {
    const { api } = helpCase();
    const [placeholder] = api.renderMarkdownNodes("   \n\n  ");
    assert.equal(placeholder.className, "placeholder-copy");
    assert.equal(placeholder.textContent, "This article is empty.");
  });
});

describe("Help markdown tables", () => {
  it("recognises a table only when a divider follows the header", () => {
    const { api } = helpCase();
    assert.equal(api.isTableStart(["| a | b |", "| --- | --- |"], 0), true);
    assert.equal(api.isTableStart(["| a | b |", "just text"], 0), false);
    assert.equal(api.isTableStart(["| a | b |"], 0), false, "a header at the end of the article is not a table");
  });

  it("splits cells and trims the outer pipes", () => {
    const { api } = helpCase();
    assert.deepEqual(plain(api.splitTableCells("|  a | b  |")), ["a", "b"]);
    assert.deepEqual(plain(api.splitTableCells("a | b")), ["a", "b"]);
    assert.deepEqual(plain(api.splitTableCells(null)), [""]);
  });

  it("builds a header row and a body row per remaining line", () => {
    const { api } = helpCase();
    const table = api.tableElement(["| a | b |", "| 1 | 2 |", "| 3 | 4 |"]);
    const [thead, tbody] = table.children;
    assert.equal(thead.children[0].children.length, 2);
    assert.equal(thead.children[0].children[0].tagName, "TH");
    assert.equal(tbody.children.length, 2);
    assert.equal(tbody.children[0].children[0].tagName, "TD");
  });

  it("renders a table through the block reader and stops at the first non-row", () => {
    const { api } = helpCase();
    const nodes = api.renderMarkdownNodes("| a | b |\n| --- | --- |\n| 1 | 2 |\n\nafter");
    assert.deepEqual(plain(nodes.map((/** @type {{tagName: string}} */ n) => n.tagName)), ["TABLE", "P"]);
  });

  /**
   * **A single-column table is not one**, because the divider pattern requires a column
   * separator carrying a second run of dashes. Recorded as the shipped behaviour rather than
   * changed: this checkpoint types the page, and the markdown vocabulary is not its to widen.
   */
  it("reads a one-column table as paragraphs, which is what the divider pattern decides", () => {
    const { api } = helpCase();
    assert.equal(api.isTableDivider("| --- |"), false);
    const nodes = api.renderMarkdownNodes("| a |\n| --- |\n| 1 |");
    assert.deepEqual(plain(nodes.map((/** @type {{tagName: string}} */ n) => n.tagName)), ["P"]);
    assert.equal(nodes[0].textContent, "| a | | --- | | 1 |", "the three lines wrap into one paragraph");
  });

  it("refuses a divider that is not one", () => {
    const { api } = helpCase();
    assert.equal(api.isTableDivider("| --- | --- |"), true);
    assert.equal(api.isTableDivider("| :---: | ---: |"), true);
    assert.equal(api.isTableDivider("| -- | -- |"), false, "fewer than three dashes is not a divider");
    assert.equal(api.isTableDivider("| --- | --- |x"), false, "a divider must run to the end of the line");
  });
});

describe("Help inline markdown", () => {
  it("renders code, strong, emphasis and links, keeping the text between them", () => {
    const { api } = helpCase();
    const nodes = api.inlineMarkdownNodes("a `c` b **s** e *m* [L](/x) z");
    assert.deepEqual(plain(nodes.map((/** @type {{tagName: string}} */ n) => n.tagName)), [
      "#TEXT", "CODE", "#TEXT", "STRONG", "#TEXT", "EM", "#TEXT", "A", "#TEXT",
    ]);
    assert.equal(nodes[7].href, "/x");
  });

  it("does not interpret markdown inside a code span", () => {
    const { api } = helpCase();
    const [code] = api.inlineMarkdownNodes("`**not bold**`");
    assert.equal(code.tagName, "CODE");
    assert.equal(code.textContent, "**not bold**");
  });

  it("renders markdown nested inside strong and emphasis", () => {
    const { api } = helpCase();
    const [strong] = api.inlineMarkdownNodes("**outer `inner`**");
    assert.deepEqual(plain(strong.children.map((/** @type {{tagName: string}} */ n) => n.tagName)), ["#TEXT", "CODE"]);
  });

  it("appends no node for an empty run of text", () => {
    const { api } = helpCase();
    /** @type {unknown[]} */
    const nodes = [];
    api.appendTextNode(nodes, "");
    assert.equal(nodes.length, 0);
    api.appendTextNode(nodes, "x");
    assert.equal(nodes.length, 1);
  });

  it("answers plain text with one node and nothing with none", () => {
    const { api } = helpCase();
    assert.equal(api.inlineMarkdownNodes("plain").length, 1);
    assert.equal(api.inlineMarkdownNodes("").length, 0);
    assert.equal(api.inlineMarkdownNodes(null).length, 0);
  });
});

describe("Help link safety", () => {
  /** **The refusals are the point.** Each scheme below can execute if it reaches an href. */
  it("refuses every executable scheme, however it is cased or padded", () => {
    const { api } = helpCase();
    for (const href of [
      "javascript:alert(1)", "JavaScript:alert(1)", "  javascript:alert(1)  ",
      "vbscript:msgbox", "data:text/html;base64,PHNjcmlwdD4=", "DATA:text/html,x",
    ]) {
      assert.equal(api.safeHelpHref(href), "", `${href} must be refused`);
    }
  });

  it("allows the shapes a help article legitimately links to", () => {
    const { api } = helpCase();
    for (const href of [
      "https://example.test/path", "http://example.test", "mailto:help@example.test",
      "#anchor", "/notes.html", "notes.html", "notes.html?a=1#b",
    ]) {
      assert.equal(api.safeHelpHref(href), href, `${href} must be allowed`);
    }
  });

  /**
   * The trim is what lets a padded but legitimate href through - not only what stops a padded
   * hostile one, which the allowlist refuses on its own either way.
   */
  it("trims before deciding, so a padded internal link still resolves", () => {
    const { api } = helpCase();
    assert.equal(api.safeHelpHref("  /notes.html  "), "/notes.html");
    assert.equal(api.safeHelpHref(" https://example.test "), "https://example.test");
  });

  it("refuses a scheme it does not recognise, and an absent href", () => {
    const { api } = helpCase();
    assert.equal(api.safeHelpHref("ftp://example.test"), "");
    assert.equal(api.safeHelpHref("ssh://example.test"), "");
    assert.equal(api.safeHelpHref(""), "");
    assert.equal(api.safeHelpHref(null), "");
    assert.equal(api.safeHelpHref(0), "");
  });

  /**
   * **A protocol-relative href is admitted, and this records that rather than changing it.**
   * The `\/(?!\/)` alternative shows the pattern means to refuse `//host`, but the relative-path
   * alternative that follows accepts `/` as an ordinary character and re-admits it - so
   * `//evil.test/x` survives, and `rel="noopener noreferrer"` is not applied because
   * `/^https?:\/\//` does not match it either.
   *
   * This is the behaviour the page shipped with; it is **not** introduced by this checkpoint,
   * which types the file. It is pinned here so the next change to `safeHelpHref` has to decide
   * about it deliberately rather than inherit it.
   */
  it("admits a protocol-relative href today, unmarked - recorded, not endorsed", () => {
    const { api } = helpCase();
    assert.equal(api.safeHelpHref("//evil.test/x"), "//evil.test/x");
    assert.equal(api.linkElement("L", "//evil.test/x").rel, undefined);
  });

  it("marks an outbound link and leaves an internal one alone", () => {
    const { api } = helpCase();
    assert.equal(api.linkElement("L", "https://example.test").rel, "noopener noreferrer");
    assert.equal(api.linkElement("L", "/notes.html").rel, undefined);
  });

  it("renders markdown inside a link label", () => {
    const { api } = helpCase();
    const anchor = api.linkElement("read **this**", "/notes.html");
    assert.deepEqual(plain(anchor.children.map((/** @type {{tagName: string}} */ n) => n.tagName)), ["#TEXT", "STRONG"]);
  });

  /** A refused href leaves the anchor without one, so the label still reads as written. */
  it("keeps the label but not the href when the href is refused", () => {
    const { api } = helpCase();
    const anchor = api.linkElement("Click me", "javascript:alert(1)");
    assert.equal(anchor.href, undefined);
    assert.equal(anchor.textContent, "Click me");
  });
});

describe("Help rendered-HTML sanitizer", () => {
  it("keeps an allowed tag and flattens a disallowed one to its text", () => {
    const { api, node } = helpCase();
    assert.equal(api.importSafeHelpNode(node("p")).tagName, "P");
    const script = node("script");
    script.textContent = "alert(1)";
    const flattened = api.importSafeHelpNode(script);
    assert.equal(flattened.nodeType, 3);
    assert.equal(flattened.textContent, "alert(1)");
  });

  it("flattens the tags an injection would reach for", () => {
    const { api, node } = helpCase();
    for (const tag of ["script", "iframe", "object", "embed", "style", "form", "img", "svg"]) {
      assert.equal(api.importSafeHelpNode(node(tag)).nodeType, 3, `${tag} must not survive as an element`);
    }
  });

  it("copies a text node through", () => {
    const { api, document } = helpCase();
    const text = document.createTextNode("hello");
    assert.equal(api.importSafeHelpNode(text).textContent, "hello");
  });

  it("answers nothing for a node that is neither text nor an element", () => {
    const { api, node } = helpCase();
    const comment = node("div");
    comment.nodeType = 8;
    assert.equal(api.importSafeHelpNode(comment), null);
  });

  it("sanitizes an anchor's href and marks an outbound one", () => {
    const { api, node } = helpCase();
    assert.equal(api.importSafeHelpNode(node("a", { href: "javascript:alert(1)" })).href, undefined);
    assert.equal(api.importSafeHelpNode(node("a", { href: "/notes.html" })).href, "/notes.html");
    assert.equal(api.importSafeHelpNode(node("a", { href: "https://example.test" })).rel, "noopener noreferrer");
  });

  /** A class is the one attribute a `code` element keeps, and only a language name at that. */
  it("keeps a language class on code and refuses any other", () => {
    const { api, node } = helpCase();
    assert.equal(api.importSafeHelpNode(node("code", { class: "language-js" })).className, "language-js");
    assert.equal(api.importSafeHelpNode(node("code", { class: "is-evil" })).className, "");
    assert.equal(api.importSafeHelpNode(node("code", { class: "language-js extra" })).className, "");
  });

  it("keeps a checkbox disabled and drops every other input", () => {
    const { api, node } = helpCase();
    const checked = api.importSafeHelpNode(node("input", { type: "checkbox", checked: "" }));
    assert.equal(checked.type, "checkbox");
    assert.equal(checked.disabled, true);
    assert.equal(checked.checked, true);
    assert.equal(api.importSafeHelpNode(node("input", { type: "checkbox" })).checked, false);
    const text = api.importSafeHelpNode(node("input", { type: "text" }));
    assert.equal(text.type, "");
    assert.equal(text.disabled, false);
  });

  it("sanitizes children as well as the element that holds them", () => {
    const { api, node } = helpCase();
    const paragraph = node("p", {}, [node("script"), node("strong")]);
    paragraph.children[0].textContent = "alert(1)";
    const imported = api.importSafeHelpNode(paragraph);
    assert.deepEqual(plain(imported.children.map((/** @type {{tagName: string}} */ n) => n.tagName)), ["#TEXT", "STRONG"]);
  });

  it("passes the response body to the parser and imports each top-level node", () => {
    const testCase = helpCase();
    testCase.parsedBodies.push([testCase.node("p"), testCase.node("script")]);
    const nodes = testCase.api.renderSafeHtmlNodes("<p></p><script></script>");
    assert.deepEqual(plain(testCase.parsed.map((call) => call.html)), ["<p></p><script></script>"]);
    assert.deepEqual(plain(nodes.map((/** @type {{tagName: string}} */ n) => n.tagName)), ["P", "#TEXT"]);
  });

  it("answers the same placeholder as markdown for an empty body", () => {
    const testCase = helpCase();
    testCase.parsedBodies.push([]);
    const [placeholder] = testCase.api.renderSafeHtmlNodes("");
    assert.equal(placeholder.textContent, "This article is empty.");
  });
});

describe("Help status line", () => {
  it("shows a message and clears the error tone", () => {
    const { api, context } = helpCase();
    api.setStatus("Loading help...");
    assert.equal(context.statusMessage.textContent, "Loading help...");
    assert.equal(context.statusMessage.classList.contains("is-error"), false);
  });

  it("marks an error and clears the mark on the next ordinary message", () => {
    const { api, context } = helpCase();
    api.setStatus("Help is unavailable.", true);
    assert.equal(context.statusMessage.classList.contains("is-error"), true);
    api.setStatus("");
    assert.equal(context.statusMessage.classList.contains("is-error"), false);
    assert.equal(context.statusMessage.textContent, "");
  });

  it("does nothing at all when the page has no status line", () => {
    const { api, context } = helpCase();
    context.statusMessage = null;
    assert.doesNotThrow(() => api.setStatus("Loading help..."));
  });
});

describe("Help shapes this page states rather than invents", () => {
  /**
   * The wire shapes are declared and checked in the server program, which this one does not
   * include. Restating them here would create a second, unchecked copy free to drift from the
   * first, so the page states only what it verifies: that it is reading from a record.
   */
  it("reads the response as an unguaranteed record and names only what it produces", () => {
    assert.match(source, /@typedef \{Record<string, unknown>\} HelpRecord/);
    assert.match(source, /@typedef \{object\} HelpSection/);
    assert.match(source, /@typedef \{object\} HelpArticle/);
    assert.equal(/HelpSectionPayload\} |HelpArticleListPayload\} /.test(source), false,
      "and no server payload type is imported into the browser program");
  });

  /** `normalizeNavigationItem` answering `null` is how a malformed entry is dropped. */
  it("hands the navigation entries on raw so a malformed one is still dropped", () => {
    assert.match(source, /const entries = Array\.isArray\(items\) \? items : \[\];/);
    assert.equal(source.includes("normalizeNavigation(helpRecordList("), false);
  });

  /**
   * `renderSections`, `createNavigationItem`, `createArticleLink`, `renderArticle` and
   * `updateSelectedArticleLinks` own the live containers and the click wiring, so they cannot be
   * lifted. The claims below are pinned as source facts instead of left uncovered.
   */
  it("narrows the element before reading a dataset off a query result", () => {
    assert.match(source, /if \(!\(button instanceof HTMLElement\)\) \{\s*\n\s*return;/);
    assert.match(source, /button\.dataset\.helpArticleId === state\.selectedArticleId/);
  });

  it("prefers the declared navigation and falls back to the sections", () => {
    assert.match(source, /state\.navigation\.length > 0 \? state\.navigation : sectionsWithArticles\(\)/);
  });

  it("restates the id after the spread only to keep the narrowing the guard performed", () => {
    assert.match(source, /item\.id \? \[createArticleLink\(\{ \.\.\.item, id: item\.id, type: "article" \}, depth \+ 1\)\] : \[\]/);
  });

  it("narrows the response body only after the failure branch has read it", () => {
    assert.match(source, /throw new Error\(errorMessage\(body\) \|\| "Help is unavailable\."\);[\s\S]*const payload = helpRecord\(body\) \|\| \{\};/);
    assert.match(source, /throw new Error\(errorMessage\(body\) \|\| "Article is unavailable\."\);[\s\S]*renderArticle\(helpRecord\(helpRecord\(body\)\?\.article\) \|\| article\)/);
  });

  it("carries no suppression and no document query beyond the three page hosts", () => {
    assert.equal(source.split("document.querySelector(").length - 1, 3);
    for (const suppression of ["@ts-expect-error", "@ts-ignore", "eslint-disable"]) {
      assert.equal(source.includes(suppression), false, `${suppression} must not appear`);
    }
  });
});
