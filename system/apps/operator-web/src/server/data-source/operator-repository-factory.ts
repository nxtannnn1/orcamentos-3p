import "server-only";
import { createMockOperatorRepository } from "../../mocks/mock-operator-repository";
import type { ReadOnlyOperatorRepository } from "../../repositories/operator-repository";
import { GraphClientCredentialsReadTransport } from "../sharepoint/graph-read-transport";
import { SharePointOperatorRepository } from "../sharepoint/sharepoint-operator-repository";
import { readSharePointServerConfig, resolveDataSource } from "./configuration";

let sharedSharePointRepository: ReadOnlyOperatorRepository | null = null;

export function createServerOperatorRepository(
  env: Record<string, string | undefined> = process.env,
): ReadOnlyOperatorRepository {
  const source = resolveDataSource(env.DATA_SOURCE);
  if (source === "mock") return createMockOperatorRepository();

  const config = readSharePointServerConfig(env);
  if (env === process.env && sharedSharePointRepository) return sharedSharePointRepository;
  const graph = new GraphClientCredentialsReadTransport(config.graph);
  const repository = new SharePointOperatorRepository(graph, config.repository);
  if (env === process.env) sharedSharePointRepository = repository;
  return repository;
}
