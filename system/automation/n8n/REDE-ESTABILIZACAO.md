# Neoenergia — Rede: estabilização para revisão

## Estado desta rodada

Workflow local: Importar Catalogo Rede Neoenergia v1 (mesmo ID). Escrita bloqueada, workflow inativo, nenhum piloto executado.
O JSON desta pasta é o export completo sanitizado: sem credenciais, tokens, pinData, staticData, históricos ou registros do lote.
A substituição existe apenas na árvore de trabalho de infra-lab. Não houve commit/push nem reorganização de diretórios.

## Arquitetura

- A: trigger → configuração bloqueada → schema real → paginação nativa de chaves → consolidação por execução.
- B: XLSX → D10:U22953 → preparação original → diagnóstico e candidatos únicos → relatório dos casos >255.
- C: manifesto fixo → hash SHA-256 → recibos → seleção de fase → validações → decisão → trava → loop unitário → reconciliação prévia → intenção durável → POST bloqueado → avaliação → espera/reconciliação → recibo → relatório.
- D: legado preservado, identificado, desabilitado; entrada com parada obrigatória e POST com expressão que lança erro. Protótipos antigos de paginação arquivados e desconectados.

## Barreiras de escrita

1. writeAuthorized=false e phase=REVISAO.
2. schemaDecisionApproved=false; nenhuma omissão de campo aprovada.
3. Parada obrigatória antes do loop.
4. Os dois POSTs estão desabilitados e suas URLs lançam erro, inclusive em execução direta.
5. Workflow inativo. Proteção de unicidade do SharePoint permanece intacta.

Desabilitar apenas um node NÃO autoriza a carga. As barreiras só devem ser revisadas depois da aprovação do usuário. Não há instrução de liberação automática neste export.

## Lote privado, fases e retomada

Os 100 registros são os da execução 2223, congelados em pilot.json fora do Git. O manifesto tem ID de lote e SHA-256 integral; o workflow confere ambos e recusa qualquer alteração do conteúdo.
FASE1 seleciona exclusivamente o índice 0. FASE2 seleciona exclusivamente os índices 1..99; exige recibo confirmado com ID para o índice 0 e phase1Reviewed=true. REVISAO seleciona os 100 apenas para validação/relatório, sem escrita.

O workflow local usa ~/.n8n-files/neoenergia-rede (caminho absoluto Windows na configuração local). Há 100 recibos iniciais em journals/000.json a journals/099.json. Ausência, duplicação, corrupção ou incompatibilidade de recibo interrompe a execução; nunca recriar recibos em uma retomada.

No export sanitizado o caminho é C:/N8N_PRIVATE/neoenergia-rede: é um placeholder deliberado. Uma reimportação exige vincular o arquivo privado EXISTENTE e as credenciais locais; não recalcular o lote nem inicializar recibos por cima dos anteriores. O hash não contém os registros. Não colocar manifesto, recibos, inventário de bloqueados ou histórico de execução no repositório.

## Reconciliação e retry

Antes de criar: consulta exata pela chave, com até dois resultados. Um resultado exige ID e igualdade de TODOS os campos do payload; duplicidade ou divergência interrompe. Ausência permite POST somente se o recibo local ainda estiver new.

Antes de cada tentativa: persiste inflight em disco; falha de persistência interrompe antes do HTTP. Um timeout/crash deixa essa intenção registrada. Nova execução que encontre inflight/pending e nenhum registro permanece pendente; não repete POST.

201+ID é evidência de criação, seguida de GET e comparação de campos e ID. 201 sem ID, timeout, falha de transporte, 408, conflito ou erro 5xx não tratado são reconciliados sem retry automático de POST. Um resultado encontrado e compatível é confirmado; ausência/inconclusão para resultado incerto bloqueia continuidade.

