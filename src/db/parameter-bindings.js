const DOLLAR_PLACEHOLDERS = "dollar";
const QUESTION_PLACEHOLDERS = "question";
const BULK_VALUES_SAFE_PLACEHOLDER_BUDGET = 32766;

function prepareDatabaseBindings(sql, params = undefined, options = {}) {
  const text = String(sql || "").trim();
  const placeholderStyle = normalizePlaceholderStyle(options.placeholderStyle || DOLLAR_PLACEHOLDERS);
  const parameters = normalizeDatabaseParameters(params);
  const { statementCount, tokens } = analyzeSqlStatement(text);
  const namedTokens = tokens.filter((token) => token.type === "named");
  const positionalTokens = tokens.filter((token) => token.type === "positional");

  if (namedTokens.length > 0 && positionalTokens.length > 0) {
    throw new Error("Database statements cannot mix named and positional parameters.");
  }

  if (namedTokens.length > 0) {
    return {
      ...resolveNamedDatabaseBindings(text, namedTokens, parameters, placeholderStyle),
      statementCount,
    };
  }

  if (positionalTokens.length > 0) {
    return {
      ...resolvePositionalDatabaseBindings(text, positionalTokens, parameters, placeholderStyle),
      statementCount,
    };
  }

  assertNoProvidedParameters(parameters);
  return {
    hasBindings: false,
    params: undefined,
    sql: text,
    statementCount,
  };
}

function createBulkValuesBindings(rows, columns, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Bulk VALUES binding requires at least one row.");
  }

  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error("Bulk VALUES binding requires at least one column.");
  }

  const normalizedColumns = columns.map(normalizeBulkValuesColumnName);
  assertBulkValuesPlaceholderBudget(rows.length, normalizedColumns.length);
  const paramPrefix = normalizeDatabaseParameterName(options.paramPrefix || "bulkValue");
  const valueForColumn = typeof options.valueForColumn === "function"
    ? options.valueForColumn
    : defaultBulkValuesColumnValue;
  const params = {};
  const sql = rows.map((row, rowIndex) => {
    const placeholders = normalizedColumns.map((columnName, columnIndex) => {
      const paramName = `${paramPrefix}_${rowIndex}_${columnIndex}`;
      params[paramName] = normalizeDatabaseParameterValue(valueForColumn(row, columnName, rowIndex, columnIndex));
      return `:${paramName}`;
    });

    return `(${placeholders.join(", ")})`;
  }).join(",\n");

  return {
    params,
    sql,
  };
}

function assertBulkValuesPlaceholderBudget(rowCount, columnCount) {
  const placeholderCount = rowCount * columnCount;

  if (placeholderCount <= BULK_VALUES_SAFE_PLACEHOLDER_BUDGET) {
    return;
  }

  throw new Error(
    `Bulk VALUES binding would create ${placeholderCount} parameters for ${rowCount} rows and ${columnCount} columns, ` +
      `exceeding the safe placeholder budget of ${BULK_VALUES_SAFE_PLACEHOLDER_BUDGET}. Split the write into smaller batches.`,
  );
}

function resolveNamedDatabaseBindings(sql, tokens, parameters, placeholderStyle) {
  const expectedNames = uniqueTokenNames(tokens);
  const expectedNameSet = new Set(expectedNames);
  const firstName = expectedNames[0];

  if (parameters.kind !== "object") {
    throw new Error(`Missing database query parameter: :${firstName}.`);
  }

  for (const name of expectedNames) {
    if (!parameters.values.has(name)) {
      throw new Error(`Missing database query parameter: :${name}.`);
    }
  }

  for (const name of parameters.values.keys()) {
    if (!expectedNameSet.has(name)) {
      throw new Error(`Unknown database query parameter: ${name}.`);
    }
  }

  const bindingsByName = createNamedBindingEntries(expectedNames, parameters.values, placeholderStyle);
  const positionalParams = placeholderStyle === DOLLAR_PLACEHOLDERS
    ? expectedNames.flatMap((name) => bindingsByName.get(name).values)
    : [];
  const rewrittenSql = rewriteSqlTokens(sql, tokens, (token) => {
    const binding = bindingsByName.get(token.name);

    if (binding.isArray) {
      if (binding.placeholders.length === 0) {
        return "NULL";
      }

      if (placeholderStyle === QUESTION_PLACEHOLDERS) {
        positionalParams.push(...binding.values);
      }

      return binding.placeholders.join(", ");
    }

    if (placeholderStyle === QUESTION_PLACEHOLDERS) {
      positionalParams.push(binding.value);
    }

    return binding.placeholder;
  });

  return {
    hasBindings: true,
    params: positionalParams,
    sql: rewrittenSql,
  };
}

