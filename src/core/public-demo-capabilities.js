// @ts-check

/** @typedef {"permitted" | "read_only" | "disabled" | "hourly_resettable"} PublicDemoCapabilityClassification */
/** @typedef {{ id: string, classification: PublicDemoCapabilityClassification }} PublicDemoCapabilityDefinition */

const PUBLIC_DEMO_CAPABILITY_CLASSIFICATIONS = Object.freeze({
  PERMITTED: "permitted",
  READ_ONLY: "read_only",
  DISABLED: "disabled",
  HOURLY_RESETTABLE: "hourly_resettable",
});

/** @type {readonly PublicDemoCapabilityDefinition[]} */
const PUBLIC_DEMO_CAPABILITIES = Object.freeze([
  capability("accounts.authenticate", PUBLIC_DEMO_CAPABILITY_CLASSIFICATIONS.PERMITTED),
  capability("accounts.shared_identity_mutation", PUBLIC_DEMO_CAPABILITY_CLASSIFICATIONS.DISABLED),
  capability("administration.installation", PUBLIC_DEMO_CAPABILITY_CLASSIFICATIONS.DISABLED),
  capability("administration.role_management", PUBLIC_DEMO_CAPABILITY_CLASSIFICATIONS.DISABLED),
  capability("administration.workspace_lifecycle", PUBLIC_DEMO_CAPABILITY_CLASSIFICATIONS.DISABLED),
  capability("api_keys", PUBLIC_DEMO_CAPABILITY_CLASSIFICATIONS.DISABLED),
  capability("backups.workspace", PUBLIC_DEMO_CAPABILITY_CLASSIFICATIONS.DISABLED),
  capability("exports.account", PUBLIC_DEMO_CAPABILITY_CLASSIFICATIONS.DISABLED),
  capability("files.ingress", PUBLIC_DEMO_CAPABILITY_CLASSIFICATIONS.DISABLED),
  capability("files.seeded_content", PUBLIC_DEMO_CAPABILITY_CLASSIFICATIONS.READ_ONLY),
  capability("outbound.email", PUBLIC_DEMO_CAPABILITY_CLASSIFICATIONS.DISABLED),
  capability("outbound.url_fetch", PUBLIC_DEMO_CAPABILITY_CLASSIFICATIONS.DISABLED),
  capability("outbound.webhooks", PUBLIC_DEMO_CAPABILITY_CLASSIFICATIONS.DISABLED),
  capability("records.workspace", PUBLIC_DEMO_CAPABILITY_CLASSIFICATIONS.HOURLY_RESETTABLE),
  capability("runtime.diagnostics", PUBLIC_DEMO_CAPABILITY_CLASSIFICATIONS.READ_ONLY),
  capability("secure_notes.catalog_security", PUBLIC_DEMO_CAPABILITY_CLASSIFICATIONS.DISABLED),
  capability("secure_notes.recovery", PUBLIC_DEMO_CAPABILITY_CLASSIFICATIONS.DISABLED),
  capability("support_view", PUBLIC_DEMO_CAPABILITY_CLASSIFICATIONS.DISABLED),
]);

const PUBLIC_DEMO_CAPABILITIES_BY_ID = new Map(PUBLIC_DEMO_CAPABILITIES.map((entry) => [entry.id, entry]));

function listPublicDemoCapabilities() {
  return PUBLIC_DEMO_CAPABILITIES.map((entry) => ({ ...entry }));
}

function getPublicDemoCapability(capabilityId) {
  const entry = PUBLIC_DEMO_CAPABILITIES_BY_ID.get(String(capabilityId || "").trim());
  if (!entry) {
    throw new Error("Unknown public-demo capability ID.");
  }
  return { ...entry };
}

/**
 * @param {string} id
 * @param {PublicDemoCapabilityClassification} classification
 * @returns {PublicDemoCapabilityDefinition}
 */
function capability(id, classification) {
  return Object.freeze({ id, classification });
}

export {
  PUBLIC_DEMO_CAPABILITIES,
  PUBLIC_DEMO_CAPABILITY_CLASSIFICATIONS,
  getPublicDemoCapability,
  listPublicDemoCapabilities,
};
