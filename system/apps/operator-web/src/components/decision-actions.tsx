import { decisionStatusBlock, type DecisionStatusBlock } from "../domain/decision-eligibility";
import type { BudgetItem } from "../types/operator";

export type DecisionBlock = DecisionStatusBlock | "ITEM_SENT_TO_HISTORY";

/** Display-only eligibility, same order as the server (assertDecidable), which remains the authority.
 * Price-history state must be exactly "NAO"; absent, null or any other value blocks (never presumed). */
export function itemDecisionBlock(item: Pick<BudgetItem, "reviewAvailable" | "sourceStatus" | "reviewStatus" | "sentToHistory">): DecisionBlock | null {
  if (item.reviewAvailable === false) return null; // read-only sources are locked and explained elsewhere
  if (item.sentToHistory !== "NAO") return "ITEM_SENT_TO_HISTORY";
  return decisionStatusBlock(item.sourceStatus ?? item.reviewStatus);
}

export const decisionBlockMessages: Record<DecisionBlock, string> = {
  ITEM_SENT_TO_HISTORY: "Item enviado ao histórico de preços ou com envio não verificável: aprovação e rejeição indisponíveis. A reabertura exige operação auditável e ainda não está disponível.",
  ITEM_ALREADY_DECIDED: "Item já aprovado ou rejeitado: aprovação e rejeição indisponíveis. A reabertura exige operação auditável com preservação integral do histórico e ainda não está disponível.",
  ITEM_STATE_INVALID: "Estado do item não verificável: aprovação e rejeição indisponíveis. Releia os dados ou acione o responsável pela lista.",
};

export function DecisionBlockNotice({ block }: { block: DecisionBlock | null }) {
  return block ? <p className="feedback" role="note" data-decision-block={block}>{decisionBlockMessages[block]}</p> : null;
}

type ButtonsProps = {
  block: DecisionBlock | null;
  locked: boolean;
  rejectionIssue: string | null;
  hasChosenMaterial: boolean;
  extractionIssueCount: number;
  saving: boolean;
  onReject: () => void;
  onApprove: () => void;
};

export function DecisionButtons({ block, locked, rejectionIssue, hasChosenMaterial, extractionIssueCount, saving, onReject, onApprove }: ButtonsProps) {
  const blocked = locked || block !== null;
  return <div>
    <button className="reject" disabled={blocked || !!rejectionIssue} onClick={onReject}>Rejeitar</button>
    <button className="approve" disabled={blocked || !hasChosenMaterial || !!extractionIssueCount} onClick={onApprove}>{saving ? "Salvando..." : "Conferir aprovação →"}</button>
  </div>;
}
