import { readFileSync } from "node:fs";
import { registerVerifiedRegressionBaselineHandshake } from "../../src/db/regression-baseline-fast-path.js";

const rawDescriptor = String(process.env.LTF_REGRESSION_VERIFIED_BASELINE_FD || "").trim();
delete process.env.LTF_REGRESSION_VERIFIED_BASELINE_FD;

if (rawDescriptor) {
  if (!/^\d+$/.test(rawDescriptor)) {
    throw new Error("Verified regression baseline descriptor must be a non-negative integer.");
  }

  const descriptor = Number.parseInt(rawDescriptor, 10);
  let rawHandshake;
  try {
    rawHandshake = readFileSync(descriptor, "utf8");
  } catch (error) {
    throw new Error(`Could not read verified regression baseline handshake: ${error.message || error}`);
  }

  if (Buffer.byteLength(rawHandshake, "utf8") > 64 * 1024) {
    throw new Error("Verified regression baseline handshake exceeds the 64 KiB limit.");
  }

  let handshake;
  try {
    handshake = JSON.parse(rawHandshake);
  } catch {
    throw new Error("Verified regression baseline handshake is not valid JSON.");
  }

  registerVerifiedRegressionBaselineHandshake(handshake);
}
