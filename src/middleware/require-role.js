/** @returns {import("../types/route-contracts.js").AsyncRouteHandler} */
function requireRole() {
  return (request, response, next) => {
    // Placeholder for the upcoming multi-role assignment layer.
    next();
  };
}

export { requireRole };
