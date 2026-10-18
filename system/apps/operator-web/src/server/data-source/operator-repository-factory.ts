import "server-only";
import { createHash } from "node:crypto";
import { OperatorApiRepository, readOperatorApiConfig } from "../operator-api/operator-api-repository";
import { createMockOperatorRepository } from "../../mocks/mock-operator-repository";
import type { OperatorRepository } from "../../repositories/operator-repository";
import { GraphClientCredentialsReadTransport } from "../sharepoint/graph-read-transport";
import { SharePointOperatorRepository } from "../sharepoint/sharepoint-operator-repository";
import { readSharePointServerConfig, resolveDataSource } from "./configuration";

let sharedSharePointRepository: OperatorRepository | null = null;
let sharedSharePointConfigKey: string | null = null;
// Next dev bundles routes separately. Keep the existing ephemeral mock state
// in one process so a PATCH and a subsequent GET observe the same correction.
const local = globalThis as typeof globalThis & { __threepMockOperatorRepository?: OperatorRepository };
const sharedMockRepository = process.env.NODE_ENV === "development"
  ? (local.__threepMockOperatorRepository ??= createMockOperatorRepository()) : createMockOperatorRepository();

export function createServerOperatorRepository(
  env: Record<string, string | undefined> = process.env,
): OperatorRepository {
  const source = resolveDataSource(env.DATA_SOURCE);
  if (source === "mock") return sharedMockRepository;
  if (source === "operator-api") return new OperatorApiRepository(readOperatorApiConfig(env));

  const config = readSharePointServerConfig(env);
  const configKey = createHash("sha256").update(JSON.stringify(config)).digest("hex");
  if (env === process.env && sharedSharePointRepository && sharedSharePointConfigKey === configKey) return sharedSharePointRepository;
  const graph = new GraphClientCredentialsReadTransport(config.graph);
  const repository = new SharePointOperatorRepository(graph, config.repository);
  if (env === process.env) {
    sharedSharePointRepository = repository;
    sharedSharePointConfigKey = configKey;
  }
  return repository;
}
