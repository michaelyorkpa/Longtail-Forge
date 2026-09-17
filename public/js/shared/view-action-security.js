/**
 * The guarded half of descriptor action dispatch: confirmation, route interpolation, and the
 * dispatch itself.
 *
 * Extracted from `public/js/shared/view-renderer.js` by `0.33.33.35.2`. The renderer keeps the
 * orchestration - deciding between a route, a behavior, and a modal, settling surface state, and
 * re-rendering. What lives here is what an action runs against and how it is confirmed first.
 *
 * **It carries no permission check, and `0.33.33.39.22` stopped implying one.** This module
 * published `actionPermissionsAllowed` and `assertActionPermissions` for four checkpoints while
 * the first returned `true` unconditionally and the second could not throw; the lookup behind
 * them read two members the canonical workspace context has never had.
 * **The enforcement point is the server and always was** - every route these actions dispatch to
 * checks permissions itself and refuses an unauthorized caller - so retiring the pair removes a
 * hook that was never connected rather than a control. Whether the browser should receive a
 * deliberately designed, server-derived permission hint for advisory gating stays an open
 * framework question; it is not answered by leaving two no-ops in a published contract.
 *
 * Two collaborators are supplied by the caller rather than resolved here, so this module never
 * acquires anything: the API client, and the descriptor value reader used to fill route tokens.
 * That also keeps it ignorant of descriptor semantics - it interpolates whatever the reader
 * returns and knows nothing about what a descriptor ought to contain, which is the invariant
 * `0.33.33.35.1.2` established when the server descriptor became the single source of truth.
 *
 * It is not a bootstrap participant: it reads no workspace context at all, and never loads,
 * awaits, or refreshes it.
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
   *
   * `requiredPermissions` left this shape with `0.33.33.39.22`: nothing here reads it now. **The
   * metadata itself stays** - `view-surface-descriptor.js` admits and validates it on every
   * descriptor action, and `src/core/modules/manifest-contract.js` checks it against the declared
   * permission set when a module manifest is loaded. Those are its owners; this module never was.
   * @typedef {{
   *   confirm?: unknown,
   *   id?: string,
   *   label?: string,
   *   method?: string,
   *   payload?: unknown,
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
    confirmDescriptorAction,
    interpolateRoute,
    runRouteAction,
  });
  global.LongtailForge = namespace;
})(window);
