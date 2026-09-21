// @ts-check

(function () {
  const namespace = window.LongtailForge || {};
  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  /** @param {unknown} amount */
  function currency(amount) {
    return currencyFormatter.format(Number(amount) || 0);
  }

  /** @param {unknown} seconds */
  function hours(seconds) {
    return `${((Number(seconds) || 0) / 3600).toFixed(2)} hrs`;
  }

  /** @param {Date} date */
  function monthLabel(date) {
    return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getFullYear()).slice(-2)}`;
  }

  /** @param {Date} date */
  function dateInput(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  }

  /** @param {unknown} status */
  function entryStatus(status) {
    // The index converted its name to a property key and consulted the table's own and
    // inherited names. This reads it the same way, so a `String` object still selects its
    // label, a symbol still selects nothing, and an inherited name still answers what it
    // always answered.
    return Reflect.get({
      unbilled: "Unbilled",
      billed: "Billed",
      paid: "Paid",
      na: "N/A",
    }, Reflect.ownKeys(Object.fromEntries([[status, undefined]]))[0]) || "Unbilled";
  }

  /**
   * @param {unknown} value
   * @param {string} [fallback]
   */
  function name(value, fallback = "") {
    return String(value || "").trim() || fallback;
  }

  namespace.formatters = {
    currency,
    hours,
    monthLabel,
    dateInput,
    entryStatus,
    name,
  };
  window.LongtailForge = namespace;
}());
