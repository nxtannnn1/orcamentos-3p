import { DataSourceConfigurationError } from "./configuration";

export function routeErrorResponse(error: unknown) {
  if (error instanceof DataSourceConfigurationError) {
    return Response.json({ error: error.code, message: error.message }, { status: 503 });
  }
  console.error("Falha no BFF do operator-web.", error instanceof Error ? error.name : "UnknownError");
  return Response.json(
    { error: "DATA_SOURCE_UNAVAILABLE", message: "A fonte de dados está temporariamente indisponível." },
    { status: 502 },
  );
}
