import { redirect } from "next/navigation";
import { authConfig } from "../../server/auth/configuration";
import { getSession } from "../../server/auth/session";

export const dynamic = "force-dynamic";
const errors: Record<string, string> = {
  AUTH_NOT_CONFIGURED: "O acesso corporativo ainda está sendo configurado. Solicite a liberação ao responsável de TI da 3P.",
  ACCOUNT_NOT_ALLOWED: "Esta conta não está autorizada. Use sua conta corporativa da 3P.",
  ROLE_REQUIRED: "Sua conta ainda não tem um perfil de acesso. Solicite a liberação ao responsável da 3P.",
  MFA_REQUIRED: "A Microsoft não confirmou a verificação exigida para este acesso. Consulte o responsável de TI da 3P.",
  LOGIN_EXPIRED: "A tentativa de acesso expirou. Clique em Entrar com Microsoft para tentar novamente.",
  LOGIN_FAILED: "Não foi possível concluir o acesso. Tente novamente com sua conta corporativa.",
};
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSession()) redirect("/");
  let configured = true;
  try { authConfig(); } catch { configured = false; }
  const { error } = await searchParams;
  const message = !configured ? errors.AUTH_NOT_CONFIGURED : error ? errors[error] ?? errors.LOGIN_FAILED : null;
  return <main className="login-shell">
    <section className="login-intro" aria-labelledby="login-title">
      <span className="login-kicker">3P · COMPRAS E ORÇAMENTOS</span>
      <h1 id="login-title">Boas decisões<br />começam aqui.</h1>
      <p>Materiais conferidos. Ofertas comparáveis.<br />Mais clareza em cada compra.</p>
      <div className="login-workflow" aria-label="Etapas de trabalho">
        <span><b>01</b> Validar materiais</span><span><b>02</b> Comparar ofertas</span><span><b>03</b> Montar a cesta</span>
      </div>
      <small>Um só lugar para acompanhar suas decisões.</small>
    </section>
    <section className="login-card" aria-labelledby="access-title">
      <div className="login-lock" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg></div>
      <p className="eyebrow">ACESSO CORPORATIVO</p>
      <h2 id="access-title">Bem-vindo à 3P</h2>
      <p className="login-description">Entre com a conta Microsoft que você usa no trabalho.</p>
      {message && <div className="login-notice" role="alert">{message}</div>}
      {configured ? <a className="microsoft-login" href="/api/auth/login"><MicrosoftMark />Entrar com Microsoft<span aria-hidden="true">→</span></a>
        : <button className="microsoft-login" disabled><MicrosoftMark />Entrar com Microsoft</button>}
      <p className="login-security">A verificação de segurança é feita pela Microsoft, conforme a política de acesso da 3P.</p>
      <div className="login-divider" />
      <div className="login-help"><strong>Acesso exclusivo à equipe 3P</strong><p>Precisa de acesso? Fale com o responsável de TI da empresa.</p></div>
    </section>
    <footer className="login-footer">Sistema 3P <span>Conta corporativa · Acesso por perfil</span></footer>
  </main>;
}
function MicrosoftMark() {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 21 21"><path fill="#f25022" d="M0 0h10v10H0z"/><path fill="#7fba00" d="M11 0h10v10H11z"/><path fill="#00a4ef" d="M0 11h10v10H0z"/><path fill="#ffb900" d="M11 11h10v10H11z"/></svg>;
}
