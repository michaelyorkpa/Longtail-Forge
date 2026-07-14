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

const context = createBrowserContext();
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

context.sessionAuthContract.installSessionAuthWarningGuard();
const firstRequest = context.window.fetch("/api/tasks/one", { method: "PATCH" });
await settleMicrotasks();

let warnings = context.document.body.children.filter((child) => child.dataset.frameworkSessionWarning !== undefined);
assert.equal(warnings.length, 1, "A protected API 401 should open one session warning.");
assert.equal(warnings[0].open, true, "The session warning should be open in the top layer.");
assert.equal(editor.open, true, "Opening the warning should preserve the module editor beneath it.");
assert.equal(context.document.activeElement.textContent, "Sign in", "The warning should focus its clear recovery action.");

const secondRequest = context.window.fetch("/api/notes/two", { method: "PUT" });
await settleMicrotasks();
warnings = context.document.body.children.filter((child) => child.dataset.frameworkSessionWarning !== undefined);
assert.equal(warnings.length, 1, "Simultaneous API 401s should not create duplicate warnings.");

const cancelEvent = createEvent("cancel");
warnings[0].dispatchEvent(cancelEvent);
assert.equal(cancelEvent.defaultPrevented, true, "Escape/cancel should not hide a required sign-in warning.");
assert.equal(warnings[0].open, true, "The required warning should remain open after cancel.");

const signInButton = warnings[0].children[0].children[2].children[0];
signInButton.dispatchEvent(createEvent("click"));
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

function createBrowserContext() {
  const document = new FakeDocument();
  const context = {
    document,
    responseStatus: 401,
    replacedLocations: [],
    URL,
  };
  context.window = {
    document,
    URL,
    location: {
      href: "http://longtail.test/tasks.html",
      origin: "http://longtail.test",
      replace(path) {
        context.replacedLocations.push(path);
      },
    },
    async fetch() {
      return { status: context.responseStatus };
    },
  };
  return context;
}

function FakeDocument() {
  this.activeElement = null;
  this.body = new FakeElement("body", this);
  this.createElement = (tagName) => new FakeElement(tagName, this);
}

function FakeElement(tagName, document) {
  this.tagName = String(tagName).toUpperCase();
  this.ownerDocument = document;
  this.children = [];
  this.dataset = {};
  this.attributes = new Map();
  this.listeners = new Map();
  this.open = false;
  this.parentNode = null;
  this.textContent = "";

  this.append = (...children) => children.forEach((child) => this.appendChild(child));
  this.appendChild = (child) => {
    child.parentNode = this;
    this.children.push(child);
    return child;
  };
  this.setAttribute = (name, value) => {
    this.attributes.set(name, String(value));
    if (name === "open") {
      this.open = true;
    }
  };
  this.removeAttribute = (name) => {
    this.attributes.delete(name);
    if (name === "open") {
      this.open = false;
    }
  };
  this.addEventListener = (type, listener, options = {}) => {
    const listeners = this.listeners.get(type) || [];
    listeners.push({ listener, once: Boolean(options.once) });
    this.listeners.set(type, listeners);
  };
  this.dispatchEvent = (event) => {
    event.target = this;
    const listeners = [...(this.listeners.get(event.type) || [])];
    listeners.forEach((entry) => {
      entry.listener(event);
      if (entry.once) {
        this.listeners.set(event.type, (this.listeners.get(event.type) || []).filter((candidate) => candidate !== entry));
      }
    });
    return !event.defaultPrevented;
  };
  this.showModal = () => {
    this.open = true;
  };
  this.close = () => {
    this.open = false;
    this.dispatchEvent(createEvent("close"));
  };
  this.remove = () => {
    if (!this.parentNode) {
      return;
    }
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  };
  this.focus = () => {
    document.activeElement = this;
  };
}

function createEvent(type) {
  return {
    type,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}
