import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
assert.doesNotMatch(readFunctionBody(stopWatch, "mountTagPicker"), /tagOptions\.length === 0/, "Stopwatch tag picker must remain visible when no tags have been pre-created");
assert.match(stopWatch, /tagIds:\s*this\.readTagIds\(\)/, "Stopwatch save payload must continue to include selected tag IDs");

assert.match(clientsProjects, /window\.LongtailForge\.tags\.mountPicker\(container,\s*\{[\s\S]*tags:\s*tagOptions,[\s\S]*selectedTags:\s*tags/, "Clients/Projects workflows must mount the shared inline tag picker with origin-aware selected tags");
assert.doesNotMatch(readFunctionBody(clientsProjects, "mountTagPicker"), /tagOptions\.length === 0/, "Clients/Projects tag picker must remain visible when no tags have been pre-created");
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

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function readFunctionBody(source, functionName) {
  const marker = `${functionName}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${functionName} function was not found`);

  const bodyStart = source.indexOf("{", start);
  assert.notEqual(bodyStart, -1, `${functionName} function body was not found`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(bodyStart, index + 1);
      }
    }
  }

  throw new Error(`${functionName} function body did not close`);
}
