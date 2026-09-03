import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const service = read("src/modules/lists/lists.service.js");
const providerContract = read("src/core/linked-context/provider-contract.js");
const routes = read("src/modules/lists/lists.routes.js");
const consumer = read("public/js/lists.js");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener */
function functionBody(source, opener) {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf("\n}\n", start);
  return source.slice(start, end === -1 ? source.length : end);
}

/** @param {string} name */
function declaredInterface(name) {
  const at = contracts.indexOf("export interface " + name + " {");
  assert.notEqual(at, -1, name + " must be declared");
  return contracts.slice(at, contracts.indexOf("\n}", at));
}

/** @param {string} declared */
function declaredMembers(declared) {
  return [...declared.matchAll(/^ {2}(\w+)\??:/gm)].map((entry) => entry[1]).sort();
}

/** The shipped envelope reader, instantiated from the page's own source. */
function shippedReader() {
  /** @param {string} opener */
  const slice = (opener) => {
    const start = consumer.indexOf(opener);
    assert.notEqual(start, -1, opener + " must exist in the page source");
    return consumer.slice(start, consumer.indexOf("\n  }\n", start) + 4);
  };
  const tables = [...consumer.matchAll(/const (LIST_LINK_TARGET_TYPES|LINK_PROVIDER_MEMBERS|LINK_TARGET_REQUIRED_TEXT|LINK_TARGET_OPTIONAL_TEXT|LINK_TARGET_LIST_LABELS) = Object\.freeze\(\[[\s\S]*?\]\);/g)]
    .map((entry) => entry[0]);
  assert.equal(tables.length, 5, "all five reader tables must exist in the page source");
  return new Function([
    ...tables,
    slice("function isLinkTargetRecord(value) {"),
    slice("function readLinkTargetProvider(entry) {"),
    slice("function readPrimaryContextHints(value) {"),
    slice("function readListLinkTarget(entry) {"),
    slice("function readListLinkTargetsEnvelope(body) {"),
    "return readListLinkTargetsEnvelope;",
  ].join("\n"))();
}

const provider = (overrides = {}) => ({
  id: "lists:client",
  label: "Clients",
  moduleId: "clients",
  providerId: "client-provider",
  targetType: "client",
  ...overrides,
});
const target = (overrides = {}) => ({
  ariaLabel: "Acme Ltd",
  clientId: "",
  displayLabel: "Acme Ltd",
  fullLabel: "Acme Ltd",
  isAvailable: true,
  moduleId: "clients",
  projectId: "",
  secondaryLabel: "",
  sortKey: "acme ltd",
  sourceUrl: "",
  targetId: "client-1",
  targetType: "client",
  title: "Acme Ltd",
  workspaceId: "ws-1",
  ...overrides,
});
const body = (overrides = {}) => ({ providers: [provider()], targets: [target()], ...overrides });

