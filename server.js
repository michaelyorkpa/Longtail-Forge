const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT) || 8001;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const CLIENT_PROJECT_FILE = path.join(DATA_DIR, "client-project.json");
const APP_LOG_FILE = path.join(DATA_DIR, "app-events.csv");
const CSV_HEADER =
  "entry_id,client_id,client_name,project_id,project_name,description,start_time,end_time,duration_seconds,duration_hours,billable,invoice_status";
const APP_LOG_HEADER =
  "timestamp,username,action,client_id,client_name,project_id,project_name,details";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/api/time-entries") {
      await handleTimeEntry(request, response);
      return;
    }

    if (request.method === "PUT" && request.url === "/api/client-projects") {
      await handleClientProjectsSave(request, response);
      return;
    }

    if (request.method === "GET") {
      await serveStaticFile(request, response);
      return;
    }

    sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Time tracker running at http://${HOST}:${PORT}/index.html`);
});

async function handleTimeEntry(request, response) {
  const entry = await readJsonBody(request);
  const endDate = new Date(entry.end_time);
  const fileName = `${formatYearMonth(endDate)}-time-entries.csv`;
  const filePath = path.join(DATA_DIR, fileName);
  const existingCsv = await readExistingCsv(filePath);
  const entryId = getNextEntryId(existingCsv, endDate);
  const row = toCsvRow({
    entry_id: entryId,
    client_id: entry.client_id,
    client_name: entry.client_name,
    project_id: entry.project_id,
    project_name: entry.project_name,
    description: entry.description,
    start_time: entry.start_time,
    end_time: entry.end_time,
    duration_seconds: entry.duration_seconds,
    duration_hours: entry.duration_hours,
    billable: entry.billable ?? "yes",
    invoice_status: entry.invoice_status || "unbilled",
  });

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.appendFile(filePath, buildCsvAppend(existingCsv, row), "utf8");
  await appendAppLog({
    action: "time_entry_created",
    client_id: entry.client_id,
    client_name: entry.client_name,
    project_id: entry.project_id,
    project_name: entry.project_name,
    details: `entry_id=${entryId};duration_seconds=${entry.duration_seconds};file=data/${fileName}`,
  });
  sendJson(response, 201, { entry_id: entryId, file: `data/${fileName}` });
}

async function handleClientProjectsSave(request, response) {
  const payload = await readJsonBody(request);
  const data = normalizeClientProjectData(payload.data);
  const actions = Array.isArray(payload.actions) ? payload.actions : [];

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CLIENT_PROJECT_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");

  if (actions.length === 0) {
    await appendAppLog({
      action: "client_project_file_saved",
      details: "No action details provided",
    });
  } else {
    for (const action of actions) {
      await appendAppLog(action);
    }
  }

  sendJson(response, 200, { data });
}

async function serveStaticFile(request, response) {
  const requestPath = new URL(request.url, `http://${HOST}:${PORT}`).pathname;
  const relativePath = requestPath === "/" ? "index.html" : requestPath.slice(1);
  const filePath = path.resolve(ROOT, relativePath);

  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const contents = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": contentTypes[extension] || "application/octet-stream",
    });
    response.end(contents);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    throw error;
  }
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > 100000) {
        request.destroy();
        reject(new Error("Request body is too large"));
      }
    });

    request.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function normalizeClientProjectData(data) {
  const clients = Array.isArray(data?.clients) ? data.clients : [];

  return {
    clients: clients.map((client) => ({
      id: String(client.id || "").trim(),
      name: String(client.name || "").trim(),
      billing_rate: String(client.billing_rate || "").trim(),
      billing_contact: normalizeBillingContact(client.billing_contact),
      projects: Array.isArray(client.projects)
        ? client.projects.map((project) => ({
            id: String(project.id || "").trim(),
            name: String(project.name || "").trim(),
            billing_rate: String(project.billing_rate || "").trim(),
            status: normalizeStatus(project.status),
          }))
        : [],
    })),
  };
}

function normalizeBillingContact(contact) {
  return {
    name: String(contact?.name || "").trim(),
    email: String(contact?.email || "").trim(),
    alternate_name: String(contact?.alternate_name || "").trim(),
    alternate_email: String(contact?.alternate_email || "").trim(),
    phone_number: String(contact?.phone_number || "").trim(),
    alternate_phone_number: String(contact?.alternate_phone_number || "").trim(),
    street_address_1: String(contact?.street_address_1 || "").trim(),
    street_address_2: String(contact?.street_address_2 || "").trim(),
    city: String(contact?.city || "").trim(),
    state: String(contact?.state || "").trim(),
    zip_code: String(contact?.zip_code || "").trim(),
  };
}

function normalizeStatus(status) {
  return ["Active", "Inactive", "Completed"].includes(status) ? status : "Active";
}

async function readExistingCsv(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

function buildCsvAppend(existingCsv, row) {
  const trimmedCsv = existingCsv.trimEnd();

  if (!trimmedCsv) {
    return `${CSV_HEADER}\n${row}\n`;
  }

  return `${existingCsv.endsWith("\n") ? "" : "\n"}${row}\n`;
}

async function appendAppLog(event) {
  const existingLog = await readExistingCsv(APP_LOG_FILE);
  const row = [
    new Date().toISOString(),
    event.username || "",
    event.action || "",
    event.client_id || "",
    event.client_name || "",
    event.project_id || "",
    event.project_name || "",
    event.details || "",
  ]
    .map(toCsvValue)
    .join(",");

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.appendFile(APP_LOG_FILE, buildAppLogAppend(existingLog, row), "utf8");
}

function buildAppLogAppend(existingLog, row) {
  if (!existingLog.trimEnd()) {
    return `${APP_LOG_HEADER}\n${row}\n`;
  }

  return `${existingLog.endsWith("\n") ? "" : "\n"}${row}\n`;
}

function getNextEntryId(existingCsv, date) {
  const datePrefix = formatDate(date);
  const lines = existingCsv.split(/\r?\n/).slice(1);
  const largestEntryNumber = lines.reduce((largest, line) => {
    const [entryId] = line.split(",");

    if (!entryId || !entryId.startsWith(`${datePrefix}-`)) {
      return largest;
    }

    const entryNumber = Number(entryId.slice(-3));
    return Number.isFinite(entryNumber) ? Math.max(largest, entryNumber) : largest;
  }, 0);

  return `${datePrefix}-${String(largestEntryNumber + 1).padStart(3, "0")}`;
}

function toCsvRow(entry) {
  return [
    entry.entry_id,
    entry.client_id,
    entry.client_name,
    entry.project_id,
    entry.project_name,
    entry.description,
    entry.start_time,
    entry.end_time,
    entry.duration_seconds,
    entry.duration_hours,
    entry.billable,
    entry.invoice_status,
  ]
    .map(toCsvValue)
    .join(",");
}

function toCsvValue(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function formatYearMonth(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatDate(date) {
  return `${formatYearMonth(date)}-${String(date.getDate()).padStart(2, "0")}`;
}
