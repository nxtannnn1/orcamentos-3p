import { describe, expect, it } from "vitest";
import { createColumnsDiscoveryPath, listSharePointColumns } from "./discover-columns";
import type { GraphReadTransport } from "./sharepoint-types";

describe("descoberta futura de colunas", () => {
  it("prepara somente o endpoint GET de colunas", async () => {
    const calls: string[] = [];
    const graph: GraphReadTransport = {
      async get<T>(path: string): Promise<T> {
        calls.push(path);
        return { value: [{ id: "column-1", name: "InternalName", displayName: "Nome visível" }] } as T;
      },
    };
    const columns = await listSharePointColumns(graph, "site-placeholder", "list-placeholder");
    expect(calls).toEqual([createColumnsDiscoveryPath("site-placeholder", "list-placeholder")]);
    expect(columns[0].name).toBe("InternalName");
  });
});
