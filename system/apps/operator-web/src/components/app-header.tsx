import Link from "next/link";
import { KeycloakLogoutButton } from "./keycloak-logout-button";
import { resolveDataSource } from "../server/data-source/configuration";
import { getSession } from "../server/auth/session";
import { isDemoEnabled } from "../demo/configuration";
export async function AppHeader() {
  if (isDemoEnabled()) return <header className="app-header"><Link href="/demo" className="brand"><b>3P</b><span><strong>Sistema 3P · Demo</strong><small>Orçamentos fictícios · sem persistência</small></span></Link><span>Operações reais indisponíveis</span></header>;
  const user = await getSession();
  return <header className="app-header"><Link href={user ? "/" : "/login"} className="brand"><b>3P</b><span><strong>Sistema 3P</strong><small>Compras e orçamentos</small></span></Link>
    {user ? <div className="account-menu"><div className="environment"><i />{resolveDataSource() === "sharepoint" ? "Dados do SharePoint" : "Ambiente de demonstração"}</div><span>{user.name}<small>{user.roles.join(" · ")}</small></span>{user.authMode === "keycloak" ? <KeycloakLogoutButton /> : <form action="/api/auth/logout" method="post"><button type="submit">Sair</button></form>}</div>
      : <span className="login-header-note">Portal da equipe</span>}
  </header>;
}
