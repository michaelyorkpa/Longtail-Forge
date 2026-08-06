import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  PUBLIC_DEMO_CAPABILITIES,
  getPublicDemoCapability,
  listPublicDemoCapabilities,
} from "../../src/core/public-demo-capabilities.js";

const EXPECTED_CATALOG = Object.freeze([
  ["accounts.authenticate", "permitted"],
  ["accounts.shared_identity_mutation", "disabled"],
  ["administration.installation", "disabled"],
  ["administration.role_management", "disabled"],
  ["administration.workspace_lifecycle", "disabled"],
  ["api_keys", "disabled"],
  ["backups.workspace", "disabled"],
  ["exports.account", "disabled"],
  ["files.ingress", "disabled"],
  ["files.seeded_content", "read_only"],
  ["outbound.email", "disabled"],
  ["outbound.url_fetch", "disabled"],
  ["outbound.webhooks", "disabled"],
  ["records.workspace", "hourly_resettable"],
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
});
