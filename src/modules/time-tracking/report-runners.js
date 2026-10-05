import { registerReportRunner } from "../../core/reporting/report-runner-registry.js";

const PROJECT_TIME_BILLING_RUNNER_ID = "time-tracking.project-time-billing";

function registerTimeTrackingReportRunners() {
  return registerReportRunner(
    PROJECT_TIME_BILLING_RUNNER_ID,
    runProjectTimeBillingReport,
  );
}

/** @param {import("../../types/framework-contracts.d.ts").ReportRunnerContext} context */
async function runProjectTimeBillingReport(context) {
  const { timeTrackingBillingService } = await import("./time-tracking-billing.service.js");
  if (!isTimeTrackingSession(context.session)) {
    throw new TypeError("Time Tracking report runner requires an active workspace session.");
  }
  return timeTrackingBillingService.runProjectTimeBillingReport({
    filters: /** @type {import("../../types/time-tracking-contracts.d.ts").BillingReportQuery} */ (context.filters),
    session: context.session,
  });
}

/** @param {unknown} value @returns {value is import("../../types/time-tracking-contracts.d.ts").TimeTrackingSession} */
function isTimeTrackingSession(value) {
  return Boolean(value && typeof value === "object" && "workspace_id" in value && value.workspace_id);
}

export {
  PROJECT_TIME_BILLING_RUNNER_ID,
  registerTimeTrackingReportRunners,
};
