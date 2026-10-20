import http from "node:http";
import { createClient } from "redis";
import { createHandler } from "./handler.mjs";

const token = process.env.GATEWAY_BEARER_TOKEN;
if (!token || token.length < 32) throw new Error("Gateway token not configured");
const client = createClient({
  url: "redis://redis:6379",
  disableOfflineQueue: true,
  commandsQueueMaxLength: 128,
  socket: { connectTimeout: 2000 },
});
client.on("error", () => {});
// Serve 503 while connecting/recovering, with no offline command replay.
void client.connect().catch(() => {});
const server = http.createServer(createHandler(client, token));
server.requestTimeout = 5000;
server.headersTimeout = 5000;
server.timeout = 5000;
server.listen(8080, "0.0.0.0");
