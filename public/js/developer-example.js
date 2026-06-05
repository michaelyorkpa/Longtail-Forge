(async () => {
  const output = document.getElementById("developer-example-output");

  if (!output) {
    return;
  }

  try {
    const response = await fetch("/api/developer-example/status");
    const body = await response.json();
    output.textContent = JSON.stringify(body, null, 2);
  } catch (error) {
    output.textContent = error?.message || "Developer example route failed.";
  }
})();

