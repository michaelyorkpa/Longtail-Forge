import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

/**
 * The last five page controllers' control narrowings, each checked against whatever actually
 * builds the element - which for two of them is not markup at all.
 *
 * **A narrowing can be wrong in a way no compiler reports.** `0.33.33.38.3.4` narrowed a control
 * to `HTMLInputElement` on the strength of its binding name; the view renders a `textarea`, so the
 * narrowing refused a real control and the page stopped working in silence. The file compiled
 * clean throughout. So these cases read the producer and assert that the subtype the source
 * demands is the subtype the producer supplies.
 *
 * Two of the five have no HTML to read, and that is the point of keeping them here:
 * `[data-module-settings-form]` is built at runtime by `shared/settings-host.js`, and the
 * asset-version `meta` is injected server-side by `src/core/asset-version.js`. Tracing a binding
 * to "its markup" would have found nothing for either.
 */

const { readText } = createProjectTextReader();

const sources = {
  accountRecovery: readText("public/js/account-recovery.js"),
  dashboardEntry: readText("public/js/dashboard.entry.js"),
  moduleSettings: readText("public/js/module-settings.js"),
  notifications: readText("public/js/notifications.js"),
  splash: readText("public/js/splash.js"),
};

const hosts = {
  accountRecoveryView: readText("views/protected/account-recovery.html"),
  assetVersionInjector: readText("src/core/asset-version.js"),
  indexView: readText("views/public/index.html"),
  notificationsView: readText("views/protected/notifications.html"),
  settingsHost: readText("public/js/shared/settings-host.js"),
};

/**
 * The element a view renders for one `data-*` attribute.
 *
 * The lookahead keeps an attribute from matching a longer one that starts with it.
 * @param {string} view
 * @param {string} attribute
 * @returns {string | null}
 */
function renderedTagName(view, attribute) {
  const match = view.match(new RegExp(`<([a-z]+)\\b[^>]*\\b${attribute}(?![-\\w])[^>]*>`));

  return match ? match[1] : null;
}

/** @type {[string, string, string, string, string][]} label, source, attribute, view, element */
const MARKUP_BACKED = [
  ["the splash version line", "splash", "data-splash-version", "indexView", "p"],
  ["the splash action", "splash", "data-splash-action", "indexView", "a"],
  ["the account export button", "accountRecovery", "data-download-account-export", "accountRecoveryView", "button"],
  ["the account logout button", "accountRecovery", "data-account-recovery-logout", "accountRecoveryView", "button"],
  ["the notification module filter", "notifications", "data-notification-module-filter", "notificationsView", "select"],
  ["the notification status filters", "notifications", "data-notification-filter", "notificationsView", "button"],
];

describe("The remaining pages narrow to what their views render", () => {
  for (const [label, source, attribute, view, element] of MARKUP_BACKED) {
    it(`${label} is a <${element}>`, () => {
      assert.equal(
        renderedTagName(hosts[/** @type {keyof typeof hosts} */ (view)], attribute),
        element,
        `${attribute} must stay a <${element}>, or its narrowing refuses a control the page needs`,
      );
      assert.ok(
        sources[/** @type {keyof typeof sources} */ (source)].includes(attribute),
        `the controller must still look ${attribute} up`,
      );
    });
  }

  it("the markup reader discriminates rather than answering constantly", () => {
    assert.deepEqual(
      [
        renderedTagName(hosts.indexView, "data-splash-action"),
        renderedTagName(hosts.indexView, "data-splash-version"),
        renderedTagName(hosts.notificationsView, "data-notification-module-filter"),
      ],
      ["a", "p", "select"],
    );
    assert.equal(renderedTagName(hosts.indexView, "data-absent-control"), null);
  });
});

describe("Each narrowing names the subtype its reads require", () => {
  /** @type {[string, string, RegExp][]} label, source, the narrowing that must be present */
  const NARROWINGS = [
    ["the splash version line takes HTMLElement for hidden", "splash",
      /const splashVersion = splashVersionElement instanceof HTMLElement \? splashVersionElement : null;/],
    ["the splash action takes HTMLAnchorElement for href", "splash",
      /const splashAction = splashActionElement instanceof HTMLAnchorElement \? splashActionElement : null;/],
    ["the recovery buttons take HTMLButtonElement for disabled", "accountRecovery",
      /return element instanceof HTMLButtonElement \? element : null;/],
    ["the module filter takes HTMLSelectElement for value", "notifications",
      /const moduleFilter = moduleFilterElement instanceof HTMLSelectElement \? moduleFilterElement : null;/],
    ["the status filters are filtered to elements that carry a dataset", "notifications",
      /\.filter\(\(button\) => button instanceof HTMLElement\);/],
    ["the settings form takes HTMLElement for dataset", "moduleSettings",
      /moduleSettingsFormElement instanceof HTMLElement/],
  ];

  for (const [label, source, pattern] of NARROWINGS) {
    it(label, () => {
      assert.match(sources[/** @type {keyof typeof sources} */ (source)], pattern);
    });
  }

  it("no narrowing is an assertion", () => {
    for (const [name, source] of Object.entries(sources)) {
      assert.doesNotMatch(
        source,
        /\/\*\* @type \{HTML(Anchor|Button|Select|Meta|Form)Element[^}]*\} \*\/ \(/,
        `${name} must check its subtype rather than assert it`,
      );
    }
  });
});

