import * as React from "react";

export function LoginActions({ corporateMode, microsoftConfigured, keycloakConfigured }: {
  corporateMode: boolean; microsoftConfigured: boolean; keycloakConfigured: boolean;
}) {
  if (corporateMode) return <>
    {keycloakConfigured
      ? <a className="microsoft-login" href="/api/auth/keycloak/login">Entrar com conta corporativa<span aria-hidden="true">→</span></a>
      : <button className="microsoft-login" disabled>Entrar com conta corporativa</button>}
    <p className="login-security">
  {keycloakConfigured
    ? "Autenticação segura pelo portal de identidade 3P."
    : "A autenticação é feita pela Microsoft."}
</p>
  </>;
  return <>
    {!keycloakConfigured && (
  microsoftConfigured ? (
    <a className="microsoft-login" href="/api/auth/login">
      <MicrosoftMark />
      Entrar com Microsoft
      <span aria-hidden="true">→</span>
    </a>
  ) : (
    <button className="microsoft-login" disabled>
      <MicrosoftMark />
      Entrar com Microsoft
    </button>
  )
)}
    {keycloakConfigured && <a className="microsoft-login" href="/api/auth/keycloak/login">Entrar com Keycloak<span aria-hidden="true">→</span></a>}
    <p className="login-security">{keycloakConfigured ? "Selecione seu provedor de acesso." : "A autenticação é feita pela Microsoft."}</p>
  </>;
}
function MicrosoftMark() {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 21 21"><path fill="#f25022" d="M0 0h10v10H0z"/><path fill="#7fba00" d="M11 0h10v10H11z"/><path fill="#00a4ef" d="M0 11h10v10H0z"/><path fill="#ffb900" d="M11 11h10v10H11z"/></svg>;
}
