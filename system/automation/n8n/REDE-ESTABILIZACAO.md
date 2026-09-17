# Neoenergia — Rede: FASE1 validada e carga bloqueada

## Estado desta rodada

FASE1 validada a partir da execução histórica do piloto: exclusivamente o índice 0 do lote congelado, com uma tentativa de POST, resposta HTTP 201 e confirmação por leitura posterior. Os 17 campos enviados e o identificador retornado foram conferidos, sem divergências. Não houve falhas, throttling ou pendências no relatório dessa execução.

A intenção `inflight` foi persistida antes do POST. O recibo do índice 0 está `confirmed`; os outros 99 permanecem `new`. A conferência posterior do SHA-256 dos registros, da unicidade das 100 chaves e da compatibilidade dos 100 recibos passou. Um teste em memória da reconciliação, usando a resposta GET histórica e o recibo confirmado, retornou continuidade sem novo POST; isso não constitui nova consulta ao SharePoint nem reexecução do piloto.

**Não repetir FASE1 e não liberar FASE2.** A validação histórica não autoriza a carga dos outros 99 registros. Workflow inativo, escrita bloqueada e POSTs desabilitados.

O JSON desta pasta permanece como export sanitizado do marco estável, com configuração de revisão; não é um novo export da instância. Não contém credenciais, tokens, pinData, staticData, históricos ou registros do lote. Esta atualização altera somente a documentação.

## Arquitetura

- A: trigger → configuração bloqueada → schema real → paginação nativa de chaves → consolidação por execução.
- B: XLSX → D10:U22953 → preparação original → diagnóstico e candidatos únicos → relatório dos casos >255.
- C: manifesto fixo → hash SHA-256 → recibos → seleção de fase → validações → decisão → trava → loop unitário → reconciliação prévia → intenção durável → POST bloqueado → avaliação → espera/reconciliação → recibo → relatório.
- D: legado preservado, identificado, desabilitado; entrada com parada obrigatória e POST com expressão que lança erro. Protótipos antigos de paginação arquivados e desconectados.

## Barreiras de escrita

1. Na instância inspecionada: `writeAuthorized=false`, `phase=FASE1` e `phase1Reviewed=false`. No export sanitizado: `phase=REVISAO`.
2. Na instância, `schemaDecisionApproved=true` representa a separação dos dez campos adicionais para outra entidade, com preservação no manifesto. O export sanitizado mantém `schemaDecisionApproved=false`. Essa diferença não autoriza novas escritas.
3. Parada obrigatória antes do loop.
4. Os dois POSTs estão desabilitados. O export sanitizado também contém bloqueio explícito nas expressões de URL. Não habilitar nem reutilizar a autorização histórica do piloto.
5. Workflow inativo. Proteção de unicidade do SharePoint permanece intacta.

Desabilitar apenas um node NÃO autoriza a carga. As barreiras só devem ser revisadas depois da aprovação do usuário. Não há instrução de liberação automática neste export.

## Lote privado, fases e retomada

Os 100 registros do lote original permanecem congelados em pilot.json fora do Git. O manifesto tem ID de lote e SHA-256 integral; o workflow confere ambos e recusa qualquer alteração do conteúdo.
FASE1 seleciona exclusivamente o índice 0. FASE2 seleciona exclusivamente os índices 1..99; exige recibo confirmado com ID para o índice 0 e phase1Reviewed=true. REVISAO seleciona os 100 apenas para validação/relatório, sem escrita.

O workflow local usa ~/.n8n-files/neoenergia-rede (caminho absoluto Windows na configuração local). Há 100 recibos em journals/000.json a journals/099.json: um confirmado e 99 novos. Ausência, duplicação, corrupção ou incompatibilidade de recibo interrompe a execução; nunca recriar recibos em uma retomada.

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
- Chave obrigatória, unicidade do lote, Fonte correta, tipos e comprimentos dos campos persistidos. No export sanitizado, datas ISO e dias calendários inválidos bloqueiam o contrato; na instância do piloto, datas e CNPJ dos campos destinados a outra entidade geram avisos e permanecem preservados para tratamento posterior.
- Nenhum truncamento. A composição da Chave_Importacao foi preservada byte a byte na preparação.
- Os 19 candidatos com chave >255 estão separados COM seus registros integrais e também preservados em arquivo privado blocked-keys.json; não foram descartados.
- Os 100 originais cabem no limite de chave. No piloto, os dez campos ausentes foram classificados como dados destinados a outra entidade e preservados no manifesto; não foram enviados no payload de 17 campos. Sua persistência e integração no caminho do orçamento continuam pendentes. Nenhuma nova carga está autorizada.

O relatório expõe selecionados, tentados (registros), tentativasHTTP, criados (201+ID), confirmados (leitura e comparação), reconciliados, ignorados, falhas, throttling, pendências, chaves bloqueadas e totais acumulados do piloto. Criado sem resposta recebida é contabilizado como reconciliado, nunca inventado como 201 conhecido. Falhas de infraestrutura antes da seleção ou na gravação local abortam com erro do node; o histórico n8n fica preservado.

## Recomendação de schema e limite do piloto

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

A tabela preserva a recomendação funcional anterior; não descreve campos já persistidos pelo piloto. A execução histórica tratou os dez campos como destinados a outra entidade, mantendo seus valores no manifesto congelado. Nenhum deles deve ser considerado dispensável ou integrado ao orçamento por causa da validação da FASE1. A persistência desses dados continua sendo uma pendência específica do MVP; esta atualização não cria colunas nem autoriza descarte.

## Credenciais e verificação

Na instância local, mantidas as referências existentes a googleDriveOAuth2Api e oAuth2Api. O export remove as referências, além de dados de execução e links de cache com identificadores pessoais. A reimportação do export sanitizado exige seleção dessas credenciais.

Validação do marco estável: 18 cenários com mocks locais (incluindo 201, timeout após criação, 429/503, retry, reconciliação, fases e travas), sem chamadas HTTP nesses testes. O CI desse marco passou, incluindo Gitleaks e Qodana.

A FASE1 real está validada pela evidência histórica descrita acima. Não houve reexecução durante essa conferência. Isso não demonstra o E2E de cotação até o resultado do orçamento: o próximo objetivo é um caso mínimo Coelba com correspondência conhecida, mantendo a carga Rede encerrada e a FASE2 bloqueada.

Não incluir neste repositório dados reais, IDs de execução ou lote, identificadores do ambiente Microsoft 365, URLs reais, credenciais, manifesto, recibos ou respostas de execução. O validador de workflows aceita await em Code nodes, conforme o runtime assíncrono do n8n.
