const providers = new Map();
const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

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

function normalizeProviderId(value) {
  const providerId = String(value || "").trim().toLowerCase();
  if (!PROVIDER_ID_PATTERN.test(providerId) || providerId.length > 80) {
    throw new TypeError("Private feed provider IDs must be stable lowercase dotted or dashed identifiers.");
  }
  return providerId;
}

export {
  getPrivateFeedProvider,
  listPrivateFeedProviders,
  registerPrivateFeedProvider,
};
