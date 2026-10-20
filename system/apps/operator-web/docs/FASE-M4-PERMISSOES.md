# Fase M.4 — matriz de permissões proposta

20/10/2026. Sem alteração de Entra, Graph, MFA ou guards produtivos.

| Perfil | Consulta | Correção | Aprovação | Rejeição | Solicitar reabertura | Executar reabertura | Auditoria | Reconciliação |
|---|---|---|---|---|---|---|---|---|
| Consulta | Sim | — | — | — | — | — | — | — |
| Operador | Sim | Sim | Sim | Sim | — | — | — | — |
| Comprador | Sim | Sim | Sim | Sim | — | — | — | — |
| SolicitanteReabertura | Sim | — | — | — | Sim | — | — | — |
| ExecutorReabertura | Sim | — | — | — | — | Sim | — | — |
| Auditor | Sim | — | — | — | — | — | Sim | — |
| Reconciliador | Sim | — | — | — | — | — | Sim | Sim |

Os três primeiros perfis refletem a direção já documentada no portal; a fila é compartilhada pelos autorizados. Os quatro perfis administrativos são nomes candidatos, não roles existentes atribuídas no Entra. Não há herança implícita de “Administrador” nem concessão administrativa a Operador/Comprador.

`src/server/persistence-proposal/permissions.ts` implementa esta matriz em guard local não integrado. Exige sessão interna validada/Entra/não expirada, tenant autorizado, Pessoa resolvida com OID/site correspondentes e atestação backend de acesso ao recurso. Todos esses parâmetros devem vir de serviços confiáveis, jamais de claims livres do navegador.

Para consultas correntes, a política vigente pode atestar acesso à fila completa; a M.4 não implanta segregação por orçamento. Para atividades administrativas, aprovar escopo tenant/site/lista e acesso aos itens/auditoria antes da integração. O guard proposto exige Pessoa em seu contexto de atestação; não altera o login/consulta existentes.

Solicitar não significa executar. Se houver workflow de solicitação, a autorização deve ser revalidada na execução e o pedido não pode atribuir a decisão ao solicitante. Separação obrigatória entre solicitante e executor, se desejada pelo gestor, requer política adicional; o modelo atual não impõe quatro olhos automaticamente. Combinação de roles precisa de revisão administrativa.

Reconciliar permite consultar e acrescentar evidência validada; não permite PATCH, conceder direitos, editar intenção, apagar histórico ou “forçar confirmado”. Nenhum perfil possui ação forceConfirm.

Integração futura deverá reutilizar registro ativo/revogação de sessão, validação MFA efetiva, origem/CSRF, limites de requisição e rate limit. As roles atuais aceitas no token/sessão não foram ampliadas nesta fase: novos perfis exigem decisão e configuração posterior. Permissão da aplicação Graph não substitui autorização humana.

Os testes percorrem cada combinação perfil/ação e negam recurso divergente, OID divergente, sessão expirada/bypass, tenant/Pessoa incompatíveis, papel desconhecido e confirmação manual.
