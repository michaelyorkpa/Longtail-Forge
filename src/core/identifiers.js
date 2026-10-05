import { v4 as uuidv4, v7 as uuidv7 } from "uuid";

/**
 * Creates the canonical identifier for a newly persisted application record.
 * Existing or caller-supplied identifiers remain valid and must not be rewritten.
 * @param {import("uuid").Version7Options | undefined} [options]
 */
export function createRecordId(options) {
  return options === undefined ? uuidv7() : uuidv7(options);
}

/**
 * Creates a cryptographically random UUID for a non-secret operational value.
 * Bearer credentials and other secrets stay with their dedicated token helpers.
 * @param {import("uuid").Version4Options | undefined} [options]
 */
export function createOpaqueId(options) {
  return options === undefined ? uuidv4() : uuidv4(options);
}
