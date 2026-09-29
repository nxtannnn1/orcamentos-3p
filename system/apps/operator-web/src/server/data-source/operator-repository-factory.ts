import "server-only";
import { createMockOperatorRepository } from "../../mocks/mock-operator-repository";
import type { OperatorRepository } from "../../repositories/operator-repository";
import { GraphClientCredentialsReadTransport } from "../sharepoint/graph-read-transport";
import { SharePointOperatorRepository } from "../sharepoint/sharepoint-operator-repository";
import { readSharePointServerConfig, resolveDataSource } from "./configuration";

let sharedSharePointRepository: OperatorRepository | null = null;
const sharedMockRepository = createMockOperatorRepository();

export function createServerOperatorRepository(
  env: Record<string, string | undefined> = process.env,
): OperatorRepository {
  const source = resolveDataSource(env.DATA_SOURCE);
  if (source === "mock") return sharedMockRepository;

  const config = readSharePointServerConfig(env);
  if (env === process.env && sharedSharePointRepository) return sharedSharePointRepository;
  const graph = new GraphClientCredentialsReadTransport(config.graph);
  const repository = new SharePointOperatorRepository(graph, config.repository);
  if (env === process.env) sharedSharePointRepository = repository;
  return repository;
}
