function createNoopFileScannerAdapter() {
  return {
    id: "noop",
    async scan(file = {}) {
      return {
        metadata: {
          scanner: "noop",
        },
        reason: "",
        scanStatus: "passed",
        status: "available",
        fileId: file.file_id || file.fileId || "",
      };
    },
  };
}

export { createNoopFileScannerAdapter };
