import { randomBytes, createHash } from "node:crypto";
const token = randomBytes(32).toString("base64url");
console.log("Token (copiar somente para o consumidor/gerenciador de segredos):");
console.log(token);
console.log("SHA256 (copiar para API_CLIENTS_JSON na API):");
console.log(createHash("sha256").update(token).digest("hex"));
