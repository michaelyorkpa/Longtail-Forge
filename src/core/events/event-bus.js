/** @typedef {import("../../types/framework-contracts.js").InternalEvent} InternalEvent */
/** @typedef {import("../../types/http-contracts.js").RequestSession} RequestSession */
/** @typedef {{ session?: Partial<RequestSession> | null | undefined, workspace_id?: string | null, workspaceId?: string | null, actor_user_id?: string, actorUserId?: string, module_id?: string, moduleId?: string, record_type?: string, recordType?: string, record_id?: string, recordId?: string, previous_value?: unknown, previousValue?: unknown, new_value?: unknown, newValue?: unknown, source?: string, metadata?: Record<string, unknown>, emitted_at?: string, emittedAt?: string }} InternalEventPayload */
/** @typedef {(event: InternalEvent) => unknown | Promise<unknown>} InternalEventHandler */
/** @typedef {{ id: string, moduleId: string, handler: InternalEventHandler }} InternalEventListener */
/** @typedef {{ id?: string, moduleId?: string }} InternalEventListenerOptions */

/** @type {Map<string, InternalEventListener[]>} */
const listenersByEvent = new Map();

/** @param {string} eventName @param {InternalEventHandler} handler @param {InternalEventListenerOptions} [options] */
function onInternalEvent(eventName, handler, options = {}) {
  const normalizedEventName = normalizeEventName(eventName);

  if (typeof handler !== "function") {
    throw new TypeError(`Internal event handler for '${normalizedEventName}' must be a function.`);
  }

  const listener = {
    handler,
    id: options.id || `${options.moduleId || "framework"}:${normalizedEventName}:${listenersByEvent.size}`,
    moduleId: options.moduleId || "",
  };
  const listeners = listenersByEvent.get(normalizedEventName) || [];
  listeners.push(listener);
  listenersByEvent.set(normalizedEventName, listeners);

  return () => {
    const currentListeners = listenersByEvent.get(normalizedEventName) || [];
    listenersByEvent.set(
      normalizedEventName,
      currentListeners.filter((candidate) => candidate !== listener),
    );
  };
}

/** @param {string} eventName @param {InternalEventPayload} [payload] */
async function emitInternalEvent(eventName, payload = {}) {
  const normalizedEventName = normalizeEventName(eventName);
  const event = normalizeEvent(normalizedEventName, payload);
  const listeners = [...(listenersByEvent.get(normalizedEventName) || [])];
  const results = [];

  for (const listener of listeners) {
    try {
      await listener.handler(event);
      results.push({
        event: normalizedEventName,
        hookId: listener.id,
        moduleId: listener.moduleId,
        status: "ok",
      });
    } catch (error) {
      console.error(`[internal-events] Hook '${listener.id}' failed for '${normalizedEventName}':`, error);
      results.push({
        event: normalizedEventName,
        hookId: listener.id,
        moduleId: listener.moduleId,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    event,
    results,
  };
}

function listInternalEventSubscriptions() {
  return [...listenersByEvent.entries()].flatMap(([event, listeners]) => (
    listeners.map((listener) => ({
      event,
      hookId: listener.id,
      moduleId: listener.moduleId,
    }))
  ));
}

function resetInternalEventSubscriptions() {
  listenersByEvent.clear();
}

/** @param {string} eventName @param {InternalEventPayload} payload @returns {InternalEvent} */
function normalizeEvent(eventName, payload) {
  const session = payload.session || null;
  const workspaceId = payload.workspace_id || payload.workspaceId || session?.workspace_id || "";
  const actorUserId = payload.actor_user_id || payload.actorUserId || session?.user_id || "";

  return {
    name: eventName,
    workspace_id: workspaceId,
    actor_user_id: actorUserId,
    module_id: payload.module_id || payload.moduleId || "",
    record_type: payload.record_type || payload.recordType || "",
    record_id: payload.record_id || payload.recordId || "",
    previous_value: normalizeOptionalObject(payload.previous_value || payload.previousValue),
    new_value: normalizeOptionalObject(payload.new_value || payload.newValue),
    source: payload.source || "manual",
    metadata: payload.metadata || {},
    session,
    emitted_at: payload.emitted_at || payload.emittedAt || new Date().toISOString(),
  };
}

/** @param {unknown} value @returns {Record<string, unknown> | unknown[] | null} */
function normalizeOptionalObject(value) {
  return value && typeof value === "object"
    ? /** @type {Record<string, unknown> | unknown[]} */ (value)
    : null;
}

/** @param {unknown} eventName */
function normalizeEventName(eventName) {
  const normalizedEventName = String(eventName || "").trim();

  if (!normalizedEventName) {
    throw new TypeError("Internal event name is required.");
  }

  return normalizedEventName;
}

export const internalEventBus = {
  emit: emitInternalEvent,
  listSubscriptions: listInternalEventSubscriptions,
  on: onInternalEvent,
  reset: resetInternalEventSubscriptions,
};

