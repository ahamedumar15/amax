/** 106: one field's check on a form card; `transient` means the check itself couldn't run, shown but never blocking. */
export type FieldCheck = { field?: string; message?: string; transient?: boolean };

export const CHECK_FAILED: FieldCheck = { message: "Couldn't check that just now.", transient: true };
