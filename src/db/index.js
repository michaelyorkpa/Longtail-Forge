import { ensureDatabase } from "../legacy/handlers.js";

async function initializeDatabase() {
  await ensureDatabase();
}

export { initializeDatabase };
