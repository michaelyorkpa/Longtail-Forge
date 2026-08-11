// @ts-check
import {
  ActiveTimerSaveSchema,
  ActiveTimerSourcedSaveSchema,
  parseTimeTrackingEdgePayload,
} from "../../src/modules/time-tracking/time-tracking.contracts.js";

const timerPayload = parseTimeTrackingEdgePayload(ActiveTimerSaveSchema, {
  billable: false,
  project_id: "project-1",
});

/** @type {boolean | "yes" | "no" | undefined} */
const billable = timerPayload.billable;

// @ts-expect-error Manual timer payloads do not expose sourced metadata.
timerPayload.sourceMetadata;

const sourcedPayload = parseTimeTrackingEdgePayload(ActiveTimerSourcedSaveSchema, {
  billable: false,
  project_id: "project-1",
  sourceMetadata: { taskTimerStatusTransition: { movedTaskToInProgress: true } },
});

/** @type {Record<string, unknown> | undefined} */
const sourceMetadata = sourcedPayload.sourceMetadata;

void billable;
void sourceMetadata;
