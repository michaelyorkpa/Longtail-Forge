const providers = new Map();
const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const SUBSCRIPTION_SCOPE_TYPES = new Set(["workspace", "client", "project"]);

function registerPrivateFeedProvider(definition) {
  const provider = normalizeProvider(definition);
  const existing = providers.get(provider.id);

  if (existing) {
    if (existing.render === provider.render) {
      return existing;
    }
    throw new Error(`Private feed provider "${provider.id}" is already registered.`);
  }

  providers.set(provider.id, provider);
  return provider;
}

function getPrivateFeedProvider(providerId) {
  return providers.get(normalizeProviderId(providerId)) || null;
}

function listPrivateFeedProviders() {
  return Array.from(providers.values());
}

function createPrivateFeedSubscriptionDescriptor(value) {
  if (!value || typeof value !== "object") {
    throw new TypeError("Private feed subscription descriptor is required.");
  }

  const subscriptionId = normalizeDescriptorIdentity(value.subscriptionId, "subscription");
  const ownerUserId = normalizeDescriptorIdentity(value.ownerUserId, "owner");
  const workspaceId = normalizeDescriptorIdentity(value.workspaceId, "workspace");
  const name = String(value.name || "").trim();
  if (!name || name.length > 120) {
    throw new TypeError("Private feed subscription names must contain 1 to 120 characters.");
  }

  const scopeValue = value.scope;
  if (!scopeValue || typeof scopeValue !== "object") {
    throw new TypeError("Private feed subscription scope is required.");
  }
  const type = String(scopeValue.type || "").trim().toLowerCase();
  if (!SUBSCRIPTION_SCOPE_TYPES.has(type)) {
    throw new TypeError("Private feed subscription scope must be workspace, client, or project.");
  }
  const clientId = type === "client" || type === "project"
    ? normalizeOptionalDescriptorIdentity(scopeValue.clientId, "client")
    : null;
  const projectId = type === "project"
    ? normalizeDescriptorIdentity(scopeValue.projectId, "project")
    : null;
  if (type === "client" && !clientId) {
    throw new TypeError("Client-scoped private feed subscriptions require a client.");
  }

  return Object.freeze({
    name,
    ownerUserId,
    scope: Object.freeze({
      clientId,
      projectId,
      type,
    }),
    subscriptionId,
    workspaceId,
  });
}

function normalizeProvider(definition) {
  if (!definition || typeof definition !== "object") {
    throw new TypeError("Private feed provider definition is required.");
  }

  const id = normalizeProviderId(definition.id);
  if (typeof definition.render !== "function") {
    throw new TypeError(`Private feed provider "${id}" requires a render function.`);
  }

  return Object.freeze({
    id,
    render: definition.render,
  });
}

function normalizeDescriptorIdentity(value, label) {
  const identity = normalizeOptionalDescriptorIdentity(value, label);
  if (!identity) {
    throw new TypeError(`Private feed subscription ${label} identity is required.`);
  }
  return identity;
}

function normalizeOptionalDescriptorIdentity(value, label) {
  const identity = String(value || "").trim();
  if (!identity) {
    return null;
  }
  if (identity.length > 200 || /[\u0000-\u001f\u007f]/.test(identity)) {
    throw new TypeError(`Private feed subscription ${label} identity is invalid.`);
  }
  return identity;
}

function normalizeProviderId(value) {
  const providerId = String(value || "").trim().toLowerCase();
  if (!PROVIDER_ID_PATTERN.test(providerId) || providerId.length > 80) {
    throw new TypeError("Private feed provider IDs must be stable lowercase dotted or dashed identifiers.");
  }
  return providerId;
}

export {
  createPrivateFeedSubscriptionDescriptor,
  getPrivateFeedProvider,
  listPrivateFeedProviders,
  registerPrivateFeedProvider,
};
