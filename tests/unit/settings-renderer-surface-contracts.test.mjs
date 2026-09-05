import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const contracts = read("src/types/browser-contracts.d.ts");
const writer = read("public/js/shared/settings-renderer.js");
const governance = read("scripts/regressions/framework/full-strict-governance.regression.mjs");

/** Every runtime consumer of the surface, by the page that owns it. */
const CONSUMERS = [
  { name: "Files Settings", script: "files-settings", label: "Files settings", pages: ["files-settings"] },
  {
    name: "Module Settings",
    script: "module-settings",
    label: "Module settings",
    pages: ["developer-example", "tasks-settings", "time-tracking-settings", "workbench-settings"],
  },
  { name: "Notes Settings", script: "notes-settings", label: "Notes settings", pages: ["notes-settings"] },
  { name: "User Settings", script: "user-settings", label: "User settings", pages: ["user-settings"] },
  { name: "Workspace Settings", script: "workspace-settings", label: "Workspace settings", pages: ["workspace-settings"] },
];

const sources = Object.fromEntries(CONSUMERS.map((c) => [c.script, read("public/js/" + c.script + ".js")]));

/** @param {string} source */
function codeOnly(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/**
 * Code with its comments **and its string literals** removed.
 *
 * Each accessor names the member it is missing in its own error message, so a check that the
 * member is read exactly once would otherwise count the sentence explaining it.
 * @param {string} source
 */
function codeWithoutText(source) {
  return codeOnly(source)
    .replace(/"[^"\n]*"/g, '""')
    .replace(/'[^'\n]*'/g, "''")
    .replace(/`[^`]*`/g, "``");
}

/** @param {string} source @param {RegExp} pattern */
function countOf(source, pattern) {
  return (source.match(pattern) || []).length;
}

/** @param {string} name */
function interfaceBody(name) {
  const declaration = new RegExp("^export interface " + name + "(?: extends [A-Za-z]+)? \\{$", "m");
  const found = declaration.exec(contracts);
  assert.ok(found, name + " must be declared");
  const end = contracts.indexOf("\n}\n", found.index);
  assert.notEqual(end, -1, name + " must terminate");
  return contracts.slice(found.index + found[0].length, end);
}

const namespaceBody = interfaceBody("LongtailForgeBrowserNamespace");

describe("the surface is declared, optional, and typed by the writer's own contract", () => {
  it("declares the member as the renderer contract", () => {
    assert.match(namespaceBody, /^ {2}settingsRenderer\?: BrowserSettingsRenderer;$/m);
  });

  it("keeps it optional, because most pages never load the script", () => {
    assert.ok(!/^ {2}settingsRenderer: BrowserSettingsRenderer;$/m.test(namespaceBody));
    assert.equal(countOf(contracts, /^ {2}settingsRenderer\??:/gm), 1, "declared once");
  });

  it("declares no second renderer type to reach the member", () => {
    // Matched by prefix rather than by exact name: a looser sibling would be named for the same
    // surface, and `\\b` sits between no two word characters, so it would never have been counted.
    const renderers = [...contracts.matchAll(/^export (?:interface|type) (BrowserSettingsRenderer\w*)/gm)]
      .map((match) => match[1]);
    assert.deepEqual(renderers, ["BrowserSettingsRenderer"]);
  });

  it("still describes exactly nine methods", () => {
    const members = [...interfaceBody("BrowserSettingsRenderer").matchAll(/^ {2}([A-Za-z_][A-Za-z0-9_]*)[(?:]/gm)]
      .map((match) => match[1]);
    assert.equal(members.length, 9);
  });
});

describe("the publication is one writer, one occurrence, and now compiler-checked against the member", () => {
  it("assigns the checked object without a cast", () => {
    assert.match(writer, /root\.settingsRenderer = Object\.freeze\(settingsRendererApi\);/);
    assert.equal(countOf(writer, /root\.settingsRenderer\s*=/g), 1, "one publication occurrence");
    assert.ok(!/@type \{BrowserSettingsRenderer\} \*\/ \(/.test(writer), "no cast on the publication");
  });

  it("keeps the annotation on the literal, which is what checks the membership", () => {
    assert.match(writer, /@type \{BrowserSettingsRenderer\}\s*\n\s*\*\/\s*\n\s*const settingsRendererApi = \{/);
  });

  it("adds no second writer anywhere in the browser tree", () => {
    for (const [script, source] of Object.entries(sources)) {
      assert.ok(!/\.settingsRenderer\s*=/.test(source), script + " must not publish the surface");
    }
  });
});

describe("every consumer acquires the surface through a checked accessor", () => {
  for (const consumer of CONSUMERS) {
    it(consumer.name + " requires the renderer instead of reading it raw", () => {
      const source = sources[consumer.script];
      assert.match(source, /function requireSettingsRenderer\(\) \{/);
      assert.match(source, new RegExp('throw new Error\\("' + consumer.label
        + ' requires LongtailForge\\.settingsRenderer\\."\\);'));
      assert.match(source, /@returns \{BrowserSettingsRenderer\}/);
    });

    it(consumer.name + " reads the namespace only inside that accessor", () => {
      const source = codeWithoutText(sources[consumer.script]);
      assert.equal(
        countOf(source, /LongtailForge\??\.settingsRenderer/g),
        1,
        "exactly one namespace read, and it is the one the accessor makes",
      );
      const at = source.indexOf("function requireSettingsRenderer()");
      const body = source.slice(at, source.indexOf("\n  }\n", at) + 4 || source.length);
      assert.match(body, /LongtailForge\?\.settingsRenderer/);
    });

    it(consumer.name + " calls the surface through the accessor at every use site", () => {
      const source = codeWithoutText(sources[consumer.script]);
      const calls = countOf(source, /requireSettingsRenderer\(\)\./g);
      assert.ok(calls > 0, "the page must still use the renderer");
      assert.ok(
        !/LongtailForge\??\.settingsRenderer\??\./.test(source),
        "no direct member call survives",
      );
    });

    it(consumer.name + " does not optional-chain past a missing renderer", () => {
      const source = codeOnly(sources[consumer.script]);
      assert.ok(!/requireSettingsRenderer\(\)\?\./.test(source), "the page requires it, so it does not skip");
      assert.ok(!/settingsRenderer\?\.\w+\?\.\(/.test(source), "no silently-skipped settings behaviour");
    });
  }

  it("does not create a shared accessor module", () => {
    assert.equal(
      Object.values(sources).filter((source) => /function requireSettingsRenderer\(\)/.test(source)).length,
      CONSUMERS.length,
      "each consumer owns its own",
    );
  });
});

describe("the renderer is delivered to every page that runs a consumer, in order", () => {
  for (const consumer of CONSUMERS) {
    for (const page of consumer.pages) {
      it(page + ".html loads the renderer before " + consumer.script + ".js", () => {
        const html = read("views/protected/" + page + ".html");
        const builder = html.indexOf('src="js/shared/view-builder.js"');
        const renderer = html.indexOf('src="js/shared/settings-renderer.js"');
        const controller = html.indexOf('src="js/' + consumer.script + '.js"');

        // Both entries are proved present before any index is compared: a missing script answers
        // -1, which would otherwise read as "earliest".
        assert.notEqual(builder, -1, page + " must load view-builder.js");
        assert.notEqual(renderer, -1, page + " must load settings-renderer.js");
        assert.notEqual(controller, -1, page + " must load " + consumer.script + ".js");

        assert.ok(builder < renderer, "the view primitives the renderer requires load first");
        assert.ok(renderer < controller, "the renderer publishes before its consumer runs");
      });
    }
  }

  it("does not add the renderer to a page that has no settings consumer", () => {
    for (const page of ["user-admin", "workbench", "dashboard"]) {
      const html = read("views/protected/" + page + ".html");
      assert.ok(
        !/src="js\/shared\/settings-renderer\.js"/.test(html),
        page + " does not run a settings consumer and must not gain the script",
      );
    }
  });
});

describe("the scopes the pages pass are proved rather than assumed", () => {
  it("requires each settings form the renderer walks", () => {
    const forms = [
      ["files-settings", "requireFilesSettingsForm", "filesSettingsForm"],
      ["module-settings", "requireModuleSettingsForm", "moduleSettingsForm"],
      ["user-settings", "requireWorkspaceCreateForm", "workspaceCreateForm"],
      ["workspace-settings", "requireWorkspaceSettingsForm", "settingsForm"],
    ];
    for (const [script, accessor, holder] of forms) {
      const source = sources[script];
      assert.match(source, new RegExp("function " + accessor + "\\(\\) \\{"));
      assert.match(source, new RegExp("if \\(!" + holder + "\\) \\{"));
      assert.match(source, /@returns \{Element\}/);
    }
  });

  it("passes the required form, not the nullable holder, at every scoped call", () => {
    const scoped = /\b(validate|collectPayload|showValidationErrors|clearValidationErrors)\(/;
    for (const [script, source] of Object.entries(sources)) {
      for (const line of codeOnly(source).split("\n")) {
        if (!line.includes("requireSettingsRenderer().") || !scoped.test(line)) {
          continue;
        }
        assert.match(line, /require\w*Form\(\)/, script + " must pass a required form: " + line.trim());
      }
    }
  });

  it("leaves Notes Settings without a form accessor, because it passes only containers", () => {
    const source = sources["notes-settings"];
    assert.ok(!/requireNotesSettingsForm/.test(source));
    assert.match(source, /requireSettingsRenderer\(\)\.renderSections\(/);
    assert.match(source, /requireSettingsRenderer\(\)\.renderDisabledModuleRecovery\(/);
  });
});

describe("the dead save-action configuration is gone rather than given a contract", () => {
  it("removes both values from User Settings", () => {
    assert.ok(!/showSaveAction/.test(sources["user-settings"]));
  });

  it("leaves no showSaveAction anywhere in a consumer, the writer or the option contract", () => {
    for (const [script, source] of Object.entries(sources)) {
      assert.ok(!/showSaveAction/.test(source), script + " must not carry it");
    }
    assert.ok(!/showSaveAction/.test(writer), "the renderer never read one");
    assert.ok(!/showSaveAction/.test(interfaceBody("BrowserSettingsRenderOptions")));
  });

  it("keeps the two calls that carried it, with their other options intact", () => {
    const source = sources["user-settings"];
    assert.equal(countOf(source, /requireSettingsRenderer\(\)\.renderSections\(/g), 2);
    assert.match(source, /\{ emptyText: "No module controls are available for this workspace type\." \},/);
    assert.match(source, /\{ hideEmpty: true \},/);
  });

  it("leaves the save controls where they already lived", () => {
    const source = sources["user-settings"];
    assert.ok(
      /settingsPageController|requireSettingsPageController/.test(source),
      "the page controller still owns save state",
    );
    assert.ok(!/renderSaveAction|createSaveAction/.test(writer), "the renderer grows no save feature");
  });
});

describe("the workspace save body carries the payload it always carried", () => {
  it("builds the body in one expression rather than by reassignment", () => {
    const source = sources["workspace-settings"];
    assert.match(source, /const settings = \{\n\s*\.\.\.normalizeSettings\(\{/);
    assert.match(source, /\}\),\n\s*moduleSettings: readModuleSettingsPayload\(\),\n\s*\};/);
    assert.ok(
      !/settings\.moduleSettings = readModuleSettingsPayload\(\);/.test(source),
      "the overwritten assignment is gone",
    );
  });

  it("still sends the collected payload and still reads it twice, as before", () => {
    const source = sources["workspace-settings"];
    const at = source.indexOf("async function saveSettings()");
    const body = source.slice(at, source.indexOf("\n  function normalizeSettings", at));
    assert.equal(countOf(body, /readModuleSettingsPayload\(\)/g), 2);
    assert.match(body, /putJson\("\/api\/settings", settings\)/);
  });

  it("keeps the normalizer answering a module list and the collector a payload", () => {
    const body = interfaceBody("BrowserSettingsRenderer");
    assert.match(body, /\): BrowserResolvedSettingsModule\[\];/);
    assert.match(body, /collectPayload\(scope\?: BrowserSettingsRenderScope\): BrowserSettingsPayload;/);
  });
});

describe("the returns are adopted as the writer declares them", () => {
  it("does not cast around any renderer return", () => {
    for (const [script, source] of Object.entries(sources)) {
      assert.ok(
        !/@type \{[^}]*\} \*\/ \(requireSettingsRenderer\(\)/.test(source),
        script + " must not cast a return",
      );
      assert.ok(
        !/@type \{[^}]*\} \*\/ \(\s*require\w*\(\)/.test(source),
        script + " must not wrap a return in an assertion",
      );
    }
  });

  it("keeps the two nullable returns nullable", () => {
    const body = interfaceBody("BrowserSettingsRenderer");
    assert.equal(countOf(body, /\): HTMLElement \| null;/g), 2);
  });

  it("does not claim a section where the writer may decline one", () => {
    for (const [script, source] of Object.entries(sources)) {
      assert.ok(
        !/const \w+ = requireSettingsRenderer\(\)\.renderSection\(/.test(source)
        || /\?\.|if \(/.test(source),
        script + " must not treat a declined section as certain",
      );
    }
  });
});

describe("namespace governance records the declaration by identity", () => {
  it("removes the spent backlog entry", () => {
    const at = governance.indexOf("const UNDECLARED_PUBLICATION_BACKLOG = [");
    const backlog = governance.slice(at, governance.indexOf("];", at));
    assert.ok(!/"settingsRenderer"/.test(backlog), "the record is spent");
    assert.match(backlog, /"settingsHost"|"supportView"/, "the backlog still holds its other entries");
  });

  it("is recorded by identity rather than by an absolute declared count", () => {
    // Retargeted by `0.33.33.38.2.2.5.1`, which declared two more members and moved the ratchet
    // again. Pinning the absolute number made this assertion a tripwire for every later
    // declaration rather than a check on this one. What it defends is that **this** member left
    // the backlog and joined the declared set, which is what identity-based governance means.
    const at = governance.indexOf("const UNDECLARED_PUBLICATION_BACKLOG = [");
    const backlog = governance.slice(at, governance.indexOf("];", at));
    assert.ok(!/"settingsRenderer"/.test(backlog), "no longer an undeclared publication");
    assert.match(contracts, /^ {2}settingsRenderer\?: BrowserSettingsRenderer;$/m, "and declared on the root");
    assert.match(governance, /declarationCoverage\.knownMembers\.length, 64, "known LongtailForge members/,
      "the known set is unchanged: declaring a member does not discover one");
    assert.match(governance, /declarationCoverage\.declaredMembers\.length, \d+, "declared LongtailForge members"/,
      "the ratchet is still asserted, just not pinned to this checkpoint's number");
  });

  it("leaves the publication surface and occurrence counts alone", () => {
    assert.match(governance, /declarationCoverage\.uniqueSurfaces, 66/);
    assert.match(governance, /declarationCoverage\.publicationOccurrences, 69/);
  });
});
