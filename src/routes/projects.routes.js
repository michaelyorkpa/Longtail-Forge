// Project APIs currently share the client-projects endpoint.
// This route module exists so project-specific routes have a clear module.
export { clientsRoutes as projectsRoutes } from "./clients.routes.js";
