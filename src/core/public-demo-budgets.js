import { AsyncLocalStorage } from "node:async_hooks";
import { config } from "../config.js";
import { db } from "../db/provider.js";
import { AppError } from "../utils/app-error.js";
import { isPublicDemoVisitorIdentity } from "./public-demo-runtime.js";
import {
  PUBLIC_DEMO_BUDGET_ERRORS,
  PUBLIC_DEMO_BUDGET_LIMITS,
  resolvePublicDemoMutation,
  resolvePublicDemoQuery,
} from "./public-demo-budget-catalog.js";

const REQUEST_BUDGET_STATE = Symbol("public-demo-budget-state");
const SAFE_METHODS = new Set(["GET", "HEAD"]);
const RICH_TEXT_FIELDS = new Set(["body", "body_markdown", "bodymarkdown", "content", "description", "html", "markdown", "text"]);

/**
 * The budget limit record: the catalog's keys, each a number.
 *
 * This was `typeof PUBLIC_DEMO_BUDGET_LIMITS`, which reads the frozen catalog
 * literal and so gave every field its default as a literal type. That made
 * `Partial<PublicDemoBudgetLimits>` below permit only the defaults themselves,
 * leaving the `limits` override option unable to express any override — the one
 * thing it exists to do. Naming the keys and widening the values to `number`
 * keeps the record closed while letting a caller configure it.
 * @typedef {Record<keyof typeof PUBLIC_DEMO_BUDGET_LIMITS, number>} PublicDemoBudgetLimits
 */
/** @typedef {NonNullable<ReturnType<typeof resolvePublicDemoMutation>>} PublicDemoBudgetOperation */
/** @typedef {import("../types/database-contracts.js").DatabaseAdapter} DatabaseAdapter */
/** @typedef {import("../types/http-contracts.js").RequestSession} RequestSession */
/** @typedef {import("../types/route-contracts.js").RouteRequest & { session?: RequestSession, publicDemoBudgetPayloadValidator?: (payload: unknown) => Promise<void> } & Record<PropertyKey, unknown>} PublicDemoBudgetRequest */
/** @typedef {{ database: DatabaseAdapter, limits: PublicDemoBudgetLimits, operation: PublicDemoBudgetOperation, released: boolean, reservedUnits: number, userId: string, workspaceId: string }} PublicDemoBudgetState */
/** @typedef {{ enabled?: boolean, database?: DatabaseAdapter, isVisitor?: (userId: string) => boolean, limits?: Partial<PublicDemoBudgetLimits> }} PublicDemoBudgetOptions */

/** @type {AsyncLocalStorage<PublicDemoBudgetState>} */
const budgetContext = new AsyncLocalStorage();

/** @param {PublicDemoBudgetOptions} [options] */
function createPublicDemoBudgetMiddleware(options = {}) {
  const enabled = options.enabled ?? config.demo.enabled;
  const database = options.database || db;
  const isVisitor = options.isVisitor || isPublicDemoVisitorIdentity;
  const limits = /** @type {PublicDemoBudgetLimits} */ (Object.freeze({ ...PUBLIC_DEMO_BUDGET_LIMITS, ...(options.limits || {}) }));

  /** @param {PublicDemoBudgetRequest} request @param {import("../types/route-contracts.js").RouteResponse} response @param {(error?: unknown) => void} next */
  return async function publicDemoBudgetMiddleware(request, response, next) {
    const session = request.session;
    if (!enabled || !session?.user_id || !session?.workspace_id || !isVisitor(session.user_id)) {
      next();
      return;
    }

    const method = String(request.method || "").toUpperCase();
    const pathname = requestPath(request);
    if (pathname !== "/api" && !pathname.startsWith("/api/")) {
      next();
      return;
    }
    const operation = SAFE_METHODS.has(method)
      ? resolvePublicDemoQuery(method, pathname)
      : resolvePublicDemoMutation(method, pathname);

    if (!operation) {
      next(createBudgetError("undeclared", "operation"));
      return;
    }

    if (!operation.reserve) {
      next();
      return;
    }

    const state = {
      database,
      limits,
      operation,
      released: false,
      reservedUnits: 0,
      userId: session.user_id,
      workspaceId: session.workspace_id,
    };

    try {
      if (SAFE_METHODS.has(method)) {
        validateQuery(request, limits);
      } else if (operation.reserve && operation.baseUnits > 0) {
        await reserveUnits(state, operation.baseUnits);
      }

      attachReservationOutcome(response, state);
      request[REQUEST_BUDGET_STATE] = state;
      request.publicDemoBudgetPayloadValidator = (payload) => validatePublicDemoBudgetPayload(request, payload);
      budgetContext.run(state, next);
    } catch (error) {
      next(error);
    }
  };
}

