// Shared axe configuration for the rendered accessibility gate. Every scan
// uses the same automatically detectable WCAG A/AA rule tags, attaches the
// full structured axe result to the Playwright report on failure, and runs
// with no blanket excludes or disabled rules.
//
// Known-issue baseline policy: an entry may only defer an EXACT rule/target
// fingerprint with a documented reason, so a deferred issue can never hide
// the same rule appearing on a new target. The baseline ships empty and
// should stay that way; prefer fixing the violation in the framework CSS or
// anatomy over fingerprinting it.

import { AxeBuilder } from "@axe-core/playwright";
import { expect } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// Each entry: { rule: "<axe rule id>", target: "<exact axe target selector>",
// reason: "<why this is safe to defer and what unblocks removing it>" }.
const KNOWN_ISSUE_FINGERPRINTS = [];

async function expectNoWcagViolations(page, testInfo, label) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const unexpected = [];

  for (const violation of results.violations) {
    for (const node of violation.nodes) {
      const target = node.target.join(" ");
      const known = KNOWN_ISSUE_FINGERPRINTS.some(
        (fingerprint) => fingerprint.rule === violation.id && fingerprint.target === target,
      );

      if (known) {
        continue;
      }

      unexpected.push({
        rule: violation.id,
        impact: violation.impact,
        target,
        summary: node.failureSummary,
        helpUrl: violation.helpUrl,
      });
    }
  }

  if (unexpected.length > 0) {
    await testInfo.attach(`axe-${label}`, {
      body: JSON.stringify({ label, unexpected, raw: results.violations }, null, 2),
      contentType: "application/json",
    });
  }

  expect(
    unexpected,
    `${label} has automatically detectable WCAG violations (rule, target, impact, and help URL above; full axe output attached)`,
  ).toEqual([]);
}

export { WCAG_TAGS, expectNoWcagViolations };
