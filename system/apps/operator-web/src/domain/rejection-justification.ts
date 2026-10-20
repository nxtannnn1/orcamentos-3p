import { DecisionError } from "./decision-error";

export const REJECTION_JUSTIFICATION_MIN = 10;
export const REJECTION_JUSTIFICATION_MAX = 2000;
export const REJECTION_JUSTIFICATION_MESSAGE = "Informe uma justificativa de rejeição entre 10 e 2.000 caracteres, sem contar espaços nas extremidades.";

/** Shared by the editor, controller, BFF route and persistence adapters. */
export function rejectionJustificationIssue(value: unknown): string | null {
  if (typeof value !== "string" || value.length > REJECTION_JUSTIFICATION_MAX ||
      value.trim().length < REJECTION_JUSTIFICATION_MIN ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return REJECTION_JUSTIFICATION_MESSAGE;
  return null;
}

export function validateRejectionJustification(value: unknown): string {
  const issue = rejectionJustificationIssue(value);
  if (issue) throw new DecisionError(issue, 400, "INVALID_REJECTION_JUSTIFICATION");
  return (value as string).trim();
}
