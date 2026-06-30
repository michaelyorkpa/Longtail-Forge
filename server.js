import { loadRuntimeEnvFile } from "./src/runtime-env.js";

loadRuntimeEnvFile();

const { startServer } = await import("./src/core/app.js");

startServer();
