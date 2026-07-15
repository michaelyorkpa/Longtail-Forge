(function guardNotificationsPageLoad() {
  window.setTimeout(() => {
    if (window.LongtailForge?.notificationsPageReady) {
      return;
    }

    const status = document.querySelector("[data-notification-status]");
    if (status) {
      status.textContent = "Notifications script did not finish loading. Refresh the page and try again.";
      status.classList.add("is-error");
    }
  }, 1500);
})();