429/503: respeita Retry-After (segundos ou data), com fallback exponencial e máximo de 3 tentativas totais. A espera ocorre antes da consulta de reconciliação e de qualquer novo POST. Só repete após resposta 429/503, espera e consulta conclusiva sem registro. Se o registro já existir, confere e não repete. Espera >900 segundos interrompe sem antecipar nova requisição. Erros inesperados interrompem com recibo e relatório.

O índice único do SharePoint é a defesa de concorrência de escrita. Os recibos locais não são um lock distribuído: uma futura liberação deve operar uma execução de carga por vez. A etapa A não depende de staticData e é isolada entre execuções.

## Validações e limites

- Schema obtido por GET; campos permitidos, tipo texto, readonly, required e limites do schema; unicidade/índice da chave exigidos.
- Site/lista fixados na configuração e conferidos no contrato.
- Chave obrigatória, unicidade do lote, Fonte correta, tipos, comprimentos, datas ISO e dias calendários válidos.
- Nenhum truncamento. A composição da Chave_Importacao foi preservada byte a byte na preparação.
- Os 19 candidatos com chave >255 estão separados COM seus registros integrais e também preservados em arquivo privado blocked-keys.json; não foram descartados.
- Os 100 originais cabem no limite de chave. Nenhuma liberação ocorre enquanto a política dos dez campos ausentes estiver pendente.

O relatório expõe selecionados, tentados (registros), tentativasHTTP, criados (201+ID), confirmados (leitura e comparação), reconciliados, ignorados, falhas, throttling, pendências, chaves bloqueadas e totais acumulados do piloto. Criado sem resposta recebida é contabilizado como reconciliado, nunca inventado como 201 conhecido. Falhas de infraestrutura antes da seleção ou na gravação local abortam com erro do node; o histórico n8n fica preservado.

## Recomendação de schema — nenhuma coluna criada

| Coluna ausente | Classificação | Motivo |
|---|---|---|
| Descricao_Completa | ESSENCIAL PARA MVP | Especificação completa para orçamento; precisa comportar texto longo. |
| Refer_Fornecedor | ESSENCIAL PARA MVP | Identifica o produto do fornecedor e já participa da chave. |
| CNPJ | ESSENCIAL PARA MVP | Identificação consistente do fornecedor; manter texto. |
| Data_Vencimento_Homologacao | ESSENCIAL PARA MVP | Permite avaliar vigência da homologação. |
| Ref_Documentacao | ESSENCIAL PARA MVP | Rastreabilidade da homologação. |
| Data_Homologacao | ÚTIL FUTURAMENTE | Complementa o histórico; não bloqueia o primeiro orçamento. |
| Desenho_Fornecedor | ÚTIL FUTURAMENTE | Referência técnica complementar. |
| Modo_Fornecimento | ÚTIL FUTURAMENTE | Apoia a compra após o orçamento inicial. |
| CA | ÚTIL FUTURAMENTE | Vazio nos 100 atuais; reavaliar quando informado. |
| Tipo_Gestao_Recebimento | ÚTIL FUTURAMENTE | Controle operacional do recebimento. |

Nenhuma coluna foi classificada como dispensável de forma definitiva com a evidência atual. A classificação não autoriza criação nem descarte. É necessária uma decisão separada para persistência ou aceitação explícita de omissões no MVP.

## Credenciais e verificação

Na instância local, mantidas as referências existentes a googleDriveOAuth2Api e oAuth2Api. O export remove as referências, além de dados de execução e links de cache com identificadores pessoais. A reimportação do export sanitizado exige seleção dessas credenciais.

Validação: 18 cenários com mocks locais (incluindo 201, timeout após criação, 429/503, retry, reconciliação, fases e travas); nenhuma chamada HTTP nesses testes. Testes não equivalem ao piloto real ou ao E2E com SharePoint, que continuam proibidos nesta rodada.
Gitleaks é executado sobre os arquivos para revisão e o diff antes da entrega. O validador de workflows passa a aceitar await em Code nodes, conforme o runtime assíncrono do n8n.
