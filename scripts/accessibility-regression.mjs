import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viewDirs = [
  path.join(root, "views", "public"),
  path.join(root, "views", "protected"),
];
let checks = 0;

const viewFiles = (await Promise.all(viewDirs.map(listHtmlFiles))).flat();

for (const filePath of viewFiles) {
  const html = await fs.readFile(filePath, "utf8");
  const label = path.relative(root, filePath);

  assertDocumentBasics(html, label);
  assertImagesHaveAlt(html, label);
  assertControlsHaveNames(html, label);
  assertDialogsHaveNames(html, label);
  assertStatusRegionsAreLive(html, label);
}

await assertSharedCssPatterns();

console.log(`Accessibility regression passed ${checks} checks across ${viewFiles.length} views.`);

async function listHtmlFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => path.join(directory, entry.name));
}

function assertDocumentBasics(html, label) {
  assert.match(html, /<html\b[^>]*\blang=["'][^"']+["']/i, `${label} should declare html lang`);
  assert.match(html, /<title>[^<]+<\/title>/i, `${label} should have a non-empty title`);
  assert.match(html, /<meta\b[^>]*\bname=["']viewport["'][^>]*>/i, `${label} should include a viewport meta tag`);
  checks += 1;
}

function assertImagesHaveAlt(html, label) {
  const images = matchTags(html, "img");
  const unlabeled = images.filter((tag) => !hasAttribute(tag, "alt"));

  assert.deepEqual(unlabeled, [], `${label} images should include alt text`);
  checks += 1;
}

function assertControlsHaveNames(html, label) {
  const controls = [
    ...matchTags(html, "button"),
    ...matchTags(html, "input").filter((tag) => readAttribute(tag, "type") !== "hidden"),
    ...matchTags(html, "select"),
    ...matchTags(html, "textarea"),
    ...matchTags(html, "output"),
  ];
  const links = matchTags(html, "a");
  const unlabeledControls = controls.filter((tag) => !hasAccessibleName(tag, html));
  const unlabeledLinks = links.filter((tag) => readAttribute(tag, "href") && !hasAccessibleName(tag, html));

  assert.deepEqual(
    [...unlabeledControls, ...unlabeledLinks],
    [],
    `${label} interactive controls should have accessible names`,
  );
  checks += 1;
}

function assertDialogsHaveNames(html, label) {
  const dialogs = matchElementBlocks(html, "dialog");
  const unnamed = dialogs.filter((dialog) => !(
    hasAttribute(dialog.openTag, "aria-label") ||
    hasAttribute(dialog.openTag, "aria-labelledby") ||
    /<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/i.test(dialog.body)
  ));

  assert.deepEqual(unnamed.map((dialog) => dialog.openTag), [], `${label} dialogs should have accessible names`);
  checks += 1;
}

function assertStatusRegionsAreLive(html, label) {
  const statusRegions = matchTags(html, "p")
    .filter((tag) => readAttribute(tag, "role") === "status");
  const missingLive = statusRegions.filter((tag) => !hasAttribute(tag, "aria-live"));

  assert.deepEqual(missingLive, [], `${label} status regions should declare aria-live`);
  checks += 1;
}

async function assertSharedCssPatterns() {
  const css = await fs.readFile(path.join(root, "public", "css", "longtail-forge.css"), "utf8");

  assert.match(css, /:focus-visible/, "shared CSS should include visible focus styles");
  assert.match(css, /prefers-reduced-motion:\s*reduce/, "shared CSS should respect reduced-motion preferences");
  checks += 1;
}

function matchTags(html, tagName) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>(?:[\\s\\S]*?<\\/${tagName}>)?`, "gi");

  return html.match(pattern) || [];
}

function matchElementBlocks(html, tagName) {
  const pattern = new RegExp(`(<${tagName}\\b[^>]*>)([\\s\\S]*?)<\\/${tagName}>`, "gi");
  const blocks = [];
  let match = pattern.exec(html);

  while (match) {
    blocks.push({ openTag: match[1], body: match[2] });
    match = pattern.exec(html);
  }

  return blocks;
}

function hasAccessibleName(tag, html) {
  return Boolean(
    textContent(tag).trim() ||
    hasAttribute(tag, "aria-label") ||
    hasAttribute(tag, "aria-labelledby") ||
    hasWrappingLabel(tag, html),
  );
}

function hasWrappingLabel(tag, html) {
  const index = html.indexOf(tag);

  if (index === -1) {
    return false;
  }

  const before = html.slice(0, index);
  const lastOpenLabel = before.lastIndexOf("<label");
  const lastCloseLabel = before.lastIndexOf("</label>");

  return lastOpenLabel > lastCloseLabel;
}

function hasAttribute(tag, attributeName) {
  return new RegExp(`\\b${attributeName}(?:\\s*=|\\b)`, "i").test(tag);
}

function readAttribute(tag, attributeName) {
  const match = tag.match(new RegExp(`\\b${attributeName}\\s*=\\s*["']([^"']*)["']`, "i"));

  return String(match?.[1] || "").trim().toLowerCase();
}

function textContent(tag) {
  return tag
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
