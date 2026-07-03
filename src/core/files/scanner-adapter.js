import { spawn as spawnProcess } from "node:child_process";
import { connect as connectSocket } from "node:net";
import { clearTimeout, setImmediate, setTimeout } from "node:timers";

const DEFAULT_CLAMD_HOST = "127.0.0.1";
const DEFAULT_CLAMD_PORT = 3310;
const DEFAULT_CLAMD_TIMEOUT_MS = 30000;
const CLAMD_HEALTH_COMMAND = Buffer.from("zPING\0");
const CLAMD_SCAN_COMMAND = Buffer.from("zINSTREAM\0");
const CLAMD_END_CHUNK = Buffer.alloc(4);
const CLAMD_CHUNK_SIZE = 64 * 1024;
const DEFAULT_CLAMSCAN_EXECUTABLE = "clamscan";
const DEFAULT_CLAMSCAN_TIMEOUT_MS = 30000;
const CLAMSCAN_HEALTH_ARGS = Object.freeze(["--version"]);
const CLAMSCAN_SCAN_ARGS = Object.freeze(["--no-summary", "-"]);
const MAX_SCANNER_OUTPUT_CHARS = 4096;

function createNoneFileScannerAdapter() {
  return {
    id: "none",
    async health() {
      return {
        available: false,
        status: "disabled",
      };
    },
    async scan(file = {}) {
      return {
        metadata: {
          scanner: "none",
        },
        reason: "",
        scanStatus: "not_required",
        status: "available",
        fileId: file.fileId || "",
      };
    },
  };
}

function createNoopFileScannerAdapter() {
  return {
    id: "noop",
    async health() {
      return {
        available: false,
        status: "pass_through",
      };
    },
    async scan(file = {}) {
      return {
        metadata: {
          scanner: "noop",
        },
        reason: "",
        scanStatus: "passed",
        status: "available",
        fileId: file.fileId || "",
      };
    },
  };
}

function createClamdFileScannerAdapter(options = {}) {
  const connect = typeof options.connect === "function" ? options.connect : connectSocket;
  const host = normalizeClamdHost(options.host);
  const port = normalizeClamdPort(options.port);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs, DEFAULT_CLAMD_TIMEOUT_MS);

  return {
    id: "clamd",
    async health() {
      const result = await runClamdSession({
        connect,
        host,
        port,
        timeoutMs,
      });

      if (!result.timedOut && !result.socketError && clamdResponseIsPong(result.response)) {
        return {
          available: true,
          status: "ok",
        };
      }

      return {
        available: false,
        status: "unavailable",
      };
    },
    async scan(file = {}) {
      let inputStream;
      try {
        if (typeof file.openReadStream !== "function") {
          throw new TypeError("File scanner context must provide openReadStream().");
        }
        inputStream = await file.openReadStream();
      } catch {
        return quarantineClamdScanResult(file, {
          reason: "Scanner unavailable.",
          result: "unavailable",
          scanStatus: "error",
        });
      }

      const result = await runClamdSession({
        connect,
        host,
        inputStream,
        port,
        timeoutMs,
      });

      if (result.timedOut) {
        return quarantineClamdScanResult(file, {
          reason: "Scanner timed out.",
          result: "timeout",
          scanStatus: "error",
        });
      }

      if (result.socketError || result.streamError) {
        return quarantineClamdScanResult(file, {
          reason: "Scanner unavailable.",
          result: "unavailable",
          scanStatus: "error",
        });
      }

      if (clamdResponseIsClean(result.response)) {
        return {
          metadata: clamdMetadata("clean"),
          reason: "",
          scanStatus: "passed",
          status: "available",
          fileId: file.fileId || "",
        };
      }

      if (clamdResponseIsInfected(result.response)) {
        return quarantineClamdScanResult(file, {
          reason: "Scanner reported a threat.",
          result: "infected",
          scanStatus: "failed",
        });
      }

      return quarantineClamdScanResult(file, {
        reason: "Scanner unavailable.",
        result: "unavailable",
        scanStatus: "error",
      });
    },
  };
}

