import { spawn } from "node:child_process";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3100"], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "development", OPERATOR_WEB_DEMO: "true", DATA_SOURCE: "mock",
    AUTH_DISABLED: "true", AUTH_APP_ORIGIN: "http://127.0.0.1:3100",
    ALLOW_LOCAL_SHAREPOINT_BYPASS: "false", ALLOW_LOCAL_OPERATOR_API_BYPASS: "false" },
});
child.on("exit", code => process.exit(code ?? 1));
