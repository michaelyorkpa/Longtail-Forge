// @ts-check
import { registerJobHandler } from "../../src/core/jobs/job-handlers.js";
import { enqueueJob } from "../../src/core/jobs/job-queue.js";

registerJobHandler("file.scan", async ({ job, payload }) => ({
  fileId: String(payload.fileId || payload.file_id || ""),
  jobId: job.jobId,
}));

void enqueueJob({
  jobType: "search.index",
  payload: {
    operation: "reindex",
    recordReference: {
      moduleId: "tasks",
      recordId: "task-1",
      recordType: "task",
      workspaceId: "workspace-1",
    },
  },
  workspaceId: "workspace-1",
});

// @ts-expect-error File scan jobs cannot carry notification-event payloads.
void enqueueJob({ jobType: "file.scan", payload: { event: {} }, workspaceId: "workspace-1" });

// @ts-expect-error Unregistered job types must declare a payload-registry entry before enqueue.
void enqueueJob({ jobType: "plugin.undeclared", payload: {}, workspaceId: "workspace-1" });
