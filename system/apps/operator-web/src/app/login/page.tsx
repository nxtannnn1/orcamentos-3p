import { redirect } from "next/navigation";
import { authConfig } from "../../server/auth/configuration";
import { getSession } from "../../server/auth/session";

export const dynamic = "force-dynamic";
const errors: Record<string, string> = {
  AUTH_NOT_CONFIGURED: "O login com Microsoft ainda não está disponível. Fale com o time de TI.",
  ACCOUNT_NOT_ALLOWED: "Esta conta não tem permissão de acesso. Use seu e-mail corporativo.",
  ROLE_REQUIRED: "Sua conta ainda não tem um perfil de acesso. Fale com o time de TI.",
  MFA_REQUIRED: "A verificação em duas etapas da Microsoft não foi concluída. Tente novamente.",
  LOGIN_EXPIRED: "A sessão de login expirou. Clique em Entrar com Microsoft para tentar de novo.",
  LOGIN_FAILED: "Não foi possível entrar. Tente novamente.",
};
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSession()) redirect("/");
  let configured = true;
  try { authConfig(); } catch { configured = false; }
  const { error } = await searchParams;
  const message = !configured ? errors.AUTH_NOT_CONFIGURED : error ? errors[error] ?? errors.LOGIN_FAILED : null;
  return <main className="login-shell">
    <section className="login-intro" aria-labelledby="login-title">
      <span className="login-kicker">SISTEMA 3P</span>
      <h1 id="login-title">Compras e<br />orçamentos</h1>
      <p>Gerencie materiais, propostas<br />e cestas de compra.</p>
      <div className="login-workflow" aria-label="Etapas de trabalho">
        <span><b>01</b> Materiais</span><span><b>02</b> Propostas</span><span><b>03</b> Cesta</span>
      </div>
      <small>Acesse com sua conta corporativa.</small>
    </section>
    <section className="login-card" aria-labelledby="access-title">
      <div className="login-lock" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg></div>
      <p className="eyebrow">ACESSO</p>
      <h2 id="access-title">Entrar</h2>
      <p className="login-description">Use sua conta Microsoft corporativa.</p>
      {message && <div className="login-notice" role="alert">{message}</div>}
      {configured ? <a className="microsoft-login" href="/api/auth/login"><MicrosoftMark />Entrar com Microsoft<span aria-hidden="true">→</span></a>
        : <button className="microsoft-login" disabled><MicrosoftMark />Entrar com Microsoft</button>}
      <p className="login-security">A autenticação é feita pela Microsoft.</p>
      <div className="login-divider" />
      <div className="login-help"><strong>Precisa de acesso?</strong><p>Fale com o time de TI.</p></div>
    </section>
    <footer className="login-footer">Sistema 3P <span>Acesso restrito a colaboradores</span></footer>
  </main>;
}
function MicrosoftMark() {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 21 21"><path fill="#f25022" d="M0 0h10v10H0z"/><path fill="#7fba00" d="M11 0h10v10H11z"/><path fill="#00a4ef" d="M0 11h10v10H0z"/><path fill="#ffb900" d="M11 11h10v10H11z"/></svg>;
}