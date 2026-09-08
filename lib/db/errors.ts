export const STORAGE_ERROR_MESSAGE =
  "Patient storage is unavailable. Check the Supabase connection and schema, then try again.";

export class StorageError extends Error {
  constructor() {
    super(STORAGE_ERROR_MESSAGE);
    this.name = "StorageError";
  }
}
