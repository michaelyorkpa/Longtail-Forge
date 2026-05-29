import { timeEntriesRoutes } from "./time-entries.routes.js";

const timeTrackingModule = {
  id: "time-tracking",
  name: "Time Tracking",
  description: "Timers, manual entries, editable time entries, and billable time capture.",
  category: "core-workflow",
  version: "0.28.2",
  enabledByDefault: true,
  browserApiRoutes: [timeEntriesRoutes],
  browserAssetsDir: new URL("../../../public/js/", import.meta.url),
  migrationsDir: new URL("./migrations/", import.meta.url),
  protectedViewsDir: new URL("../../../views/protected/", import.meta.url),
  seedData: [],
};

export { timeTrackingModule };
