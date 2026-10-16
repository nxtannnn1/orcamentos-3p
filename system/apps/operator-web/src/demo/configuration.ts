export function isDemoEnabled(env: Record<string, string | undefined> = process.env) {
  return env.NODE_ENV === "development" && env.OPERATOR_WEB_DEMO === "true" && env.DATA_SOURCE === "mock";
}
