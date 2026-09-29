export class DecisionError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "INVALID_DECISION") {
    super(message);
    this.name = "DecisionError";
  }
}