function createNamedBindingEntries(expectedNames, values, placeholderStyle) {
  const bindingsByName = new Map();
  let nextPosition = 1;

  for (const name of expectedNames) {
    const value = values.get(name);

    if (Array.isArray(value)) {
      const placeholders = value.map(() => {
        if (placeholderStyle === DOLLAR_PLACEHOLDERS) {
          return `$${nextPosition++}`;
        }

        return "?";
      });
      bindingsByName.set(name, {
        isArray: true,
        placeholders,
        values: value,
      });
      continue;
    }

    bindingsByName.set(name, {
      isArray: false,
      placeholder: placeholderStyle === DOLLAR_PLACEHOLDERS ? `$${nextPosition++}` : "?",
      value,
      values: [value],
    });
  }

  return bindingsByName;
}

function resolvePositionalDatabaseBindings(sql, tokens, parameters, placeholderStyle) {
  const expectedCount = tokens.reduce((count, token) => Math.max(count, token.position), 0);

  if (parameters.kind !== "array") {
    throw new Error("SQLite positional parameters require an array.");
  }

  if (parameters.values.length < expectedCount) {
    throw new Error(`Missing database query parameter: ?${parameters.values.length + 1}.`);
  }

  if (parameters.values.length > expectedCount) {
    throw new Error(`Unknown database query parameter: ?${expectedCount + 1}.`);
  }

  const positionalParams = placeholderStyle === DOLLAR_PLACEHOLDERS
    ? parameters.values
    : tokens.map((token) => parameters.values[token.position - 1]);
  const rewrittenSql = rewriteSqlTokens(sql, tokens, (token) => (
    placeholderStyle === DOLLAR_PLACEHOLDERS ? `$${token.position}` : "?"
  ));

  return {
    hasBindings: true,
    params: positionalParams,
    sql: rewrittenSql,
  };
}

function uniqueTokenNames(tokens) {
  const names = [];
  const seen = new Set();

  for (const token of tokens) {
    if (seen.has(token.name)) {
      continue;
    }

    names.push(token.name);
    seen.add(token.name);
  }

  return names;
}

function rewriteSqlTokens(sql, tokens, replacementForToken) {
  let rewritten = "";
  let lastIndex = 0;

  for (const token of tokens) {
    rewritten += sql.slice(lastIndex, token.start);
    rewritten += replacementForToken(token);
    lastIndex = token.end;
  }

  return rewritten + sql.slice(lastIndex);
}

function normalizePlaceholderStyle(style) {
  if ([DOLLAR_PLACEHOLDERS, QUESTION_PLACEHOLDERS].includes(style)) {
    return style;
  }

  throw new Error(`Unsupported database placeholder style: ${style}.`);
}

function normalizeDatabaseParameters(params) {
  if (params === undefined || params === null) {
    return {
      kind: "none",
      values: null,
    };
  }

  if (Array.isArray(params)) {
    return {
      kind: "array",
      values: params.map(normalizeDatabaseParameterValue),
    };
  }

  if (typeof params !== "object") {
    throw new Error("Database query parameters must be an array or object.");
  }

  const values = new Map();

  for (const [name, value] of Object.entries(params)) {
    values.set(normalizeDatabaseParameterName(name), normalizeNamedDatabaseParameterValue(value));
  }

  return {
    kind: "object",
    values,
  };
}

function normalizeNamedDatabaseParameterValue(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeDatabaseParameterValue);
  }

  return normalizeDatabaseParameterValue(value);
}

function assertNoProvidedParameters(parameters) {
  if (parameters.kind === "object" && parameters.values.size > 0) {
    throw new Error(`Unknown database query parameter: ${parameters.values.keys().next().value}.`);
  }

  if (parameters.kind === "array" && parameters.values.length > 0) {
    throw new Error("Unknown database query parameter: ?1.");
  }
}

