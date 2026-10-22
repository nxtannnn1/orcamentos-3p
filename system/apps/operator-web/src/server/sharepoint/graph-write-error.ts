import { DecisionError } from "../../domain/decision-error";

/** Evidence supplied only by the server transport, never by an API payload. */
export class GraphWriteError extends DecisionError {
  constructor(message: string, status: number, code: string,
    readonly disposition: "not_sent" | "rejected" | "unknown",
    readonly retryAfterSeconds?: number) {
    super(message, status, code);
    this.name = "GraphWriteError";
  }
}
export function writeDefinitelyNotApplied(error: unknown): boolean {
  if (error instanceof GraphWriteError) return error.disposition !== "unknown";
  // Preserve the existing adapter contract for explicit denials/conflicts.
  return error instanceof DecisionError && [403, 404, 409].includes(error.status);
}
