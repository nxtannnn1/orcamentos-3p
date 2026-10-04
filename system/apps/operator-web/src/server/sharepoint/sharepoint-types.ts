export interface GraphListItem {
  id: string;
  eTag?: string;
  "@odata.etag"?: string;
  fields: Record<string, unknown>;
}

export interface GraphCollection<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

export interface GraphReadTransport {
  get<T>(path: string): Promise<T>;
}

export interface GraphWriteTransport extends GraphReadTransport {
  patch<T>(path: string, fields: Record<string, unknown>, etag: string): Promise<T>;
}

export interface SharePointFieldMap {
  budgets: {
    code: string;
    number: string;
    supplier: string;
    date: string;
    status: string;
  };
  items: {
    code: string;
    budgetLookupId: string;
    itemNumber: string;
    description: string;
    quantity: string;
    unit: string;
    unitPrice: string;
    totalPrice: string;
    status: string;
    suggestedMaterialLookupId: string;
    approvedMaterialLookupId: string;
    observation: string;
    reviewedByOid?: string;
    reviewedAt?: string;
    decisionId?: string;
  };
  materials: {
    code: string;
    name: string;
    family?: string;
    unit?: string;
    status?: string;
  };
}

export interface SharePointRepositoryConfig {
  siteId: string;
  budgetsListId: string;
  itemsListId: string;
  materialsListId: string;
  fields: SharePointFieldMap;
}
