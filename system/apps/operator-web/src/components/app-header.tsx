import Link from "next/link";
import { resolveDataSource } from "../server/data-source/configuration";
import { getSession } from "../server/auth/session";
export async function AppHeader() {
  const user = await getSession();
  return <header className="app-header"><Link href={user ? "/" : "/login"} className="brand"><b>3P</b><span><strong>Sistema 3P</strong><small>Compras e orçamentos</small></span></Link>
    {user ? <div className="account-menu"><div className="environment"><i />{resolveDataSource() === "sharepoint" ? "Dados do SharePoint" : "Ambiente de demonstração"}</div><span>{user.name}<small>{user.roles.join(" · ")}</small></span><form action="/api/auth/logout" method="post"><button type="submit">Sair</button></form></div>
      : <span className="login-header-note">Portal da equipe</span>}
  </header>;
}
