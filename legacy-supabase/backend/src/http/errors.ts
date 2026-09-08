/**
 * Maps the plain `Error("SOME_CODE")` thrown by src/api/*.ts functions
 * to an HTTP status + machine-readable body. Centralized here so every
 * route handles errors the same way instead of re-guessing status codes.
 */

const ERROR_STATUS: Record<string, number> = {
  SESSION_NOT_FOUND: 404,
  SESSION_NOT_EDITABLE: 409,
  SYSTEM_SNAPSHOT_REQUIRED: 409,
  SYSTEM_SNAPSHOT_ALREADY_LOCKED: 409,
  ITEM_NOT_EDITABLE: 409,
  INVALID_PHYSICAL_QTY: 400,
  PHYSICAL_COUNT_INCOMPLETE: 409,
  UNAUTHENTICATED: 401,
  STORE_ACCESS_DENIED: 403,
  USER_NOT_PROVISIONED: 403,
  STORE_NOT_ASSIGNED: 403,
};

export function errorToHttp(error: unknown): { status: number; code: string; message: string } {
  const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  const status = ERROR_STATUS[code] ?? 500;
  const message =
    status === 500
      ? "Internal error"
      : code;
  return { status, code, message };
}
