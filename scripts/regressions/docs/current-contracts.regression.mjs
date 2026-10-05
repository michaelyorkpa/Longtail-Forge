export const regressionMeta = Object.freeze({
  id: "docs.current-static-contracts",
  area: "docs",
  tier: "focused",
  tags: ["claims", "licensing", "marketing", "preview"],
  description: "Keeps current marketing status, proof, and preview-invitation boundaries aligned through a table-driven source owner.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { createProjectTextReader } from "../../test-support/source-scan.mjs";

const { readText } = createProjectTextReader();
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
const documents = new Map(paths.map((path) => [path, readText(path)]));
const marketing = [...documents.entries()].filter(([path]) => path.startsWith("docs/marketing/")).map(([, source]) => source).join("\n");

const contracts = [
  { source: documents.get("docs/marketing/README.md"), matches: [/repository baseline 0\.33\.25\.6/] },
  {
    source: documents.get("docs/marketing/claims-and-proof-register.md"),
    matches: [
      /Current baseline: \*\*v0\.33\.25\.6 · 2026-07-30\*\*/,
      /C-016 — Tasks calendar subscriptions/,
      /C-017 — Legal, licensing, and third-party notices/,
      /THIRD_PARTY_NOTICES\.md/,
      /Public Terms\/Privacy routes ship with neutral operator templates/,
      /review path appropriate to future public analytics, feedback, or interest capture is deferred to 0\.33\.33/,
    ],
  },
  {
    source: marketing,
    matches: [
      /private signed readiness record/,
      /explicit invite\/no-invite decision/,
      /read-only Tasks calendar/,
      /Secure Catalogs remain future `0\.33\.29` work|Secure Catalogs \(0\.33\.29\)|Secure Catalogs.*planned/i,
    ],
    excludes: [
      /Current.*through (?:version )?0\.33\.13\.5/i,
      /internet-exposure hardening.*active (?:near-term )?roadmap work/i,
      /backup\/restore (?:are|is) still being finalized/i,
    ],
  },
];

for (const contract of contracts) {
  for (const pattern of contract.matches || []) assert.match(/** @type {string} */ (contract.source), pattern);
  for (const pattern of contract.excludes || []) assert.doesNotMatch(/** @type {string} */ (contract.source), pattern);
}

console.log("Current documentation static contracts passed.");
