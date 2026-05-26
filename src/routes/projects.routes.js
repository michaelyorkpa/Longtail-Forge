// Project APIs currently share the client-projects endpoint.
// This route module exists so project-specific routes have a clear home.
export { clientsRoutes as projectsRoutes } from "./clients.routes.js";
