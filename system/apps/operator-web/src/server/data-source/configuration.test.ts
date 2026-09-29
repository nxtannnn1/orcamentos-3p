import { afterEach, describe, expect, it, vi } from "vitest";
import { DataSourceConfigurationError, readSharePointServerConfig, resolveDataSource } from "./configuration";

describe("seleção server-side da fonte de dados", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("usa mock como padrão", () => {
    vi.stubEnv("DATA_SOURCE", "");
    expect(resolveDataSource()).toBe("mock");
  });

  it("aceita DATA_SOURCE=mock", () => {
    expect(resolveDataSource("mock")).toBe("mock");
  });

  it("falha com mensagem segura quando SharePoint não está configurado", () => {
    expect(() => readSharePointServerConfig({ DATA_SOURCE: "sharepoint" }))
      .toThrowError(DataSourceConfigurationError);
    expect(() => readSharePointServerConfig({ DATA_SOURCE: "sharepoint" }))
      .toThrow("MICROSOFT_TENANT_ID");
  });
});
