"use client";
import { useState, type FormEvent } from "react";

/** Fetch the same-origin logout first, then navigate to native provider confirmation.
 * No external form submission or token in browser storage is needed. */
export function KeycloakLogoutButton() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setFailed(false);
    try {
      const response = await fetch("/api/auth/keycloak/logout", {
        method: "POST", credentials: "same-origin", mode: "cors",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error();
      const result = await response.json() as { logoutUrl?: string };
      if (!result.logoutUrl) throw new Error();
      window.location.assign(result.logoutUrl);
    } catch { setFailed(true); setBusy(false); }
  }
  return <form action="/api/auth/keycloak/logout" method="post" onSubmit={submit}>
    <button type="submit" disabled={busy}>{busy ? "Saindo…" : "Sair"}</button>
    {failed && <span role="alert">Não foi possível sair. Tente novamente.</span>}
  </form>;
}
