import { spawn } from "node:child_process";
import nextEnv from "@next/env";

// Explicit local launcher: no fixed datasource and no generated credentials.
process.env.NODE_ENV = "development";
nextEnv.loadEnvConfig(process.cwd(), true);
const source = process.env.DATA_SOURCE?.trim().toLowerCase();
if (!["mock", "sharepoint", "operator-api"].includes(source)) {
  throw new Error("Defina DATA_SOURCE explicitamente: mock, sharepoint ou operator-api.");
}
if (process.env.AUTH_DISABLED === "true" || process.env.ALLOW_LOCAL_OPERATOR_API_BYPASS === "true" ||
    process.env.ALLOW_LOCAL_SHAREPOINT_BYPASS === "true" || process.env.OPERATOR_WEB_DEMO === "true") {
  throw new Error("Homologação exige autenticação e bypasses desativados.");
}
if ((process.env.AUTH_SESSION_SECRET?.length ?? 0) < 32) {
  throw new Error("Segredo de sessão existente obrigatório; não será gerado automaticamente.");
}
// Activation requires a separate, completed security homologation.
if (process.env.AUTH_CORPORATE_LOGIN_ENABLED && process.env.AUTH_CORPORATE_LOGIN_ENABLED !== "false") {
  throw new Error("Modo corporativo pendente de homologação; mantenha AUTH_CORPORATE_LOGIN_ENABLED=false.");
}
const origin = "http://127.0.0.1:13300";
console.info("operator-web.local-start", { source, origin, corporateMode: false });
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "13300"], {
  stdio: "inherit", windowsHide: true,
  env: { ...process.env, AUTH_APP_ORIGIN: origin, AUTH_CORPORATE_LOGIN_ENABLED: "false" },
});
child.on("error", () => { console.error("Não foi possível iniciar o processo local."); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
