import { DecisionError } from "./decision-error";

/** Source states that accept a decision through the ordinary flow. Exact values of the Status_Revisao choice. */
export const DECIDABLE_STATES = ["PENDENTE", "EM_REVISAO", "CORRIGIR"] as const;
const FINAL_STATES = ["APROVADO", "REJEITADO"];

export type DecisionStatusBlock = "ITEM_ALREADY_DECIDED" | "ITEM_STATE_INVALID";

/** Status part of the rule, shared by the backend guard and the interface (display only). */
export function decisionStatusBlock(status: unknown): DecisionStatusBlock | null {
  if (typeof status === "string" && FINAL_STATES.includes(status)) return "ITEM_ALREADY_DECIDED";
  if (!DECIDABLE_STATES.includes(status as typeof DECIDABLE_STATES[number])) return "ITEM_STATE_INVALID";
  return null;
}

/** Backend rule for APPROVE/REJECT. A finalized item changes only through a separate, audited reopening
 * (not implemented). Price-history state must be exactly "NAO"; absent or unknown values block. */
export function assertDecidable(source: { status: unknown; sentToHistory: unknown }) {
  if (source.sentToHistory !== "NAO")
    throw new DecisionError("Item enviado ao histórico de preços ou com envio não verificável. Nova decisão exige reabertura auditável.", 409, "ITEM_SENT_TO_HISTORY");
  const block = decisionStatusBlock(source.status);
  if (block === "ITEM_ALREADY_DECIDED")
    throw new DecisionError("Item já decidido. Nova decisão exige reabertura auditável.", 409, "ITEM_ALREADY_DECIDED");
  if (block === "ITEM_STATE_INVALID")
    throw new DecisionError("Estado do item não permite decisão.", 409, "ITEM_STATE_INVALID");
}
