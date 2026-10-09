# Operator Web — Sistema 3P

Frontend operacional do MVP para revisão humana de materiais em orçamentos.

Para entender o código e acompanhar os fluxos, comece pelo [Guia de estudo](docs/GUIA-DE-ESTUDO.md).

Com `DATA_SOURCE=mock`, os dados são fictícios e as decisões ficam na memória do processo do BFF (reiniciar o servidor ou trocar de instância perde essas decisões). Com `DATA_SOURCE=sharepoint`, o BFF usa o Microsoft Graph. Credenciais permanecem exclusivamente no servidor.

## Decisão de item

`PATCH /api/itens/{id}/decisao` recebe JSON com `action` (`APPROVE` ou `REJECT`), `approvedMaterialId` (ID do catálogo na aprovação, `null` na rejeição) e `observation` (texto). O BFF resolve o material no catálogo oficial e rejeita campos extras, material inexistente e aprovação sem escolha explícita.

O endpoint exige `If-Match` com a versão recebida na leitura. O repositório envia `Material_AprovadoLookupId`, `Status_Revisao`, `Observacao_Item` e as três colunas configuradas de autoria/data/ID da decisão para `/sites/{siteId}/lists/{itemsListId}/items/{itemId}/fields`. Rejeitar limpa o lookup com `null`. `Material_Sugerido_Ref` não é alterado nem promovido automaticamente. O fluxo GET existente foi preservado.

A tela usa `ReviewController` e só altera o item/progresso após a resposta de sucesso do BFF. Aprovar avança; rejeitar permanece no item. Durante a gravação, decisões e navegação interna ficam bloqueadas. Falhas preservam a seleção, o material escolhido e a observação para revisão.

Antes de cada PATCH real, o transporte verifica as permissões do token. Para a configuração atual, `Lists.SelectedOperations.Selected`, consulta a concessão da própria aplicação na lista: é necessário `write`, `owner` ou `fullcontrol`. `read` bloqueia o PATCH com HTTP 403 e mensagem explícita. Falha ao consultar a concessão também bloqueia a escrita. O sistema não altera permissões nem solicita privilégios automaticamente.

O endpoint exige sessão Microsoft da 3P e perfil Operador ou Comprador. Consulta pode apenas ler. Essa autorização individual é adicional à verificação de permissão Graph da aplicação.

### Validação sem escrita real

Os testes de `decision-flow.test.ts` cobrem controller → cliente BFF → rota → repositório SharePoint → transporte, interceptando todas as chamadas de rede com dados fictícios. Cobrem aprovação, rejeição, releitura, erros e bloqueio por permissão. Não usam `.env.local` nem gravam no tenant.

O E2E real permanece pendente: após o administrador conceder `write` em `Itens_Importados`, verificar a concessão e validar aprovação/rejeição em um item de teste autorizado, incluindo releitura e preservação da sugestão. O build e os testes simulados não confirmam a gravação real no SharePoint.

## Execução local

```powershell
npm install
npm run dev
```

Acesse `http://localhost:3000`.

## Validação

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

## Login Microsoft da 3P

Acesse `/login`. O login é obrigatório para páginas operacionais e APIs, inclusive no mock. A configuração e o aceite do administrador estão em [docs/LOGIN-MICROSOFT.md](docs/LOGIN-MICROSOFT.md). Sem as variáveis ENTRA_LOGIN_*, AUTH_* e ENTRA_MFA_AUTH_CONTEXT_ID, o acesso fica bloqueado. A ativação e comprovação de MFA dependem da política configurada no tenant.

Para desenvolvimento estritamente local, o bypass opcional exige simultaneamente `AUTH_DISABLED=true`, `NODE_ENV=development`, `DATA_SOURCE=mock` e `AUTH_APP_ORIGIN` HTTP em um host local permitido. Configurações incompatíveis falham; o bypass não funciona com SharePoint, staging ou produção e não substitui o login Microsoft. Consulte [docs/LOGIN-MICROSOFT.md](docs/LOGIN-MICROSOFT.md).

## Controles de segurança

Consulte [Segurança operacional](docs/SEGURANCA-OPERACIONAL.md) antes de publicar ou liberar escrita. Produção exige registro compartilhado de sessões; decisões SharePoint exigem ETag, auditoria durável e mapeamento das colunas de autoria/data/ID. Os perfis autorizados acessam toda a fila.

## Integração com PostgreSQL

DATA_SOURCE=operator-api habilita consultas à Operator API pelo servidor. Consulte [o guia de integração](docs/INTEGRACAO-OPERATOR-API.md). Aprovação e rejeição permanecem bloqueadas nessa fonte. O modo local opcional possui somente perfil Consulta e falha em produção.
