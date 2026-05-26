import { randomUUID } from "node:crypto";
import { timeEntriesRepository } from "../repositories/time-entries.repo.js";
import { appendAppLog } from "../utils/app-log.js";
import { AppError } from "../utils/app-error.js";
import { normalizeTimeEntry } from "../utils/normalizers.js";

async function create(entry, session) {
  const entryId = randomUUID();
  const data = normalizeTimeEntry({
    entry_id: entryId,
    organization_id: session.organization_id,
    user_id: session.user_id,
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

  await timeEntriesRepository.create(data);
  await appendAppLog({
    action: "time_entry_created",
    client_id: entry.client_id,
    client_name: entry.client_name,
    project_id: entry.project_id,
    project_name: entry.project_name,
    details: `entry_id=${entryId};duration_seconds=${entry.duration_seconds};storage=database`,
  });

  return { entry_id: entryId, storage: "database" };
}

async function update(payload, entryId, session) {
  const decodedEntryId = decodeURIComponent(entryId || "");
  const previousEntry = await timeEntriesRepository.readById(session.organization_id, decodedEntryId);

  if (!decodedEntryId || !previousEntry) {
    throw new AppError("Time entry not found", 404);
  }

  const updatedEntry = normalizeTimeEntry({
    ...payload,
    entry_id: decodedEntryId,
    organization_id: session.organization_id,
    user_id: payload.user_id || previousEntry.user_id,
  });

  await timeEntriesRepository.update(updatedEntry);
  await appendAppLog({
    action: "time_entry_updated",
    client_id: updatedEntry.client_id,
    client_name: updatedEntry.client_name,
    project_id: updatedEntry.project_id,
    project_name: updatedEntry.project_name,
    details: `entry_id=${decodedEntryId};old_client_id=${previousEntry.client_id};old_project_id=${previousEntry.project_id};old_duration_seconds=${previousEntry.duration_seconds};new_duration_seconds=${updatedEntry.duration_seconds}`,
  });

  return { entry: updatedEntry, storage: "database" };
}

async function list(session) {
  const entries = await timeEntriesRepository.readAll(session.organization_id);
  return { entries };
}

export const timeEntriesService = {
  create,
  list,
  update,
};
