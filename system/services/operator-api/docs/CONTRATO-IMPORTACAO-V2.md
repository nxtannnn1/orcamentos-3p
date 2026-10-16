# Contrato de importação v2 — módulos puros

Implementado em 09/10/2026. Nenhuma rota, pool, configuração de autenticação ou migração é criada nesta etapa.

## Interfaces

- `validarImportacaoOrcamentoV2(unknown)`: valida contrato estrito, normaliza decimais e retorna uma cópia tipada. Versão obrigatória 2; campos desconhecidos são rejeitados em todos os níveis.
- `validarIdentificacaoFornecedor(unknown)`: união exclusiva CNPJ ou identificação externa.
- `resolverFornecedor(unknown, catalogo)`: resolve exatamente um registro ativo de catálogo confiável. Ausente/inativo gera `SUPPLIER_UNRESOLVED`; múltiplos registros geram `SUPPLIER_AMBIGUOUS`. Não cria fornecedor e não compara nomes. IDs internos permanecem strings.
- `canonicalizarOrcamentoV2(unknown)` / `calcularHashOrcamentoV2(unknown)`: validação obrigatória antes da projeção/hash, sem relógio, rede, ambiente ou persistência.

## Estrutura

```json
{
  "versaoContrato": 2,
  "origem": {
    "sistema": "sharepoint",
    "identidade": { "tipo": "drive", "driveId": "drive-A", "arquivoId": "arquivo-A" }
  },
  "fornecedor": {
    "identificacao": { "tipo": "cnpj", "valor": "12ABC34501DE35" },
    "razaoSocialOrigem": "Fornecedor de exemplo"
  },
  "orcamento": {
    "numero": "123", "subtotal": "1", "frete": "0", "desconto": "0", "tributos": "0", "valorTotal": "1"
  },
  "itens": [
    { "codigoOrigem": "001", "numero": 1, "descricaoOriginal": "Material", "quantidade": "1", "unidade": "UN", "precoUnitario": "1", "precoTotal": "1" }
  ]
}
```

Identidade alternativa: `{ "tipo": "externa", "namespace": "ERP-A", "documentoId": "0001" }`.
Fornecedor alternativo: `{ "tipo": "externa", "sistema": "erp", "escopo": "3p", "id": "0002" }`.
Não combinar as variantes. Identificadores são strings exatas, preservando caixa e zeros, até 255 caracteres; sem controles/espaços nas bordas.

`origem.codigoOrcamento`, `origem.nomeArquivo`, `fornecedor.nomeFantasiaOrigem`, `orcamento.data` e `itens[].observacaoOrigem` são opcionais/null. Nome de arquivo até 1000 caracteres; nomes até 255. Limites e cálculos financeiros/de itens são reutilizados diretamente do validador v1 intacto, por projeção interna restrita, sem converter a entrada v2 em contrato legado persistido. Quantidade positiva; preço zero permitido; produtos half-up para quatro casas; soma antes de arredondar subtotal a duas casas; ajustes/totais obrigatórios e não negativos. Data é instante ISO com timezone, não data civil.

CNPJ exige 14 caracteres canônicos: primeiras 12 posições A–Z/0–9 e últimas duas numéricas, com verificação de DV e rejeição de sequências numéricas repetidas. Não normaliza máscara/caixa implicitamente e não comprova cadastro/situação fiscal. Algoritmo ASCII menos 48 e módulo 11 conforme [manual técnico da Receita Federal](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf). Fixture oficial alfanumérica: `12ABC34501DE35`.

## Hash v2

SHA-256 UTF-8 sem BOM de `3p-importacao-orcamento/canon-v2` + LF + JSON canônico. Chaves ordenadas por UTF-16; itens ordenados por número; decimais fixos; data UTC; opcionais semânticos ausentes/null equivalentes; texto/Unicode preservados exatamente.

Projeção inclui versão, identificação do fornecedor, nomes recebidos na origem, cabeçalho financeiro/data e todos os campos semânticos dos itens. Identidade documental, código de orçamento externo e nome de arquivo são retornados separadamente. O serviço futuro deve comparar/persistir código e identidade conforme política aprovada; hash igual não identifica um documento. Mudança de nome do arquivo não altera conteúdo.

A fixture canônica em `tests/importacao-v2.test.ts` tem digest `10f8830c7ac7587f14e7982d667f396ca950741357ecbbd54f387b25a35cfe3c`, conferido com SHA256 .NET sobre os bytes literais. Fixture/digest v1 permanecem inalterados.

## Fronteira desta etapa

Fonte válida no contrato não significa fonte autorizada. O chamador futuro deve validar tenant, allowlists de drive/namespace e credencial antes de consultar um catálogo restrito ao escopo autorizado. O resolver puro não fornece autenticação/autorização. As chaves de correspondência usam tuplas JSON para evitar colisões de separadores e não definem schema ou concatenação de campos de persistência.

Limites de bytes HTTP, composição do escopo documental derivada de tenant/configuração e seu comprimento no schema, mapeamentos persistidos, grants, transações, UNIQUE documental, tratamento de conflitos v1/v2 e idempotência concorrente continuam pendentes. Esses módulos não garantem integridade entre requisições nem realizam importação real. Não ligar a endpoints antes das etapas de segurança e persistência isolada.
