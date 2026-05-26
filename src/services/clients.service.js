import {
  handleClientProjectsRead,
  handleClientProjectsSave,
} from "../legacy/handlers.js";

export const clientsService = {
  readClientProjects: handleClientProjectsRead,
  saveClientProjects: handleClientProjectsSave,
};
