import { AppError } from "../../utils/app-error.js";

const S3_PROVIDER_ID = "s3";

function createS3FileStorageAdapter(options = {}) {
  const settings = normalizeS3Settings(options);

  async function failOperation() {
    const missing = missingS3Settings(settings);
    if (missing.length > 0) {
      throw new AppError(`S3 file storage provider is not configured. Missing: ${missing.join(", ")}.`, 500);
    }

    throw new AppError("S3 file storage provider is registered, but object operations are not implemented in this release.", 501);
  }

  return {
    id: S3_PROVIDER_ID,
    async delete() {
      await failOperation();
    },
    async health() {
      return {
        ok: false,
        provider: S3_PROVIDER_ID,
        status: missingS3Settings(settings).length > 0 ? "not_configured" : "not_implemented",
      };
    },
    async metadata() {
      await failOperation();
    },
    async read() {
      await failOperation();
    },
    async save() {
      await failOperation();
    },
    async saveStream() {
      await failOperation();
    },
  };
}

function normalizeS3Settings(options = {}) {
  return {
    accessKeyId: normalizeText(options.accessKeyId),
    bucket: normalizeText(options.bucket),
    endpoint: normalizeText(options.endpoint),
    region: normalizeText(options.region),
    secretAccessKey: normalizeText(options.secretAccessKey),
  };
}

function missingS3Settings(settings = {}) {
  return [
    ["LONGTAIL_S3_BUCKET", settings.bucket],
    ["LONGTAIL_S3_REGION", settings.region],
    ["LONGTAIL_S3_ACCESS_KEY_ID", settings.accessKeyId],
    ["LONGTAIL_S3_SECRET_ACCESS_KEY", settings.secretAccessKey],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

function normalizeText(value) {
  return String(value || "").trim();
}

export {
  S3_PROVIDER_ID,
  createS3FileStorageAdapter,
  missingS3Settings,
};
