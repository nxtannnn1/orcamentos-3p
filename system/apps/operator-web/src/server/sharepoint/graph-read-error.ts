import "server-only";

/** Safe metadata only. Never attach a URL, response body or underlying error. */
export class GraphReadError extends Error {
  constructor(
    readonly operation: "oauth" | "get",
    readonly kind: "HTTP" | "NETWORK" | "INVALID_RESPONSE" | "INVALID_TARGET",
    readonly httpStatus: number | null = null,
    message = "Não foi possível consultar Microsoft Graph.",
  ) {
    super(message);
    this.name = "GraphReadError";
  }
}
