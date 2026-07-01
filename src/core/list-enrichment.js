function createVisibleRecordBatch(records = [], options = {}) {
  const idField = options.idField || "id";
  const normalizedRecords = Array.isArray(records) ? records : [];
  const ids = [];
  const seen = new Set();

  for (const record of normalizedRecords) {
    const id = String(record?.[idField] || "").trim();
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

function groupRowsByRecordId(rows = [], options = {}) {
  const idField = options.idField || "id";
  const map = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const id = String(row?.[idField] || "").trim();
    if (!id) {
      continue;
    }

    if (!map.has(id)) {
      map.set(id, []);
    }

    map.get(id).push(row);
  }

  return map;
}

function mapRecordsById(records = [], options = {}) {
  const idField = options.idField || "id";
  const map = new Map();

  for (const record of Array.isArray(records) ? records : []) {
    const id = String(record?.[idField] || "").trim();
    if (id) {
      map.set(id, record);
    }
  }

  return map;
}

function mapVisibleRecordBatch(batch, valueFactory) {
  const map = new Map();

  for (const record of batch?.records || []) {
    const id = String(record?.[batch.idField] || "").trim();
    if (id) {
      map.set(id, valueFactory(record, id));
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
