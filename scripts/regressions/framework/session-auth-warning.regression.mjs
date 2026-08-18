export const regressionMeta = Object.freeze({
  id: "framework.session-auth-warning",
  area: "framework",
  tier: "focused",
  tags: ["authentication", "modal", "session"],
  description: "Proves expired protected-app sessions surface one framework-owned foreground warning above open editors.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { createFakeBrowserContext, createFakeEvent } from "../../test-support/fake-dom.mjs";

const navigationSource = await fs.readFile("public/js/navigation.js", "utf8");
const stylesheet = await fs.readFile("public/css/longtail-forge.css", "utf8");

assert.match(
  navigationSource,
  /window\.LongtailForge\.sessionAuthWarnings\s*=\s*\{[\s\S]*show:\s*showSessionAuthWarning/,
  "The authenticated app shell should expose the framework session-warning owner.",
);
assert.ok(
  navigationSource.indexOf("installSessionAuthWarningGuard();") < navigationSource.indexOf("loadAppShellBootstrap();"),
  "The session warning guard should install before the app shell makes its first API request.",
);
assert.match(
  navigationSource,
  /response\?\.status === 401 && isAppApiRequest\(args\[0\]\)/,
  "Only protected-app API 401 responses should trigger the session warning.",
);
assert.match(
  navigationSource,
  /dialog\.className = "app-dialog framework-session-warning"[\s\S]*dialog\.setAttribute\("role", "alertdialog"\)[\s\S]*dialog\.showModal\(\)/,
  "The warning should be a framework-styled native top-layer alert dialog.",
);
assert.match(
  navigationSource,
  /if \(sessionAuthWarningPromise\)[\s\S]*return sessionAuthWarningPromise/,
  "Concurrent expired requests should reuse one warning rather than stacking duplicates.",
);
assert.match(
  stylesheet,
  /\.framework-session-warning\[open\]\s*\{[\s\S]*position:\s*fixed;[\s\S]*inset:\s*0;[\s\S]*z-index:\s*10020;/,
  "The non-top-layer fallback should still stay above existing app overlays.",
);

const context = createFakeBrowserContext({ iconButton: false, globals: { URL }, window: { URL } });
context.responseStatus = 401;
context.replacedLocations = [];
context.window.location = {
  href: "http://longtail.test/tasks.html",
  origin: "http://longtail.test",
  replace(path) {
    /** @type {string[]} */ (context.replacedLocations).push(path);
  },
};
context.window.fetch = async () => ({ status: context.responseStatus });
const executableSource = [
  'const SESSION_LOGIN_PATH = "/login.html";',
  "let sessionAuthWarningPromise = null;",
  extractFunction(navigationSource, "installSessionAuthWarningGuard"),
  extractFunction(navigationSource, "isAppApiRequest"),
  extractFunction(navigationSource, "showSessionAuthWarning"),
  "this.sessionAuthContract = { installSessionAuthWarningGuard, showSessionAuthWarning };",
].join("\n");

vm.runInNewContext(executableSource, context, { filename: "session-auth-warning-contract.js" });

const editor = context.document.createElement("dialog");
editor.dataset.moduleEditor = "";
editor.showModal();
context.document.body.appendChild(editor);

/**
 * The extracted navigation.js session-warning contract installed on the vm
 * context by the executable source above.
 * @typedef {{ installSessionAuthWarningGuard: () => void, showSessionAuthWarning: Function }} SessionAuthContract
 */
/** @type {SessionAuthContract} */ (context.sessionAuthContract).installSessionAuthWarningGuard();
const firstRequest = context.window.fetch("/api/tasks/one", { method: "PATCH" });
await settleMicrotasks();

let warnings = context.document.body.children.filter((child) => child.dataset.frameworkSessionWarning !== undefined);
assert.equal(warnings.length, 1, "A protected API 401 should open one session warning.");
assert.equal(warnings[0].open, true, "The session warning should be open in the top layer.");
assert.equal(editor.open, true, "Opening the warning should preserve the module editor beneath it.");
assert.equal(context.document.activeElement?.textContent, "Sign in", "The warning should focus its clear recovery action.");

const secondRequest = context.window.fetch("/api/notes/two", { method: "PUT" });
await settleMicrotasks();
warnings = context.document.body.children.filter((child) => child.dataset.frameworkSessionWarning !== undefined);
assert.equal(warnings.length, 1, "Simultaneous API 401s should not create duplicate warnings.");

const cancelEvent = createFakeEvent("cancel");
warnings[0].dispatchEvent(cancelEvent);
assert.equal(cancelEvent.defaultPrevented, true, "Escape/cancel should not hide a required sign-in warning.");
assert.equal(warnings[0].open, true, "The required warning should remain open after cancel.");

const signInButton = warnings[0].children[0].children[2].children[0];
signInButton.dispatchEvent(createFakeEvent("click"));
await Promise.all([firstRequest, secondRequest]);

assert.deepEqual(context.replacedLocations, ["/login.html"], "The framework recovery action should route to sign in once.");
assert.equal(editor.open, true, "Routing to sign in should not programmatically close or discard the editor first.");
assert.equal(
  context.document.body.children.filter((child) => child.dataset.frameworkSessionWarning !== undefined).length,
  0,
  "The resolved warning should clean up its dialog node.",
);

context.responseStatus = 403;
await context.window.fetch("/api/tasks/forbidden");
assert.equal(
  context.document.body.children.filter((child) => child.dataset.frameworkSessionWarning !== undefined).length,
  0,
  "Permission-denied responses should not be mislabeled as expired sessions.",
);

context.responseStatus = 401;
await context.window.fetch("https://example.test/api/external");
assert.equal(
  context.document.body.children.filter((child) => child.dataset.frameworkSessionWarning !== undefined).length,
  0,
  "External 401 responses should not trigger the protected-app session warning.",
);

console.log("Framework session/auth warning regression passed.");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Expected ${name} in navigation.js`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;

  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Could not extract ${name}`);
}

async function settleMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}
