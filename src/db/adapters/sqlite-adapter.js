import {
  closeSqlite,
  formatSqliteHealth,
  getLastSqliteHealth,
  initializeSqliteRuntime,
  querySql,
  readSqliteHealth,
  runSql,
} from "../sqlite.js";
import { sqlText } from "../sql-literals.js";

const SQLITE_CAPABILITIES = Object.freeze({
  provider: "sqlite",
  adapter: "sqlite-process",
  stringSql: true,
  parameterizedQueries: true,
  parameterStyle: "named",
  transactions: false,
  transactionApi: "reserved-for-0.33.5.19.5",
  migrationLocking: false,
  health: true,
});

function createSqliteAdapter() {
  async function query(sql, params = []) {
    return querySql(expandSqlParameters(sql, params));
  }

  async function get(sql, params = []) {
    const rows = await query(sql, params);
    return rows[0] || null;
  }

  async function run(sql, params = []) {
    return runSql(expandSqlParameters(sql, params));
  }

  return Object.freeze({
    provider: "sqlite",
    capabilities: SQLITE_CAPABILITIES,
    close: closeSqlite,
    formatHealth: formatSqliteHealth,
    get,
    getLastHealth: getLastSqliteHealth,
    health: readSqliteHealth,
    initializeRuntime: initializeSqliteRuntime,
    query,
    run,
  });
}

function expandSqlParameters(sql, params = undefined) {
  const text = String(sql || "");
  const bindings = normalizeBindings(params);

  if (bindings.size === 0) {
    return text;
  }

  let output = "";
  let anonymousIndex = 0;
  let index = 0;
  let state = "sql";

  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1] || "";

    if (state === "line-comment") {
      output += char;
      if (char === "\n") {
        state = "sql";
      }
      index += 1;
      continue;
    }

    if (state === "block-comment") {
      output += char;
      if (char === "*" && next === "/") {
        output += next;
        index += 2;
        state = "sql";
      } else {
        index += 1;
      }
      continue;
    }

    if (state === "single-quote") {
      output += char;
      if (char === "'" && next === "'") {
        output += next;
        index += 2;
      } else if (char === "'") {
        state = "sql";
        index += 1;
      } else {
        index += 1;
      }
      continue;
    }

    if (state === "double-quote") {
      output += char;
      if (char === "\"" && next === "\"") {
        output += next;
        index += 2;
      } else if (char === "\"") {
        state = "sql";
        index += 1;
      } else {
        index += 1;
      }
      continue;
    }

    if (char === "-" && next === "-") {
      output += char + next;
      index += 2;
      state = "line-comment";
      continue;
    }

    if (char === "/" && next === "*") {
      output += char + next;
      index += 2;
      state = "block-comment";
      continue;
    }

    if (char === "'") {
      output += char;
      index += 1;
      state = "single-quote";
      continue;
    }

    if (char === "\"") {
      output += char;
      index += 1;
      state = "double-quote";
      continue;
    }

    if ([":", "@", "$"].includes(char) && /[A-Za-z_]/.test(next)) {
      const parameter = readNamedParameter(text, index);
      output += readBindingLiteral(bindings, parameter.name);
      index = parameter.end;
      continue;
    }

    if (char === "?") {
      const parameter = readQuestionParameter(text, index, ++anonymousIndex);
      output += readBindingLiteral(bindings, parameter.name);
      index = parameter.end;
      continue;
    }

    output += char;
    index += 1;
  }

  return output;
}

function normalizeBindings(params) {
  const bindings = new Map();

  if (params === undefined || params === null) {
    return bindings;
  }

  if (Array.isArray(params)) {
    params.forEach((value, index) => {
      bindings.set(`?${index + 1}`, sqliteParameterLiteral(value));
    });
    return bindings;
  }

  if (typeof params !== "object") {
    throw new Error("Database query parameters must be an array or object.");
  }

  for (const [name, value] of Object.entries(params)) {
    addNamedBinding(bindings, name, sqliteParameterLiteral(value));
  }

  return bindings;
}

function addNamedBinding(bindings, name, literal) {
  const text = String(name || "").trim();

  if (/^\?[1-9]\d*$/.test(text)) {
    bindings.set(text, literal);
    return;
  }

  const bareName = text.match(/^[:@$]([A-Za-z_][A-Za-z0-9_]*)$/)?.[1] ||
    text.match(/^([A-Za-z_][A-Za-z0-9_]*)$/)?.[1];

  if (!bareName) {
    throw new Error(`Invalid database query parameter name: ${text || "(empty)"}.`);
  }

  bindings.set(`:${bareName}`, literal);
  bindings.set(`@${bareName}`, literal);
  bindings.set(`$${bareName}`, literal);
}

function readNamedParameter(sql, start) {
  let end = start + 2;
  while (end < sql.length && /[A-Za-z0-9_]/.test(sql[end])) {
    end += 1;
  }

  return {
    end,
    name: sql.slice(start, end),
  };
}

function readQuestionParameter(sql, start, fallbackIndex) {
  let end = start + 1;
  while (end < sql.length && /\d/.test(sql[end])) {
    end += 1;
  }

  return {
    end,
    name: end === start + 1 ? `?${fallbackIndex}` : sql.slice(start, end),
  };
}

function readBindingLiteral(bindings, name) {
  if (!bindings.has(name)) {
    throw new Error(`Missing database query parameter: ${name}.`);
  }

  return bindings.get(name);
}

function sqliteParameterLiteral(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Database query number parameters must be finite.");
    }

    return String(value);
  }

  if (typeof value === "bigint") {
    return String(value);
  }

  if (value instanceof Date) {
    return sqlText(value.toISOString());
  }

  if (typeof value === "string") {
    return sqlText(value);
  }

  throw new Error("Database query parameters must be strings, numbers, booleans, dates, null, or undefined.");
}

export { createSqliteAdapter, SQLITE_CAPABILITIES };
