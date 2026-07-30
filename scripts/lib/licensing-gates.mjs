import { existsSync } from "node:fs";
import { inspectThirdPartyNotices } from "./third-party-notices.mjs";

const LICENSING_GATE_PATHS = Object.freeze({
  claTerms: "docs/licensing/contributor-license-agreement.md",
  contributing: "CONTRIBUTING.md",
  contributorPolicy: "docs/licensing/contributor-policy.md",
  publicLegalAbout: Object.freeze([
    "help/framework/legal-and-licensing.md",
    "help/framework/third-party-notices.md",
  ]),
  pullRequestTemplates: Object.freeze([
    ".github/pull_request_template.md",
    ".github/PULL_REQUEST_TEMPLATE.md",
  ]),
  thirdPartyNotices: "THIRD_PARTY_NOTICES.md",
});

function inspectLicensingGates({
  pathExists = existsSync,
  thirdPartyNoticeStatus = inspectThirdPartyNotices(),
} = {}) {
  const thirdPartyNoticesPresent = pathExists(LICENSING_GATE_PATHS.thirdPartyNotices);
  const thirdPartyNoticesCurrent = thirdPartyNoticesPresent && thirdPartyNoticeStatus.current;
  const contributingPresent = pathExists(LICENSING_GATE_PATHS.contributing);
  const pullRequestTemplate = LICENSING_GATE_PATHS.pullRequestTemplates.find(pathExists) || null;
  const claTermsPresent = pathExists(LICENSING_GATE_PATHS.claTerms);
  const contributorPolicyPresent = pathExists(LICENSING_GATE_PATHS.contributorPolicy);
  const publicLegalAboutPresent = LICENSING_GATE_PATHS.publicLegalAbout.every(pathExists);
  const claProcessActive = contributingPresent && claTermsPresent && contributorPolicyPresent;
  const warnings = [];

  if (!thirdPartyNoticesPresent) {
    warnings.push(Object.freeze({
      code: "missing-third-party-notices",
      gate: "public-release",
      message: `Before a public release, add or generate ${LICENSING_GATE_PATHS.thirdPartyNotices}.`,
    }));
  } else if (!thirdPartyNoticesCurrent) {
    warnings.push(Object.freeze({
      code: "stale-third-party-notices",
      gate: "public-release",
      message: thirdPartyNoticeStatus.message,
    }));
  }
  if (!publicLegalAboutPresent) {
    warnings.push(Object.freeze({
      code: "missing-public-legal-about",
      gate: "public-release",
      message: "The framework Help legal/about surface is incomplete.",
    }));
  }
  if (!contributingPresent) {
    warnings.push(Object.freeze({
      code: "missing-contributing-guide",
      gate: "public-contributions",
      message: `Before accepting outside contributions, add ${LICENSING_GATE_PATHS.contributing}.`,
    }));
  }
  if (!pullRequestTemplate) {
    warnings.push(Object.freeze({
      code: "missing-pull-request-template",
      gate: "public-contributions",
      message: "Before accepting outside contributions, add a repository pull-request template.",
    }));
  }
  if (!claProcessActive) {
    warnings.push(Object.freeze({
      code: "inactive-cla-process",
      gate: "public-contributions",
      message: "Before accepting non-trivial outside contributions, activate the documented CLA process through CONTRIBUTING.md.",
    }));
  }

  return Object.freeze({
    checks: Object.freeze({
      claProcessActive,
      claTermsPresent,
      contributingPresent,
      contributorPolicyPresent,
      pullRequestTemplate,
      publicLegalAboutPresent,
      thirdPartyNoticesPresent,
      thirdPartyNoticesCurrent,
    }),
    warningOnly: true,
    warnings: Object.freeze(warnings),
  });
}

function formatLicensingGateReport(result) {
  const lines = [
    "Licensing and public-release process gates",
    "Mode: warning-only for ordinary private development.",
  ];

  if (result.checks.thirdPartyNoticesCurrent) {
    lines.push(`Third-party notices: satisfied. ${noticesStatusMessage(result)}`);
  }
  if (result.checks.publicLegalAboutPresent) {
    lines.push("In-app legal/about: satisfied. Framework Help contains the tracked legal/licensing and third-party-notices sources.");
  }

  if (result.warnings.length === 0) {
    lines.push("Status: automated publication and contribution artifacts are present.");
  } else {
    lines.push("Future gate warnings:");
    result.warnings.forEach((warning) => lines.push(`- [${warning.gate}] ${warning.message}`));
    lines.push("Status: these warnings do not fail ordinary development or private feature slices.");
  }

  return lines.join("\n");
}

function noticesStatusMessage(result) {
  return result.checks.thirdPartyNoticesCurrent
    ? `${LICENSING_GATE_PATHS.thirdPartyNotices} matches the reviewed production dependency and bundled-asset inventory.`
    : "";
}

export {
  LICENSING_GATE_PATHS,
  formatLicensingGateReport,
  inspectLicensingGates,
};