/** @param {PublicDemoBudgetRequest} request @param {unknown} payload */
async function validatePublicDemoBudgetPayload(request, payload) {
  const state = /** @type {PublicDemoBudgetState | undefined} */ (request?.[REQUEST_BUDGET_STATE] || budgetContext.getStore());
  if (!state) return;

  validatePayloadShape(payload, state.limits);
  if (!state.operation.reserve) return;

  const collectionSize = largestDeclaredCollection(payload, state.operation.collectionKeys);
  if (collectionSize > 1) {
    await reserveUnits(state, collectionSize - 1);
  }
}

/**
 * @param {string | number} units
 */
async function reserveAdditionalPublicDemoBudgetUnits(units) {
  const state = budgetContext.getStore();
  const normalizedUnits = Number.parseInt(String(units), 10);
  if (!state || !state.operation.reserve || !Number.isFinite(normalizedUnits) || normalizedUnits <= 0) return;
  await reserveUnits(state, normalizedUnits);
}

/** @param {PublicDemoBudgetState} state @param {number} units */
async function reserveUnits(state, units) {
  await state.database.transaction(async (transaction) => {
    const bindings = { userId: state.userId, workspaceId: state.workspaceId };
    const account = await transaction.get(`
      SELECT used_units
      FROM public_demo_budget_usage
      WHERE workspace_id = :workspaceId AND user_id = :userId
    `, bindings);
    const workspace = await transaction.get(`
      SELECT COALESCE(SUM(used_units), 0) AS used_units
      FROM public_demo_budget_usage
      WHERE workspace_id = :workspaceId
    `, { workspaceId: state.workspaceId });
    const accountUsed = Number(account?.used_units || 0);
    const workspaceUsed = Number(workspace?.used_units || 0);

    if (
      accountUsed + units > state.limits.accountMutationUnits
      || workspaceUsed + units > state.limits.workspaceMutationUnits
    ) {
      throw createBudgetError("budget", "mutation");
    }

    if (account) {
      await transaction.run(`
        UPDATE public_demo_budget_usage
        SET used_units = used_units + :units, updated_at = CURRENT_TIMESTAMP
        WHERE workspace_id = :workspaceId AND user_id = :userId
      `, { ...bindings, units });
    } else {
      await transaction.run(`
        INSERT INTO public_demo_budget_usage (workspace_id, user_id, used_units, updated_at)
        VALUES (:workspaceId, :userId, :units, CURRENT_TIMESTAMP)
      `, { ...bindings, units });
    }
  });
  state.reservedUnits += units;
}

/** @param {import("../types/route-contracts.js").RouteResponse} response @param {PublicDemoBudgetState} state */
function attachReservationOutcome(response, state) {
  let settled = false;
  const settle = (/** @type {boolean} */ failed) => {
    if (settled) return;
    settled = true;
    if (failed) void releaseUnits(state).catch(() => {});
  };
  response.once("finish", () => settle(response.statusCode >= 400));
  response.once("close", () => settle(false));
}

/** @param {PublicDemoBudgetState} state */
async function releaseUnits(state) {
  if (state.released || state.reservedUnits <= 0) return;
  state.released = true;
  const units = state.reservedUnits;
  await state.database.transaction(async (transaction) => {
    const bindings = { userId: state.userId, workspaceId: state.workspaceId };
    const account = await transaction.get(`
      SELECT used_units
      FROM public_demo_budget_usage
      WHERE workspace_id = :workspaceId AND user_id = :userId
    `, bindings);
    if (!account) return;
    const remaining = Math.max(0, Number(account.used_units || 0) - units);
    if (remaining === 0) {
      await transaction.run(`
        DELETE FROM public_demo_budget_usage
        WHERE workspace_id = :workspaceId AND user_id = :userId
      `, bindings);
      return;
    }
    await transaction.run(`
      UPDATE public_demo_budget_usage
      SET used_units = :remaining, updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = :workspaceId AND user_id = :userId
    `, { ...bindings, remaining });
  });
}

