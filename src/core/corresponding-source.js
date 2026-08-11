// @ts-check
import { config } from "../config.js";

function correspondingSourceRef(runtimeConfig = config) {
  return runtimeConfig.release.commitSha || `v${runtimeConfig.appVersion}`;
}

function correspondingSourceUrl(runtimeConfig = config) {
  const encodedRef = encodeURIComponent(correspondingSourceRef(runtimeConfig));
  return runtimeConfig.legal.correspondingSourceUrlTemplate.replaceAll("{ref}", encodedRef);
}

function trackedSourceUrl(relativePath, runtimeConfig = config) {
  const sourceUrl = new URL(correspondingSourceUrl(runtimeConfig));
  const normalizedPath = String(relativePath || "")
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  if (sourceUrl.hostname.toLowerCase() === "github.com") {
    sourceUrl.pathname = sourceUrl.pathname.replace("/tree/", "/blob/");
  }
  sourceUrl.pathname = `${sourceUrl.pathname.replace(/\/+$/, "")}/${normalizedPath}`;
  return sourceUrl.toString();
}

export { correspondingSourceRef, correspondingSourceUrl, trackedSourceUrl };
