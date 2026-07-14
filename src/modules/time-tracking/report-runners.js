import { registerReportRunner } from "../../core/reporting/report-runner-registry.js";

const PROJECT_TIME_BILLING_RUNNER_ID = "time-tracking.project-time-billing";

function registerTimeTrackingReportRunners() {
  return registerReportRunner(
    PROJECT_TIME_BILLING_RUNNER_ID,
    runProjectTimeBillingReport,
  );
}

async function runProjectTimeBillingReport(context) {
  const { timeTrackingBillingService } = await import("./time-tracking-billing.service.js");
  return timeTrackingBillingService.runProjectTimeBillingReport(context);
}

export {
  PROJECT_TIME_BILLING_RUNNER_ID,
  registerTimeTrackingReportRunners,
};
