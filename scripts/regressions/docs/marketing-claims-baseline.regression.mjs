export const regressionMeta = Object.freeze({
  id: "docs.marketing-claims-baseline",
  area: "docs",
  tier: "focused",
  tags: ["claims", "licensing", "marketing", "preview"],
  description: "Keeps marketing status, proof, and preview-invitation boundaries aligned with the shipped baseline.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const paths = [
  "README.md",
  "docs/marketing/README.md",
  "docs/marketing/audiences-and-use-cases.md",
  "docs/marketing/claims-and-proof-register.md",
  "docs/marketing/demo-stories.md",
  "docs/marketing/design-partner-plan.md",
  "docs/marketing/faq-draft.md",
  "docs/marketing/feature-outcome-map.md",
  "docs/marketing/friends-and-family-preview.md",
  "docs/marketing/launch-plan.md",
  "docs/marketing/positioning-and-messaging.md",
  "docs/marketing/website-copy-draft.md",
];
const documents = new Map(paths.map((path) => [path, readFileSync(path, "utf8")]));
const marketing = [...documents.entries()]
  .filter(([path]) => path.startsWith("docs/marketing/"))
  .map(([, source]) => source)
  .join("\n");
const claims = documents.get("docs/marketing/claims-and-proof-register.md");

assert.match(documents.get("docs/marketing/README.md"), /repository baseline 0\.33\.25\.2/);
assert.match(claims, /Current baseline: \*\*v0\.33\.25\.2 · 2026-07-30\*\*/);
assert.match(claims, /C-016 — Tasks calendar subscriptions/);
assert.match(claims, /C-017 — Legal, licensing, and third-party notices/);
assert.match(claims, /THIRD_PARTY_NOTICES\.md/);
assert.match(marketing, /private signed readiness record/);
assert.match(marketing, /explicit invite\/no-invite decision/);
assert.match(marketing, /read-only Tasks calendar/);
assert.match(marketing, /Secure Catalogs remain future `0\.33\.29` work|Secure Catalogs \(0\.33\.29\)|Secure Catalogs.*planned/i);

for (const stale of [
  /Current.*through (?:version )?0\.33\.13\.5/i,
  /internet-exposure hardening.*active (?:near-term )?roadmap work/i,
  /backup\/restore (?:are|is) still being finalized/i,
]) {
  assert.doesNotMatch(marketing, stale);
}

console.log("Marketing claims baseline regression passed.");
