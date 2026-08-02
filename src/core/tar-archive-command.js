import { spawnSync } from "node:child_process";
import path from "node:path";

function buildLocalTarArchiveCommand({ archivePath, flags, trailingArgs = [], pathApi = path }) {
  const archivePathText = String(archivePath || "").trim();
  if (!archivePathText) {
    throw new Error("A tar archive file path is required.");
  }
  const resolvedArchivePath = pathApi.resolve(archivePathText);
  const archiveName = pathApi.basename(resolvedArchivePath);
  if (!archiveName || archiveName === "." || archiveName === "..") {
    throw new Error("A tar archive file path is required.");
  }
  return Object.freeze({
    args: Object.freeze([flags, archiveName, ...trailingArgs]),
    cwd: pathApi.dirname(resolvedArchivePath),
  });
}

function runLocalTarArchiveCommand({
  archivePath,
  failureMessagePrefix,
  flags,
  missingCommandMessage,
  trailingArgs = [],
}) {
  const invocation = buildLocalTarArchiveCommand({ archivePath, flags, trailingArgs });
  const result = spawnSync("tar", invocation.args, {
    cwd: invocation.cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error?.code === "ENOENT") {
    throw new Error(missingCommandMessage);
  }
  if (result.status !== 0) {
    throw new Error(`${failureMessagePrefix}: ${String(result.stderr || result.stdout || result.error).trim()}`);
  }
  return String(result.stdout || "").trim();
}

export {
  buildLocalTarArchiveCommand,
  runLocalTarArchiveCommand,
};