function createClamscanFileScannerAdapter(options = {}) {
  const executablePath = normalizeExecutablePath(options.executablePath);
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs, DEFAULT_CLAMSCAN_TIMEOUT_MS);
  const spawn = typeof options.spawn === "function" ? options.spawn : spawnProcess;

  return {
    id: "clamscan",
    async health() {
      const result = await runScannerProcess({
        args: CLAMSCAN_HEALTH_ARGS,
        executablePath,
        spawn,
        timeoutMs,
      });

      if (!result.timedOut && !result.spawnError && result.exitCode === 0) {
        return {
          available: true,
          status: "ok",
        };
      }

      return {
        available: false,
        status: "unavailable",
      };
    },
    async scan(file = {}) {
      let inputStream;
      try {
        if (typeof file.openReadStream !== "function") {
          throw new TypeError("File scanner context must provide openReadStream().");
        }
        inputStream = await file.openReadStream();
      } catch {
        return quarantineScanResult(file, {
          reason: "Scanner unavailable.",
          result: "unavailable",
          scanStatus: "error",
        });
      }

      const result = await runScannerProcess({
        args: CLAMSCAN_SCAN_ARGS,
        executablePath,
        inputStream,
        spawn,
        timeoutMs,
      });

      if (result.timedOut) {
        return quarantineScanResult(file, {
          exitCode: result.exitCode,
          reason: "Scanner timed out.",
          result: "timeout",
          scanStatus: "error",
        });
      }

      if (result.spawnError || result.streamError) {
        return quarantineScanResult(file, {
          exitCode: result.exitCode,
          reason: "Scanner unavailable.",
          result: "unavailable",
          scanStatus: "error",
        });
      }

      if (result.exitCode === 0) {
        return {
          metadata: scannerMetadata("clean", result.exitCode),
          reason: "",
          scanStatus: "passed",
          status: "available",
          fileId: file.fileId || "",
        };
      }

      if (result.exitCode === 1) {
        return quarantineScanResult(file, {
          exitCode: result.exitCode,
          reason: "Scanner reported a threat.",
          result: "infected",
          scanStatus: "failed",
        });
      }

      return quarantineScanResult(file, {
        exitCode: result.exitCode,
        reason: "Scanner unavailable.",
        result: "unavailable",
        scanStatus: "error",
      });
    },
  };
}

function quarantineClamdScanResult(file, options = {}) {
  return {
    metadata: clamdMetadata(options.result || "unavailable"),
    reason: options.reason || "Scanner unavailable.",
    scanStatus: options.scanStatus || "error",
    status: "quarantined",
    fileId: file.fileId || "",
  };
}

function quarantineScanResult(file, options = {}) {
  return {
    metadata: scannerMetadata(options.result || "unavailable", options.exitCode),
    reason: options.reason || "Scanner unavailable.",
    scanStatus: options.scanStatus || "error",
    status: "quarantined",
    fileId: file.fileId || "",
  };
}

function clamdMetadata(result) {
  return {
    scanner: "clamd",
    result,
  };
}

function scannerMetadata(result, exitCode) {
  const metadata = {
    scanner: "clamscan",
    result,
  };

  if (Number.isInteger(exitCode)) {
    metadata.exitCode = exitCode;
  }

  return metadata;
}

function normalizeExecutablePath(value) {
  const executablePath = String(value || "").trim();
  return executablePath || DEFAULT_CLAMSCAN_EXECUTABLE;
}

function normalizeClamdHost(value) {
  const host = String(value || "").trim();
  return host || DEFAULT_CLAMD_HOST;
}

function normalizeClamdPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return DEFAULT_CLAMD_PORT;
  }
  return port;
}

function normalizeTimeoutMs(value, defaultTimeoutMs) {
  const timeoutMs = Number(value);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return defaultTimeoutMs;
  }

  return Math.min(Math.max(Math.trunc(timeoutMs), 100), 5 * 60 * 1000);
}

async function runClamdSession({ connect, host, inputStream = null, port, timeoutMs }) {
  return new Promise((resolve) => {
    let settled = false;
    let socket = null;
    let socketError = null;
    let streamError = null;
    let timedOut = false;
    let timeout = null;
    let response = "";

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      inputStream?.destroy?.();
      socket?.destroy?.();
      resolve({
        response,
        socketError,
        streamError,
        timedOut,
      });
    };

    try {
      socket = connect({ host, port });
    } catch (error) {
      socketError = error;
      finish();
      return;
    }

    timeout = setTimeout(() => {
      timedOut = true;
      finish();
    }, timeoutMs);
    timeout.unref?.();

    socket.setNoDelay?.(true);

    socket.on("connect", () => {
      writeClamdRequest(socket, inputStream).catch((error) => {
        streamError = error;
        finish();
      });
    });
    socket.on("data", (chunk) => {
      response = appendBoundedOutput(response, chunk);
    });
    socket.on("error", (error) => {
      socketError = error;
      finish();
    });
    socket.on("close", finish);
    socket.on("end", finish);
  });
}

