// TEST ONLY: mounted into a disposable container; never copied by Dockerfile.
import https from "node:https";
import { readFileSync } from "node:fs";
import { createClient } from "/app/node_modules/redis/dist/index.js";
import { createHandler } from "/candidate/handler.mjs";
import { RELEASE_CORRECTION_LOCK } from "/candidate/commands.mjs";

const events = [];
const record = event => events.push({ sequence: events.length + 1, ...event });
const options = { url: "redis://redis:6379", disableOfflineQueue: true, commandsQueueMaxLength: 128, socket: { connectTimeout: 2000 } };
const client = createClient(options), admin = createClient(options);
for (const [name, connection] of [["client", client], ["admin", admin]]) {
  for (const event of ["error", "ready", "reconnecting", "end"]) connection.on(event, () => record({ layer: name, event }));
}
await Promise.all([client.connect(), admin.connect()]);
let fault = null, calls = 0, dropNextResponse = false;
const kind = args => args[0] === "EVAL" && args[1] === RELEASE_CORRECTION_LOCK ? "release" : args[0] === "SET" && args[1].endsWith(":pending") ? "acquire" : "other";
const instrumented = {
  get isReady() { return client.isReady; },
  async sendCommand(args) {
    const start = performance.now(), operation = kind(args);
    const active = fault && fault.target === operation ? fault : null;
    if (active) fault = null;
    calls++;
    try {
      if (active?.mode === "before") { client.destroy(); throw new Error("Injected connection loss"); }
      const result = await client.sendCommand(args);
      if (active?.mode === "after") { client.destroy(); throw new Error("Injected lost acknowledgement"); }
      record({ layer: "tcp", operation, outcome: "completed", elapsedMs: Math.round(performance.now() - start) });
      return result;
    } catch {
      record({ layer: "tcp", operation, outcome: active ? active.mode : "error", elapsedMs: Math.round(performance.now() - start) });
      throw new Error("Test transport unavailable");
    }
  },
};
const handler = createHandler(instrumented, process.env.FIXTURE_TOKEN, { onDiagnostic: event => record({ layer: "gateway", ...event }) });
const server = https.createServer({ cert: readFileSync("/fixture/cert.crt"), key: readFileSync("/fixture/cert.key") }, async (req, res) => {
  if (req.url !== "/__control") {
    if (dropNextResponse) {
      dropNextResponse = false;
      // Execute the real command, then close the HTTP socket before acknowledgement.
      res.end = () => { res.destroy(); return res; };
    }
    return handler(req, res);
  }
  if (req.headers.authorization !== `Bearer ${process.env.FIXTURE_TOKEN}`) { res.writeHead(401); return res.end(); }
  try {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const data = JSON.parse(Buffer.concat(chunks).toString());
    let result;
    if (data.action === "status") result = { ready: client.isReady, calls, events };
    else if (data.action === "fault") { fault = { target: data.target, mode: data.mode }; result = true; }
    else if (data.action === "resume") { if (!client.isOpen) await client.connect(); result = true; }
    else if (data.action === "drop-response") { dropNextResponse = true; result = true; }
    else if (data.action === "kill") { result = await admin.sendCommand(["CLIENT", "KILL", "TYPE", "normal", "SKIPME", "yes"]); }
    else if (data.action === "inspect") {
      if (!/^3p:[A-Za-z0-9:_-]+$/.test(data.key)) throw new Error();
      result = { value: await admin.get(data.key), ttl: await admin.ttl(data.key) };
    } else throw new Error();
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(result));
  } catch { res.writeHead(503); res.end('{"error":"Fixture control unavailable"}'); }
});
server.listen(8443, "0.0.0.0");
