import "server-only";
import type { GraphServerConfig } from "../data-source/configuration";
import type { GraphWriteTransport } from "./sharepoint-types";
import { DecisionError } from "../../domain/decision-error";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

export class GraphClientCredentialsReadTransport implements GraphWriteTransport {
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
    if (!response.ok) {
      let oauthError: { error?: string; error_description?: string; error_codes?: number[] } | null = null;
      try {
        oauthError = (await response.json()) as {
          error?: string;
          error_description?: string;
          error_codes?: number[];
        };
      } catch {
        // payload não era JSON
      }

      const aadstsMatch = oauthError?.error_description?.match(/AADSTS\d+/);
      const aadstsCode = aadstsMatch ? aadstsMatch[0] : (oauthError?.error_codes?.[0] ? `AADSTS${oauthError.error_codes[0]}` : undefined);
      const sanitizedDescription = oauthError?.error_description
        ? oauthError.error_description.replace(/client_secret=[^&\s]+/gi, "client_secret=[REDACTED]")
        : undefined;

      console.error("Falha na autenticação server-side com Microsoft Graph (OAuth2):", {
        status: response.status,
        error: oauthError?.error ?? "unknown_error",
        aadstsCode: aadstsCode ?? "N/A",
        description: sanitizedDescription ?? "Sem detalhes retornados",
      });

      const detailParts = [response.status, oauthError?.error, aadstsCode].filter(Boolean);
      throw new Error(
        `Falha na autenticação server-side com Microsoft Graph (${detailParts.join(" - ")}).`,
      );
    }
    const payload = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!payload.access_token) throw new Error("Microsoft Graph não retornou um token válido.");
    this.accessToken = payload.access_token;
    const lifetimeMs = Math.max(0, Number(payload.expires_in ?? 0) * 1000);
    const renewalSkewMs = Math.min(60_000, lifetimeMs * 0.1);
    this.accessTokenExpiresAt = this.now() + Math.max(0, lifetimeMs - renewalSkewMs);
    return payload.access_token;
  }

  private async verifyWritePermission(token: string, listPath: string): Promise<void> {
    const denied = () => new DecisionError(
      "Escrita não autorizada: é necessário conceder write à aplicação na lista Itens_Importados (Lists.SelectedOperations.Selected).",
      403, "GRAPH_WRITE_FORBIDDEN",
    );
    let roles: string[];
    try {
      // Token obtido diretamente do Entra; nunca recebido do navegador.
      const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
      roles = Array.isArray(claims.roles) ? claims.roles : [];
    } catch {
      throw denied();
    }
    if (roles.some((role) => ["Sites.ReadWrite.All", "Sites.Manage.All", "Sites.FullControl.All"].includes(role))) return;
    if (!roles.includes("Lists.SelectedOperations.Selected")) throw denied();
    type Identity = { application?: { id?: string } };
    type Permission = {
      roles?: string[];
      grantedToV2?: Identity;
      grantedTo?: Identity;
      grantedToIdentitiesV2?: Identity[];
      grantedToIdentities?: Identity[];
    };
    let permissions: { value: Permission[] };
    try {
      permissions = await this.get(`${listPath}/permissions`);
    } catch {
      throw new DecisionError("Não foi possível verificar a permissão de escrita. Nenhuma gravação foi enviada.", 503, "GRAPH_WRITE_PERMISSION_UNVERIFIED");
    }
    const allowed = permissions.value.some((permission) => {
      const identities = [permission.grantedToV2, permission.grantedTo,
        ...(permission.grantedToIdentitiesV2 ?? []), ...(permission.grantedToIdentities ?? [])];
      return identities.some((identity) => identity?.application?.id === this.config.clientId)
        && permission.roles?.some((role) => ["write", "owner", "fullcontrol"].includes(role));
    });
    if (!allowed) throw denied();
  }

  async patch<T>(path: string, fields: Record<string, unknown>): Promise<T> {
    const match = /^(\/sites\/[^/?#]+\/lists\/[^/?#]+)\/items\/[1-9]\d*\/fields$/.exec(path);
    if (!match) throw new DecisionError("Destino de escrita Microsoft Graph inválido.");
    const token = await this.getAccessToken();
    await this.verifyWritePermission(token, match[1]);
    const response = await this.fetcher(`${GRAPH_BASE_URL}${path}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(fields),
      cache: "no-store",
    });
    if (!response.ok) {
      if (response.status === 403) throw new DecisionError("Microsoft Graph recusou a gravação. Verifique a concessão write na lista Itens_Importados.", 403, "GRAPH_WRITE_FORBIDDEN");
      if (response.status === 404) throw new DecisionError("Item não encontrado no SharePoint.", 404, "ITEM_NOT_FOUND");
      throw new DecisionError("Não foi possível confirmar a gravação no SharePoint. Recarregue os dados antes de tentar novamente.", 502, "GRAPH_WRITE_FAILED");
    }
    return response.json() as Promise<T>;
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
    if (!response.ok) {
      let graphError: { error?: { code?: string; message?: string } } | null = null;
      try {
        graphError = (await response.json()) as { error?: { code?: string; message?: string } };
      } catch {
        // payload não era JSON
      }
      console.error("Falha de leitura no Microsoft Graph:", {
        status: response.status,
        code: graphError?.error?.code ?? "unknown_code",
        message: graphError?.error?.message ?? "Sem detalhes retornados",
      });
      const detailParts = [response.status, graphError?.error?.code].filter(Boolean);
      throw new Error(`Falha de leitura no Microsoft Graph (${detailParts.join(" - ")}).`);
    }
    return response.json() as Promise<T>;
  }
}
