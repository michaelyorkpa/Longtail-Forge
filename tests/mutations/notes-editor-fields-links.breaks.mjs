import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

// Explicit checkpoint proof; never run concurrently with a server or source verification.
const path = "public/js/notes.js";
const original = Buffer.from(readFileSync(path));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const before = hash(original);
const cases = [
  ["field lookup ignores its name", "modalFieldOptions", "entry.field === fieldName", "entry.field === 'other'"],
  ["option order reversed", "modalFieldOptions", "(field?.options || []).map", "(field?.options || []).slice().reverse().map"],
  ["tuple identity copied", "modalFieldOptions", "Array.isArray(entry) ? entry", "Array.isArray(entry) ? [...entry]"],
  ["record option arm discarded", "modalFieldOptions", "isResponseRecord(entry) ?", "false ?"],
  ["record value fallback changed", "modalFieldOptions", 'entry.value ?? ""', 'entry.value ?? "missing"'],
  ["empty record labels replaced", "modalFieldOptions", "entry.label ?? entry.value", "(entry.label || entry.value)"],
  ["record label falls back to blank", "modalFieldOptions", 'entry.label ?? entry.value ?? ""', 'entry.label ?? ""'],
  ["unreadable option filtered out", "modalFieldOptions", "throw new Error(\"Notes field options require string values and labels.\");", "return ['',''];"],
  ["tuple value type unchecked", "isNoteFieldOptionPair", 'typeof value[0] === "string"', "true"],
  ["tuple label type unchecked", "isNoteFieldOptionPair", 'typeof value[1] === "string"', "true"],
  ["input dataset lost", "noteInput", 'input.dataset[dataName] = "";', 'input.dataset.wrong = "";'],
  ["input default type changed", "noteInput", 'attrs.type || "text"', 'attrs.type || "search"'],
  ["input explicit type ignored", "noteInput", 'attrs.type || "text"', '"text"'],
  ["input required ignored", "noteInput", "Boolean(attrs.required)", "false"],
  ["input required by default", "noteInput", "Boolean(attrs.required)", "true"],
  ["textarea dataset lost", "noteTextarea", 'textarea.dataset[dataName] = "";', 'textarea.dataset.wrong = "";'],
  ["textarea default rows changed", "noteTextarea", "attrs.rows || 10", "attrs.rows || 1"],
  ["textarea explicit rows ignored", "noteTextarea", "attrs.rows || 10", "10"],
  ["textarea zero no longer defaults", "noteTextarea", "attrs.rows || 10", "attrs.rows ?? 10"],
  ["select dataset lost", "noteSelect", 'select.dataset[dataName] = "";', 'select.dataset.wrong = "";'],
  ["select values and labels swapped", "noteSelect", "notesOptionElement(value, label)", "notesOptionElement(label, value)"],
  ["select options reversed", "noteSelect", "options.forEach", "options.slice().reverse().forEach"],
  ["select option omitted", "noteSelect", "select.appendChild(notesOptionElement(value, label))", "value && select.appendChild(notesOptionElement(value, label))"],
  ["payload module omitted", "linkPayloadFromTarget", "moduleId: target.moduleId,", ""],
  ["payload target kind changed", "linkPayloadFromTarget", "targetType: target.targetType", "targetType: 'task'"],
  ["payload identity trimmed", "linkPayloadFromTarget", "targetId: target.targetId", "targetId: target.targetId?.trim()"],
  ["payload default identity fabricated", "linkPayloadFromTarget", "targetId: target.targetId", "targetId: target.targetId || 'made-up'"],
  ["linked field name ignored", "linkedRecordsField", "field.field === fieldName", "field.field === 'other'"],
  ["linked field copied", "linkedRecordsField", "descriptor.fields?.find((field) => field.field === fieldName) || {}", "{ ...(descriptor.fields?.find((field) => field.field === fieldName) || {}) }"],
  ["primary clients escape business scope", "notePrimaryContextSummary", "usesBusinessScope() &&", "true &&"],
  ["primary client ID presence ignored", "notePrimaryContextSummary", "note.client_id || context.client", "context.client"],
  ["primary project ID presence ignored", "notePrimaryContextSummary", "note.project_id || context.project", "context.project"],
  ["primary client label ignored", "notePrimaryContextSummary", "context.client?.label ||", "'' ||"],
  ["primary project label ignored", "notePrimaryContextSummary", "context.project?.label ||", "'' ||"],
  ["primary order reversed", "notePrimaryContextSummary", 'parts.join(" / ")', 'parts.reverse().join(" / ")'],
  ["primary separator changed", "notePrimaryContextSummary", 'parts.join(" / ")', 'parts.join(" | ")'],
  ["opaque primary label accepted", "isNoteContextLabel", 'value.label === undefined || typeof value.label === "string"', "true"],
  ["link display checks bypassed", "isNoteLinkDisplay", '.every((key) => value[key] === undefined || typeof value[key] === "string")', ".every(() => true)"],
  ["unreadable primary context throws again", "notePrimaryContextSummary", '      return "";', '      throw new Error("Notes primary context contains an unreadable label.");'],
  ["unreadable link throws again", "linkItem", "if (!isNoteLinkDisplay(link)) return null;", 'if (!isNoteLinkDisplay(link)) throw new Error("Notes linked context contains an unreadable record.");'],
  ["unreadable primary context becomes visible", "notePrimaryContextSummary", '      return "";', '      return "Unreadable";'],
  ["unreadable link becomes a row", "linkItem", "if (!isNoteLinkDisplay(link)) return null;", "if (!isNoteLinkDisplay(link)) return view.createElement('div');"],
  ["null linked rows are retained", "linkRecordNodes", "].filter(Boolean)", "].filter(() => true)"],
  ["camel link URL loses precedence", "linkItem", 'link.sourceUrl || link.source_url || ""', 'link.source_url || link.sourceUrl || ""'],
  ["stored link URL ignored", "linkItem", 'link.sourceUrl || link.source_url || ""', 'link.sourceUrl || ""'],
  ["camel link kind loses precedence", "linkItem", 'link.targetType || link.target_type || ""', 'link.target_type || link.targetType || ""'],
  ["stored link kind ignored", "linkItem", 'link.targetType || link.target_type || ""', 'link.targetType || ""'],
  ["link label fallback changed", "linkItem", "Unavailable linked context", "Missing"],
  ["explicit link subtitle ignored", "linkItem", "link.subtitle ||", "'' ||"],
  // Omitting the map was equivalent for all seven current labels (proved against
  // the baseline formatter). Re-aim at a wrong lookup instead of counting that inert break.
  ["link type label lookup uses the wrong kind", "linkItem", "typeLabels[targetType] ||", "typeLabels.project ||"],
  ["link removal receives a copy", "linkItem", "removeNoteLink(note, link)", "removeNoteLink(note, { ...link })"],
  ["link removal loses note identity", "linkItem", "removeNoteLink(note, link)", "removeNoteLink({}, link)"],
  ["archived link removal visible", "linkItem", 'remove.hidden = note.status === "archived"', "remove.hidden = false"],
  ["active link removal hidden", "linkItem", 'remove.hidden = note.status === "archived"', "remove.hidden = true"],
  ["archived link form visible", "renderLinksPanel", 'note.status === "archived"', "false"],
  ["panel initially expanded", "renderLinksPanel", "open: false", "open: true"],
  ["panel loses saved note ID", "renderLinksPanel", "noteId: note.note_id", "noteId: 'wrong'"],
  ["link search placeholder ignored", "renderLinksPanel", 'linkedRecordsField(descriptor, "target_search").placeholder ||', "'' ||"],
  ["result control no longer required", "renderLinksPanel", "targetResults.required = true", "targetResults.required = false"],
  ["add action label ignored", "renderLinksPanel", "addAction.label ||", "'' ||"],
  ["add action role ignored", "renderLinksPanel", "addAction.role ||", "'' ||"],
  ["add action behavior ignored", "renderLinksPanel", "addAction.behavior || addAction.id", "addAction.id"],
  ["add action ID fallback removed", "renderLinksPanel", "addAction.behavior || addAction.id", "addAction.behavior"],
  ["linked records not rendered", "renderLinksPanel", "...linkRecordNodes(note)", ""],
  ["loading results remain enabled", "renderLinksPanel", "targetResults.disabled = true", "targetResults.disabled = false"],
  ["loading message lost", "renderLinksPanel", "Loading records...", ""],
  ["directory query ignores type", "renderLinksPanel", "targetType: targetType.value", "targetType: 'wrong'"],
  ["directory query ignores search", "renderLinksPanel", "search: targetSearch.value", "search: ''"],
  ["directory limit changes", "renderLinksPanel", "limit: 40", "limit: 1"],
  ["directory failure message lost", "renderLinksPanel", "No records available", "Unavailable"],
  ["result control stays disabled", "renderLinksPanel", "targetResults.disabled = false", "targetResults.disabled = true"],
  ["type change no longer searches", "renderLinksPanel", 'targetType.addEventListener("change", loadTargets)', 'targetType.addEventListener("blur", loadTargets)'],
  ["search input no longer schedules", "renderLinksPanel", 'targetSearch.addEventListener("input",', 'targetSearch.addEventListener("change",'],
  ["search debounce does not cancel", "renderLinksPanel", "window.clearTimeout(searchTimer ?? undefined);", ""],
  ["search debounce duration changes", "renderLinksPanel", "window.setTimeout(loadTargets, 180)", "window.setTimeout(loadTargets, 0)"],
  ["submission no longer prevents navigation", "renderLinksPanel", "event.preventDefault();", ""],
  ["submitted link module changes", "renderLinksPanel", "moduleId: target.moduleId", "moduleId: 'wrong'"],
  ["submitted link identity changes", "renderLinksPanel", "targetId: target.targetId", "targetId: 'wrong'"],
  ["initial directory load missing", "renderLinksPanel", "    loadTargets();", ""],
];
const command = ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-editor-fields-links.test.mjs"];
let caught = 0;
/** @type {string[]} */ const inert = [];
try {
  const baseline = spawnSync(process.execPath, command, { encoding: "utf8", windowsHide: true });
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
  for (const [label, name, from, to] of cases) {
    assert.ok(label && name && from && to !== undefined);
    const region = extractFunctionBlock(source, name);
    assert.ok(region.includes(from), `${label}: intended mutation site must exist`);
    try {
      writeFileSync(path, source.replace(region, region.replaceAll(from, to)));
      const syntax = spawnSync(process.execPath, ["--check", path], { encoding: "utf8", windowsHide: true });
      assert.equal(syntax.status, 0, `${label}: syntax errors are not caught breaks\n${syntax.stderr}`);
      const result = spawnSync(process.execPath, command, { encoding: "utf8", windowsHide: true });
      const output = result.stdout + result.stderr;
      if (result.status === 0) { inert.push(label); console.log(`INERT: ${label}; diagnose before delivery`); }
      else {
        assert.equal(result.status, 1, output);
        assert.match(output, /AssertionError/, `${label}: an infrastructure or runtime crash is not assertion coverage\n${output}`);
        caught += 1; console.log(`CAUGHT: ${label}`);
      }
    } finally {
      writeFileSync(path, original); assert.equal(hash(readFileSync(path)), before, `${label}: byte restoration`);
    }
  }
} finally {
  writeFileSync(path, original); assert.equal(hash(readFileSync(path)), before, "final byte restoration");
  console.log(`Restored SHA-256 ${before}`);
}
console.log(`${caught}/${cases.length} caught; ${inert.length} inert.`);
assert.equal(inert.length, 0, `Diagnose every inert mutation: ${inert.join(", ")}`);
