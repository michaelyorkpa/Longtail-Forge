import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  PUBLIC_DEMO_ABSENT_CAPABILITY_IDS,
  PUBLIC_DEMO_CAPABILITIES,
  getPublicDemoCapability,
  listPublicDemoCapabilities,
} from "../../src/core/public-demo-capabilities.js";

const EXPECTED_CATALOG = Object.freeze([
  ["accounts.authenticate", "permitted"],
  ["accounts.shared_identity_mutation", "disabled"],
  ["administration.accounts", "disabled"],
  ["administration.extensions", "disabled"],
  ["administration.installation", "disabled"],
  ["administration.integrations", "disabled"],
  ["administration.invitations", "disabled"],
  ["administration.role_management", "disabled"],
  ["administration.workspace_lifecycle", "disabled"],
  ["api_keys", "disabled"],
  ["backups.installation", "disabled"],
  ["backups.workspace", "disabled"],
  ["exports.account", "disabled"],
  ["exports.audit", "disabled"],
  ["exports.workspace", "disabled"],
  ["files.ingress", "disabled"],
  ["files.seeded_content", "read_only"],
  ["imports.workspace", "disabled"],
  ["outbound.email", "disabled"],
  ["outbound.url_fetch", "disabled"],
  ["outbound.webhooks", "disabled"],
  ["private_feeds", "disabled"],
  ["records.workspace", "hourly_resettable"],
  ["restores.installation", "disabled"],
  ["restores.workspace", "disabled"],
  ["runtime.diagnostics", "read_only"],
  ["secure_notes.catalog_security", "disabled"],
  ["secure_notes.recovery", "disabled"],
  ["support_view", "disabled"],
]);

describe("public-demo capability catalog", () => {
  it("retains stable sorted IDs and reviewed classifications", () => {
    assert.deepEqual(
      listPublicDemoCapabilities().map((entry) => [entry.id, entry.classification]),
      EXPECTED_CATALOG,
    );
  });

  it("returns copies and rejects undeclared capabilities", () => {
    const listed = listPublicDemoCapabilities();
    listed[0].classification = "disabled";
    assert.equal(PUBLIC_DEMO_CAPABILITIES[0].classification, "permitted");
    assert.deepEqual(getPublicDemoCapability("files.seeded_content"), {
      id: "files.seeded_content",
      classification: "read_only",
    });
    assert.throws(() => getPublicDemoCapability("future.undeclared"), /Unknown public-demo capability ID/);
  });
  it("records currently absent escape families as disabled before they gain a server surface", () => {
    assert.deepEqual(PUBLIC_DEMO_ABSENT_CAPABILITY_IDS, [
      "administration.extensions",
      "administration.integrations",
      "administration.invitations",
      "backups.installation",
      "exports.workspace",
      "imports.workspace",
      "restores.installation",
      "restores.workspace",
    ]);
    for (const capabilityId of PUBLIC_DEMO_ABSENT_CAPABILITY_IDS) {
      assert.equal(getPublicDemoCapability(capabilityId).classification, "disabled");
    }
  });
});