describe("the link-target producer", () => {
  const listBody = functionBody(service, "async function listLinkTargets(session, query = {}) {");

  it("reconstructs two members and spreads nothing", () => {
    const at = listBody.indexOf("return {");
    const literal = listBody.slice(at);
    // `[:,]`, so a member added in shorthand form is as visible as one added with a colon.
    const members = [...literal.matchAll(/^ {4}(\w+)[:,]/gm)].map((entry) => entry[1]).sort();
    assert.deepEqual(members, ["providers", "targets"], "the envelope must carry exactly two members");
    assert.ok(!literal.includes("..."), "a spread would make the exact membership unearned");
  });

  it("advertises exactly five members per provider", () => {
    const at = listBody.indexOf("providers: activeProviders.map");
    const projection = listBody.slice(at, listBody.indexOf("})", at));
    const members = [...projection.matchAll(/^ {6}(\w+)[:,]/gm)].map((entry) => entry[1]).sort();
    assert.deepEqual(
      members,
      ["id", "label", "moduleId", "providerId", "targetType"],
      "the provider projection must name exactly the five declared members",
    );
  });

  it("cannot answer a success with no provider", () => {
    assert.match(
      listBody,
      /activeProviders\[0\]\?\.targetType \|\| ""/,
      "the target type must fall back to the first active provider",
    );
    assert.match(
      listBody,
      /if \(!targetType \|\| !activeProviders\.some\([\s\S]*?\)\) \{\n {4}throw new AppError\("Linked target type is not available/,
      "an empty provider catalogue must throw before the route can answer",
    );
  });

  it("gates the read on the module and the link permission before reading anything", () => {
    assert.match(listBody, /assertModuleWriteEnabled\(session, LIST_MODULE_ID\)/, "the Lists module must be writable");
    assert.match(
      listBody,
      /permissionsService\.assertCanInAnyScope\(session, LIST_PERMISSIONS\.MANAGE_LINKS/,
      "the link-management permission must be asserted",
    );
    assert.ok(
      listBody.indexOf("assertModuleWriteEnabled") < listBody.indexOf("listActiveLinkedContextProviders"),
      "both gates must run before any provider is discovered",
    );
  });

  it("hands the result to the browser unchanged", () => {
    const at = routes.indexOf('listsRoutes.get("/lists/link-targets"');
    assert.notEqual(at, -1, "the link-target route must exist");
    const route = routes.slice(at, routes.indexOf("}));", at));
    assert.match(route, /listsService\.listLinkTargets\(/, "the route must call the traced producer");
  });
});

describe("the Lists target-type vocabulary", () => {
  /** Every word the supported-type set lists, scanned rather than searched for. */
  const supportedWords = () => {
    const match = /const LIST_LINK_TARGET_TYPES = new Set\(\[([\s\S]*?)\]\)/.exec(service);
    assert.ok(match, "the supported-type set must be a literal this proof can read");
    return [...match[1].matchAll(/"(\w+)"/g)].map((entry) => entry[1]).sort();
  };

  it("publishes exactly four types", () => {
    assert.deepEqual(
      supportedWords(),
      ["client", "note", "project", "task"],
      "the Lists supported-type set must hold exactly four types",
    );
  });

  it("filters every advertised provider through that set", () => {
    assert.match(
      functionBody(service, "function isListLinkTargetProvider(provider) {"),
      /LIST_LINK_TARGET_TYPES\.has\(provider\.targetType\)/,
      "a provider outside the set must never be advertised",
    );
    assert.match(
      functionBody(service, "async function listLinkTargets(session, query = {}) {"),
      /\.filter\(isListLinkTargetProvider\)/,
      "the route must apply that filter",
    );
  });

  it("closes the declared union over exactly those words", () => {
    const match = /export type BrowserListLinkTargetType = ([^;]+);/.exec(contracts);
    assert.ok(match, "BrowserListLinkTargetType must be declared");
    assert.deepEqual(
      [...match[1].matchAll(/"(\w+)"/g)].map((entry) => entry[1]).sort(),
      supportedWords(),
      "the declared union must be the service's own set and nothing wider",
    );
  });

  it("uses that union on both records, and the reader table matches it", () => {
    assert.match(declaredInterface("BrowserListLinkTargetProvider"), /targetType: BrowserListLinkTargetType;/,
      "the provider record must carry the closed vocabulary");
    assert.match(declaredInterface("BrowserListLinkTarget"), /targetType: BrowserListLinkTargetType;/,
      "the target record must carry the closed vocabulary");
    const table = /const LIST_LINK_TARGET_TYPES = Object\.freeze\(\[([\s\S]*?)\]\);/.exec(consumer);
    assert.ok(table, "the reader must carry the vocabulary as a frozen table");
    assert.deepEqual(
      [...table[1].matchAll(/"(\w+)"/g)].map((entry) => entry[1]).sort(),
      supportedWords(),
      "the reader's table must be the service's own set",
    );
  });
});

describe("the shared linked-context contract this producer relies on", () => {
  it("reconstructs every target member by name", () => {
    const normalizer = functionBody(providerContract, "function normalizeLinkedContextTarget(target = {}, provider = {}) {");
    const at = normalizer.indexOf("const normalized = {");
    const literal = normalizer.slice(at, normalizer.indexOf("\n  };", at));
    const members = [...literal.matchAll(/^ {4}(\w+):/gm)].map((entry) => entry[1]).sort();
    assert.deepEqual(
      members,
      [
        "clientId", "displayLabel", "isAvailable", "moduleId", "projectId", "secondaryLabel",
        "sortKey", "sourceUrl", "targetId", "targetType", "workspaceId",
      ],
      "the framework normaliser must reconstruct exactly these eleven members",
    );
    assert.ok(!literal.includes("..."), "and must not spread the raw target into them");
  });

  it("refuses a label that is, or echoes, an identifier", () => {
    const validator = functionBody(providerContract, "function validateLinkedContextTarget(target = {}, provider = {}) {");
    assert.match(validator, /looksLikeRawIdentifier\(value\)/, "a raw-identifier label must be refused");
    assert.match(validator, /matchesHiddenIdentifier\(value, normalized\)/, "an echoed identifier must be refused");
    const safeFields = /const SAFE_LABEL_FIELDS = Object\.freeze\(\[([\s\S]*?)\]\)/.exec(providerContract);
    assert.ok(safeFields, "the safe-label field set must be a literal");
    assert.deepEqual(
      [...safeFields[1].matchAll(/"(\w+)"/g)].map((entry) => entry[1]).sort(),
      ["displayLabel", "secondaryLabel"],
      "exactly the two rendered labels must carry the safety guarantee",
    );
    const hidden = functionBody(providerContract, "function matchesHiddenIdentifier(value, target) {");
    for (const identifier of ["targetId", "clientId", "projectId", "workspaceId"]) {
      assert.ok(hidden.includes("target." + identifier), "the echo check must cover " + identifier);
    }
  });

  it("is what every Lists target passes through, before Lists names three labels", () => {
    const shaper = functionBody(service, "function shapeListLinkTarget(target, provider) {");
    assert.match(shaper, /assertLinkedContextTargetContract\(\{\n {4}\.\.\.target,/, "every target must cross the shared contract");
    assert.match(shaper, /return \{\n {4}\.\.\.normalized,/, "and the result is what the Lists record spreads");
    const at = shaper.indexOf("return {");
    // `[:,]` rather than `:` alone, because `title` is written as a shorthand property and a
    // colon-only scan would silently report two labels where the shaper names three.
    const added = [...shaper.slice(at).matchAll(/^ {4}(\w+)[:,]/gm)].map((entry) => entry[1]).sort();
    assert.deepEqual(added, ["ariaLabel", "fullLabel", "title"], "Lists must add exactly three labels");
  });
});

describe("the declarations", () => {
  it("declares the provider projection and nothing else", () => {
    const declared = declaredInterface("BrowserListLinkTargetProvider");
    assert.deepEqual(
      declaredMembers(declared),
      ["id", "label", "moduleId", "providerId", "targetType"],
      "the provider record must be the five-member projection",
    );
    assert.ok(!/^ {2}\w+\?:/m.test(declared), "no provider member may be optional");
  });

  it("declares the normaliser's members plus Lists' three labels", () => {
    const normalizer = functionBody(providerContract, "function normalizeLinkedContextTarget(target = {}, provider = {}) {");
    const at = normalizer.indexOf("const normalized = {");
    const produced = [...normalizer.slice(at, normalizer.indexOf("\n  };", at)).matchAll(/^ {4}(\w+):/gm)]
      .map((entry) => entry[1]);
    const expected = [...produced, "ariaLabel", "fullLabel", "title", "primaryContextHints"].sort();
    assert.deepEqual(
      declaredMembers(declaredInterface("BrowserListLinkTarget")),
      expected,
      "the target record must equal the framework reconstruction plus the Lists labels",
    );
  });

  it("makes only the hints optional, because only they are conditional", () => {
    const declared = declaredInterface("BrowserListLinkTarget");
    const optional = [...declared.matchAll(/^ {2}(\w+)\?:/gm)].map((entry) => entry[1]);
    assert.deepEqual(optional, ["primaryContextHints"], "only the conditional member may be optional");
    assert.match(
      functionBody(providerContract, "function normalizeLinkedContextTarget(target = {}, provider = {}) {"),
      /if \(target\.primaryContextHints !== undefined \|\| target\.primary_context_hints !== undefined\)/,
      "and it must genuinely be conditional in the producer",
    );
  });

  it("keeps the provider and target records apart", () => {
    const envelope = declaredInterface("BrowserListLinkTargetsEnvelope");
    assert.deepEqual(declaredMembers(envelope), ["providers", "targets"], "the envelope carries exactly two members");
    assert.match(envelope, /providers: BrowserListLinkTargetProvider\[\];/,
      "the catalogue member must carry the provider record");
    assert.match(envelope, /targets: BrowserListLinkTarget\[\];/,
      "the roster member must carry the target record");
    assert.ok(
      !declaredInterface("BrowserListLinkTargetProvider").includes("displayLabel"),
      "the provider record must not drift into the target record's members",
    );
  });
});

describe("the shipped reader, run against real bodies", () => {
  const readEnvelope = shippedReader();

  it("accepts a real envelope", () => {
    const result = readEnvelope(body());
    assert.ok(result, "a valid envelope must be accepted");
    assert.equal(result.providers.length, 1, "the provider catalogue must survive");
    assert.equal(result.targets[0].targetId, "client-1", "and so must the targets");
  });

  it("refuses a body that is not an envelope", () => {
    for (const bad of [null, undefined, 7, "targets", [], {}, { providers: [provider()] }, { targets: [] }]) {
      assert.equal(readEnvelope(bad), null, "an unusable envelope must be refused: " + JSON.stringify(bad));
    }
  });

  it("refuses an empty provider catalogue rather than letting the page invent one", () => {
    assert.equal(readEnvelope(body({ providers: [] })), null,
      "a catalogue this producer cannot answer must not reach the local provider fallback");
  });

  it("refuses the catalogue when one provider is malformed, rather than filtering it", () => {
    for (const broken of [
      provider({ targetType: "workspace" }),
      provider({ label: "" }),
      provider({ moduleId: 7 }),
      provider({ providerId: undefined }),
      "provider",
    ]) {
      assert.equal(
        readEnvelope(body({ providers: [provider(), broken] })),
        null,
        "a malformed provider must refuse the response: " + JSON.stringify(broken),
      );
    }
  });

  it("accepts a search that legitimately matched nothing", () => {
    const result = readEnvelope(body({ targets: [] }));
    assert.ok(result, "an empty target list is a real answer");
    assert.deepEqual(result.targets, [], "and is answered as the empty list it is");
  });

  it("refuses the response when one target is malformed", () => {
    for (const broken of [
      target({ targetType: "workspace" }),
      target({ displayLabel: "" }),
      target({ workspaceId: "" }),
      target({ isAvailable: "yes" }),
      target({ sourceUrl: null }),
      target({ title: "" }),
      "target",
    ]) {
      assert.equal(
        readEnvelope(body({ targets: [target(), broken] })),
        null,
        "a malformed target must refuse the response: " + JSON.stringify(broken),
      );
    }
  });

  it("allows the four members the server lets be empty", () => {
    const result = readEnvelope(body({
      targets: [target({ clientId: "", projectId: "", secondaryLabel: "", sourceUrl: "" })],
    }));
    assert.ok(result, "an empty optional member must not refuse the target");
  });

  it("treats absent hints as an answer and unreadable hints as a refusal", () => {
    const without = readEnvelope(body());
    assert.ok(without, "a target with no hints must be accepted");
    assert.equal(
      Object.prototype.hasOwnProperty.call(without.targets[0], "primaryContextHints"),
      false,
      "and must not gain the member",
    );
    const withHints = readEnvelope(body({ targets: [target({ primaryContextHints: { client: "Acme" } })] }));
    assert.ok(withHints, "a target with text hints must be accepted");
    assert.deepEqual(withHints.targets[0].primaryContextHints, { client: "Acme" }, "and answer them");
    for (const bad of [{ client: 7 }, "hints", []]) {
      assert.equal(
        readEnvelope(body({ targets: [target({ primaryContextHints: bad })] })),
        null,
        "unreadable hints must refuse the target: " + JSON.stringify(bad),
      );
    }
  });

  it("answers its own records rather than the wire objects", () => {
    const wire = body({ targets: [target({ aFutureMember: 1 })] });
    const result = readEnvelope(wire);
    assert.ok(result, "an unrecognised member must not refuse the target");
    assert.equal(
      Object.prototype.hasOwnProperty.call(result.targets[0], "aFutureMember"),
      false,
      "but must not be answered, because the target is reconstructed",
    );
    assert.notEqual(result.targets[0], wire.targets[0], "the answered target must not be the wire object");
  });
});

describe("the lists consumer", () => {
  it("no longer defaults either member of an unread body", () => {
    assert.ok(!consumer.includes("result.providers || []"), "the raw provider default must be gone");
    assert.ok(!consumer.includes("result.targets || []"), "the raw target default must be gone");
  });

  it("refuses an unreadable body before the local provider fallback can see it", () => {
    assert.match(
      consumer,
      /throw new Error\("Linked target options could not be read\./,
      "an unreadable body must take the picker's error path",
    );
    const loader = functionBody(consumer, "  async function loadListEditorLinkTargets()");
    assert.ok(
      loader.indexOf("could not be read.") < loader.indexOf("listLinkProviderOptions("),
      "the refusal must happen before the local provider normaliser is called",
    );
  });

  it("keeps the local provider normaliser, which owns picker concerns this child does not", () => {
    assert.match(consumer, /function listLinkProviderOptions\(/, "the normaliser must still exist");
    assert.match(
      consumer,
      /listLinkProviderOptions\(envelope\.providers\)/,
      "and must now receive a catalogue the browser has vouched for",
    );
  });

  it("annotates only the two slots that receive the narrowed value", () => {
    for (const slot of ["linkTargets", "editorStagedTargets"]) {
      const at = consumer.indexOf("    " + slot + ": [],");
      assert.notEqual(at, -1, slot + " must still be an empty-initialised slot");
      assert.match(
        consumer.slice(Math.max(0, at - 400), at),
        /@type \{BrowserListLinkTarget\[\]\}/,
        slot + " must carry the narrowed target type",
      );
    }
  });
});
