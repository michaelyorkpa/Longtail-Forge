import {
  getRequestSession,
  handleUnauthenticatedRequest,
} from "../legacy/handlers.js";

function requireAuth(request, response, next) {
  const session = getRequestSession(request);

  if (!session) {
    handleUnauthenticatedRequest(request, response, request.path).catch(next);
    return;
  }

  request.session = session;
  next();
}

export { requireAuth };
