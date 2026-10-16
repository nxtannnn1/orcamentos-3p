// Liveness never depends on PostgreSQL. Readiness verifies auth, TLS, role and schema.
const ready = process.argv.includes("--ready");
const token = process.env.API_PROBE_TOKEN;
if (ready && !token) process.exit(1);
try {
  const response = await fetch(`http://127.0.0.1:${process.env.PORT || 3001}/api/${ready ? "v1/ready" : "health"}`, {
    headers: ready ? { authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(4000),
    redirect: "error",
  });
  if (response.status !== 200) process.exit(1);
  const result = await response.json();
  if (result.status !== (ready ? "ready" : "alive")) process.exit(1);
} catch { process.exit(1); }
