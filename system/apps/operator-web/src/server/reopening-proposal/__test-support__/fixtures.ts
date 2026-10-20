import type { ItemSnapshot, ServerSession, ResolvedPerson, ReopeningPolicy, ReopeningRequest } from "../contract";
export const now = Date.parse("2026-10-20T15:00:00.000Z");
export const tenant = "11111111-1111-4111-8111-111111111111";
export const session: ServerSession = { validated: true, authMode: "entra", expiresAt: now + 60000,
  tenantId: tenant, oid: "22222222-2222-4222-8222-222222222222", roles: ["ReabrirItens"] };
export const person: ResolvedPerson = { tenantId: tenant, oid: session.oid, personLookupId: "7", siteId: "synthetic-site" };
export const policy: ReopeningPolicy = { tenantId: tenant, allowedRoles: ["ReabrirItens"] };
export const adminSession: ServerSession = { ...session, oid: "77777777-7777-4777-8777-777777777777", roles: ["ReconciliarOperacoes"] };
export const adminPerson: ResolvedPerson = { ...person, oid: adminSession.oid, personLookupId: "8" };
export const adminPolicy: ReopeningPolicy = { tenantId: tenant, allowedRoles: ["ReconciliarOperacoes"] };
export const request: ReopeningRequest = { eventId: "33333333-3333-4333-8333-333333333333",
  reason: "Reabrir para conferir o documento de origem.", expectedEtag: '"v1"' };
export function snapshot(): ItemSnapshot {
  return {
    scope: { tenantId: tenant, siteId: person.siteId, listId: "synthetic-list", budgetId: "10", itemId: "1" },
    etag: '"v1"', status: "APROVADO", budgetStatus: "EM_REVISAO", sentToHistory: "NAO", approvedMaterialId: "22",
    values: { description: "Descrição integral sintética", quantity: "2", unit: "UN", unitPrice: "10", totalPrice: "20",
      supplier: "Fornecedor sintético", materialId: "22", observation: "Observação anterior integral" },
    decision: { id: "55555555-5555-4555-8555-555555555555", at: "2026-10-19T15:00:00.000Z",
      actor: { tenantId: tenant, oid: "66666666-6666-4666-8666-666666666666", personLookupId: "6" },
      status: "APROVADO", approvedMaterialId: "22", observation: "Justificativa anterior integral" },
    correction: null, reopeningId: null,
  };
}