function normalizeDatabaseParameterName(name) {
  const text = String(name || "").trim();
  const bareName = text.match(/^[:@$]?([A-Za-z_][A-Za-z0-9_]*)$/)?.[1];

  if (!bareName) {
    throw new Error(`Invalid database query parameter name: ${text || "(empty)"}.`);
  }

  return bareName;
}

function normalizeBulkValuesColumnName(name) {
  const text = String(name || "").trim();

  if (!text) {
    throw new Error("Bulk VALUES binding column names must be non-empty strings.");
  }

  return text;
}

function defaultBulkValuesColumnValue(row, columnName) {
  return row?.[columnName];
}

function normalizeDatabaseParameterValue(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Database query number parameters must be finite.");
    }

    return value;
  }

  if (typeof value === "bigint") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  throw new Error("Database query parameters must be strings, numbers, booleans, buffers, dates, null, or undefined.");
}

function analyzeSqlStatement(sql) {
  const tokens = [];
  let anonymousIndex = 0;
  let statementCount = 0;
  let hasStatementText = false;
  let index = 0;
  let state = "sql";

  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1] || "";

    if (state === "line-comment") {
      if (char === "\n") {
        state = "sql";
      }
      index += 1;
      continue;
    }

    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        state = "sql";
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }

    if (state === "single-quote") {
      if (char === "'" && next === "'") {
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
      if (char === "\"" && next === "\"") {
        index += 2;
      } else if (char === "\"") {
        state = "sql";
        index += 1;
      } else {
        index += 1;
      }
      continue;
    }

    if (state === "backtick") {
      if (char === "`" && next === "`") {
        index += 2;
      } else if (char === "`") {
        state = "sql";
        index += 1;
      } else {
        index += 1;
      }
      continue;
    }

    if (state === "bracket") {
      if (char === "]") {
        state = "sql";
      }
      index += 1;
      continue;
    }

    if (char === "-" && next === "-") {
      state = "line-comment";
      index += 2;
      continue;
    }

    if (char === "/" && next === "*") {
      state = "block-comment";
      index += 2;
      continue;
    }

    if (char === "'") {
      hasStatementText = true;
      state = "single-quote";
      index += 1;
      continue;
    }

    if (char === "\"") {
      hasStatementText = true;
      state = "double-quote";
      index += 1;
      continue;
    }

    if (char === "`") {
      hasStatementText = true;
      state = "backtick";
      index += 1;
      continue;
    }

    if (char === "[") {
      hasStatementText = true;
      state = "bracket";
      index += 1;
      continue;
    }

    if (char === ";") {
      if (hasStatementText) {
        statementCount += 1;
        hasStatementText = false;
      }
      index += 1;
      continue;
    }

    if (char === ":" && next === ":") {
      hasStatementText = true;
      index += 2;
      continue;
    }

    if ([":", "@", "$"].includes(char) && /[A-Za-z_]/.test(next)) {
      hasStatementText = true;
      const parameter = readNamedParameter(sql, index);
      tokens.push({
        ...parameter,
        start: index,
        type: "named",
      });
      index = parameter.end;
      continue;
    }

    if (char === "?") {
      hasStatementText = true;
      const parameter = readQuestionParameter(sql, index, ++anonymousIndex);
      tokens.push({
        ...parameter,
        start: index,
        type: "positional",
      });
      index = parameter.end;
      continue;
    }

    if (!/\s/.test(char)) {
      hasStatementText = true;
    }

    index += 1;
  }

  if (hasStatementText) {
    statementCount += 1;
  }

  return {
    statementCount,
    tokens,
  };
}

function readNamedParameter(sql, start) {
  let end = start + 2;

  while (end < sql.length && /[A-Za-z0-9_]/.test(sql[end])) {
    end += 1;
  }

  return {
    end,
    name: sql.slice(start + 1, end),
  };
}

function readQuestionParameter(sql, start, fallbackPosition) {
  let end = start + 1;

  while (end < sql.length && /\d/.test(sql[end])) {
    end += 1;
  }

  return {
    end,
    position: end === start + 1 ? fallbackPosition : Number.parseInt(sql.slice(start + 1, end), 10),
  };
}

export {
  analyzeSqlStatement,
  createBulkValuesBindings,
  DOLLAR_PLACEHOLDERS,
  QUESTION_PLACEHOLDERS,
  prepareDatabaseBindings,
};
