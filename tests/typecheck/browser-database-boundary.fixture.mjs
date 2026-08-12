// @ts-check

// @ts-expect-error Browser-consumed framework contracts must not export the Node-only database adapter.
/** @typedef {import("../../src/types/framework-contracts.js").DatabaseAdapter} BrowserDatabaseAdapter */

export {};
