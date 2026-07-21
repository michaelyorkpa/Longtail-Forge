import { readFileSync } from "node:fs";
import { loadDocsOwnershipIndex } from "./lib/docs-change-routing.mjs";
import { AREA_COMMANDS, ROUTE_RULES } from "./lib/regression-change-routing.mjs";

const roadmap = readFileSync("ROADMAP.md", "utf8");
const decisions = readFileSync("DECISIONS.md", "utf8");
const cursor = roadmap.match(/^Active cursor: `([^`]+)`\./m)?.[1];
if (!cursor) throw new Error("ROADMAP.md must declare an active cursor.");
const escapedCursor = cursor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sliceMatch = roadmap.match(new RegExp(`^### Version ${escapedCursor}[^\\n]*[\\s\\S]*?(?=^### Version |^## Version |(?![\\s\\S]))`, "m"));
if (!sliceMatch) throw new Error(`Unable to find active roadmap slice ${cursor}.`);
const activeSlice = sliceMatch[0].trim();
const tokens = meaningfulTokens(activeSlice);

const decisionSections = decisionParagraphs(decisions)
  .map((section) => ({ score: scoreText(section, tokens), section }))
  .filter(({ score }) => score > 0)
  .sort((left, right) => right.score - left.score)
  .slice(0, 6);

const ownership = loadDocsOwnershipIndex();
const docsAreas = ownership.areas
  .map((area) => ({ area, score: scoreText(`${area.id} ${area.label} ${area.docs.join(" ")} ${area.sourcePatterns.map(({ expression }) => expression).join(" ")}`, tokens) }))
  .filter(({ score }) => score > 0)
  .sort((left, right) => right.score - left.score)
  .slice(0, 3);

const testAreas = [...new Set(ROUTE_RULES
  .map((rule) => ({ rule, score: scoreText(`${rule.reason} ${rule.areas.join(" ")}`, tokens) }))
  .filter(({ score }) => score > 0)
  .sort((left, right) => right.score - left.score)
  .flatMap(({ rule }) => rule.areas))]
  .filter((area) => AREA_COMMANDS[area])
  .slice(0, 6);

console.log(`# Agent brief: ${cursor}\n`);
console.log("## Active roadmap slice and acceptance criteria\n");
console.log(activeSlice);
console.log("\n## Relevant governing decisions\n");
for (const { section } of decisionSections) console.log(`${section}\n`);
console.log("## Documentation owners\n");
for (const { area } of docsAreas) console.log(`- ${area.label}: ${area.docs.slice(0, 6).join(", ")}${area.docs.length > 6 ? ", ..." : ""}`);
console.log("\n## Likely test commands\n");
for (const area of testAreas) console.log(`- ${AREA_COMMANDS[area]}`);
console.log("- npm run docs:suggest");
console.log("- npm run verify:slice");

function meaningfulTokens(value) {
  const stop = new Set(["acceptance", "criteria", "version", "changes", "current", "without", "through", "every", "only", "complete", "required", "active", "slice"]);
  return new Set(String(value).toLowerCase().match(/[a-z][a-z0-9-]{3,}/g)?.filter((token) => !stop.has(token)) || []);
}

function scoreText(value, selectedTokens) {
  const haystack = String(value).toLowerCase();
  let score = 0;
  for (const token of selectedTokens) if (haystack.includes(token)) score += token.length >= 9 ? 2 : 1;
  return score;
}

function decisionParagraphs(source) {
  const results = [];
  let heading = "DECISIONS";
  for (const block of source.split(/\r?\n\r?\n/)) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("## ")) {
      const [firstLine, ...rest] = trimmed.split(/\r?\n/);
      heading = firstLine;
      if (rest.length > 0) addDecisionUnits(results, heading, rest.join("\n"));
      continue;
    }
    if (!trimmed.startsWith("# ")) addDecisionUnits(results, heading, trimmed);
  }
  return results;
}

function addDecisionUnits(results, heading, value) {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const bullets = lines.filter((line) => line.startsWith("- "));
  if (bullets.length > 0) {
    for (const bullet of bullets) results.push(`${heading}\n\n${bullet}`);
    return;
  }
  results.push(`${heading}\n\n${value.trim()}`);
}
