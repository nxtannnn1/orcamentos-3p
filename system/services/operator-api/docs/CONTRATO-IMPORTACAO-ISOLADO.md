# Contrato de importação v1 — validador isolado

Esta implementação não cria endpoint e não acessa o banco. `validarImportacaoOrcamento(unknown)` retorna uma cópia validada e normalizada ou lança `ErroContrato` com campo e código, sem incluir valores recebidos. Não realiza INSERT, UPDATE, DELETE, idempotência persistente ou resolução de fornecedor.

## Obrigatoriedade

- Raiz: versaoContrato=1, origem, fornecedor, orcamento e itens (1–1000).
- Origem: sistema=sharepoint, driveId e driveFileId obrigatórios. codigoOrcamento e nomeArquivo opcionais, podem ser null.
- Fornecedor: razaoSocial obrigatória; nomeFantasia e cnpj opcionais, podem ser null. CNPJ deve ser texto com 14 dígitos quando presente; nesta etapa não verifica dígitos de controle, existência ou identidade do fornecedor.
- Orçamento: numero e todos os valores subtotal, frete, desconto, tributos, valorTotal obrigatórios. data opcional/null; quando presente exige ISO com horário e fuso e data civil válida.
- Item: codigoOrigem, numero positivo int4, descricaoOriginal, quantidade, unidade, precoUnitario, precoTotal obrigatórios. observacaoOrigem opcional/null. Código e número não podem repetir no mesmo orçamento; códigos são comparados exatamente, sem alterar caixa/identificadores.
- Omissão e null opcionais são preservados. Campos obrigatórios não admitem null, undefined ou texto vazio. Strings não são aparadas silenciosamente. Campos desconhecidos são rejeitados em todos os objetos.

## Valores exatos e regras provisórias

Valores decimais devem ser strings sem expoente, sinal, espaço, vírgula ou separador de milhares. Quantidade estritamente positiva; preços/totais não negativos (zero explícito é aceito). Excesso de precisão é rejeitado, não arredondado silenciosamente na entrada.

Itens seguem NUMERIC(18,4), cabeçalho NUMERIC(18,2), com limite de 18 dígitos nas unidades escaladas. Os cálculos usam BigInt; a saída usa strings com escala fixa, sem problemas de serialização de BigInt. Não se usa Number em operações financeiras.

1. Quantidade × preço unitário é calculado com oito casas e arredondado half-up para quatro; deve igualar precoTotal.
2. Os totais dos itens são somados com quatro casas. A soma é arredondada half-up para duas; deve igualar subtotal. Não se arredonda cada item para centavos antes da soma.
3. valorTotal deve igualar subtotal + frete − desconto + tributos exatamente, sem tolerância implícita.

Essas regras são uma proposta explícita para o contrato, não confirmação das regras fiscais/comerciais do PDF ou SharePoint. Documentos com descontos por item, impostos inclusos ou outro arredondamento podem ser rejeitados até o contrato ser aprovado/ampliado. Limites textuais acompanham VARCHAR existentes onde aplicável; TEXT recebe limites de aplicação de 10.000 caracteres, e nomeArquivo limite de 1.000. Transporte HTTP e tamanho máximo em bytes ficam para o futuro endpoint.

## Rastreabilidade e diferenças para o banco

driveFileId pode mapear para orcamento.drive_file_id; numero para numero_orcamento; nomeArquivo para arquivo_origem. codigoOrigem pode mapear para item_orcamento.codigo_item. O validador preserva driveId e codigoOrcamento, mas essas identidades ainda não possuem armazenamento próprio no schema atual; não descartar na futura persistência.

Campos financeiros são nullable no banco, mas exigidos nesta versão de entrada para permitir reconciliação completa. Outros campos nullable no banco, como numero_item e unidade, também são exigidos pelo contrato. O schema Drizzle atual é projeção parcial de leitura, não fonte para migração.

NCM, referência/código do produto fornecedor, tributos detalhados por item, impostos inclusos, IDs externos de listas/itens, metadados de extração, observações do cabeçalho e campos de revisão não estão neste contrato. São rejeitados se enviados. Devem continuar preservados no fluxo SharePoint; decidir armazenamento explícito de origem ou evolução do schema antes de importar documentos que dependam deles. observacaoOrigem não deve sobrescrever futura observação de revisão humana.

## Decisões pendentes antes de escrita

- Aprovar fórmula, arredondamento, campos obrigatórios e política de documentos incompletos.
- Confirmar origem de driveId no n8n e estabilidade dos códigos de item, especialmente quando gerados pela posição.
- Definir identidade única do documento, hash canônico, Idempotency-Key e resposta a conteúdo alterado. Este módulo não garante idempotência nem duplicidade entre requisições.
- Definir resolução de fornecedor (CNPJ/identidade confiável), normalização e validação de documento.
- Decidir como preservar campos sem destino e a semântica da data de emissão.
- Autorização, pool de escrita separado, migrações e transação ficam fora desta implementação; GETs e pool leitor permanecem intactos.

Testes: `npm test`; conferência de tipos sem geração: `npx tsc --noEmit --incremental false`. Não executar typegen/build no diretório de um dev server ativo apenas para verificar este módulo.
