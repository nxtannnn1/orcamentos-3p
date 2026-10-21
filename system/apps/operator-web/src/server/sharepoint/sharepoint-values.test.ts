import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { decisionTimestamp, issueColumnProof, sameUtcInstant, verifiedLookupField, verifiedTextField, type VerifiedColumns } from "./sharepoint-values";

const proof = issueColumnProof(["Material_Aprovado", "Observacao_Item"]);

describe("normalização de valores SharePoint — somente com prova de esquema", () => {
  it("lookup ausente equivale a vazio apenas para coluna verificada", () => {
    expect(verifiedLookupField({}, "Material_Aprovado", proof)).toBeNull();
    expect(verifiedLookupField({ Material_AprovadoLookupId: null }, "Material_Aprovado", proof)).toBeNull();
    expect(verifiedLookupField({ Material_AprovadoLookupId: "22" }, "Material_Aprovado", proof)).toBe("22");
    expect(verifiedLookupField({ Material_AprovadoLookupId: 0 }, "Material_Aprovado", proof)).toBe(0);
  });
  it("não aceita o nome da coluna como substituto do LookupId", () => {
    expect(verifiedLookupField({ Material_Aprovado: "22" }, "Material_Aprovado", proof)).toBeNull();
  });
  it("texto ausente ou null equivale a vazio; outros valores intactos", () => {
    expect(verifiedTextField({}, "Observacao_Item", proof)).toBe("");
    expect(verifiedTextField({ Observacao_Item: null }, "Observacao_Item", proof)).toBe("");
    expect(verifiedTextField({ Observacao_Item: " x " }, "Observacao_Item", proof)).toBe(" x ");
    expect(verifiedTextField({ Observacao_Item: 0 }, "Observacao_Item", proof)).toBe(0);
  });
  it("recusa coluna fora da prova e prova não emitida pelo validador", () => {
    expect(() => verifiedLookupField({}, "Outro", proof)).toThrow(expect.objectContaining({ code: "SCHEMA_PROOF_REQUIRED" }));
    const forged = Object.freeze({ names: new Set(["Material_Aprovado"]) }) as VerifiedColumns;
    expect(() => verifiedLookupField({}, "Material_Aprovado", forged)).toThrow(expect.objectContaining({ code: "SCHEMA_PROOF_REQUIRED" }));
    expect(() => verifiedTextField({}, "Observacao_Item", forged)).toThrow(expect.objectContaining({ code: "SCHEMA_PROOF_REQUIRED" }));
  });
});

describe("instante de decisão", () => {
  it("gera ISO canônico em segundos inteiros", () => {
    expect(decisionTimestamp(Date.UTC(2026, 9, 21, 12, 34, 56, 789))).toBe("2026-10-21T12:34:56.000Z");
  });
  it("compara o mesmo instante com e sem milissegundos zerados", () => {
    expect(sameUtcInstant("2026-10-21T12:34:56Z", "2026-10-21T12:34:56.000Z")).toBe(true);
    expect(sameUtcInstant("2026-10-21T12:34:56.000Z", "2026-10-21T12:34:56.000Z")).toBe(true);
  });
  it.each([
    ["segundo diferente", "2026-10-21T12:34:57Z"],
    ["fração diferente", "2026-10-21T12:34:56.500Z"],
    ["fuso não UTC", "2026-10-21T09:34:56-03:00"],
    ["sem fuso", "2026-10-21T12:34:56"],
    ["data apenas", "2026-10-21"],
    ["texto inválido", "invalid"],
    ["não texto", 1792413296000],
    ["ausente", undefined],
  ])("não confirma %s", (_label, read) => {
    expect(sameUtcInstant(read, "2026-10-21T12:34:56.000Z")).toBe(false);
  });
  it("não confirma quando o valor escrito é inválido", () => {
    expect(sameUtcInstant("2026-13-45T99:99:99Z", "2026-13-45T99:99:99Z")).toBe(false);
  });
});
