// @ts-check

/**
 * @template RecordType
 * @param {RecordType[]} [records]
 * @param {{ idField?: string }} [options]
 * @returns {Readonly<{ idField: string, ids: string[], isEmpty: boolean, records: RecordType[] }>}
 */
function createVisibleRecordBatch(records = [], options = {}) {
  const idField = options.idField || "id";
  const normalizedRecords = Array.isArray(records) ? records : [];
  const ids = [];
  const seen = new Set();

  for (const record of normalizedRecords) {
    const id = String(/** @type {Record<string, unknown>} */ (record)?.[idField] || "").trim();
    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    ids.push(id);
  }

  return Object.freeze({
    idField,
    ids,
    isEmpty: ids.length === 0,
    records: normalizedRecords,
  });
}

/**
 * @template RowType
 * @param {RowType[]} [rows]
 * @param {{ idField?: string }} [options]
 * @returns {Map<string, RowType[]>}
 */
function groupRowsByRecordId(rows = [], options = {}) {
  const idField = options.idField || "id";
  /** @type {Map<string, RowType[]>} */
  const map = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const id = String(/** @type {Record<string, unknown>} */ (row)?.[idField] || "").trim();
    if (!id) {
      continue;
    }

    const bucket = map.get(id) || [];
    bucket.push(row);
    map.set(id, bucket);
  }

  return map;
}

/**
 * @template RecordType
 * @param {RecordType[]} [records]
 * @param {{ idField?: string }} [options]
 * @returns {Map<string, RecordType>}
 */
function mapRecordsById(records = [], options = {}) {
  const idField = options.idField || "id";
  /** @type {Map<string, RecordType>} */
  const map = new Map();

  for (const record of Array.isArray(records) ? records : []) {
    const id = String(/** @type {Record<string, unknown>} */ (record)?.[idField] || "").trim();
    if (id) {
      map.set(id, record);
    }
  }

  return map;
}

/**
 * @template RecordType
 * @template Value
 * @param {Readonly<{ idField: string, records: RecordType[] }>} batch
 * @param {(record: RecordType, id: string) => Value} valueFactory
 * @returns {Map<string, import("../types/framework-contracts.js").NormalizeInferredEmptyArray<Value>>}
 */
function mapVisibleRecordBatch(batch, valueFactory) {
  /** @type {Map<string, import("../types/framework-contracts.js").NormalizeInferredEmptyArray<Value>>} */
  const map = new Map();

  for (const record of batch?.records || []) {
    const id = String(/** @type {Record<string, unknown>} */ (record)?.[batch.idField] || "").trim();
    if (id) {
    map.set(id, /** @type {import("../types/framework-contracts.js").NormalizeInferredEmptyArray<Value>} */ (valueFactory(record, id)));
    }
  }

  return map;
}

export {
  createVisibleRecordBatch,
  groupRowsByRecordId,
  mapRecordsById,
  mapVisibleRecordBatch,
};
