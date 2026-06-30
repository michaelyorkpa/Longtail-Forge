function sqlText(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

function sqlNullableText(value) {
  return value === null || value === undefined || String(value).trim() === ""
    ? "NULL"
    : sqlText(value);
}

function sqlInteger(value) {
  const numberValue = Number.parseInt(value, 10);
  return Number.isFinite(numberValue) ? String(numberValue) : "0";
}

function sqlNullableInteger(value) {
  if (value === null || value === undefined || value === "") {
    return "NULL";
  }

  const numberValue = Number.parseInt(value, 10);
  return Number.isFinite(numberValue) ? String(numberValue) : "NULL";
}

export {
  sqlInteger,
  sqlNullableInteger,
  sqlNullableText,
  sqlText,
};
