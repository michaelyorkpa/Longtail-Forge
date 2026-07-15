import { loadRuntimeEnvFile } from "./src/runtime-env.js";

loadRuntimeEnvFile();

const { installProductionConsoleBridge } = await import("./src/core/operational-logger.js");
installProductionConsoleBridge();

const { startServer } = await import("./src/core/app.js");

startServer();
