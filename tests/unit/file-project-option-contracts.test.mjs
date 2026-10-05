import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * How client/project options reach this page's pickers.
 *
 * `0.33.33.43.10` typed the plumbing, and the interesting part is what it **did not** declare.
 * `BrowserClientProjectOptionsBody` types its collections `unknown[]` and says in as many words
 * that naming their elements is the work of whoever owns that shared surface - so this page reuses
 * `normalizeClients`' published output, `NormalizedClientOption[]`, rather than settling another
 * owner's debt from the consumer that needs least of it.
 *
 * What this page *does* declare is the flattened option it builds itself, where every member is
 * proved because the builder constructs all four.
 */

const source = createProjectTextReader().readText("public/js/files.js");
const contracts = createProjectTextReader().readText("src/types/browser-contracts.d.ts");

/** @param {string} [label] what the shared optionLabel helper answers for a client */
function flatten(label = "") {
  // The label crosses into the sandbox as **data**, not as interpolated source. Building the
  // helper by embedding a value would make the code string depend on that value, which CodeQL
  // rightly reads as code construction from an unsanitized input - `JSON.stringify` sanitizes
  // data, not code. Passing it as a global keeps the source a constant.
  const sandbox = vm.createContext({ Array, String, clientOptionLabel: label });
  vm.runInContext(
    "function requireNamespace() { return { clientProjectOptions: { optionLabel: () => clientOptionLabel } }; }",
    sandbox,
  );
  vm.runInContext(extractFunctionBlock(source, "flattenProjectOptions"), sandbox);

  return vm.runInContext("flattenProjectOptions", sandbox);
}

describe("The flattener builds every member of the option it returns", () => {
  it("pairs each project with its client and a composed label", () => {
    const rows = flatten("Acme")([
      { id: "c1", projects: [{ id: "p1", optionLabel: "Rebuild" }] },
    ]);

    assert.equal(rows.length, 1);
    assert.deepEqual({ ...rows[0] }, {
      id: "p1", clientId: "c1", label: "Acme / Rebuild", projectLabel: "Rebuild",
    });
  });

  it("drops the client id for the synthetic workspace-scope entry", () => {
    const rows = flatten("Workspace")([
      { id: "ws", isWorkspaceScope: true, projects: [{ id: "p9", optionLabel: "Internal" }] },
    ]);

    assert.equal(rows[0].clientId, "", "workspace projects belong to no client");
    assert.equal(rows[0].id, "p9");
  });

  it("omits the client prefix when the client has no label", () => {
    const rows = flatten("")([{ id: "c1", projects: [{ id: "p1", optionLabel: "Rebuild" }] }]);

    assert.equal(rows[0].label, "Rebuild");
    assert.equal(rows[0].projectLabel, "Rebuild");
  });

  it("falls through to the project name, then to a placeholder", () => {
    const rows = flatten("Acme")([
      { id: "c1", projects: [{ id: "p1", name: "Named only" }, { id: "p2" }] },
    ]);

    assert.equal(rows[0].projectLabel, "Named only");
    assert.equal(rows[1].projectLabel, "Untitled Project", "a project always gets a label");

    // Carrying both, because either alone answers the same under a swapped precedence.
    const both = flatten("Acme")([
      { id: "c1", projects: [{ id: "p3", optionLabel: "Shared label", name: "Raw name" }] },
    ]);
    assert.equal(both[0].projectLabel, "Shared label", "the shared option label wins over the raw name");
  });

  it("skips a project with no id, because the option's id is what it is chosen by", () => {
    const rows = flatten("Acme")([
      { id: "c1", projects: [{ optionLabel: "No id" }, { id: "p1", optionLabel: "Keeps" }] },
    ]);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "p1");
  });

  it("tolerates a client whose projects are missing or not a list", () => {
    for (const projects of [undefined, null, "projects", 42, {}]) {
      assert.deepEqual([...flatten("Acme")([{ id: "c1", projects }])], []);
    }
  });

  it("answers an empty list for no clients at all", () => {
    assert.deepEqual([...flatten("Acme")([])], []);
  });
});

describe("The published vocabulary is reused rather than redeclared", () => {
  it("takes the shared normaliser's own output type as its input", () => {
    assert.match(
      source,
      /@param \{import\("\.\.\/\.\.\/src\/types\/browser-contracts\.js"\)\.NormalizedClientOption\[\]\} clients/,
      "normalizeClients publishes this, so the consumer must not invent a parallel shape",
    );
  });

  it("declares no local shape for the option records the contract reserves", () => {
    for (const reserved of ["NormalizedClientOption", "NormalizedProjectOption", "ClientOption"]) {
      assert.doesNotMatch(
        source,
        new RegExp(`\\}\\} ${reserved}\\b`),
        `${reserved} belongs to the shared surface, not to this page`,
      );
    }
  });

  it("the contract it defers to still records that debt as another owner's", () => {
    assert.match(
      contracts,
      /Naming the elements is the\s*\n\s*\* work of whoever owns that surface, and it is recorded as later-owner debt/,
      "if this sentence goes, the reason this page defers goes with it",
    );
    assert.match(contracts, /export interface BrowserClientProjectOptionsBody \{\s*\n\s*clients: unknown\[\];/);
  });

  it("names its own flattened option, whose members it does build", () => {
    assert.match(
      source,
      /@typedef \{\{ id: string, clientId: string, label: string, projectLabel: string \}\} FileProjectOption/,
    );
    // Anchored on its own sentence, not the phrase alone. `0.33.33.43.14` added a second
    // "**Every member is proved**" for the table-column typedef, which made a bare phrase match
    // pass even when *this* claim was mutated away - the pin stopped biting without failing.
    assert.match(
      source,
      /\*\*Every member is proved\*\*, because this page constructs all four/,
      "because the builder constructs all four",
    );
  });

  it("carries that option through the page state rather than re-deriving it", () => {
    assert.match(source, /@type \{FileProjectOption\[\]\} \*\/\s*\n\s*projects: \[\],/);
    assert.match(source, /state\.projects = flattenProjectOptions\(normalizedClients\);/);
  });
});

describe("The two consumers this checkpoint deferred were since typed", () => {
  /**
   * `0.33.33.43.10` left `createOption` and `hydrateContextSelect` untyped and said why: the filter
   * that feeds them serves a target option, whose `value` is a nested id record, and a project
   * option, whose `value` is a plain id string, so typing either consumer meant re-typing that
   * filter first. `0.33.33.43.11` did exactly that, so the deferral is **discharged** - and a spent
   * reason must not be left lying in the source, where the next reader would act on a stale excuse.
   */
  it("no longer carries the deferral, because 0.33.33.43.11 discharged it", () => {
    assert.doesNotMatch(
      source,
      /Deliberately left untyped by `0\.33\.33\.43\.10`/,
      "the reason is spent; both consumers now carry their own annotations",
    );
    assert.doesNotMatch(source, /serves \*\*two different option shapes\*\*/);
  });

  it("and the two shapes that forced the deferral are both still really there", () => {
    assert.match(
      source,
      /return JSON\.stringify\(\{\s*\n\s*clientId: fileOptionValueField\(value, "clientId"\) \|\| option\.clientId \|\| "",/,
      "the target option's value is the nested id record this serialises",
    );
    assert.match(
      source,
      /return projects\.map\(\(project\) => \(\{\s*\n\s*label: clientId \? project\.projectLabel : project\.label,\s*\n\s*value: project\.id,/,
      "the project option's value is a plain id string",
    );
  });
});
