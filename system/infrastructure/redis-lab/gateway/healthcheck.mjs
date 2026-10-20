import http from "node:http";
const req = http.request({ host: "127.0.0.1", port: 8080, method: "POST", path: "/",
  headers: { Authorization: `Bearer ${process.env.GATEWAY_BEARER_TOKEN}`, "Content-Type": "application/json" },
}, res => {
  let body = "";
  res.on("data", chunk => { body += chunk; });
  res.on("end", () => {
    try { const payload = JSON.parse(body); process.exit(res.statusCode === 200 && "result" in payload && !payload.error ? 0 : 1); }
    catch { process.exit(1); }
  });
});
req.setTimeout(2000, () => req.destroy());
req.on("error", () => process.exit(1));
req.end(JSON.stringify(["GET", "3p:health:probe"]));
