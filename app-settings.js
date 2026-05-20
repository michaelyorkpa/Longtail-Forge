const settingsForm = document.querySelector("[data-app-settings-form]");
const organizationNameInput = document.querySelector("[data-organization-name-input]");
const fiscalYearStartMonthSelect = document.querySelector("[data-fiscal-year-start-month]");
const fiscalYearStartDaySelect = document.querySelector("[data-fiscal-year-start-day]");
const defaultBillingRateInput = document.querySelector("[data-default-billing-rate-input]");
const billingPeriodTypeSelect = document.querySelector("[data-billing-period-type]");
const billingPeriodStartDaySelect = document.querySelector("[data-billing-period-start-day]");
const billingRoundingEnabledInput = document.querySelector("[data-billing-rounding-enabled]");
const billingRoundingIncrementSelect = document.querySelector("[data-billing-rounding-increment]");
const appSettingsStatus = document.querySelector("[data-app-settings-status]");
const saveSettingsButton = document.querySelector("[data-save-settings]");

populateFiscalYearStartMonths();
populateFiscalYearStartDays();
populateBillingPeriodStartDays();
loadSettingsForm();

fiscalYearStartMonthSelect.addEventListener("change", () => {
  populateFiscalYearStartDays(fiscalYearStartDaySelect.value);
});
billingPeriodTypeSelect.addEventListener("change", updateBillingPeriodStartDayState);
billingRoundingEnabledInput.addEventListener("change", updateBillingRoundingState);

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveSettings();
});

