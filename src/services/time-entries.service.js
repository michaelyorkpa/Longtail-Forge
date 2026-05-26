import {
  handleTimeEntriesRead,
  handleTimeEntry,
  handleTimeEntryUpdate,
} from "../legacy/handlers.js";

export const timeEntriesService = {
  create: handleTimeEntry,
  update: handleTimeEntryUpdate,
  list: handleTimeEntriesRead,
};
