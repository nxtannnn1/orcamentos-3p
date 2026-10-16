# Demonstração funcional local

Execute `npm run dev:demo` na pasta `system/apps/operator-web` e abra http://127.0.0.1:3100/demo.

O comando fixa desenvolvimento, fonte mock e porta 3100 no loopback, sem habilitar as integrações SharePoint/Operator API. A rota só está disponível com `OPERATOR_WEB_DEMO=true`, `NODE_ENV=development` e `DATA_SOURCE=mock`.

Abra ORC-DEMO-2026-014. São três itens e dez materiais fictícios. No item 1, quantidade 2,5 e preço 10 produzem subtotal 25,0000 e prévia total R$ 1.836,40 (inicial R$ 1.916,40). Descarte para cancelar ou confirme apenas no demo. Busque MAT-AL-035, selecione e aprove; rejeitar limpa a associação. Aprovar/rejeitar também confirma os campos válidos do rascunho. Navegação interna exige confirmar ou descartar primeiro.

Quantidade deve ser positiva, preço pode ser zero, até quatro casas com ponto/vírgula; limite demo 1.000.000 por campo e observação até 1.000 caracteres. Aritmética BigInt, produto half-up a quatro casas e soma antes do total a duas; ajustes fictícios zero. Os limites e edição financeira são exclusivos da demonstração; nenhum contrato de produção ou endpoint financeiro foi alterado.

Use Simular carregamento, Simular erro de leitura/Tentar novamente e Falhar próxima confirmação para testar falhas. Confirmado significa somente memória desta tela, sem persistência. Atualizar, sair ou abrir nova aba reinicia todas as decisões. O mock BFF anterior é independente e mantém decisões no processo servidor.

Esta tela reutiliza a lista de itens, busca de material e badges existentes, mas não importa repositórios BFF/Graph/banco e não realiza chamadas às APIs de negócio. Não é teste de autenticação corporativa, persistência, concorrência ou integração real. Não conecte ao clone D2.

Validação: `npm test`, `npm run lint`, `npm run typecheck`. Não habilite `RUN_OPERATOR_API_LIVE` para este ensaio isolado.
