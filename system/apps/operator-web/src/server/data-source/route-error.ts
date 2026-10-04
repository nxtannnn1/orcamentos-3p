import { authErrorResponse } from "../auth/session";
import { DataSourceConfigurationError } from "./configuration";
import { DecisionError } from "../../domain/decision-error";

export function routeErrorResponse(error: unknown) {
  const authenticationError = authErrorResponse(error);
  if (authenticationError) return authenticationError;
  if (error instanceof DecisionError) {
    return Response.json(
      { error: error.code, message: error.message },
      {
        status: error.status,
        headers: {
          "Cache-Control": "no-store",
          ...(error.status === 429 ? { "Retry-After": "60" } : {}),
        },
      },
    );
  }
  if (error instanceof DataSourceConfigurationError) {
    return Response.json(
      { error: error.code, message: "Configuração da fonte de dados indisponível." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  console.error(
    "Falha no BFF do operator-web.",
    error instanceof Error
      ? {
          name: error.name,
        }
      : { error: "UnknownError" },
  );

  return Response.json(
    {
      error: "DATA_SOURCE_UNAVAILABLE",
      message: "A fonte de dados está temporariamente indisponível.",
    },
    { status: 502, headers: { "Cache-Control": "no-store" } },
  );
}
