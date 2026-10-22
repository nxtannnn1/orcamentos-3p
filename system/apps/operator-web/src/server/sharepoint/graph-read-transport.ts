import "server-only";
import type { GraphServerConfig } from "../data-source/configuration";
import type { GraphWriteTransport } from "./sharepoint-types";
import { DecisionError } from "../../domain/decision-error";
import { GraphWriteError } from "./graph-write-error";
import { GraphReadError } from "./graph-read-error";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const oauthCodes = new Set(["invalid_client", "invalid_grant", "invalid_scope", "unauthorized_client", "invalid_request", "temporarily_unavailable", "server_error"]);
const graphCodes = new Set(["accessDenied", "Authorization_RequestDenied", "InvalidAuthenticationToken", "itemNotFound", "ErrorAccessDenied", "generalException", "invalidRequest", "TooManyRequests", "serviceNotAvailable", "activityLimitReached", "ResourceNotFound"]);

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
    let response: Response;
    try {
      response = await this.fetcher(
        `https://login.microsoftonline.com/${encodeURIComponent(this.config.tenantId)}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(15_000),
        },
      );
    } catch {
      throw new GraphReadError("oauth", "NETWORK");
    }
    if (!response.ok) {
      let oauthError: {
        error?: string;
        error_description?: string;
        error_codes?: number[];
      } | null = null;
      try {
        oauthError = (await response.json()) as {
          error?: string;
          error_description?: string;
          error_codes?: number[];
        };
      } catch {
        // payload não era JSON
      }

      const aadstsMatch = typeof oauthError?.error_description === "string" ? oauthError.error_description.match(/AADSTS\d+/) : null;
      const aadstsCode = aadstsMatch
        ? aadstsMatch[0]
        : oauthError?.error_codes?.[0]
          ? `AADSTS${oauthError.error_codes[0]}`
          : undefined;
      const safeCode = typeof oauthError?.error === "string" && oauthCodes.has(oauthError.error) ? oauthError.error : "unknown_error";
      const safeAadsts = aadstsCode && ["AADSTS7000215", "AADSTS7000222", "AADSTS7000218", "AADSTS700016", "AADSTS90002", "AADSTS500011", "AADSTS70011"].includes(aadstsCode) ? aadstsCode : undefined;
      console.error("Falha na autenticação server-side com Microsoft Graph (OAuth2):", {
        status: response.status,
        error: safeCode,
        aadstsCode: safeAadsts ?? "N/A",
      });

      const detailParts = [response.status, safeCode === "unknown_error" ? undefined : safeCode, safeAadsts].filter(Boolean);
      throw new GraphReadError("oauth", "HTTP", response.status,
        `Falha na autenticação server-side com Microsoft Graph (${detailParts.join(" - ")}).`,
      );
    }
    let payload: { access_token?: string; expires_in?: number };
    try { payload = await response.json(); } catch { throw new GraphReadError("oauth", "INVALID_RESPONSE", response.status); }
    if (!payload || typeof payload.access_token !== "string" || !payload.access_token)
      throw new GraphReadError("oauth", "INVALID_RESPONSE", response.status);
    this.accessToken = payload.access_token;
    const lifetimeMs = Math.max(0, Number(payload.expires_in ?? 0) * 1000);
    const renewalSkewMs = Math.min(60_000, lifetimeMs * 0.1);
    this.accessTokenExpiresAt = this.now() + Math.max(0, lifetimeMs - renewalSkewMs);
    return payload.access_token;
  }

  private async verifyWritePermission(token: string, listPath: string): Promise<void> {
    const denied = () =>
      new DecisionError(
        "Escrita não autorizada: é necessário conceder write à aplicação na lista Itens_Importados (Lists.SelectedOperations.Selected).",
        403,
        "GRAPH_WRITE_FORBIDDEN",
      );
    let roles: string[];
    try {
      // Token obtido diretamente do Entra; nunca recebido do navegador.
      const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
      roles = Array.isArray(claims.roles) ? claims.roles : [];
    } catch {
      throw denied();
    }
    if (
      roles.some((role) =>
        ["Sites.ReadWrite.All", "Sites.Manage.All", "Sites.FullControl.All"].includes(role),
      )
    ) {
      throw new DecisionError(
        "Escrita bloqueada: a aplicação possui permissão Graph ampla. Use somente Lists.SelectedOperations.Selected com concessão na lista necessária.",
        403,
        "GRAPH_PERMISSION_TOO_BROAD",
      );
    }
    if (!roles.includes("Lists.SelectedOperations.Selected")) throw denied();
    type Identity = { application?: { id?: string } };
    type Permission = {
      roles?: string[];
      grantedToV2?: Identity;
      grantedTo?: Identity;
      grantedToIdentitiesV2?: Identity[];
      grantedToIdentities?: Identity[];
    };
    const entries: Permission[] = [];
    try {
      let next: string | undefined = listPath + "/permissions";
      const visited = new Set<string>();
      while (next) {
        const url = new URL(next.startsWith("https://") ? next : GRAPH_BASE_URL + next);
        if (url.origin !== "https://graph.microsoft.com" || url.username || url.password || url.hash ||
            decodeURIComponent(url.pathname) !== decodeURIComponent("/v1.0" + listPath + "/permissions") ||
            visited.has(url.href) || visited.size >= 20) throw new Error("Invalid permission pagination");
        visited.add(url.href);
        const page: { value: Permission[]; "@odata.nextLink"?: string } = await this.get(next);
        if (!page || !Array.isArray(page.value) || entries.length + page.value.length > 10000 ||
            page.value.some(p => !p || typeof p !== "object" ||
              (p.roles !== undefined && (!Array.isArray(p.roles) || p.roles.some(r => typeof r !== "string"))) ||
              [p.grantedToIdentities, p.grantedToIdentitiesV2].some(v => v !== undefined && !Array.isArray(v))))
          throw new Error("Invalid permissions response");
        entries.push(...page.value);
        const link = page["@odata.nextLink"];
        if (link !== undefined && (typeof link !== "string" || !link.startsWith("https://"))) throw new Error("Invalid next link");
        next = link;
      }
    } catch {
      throw new DecisionError(
        "Não foi possível verificar a permissão de escrita. Nenhuma gravação foi enviada.",
        503,
        "GRAPH_WRITE_PERMISSION_UNVERIFIED",
      );
    }
    const allowed = entries.some((permission) => {
      const identities = [
        permission.grantedToV2,
        permission.grantedTo,
        ...(permission.grantedToIdentitiesV2 ?? []),
        ...(permission.grantedToIdentities ?? []),
      ];
      return (
        identities.some((identity) => identity?.application?.id === this.config.clientId) &&
        permission.roles?.some((role) => ["write", "owner", "fullcontrol"].includes(role))
      );
    });
    if (!allowed) throw denied();
  }

  async patch<T>(path: string, fields: Record<string, unknown>, etag: string): Promise<T> {
    const match = /^(\/sites\/[^/?#]+\/lists\/[^/?#]+)\/items\/[1-9]\d*\/fields$/.exec(path);
    if (!match) throw new DecisionError("Destino de escrita Microsoft Graph inválido.");
    if (!etag || etag === "*" || etag.length > 512 || /[\r\n]/.test(etag))
      throw new DecisionError("Versão do item obrigatória.", 428, "VERSION_REQUIRED");
    let token: string;
    try {
      token = await this.getAccessToken();
      await this.verifyWritePermission(token, match[1]);
    } catch (error) {
      if (error instanceof DecisionError)
        throw new GraphWriteError(error.message, error.status, error.code, "not_sent");
      throw new GraphWriteError("Não foi possível preparar a escrita no Microsoft Graph. Nenhuma gravação enviada.", 503, "GRAPH_WRITE_PREPARATION_FAILED", "not_sent");
    }
    const response = await this.fetcher(`${GRAPH_BASE_URL}${path}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "If-Match": etag,
      },
      body: JSON.stringify(fields),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const failures: Record<number, [number, string, string]> = {
        400: [502, "GRAPH_WRITE_INVALID_PAYLOAD", "Microsoft Graph recusou os campos. Verifique nomes internos, tipos e payload."],
        401: [503, "GRAPH_WRITE_AUTHENTICATION_FAILED", "Microsoft Graph recusou a credencial técnica. Verifique a configuração da aplicação."],
        403: [403, "GRAPH_WRITE_FORBIDDEN", "Microsoft Graph recusou a gravação. Verifique a concessão write na lista Itens_Importados."],
        404: [404, "ITEM_NOT_FOUND", "Item não encontrado no SharePoint."],
        409: [409, "DECISION_CONFLICT", "Conflito no SharePoint. Releia o item antes de decidir."],
        412: [409, "DECISION_CONFLICT", "Este item foi alterado. Recarregue os dados antes de decidir."],
        429: [429, "GRAPH_WRITE_THROTTLED", "Microsoft Graph limitou as gravações. Aguarde antes de uma nova operação."],
      };
      const failure = failures[response.status];
      if (failure) {
        const retry = response.headers.get("Retry-After") ?? "";
        const seconds = /^\d+$/.test(retry) && Number.isSafeInteger(Number(retry)) ? Number(retry) : 60;
        throw new GraphWriteError(failure[2], failure[0], failure[1], "rejected", response.status === 429 ? seconds : undefined);
      }
      throw new GraphWriteError("Não foi possível confirmar a gravação no SharePoint. Recarregue os dados antes de tentar novamente.",
        502, "GRAPH_WRITE_FAILED", "unknown");
    }
    return response.json() as Promise<T>;
  }

  async get<T>(path: string): Promise<T> {
    const url = path.startsWith("https://") ? path : `${GRAPH_BASE_URL}${path}`;
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new GraphReadError("get", "INVALID_TARGET"); }
    if (
      parsed.origin !== "https://graph.microsoft.com" ||
      parsed.username ||
      parsed.password ||
      parsed.hash ||
      !parsed.pathname.startsWith("/v1.0/")
    )
      throw new GraphReadError("get", "INVALID_TARGET", null, "Destino Microsoft Graph inválido.");
    const token = await this.getAccessToken();
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new GraphReadError("get", "NETWORK");
    }
    if (!response.ok) {
      let graphError: { error?: { code?: string; message?: string } } | null = null;
      try {
        graphError = (await response.json()) as { error?: { code?: string; message?: string } };
      } catch {
        // payload não era JSON
      }
      const safeCode = typeof graphError?.error?.code === "string" && graphCodes.has(graphError.error.code) ? graphError.error.code : "unknown_code";
      console.error("Falha de leitura no Microsoft Graph:", {
        status: response.status,
        code: safeCode,
      });
      const detailParts = [response.status, safeCode === "unknown_code" ? undefined : safeCode].filter(Boolean);
      throw new GraphReadError("get", "HTTP", response.status, `Falha de leitura no Microsoft Graph (${detailParts.join(" - ")}).`);
    }
    try { return await response.json() as T; } catch { throw new GraphReadError("get", "INVALID_RESPONSE", response.status); }
  }
}
