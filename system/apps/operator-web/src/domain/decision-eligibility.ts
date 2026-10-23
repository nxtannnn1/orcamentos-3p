import { DecisionError } from "./decision-error";

/** Source states that accept a decision or correction through the ordinary flow (canonical Status_Revisao values). */
export const DECIDABLE_STATES = ["PENDENTE", "EM_REVISAO", "CORRIGIR"] as const;
const FINAL_STATES = ["APROVADO", "REJEITADO"];

/** Canonical form for comparison only ("Pendente", " em revisão " → "PENDENTE", "EM_REVISAO").
 * The SharePoint value is never rewritten; non-text or empty values stay unknown (null) and block. */
export function normalizeReviewState(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  return normalized || null;
}

/** Open for review: shared by item and budget guards of decisions and corrections. */
export const isOpenReviewState = (value: unknown) =>
  DECIDABLE_STATES.includes(normalizeReviewState(value) as typeof DECIDABLE_STATES[number]);

export type DecisionStatusBlock = "ITEM_ALREADY_DECIDED" | "ITEM_STATE_INVALID";

/** Status part of the rule, shared by the backend guard and the interface (display only). */
export function decisionStatusBlock(status: unknown): DecisionStatusBlock | null {
  if (FINAL_STATES.includes(normalizeReviewState(status) ?? "")) return "ITEM_ALREADY_DECIDED";
  if (!isOpenReviewState(status)) return "ITEM_STATE_INVALID";
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
