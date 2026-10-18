import { spawnSync } from "node:child_process";

const containers = [
  "sistema-3p-keycloak-poc-postgres-1",
  "sistema-3p-keycloak-poc-keycloak-1",
];

const result = spawnSync("docker", ["start", ...containers], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  console.error("Falha ao iniciar as dependências locais.");
  process.exit(1);
}

console.log("Dependências iniciadas. Iniciando homologação...");
await import("./start-homologation.mjs");