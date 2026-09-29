import type { GraphCollection, GraphReadTransport } from "./sharepoint-types";

export interface SharePointColumnDefinition {
  id: string;
  name: string;
  displayName: string;
  hidden?: boolean;
  readOnly?: boolean;
}

export function createColumnsDiscoveryPath(siteId: string, listId: string) {
  return `/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(listId)}/columns`;
}

export async function listSharePointColumns(
  graph: GraphReadTransport,
  siteId: string,
  listId: string,
): Promise<SharePointColumnDefinition[]> {
  const response = await graph.get<GraphCollection<SharePointColumnDefinition>>(
    createColumnsDiscoveryPath(siteId, listId),
  );
  return response.value;
}
