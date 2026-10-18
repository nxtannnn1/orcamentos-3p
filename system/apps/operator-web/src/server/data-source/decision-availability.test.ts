import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { SessionUser } from "../auth/configuration";
import { resolveDecisionAvailability } from "./decision-availability";

const user = (
  role: "Consulta" | "Operador" | "Comprador",
  authMode: "entra" | "keycloak" = "entra",
): SessionUser => ({
  oid: "11111111-1111-1111-1111-111111111111",
  tenantId: "22222222-2222-2222-2222-222222222222",
  name: "Funcionário fictício",
  roles: [role],
  authMode,
  mfaContext: null,
});

const ready = {
  DATA_SOURCE: "sharepoint",
  SHAREPOINT_HUMAN_CORRECTIONS_ENABLED: "true",
  SHAREPOINT_PERSON_RESOLVER: "graph-list-permissions",
  SECURITY_REDIS_REST_URL: "https://redis.example",
  SECURITY_REDIS_REST_TOKEN: "synthetic-test-token",
};

describe("disponibilidade de decisões na interface", () => {
  it("bloqueia perfil Consulta", () => {
    const result = resolveDecisionAvailability(user("Consulta"), ready);
    expect(result.canWrite).toBe(false);
    expect(result.writeUnavailableReason).toMatch(/perfil/i);
  });

  it.each(["Operador", "Comprador"] as const)(
    "permite elegibilidade de interface para %s com configuração presente",
    role => {
      const result = resolveDecisionAvailability(user(role), ready);
      expect(result).toEqual({
        canWrite: true,
        writeUnavailableReason: null,
      });
    },
  );

  it("bloqueia SharePoint sem Redis", () => {
    const result = resolveDecisionAvailability(user("Operador"), {
      ...ready,
      SECURITY_REDIS_REST_URL: "",
      SECURITY_REDIS_REST_TOKEN: "",
    });
    expect(result.canWrite).toBe(false);
    expect(result.writeUnavailableReason).toMatch(/ambiente/i);
  });

  it("bloqueia resolvedor desabilitado", () => {
    const result = resolveDecisionAvailability(user("Operador"), {
      ...ready,
      SHAREPOINT_PERSON_RESOLVER: "disabled",
    });
    expect(result.canWrite).toBe(false);
  });

  it("bloqueia correções humanas desabilitadas", () => {
    const result = resolveDecisionAvailability(user("Operador"), {
      ...ready,
      SHAREPOINT_HUMAN_CORRECTIONS_ENABLED: "false",
    });
    expect(result.canWrite).toBe(false);
  });

  it("bloqueia escrita Keycloak em SharePoint", () => {
    const result = resolveDecisionAvailability(
      user("Operador", "keycloak"),
      ready,
    );
    expect(result.canWrite).toBe(false);
  });

  it("mantém decisões disponíveis no mock para Operador", () => {
    const result = resolveDecisionAvailability(user("Operador"), {
      DATA_SOURCE: "mock",
    });
    expect(result.canWrite).toBe(true);
  });

  it("bloqueia decisões no operator-api", () => {
    const result = resolveDecisionAvailability(user("Operador"), {
      DATA_SOURCE: "operator-api",
    });
    expect(result.canWrite).toBe(false);
  });
});
