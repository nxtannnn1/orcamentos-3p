# Integração Operator Web → Operator API → PostgreSQL

Implementada em 09/10/2026, exclusivamente para consulta.

## O que mudou

A configuração DATA_SOURCE aceita operator-api. A fábrica cria um OperatorApiRepository server-only. O navegador continua consultando /api/orcamentos, /api/materiais e /api/orcamentos/{id}/itens do próprio frontend. Essas rotas validam a sessão e chamam a API pelo servidor; nenhum token de serviço é enviado ao navegador.

O adaptador consome /api/v1, verifica o JSON recebido e percorre páginas de até 100 registros. Limite total: 20 páginas por lista. Recusa cursor inválido/repetido, respostas maiores que 2 MB por página, redirecionamentos, configuração insegura e falhas de rede. Cada fetch tem timeout de oito segundos e cache desativado.

A API passou a devolver itemCount nos orçamentos, calculado na própria consulta. Isso evita consultar os itens de cada orçamento para montar a fila.

## Configuração local aplicada

- Frontend: http://127.0.0.1:3000
- API: http://127.0.0.1:3001
- Banco: role operator_api_reader, já criada pelo usuário.
- DATABASE_URL foi preenchido localmente; nenhuma role, grant ou dado foi alterado.
- Um novo token aleatório substituiu o token divulgado. O frontend possui o token, a API possui seu hash.
- DATA_SOURCE=operator-api no .env.local do frontend.
- ALLOW_LOCAL_OPERATOR_API_BYPASS=true e AUTH_DISABLED=true somente neste teste local.
- ALLOW_LOCAL_SHAREPOINT_BYPASS=false.

Esse modo local só funciona em development, com origem do frontend e URL da API em HTTP loopback, sem usuário/senha/query na URL. Retorna perfil Consulta. Operações de decisão são recusadas com 403. Configurações incompatíveis falham com 503. Os scripts de desenvolvimento vinculam os serviços a 127.0.0.1.

## Autenticação em produção

Desabilitar ALLOW_LOCAL_OPERATOR_API_BYPASS e AUTH_DISABLED. Configurar o login Microsoft do Operator Web, seu controle de sessão e perfis. Usar HTTPS entre serviços e TLS verificado no PostgreSQL. As credenciais Microsoft Graph não equivalem automaticamente ao registro Entra de login. Não copiar segredos para NEXT_PUBLIC_.

O token de serviço identifica o frontend, não um usuário. A sessão/autorizações continuam no BFF. Nenhum novo bypass produtivo foi implementado. Antes de publicação, revisar a atualização Next.js anunciada para 14/10/2026.

## Limitações do modelo

- PG-{id} é referência de exibição derivada do ID PostgreSQL, não um código SharePoint ou Neoenergia.
- Os IDs das duas fontes não são intercambiáveis.
- Material associado aparece somente como referência. approvedMaterial permanece null.
- Não se presume revisão humana a partir de matching/status livre do banco. reviewAvailable=false indica que a revisão não está representada.
- A tela fica somente em consulta, sem progresso de revisão presumido.
- Unidade do catálogo ainda não existe no schema atual e permanece vazia.
- Decimais são convertidos para number somente para exibição na interface existente. Não são usados para cálculo financeiro.
- Quantidades/preços/numero_item ausentes ou inválidos são recusados pelo adaptador em vez de virar zero.
- API/BFF não fazem fallback automático para mock ou SharePoint após uma falha.
- Nenhuma rota de gravação do n8n foi criada.

## Testes

Testes unitários cobrem configuração, autenticação enviada no servidor, paginação, cursor inválido, erro seguro, valores incompletos, preservação da distinção entre associação/aprovação e bloqueio da escrita.

O teste opt-in operator-api-live.test.ts chama rotas reais do BFF, usando somente no processo de teste uma sessão Consulta simulada. O transporte HTTP, a Operator API e o PostgreSQL são reais:

```powershell
$env:RUN_OPERATOR_API_LIVE='1'
npm test -- src/app/api/operator-api-live.test.ts
Remove-Item Env:\RUN_OPERATOR_API_LIVE
```

O teste deve ser usado com banco local conhecido contendo um orçamento; usa exclusivamente SELECT. Não substitui o aceite do login Microsoft em produção.

Também foram feitas chamadas HTTP ao frontend em execução: fila, catálogo, itens e páginas retornaram 200; a decisão foi recusada com 403. Foram encontrados um orçamento, um item e um material. Nenhum conteúdo pessoal ou segredo foi incluído nos resultados.

## Voltar ao SharePoint

No .env.local do Operator Web, definir DATA_SOURCE=sharepoint e ALLOW_LOCAL_OPERATOR_API_BYPASS=false; restaurar o modo de autenticação apropriado. Em produção, manter AUTH_DISABLED=false. Reiniciar o frontend após trocar a fonte. Os registros nas Lists permanecem intactos.

## Resultado das verificações

Frontend: 165 testes unitários aprovados; teste de integração real aprovado; TypeScript, lint e build aprovados. Backend: 61 testes, TypeScript e build aprovados. Auditoria de produção do frontend: zero achados após atualizar apenas source-map-js de 1.2.1 para 1.2.2 no lockfile. A auditoria completa ainda indica oito entradas altas em ferramentas de desenvolvimento existentes (cadeias eslint/braces e wrangler/miniflare/sharp); não foi aplicado audit fix --force nem downgrade do ESLint/Next. Essa pendência deve ser tratada antes de liberar as ferramentas de publicação. Referência da correção aplicada: https://github.com/advisories/GHSA-68fv-2mgg-jv7q.

A inspeção visual do navegador integrado não pôde ser concluída por falha da ferramenta. Foram verificados os endpoints reais, o bloqueio de escrita, as páginas HTTP e os builds; não foi afirmada validação visual da tela.
