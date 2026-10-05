const timeTrackingEvents = {
  eventTypes: [
    {
      event: "timer.started",
      moduleId: "time-tracking",
      label: "Timer Started",
      description: "Emitted when an active work timer starts or resumes.",
      recordType: "active_work_timer",
    },
    {
      event: "timer.paused",
      moduleId: "time-tracking",
      label: "Timer Paused",
      description: "Emitted when an active work timer is paused.",
      recordType: "active_work_timer",
    },
    {
      event: "timer.finalized",
      moduleId: "time-tracking",
      label: "Timer Finalized",
      description: "Emitted when an active work timer is saved as a time entry.",
      recordType: "active_work_timer",
    },
    {
      event: "timer.discarded",
      moduleId: "time-tracking",
      label: "Timer Discarded",
      description: "Emitted when an active work timer is removed without saving time.",
      recordType: "active_work_timer",
    },
    {
      event: "timer.still_running",
      moduleId: "time-tracking",
      label: "Timer Still Running",
      description: "Reserved notification event for future long-running timer checks.",
      recordType: "active_work_timer",
    },
  ],
  eventSummaries: [
    {
      event: "timer.still_running",
      moduleId: "time-tracking",
      notification: {
        title: "Timer Still Running",
        body: "A timer is still running.",
        url: "workbench.html",
        recipientHints: ["actor"],
      },
    },
  ],
  notificationEvents: [
    {
      id: "timer.still_running",
      moduleId: "time-tracking",
      label: "Timer Still Running",
      description: "Notifies a user when a timer appears to still be running.",
      defaultEnabled: true,
      defaultPriority: "high",
      recipientMode: "actor",
    },
  ],
};

export { timeTrackingEvents };
