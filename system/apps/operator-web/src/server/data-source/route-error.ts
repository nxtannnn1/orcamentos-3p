import { DataSourceConfigurationError } from "./configuration";
import { DecisionError } from "../../domain/decision-error";

export function routeErrorResponse(error: unknown) {
  if (error instanceof DecisionError) {
    return Response.json({ error: error.code, message: error.message }, { status: error.status });
  }
  if (error instanceof DataSourceConfigurationError) {
    return Response.json(
      { error: error.code, message: error.message },
      { status: 503 },
    );
  }

  console.error(
    "Falha no BFF do operator-web.",
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : { error: "UnknownError" },
  );

  return Response.json(
    {
      error: "DATA_SOURCE_UNAVAILABLE",
      message: "A fonte de dados está temporariamente indisponível.",
    },
    { status: 502 },
  );
}
