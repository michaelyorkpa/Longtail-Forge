/** @typedef {import("../../src/types/task-block-recovery-contracts.d.ts").TaskLifecycleStatus} Status */
/** @typedef {import("../../src/types/task-block-recovery-contracts.d.ts").TaskBlockRecoveryRecord} ValidatedRecord */
/** @typedef {import("../../src/types/task-block-recovery-contracts.d.ts").RawTaskBlockRecoveryRecord} RawRecord */
/** @typedef {import("../../src/types/task-recurrence-contracts.d.ts").TaskRecord} TaskRecord */
/** @typedef {"open" | "in_progress" | "blocked" | "complete" | "archived"} Expected */

/** @type {Exclude<Status, Expected> extends never ? true : false} */
export const noExtraLifecycleStatus = true;
/** @type {Exclude<Expected, Status> extends never ? true : false} */
export const everyLifecycleStatus = true;
/** @type {Exclude<ValidatedRecord["status"], Expected | null | undefined> extends never ? true : false} */
export const validatedRecordIsClosed = true;
/** @type {string extends TaskRecord["status"] ? true : false} */
export const persistedStatusRemainsRaw = true;
/** @type {RawRecord} */
export const unvalidatedRecoveryInput = { status: "legacy-status" };
