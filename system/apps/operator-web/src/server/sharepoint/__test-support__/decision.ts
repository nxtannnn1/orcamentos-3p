import type { SharePointFieldMap } from "../sharepoint-types";
import type { SharePointPersonResolver } from "../person-resolver";

/** Synthetic identities and metadata. Never imported by production modules. */
export const syntheticPersonResolver: SharePointPersonResolver = {
  async findCandidates(actor, siteId) {
    return [{ ...actor, siteId, lookupId: "7" }];
  },
};

export function decisionColumns(fields: SharePointFieldMap, materialsListId: string) {
  return { value: [
    { name: fields.items.reviewedByOid, text: {} },
    // Shape observed by metadata-only GET on 2026-10-20; no user identifiers.
    { name: fields.items.reviewedByPerson, displayName: fields.items.reviewedByPerson,
      required: false, readOnly: false,
      personOrGroup: { allowMultipleSelection: false, displayAs: "nameWithPresence", chooseFromType: "peopleOnly" } },
    { name: fields.items.reviewedAt, dateTime: {} },
    { name: fields.items.decisionId, text: {} },
    { name: "Material_Aprovado", lookup: { listId: materialsListId, allowMultipleValues: false } },
    { name: "Status_Revisao", choice: { choices: ["APROVADO", "REJEITADO"] } },
    { name: "Observacao_Item", text: {} },
  ] };
}
