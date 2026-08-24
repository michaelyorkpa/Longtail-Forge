import assert from "node:assert/strict";

import { createProjectTextReader, escapeRegExp, extractFunctionBody } from "../../test-support/source-scan.mjs";
// Consolidated under tags.current-static-contracts by 0.33.33.10.
const { readText } = createProjectTextReader();

const taskDialog = readText("public/js/task-dialog.js");
const timeEntryDialog = readText("public/js/time-entry-dialog.js");
const stopWatch = readText("public/js/stop-watch.js");
const clientsProjects = readText("public/js/clients-projects.js");
const tasksPage = readText("public/js/tasks.js");
const timeEntriesPage = readText("public/js/time-entries.js");
const helper = readText("public/js/shared/tags.js");

assert.match(taskDialog, /namespace\.tags\.mountPicker\(fields\.tagContainer,\s*\{[\s\S]*tags:\s*context\.tagOptions \|\| \[\][\s\S]*selectedTags:\s*tags/, "Task add/edit dialog must mount the shared inline tag picker with loaded tag options");
assert.match(taskDialog, /tagIds:\s*readTaskTagIds\(\)/, "Task save payload must continue to read selected tag IDs from the shared picker");
assert.match(taskDialog, /fields\.tagContainer\.hidden = true/, "Task dialog must hide inline tag controls when the shared Tags helper is unavailable");
assert.match(taskDialog, /fields\.tagContainer\.hidden = false/, "Task dialog must reshow inline tag controls when the shared Tags helper is available");

assert.match(timeEntryDialog, /namespace\.tags\.mountPicker\(fields\.tags,\s*\{[\s\S]*tags:\s*context\.tagOptions \|\| \[\][\s\S]*selectedTags:\s*tags/, "Time entry add/edit dialog must mount the shared inline tag picker with loaded tag options");
assert.match(timeEntryDialog, /tagIds:\s*tagPicker\?\.readTagIds\?\.\(\) \|\| \[\]/, "Time entry save payload must continue to read selected tag IDs from the shared picker");
assert.match(timeEntryDialog, /fields\.tags\.hidden = true/, "Time entry dialog must hide inline tag controls when the shared Tags helper is unavailable");
assert.match(timeEntryDialog, /fields\.tags\.hidden = false/, "Time entry dialog must reshow inline tag controls when the shared Tags helper is available");

assert.match(stopWatch, /window\.LongtailForge\.tags\.mountPicker\(this\.tagsContainer,\s*\{[\s\S]*tags:\s*tagOptions,[\s\S]*selectedTagIds/, "Stopwatch save/finalize flow must mount the shared inline tag picker");
// `mountTagPicker` is a class method here, not a function declaration, so no
// function extractor can find it. The method body is cut by its own
// indentation, which is what makes this assertion read the region it names.
assert.doesNotMatch(classMethodBody(stopWatch, "mountTagPicker"), /tagOptions\.length === 0/, "Stopwatch tag picker must remain visible when no tags have been pre-created");
assert.match(stopWatch, /tagIds:\s*this\.readTagIds\(\)/, "Stopwatch save payload must continue to include selected tag IDs");

assert.match(clientsProjects, /window\.LongtailForge\.tags\.mountPicker\(container,\s*\{[\s\S]*tags:\s*tagOptions,[\s\S]*selectedTags:\s*tags/, "Clients/Projects workflows must mount the shared inline tag picker with origin-aware selected tags");
assert.doesNotMatch(extractFunctionBody(clientsProjects, "mountTagPicker"), /tagOptions\.length === 0/, "Clients/Projects tag picker must remain visible when no tags have been pre-created");
assert.match(clientsProjects, /createTagPickerField\("Client Tags", client\.tags, "client"\)/, "Client edit workflow must use the shared tag picker field");
assert.match(clientsProjects, /createTagPickerField\("Project Tags", project\.tags, "project"\)/, "Project edit workflow must use the shared tag picker field");
assert.match(clientsProjects, /createTagPickerField\("Project Tags", \[\], "project"\)/, "Project add workflow must use the shared tag picker field");
assert.match(clientsProjects, /tagIds:\s*tagPicker\?\.readTagIds\?\.\(\) \|\| \[\]/, "Client add workflow must save selected tag IDs from the canonical dialog picker");
assert.match(clientsProjects, /if \(tagPicker\) \{[\s\S]*client\.tagIds = tagPicker\.readTagIds\(\);[\s\S]*\} else \{[\s\S]*delete client\.tagIds;[\s\S]*\}/, "Client edit workflow must save selected tag IDs only when the tag picker is present");
assert.match(clientsProjects, /project\.tagIds = tagPicker\.readTagIds\(\)/, "Project edit workflow must save selected tag IDs");
assert.match(clientsProjects, /tagIds:\s*tagPicker\.readTagIds\(\)/, "Project add workflow must save selected tag IDs");

assert.match(tasksPage, /appendTagChips\(titleBand, task\.tags\)/, "Task list tag rendering must remain display-only");
assert.match(timeEntriesPage, /renderTagList\(tagList, entry\.tags\)/, "Time Entries list tag rendering must remain display-only");
assert.match(helper, /options\.allowCreate !== false/, "Shared picker must default to inline creation for record workflows");

console.log("Tag record workflow regression passed.");

/**
 * Extract one class method's body by its own indentation.
 *
 * The published function extractors cannot find a method: there is no
 * `function` keyword to anchor to. The previous local helper matched the
 * method name followed by an open paren anywhere in the file, which found a
 * call site instead and made the assertion below vacuous.
 * @param {string} source
 * @param {string} methodName
 * @returns {string}
 */
function classMethodBody(source, methodName) {
  // Line based rather than offset based: these browser sources are checked out
  // with Windows line endings, and a method is delimited by the indentation of
  // its own closing brace rather than by anything a function extractor can
  // anchor to.
  const lines = source.split(/\r?\n/);
  const declaration = new RegExp(`^(\\s+)${escapeRegExp(methodName)}\\s*\\(`);
  const start = lines.findIndex((line) => declaration.test(line));
  assert.notEqual(start, -1, `${methodName} should be declared as a class method`);
  const indent = /^(\s+)/.exec(lines[start])?.[1] ?? "";
  const closing = `${indent}}`;
  let end = start + 1;
  while (end < lines.length && lines[end] !== closing) end += 1;
  assert.notEqual(end, lines.length, `${methodName} method body should close at its own indentation`);
  return lines.slice(start, end + 1).join("\n");
}