async function writeClamdRequest(socket, inputStream) {
  if (!inputStream) {
    socket.end(CLAMD_HEALTH_COMMAND);
    return;
  }

  await writeSocketBuffer(socket, CLAMD_SCAN_COMMAND);

  for await (const chunk of inputStream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    for (let offset = 0; offset < buffer.length; offset += CLAMD_CHUNK_SIZE) {
      const slice = buffer.subarray(offset, offset + CLAMD_CHUNK_SIZE);
      const size = Buffer.alloc(4);
      size.writeUInt32BE(slice.length, 0);
      await writeSocketBuffer(socket, size);
      await writeSocketBuffer(socket, slice);
    }
  }

  socket.end(CLAMD_END_CHUNK);
}

async function writeSocketBuffer(socket, buffer) {
  if (socket.destroyed) {
    throw new Error("Scanner unavailable.");
  }

  await new Promise((resolve, reject) => {
    socket.write(buffer, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function clamdResponseLines(response) {
  return String(response || "")
    .replaceAll("\0", "\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function clamdResponseIsPong(response) {
  return clamdResponseLines(response).some((line) => line === "PONG");
}

function clamdResponseIsClean(response) {
  return clamdResponseLines(response).some((line) => line === "OK" || /:\s*OK$/i.test(line));
}

function clamdResponseIsInfected(response) {
  return clamdResponseLines(response).some((line) => /\bFOUND\b/i.test(line));
}

async function runScannerProcess({ executablePath, args, inputStream = null, spawn, timeoutMs }) {
  return new Promise((resolve) => {
    let child;
    let exitCode = null;
    let signal = null;
    let settled = false;
    let spawnError = null;
    let streamError = null;
    let timedOut = false;
    let timeout = null;
    let stdout = "";
    let stderr = "";

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      inputStream?.destroy?.();
      resolve({
        exitCode,
        signal,
        spawnError,
        stderr,
        stdout,
        streamError,
        timedOut,
      });
    };

    const spawnCommand = createSpawnCommand(executablePath, args);

    try {
      child = spawn(spawnCommand.executablePath, spawnCommand.args, {
        stdio: [inputStream ? "pipe" : "ignore", "pipe", "pipe"],
        windowsVerbatimArguments: spawnCommand.windowsVerbatimArguments,
        windowsHide: true,
      });
    } catch (error) {
      spawnError = error;
      finish();
      return;
    }

    timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
      inputStream?.destroy?.();
      setTimeout(finish, 1000).unref?.();
    }, timeoutMs);
    timeout.unref?.();

    child.on("error", (error) => {
      spawnError = error;
      inputStream?.destroy?.();
      setImmediate(finish);
    });

    child.on("close", (code, closeSignal) => {
      exitCode = code;
      signal = closeSignal;
      finish();
    });

    child.stdout?.on("data", (chunk) => {
      stdout = appendBoundedOutput(stdout, chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr = appendBoundedOutput(stderr, chunk);
    });
    child.stdin?.on("error", () => {});

    if (inputStream) {
      inputStream.on("error", (error) => {
        streamError = error;
        child.stdin?.destroy?.();
      });
      inputStream.pipe(child.stdin);
    }
  });
}

function appendBoundedOutput(current, chunk) {
  if (current.length >= MAX_SCANNER_OUTPUT_CHARS) {
    return current;
  }

  return (current + chunk.toString("utf8")).slice(0, MAX_SCANNER_OUTPUT_CHARS);
}

function createSpawnCommand(executablePath, args) {
  if (process.platform === "win32" && /\.(?:bat|cmd)$/i.test(executablePath)) {
    const commandLine = `"${[executablePath, ...args].map(quoteWindowsCommandArgument).join(" ")}"`;

    return {
      executablePath: "cmd.exe",
      args: ["/d", "/s", "/c", commandLine],
      windowsVerbatimArguments: true,
    };
  }

  return { executablePath, args, windowsVerbatimArguments: false };
}

function quoteWindowsCommandArgument(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export {
  createClamdFileScannerAdapter,
  createClamscanFileScannerAdapter,
  createNoneFileScannerAdapter,
  createNoopFileScannerAdapter,
};
