// Static asset checks serving without invoking identity providers or bypassing auth.
try {
  const response = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/favicon.ico`, {
    signal: AbortSignal.timeout(4000), redirect: "error",
  });
  if (response.status !== 200) process.exit(1);
} catch { process.exit(1); }
