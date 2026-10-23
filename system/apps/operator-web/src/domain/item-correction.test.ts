import { describe, expect, it } from "vitest";
import { changedFields, exactDecimal, parseCorrectionRecord, totalDifference, validateCorrectionInput } from "./item-correction";
const input = { operationId: "33333333-3333-4333-8333-333333333333", values: { description: "Sintético", quantity: "3", unit: "UN", unitPrice: "0.1", totalPrice: "0.3", supplier: "Fornecedor sintético", materialId: "22", observation: "" }, justification: "Correção justificada do OCR.", acknowledgeTotalDifference: false };
describe("registro de correção: aprovador em texto e compatibilidade com Pessoa", () => {
  const base = { ...input, schemaVersion: 1, itemId: "1", budgetId: "10", at: "2026-10-23T12:00:00.000Z",
    actor: { tenantId: "tenant", oid: "oid" }, previousVersion: '"v1"', previousOperationId: null,
    originalHash: "a".repeat(64), fingerprint: "b".repeat(64), changes: [{ field: "description", previous: "x", value: "Sintético", extracted: "x" }] };
  it("aceita registro novo com nome e e-mail e registro legado com lookup de Pessoa", () => {
    expect(parseCorrectionRecord(JSON.stringify({ ...base, approver: { name: "Pessoa", email: "pessoa@example.com" } }))?.approver?.email).toBe("pessoa@example.com");
    expect(parseCorrectionRecord(JSON.stringify({ ...base, personLookupId: "7" }))?.personLookupId).toBe("7");
  });
  it.each([{}, { approver: { name: "", email: "pessoa@example.com" } }, { approver: { name: "Pessoa", email: "sem-arroba" } }])(
    "bloqueia registro sem autoria verificável: %j", extra => {
      expect(() => parseCorrectionRecord(JSON.stringify({ ...base, ...extra }))).toThrow();
    });
});
describe("validação e precisão da correção", () => {
  it.each([null, undefined, "", " ", 0, 1.25, "1.000,00", "1e3", "-1", "NaN", "0.00001", "100000000000"])("recusa decimal ausente/ambíguo/fora da faixa: %s", value => {
    expect(() => exactDecimal(value)).toThrow();
  });
  it("usa aritmética exata para 0,1 × 3 e quatro casas", () => {
    expect(totalDifference(input.values)).toBeNull();
    expect(totalDifference({ quantity: "1.0001", unitPrice: "0.0001", totalPrice: "0.0001" })).toBe("0.00010001");
    expect(exactDecimal("10,2500")).toBe("10.25");
    expect(exactDecimal("99999999999.9999")).toBe("99999999999.9999");
  });
  it("não recalcula total comercial; exige reconhecimento e justificativa", () => {
    expect(() => validateCorrectionInput({ ...input, values: { ...input.values, totalPrice: "0.29" } })).toThrow(/difere/);
    expect(validateCorrectionInput({ ...input, values: { ...input.values, totalPrice: "0.29" }, acknowledgeTotalDifference: true }).values.totalPrice).toBe("0.29");
    expect(() => validateCorrectionInput({ ...input, justification: "" })).toThrow(/justificativa/);
  });
  it("aceita preços zero sem transformá-los em valores positivos, quantidade deve ser positiva", () => {
    expect(validateCorrectionInput({ ...input, values: { ...input.values, unitPrice: "0", totalPrice: "0" } }).values.unitPrice).toBe("0");
    expect(() => validateCorrectionInput({ ...input, values: { ...input.values, quantity: "0" } })).toThrow(/positiva/);
  });
  it.each(["description", "supplier", "unit"])("recusa campo obrigatório vazio: %s", field => {
    expect(() => validateCorrectionInput({ ...input, values: { ...input.values, [field]: " " } })).toThrow();
  });
  it("recusa autoria, campos desconhecidos e unidades inválidas", () => {
    expect(() => validateCorrectionInput({ ...input, actor: { oid: "forged" } })).toThrow();
    expect(() => validateCorrectionInput({ ...input, values: { ...input.values, unit: "<script>" } })).toThrow();
    expect(() => validateCorrectionInput({ ...input, values: { ...input.values, unitPrice: null } })).toThrow();
  });
  it("mantém cada campo, valor anterior, novo e original em alterações sucessivas", () => {
    const next = validateCorrectionInput(input).values;
    const previous = { ...next, description: "Primeira correção", observation: "Revisar" };
    const original = { ...previous, description: "Texto IA" };
    expect(changedFields(previous, next, original)).toEqual([
      { field: "description", previous: "Primeira correção", value: "Sintético", extracted: "Texto IA" },
      { field: "observation", previous: "Revisar", value: "", extracted: "Revisar" },
    ]);
  });
});
