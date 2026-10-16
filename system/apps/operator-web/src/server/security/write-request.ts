import { DecisionError } from "../../domain/decision-error";

export function assertWriteOrigin(request: Request) {
  let origin = "";
  try { origin = new URL(process.env.AUTH_APP_ORIGIN ?? "").origin; } catch { /* fail closed */ }
  if (!origin || request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site")
    throw new DecisionError("Origem da solicitação não permitida.", 403);
}
export async function readWriteJson(request: Request, maxBytes = 16384): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    throw new DecisionError("Envie JSON.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new DecisionError("JSON ausente.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new DecisionError("Solicitação muito grande.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new DecisionError("JSON inválido."); }
}
