import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createProjectTextReader,
  escapeRegExp,
} from "../../scripts/test-support/source-scan.mjs";
import {
  createFakeBrowserContext,
  createFakeEvent,
} from "../../scripts/test-support/fake-dom.mjs";

describe("source-scan test support", () => {
  it("reads repository-relative UTF-8 text and caches each normalized path", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ltf-source-reader-"));
    writeFileSync(path.join(root, "sample.md"), "Résumé ✓", "utf8");
    const reader = createProjectTextReader({ root });

    expect(reader.readMarkdown("./sample.md")).toBe("Résumé ✓");
    writeFileSync(path.join(root, "sample.md"), "changed", "utf8");
    expect(reader.readText("sample.md")).toBe("Résumé ✓");
  });

  it("fails closed for unsafe paths, wrong Markdown types, and missing files", () => {
    const reader = createProjectTextReader({ root: mkdtempSync(path.join(tmpdir(), "ltf-source-reader-")) });
    expect(() => reader.readText("../package.json")).toThrow(/repository-relative path/);
    expect(() => reader.readMarkdown("package.json")).toThrow(/\.md path/);
    expect(() => reader.readText("missing.txt")).toThrow(/ENOENT/);
  });

  it("caches asynchronous UTF-8 reads through the same project boundary", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "ltf-source-reader-"));
    writeFileSync(path.join(root, "async.txt"), "naïve ✓", "utf8");
    const reader = createProjectTextReader({ root });

    await expect(reader.readTextAsync("async.txt")).resolves.toBe("naïve ✓");
    writeFileSync(path.join(root, "async.txt"), "changed", "utf8");
    await expect(reader.readTextAsync("async.txt")).resolves.toBe("naïve ✓");
  });

  it("escapes every regular-expression metacharacter", () => {
    const literal = ".*+?^${}()|[]\\";
    assert.match(literal, new RegExp(`^${escapeRegExp(literal)}$`));
  });
});

describe("fake-DOM test support", () => {
  it("supports the reviewed element, attribute, selector, and focus semantics", () => {
    const { document } = createFakeBrowserContext();
    const section = document.createElement("section");
    const button = document.createElement("button");
    button.classList.add("action");
    button.setAttribute("data-record-id", "alpha");
    button.setAttribute("tabindex", "0");
    section.append(button);
    document.body.append(section);

    expect(document.body.querySelector("section .action")).toBe(button);
    expect(document.body.querySelector('[data-record-id="alpha"]')).toBe(button);
    expect(document.body.querySelectorAll("button, [tabindex]:not([tabindex='-1'])")).toEqual([button]);
    button.focus();
    expect(document.activeElement).toBe(button);
    button.removeAttribute("data-record-id");
    expect(button.getAttribute("data-record-id")).toBeNull();
  });

  it("dispatches ordered and once-only events with cancellation", () => {
    const { document } = createFakeBrowserContext();
    const dialog = document.createElement("dialog");
    /** @type {string[]} */
    const calls = [];
    dialog.addEventListener("cancel", (/** @type {import("../../scripts/test-support/fake-dom.mjs").FakeDomEvent} */ event) => {
      calls.push("persistent");
      event.preventDefault?.();
    });
    dialog.addEventListener("cancel", () => calls.push("once"), { once: true });

    const first = createFakeEvent("cancel");
    expect(dialog.dispatchEvent(first)).toBe(false);
    dialog.dispatchEvent(createFakeEvent("cancel"));
    expect(calls).toEqual(["persistent", "once", "persistent"]);
  });

  it("rejects unsupported selectors and invalid class tokens explicitly", () => {
    const { document } = createFakeBrowserContext();
    expect(() => document.body.querySelector("div > button")).toThrow(/Unsupported selector/);
    expect(() => document.body.classList.add("two tokens")).toThrow(/whitespace/);
  });
});
