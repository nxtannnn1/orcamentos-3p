import type { CorrectionRecord, ExtractionEvidence } from "../domain/item-correction";
export type ReviewStatus = "PENDENTE" | "APROVADO" | "REJEITADO";
export interface OfficialMaterial {
  id: string;
  code: string;
  name: string;
  family: string;
  unit: string;
}
export interface BudgetItem {
  reviewAvailable?: boolean;
  id: string;
  budgetId: string;
  itemNumber: number | null;
  supplier?: string | null;
  originalDescription: string;
  quantity: number | null;
  unit: string;
  unitPrice: number | null;
  totalPrice: number | null;
  suggestedMaterial: OfficialMaterial | null;
  approvedMaterial: OfficialMaterial | null;
  observation: string;
  reviewStatus: ReviewStatus;
  version?: string;
  sourceStatus?: string;
  correction?: CorrectionRecord | null;
  extractionEvidence?: Pick<ExtractionEvidence, "hash" | "capturedAt"> & { values: ExtractionEvidence["snapshot"]["values"] } | null;
  correctionWriteEnabled?: boolean;
  documentEvidence?: { available: false; reason: "FILE_REFERENCE_WITHOUT_AUTHORIZED_PREVIEW" | "NO_REFERENCE" };
  lastDecision?: {
    id: string | null;
    at: string | null;
    actorOid: string | null;
    personLookupId: string | null;
  };
}
export interface Budget {
  readOnly?: boolean;
  reviewAvailable?: boolean;
  id: string;
  code: string;
  number: string;
  supplier: string | null;
  date: string;
  status: "EM_REVISAO" | "CONCLUIDO";
  itemCount: number;
  reviewedCount: number;
}
export type ItemDecision =
  | { action: "APPROVE"; approvedMaterial: OfficialMaterial; observation: string }
  | { action: "REJECT"; approvedMaterial: null; observation: string };
export type DecisionContext = { version?: string; actor?: { oid: string; tenantId: string } };
