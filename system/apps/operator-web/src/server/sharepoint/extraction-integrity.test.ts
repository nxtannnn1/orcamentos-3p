import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { extractionIssues } from "../../domain/approval-validation";
import { mapBudgetItem, mapReviewStatus } from "./sharepoint-mapper";
import type { SharePointFieldMap } from "./sharepoint-types";

const fields: SharePointFieldMap["items"] = {
  code: "Title", budgetLookupId: "Budget", itemNumber: "Number", description: "Description", quantity: "Quantity",
  unit: "Unit", unitPrice: "Price", totalPrice: "Total", status: "Status", suggestedMaterialLookupId: "Suggested",
  approvedMaterialLookupId: "Approved", observation: "Note", reviewedByOid: "Oid", approverName: "ApproverName", approverEmail: "ApproverEmail", reviewedByPerson: "Person", reviewedAt: "At", decisionId: "Decision",
};
const complete = { Number: 1, Description: "Synthetic", Fornecedor: "Synthetic supplier", Quantity: 2, Unit: "UN", Price: 10, Total: 20 };
const map = (patch: Record<string, unknown> = {}) => mapBudgetItem({ id: "1", fields: { ...complete, ...patch } }, fields, new Map());
describe("integridade da extração e autoria exibida", () => {
  it.each([null, undefined, "", " ", "2", "2,50", "invalid", Infinity, NaN])("nao fabrica quantidade a partir de %s", value => {
    const item = map({ Quantity: value });
    expect(item.quantity).toBeNull();
    expect(extractionIssues(item)).toContain("Quantidade ausente ou inválido");
  });
  it("preserva zero como valor real mas impede sua aprovação", () => {
    const item = map({ Price: 0 });
    expect(item.unitPrice).toBe(0);
    expect(extractionIssues(item)).toContain("Preço unitário ausente ou inválido");
  });
  it.each(["NAO_APROVADO", "DESAPROVADO", "APROVACAO_PENDENTE", "REJEITAR", "", undefined])("status %s nao e promovido a decisão", status => {
    expect(mapReviewStatus(status)).toBe("PENDENTE");
  });
  it("exige os campos do item, sem herdar fornecedor do orçamento", () => {
    expect(extractionIssues(map())).toEqual([]);
    expect(extractionIssues(map({ Fornecedor: null, Description: "", Unit: "" }))).toEqual(expect.arrayContaining(["Fornecedor do item ausente", "Descrição original ausente", "Unidade ausente"]));
  });
  it("so exibe auditoria explicitamente persistida, nunca Editor/Modified", () => {
    expect(map({ Editor: "service-account", Modified: "2026-10-01" }).lastDecision).toEqual({ id: null, at: null, actorOid: null, approverName: null, approverEmail: null, personLookupId: null });
    expect(map({ Decision: "synthetic-uuid", At: "2026-10-01T10:00:00Z", Oid: "synthetic-human", PersonLookupId: "7" }).lastDecision).toEqual({ id: "synthetic-uuid", at: "2026-10-01T10:00:00Z", actorOid: "synthetic-human", approverName: null, approverEmail: null, personLookupId: "7" });
    expect(map({ Decision: "synthetic-uuid", At: "2026-10-01T10:00:00Z", Oid: "synthetic-human", ApproverName: "Pessoa Sintética", ApproverEmail: "pessoa@example.com" }).lastDecision)
      .toEqual({ id: "synthetic-uuid", at: "2026-10-01T10:00:00Z", actorOid: "synthetic-human", approverName: "Pessoa Sintética", approverEmail: "pessoa@example.com", personLookupId: null });
  });
});
