# Canonicalização e SHA-256 v1

Módulo puro `src/importacao/hash-orcamento.ts`. Não acessa banco, ambiente, arquivos, relógio ou rede. Não altera o validador. A entrada unknown passa sempre pelo contrato vigente, inclusive se já estiver validada. Dados financeiros inválidos ou campos desconhecidos são rejeitados antes de gerar qualquer hash.

`canonicalizarOrcamento(entrada)` retorna versaoContrato, versaoCanonicalizacao=1, identidade e jsonCanonico. `calcularHashOrcamento(entrada)` acrescenta conteudoSha256 em hexadecimal lowercase de 64 caracteres.

## Projeção semântica

- versaoContrato.
- fornecedor: razaoSocial, nomeFantasia, cnpj.
- orcamento: numero, data, subtotal, frete, desconto, tributos, valorTotal.
- itens: codigoOrigem, numero, descricaoOriginal, quantidade, unidade, precoUnitario, precoTotal, observacaoOrigem.

Nome do arquivo e codigoOrcamento do cabeçalho são metadados externos, excluídos conforme proposta V2. Código do item participa porque identifica a linha de origem e seu vínculo. Drive/arquivo são identidade documental, retornada separadamente em sistemaOrigem, tipoIdentidade=drive, escopoOrigem e documentoOrigemId. Mudanças de identidade não mudam o hash do conteúdo. Nunca deduplicar documentos apenas por igualdade de hash.

## Bytes do algoritmo

Omissão e null opcionais semânticos viram null explícito. Itens ordenados numericamente por numero, que o validador exige ser único. Objetos serializados recursivamente com chaves ASCII da projeção em ordem UTF-16 determinística, sem locale; JSON compacto com escaping padrão JSON.stringify. Textos mantidos exatamente, sem slug, lowercase ou normalização Unicode.

Data presente vira UTC ISO com milissegundos; data ausente/null vira null. Quantidade e preços vêm da saída exata do validador com quatro casas; cabeçalho com duas. Nenhum decimal passa por Number, e nenhum opcional financeiro é inventado.

Digest SHA-256 sobre UTF-8 sem BOM de `3p-importacao-orcamento/canon-v1` + quebra de linha LF real + jsonCanonico. Existe fixture fixa de bytes e digest, conferida independentemente com SHA256 do .NET. Não é implementação geral de RFC 8785; é um algoritmo versionado para esta projeção fechada.

Horário de execução, tokens e dados administrativos não fazem parte do contrato e são rejeitados se enviados. O módulo não lê variáveis de ambiente nem headers. jsonCanonico contém informações do orçamento/fornecedor: não registrar esse retorno integral em logs. O hash não é criptografia, anonimização ou autenticação.

## Limites

Não há persistência, UNIQUE, endpoint ou proteção entre requisições nesta etapa. O consumidor futuro terá de comparar identidade + versão + digest e garantir atomicidade no PostgreSQL. O contrato ainda só aceita origem SharePoint com drive real. A data é tratada como instante, conforme a proposta; se passar a data civil, requer revisão versionada.

Qualquer mudança da projeção, normalização ou prefixo exige nova versão e manutenção do algoritmo v1 para registros antigos. Variações de extração IA, número/código de item, fornecedor ou texto produzem conteúdo diferente mesmo com totais iguais. Decidir reprocessamento e armazenamento de campos sem destino antes da futura importação real.
