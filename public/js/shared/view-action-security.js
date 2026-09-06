/**
 * The security-relevant half of descriptor action dispatch: permission gating, confirmation,
 * and route interpolation.
 *
 * Extracted from `public/js/shared/view-renderer.js` by `0.33.33.35.2`. The renderer keeps the
 * dispatch itself - deciding between a route, a behavior, and a modal, settling surface state,
 * and re-rendering - because that is rendering orchestration. What lives here is the part that
 * decides whether an action may run at all and what URL it runs against.
 *
 * Two collaborators are supplied by the caller rather than resolved here, so this module never
 * acquires anything: the API client, and the descriptor value reader used to fill route tokens.
 * That also keeps it ignorant of descriptor semantics - it interpolates whatever the reader
 * returns and knows nothing about what a descriptor ought to contain, which is the invariant
 * `0.33.33.35.1.2` established when the server descriptor became the single source of truth.
 *
 * It is not a bootstrap participant: it reads already-resolved workspace context for granted
 * permissions and never loads, awaits, or refreshes it.
 *
 * @param {Window} global
 */
(function attachViewActionSecurity(global) {
  // Scoped inside the IIFE deliberately: a top-level JSDoc typedef in a classic script leaks
  // into the shared type environment the way a top-level `const` leaks into the shared lexical
  // one, which is the thing `0.33.33.33` removed from this estate. Recorded at `0.33.33.34`.

  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserApi} BrowserApi */

  /**
   * The parts of a descriptor action this module reads.
   * @typedef {{
   *   confirm?: unknown,
   *   id?: string,
   *   label?: string,
   *   method?: string,
   *   payload?: unknown,
   *   requiredPermissions?: unknown,
   *   route?: string,
   * }} SecuredAction
   */

  /**
   * Reads one descriptor field out of a record. Supplied by the caller; this module does not
   * know how a descriptor names its fields.
   * @typedef {(record: unknown, field: string, fallback?: unknown) => unknown} DescriptorValueReader
   */

  const namespace = global.LongtailForge || {};

  /**
   * Whether an action's declared permissions allow it here. **Always `true`.**
   *
   * This has never gated anything, and `0.33.33.38.2.2.5.2` removed the assertion that hid it.
   * The check reached for `permissionIds` and then `permissions` on the workspace context
   * through a type assertion naming two members the canonical context does not have:
   * `buildWorkspaceContext` reconstructs fourteen members by name and no grant list is among
   * them, so both reads were `undefined`, the `Array.isArray` guard failed, and every call
   * returned `true`. Removing the assertion changes the answer for no caller.
   *
   * **The enforcement point is the server and always was.** The routes these actions dispatch
   * to check permissions themselves and refuse an unauthorized caller whether or not this ran,
   * so this is not a control that has been weakened - it is a hook that was never connected.
   *
   * It stays as a published hook rather than being deleted: `LongtailForge.viewActionSecurity`
   * is a live surface and the renderer calls this between confirmation and dispatch. Whether
   * the browser should receive a deliberately designed, server-derived permission hint for
   * advisory gating - the app shell already computes a role-accurate `permissionIds` that the
   * stored context deliberately drops - is an open framework decision, not this checkpoint's.
   *
   * `action` is unread and keeps its place in the published signature.
   * @param {SecuredAction} [action]
   * @returns {boolean}
   */
  function actionPermissionsAllowed(action = {}) {
    void action;

    return true;
  }

  /**
   * @param {SecuredAction} action
   * @returns {void}
   */
  function assertActionPermissions(action) {
    if (!actionPermissionsAllowed(action)) {
      throw new Error("You do not have permission to run this action.");
    }
  }

  /**
   * Confirm a destructive or guarded action, preferring the framework modal and falling back
   * to the host confirm.
   *
   * @param {SecuredAction} action
   * @returns {Promise<boolean>}
   */
  async function confirmDescriptorAction(action) {
    const message = typeof action.confirm === "string"
      ? action.confirm
      : `Continue with ${action.label || action.id || "this action"}?`;
    const modal = /** @type {{ confirm?: (options: { title: string, message: string }) => Promise<boolean> } | undefined} */ (
      namespace.modal
    );
    if (modal?.confirm) {
      return modal.confirm({ title: action.label || "Confirm action", message });
    }
    if (typeof global.confirm === "function") {
      return global.confirm(message);
    }
    return true;
  }

  /**
   * Replace `{field}` tokens in a route with values read out of the record.
   *
   * A token whose value is missing is left as-is rather than emptied, so a malformed route
   * fails loudly at the server instead of silently addressing the wrong resource.
   *
   * @param {unknown} route
   * @param {unknown} record
   * @param {DescriptorValueReader} readValue
   * @returns {unknown}
   */
  function interpolateRoute(route, record, readValue) {
    if (typeof route !== "string" || !record) {
      return route;
    }
    return route.replace(/\{([\w.]+)\}/g, (match, field) => {
      const value = readValue(record, field, undefined);
      return value === undefined || value === null ? match : encodeURIComponent(String(value));
    });
  }

  /**
   * Run a descriptor route action through the supplied API client.
   *
   * Settling surface state is the caller's concern; this returns once the call has completed.
   *
   * @param {SecuredAction} action
   * @param {{ api: BrowserApi, readValue: DescriptorValueReader, record?: unknown }} context
   * @returns {Promise<void>}
   */
  async function runRouteAction(action, context) {
    const { api, readValue, record = null } = context;
    const method = String(action.method || "POST").toUpperCase();
    const route = String(interpolateRoute(action.route, record, readValue) ?? "");

    if (method === "GET") {
      await api.getJson(route, { cache: "no-store" });
    } else if (method === "POST") {
      await api.postJson(route, action.payload || {});
    } else if (method === "PUT") {
      await api.putJson(route, action.payload || {});
    } else if (method === "PATCH") {
      if (typeof api.patchJson !== "function") {
        throw new Error("PATCH route actions require LongtailForge.api.patchJson.");
      }
      await api.patchJson(route, action.payload || {});
    } else if (method === "DELETE") {
      await api.deleteJson(route);
    } else {
      throw new Error(`Unsupported action method: ${method}`);
    }
  }

  namespace.viewActionSecurity = Object.freeze({
    actionPermissionsAllowed,
    assertActionPermissions,
    confirmDescriptorAction,
    interpolateRoute,
    runRouteAction,
  });
  global.LongtailForge = namespace;
})(window);
