// @ts-check
/** @param {unknown} value */
function sqlText(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

/** @param {unknown} value */
function sqlNullableText(value) {
  return value === null || value === undefined || String(value).trim() === ""
    ? "NULL"
    : sqlText(value);
}

/** @param {unknown} value */
function sqlInteger(value) {
  const numberValue = Number.parseInt(String(value), 10);
  return Number.isFinite(numberValue) ? String(numberValue) : "0";
}

/** @param {unknown} value */
function sqlNullableInteger(value) {
  if (value === null || value === undefined || value === "") {
    return "NULL";
  }

  const numberValue = Number.parseInt(String(value), 10);
  return Number.isFinite(numberValue) ? String(numberValue) : "NULL";
}

export {
  sqlInteger,
  sqlNullableInteger,
  sqlNullableText,
  sqlText,
};
