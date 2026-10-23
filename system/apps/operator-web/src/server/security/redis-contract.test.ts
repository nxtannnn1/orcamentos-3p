import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
vi.mock("server-only", () => ({}));
import { securityCommand } from "./store";
import { RELEASE_CORRECTION_LOCK } from "./scripts";
import { correctionFixture, correctionInput, actorM } from "../sharepoint/__test-support__/correction";
import { ItemCorrectionService } from "../sharepoint/item-correction-service";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("memory CAS preserves a different owner, releases once and permits reacquisition", async () => {
  const key = `3p:correction:${"a".repeat(64)}:item:${Date.now()}:pending`;
  const owner = randomUUID();
  await securityCommand(["SET", key, owner, "NX"]);
  expect(await securityCommand(["EVAL", RELEASE_CORRECTION_LOCK, 1, key, randomUUID()])).toBe(0);
  expect(await securityCommand(["GET", key])).toBe(owner);
  expect(await securityCommand(["EVAL", RELEASE_CORRECTION_LOCK, 1, key, owner])).toBe(1);
  expect(await securityCommand(["EVAL", RELEASE_CORRECTION_LOCK, 1, key, owner])).toBe(0);
  expect(await securityCommand(["SET", key, randomUUID(), "NX"])).toBe("OK");
});
it("correction save and reconciliation use the actual store with Graph simulated", async () => {
  const f = correctionFixture();
  // Unique fake site isolates this test's security store namespace.
  const config = { ...f.config, siteId: randomUUID() };
  const service = new ItemCorrectionService(f.graph, config, securityCommand);
  const input = { ...correctionInput, operationId: randomUUID() };
  const context = { actor: actorM, version: '"v1"' };
  const result = await service.save("1", input, context);
  expect(result.status).toBe("confirmed");
  expect((await service.save("1", input, context)).status).toBe("confirmed");
  expect(f.patch).toHaveBeenCalledTimes(1);
});
it("REST timeout fails closed and never retries a mutation", async () => {
  vi.stubEnv("SECURITY_REDIS_REST_URL", "https://redis.example");
  vi.stubEnv("SECURITY_REDIS_REST_TOKEN", "fictitious-token");
  const fetcher = vi.fn(async () => { throw new DOMException("Timed out", "TimeoutError"); });
  vi.stubGlobal("fetch", fetcher);
  await expect(securityCommand(["SET", "3p:test:uncertain", "{}", "NX"])).rejects.toMatchObject({ code: "SECURITY_STORE_UNAVAILABLE" });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]).toBeDefined();
});
it("malformed CAS acknowledgement leaves correction unconfirmed", async () => {
  const f = correctionFixture();
  const broken = async (args: (string | number)[]) => args[0] === "EVAL" ? null : f.command(args);
  const service = new ItemCorrectionService(f.graph, f.config, broken);
  await expect(service.save("1", correctionInput, { actor: actorM, version: '"v1"' })).rejects.toMatchObject({ code: "CORRECTION_UNCONFIRMED" });
  expect(f.patch).toHaveBeenCalledTimes(1);
});
