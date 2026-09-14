(async () => {
  /** @typedef {import("../../src/types/browser-contracts.js").BrowserErrorContract} BrowserErrorContract */

  /**
   * The error contract this page's only failure path reads through.
   *
   * Acquired per call rather than at module scope, matching every sibling page that reads a
   * caught value, so a missing contract fails at the moment it is needed rather than at load.
   * @returns {BrowserErrorContract}
   */
  function requireErrors() {
    const errors = window.LongtailForge?.errors;
    if (!errors) {
      throw new Error("The developer example page requires LongtailForge.errors.");
    }
    return errors;
  }

  const output = document.getElementById("developer-example-output");

  if (!output) {
    return;
  }

  try {
    const response = await fetch("/api/developer-example/status");
    const body = await response.json();
    output.textContent = JSON.stringify(body, null, 2);
  } catch (error) {
    // A `catch` binding is `unknown` and no declaration can change that: anything can be thrown.
    // `caughtMessage` is the estate's published narrowing for this boundary, and every view head
    // is served the error contract, so the checked read fails exactly where the raw
    // `error.message` read failed before.
    output.textContent = requireErrors().caughtMessage(error, "Developer example route failed.");
  }
})();

