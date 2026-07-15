import { loadRuntimeEnvFile } from "./src/runtime-env.js";

loadRuntimeEnvFile();

const { installProductionConsoleBridge } = await import("./src/core/operational-logger.js");
installProductionConsoleBridge();

const { startWorkerCli } = await import("./src/core/jobs/worker-cli.js");

await startWorkerCli();
