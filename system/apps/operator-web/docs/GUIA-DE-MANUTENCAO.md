# Guia de manutenção

**O código pode ser produzido com auxílio de inteligência artificial, mas sua arquitetura, comportamento, limitações e procedimentos de manutenção devem permanecer compreensíveis para o responsável pelo projeto.**

## Encontrar e avaliar

Busque texto/URL com `rg` e siga: página → componente → domínio → contrato → API → servidor → integração. Leia tipos/testes. Liste entradas, saídas, regras, erros e persistência. Pergunte se a mudança afeta contrato, JSON, tipos, cada implementação de repository, mapper, permissão, testes e docs.

## Mudanças típicas

- **Nova tela:** crie `src/app/.../page.tsx`; separe Server/Client Component; exija sessão; reuse tipos; cubra loading/vazio/erro/permissão; teste e documente.
- **Novo campo:** comece no tipo; rastreie mock, mapper, JSON, UI e testes. Campo SharePoint requer mapa administrativo sem valor real no Git.
- **Regra de negócio:** escreva exemplos permitido/negado. Interação fica no domínio; integridade persistente no repository; autorização também no servidor, nunca só na UI.
- **Endpoint:** preserve sessão, perfil, limite, validação, tamanho, origem para escrita, cache seguro e testes. Tipos não validam JSON runtime.
- **Integração:** separe configuração, token, autorização e formato. Preserve capacidades distintas: mock em memória, SharePoint com decisão e Operator API somente leitura. Leia antes de escrever; não amplie permissão para contornar 403; releia após gravação incerta.
- **Documentação:** registre implementado/simulado/pendente, caminhos/comandos reais, links relativos e nenhum secret.

Use Codex com escopo/critério explícitos, alterações limitadas e testes. Depois revise decisões, diff, riscos e mensagens. O responsável deve explicar e reverter a mudança sem depender da conversa.

## Checklist de revisão de IA

- [ ] Problema e comportamento esperado estão claros.
- [ ] Só arquivos necessários mudaram; diff lido integralmente.
- [ ] Não há secret, token, cookie, dado pessoal ou artefato.
- [ ] Tipos, mock, BFF, SharePoint, Operator API e docs continuam coerentes.
- [ ] Autorização está no servidor.
- [ ] Concorrência, ETag, auditoria e falhas parciais foram preservadas.
- [ ] Testes positivos/negativos e regressão foram executados.
- [ ] Lint, typecheck e build relevante passaram.
- [ ] Houve validação manual proporcional ao risco.
- [ ] Pendências externas estão registradas.
- [ ] O responsável consegue explicar e reverter.
