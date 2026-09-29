import "server-only";
import type { GraphServerConfig } from "../data-source/configuration";
import type { GraphReadTransport } from "./sharepoint-types";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

export class GraphClientCredentialsReadTransport implements GraphReadTransport {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;
  private tokenRequest: Promise<string> | null = null;

  constructor(
    private readonly config: GraphServerConfig,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.now() < this.accessTokenExpiresAt) return this.accessToken;
    if (this.tokenRequest) return this.tokenRequest;
    this.tokenRequest = this.requestAccessToken();
    try {
      return await this.tokenRequest;
    } finally {
      this.tokenRequest = null;
    }
  }

  private async requestAccessToken(): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    });
    const response = await this.fetcher(
      `https://login.microsoftonline.com/${encodeURIComponent(this.config.tenantId)}/oauth2/v2.0/token`,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" },
    );
    if (!response.ok) throw new Error("Falha na autenticação server-side com Microsoft Graph.");
    const payload = await response.json() as { access_token?: string; expires_in?: number };
    if (!payload.access_token) throw new Error("Microsoft Graph não retornou um token válido.");
    this.accessToken = payload.access_token;
    const lifetimeMs = Math.max(0, Number(payload.expires_in ?? 0) * 1000);
    const renewalSkewMs = Math.min(60_000, lifetimeMs * 0.1);
    this.accessTokenExpiresAt = this.now() + Math.max(0, lifetimeMs - renewalSkewMs);
    return payload.access_token;
  }

  async get<T>(path: string): Promise<T> {
    const token = await this.getAccessToken();
    const url = path.startsWith("https://") ? path : `${GRAPH_BASE_URL}${path}`;
    if (!url.startsWith(`${GRAPH_BASE_URL}/`)) throw new Error("Destino Microsoft Graph inválido.");
    const response = await this.fetcher(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Falha de leitura no Microsoft Graph (${response.status}).`);
    return response.json() as Promise<T>;
  }
}