/** @param {unknown} payload @param {PublicDemoBudgetLimits} limits */
function validatePayloadShape(payload, limits) {
  let nodes = 0;
  /** @param {unknown} value @param {number} depth @param {string} [fieldName] */
  const visit = (value, depth, fieldName = "") => {
    nodes += 1;
    if (nodes > limits.maxPayloadNodes || depth > limits.maxObjectDepth) {
      throw createBudgetError("input", "request");
    }
    if (typeof value === "string") {
      const byteLimit = RICH_TEXT_FIELDS.has(fieldName.toLowerCase())
        ? limits.maxRichTextBytes
        : limits.maxFieldBytes;
      if (Buffer.byteLength(value, "utf8") > byteLimit) throw createBudgetError("input", fieldName || "request");
      return;
    }
    if (Array.isArray(value)) {
      if (value.length > limits.maxArrayItems) throw createBudgetError("input", fieldName || "request");
      value.forEach((item) => visit(item, depth + 1, fieldName));
      return;
    }
    if (value && typeof value === "object") {
      const entries = Object.entries(value);
      if (entries.length > limits.maxObjectFields) throw createBudgetError("input", fieldName || "request");
      entries.forEach(([key, item]) => visit(item, depth + 1, key));
    }
  };
  visit(payload, 0);
}

/** @param {PublicDemoBudgetRequest} request @param {PublicDemoBudgetLimits} limits */
function validateQuery(request, limits) {
  const rawQuery = String(request.originalUrl || request.url || "").split("?").slice(1).join("?");
  if (Buffer.byteLength(rawQuery, "utf8") > limits.maxQueryBytes) throw createBudgetError("query", "query");
  const entries = Object.entries(request.query || {});
  if (entries.length > limits.maxQueryFields) throw createBudgetError("query", "query");
  entries.forEach(([key, value]) => validateQueryValue(key, value, limits));
}

/** @param {string} key @param {unknown} value @param {PublicDemoBudgetLimits} limits */
function validateQueryValue(key, value, limits) {
  if (Array.isArray(value)) {
    if (value.length > limits.maxQueryListItems) throw createBudgetError("query", key);
    value.forEach((item) => validateQueryValue(key, item, limits));
    return;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length > limits.maxQueryListItems) throw createBudgetError("query", key);
    entries.forEach(([nestedKey, item]) => validateQueryValue(nestedKey, item, limits));
    return;
  }

  const text = String(value ?? "");
  const loweredKey = key.toLowerCase();
  const textLimit = ["q", "query", "search", "text"].includes(loweredKey)
    ? limits.maxSearchTextBytes
    : limits.maxQueryTextBytes;
  if (Buffer.byteLength(text, "utf8") > textLimit) throw createBudgetError("query", key);

  const numeric = Number.parseInt(text, 10);
  if (!Number.isFinite(numeric)) return;
  if (["limit", "pagesize", "page_size", "perpage", "per_page", "maxresults"].includes(loweredKey) && numeric > limits.maxPageSize) {
    throw createBudgetError("query", key);
  }
  if (loweredKey === "offset" && numeric > limits.maxOffset) throw createBudgetError("query", key);
  if (loweredKey === "page" && numeric > limits.maxPage) throw createBudgetError("query", key);
}

/** @param {unknown} payload @param {readonly string[]} collectionKeys */
function largestDeclaredCollection(payload, collectionKeys) {
  if (Array.isArray(payload)) return payload.length;
  if (!payload || typeof payload !== "object") return 0;
  const record = /** @type {Record<string, unknown>} */ (payload);
  return collectionKeys.reduce((largest, key) => {
    const value = record[key];
    return Array.isArray(value) ? Math.max(largest, value.length) : largest;
  }, 0);
}

/**
 * @param {"budget" | "input" | "query" | "undeclared"} kind
 * @param {string} field
 */
function createBudgetError(kind, field) {
  const contract = PUBLIC_DEMO_BUDGET_ERRORS[kind];
  const safeField = ["mutation", "operation", "query", "request"].includes(field)
    ? field
    : kind === "query" ? "query" : "request";
  return new AppError(contract.message, contract.statusCode, {
    code: contract.code,
    fields: [{ code: "limit_reached", field: safeField, hint: "The hourly reset restores the public demo baseline." }],
  });
}

/** @param {PublicDemoBudgetRequest} request */
function requestPath(request) {
  try {
    return new URL(String(request.originalUrl || request.url || request.path || "/"), "http://localhost").pathname;
  } catch {
    return String(request.path || "/");
  }
}

export {
  createPublicDemoBudgetMiddleware,
  reserveAdditionalPublicDemoBudgetUnits,
  validatePublicDemoBudgetPayload,
};