describe("The two producers that are not markup", () => {
  it("the settings form is built as a form carrying its module id", () => {
    assert.match(
      hosts.settingsHost,
      /element\("form", \{\s*\n\s*className: "settings-form",\s*\n\s*dataset: \{ moduleSettingsForm: moduleId, settingsScope: "" \},/,
      "module-settings.js reads dataset off whatever this builds; there is no markup to trace",
    );
  });

  it("the asset version is injected as a real meta element carrying content", () => {
    assert.match(
      hosts.assetVersionInjector,
      /<meta data-asset-version content="\$\{escapeHtmlAttribute\(normalizedVersion\)\}">/,
      "dashboard.entry.js reads `content`, which only a meta element supplies",
    );
  });

  /**
   * The asset-version reads deliberately do **not** use `instanceof`, and this case exists so the
   * reason survives. `versionedAssetUrl` is lifted out of the file and executed in a bare `vm`
   * context by `dashboard-entry-bridge`, so it may acquire no free variable - naming
   * `HTMLMetaElement` would be a `ReferenceError` there - and that harness supplies a plain
   * object, which no `instanceof` would accept across the realm boundary either.
   *
   * `dashboardAssetVersion` is **not** lifted and is under no such constraint. It matches anyway,
   * because it is the same read of the same element. This case asserts that asymmetry explicitly,
   * so nobody has to rediscover which of the two is actually constrained.
   */
  it("the lifted asset-version reader narrows by member read, not instanceof", () => {
    const lifted = readText("tests/unit/dashboard-entry-bridge.test.mjs");
    const liftedNames = lifted.slice(lifted.indexOf("const LIFTED = ["), lifted.indexOf("];"));

    assert.match(liftedNames, /"versionedAssetUrl"/, "the constraint only holds while it is lifted");
    assert.doesNotMatch(
      liftedNames,
      /"dashboardAssetVersion"/,
      "this one is unconstrained; it matches the other by choice, not necessity",
    );
    assert.match(lifted, /querySelector: \(selector\) => \(selector === "meta\[data-asset-version\]"/);

    const reads = sources.dashboardEntry.match(
      /Reflect\.get\(Object\(document\.querySelector\("meta\[data-asset-version\]"\)\), "content"\)/g,
    );
    assert.equal(reads?.length, 2, "both asset-version reads must use the member-read narrowing");
    assert.doesNotMatch(
      sources.dashboardEntry,
      /instanceof HTMLMetaElement/,
      "a lifted function may gain no free variable, so it cannot name HTMLMetaElement",
    );
  });
});

describe("The notification title keeps its anchor correlation", () => {
  /**
   * `title` is the anchor exactly when `notification.url` is truthy, because that is the condition
   * that built it as one. The compiler cannot correlate the two, so the write is narrowed instead.
   * These cases hold both halves together: if the constructor stops depending on `url`, the
   * narrowing at the write silently stops matching it.
   */
  it("the element is built as an anchor precisely when there is a url", () => {
    assert.match(
      sources.notifications,
      /const title = notification\.url \? document\.createElement\("a"\) : document\.createElement\("span"\);/,
    );
  });

  it("the href is written under a checked anchor rather than an unchecked union", () => {
    assert.match(
      sources.notifications,
      /if \(title instanceof HTMLAnchorElement\) \{\s*\n\s*title\.href = notification\.url;\s*\n\s*\}/,
    );
  });

  it("the span arm is never given an href", () => {
    assert.equal(
      (sources.notifications.match(/title\.href = notification\.url;/g) || []).length,
      1,
      "a second write would reach the span arm; the only one must be the guarded write above",
    );
  });
});

describe("The remaining pages still degrade rather than refuse", () => {
  /**
   * None of these five pages dereferenced an unguarded control before, so none gains a refusal.
   * A wrong subtype now takes the absent path each page already has. These cases pin the guards
   * that make that true, so a later change cannot turn a skip into a throw unnoticed.
   * @type {[string, string, RegExp][]}
   */
  const GUARDS = [
    ["splash checks its version line on both branches", "splash", /if \(splashVersion && displayVersion\) \{/],
    ["splash returns before touching its action", "splash", /if \(!splashAction\) \{\s*\n\s*return;/],
    ["the recovery buttons are wired through optional chaining", "accountRecovery", /downloadButton\?\.addEventListener\(/],
    ["the logout button is wired through optional chaining", "accountRecovery", /logoutButton\?\.addEventListener\(/],
    ["the module filter is read through optional chaining", "notifications", /if \(moduleFilter\?\.value\) \{/],
    ["the settings form is wired through optional chaining", "moduleSettings", /moduleSettingsForm\?\.addEventListener\("submit"/],
    ["the settings module id is read through optional chaining", "moduleSettings", /return moduleSettingsForm\?\.dataset\.moduleSettingsForm \|\| "";/],
  ];

  for (const [label, source, pattern] of GUARDS) {
    it(label, () => {
      assert.match(sources[/** @type {keyof typeof sources} */ (source)], pattern);
    });
  }

  it("no page gains a refusal helper for a control it used to skip", () => {
    for (const [name, source] of Object.entries(sources)) {
      assert.doesNotMatch(
        source,
        /throw new TypeError\(`?The (splash|account recovery|notifications) page requires/,
        `${name} degrades on an absent control; a refusal would be new behaviour`,
      );
    }
  });
});