async function loadSettingsForm() {
  setAppSettingsStatus("Loading app settings...");

  try {
    const response = await fetch("data/settings.json", { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Could not load settings: ${response.status}`);
    }

    const settings = normalizeSettings(await response.json());
    organizationNameInput.value = settings.organizationName;
    fiscalYearStartMonthSelect.value = String(settings.fiscalYear.startMonth);
    populateFiscalYearStartDays(settings.fiscalYear.startDay);
    defaultBillingRateInput.value = settings.defaultBillingRate;
    billingPeriodTypeSelect.value = settings.billingPeriod.type;
    billingPeriodStartDaySelect.value = String(settings.billingPeriod.startDay);
    billingRoundingEnabledInput.checked = settings.billingRounding.enabled;
    billingRoundingIncrementSelect.value = settings.billingRounding.increment;
    updateBillingPeriodStartDayState();
    updateBillingRoundingState();
    setAppSettingsStatus("");
  } catch (error) {
    setAppSettingsStatus("App settings could not be loaded.");
    console.error(error);
  }
}

async function saveSettings() {
  const settings = normalizeSettings({
    organizationName: organizationNameInput.value,
    fiscalYear: {
      startMonth: fiscalYearStartMonthSelect.value,
      startDay: fiscalYearStartDaySelect.value,
    },
    defaultBillingRate: defaultBillingRateInput.value,
    billingPeriod: {
      type: billingPeriodTypeSelect.value,
      startDay: billingPeriodStartDaySelect.value,
    },
    billingRounding: {
      enabled: billingRoundingEnabledInput.checked,
      increment: billingRoundingIncrementSelect.value,
    },
  });

  if (!settings.organizationName) {
    setAppSettingsStatus("Organization name is required.");
    return;
  }

  saveSettingsButton.disabled = true;
  setAppSettingsStatus("Saving app settings...");

  try {
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(settings),
    });

    if (!response.ok) {
      throw new Error(`Save failed: ${response.status}`);
    }

    const result = await response.json();
    const savedSettings = normalizeSettings(result.data);
    organizationNameInput.value = savedSettings.organizationName;
    fiscalYearStartMonthSelect.value = String(savedSettings.fiscalYear.startMonth);
    populateFiscalYearStartDays(savedSettings.fiscalYear.startDay);
    defaultBillingRateInput.value = savedSettings.defaultBillingRate;
    billingPeriodTypeSelect.value = savedSettings.billingPeriod.type;
    billingPeriodStartDaySelect.value = String(savedSettings.billingPeriod.startDay);
    billingRoundingEnabledInput.checked = savedSettings.billingRounding.enabled;
    billingRoundingIncrementSelect.value = savedSettings.billingRounding.increment;
    updateBillingPeriodStartDayState();
    updateBillingRoundingState();

    if (typeof applyOrganizationName === "function") {
      applyOrganizationName(savedSettings.organizationName);
    }

    flashSavedState();
  } catch (error) {
    setAppSettingsStatus("App settings were not saved. Start the local server and try again.");
    console.error(error);
  } finally {
    saveSettingsButton.disabled = false;
  }
}

function normalizeSettings(settings) {
  return {
    organizationName: String(settings?.organizationName || "").trim(),
    fiscalYear: normalizeFiscalYear(settings?.fiscalYear),
    defaultBillingRate: String(settings?.defaultBillingRate || "").trim(),
    billingPeriod: normalizeBillingPeriod(settings?.billingPeriod),
    billingRounding: normalizeBillingRounding(settings?.billingRounding),
  };
}

function normalizeFiscalYear(fiscalYear) {
  const startMonth = Math.min(12, Math.max(1, Number.parseInt(fiscalYear?.startMonth, 10) || 1));
  const startDay = Math.min(
    getDaysInFiscalYearMonth(startMonth),
    Math.max(1, Number.parseInt(fiscalYear?.startDay, 10) || 1),
  );

  return {
    startMonth,
    startDay,
  };
}

function populateFiscalYearStartMonths() {
  const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long" });

  for (let month = 1; month <= 12; month += 1) {
    const option = document.createElement("option");
    option.value = String(month);
    option.textContent = monthFormatter.format(new Date(2026, month - 1, 1));
    fiscalYearStartMonthSelect.appendChild(option);
  }
}

function populateFiscalYearStartDays(selectedDay = fiscalYearStartDaySelect.value) {
  const maxDay = getDaysInFiscalYearMonth(Number(fiscalYearStartMonthSelect.value) || 1);
  const normalizedDay = Math.min(maxDay, Math.max(1, Number.parseInt(selectedDay, 10) || 1));

  fiscalYearStartDaySelect.replaceChildren();

  for (let day = 1; day <= maxDay; day += 1) {
    const option = document.createElement("option");
    option.value = String(day);
    option.textContent = formatOrdinal(day);
    fiscalYearStartDaySelect.appendChild(option);
  }

  fiscalYearStartDaySelect.value = String(normalizedDay);
}

function getDaysInFiscalYearMonth(month) {
  return new Date(2026, month, 0).getDate();
}

function normalizeBillingPeriod(period) {
  const type = period?.type === "custom" ? "custom" : "calendarMonth";
  const startDay = Math.min(28, Math.max(1, Number.parseInt(period?.startDay, 10) || 1));

  return {
    type,
    startDay: type === "custom" ? startDay : 1,
  };
}

function populateBillingPeriodStartDays() {
  for (let day = 1; day <= 28; day += 1) {
    const option = document.createElement("option");
    option.value = String(day);
    option.textContent = formatOrdinal(day);
    billingPeriodStartDaySelect.appendChild(option);
  }
}

function updateBillingPeriodStartDayState() {
  const isCustom = billingPeriodTypeSelect.value === "custom";
  billingPeriodStartDaySelect.disabled = !isCustom;

  if (!isCustom) {
    billingPeriodStartDaySelect.value = "1";
  }
}

function normalizeBillingRounding(rounding) {
  const increments = ["nearestHour", "nearestHalfHour", "nearestQuarterHour"];
  const increment = increments.includes(rounding?.increment)
    ? rounding.increment
    : "nearestQuarterHour";

  return {
    enabled: Boolean(rounding?.enabled),
    increment,
  };
}

function updateBillingRoundingState() {
  billingRoundingIncrementSelect.disabled = !billingRoundingEnabledInput.checked;
}

function formatOrdinal(day) {
  const suffix = day % 10 === 1 && day !== 11
    ? "st"
    : day % 10 === 2 && day !== 12
      ? "nd"
      : day % 10 === 3 && day !== 13
        ? "rd"
        : "th";

  return `${day}${suffix}`;
}

function flashSavedState() {
  const originalText = saveSettingsButton.textContent;
  saveSettingsButton.textContent = "Saved.";
  saveSettingsButton.classList.add("is-saved");
  setAppSettingsStatus("");

  window.setTimeout(() => {
    saveSettingsButton.textContent = originalText;
    saveSettingsButton.classList.remove("is-saved");
  }, 1600);
}

function setAppSettingsStatus(message) {
  appSettingsStatus.textContent = message;
}
