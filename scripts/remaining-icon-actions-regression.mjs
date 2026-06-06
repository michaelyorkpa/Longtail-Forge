import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const iconHelper = readText("public/js/shared/icons.js");
const tags = readText("public/js/tags.js");
const timeEntries = readText("public/js/time-entries.js");
const notifications = readText("public/js/notifications.js");
const clientsProjects = readText("public/js/clients-projects.js");
const css = readText("public/css/longtail-forge.css");
const roadmap = readText("ROADMAP.md");

["up", "down"].forEach((iconName) => {
  assert.match(iconHelper, new RegExp(`${iconName}:\\s*Object\\.freeze`), `shared icon helper must include ${iconName} for project default sort controls`);
});

assert.match(tags, /function createTagActionButton\(label, icon, options = \{\}\)/, "Tags list actions must use a local shared-icon action helper");
assert.match(tags, /createTagActionButton\("Edit", "edit"\)/, "Tags Edit must use the shared edit icon");
assert.match(tags, /createTagActionButton\(archiveLabel, tag\.status === "active" \? "archive" : "restore"/, "Tags archive/restore must use semantic archive/restore icons");
assert.match(tags, /variant: options\.danger \? "danger" : ""/, "Tags archive icon must preserve danger styling");

assert.match(timeEntries, /function createTimeEntryActionButton\(label, icon, options = \{\}\)/, "Time Entries row actions must use a local shared-icon action helper");
assert.match(timeEntries, /createTimeEntryActionButton\("Edit", "edit"\)/, "Time Entries Edit must use the shared edit icon");
assert.match(timeEntries, /createTimeEntryActionButton\("Delete", "delete", \{ danger: true \}\)/, "Time Entries Delete must use the shared delete icon with danger styling");

assert.match(notifications, /function createNotificationActionButton\(label, icon, options = \{\}\)/, "Notification quick actions must use a local shared-icon action helper");
assert.match(notifications, /createNotificationActionButton\("Read", "complete"\)/, "Notification Read must use the shared complete icon");
assert.match(notifications, /createNotificationActionButton\("Dismiss", "close", \{ danger: true \}\)/, "Notification Dismiss must use the shared close icon with danger styling");
assert.match(notifications, /const title = notification\.url \? document\.createElement\("a"\) : document\.createElement\("span"\)/, "Notification target opening must remain the existing title link");

assert.match(clientsProjects, /function createClientProjectActionButton\(label, icon, options = \{\}\)/, "Clients\/Projects actions must use a local shared-icon action helper");
assert.match(clientsProjects, /createClientProjectActionButton\("Edit", "edit"\)/, "Client and project table Edit must use the shared edit icon");
assert.match(clientsProjects, /createClientProjectActionButton\("Archive", "archive", \{ danger: true \}\)/, "Project Archive must use the shared archive icon with danger styling");
assert.match(clientsProjects, /createClientProjectActionButton\("Move up", "up"\)/, "Project default sort Move up must use the shared up icon");
assert.match(clientsProjects, /createClientProjectActionButton\("Move down", "down"\)/, "Project default sort Move down must use the shared down icon");

assert.match(css, /\.tag-row-actions \.icon-button,[\s\S]*\.project-default-sort-row \.icon-button\s*\{[\s\S]*width:\s*44px/, "Pass 3 icon-only row controls must stay compact");
assert.match(roadmap, /### Pass 3 - Convert remaining repeated row actions[\s\S]*- \[x\] Convert Tags list actions/, "Roadmap must mark Pass 3 Tags actions complete");
assert.match(roadmap, /### Pass 3 - Convert remaining repeated row actions[\s\S]*- \[x\] Convert notification quick actions only if they remain obvious/, "Roadmap must mark Pass 3 notification actions complete");

console.log("Remaining icon actions regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
